// Minimal backend: ChatGPT Visibility + Stripe (primary). Razorpay preserved for future use.
const functions = require('firebase-functions');
const { onRequest, onCall } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: '*' });
const crypto = require('crypto');
const Razorpay = require('razorpay');
// OpenAI SDK: use CommonJS default export for v4
const OpenAI = require('openai');
let cachedOpenAI = null;
function getOpenAIClient() {
  if (cachedOpenAI) return cachedOpenAI;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Missing OPENAI_API_KEY');
  cachedOpenAI = new OpenAI({ apiKey: key });
  return cachedOpenAI;
}
let stripe = null;

process.env.NODE_ENV = 'production';

const PRODUCTION_CONFIG = { SUBSCRIBER_MESSAGE_LIMIT: 1000 };
if (!admin.apps.length) admin.initializeApp();

// Secrets
const openaiApiKeySecret = defineSecret('OPENAI_API_KEY');
const razorpayKeyIdSecret = defineSecret('RAZORPAY_KEY_ID');
const razorpaySecretSecret = defineSecret('RAZORPAY_SECRET');
const stripePriceProSecret = defineSecret('STRIPE_PRICE_PRO');
const perplexityKeySecret = defineSecret('MAYIN_PERPLEXITY_KEY');
// For Stripe, read from environment variables to avoid Secret Manager IAM issues.
// Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in your deployment environment.

// Razorpay helpers
const getRazorpayKeyId = () => {
  return process.env.RAZORPAY_KEY_ID;
};
const getRazorpaySecret = () => {
  return process.env.RAZORPAY_SECRET;
};

// --- ChatGPT Visibility Scan ---
const MODEL_BY_TIER = {
  free: { model: 'gpt-4o-mini', count: 10 },
  starter: { model: 'gpt-4o', count: 100 },
  pro: { model: 'gpt-4o', count: 100 },
  premium: { model: 'gpt-4o', count: 1000 },
  enterprise: { model: 'gpt-4o', count: 1000 },
};
function safeModel(model) { return (model === 'gpt-5' && !process.env.ENABLE_GPT5) ? 'gpt-4o' : model; }

async function runStartVisibilityScan(uid, data){
  const brandName = (data.brandName || '').trim();
  const website = (data.website || '').trim() || null;
  const category = (data.category || '').trim();
  const locationScope = (data.locationScope || '').trim();
  let planTier = (data.planTier || 'free').toLowerCase();
  const requestId = (data.requestId || data.clientRequestId || '').toString().trim();
  if (!brandName || !category || !locationScope) throw new functions.https.HttpsError('invalid-argument', 'brandName, category, and locationScope are required');
  // Privileged allowlist: unlimited scans for a specific operator account
  let privileged = false;
  if (privileged) planTier = 'free';
  const tierCfg = MODEL_BY_TIER[planTier] || MODEL_BY_TIER.free;

  const db = admin.firestore();
  const userRef = db.collection('users').doc(uid);
  const scansCol = userRef.collection('scans');
  const scanRef = requestId ? scansCol.doc(requestId) : scansCol.doc();

  // Idempotency: if a scan with the same requestId already exists, return immediately
  try {
    if (requestId) {
      const existing = await scanRef.get();
      if (existing.exists) {
        const status = existing.get('status') || 'running';
        return { scanId: scanRef.id, status };
      }
    }
  } catch {}

  // gating
  let consumedCredit = false, consumedFree = false;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartTs = admin.firestore.Timestamp.fromDate(monthStart);
  const profile = (await userRef.get()).data() || {};
  const subStatus = (profile.subscriptionStatus || '').toString();
  const isSubscribed = !!profile.isSubscribed || subStatus === 'active' || subStatus === 'trialing';
  const currentTier = (profile.planTier || planTier || 'pro').toString().toLowerCase();
  // Subscription limits
  const monthlyLimits = { enterprise: 10 };
  if (isSubscribed && !privileged) {
    if (currentTier === 'pro') {
      // Enforce 1 scan every 15 days (≈2/month)
      const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;
      let lastProScanAt = null;
      try {
        const snap = await scansCol
          .orderBy('startedAt', 'desc')
          .limit(10)
          .select('planTier', 'startedAt')
          .get();
        const doc = snap.docs.find(d => (d.get('planTier') || '') === 'pro');
        lastProScanAt = doc ? (doc.get('startedAt')?.toDate?.() || null) : null;
      } catch (e) {
        // ignore, default to allowing scan
      }
      if (lastProScanAt) {
        const sinceMs = now.getTime() - lastProScanAt.getTime();
        if (sinceMs < FIFTEEN_DAYS_MS) {
          throw new functions.https.HttpsError('resource-exhausted', 'PRO_SCAN_COOLDOWN_ACTIVE');
        }
      }
    } else {
      // Other tiers (e.g., enterprise) retain existing monthly cap
      const limit = monthlyLimits[currentTier] ?? Infinity;
      if (limit !== Infinity) {
        let count = 0;
        try {
          const snap = await scansCol
            .where('planTier', '==', currentTier)
            .where('startedAt', '>=', monthStartTs)
            .select('startedAt')
            .get();
          count = snap.size;
        } catch (e) {
          const snap = await scansCol
            .where('startedAt', '>=', monthStartTs)
            .select('planTier', 'startedAt')
            .get();
          count = snap.docs.filter(d => (d.get('planTier') || '') === currentTier).length;
        }
        if (count >= limit) throw new functions.https.HttpsError('resource-exhausted', 'MONTHLY_LIMIT_REACHED');
      }
    }
  } else if (!privileged) {
    try {
      await db.runTransaction(async (t) => {
        const [sUser, sScan] = await Promise.all([t.get(userRef), t.get(scanRef)]);
        if (sScan.exists) return; // idempotent: scan already created in another request
        const d = sUser.data() || {};
        const credits = Number(d.scanCredits || 0);
        const freeUsed = !!d.freeScanUsed;
        if (!freeUsed) {
          t.set(userRef, { freeScanUsed: true, freeScanUsedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          consumedFree = true;
        } else if (credits > 0) {
          t.update(userRef, { scanCredits: admin.firestore.FieldValue.increment(-1) });
          consumedCredit = true;
        } else {
          throw new Error('NO_CREDITS');
        }
        // Create the scan doc in the same transaction to avoid duplicates
        t.set(scanRef, { brandName, website, category, locationScope, planTier, model: safeModel(tierCfg.model), promptCount: tierCfg.count, status: 'running', startedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      });
    } catch (e) {
      if (String(e?.message) === 'NO_CREDITS') throw new functions.https.HttpsError('failed-precondition', 'NO_CREDITS'); else throw e;
    }
    // If we created inside transaction, skip duplicate pre-set below
    const created = await scanRef.get();
    if (created.exists) {
      // Proceed to execution phase
    }
  }

  // For subscribed users (credits not modified), ensure scan doc exists
  const model = safeModel(tierCfg.model); const promptCount = tierCfg.count;
  const exists = await scanRef.get();
  if (!exists.exists) {
    await scanRef.set({ brandName, website, category, locationScope, planTier, model, promptCount, status: 'running', startedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }

  try {
    const openai = getOpenAIClient();
    const prompts = buildPromptLibraryForVisibility({ brandName, website, category, locationScope }, planTier, promptCount);
    const answers = [], analysis = [], embeddings = [];
    const concurrency = Math.max(1, Math.min(Number(process.env.PROMPT_CONCURRENCY || 8), 32));
    let index = 0;
    const db = admin.firestore();
    const cryptoHash = (s) => crypto.createHash('sha256').update(s).digest('hex');
    const cacheCol = db.collection('aiCache');
    const runBatch = async () => { while (index < prompts.length) { const i = index++; const prompt = prompts[i]; try {
        const cacheKey = cryptoHash(`${model}|${prompt}`);
        let answer = '';
        try { const cdoc = await cacheCol.doc(cacheKey).get(); if (cdoc.exists && cdoc.get('answer')) { answer = cdoc.get('answer'); } } catch {}
        if (!answer) {
          answer = await chatAnswer(openai, model, prompt, { brandName, website, category });
          try { await cacheCol.doc(cacheKey).set({ answer, model, prompt, createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }); } catch {}
        }
        const parsed = await analyzeAnswer(openai, model, answer, brandName);
        answers[i] = answer; analysis[i] = { ...parsed, prompt, answer };
      } catch (e) {
        answers[i] = ''; analysis[i] = { mentioned: false, sentiment: 'neutral', competitors: [], locationContext: '', prompt, answer: '' };
      } } };
    await Promise.all(Array.from({ length: Math.min(concurrency, prompts.length) }, () => runBatch()));
    // Compute raw mention stats across the full prompt set (core metric)
    const rawTotal = prompts.length;
    const rawMentions = analysis.filter((r) => r && r.mentioned).length;
    const score = Math.round((rawMentions / Math.max(1, rawTotal)) * 100);

    // Build deduped set for concise display/breakdown
    let kept = analysis;
    try {
      if (process.env.ENABLE_EMBEDDINGS === 'true') {
        for (let i = 0; i < answers.length; i++) { embeddings[i] = await embedText(openai, answers[i] || ''); }
        const keepIdx = dedupeByCosine(embeddings, 0.92); kept = keepIdx.map((idx) => analysis[idx]);
      }
    } catch (e) { functions.logger.warn('Embeddings skipped/failed', e?.message); }
    const totalPrompts = kept.length || analysis.length || prompts.length;
    // Build RAW competitor/location/sentiment breakdown from all prompts
    const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
    const competitorCountsRaw = {}; const competitorDisplayMap = {};
    const locationsMap = {};
    for (const r of analysis) {
      if (!r) continue;
      if (r.sentiment && sentimentCounts[r.sentiment] != null) sentimentCounts[r.sentiment]++;
      for (const c of r.competitors || []) {
        const key = String(c || '').trim().toLowerCase();
        if (!key) continue;
        if (!competitorDisplayMap[key]) competitorDisplayMap[key] = c;
        competitorCountsRaw[key] = (competitorCountsRaw[key] || 0) + 1;
      }
      const loc = (r.locationContext || '').trim();
      if (loc) locationsMap[loc] = (locationsMap[loc] || 0) + (r.mentioned ? 1 : 0);
    }
    const competitorsArr = Object.keys(competitorCountsRaw)
      .map((k) => ({ name: competitorDisplayMap[k] || k, mentions: competitorCountsRaw[k] }))
      .sort((a,b)=>b.mentions-a.mentions);
    const breakdown = {
      sentiment: sentimentCounts,
      competitors: competitorsArr,
      locations: Object.keys(locationsMap).map((k) => ({ name: k, score: Math.round((locationsMap[k] / Math.max(1, rawTotal)) * 100) }))
    };
    const guidance = generateGuidance({ brandName, category, score, breakdown }, planTier);
    const sampleLimit = planTier === 'pro' ? 10 : 10; // show all 10 prompts for free
    const fullAnswers = analysis.map((r) => ({ prompt: r.prompt, answer: r.answer, mentioned: r.mentioned, sentiment: r.sentiment, locationContext: r.locationContext }));
    const payload = {
      status: 'complete',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      score,
      promptCount: rawTotal,
      stats: {
        totalPrompts,
        rawTotal,
        rawMentions,
        mentionRate: +(rawMentions/Math.max(1,rawTotal)).toFixed(3),
        competitorsCount: breakdown.competitors.length,
        locationsAnalyzed: breakdown.locations.length
      },
      breakdown,
      sampleAnswers: kept.slice(0, sampleLimit).map((r) => ({ prompt: r.prompt, answer: r.answer, mentioned: r.mentioned, sentiment: r.sentiment, locationContext: r.locationContext })),
      guidance
    };
    if (planTier === 'pro') {
      payload.fullAnswers = fullAnswers;
    }
    await scanRef.set(payload, { merge: true });
    return { scanId: scanRef.id, status: 'complete' };
  } catch (error) {
    functions.logger.error('startVisibilityScan failed', error);
    await scanRef.set({ status: 'failed', error: String(error?.message || error) }, { merge: true });
    try { if (consumedCredit && !isSubscribed) await userRef.set({ scanCredits: admin.firestore.FieldValue.increment(1) }, { merge: true }); if (consumedFree && !isSubscribed) await userRef.set({ freeScanUsed: false }, { merge: true }); } catch (e) {}
    throw new functions.https.HttpsError('internal', 'Scan failed: ' + (error?.message || 'unknown'));
  }
}

exports.startVisibilityScanV2 = onRequest({ region: 'asia-south1', timeoutSeconds: 900 }, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    // Send response to OPTIONS requests
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Max-Age', '3600');
    res.status(204).send('');
  } else {
    try {
      if (req.method !== 'POST') return res.status(405).send({ error: 'Method Not Allowed' });
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).send({ error: 'Unauthorized' });
      const idToken = authHeader.split('Bearer ')[1];
      const decoded = await admin.auth().verifyIdToken(idToken);
      const uid = decoded?.uid;
      if (!uid) return res.status(401).send({ error: 'Unauthorized' });
      const result = await runStartVisibilityScan(uid, req.body || {});
      return res.status(200).send(result);
    } catch (e) {
      functions.logger.error('startVisibilityScan error', e);
      if (e instanceof functions.https.HttpsError) {
        return res.status(400).send({ error: e.code, message: e.message });
      }
      return res.status(500).send({ error: 'INTERNAL', message: e?.message || String(e) });
    }
  }
});

// HTTP alternative with explicit CORS for environments where callable CORS is blocked
exports.startVisibilityScanHttp = onRequest({ region: 'asia-south1' }, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== 'POST') return res.status(405).send({ error: 'Method Not Allowed' });
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).send({ error: 'Unauthorized' });
      const idToken = authHeader.split('Bearer ')[1];
      const decoded = await admin.auth().verifyIdToken(idToken);
      const uid = decoded?.uid;
      if (!uid) return res.status(401).send({ error: 'Unauthorized' });
      const result = await runStartVisibilityScan(uid, req.body || {});
      return res.status(200).send(result);
    } catch (e) {
      functions.logger.error('startVisibilityScanHttp error', e);
      return res.status(500).send({ error: 'INTERNAL', message: e?.message || String(e) });
    }
  });
});

function buildPromptLibraryForVisibility({ brandName, website, category, locationScope }, planTier, maxCount) {
  // Generate natural, user-like queries that do not mention the brand or site.
  const themes = [];
  const loc = (locationScope || '').trim();

  // Generic buyer intent
  themes.push(`Who are the best ${category} brands right now?`);
  themes.push(`Which ${category} brands are known for quality and value?`);
  themes.push(`What are the most popular ${category} brands today?`);
  themes.push(`Which ${category} brands are recommended for beginners?`);
  themes.push(`What premium ${category} brands do people trust?`);
  themes.push(`Which ${category} brands focus on minimal design?`);

  // Location-aware queries (if provided)
  if (loc) {
    themes.push(`Best ${category} brands in ${loc}?`);
    themes.push(`Which ${category} brands are popular in ${loc}?`);
    themes.push(`For someone in ${loc}, which ${category} brands should I consider?`);
  }

  // Pro tiers can include comparison-style prompts
  if (['pro','enterprise','starter'].includes(planTier)) {
    themes.push(`Which ${category} brands are best for durability?`);
    themes.push(`Which ${category} brands are best for budget buyers?`);
  }
  if (['pro','enterprise'].includes(planTier)) {
    themes.push(`Between leading ${category} brands, who offers better value in ${loc || 'my region'}?`);
  }

  // Expand/repeat to reach desired count and shuffle
  const out = [];
  while (out.length < maxCount) { for (const t of themes) { if (out.length >= maxCount) break; out.push(t); } }
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out.slice(0, maxCount);
}
async function chatAnswer(openai, model, prompt, context) {
  const sys = [
    'Answer naturally and concisely as ChatGPT would for a typical user. Do not include JSON.',
  ];
  const brandName = context?.brandName || '';
  const category = context?.category || '';
  const website = context?.website || '';
  if (brandName && (category || website)) {
    const host = (()=>{ try{ return new URL(website).host }catch{ return website } })();
    sys.push(`If a brand named "${brandName}" is ambiguously referenced, interpret it as the one in category "${category}" ${host?`associated with domain "${host}" `:''}for disambiguation only. Do not mention this in your answer and do not favor or promote the brand due to this hint.`);
  }
  const resp = await openai.chat.completions.create({
    model,
    temperature: 0.4,
    max_tokens: 180,
    messages: [
      { role: 'system', content: sys.join(' ') },
      { role: 'user', content: prompt },
    ],
  });
  return resp.choices?.[0]?.message?.content?.trim() || '';
}
async function analyzeAnswer(openai, model, answer, brandName) {
  const extractModel = process.env.EXTRACTOR_MODEL || 'gpt-4o-mini';
  const schema = '{ "brands": [{"name": string, "count": number}], "competitors": [{"name": string, "count": number}] }';
  const sys = 'Extract brands and competitors as strict JSON. No extra text.';
  const user = `Schema: ${schema}\nText:\n${answer}`;
  let parsed = { brands: [], competitors: [] };
  try {
    const resp = await openai.chat.completions.create({ model: extractModel, temperature: 0.1, max_tokens: 140, messages: [ { role: 'system', content: sys }, { role: 'user', content: user } ] });
    const raw = resp.choices?.[0]?.message?.content?.trim() || '{}';
    parsed = JSON.parse(raw || '{}');
  } catch {}
  // Regex validation and normalization
  const normalize = (s) => (s || '').trim().replace(/\s+/g,' ');
  const counts = new Map();
  const addCount = (name, n) => { if(!name) return; const key = name.toLowerCase(); counts.set(key, (counts.get(key)||0) + (Number(n)||0)); };
  for (const b of (parsed.brands||[])) addCount(normalize(b.name), b.count);
  for (const c of (parsed.competitors||[])) addCount(normalize(c.name), c.count);
  // Validate by regex counting in the raw answer
  for (const key of Array.from(counts.keys())) {
    const pattern = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[^A-Za-z0-9])(${pattern})(?![A-Za-z0-9])`, 'gi');
    let m, c = 0; while ((m = re.exec(answer)) !== null) c++;
    if (c > 0) counts.set(key, c);
  }
  // Convert back to arrays with proper capitalization
  const toTitle = (s) => s.split(' ').map(w => w.length? (w[0].toUpperCase()+w.slice(1)) : w).join(' ');
  const brands = []; const competitors = [];
  for (const [k,v] of counts) {
    const cap = toTitle(k);
    if (brandName && new RegExp(brandName, 'i').test(cap)) brands.push({ name: cap, count: v });
    else competitors.push({ name: cap, count: v });
  }
  // derive previous fields for compatibility
  const mentioned = brands.some(b => b.count > 0) || new RegExp(brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(answer);
  const competitorNames = competitors.map(c => c.name).slice(0,10);
  return { mentioned, sentiment: 'neutral', competitors: competitorNames, locationContext: '', brands, competitorCounts: competitors };
}

async function filterCompetitorsWithOpenAI(openai, model, candidates) {
  if (!candidates || candidates.length === 0) {
    return [];
  }

  const prompt = `From the following list, return ONLY the items that are actual company/brand names. Exclude:
- Generic words (e.g., "Best", "Top", "Leading", "Offers", "Known", "Popular", "Quality")
- Common nouns (e.g., "Service", "Brand", "Product", "Company")
- Descriptive adjectives
- Location names
- Industry terms

List: ${JSON.stringify(candidates)}

Return ONLY brand names as a JSON array of strings. Be strict - when in doubt, exclude it.`;

  try {
    const resp = await openai.chat.completions.create({
      model,
      temperature: 0.0,
      max_tokens: 150,
      messages: [
        { role: 'system', content: 'You are an expert at identifying legitimate brand and company names. You strictly filter out generic words, adjectives, and non-brand terms.' },
        { role: 'user', content: prompt },
      ],
    });

    const raw = resp.choices?.[0]?.message?.content?.trim() || '[]';
    const parsed = JSON.parse(raw);
    const filtered = Array.isArray(parsed) ? parsed.map(String).filter(s => s.trim().length > 0) : [];

    // Additional post-processing filter for common false positives
    const commonWords = new Set([
      'best', 'top', 'leading', 'offers', 'known', 'popular', 'quality',
      'service', 'brand', 'product', 'company', 'business', 'features',
      'options', 'choice', 'selection', 'range', 'variety', 'collection'
    ]);

    return filtered.filter(name => !commonWords.has(name.toLowerCase()));
  } catch (e) {
    // If this call fails, apply basic filtering
    const commonWords = new Set([
      'best', 'top', 'leading', 'offers', 'known', 'popular', 'quality',
      'service', 'brand', 'product', 'company', 'business', 'features',
      'options', 'choice', 'selection', 'range', 'variety', 'collection'
    ]);
    return candidates.filter(c => !commonWords.has(c.toLowerCase()));
  }
}
async function embedText(openai, text) { if (!text) return null; const resp = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text }); return resp.data?.[0]?.embedding || null; }
function cosine(a, b) { if (!a || !b) return 0; let dot=0,na=0,nb=0; for (let i=0;i<a.length;i++){const x=a[i],y=b[i]; dot+=x*y; na+=x*x; nb+=y*y;} return dot/(Math.sqrt(na)*Math.sqrt(nb)+1e-9); }
function dedupeByCosine(embs, threshold=0.92){ const keep=[]; for (let i=0;i<embs.length;i++){ const e=embs[i]; if(!e){keep.push(i);continue;} let dup=false; for (const k of keep){ const sim=cosine(e,embs[k]); if(sim>=threshold){dup=true;break;} } if(!dup) keep.push(i);} return keep; }
function generateGuidance({ brandName, category, score, breakdown }, planTier) {
  const steps = [];
  const comp = (breakdown.competitors || []).map(c => c.name);
  const weakLoc = (breakdown.locations || []).slice().sort((a,b)=>a.score-b.score)[0];

  // Core steps for all tiers
  if (score < 50) {
    steps.push({ title: 'Establish topical authority', action: `Publish 4–6 high-quality ${category} guides mentioning ${brandName} in headings and FAQs.`, impact: 'high', effort: 'medium' });
  } else {
    steps.push({ title: 'Defend category leadership', action: `Create comparison content vs top competitors and update trust signals for ${brandName}.`, impact: 'medium', effort: 'low' });
  }
  if (comp.length) {
    const top = comp[0];
    steps.push({ title: `Counter ${top} dominance`, action: `Target queries where ${top} is recommended; add case studies and social proof.`, impact: 'high', effort: 'medium' });
  }
  if (weakLoc) {
    steps.push({ title: `Fix weak geography: ${weakLoc.name}`, action: `Localize landing pages, add regional testimonials, and include NAP schema for ${weakLoc.name}.`, impact: 'medium', effort: 'low' });
  }

  // Pro tier: expand into a detailed, structured plan
  if (planTier === 'pro') {
    steps.push({ title: 'Content cluster plan', action: `Create a 10–12 article cluster around ${category} (how-tos, comparisons, buyer guides). Interlink with category and ${brandName} pages.`, impact: 'high', effort: 'high' });
    steps.push({ title: 'Entity and schema optimization', action: `Add Organization, Product, FAQ, and HowTo schema. Ensure ${brandName} has consistent entity references (Wikidata/Crunchbase).`, impact: 'medium', effort: 'medium' });
    steps.push({ title: 'Reputation signals', action: `Publish 3–5 case studies and testimonials; emphasize outcomes and unique value props for ${brandName}.`, impact: 'medium', effort: 'low' });
    steps.push({ title: 'Citations and knowledge sources', action: `Earn references from industry directories and thought‑leadership sites that LLMs ingest. Prioritize high E-E-A-T domains.`, impact: 'medium', effort: 'medium' });
    steps.push({ title: 'Competitor gap closing', action: `Audit ${comp.slice(0,3).join(', ') || 'top competitors'} content. Fill gaps with comparison pages and FAQs addressing brand mentions in AI answers.`, impact: 'high', effort: 'medium' });
    steps.push({ title: 'Prompt coverage expansion', action: `Map 50–80 user intents/questions for ${category}. Ensure on-site content answers them clearly with structured sections.`, impact: 'high', effort: 'high' });
    steps.push({ title: 'Local authority pack', action: `For ${weakLoc?.name || 'priority regions'}, build localized pages, GMB improvements, and acquire regional press/mentions.`, impact: 'medium', effort: 'medium' });
  }

  return { summary: `Visibility score is ${score}. Focus on content authority, competitor positioning, and local relevance.`, steps };
}

// --- Stripe Billing ---
function priceIdForTier(tier){
  const t=String(tier||'').toLowerCase();
  if(t==='pro') return process.env.STRIPE_PRICE_PRO;
  if(t==='enterprise') return process.env.STRIPE_PRICE_ENTERPRISE;
  return null;
}
function oneTimePriceId(kind){
  const k=String(kind||'').toLowerCase();
  if(k==='starter') return process.env.STRIPE_PRICE_OT_STARTER;
  if(k==='premium') return process.env.STRIPE_PRICE_OT_PREMIUM;
  return null;
}
function defaultSuccessUrl(){ return process.env.STRIPE_CHECKOUT_SUCCESS_URL||'https://www.mayin.app/dashboard'; }
function defaultCancelUrl(){ return process.env.STRIPE_CHECKOUT_CANCEL_URL||'https://www.mayin.app/billing'; }
async function ensureStripe(){ if(!stripe){ const sKey=process.env.STRIPE_SECRET_KEY; if(!sKey) throw new Error('Missing STRIPE_SECRET_KEY in environment'); const Stripe=require('stripe'); stripe=new Stripe(sKey); } return stripe; }
async function resolvePriceForProduct(st, productId, mode){ if(!productId) return null; const list=await st.prices.list({ product: productId, active:true, limit:10}); if(!list?.data?.length) return null; if(mode==='subscription'){const rec=list.data.find(p=>p.type==='recurring'&&p.recurring?.interval==='month'); return rec?.id||null;} else { const one=list.data.find(p=>p.type==='one_time'); return one?.id||null; } }

exports.createStripeCheckoutSession = onRequest({ region: 'asia-south1' }, (req, res) => {
  cors(req, res, async () => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).send({ error: 'Unauthorized', message: 'No Firebase ID token was passed as a Bearer token in the Authorization header.' });
      }
      const idToken = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;
      if (!uid) {
        return res.status(401).send({ error: 'Unauthorized', message: 'User authentication failed.' });
      }

      const data = req.body || {};
      let { priceId, productId, planTier, successUrl, cancelUrl, clientReferenceId } = data;
      // Enforce Pro-only subscription
      planTier = 'pro';
      successUrl = successUrl || defaultSuccessUrl();
      cancelUrl = cancelUrl || defaultCancelUrl();

      const db = admin.firestore();
      const userRef = db.collection('users').doc(uid);
      const userData = (await userRef.get()).data() || {};
      const st = await ensureStripe();

      let customerId = userData.stripeCustomerId;
      if (!customerId) {
        const customer = await st.customers.create({ email: userData.email || undefined, metadata: { uid } });
        customerId = customer.id;
        await userRef.set({ stripeCustomerId: customerId }, { merge: true });
      }

      // Force Pro price only
      if (!priceId) priceId = priceIdForTier('pro');
      // Ignore productId resolution to prevent other tiers
      if (!priceId) {
        return res.status(400).send({ error: 'Invalid argument', message: 'Missing priceId or unsupported planTier/product' });
      }

      console.log('Creating Stripe Checkout session with success_url:', successUrl + '?session_id={CHECKOUT_SESSION_ID}');
      const params = {
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl + '?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: cancelUrl,
        subscription_data: { metadata: { uid, planTier: 'pro' } },
        metadata: { uid, planTier: 'pro' }
      };
      if (clientReferenceId && typeof clientReferenceId === 'string') {
        params.client_reference_id = clientReferenceId;
      }
      // Do not auto-apply any coupons; allow user to add promotion codes manually
      params.allow_promotion_codes = true;
      const session = await st.checkout.sessions.create(params);

      return res.status(200).send({ url: session.url, sessionId: session.id });
    } catch (error) {
      functions.logger.error('createStripeCheckoutSession error:', error);
      if (error.code === 'auth/id-token-expired') {
        return res.status(401).send({ error: 'Unauthorized', message: 'Token expired. Please re-authenticate.' });
      }
      if (error.type === 'StripeInvalidRequestError') {
        return res.status(400).send({ error: 'Stripe Error', message: error.message });
      }
      return res.status(500).send({ error: 'Internal Server Error', message: error.message });
    }
  });
});

exports.createStripeOneTimeCheckout = onCall({ cors:true, region:'asia-south1' }, async (request)=>{
  const uid=request.auth?.uid; if(!uid) throw new functions.https.HttpsError('unauthenticated','User must be authenticated');
  const data=request.data||{}; let { priceId, productId, kind, quantity=1, successUrl, cancelUrl, clientReferenceId }=data; successUrl=successUrl||defaultSuccessUrl(); cancelUrl=cancelUrl||defaultCancelUrl();
  const db=admin.firestore(); const userRef=db.collection('users').doc(uid); const userData=(await userRef.get()).data()||{};
  const st=await ensureStripe();
  let customerId=userData.stripeCustomerId; if(!customerId){ const customer=await st.customers.create({ email:userData.email||undefined, metadata:{ uid } }); customerId=customer.id; await userRef.set({ stripeCustomerId: customerId }, { merge:true}); }
  if(!priceId) priceId=oneTimePriceId(kind); if(!priceId&&productId) priceId=await resolvePriceForProduct(st, productId, 'payment'); if(!priceId) throw new functions.https.HttpsError('invalid-argument','Missing priceId or unsupported kind/product');
  const sessionParams = { mode:'payment', customer:customerId, line_items:[{price:priceId, quantity}], success_url:successUrl+'?session_id={CHECKOUT_SESSION_ID}', cancel_url:cancelUrl, allow_promotion_codes:true, metadata:{ uid, purchaseType:'scan', kind:String(kind||'') } };
  if (clientReferenceId && typeof clientReferenceId === 'string') { sessionParams.client_reference_id = clientReferenceId; }
  const session=await st.checkout.sessions.create(sessionParams);
  return { url: session.url, sessionId: session.id };
});

exports.debugStripeResolvePrice = onCall({ cors:true, region:'asia-south1' }, async (request)=>{
  const uid=request.auth?.uid; if(!uid) throw new functions.https.HttpsError('unauthenticated','User must be authenticated');
  const { productId, mode }=request.data||{}; if(!productId||!mode) throw new functions.https.HttpsError('invalid-argument','productId and mode are required');
  const st=await ensureStripe(); const list=await st.prices.list({ product:productId, active:true, limit:10 });
  const priceId=await resolvePriceForProduct(st, productId, mode); return { priceId, prices:list.data?.map(p=>({ id:p.id, type:p.type, currency:p.currency, nickname:p.nickname, unit_amount:p.unit_amount, recurring:p.recurring })) };
});

exports.createStripePortalSession = onCall({ cors:true, region:'asia-south1' }, async (request)=>{
  const uid=request.auth?.uid; if(!uid) throw new functions.https.HttpsError('unauthenticated','User must be authenticated');
  const returnUrl=(request.data||{}).returnUrl||process.env.STRIPE_PORTAL_RETURN_URL||'https://www.mayin.app/billing';
  const db=admin.firestore(); const userData=(await db.collection('users').doc(uid).get()).data()||{}; const customerId=userData.stripeCustomerId; if(!customerId) throw new functions.https.HttpsError('failed-precondition','No Stripe customer on file');
  const st=await ensureStripe(); const session=await st.billingPortal.sessions.create({ customer:customerId, return_url:returnUrl }); return { url: session.url };
});

// Get user subscription status and features
exports.getUserSubscriptionStatus = onCall({ cors: true, region: 'asia-south1' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');

  const db = admin.firestore();
  // Privileged allowlist: unlimited scans for operator account
  const userDoc = await db.collection('users').doc(uid).get();
  const userData = userDoc.data() || {};

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartTs = admin.firestore.Timestamp.fromDate(monthStart);

  // Get current month scan count
  const scansCol = db.collection('users').doc(uid).collection('scans');
  let currentMonthScans = 0;

  // Determine user features based on subscription
  const isSubscribed = userData.isSubscribed || userData.subscriptionStatus === 'active' || userData.subscriptionStatus === 'trialing';
  const planTier = userData.planTier || 'free';

  let monthlyLimit = 0;
  let features = { advancedReports: false, prioritySupport: false, apiAccess: false };
  let canCreateScan = false;
  let scansRemaining = 0;

  if (isSubscribed) {
    switch (planTier) {
      case 'pro': {
        monthlyLimit = 2; // display
        features = { advancedReports: true, prioritySupport: true, apiAccess: false };
        // Cooldown logic: 1 scan every 15 days
        const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;
        let lastProScanAt = null;
        try {
          // Count scans in current calendar month for display
          let query = scansCol.where('planTier', '==', 'pro');
          try {
            query = query.where('startedAt', '>=', monthStartTs);
            const snap = await query.get();
            currentMonthScans = snap.size;
          } catch (e) {
            const snap = await scansCol.where('startedAt', '>=', monthStartTs).get();
            currentMonthScans = snap.docs.filter(d => (d.get('planTier') || '') === 'pro').length;
          }
          // Determine cooldown from latest pro scan
          const latest = await scansCol.orderBy('startedAt', 'desc').limit(10).select('planTier','startedAt').get();
          const doc = latest.docs.find(d => (d.get('planTier') || '') === 'pro');
          lastProScanAt = doc ? (doc.get('startedAt')?.toDate?.() || null) : null;
        } catch {}
        if (lastProScanAt) {
          const sinceMs = Date.now() - lastProScanAt.getTime();
          canCreateScan = sinceMs >= FIFTEEN_DAYS_MS;
        } else {
          canCreateScan = true;
        }
        scansRemaining = canCreateScan ? 1 : 0;
        break;
      }
      case 'enterprise':
        monthlyLimit = 10;
        features = { advancedReports: true, prioritySupport: true, apiAccess: true };
        // Count only Enterprise scans against the Enterprise monthly limit
        try {
          let query = scansCol
            .where('planTier', '==', 'enterprise');

          if (userData.lastSubscriptionUpdate) {
            query = query.where('startedAt', '>=', userData.lastSubscriptionUpdate);
          } else {
            query = query.where('startedAt', '>=', monthStartTs);
          }

          const snap = await query.get();
          currentMonthScans = snap.size;
        } catch (e) {
          // Fallback without plan filter if index missing
          const snap = await scansCol.where('startedAt', '>=', monthStartTs).get();
          currentMonthScans = snap.size;
        }
        break;
      default:
        monthlyLimit = 0;
        features = { advancedReports: false, prioritySupport: false, apiAccess: false };
        break;
    }
  } else {
    // Not subscribed: pro limit is 0, free/credits handled elsewhere
    const snap = await scansCol.where('startedAt', '>=', monthStartTs).get();
    currentMonthScans = snap.size;
  }

  const defaultCanCreate = ((userData.scanCredits || 0) > 0 || !userData.freeScanUsed);
  if (isSubscribed) {
    // For Pro, use cooldown-based availability; for others, fall back to monthly limit
    if (planTier === 'pro') {
      return {
        isSubscribed,
        planTier,
        subscriptionStatus: userData.subscriptionStatus || 'inactive',
        scanCredits: userData.scanCredits || 0,
        monthlyLimit,
        currentMonthScans,
        scansRemaining,
        features,
        currentPeriodEnd: userData.currentPeriodEnd,
        canCreateScan,
      };
    }
    return {
      isSubscribed,
      planTier,
      subscriptionStatus: userData.subscriptionStatus || 'inactive',
      scanCredits: userData.scanCredits || 0,
      monthlyLimit,
      currentMonthScans,
      scansRemaining: Math.max(0, monthlyLimit - currentMonthScans),
      features,
      currentPeriodEnd: userData.currentPeriodEnd,
      canCreateScan: currentMonthScans < monthlyLimit,
    };
  }
  return {
    isSubscribed,
    planTier,
    subscriptionStatus: userData.subscriptionStatus || 'inactive',
    scanCredits: userData.scanCredits || 0,
    monthlyLimit,
    currentMonthScans,
    scansRemaining: Math.max(0, monthlyLimit - currentMonthScans),
    features,
    currentPeriodEnd: userData.currentPeriodEnd,
    canCreateScan: defaultCanCreate,
  };
});

exports.handleStripeWebhook = onRequest({ region: 'asia-south1' }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const st = await ensureStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error('Missing STRIPE_WEBHOOK_SECRET in environment');
    }
    const event = st.webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], webhookSecret);
    const db = admin.firestore();

    const handleSubChange = async (sub) => {
      const uid = sub.metadata?.uid || null;
      if (!uid) {
        functions.logger.warn('Stripe webhook received for subscription with no UID in metadata', { subscriptionId: sub.id });
        return;
      }

      const status = sub.status;
      const currentPeriodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
      const priceId = sub.items?.data?.[0]?.price?.id || null;
      const planTier = sub.metadata?.planTier || 'pro';

      let monthlyScanCredits = 0;
      switch (planTier) {
        case 'pro':
          monthlyScanCredits = 2; // display-only; cooldown enforces 1 per 15 days
          break;
        case 'enterprise':
          monthlyScanCredits = 10;
          break;
        default:
          monthlyScanCredits = 0;
          break;
      }

      const updateData = {
        subscriptionStatus: status,
        isSubscribed: status === 'active' || status === 'trialing',
        currentPeriodEnd,
        stripePriceId: priceId,
        planTier: planTier,
        subscriptionId: sub.id,
        lastSubscriptionUpdate: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (status === 'active' || status === 'trialing') {
        updateData.monthlyLimit = monthlyScanCredits;
        updateData.scanCredits = 0;
        if (sub.current_period_start) {
          updateData.currentPeriodStart = new Date(sub.current_period_start * 1000);
        }
      } else if (status === 'canceled' || status === 'past_due' || status === 'unpaid') {
        updateData.scanCredits = 0;
        updateData.monthlyLimit = 0;
      }

      functions.logger.log(`Updating subscription for user ${uid}:`, {
        status,
        planTier,
        ...updateData,
      });
      await db.collection('users').doc(uid).set(updateData, { merge: true });
      functions.logger.log(`Successfully updated subscription for user ${uid}`);
    };

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.subscription) {
          const subscription = await st.subscriptions.retrieve(session.subscription);
          await handleSubChange(subscription);
        } else if (session.mode === 'payment') {
          const full = await st.checkout.sessions.retrieve(session.id, { expand: ['line_items'] });
          const qty = full?.line_items?.data?.[0]?.quantity || 1;
          const uid = session.metadata?.uid || null;
          if (uid) {
            await db.collection('users').doc(uid).set({ scanCredits: admin.firestore.FieldValue.increment(qty), lastPurchaseAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          }
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await handleSubChange(event.data.object);
        break;
      }
      default:
        functions.logger.log(`Unhandled Stripe event type: ${event.type}`);
    }

    res.status(200).send({ received: true });
  } catch (err) {
    functions.logger.error('Stripe webhook error:', {
      message: err.message,
      stack: err.stack,
    });
    res.status(200).send({ received: true, error: err.message });
  }
});

// --- Razorpay (preserved) ---
exports.getRazorpayConfig = onCall({secrets:[razorpayKeyIdSecret], region:'asia-south1'}, async (request) => {
  return { keyId: getRazorpayKeyId(), environment: process.env.NODE_ENV==='production'?'production':'test' };
});

exports.cancelSubscription = onRequest({secrets:[razorpayKeyIdSecret, razorpaySecretSecret], region:'asia-south1'}, (request, response) => {
  cors(request, response, async () => {
    try {
      if (request.method !== 'POST') return response.status(405).send({ error:'Method Not Allowed' });
      const { userId } = request.body; if(!userId) return response.status(400).send({ error:'Missing userId' });
      const db=admin.firestore(); const userRef=db.collection('users').doc(userId); const userDoc=await userRef.get(); if(!userDoc.exists) return response.status(404).send({ error:'User not found' });
      const subscriptionId=userDoc.data().subscriptionId; if(!subscriptionId) return response.status(400).send({ error:'No active subscription found' });
      const instance=new Razorpay({ key_id:getRazorpayKeyId(), key_secret:getRazorpaySecret() });
      const subscription=await instance.subscriptions.fetch(subscriptionId);
      if (subscription.status==='active' || subscription.status==='authenticated') {
        await instance.subscriptions.cancel(subscriptionId, true);
        await userRef.update({ isSubscribed:false, subscriptionStatus:'cancelled', autoRenew:false, subscriptionCancelledDate: admin.firestore.Timestamp.fromDate(new Date()) });
        return response.status(200).send({ success:true, message:'Subscription cancelled successfully' });
      }
      if (subscription.status==='cancelled' || subscription.status==='completed') {
        await userRef.update({ autoRenew:false, subscriptionStatus:subscription.status });
        return response.status(200).send({ success:true, message:'Subscription was already cancelled' });
      }
      return response.status(400).send({ error:`Cannot cancel subscription with status: ${subscription.status}` });
    } catch (error) {
      functions.logger.error('Error cancelling subscription:', error);
      return response.status(500).send({ error:`Failed to cancel subscription: ${error.message||error}` });
    }
  });
});

exports.createRazorpaySubscription = onCall({ secrets:[razorpayKeyIdSecret, razorpaySecretSecret], memory:'128Mi', cpu:1, region:'asia-south1' }, async (request) => {
  if (!request.auth) throw new functions.https.HttpsError('unauthenticated','User must be authenticated to create a subscription');
  const { planId } = request.data; if (!planId) throw new functions.https.HttpsError('invalid-argument','Plan ID is required'); if (!/^plan_[a-zA-Z0-9]+$/.test(planId)) throw new functions.https.HttpsError('invalid-argument','Invalid plan ID format');
  const userId=request.auth.uid; const db=admin.firestore(); const userDoc=await db.collection('users').doc(userId).get(); if(!userDoc.exists) throw new functions.https.HttpsError('not-found','User not found');
  const userData=userDoc.data(); const authUser=await admin.auth().getUser(userId); const email=authUser.email||userData.email; const phoneNumber=authUser.phoneNumber||userData.phone_number; const displayName=authUser.displayName||userData.display_name||'User'; if(!email) throw new functions.https.HttpsError('invalid-argument','Email is required for subscription.');
  const razorpay=new Razorpay({ key_id:getRazorpayKeyId(), key_secret:getRazorpaySecret() });
  let actualPlanId=planId;
  try {
    await razorpay.plans.fetch(planId);
  } catch (error) {
    throw new functions.https.HttpsError('not-found', 'Invalid subscription plan');
  }
  const subscription=await razorpay.subscriptions.create({ plan_id:actualPlanId, customer_notify:1, total_count:12, notes:{ userId, email, displayName, ...(phoneNumber?{phoneNumber}:{}) } });
  await db.collection('users').doc(userId).update({ subscriptionId:subscription.id, subscriptionStatus:subscription.status, subscriptionStartDate: admin.firestore.Timestamp.fromDate(new Date(subscription.start_at*1000)), subscriptionEndDate: admin.firestore.Timestamp.fromDate(new Date(subscription.end_at*1000)), isSubscribed:false, subscriptionExpiry:null, autoRenew:false, nextRenewalDate:null, messageLimit: PRODUCTION_CONFIG.SUBSCRIBER_MESSAGE_LIMIT, messageCount:0, resetMessageLimitDate: admin.firestore.Timestamp.fromDate(new Date()) });
  return { subscriptionId:String(subscription.id), status:subscription.status, planIdUsed:String(actualPlanId) };
});

async function handleSubscriptionAuthenticated(subscription, db){ const snap=await db.collection('users').where('subscriptionId','==',subscription.id).get(); if(snap.empty) return; await snap.docs[0].ref.update({ subscriptionStatus:'authenticated', subscriptionAuthenticatedAt: admin.firestore.Timestamp.fromDate(new Date()) }); }
async function handleSubscriptionActivated(subscription, db){ const snap=await db.collection('users').where('subscriptionId','==',subscription.id).get(); if(snap.empty) return; const ref=snap.docs[0].ref; const expiryDate=new Date(); if(subscription.plan_id==='plan_QpjGNZiRWSzGMA') expiryDate.setDate(expiryDate.getDate()+7); else expiryDate.setMonth(expiryDate.getMonth()+1); await ref.update({ isSubscribed:true, subscriptionStatus:'active', subscriptionActivatedAt: admin.firestore.Timestamp.fromDate(new Date()), subscriptionExpiry: admin.firestore.Timestamp.fromDate(expiryDate), autoRenew:true, nextRenewalDate: admin.firestore.Timestamp.fromDate(expiryDate), messageLimit: PRODUCTION_CONFIG.SUBSCRIBER_MESSAGE_LIMIT, messageCount:0 }); }
async function handleSubscriptionCharged(subscription, payment, db){ const snap=await db.collection('users').where('subscriptionId','==',subscription.id).get(); if(snap.empty) return; const ref=snap.docs[0].ref; if(!payment.amount || typeof payment.amount!=='number' || payment.amount<=0) throw new Error('Invalid payment amount'); const paymentRecord={ paymentId:payment.id, subscriptionId:subscription.id, amount: payment.amount/100, status: payment.status, date: admin.firestore.Timestamp.fromDate(new Date(payment.created_at*1000)) }; await ref.update({ paymentHistory: admin.firestore.FieldValue.arrayUnion(paymentRecord), lastPaymentId: payment.id, lastPaymentDate: admin.firestore.Timestamp.fromDate(new Date(payment.created_at*1000)) }); }
async function handleSubscriptionPending(subscription, db){ const snap=await db.collection('users').where('subscriptionId','==',subscription.id).get(); if(snap.empty) return; await snap.docs[0].ref.update({ subscriptionStatus:'pending' }); }
async function handleSubscriptionHalted(subscription, db){ const snap=await db.collection('users').where('subscriptionId','==',subscription.id).get(); if(snap.empty) return; await snap.docs[0].ref.update({ subscriptionStatus:'halted' }); }
async function handleSubscriptionCancelled(subscription, db){ const snap=await db.collection('users').where('subscriptionId','==',subscription.id).get(); if(snap.empty) return; await snap.docs[0].ref.update({ subscriptionStatus:'cancelled', autoRenew:false, subscriptionCancelledDate: admin.firestore.Timestamp.fromDate(new Date()) }); }
async function handleSubscriptionCompleted(subscription, db){ const snap=await db.collection('users').where('subscriptionId','==',subscription.id).get(); if(snap.empty) return; await snap.docs[0].ref.update({ subscriptionStatus:'completed', autoRenew:false }); }

exports.createRazorpayOrder = onCall({ cors:true, region:'asia-south1', secrets:[razorpayKeyIdSecret, razorpaySecretSecret] }, async (request)=>{
  const { amount, currency, campaignId, brandId, description }=request.data||{}; if(!amount||!currency||!campaignId||!brandId||!description) throw new functions.https.HttpsError('invalid-argument','Amount, currency, campaign ID, brand ID, and description are required');
  const razorpay=new Razorpay({ key_id:getRazorpayKeyId(), key_secret:getRazorpaySecret() });
  const order=await razorpay.orders.create({ amount, currency, receipt:`cmp_${campaignId.substring(0,15)}_${Date.now().toString().substring(8)}`, notes:{ campaignId, brandId, description } });
  await admin.firestore().collection('brandCampaigns').doc(campaignId).update({ razorpayOrderId: order.id, razorpayOrderAmount: amount, razorpayOrderCurrency: currency, paymentStatus:'pending', updatedAt: admin.firestore.Timestamp.fromDate(new Date()) });
  return { success:true, orderId:order.id, paymentId:order.id, amount, currency, key_id:getRazorpayKeyId() };
});

exports.verifyRazorpayPayment = onCall({ cors:true, region:'asia-south1', secrets:[razorpaySecretSecret] }, async (request)=>{
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature, campaignId }=request.data||{}; if(!razorpayOrderId||!razorpayPaymentId||!razorpaySignature||!campaignId) throw new functions.https.HttpsError('invalid-argument','All payment verification parameters are required');
  const expectedSignature=crypto.createHmac('sha256', getRazorpaySecret()).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex'); if(expectedSignature!==razorpaySignature) throw new functions.https.HttpsError('permission-denied','Invalid payment signature');
  const db=admin.firestore(); await db.collection('brandCampaigns').doc(campaignId).update({ paymentStatus:'completed', razorpayPaymentId, paymentCompletedAt: admin.firestore.Timestamp.fromDate(new Date()), status:'active', isActive:true, updatedAt: admin.firestore.Timestamp.fromDate(new Date()) });
  await db.collection('campaignPayments').doc().set({ campaignId, razorpayOrderId, razorpayPaymentId, amount:100, currency:'INR', status:'completed', createdAt: admin.firestore.Timestamp.fromDate(new Date()) });
  return { success:true, message:'Payment verified successfully', campaignStatus:'active' };
});

exports.razorpayWebhook = onRequest({secrets:[razorpaySecretSecret, razorpayKeyIdSecret], region:'asia-south1'}, async (request, response)=>{
  cors(request, response, async () => {
    try {
      if (request.method !== 'POST') return response.status(405).send({ status:'error', error:'Method Not Allowed' });
      const db=admin.firestore();
      const secret=getRazorpaySecret(); const payload=request.body; const webhookSignature=request.headers['x-razorpay-signature']; if(!webhookSignature) return response.status(400).send({ status:'error', error:'Missing signature' });
      const expectedSignature=crypto.createHmac('sha256', secret.trim()).update(JSON.stringify(payload)).digest('hex'); if(expectedSignature!==webhookSignature) return response.status(400).send({ status:'error', error:'Invalid signature' });
      const event=payload.event; let success=false; const maxRetries=3; let retryCount=0; while(retryCount<maxRetries&&!success){ try { if(event.startsWith('subscription.')){ const subscription=payload.payload.subscription?.entity; if(!subscription || !subscription.id) return response.status(400).send({ status:'error', error:'Invalid subscription entity' }); switch(event){ case 'subscription.authenticated': await handleSubscriptionAuthenticated(subscription, db); break; case 'subscription.activated': await handleSubscriptionActivated(subscription, db); break; case 'subscription.charged': { if(payload.payload.payment && payload.payload.payment.entity){ await handleSubscriptionCharged(subscription, payload.payload.payment.entity, db); } break; } case 'subscription.pending': await handleSubscriptionPending(subscription, db); break; case 'subscription.halted': await handleSubscriptionHalted(subscription, db); break; case 'subscription.cancelled': await handleSubscriptionCancelled(subscription, db); break; case 'subscription.completed': await handleSubscriptionCompleted(subscription, db); break; default: { /* no-op update */ } }
          success = true; } else if (event.startsWith('payment.')) { /* handled in charged above */ success=true; } if(success) break; } catch (err) { retryCount++; if(retryCount===maxRetries) { functions.logger.error('Razorpay webhook processing failed:', err); throw err; } await new Promise(r=>setTimeout(r, Math.min(1000 * Math.pow(2,retryCount) + Math.random()*1000, 10000))); } }
      return response.status(200).send({ status:'success', message:'Webhook processed' });
    } catch (error) {
      functions.logger.error('Error processing webhook:', error); return response.status(200).send({ status:'error', error:'Internal server error' });
    }
  });
});

// --- Blog/Insights Content Generation ---
const blogGenerator = require('./blog-generator');
exports.generateInsightNow = blogGenerator.generateInsightNow;
exports.generateInsightsFromTopics = blogGenerator.generateInsightsFromTopics;
exports.generateCuratedInsights = blogGenerator.generateCuratedInsights;
exports.checkForNewCuratedTopics = blogGenerator.checkForNewCuratedTopics;

// --- Visibility Diagnostics (Perplexity + GPT) ---
exports.findVisibilityReasons = onCall({ cors: true, region: 'asia-south1' }, async (request) => {
  const CACHE_VERSION = 2;
  const uid = request.auth?.uid;
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  const { brand, category, region } = request.data || {};
  if (!brand || !category || !region) throw new functions.https.HttpsError('invalid-argument', 'brand, category, region are required');

  const db = admin.firestore();
  const key = `${String(brand).toLowerCase().trim()}|${String(category).toLowerCase().trim()}|${String(region).toLowerCase().trim()}`;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const cacheRef = db.collection('visibilityDiagnostics').doc(hash);

  // Return cached within 7 days if cache version matches
  try {
    const snap = await cacheRef.get();
    const d = snap.data();
    if (d && d.createdAt && d.reasons && d.strategies && Number(d.cacheVersion || 0) === CACHE_VERSION) {
      const createdAt = d.createdAt?.toDate ? d.createdAt.toDate() : new Date(d.createdAt);
      if (createdAt && (Date.now() - createdAt.getTime()) < 7 * 24 * 60 * 60 * 1000) {
        return { cached: true, reasons: d.reasons, strategies: d.strategies };
      }
    }
  } catch {}

  const PERPLEXITY_API_KEY = process.env.MAYIN_PERPLEXITY_KEY;
  if (!PERPLEXITY_API_KEY) {
    throw new functions.https.HttpsError('failed-precondition', 'Missing MAYIN_PERPLEXITY_KEY');
  }

  const queries = [
    `Why is ${brand} less mentioned online in ${region} for ${category}?`,
    `Top competitors of ${brand} in ${region} ${category} market`,
    `SEO visibility of ${brand} in ${region}`,
    `Customer perception of ${brand} in ${region} for ${category}`,
    `Media coverage of ${brand} in ${region}`,
    `Social media presence of ${brand} in ${region}`,
    `Is ${brand} on review or directory sites in ${region}?`,
    `Popularity of ${brand} vs ${category} brands in ${region}`,
    `Why would AI mention ${brand} less for ${category}?`,
    `How ${brand} can improve visibility in ${region} ${category}`,
  ];

  async function perplexityQuery(q) {
    try {
      const resp = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${PERPLEXITY_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'sonar-pro', messages: [{ role: 'system', content: 'You are a helpful assistant.' }, { role: 'user', content: q }] })
      });
      if (!resp.ok) {
        const errorBody = await resp.text().catch(() => 'Could not read error body');
        throw new Error(`HTTP_${resp.status} - ${errorBody}`);
      }
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content || '';
      return String(text).slice(0, 4000);
    } catch (e) {
      functions.logger.error('Perplexity query failed', { error: e?.message || String(e), query: q });
      return '';
    }
  }

  // Parallel calls with simple retry
  const results = await Promise.all(queries.map(async (q) => {
    let out = await perplexityQuery(q);
    if (!out) out = await perplexityQuery(q);
    return { q, out };
  }));
  const nonEmpty = results.filter(r => (r.out || '').trim().length > 0).length;
  if (nonEmpty < 3) {
    // Do not synthesize reasons without search data
    throw new functions.https.HttpsError('unavailable', 'PERPLEXITY_NO_RESULTS');
  }
  const corpus = results.map(r => `Q: ${r.q}\nA: ${r.out}`).join('\n\n');

  // Summarize with OpenAI (mini)
  let reasons = [], strategies = [];
  try {
    const model = 'gpt-4o-mini';
    const prompt = `You are an expert in AI search visibility. Using the Perplexity summaries below for "${brand}" in "${region}" and category "${category}":\n\n1) Provide exactly 10 concise reasons the brand is mentioned less by AI (clear, specific, non-duplicative).\n2) Provide exactly 10 actionable, detailed and concrete strategies (each 1–2 sentences with specifics) to improve visibility.\n\nReturn strict JSON only: {"reasons": string[], "strategies": string[]}. Do not include any extra keys or commentary.\n\n${corpus}`;
    const openai = getOpenAIClient();
    const resp = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 800,
      messages: [ { role: 'system', content: 'Return JSON only.' }, { role: 'user', content: prompt } ]
    });
    // Some models may wrap JSON in code fences; try to salvage
    let raw = resp.choices?.[0]?.message?.content?.trim() || '{}';
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) raw = raw.slice(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(raw);
    reasons = Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 10).map(String) : [];
    strategies = Array.isArray(parsed.strategies) ? parsed.strategies.slice(0, 10).map(String) : [];
  } catch (e) {
    functions.logger.error('findVisibilityReasons summarization failed', e?.message || e);
    throw new functions.https.HttpsError('internal', 'SUMMARY_FAILED');
  }

  // Save cache
  try {
    await cacheRef.set({ key, brand, category, region, reasons, strategies, cacheVersion: CACHE_VERSION, createdAt: admin.firestore.FieldValue.serverTimestamp(), sample: (results || []).slice(0,3) }, { merge: true });
  } catch {}

  return { cached: false, reasons, strategies };
});
