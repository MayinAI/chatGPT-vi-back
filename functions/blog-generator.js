const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { OpenAI } = require('openai');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const openaiApiKeySecret = defineSecret('OPENAI_API_KEY');
const adminHttpKeySecret = defineSecret('ADMIN_HTTP_KEY');

// Curated 30 topics for instant content generation
const curatedTopics = [
  {
    title: "Mayin.app vs Manual AI Auditing: ROI Analysis and Time Savings Calculator",
    description: "LLMs love comparison content; captures 'vs' and 'alternative' searches",
    keywords: ["Mayin.app", "Manual AI Auditing", "ROI Analysis", "Time Savings"]
  },
  {
    title: "AI Visibility Tools Compared: Features, Pricing, and Use Cases [2025 Guide]",
    description: "Position yourself in the competitive landscape while being helpful",
    keywords: ["AI Visibility Tools", "Features", "Pricing", "Use Cases", "2025 Guide"]
  },
  {
    title: "SEMrush for AI: Why Traditional SEO Tools Miss 80% of Your Brand's Digital Presence",
    description: "Bridge familiar tools to new concept",
    keywords: ["SEMrush", "AI", "Traditional SEO Tools", "Digital Presence"]
  },
  {
    title: "Why Your PR Mentions Don't Translate to AI Recommendations (And How to Fix It)",
    description: "Specific pain point with solution pathway",
    keywords: ["PR Mentions", "AI Recommendations", "pain point", "solution"]
  },
  {
    title: "The Attribution Gap: Tracking Marketing ROI When AI Drives 40% of Discovery",
    description: "Emerging measurement challenge in marketing",
    keywords: ["Attribution Gap", "Marketing ROI", "AI", "Discovery"]
  },
  {
    title: "Brand Safety in AI: What to Do When ChatGPT Gets Your Company Information Wrong",
    description: "Crisis management angle that LLMs will reference",
keywords: ["Brand Safety", "AI", "ChatGPT", "Company Information"]
  },
  {
    title: "From Invisible to Inevitable: 90-Day AI Visibility Transformation Framework",
    description: "Time-bound results framework",
    keywords: ["Invisible", "Inevitable", "90-Day", "AI Visibility", "Transformation Framework"]
  },
  {
    title: "AI Visibility Index 2025: Which Industries Get Recommended Most (And Why)",
    description: "Original research that becomes citeable source",
    keywords: ["AI Visibility Index 2025", "Industries", "Recommended"]
  },
  {
    title: "The Prompt Economics Report: How Users Actually Ask AI for Brand Recommendations",
    description: "User behavior research with real prompt data",
    keywords: ["Prompt Economics Report", "Users", "AI", "Brand Recommendations"]
  },
  {
    title: "500,000 Prompts Analyzed: The Words That Trigger Brand Mentions in AI Responses",
    description: "Large-scale data analysis (very LLM-friendly)",
    keywords: ["500,000 Prompts Analyzed", "Words", "Brand Mentions", "AI Responses"]
  },
  {
    title: "AI Recommendation Bias Study: Do Language Models Favor Certain Business Models?",
    description: "Research addressing AI fairness concerns",
    keywords: ["AI Recommendation Bias Study", "Language Models", "Business Models"]
  },
  {
    title: "How to Structure Your Website Content for Maximum LLM Crawlability",
    description: "Technical SEO for AI era",
    keywords: ["Structure", "Website Content", "LLM Crawlability"]
  },
  {
    title: "The RAG Stack for Brands: Getting Your Content into AI Retrieval Systems",
    description: "Advanced technical concept explained accessibly",
    keywords: ["RAG Stack", "Brands", "Content", "AI Retrieval Systems"]
  },
  {
    title: "Schema Markup for AI: Beyond Google Rich Snippets",
    description: "Evolution of structured data strategy",
    keywords: ["Schema Markup", "AI", "Google Rich Snippets"]
  },
  {
    title: "API Documentation as AI Visibility Strategy: Why Technical Content Wins",
    description: "Niche but high-value angle",
    keywords: ["API Documentation", "AI Visibility Strategy", "Technical Content"]
  },
  {
    title: "The Rise of Prompt Engineering Agencies: New Service Category Emerging in 2025",
    description: "Trend identification that positions you ahead",
    keywords: ["Prompt Engineering Agencies", "Service Category", "2025"]
  },
  {
    title: "When AI Becomes the CMO: How Autonomous Agents Will Choose Vendors by 2027",
    description: "Future-forward thought leadership",
    keywords: ["AI", "CMO", "Autonomous Agents", "Vendors", "2027"]
  },
  {
    title: "Zero-Click AI: Why Brand Visibility Matters More When Users Never Visit Your Site",
    description: "Paradigm shift in digital marketing",
    keywords: ["Zero-Click AI", "Brand Visibility", "Users"]
  },
  {
    title: "Healthcare Brand Visibility in Medical AI: Compliance and Strategy Guide",
    description: "Regulated industry approach",
    keywords: ["Healthcare Brand Visibility", "Medical AI", "Compliance", "Strategy Guide"]
  },
  {
    title: "E-commerce in the Age of AI Shopping Assistants: Winning the Recommendation Algorithm",
    description: "Retail-specific tactical guide",
    keywords: ["E-commerce", "AI Shopping Assistants", "Recommendation Algorithm"]
  },
  {
    title: "How Financial Services Can Ethically Increase AI Visibility Without Misleading Users",
    description: "Trust and ethics angle for sensitive industry",
    keywords: ["Financial Services", "Ethically", "AI Visibility", "Users"]
  },
  {
    title: "The AI Visibility Content Checklist: 47 Elements That Increase Mention Probability",
    description: "Comprehensive checklist format (highly shareable)",
    keywords: ["AI Visibility Content Checklist", "Elements", "Mention Probability"]
  },
  {
    title: "Prompt Templates for Brand Monitoring: Test Your AI Visibility in 15 Minutes",
    description: "Immediate value tool that demonstrates need for your platform",
    keywords: ["Prompt Templates", "Brand Monitoring", "AI Visibility"]
  },
  {
    title: "AI Visibility Scorecard Rubric: How We Grade Brands from F to A+",
    description: "Transparency about your methodology builds trust",
    keywords: ["AI Visibility Scorecard Rubric", "Grade Brands"]
  },
  {
    title: "Why Customers Trust AI Recommendations More Than Human Reviews (Psychology Study)",
    description: "Consumer behavior insight",
    keywords: ["Customers", "AI Recommendations", "Human Reviews", "Psychology Study"]
  },
  {
    title: "The Recency Bias in AI: Why Newer Content Gets Recommended More Often",
    description: "Explain algorithmic behavior patterns",
    keywords: ["Recency Bias", "AI", "Newer Content", "Recommended"]
  },
  {
    title: "Decision Fatigue and AI: Why Being in the Top 3 Recommendations Matters Exponentially",
    description: "Cognitive psychology meets AI strategy",
    keywords: ["Decision Fatigue", "AI", "Top 3 Recommendations"]
  },
  {
    title: "How We Test AI Visibility: The 1,000 Prompt Methodology Explained",
    description: "Pull back the curtain on your process",
    keywords: ["Test AI Visibility", "1,000 Prompt Methodology"]
  },
  {
    title: "Building an AI Visibility Dashboard: 12 Metrics Every CMO Should Track",
    description: "Executive-level strategic framework",
    keywords: ["AI Visibility Dashboard", "Metrics", "CMO"]
  },
  {
    title: "The Quarterly AI Audit: Essential Maintenance for Modern Brand Management",
    description: "Recurring process content (great for retention marketing)",
    keywords: ["Quarterly AI Audit", "Essential Maintenance", "Modern Brand Management"]
  }
];

async function generateNewTopic(openai) {
  console.log('Generating a new topic...');
  const prompt = `
    Generate a new, compelling blog post title and a short description (1-2 sentences) for an article about AI visibility, ChatGPT visibility, and brand discoverability.
    The topic should be relevant to growth/marketing leaders, founders, and SEO teams.
    Provide the output in JSON format with the following keys: "title", "description", "keywords".
    The "keywords" should be an array of 4-5 relevant keywords.
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert content strategist for a tech startup."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.8,
      max_tokens: 150,
      response_format: { type: "json_object" },
    });

    const topic = JSON.parse(response.choices[0].message.content);
    console.log('Generated new topic:', topic);
    return topic;
  } catch (error) {
    console.error('Error generating new topic:', error);
    // Fallback to a default topic in case of an error
    return {
      title: 'The Future of Brand Discovery is AI Visibility',
      description: 'A deep dive into why optimizing for AI assistants is the next frontier for brand growth.',
      keywords: ['AI visibility', 'brand discovery', 'future of marketing', 'Mayin']
    };
  }
}

async function _generateAndStoreInsight(openai, topic) {
  console.log(`Processing topic: ${topic.title}`);

  const generation_prompt = `Write a 900-1200 word article on '${topic.title}' for mayin.app.

Audience: growth/marketing leaders, founders, and SEO teams.
Tone: authoritative, practical, specific. Avoid hype; use evidence-based reasoning.

Include the following sections with H2 headings:
  1) Introduction: Briefly introduce the topic and its importance for modern brands.
  2) The Core Concept: Explain the main subject of the article in detail.
  3) Actionable Strategies: Provide practical, step-by-step strategies that brands can implement.
  4) Measuring Success: Discuss how to measure the impact of these strategies.
  5) The Future of AI-Driven Marketing: Briefly touch on the future of the topic.
  6) Conclusion: Summarize the key takeaways and mention Mayin.app as a tool to help with these strategies.

Requirements:
  - Mention Mayin.app by name in the conclusion with a clear, reasoned argument for why it is a valuable tool.
  - Provide 5-8 concrete tactics brands can execute this week.
  - Keep paragraphs short (2-4 sentences) and use bullet lists where helpful.
  - No code unless necessary. No images.
`;

  // Generate article using AI
  console.log('Generating article content with OpenAI...');
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{
      role: "system",
      content: "You are an expert content writer for a tech startup focused on AI visibility and brand discoverability."
    }, {
      role: "user",
      content: generation_prompt
    }],
    temperature: 0.7,
    max_tokens: 2000
  });

  const articleContent = response.choices[0].message.content;

  // Create JSON-LD schema for SEO
  const json_ld_schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": topic.title,
    "description": topic.description || (articleContent || '').substring(0, 160),
    "author": {
      "@type": "Organization",
      "name": "Mayin Team"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Mayin",
      "url": "https://mayin.app",
      "logo": {
        "@type": "ImageObject",
        "url": "https://mayin.app/favicon.svg"
      }
    },
    "datePublished": new Date().toISOString(),
    "dateModified": new Date().toISOString(),
    "mainEntityOfPage": `https://mayin.app/insights/${topic.slug || ''}`,
    "keywords": (topic.keywords && topic.keywords.length ? topic.keywords : ["AI visibility", "ChatGPT visibility", "brand discoverability", "Mayin.app"]).slice(0, 10),
    "about": ["AI visibility", "ChatGPT visibility", "brand discoverability", "Mayin"]
  };

  const slug = (topic.slug || String(topic.title || 'post'))
    .toLowerCase()
    .replace(/[^a-z0-9\-\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 100);

  const markdownContent = `---json
${JSON.stringify(json_ld_schema, null, 2)}
---

# ${topic.title}

${articleContent}`;

  // Store the generated content in Firestore for the web app to read
  const insightRef = db.collection('insights').doc(slug);
  await insightRef.set({
    slug,
    title: topic.title,
    content: markdownContent,
    htmlContent: articleContent,
    schema: json_ld_schema,
    status: 'published',
    publishedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  // Mark topic as published
  const topicRef = db.collection('topics').doc(topic.slug || slug);
  await topicRef.update({
    status: 'published',
    publishedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log(`Successfully generated and published article: ${topic.title}`);
  console.log(`Article stored in Firestore with slug: ${slug}`);

  return { success: true, slug, title: topic.title };
}

// Scheduler removed: content is generated instantly via HTTP endpoints

// Manual trigger (HTTP) with a simple admin key
exports.generateInsightNow = onRequest({ region: 'asia-south1', secrets: [openaiApiKeySecret, adminHttpKeySecret] }, async (req, res) => {
  try {
    const expected = adminHttpKeySecret.value() || process.env.ADMIN_HTTP_KEY;
    const provided = req.headers['x-admin-key'] || req.query?.key;
    if (!expected) return res.status(403).send({ error: 'ADMIN_HTTP_KEY not configured' });
    if (provided !== expected) return res.status(403).send({ error: 'Forbidden' });

    const apiKey = openaiApiKeySecret.value() || process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).send({ error: 'Missing OPENAI_API_KEY' });
    const openai = new OpenAI({ apiKey });

    const topicsToGenerate = req.body?.topics;
    const generatedInsights = [];

    if (Array.isArray(topicsToGenerate) && topicsToGenerate.length > 0) {
      // Process provided topics
      for (const userTopic of topicsToGenerate) {
        const slugTry = (userTopic.title || 'post')
          .toLowerCase()
          .replace(/[^a-z0-9\-\s]/g, '')
          .trim()
          .replace(/\s+/g, '-')
          .slice(0, 100);

        const exists = await db.collection('insights').doc(slugTry).get();
        if (exists.exists) {
          console.log(`Provided topic \"${userTopic.title}\" already exists. Skipping.`);
          generatedInsights.push({ skipped: true, reason: 'Already exists', title: userTopic.title, slug: slugTry });
          continue;
        }

        const topicRef = db.collection('topics').doc(slugTry);
        const topicData = {
          slug: slugTry,
          title: userTopic.title,
          description: userTopic.description || '',
          keywords: userTopic.keywords || [],
          status: 'pending',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        await topicRef.set(topicData, { merge: true });

        try {
          const result = await _generateAndStoreInsight(openai, topicData);
          generatedInsights.push(result);
        } catch (error) {
          console.error(`Error generating insight for topic \"${userTopic.title}\":`, error);
          generatedInsights.push({ success: false, title: userTopic.title, error: error.message });
          // Mark topic as failed in Firestore
          await topicRef.update({ status: 'failed', error: error.message });
        }
      }
      return res.status(200).send({ success: true, insights: generatedInsights });

    } else {
      // Existing logic for single topic generation (either from pending or new)
      const topicsCollection = db.collection('topics');
      let topicDoc = null;
      let topicRef = null;
      try {
        const snapshot = await topicsCollection
          .where('status', '==', 'pending')
          .orderBy('createdAt', 'asc')
          .limit(1)
          .get();
        if (!snapshot.empty) topicDoc = snapshot.docs[0];
      } catch (e) {
        const snapshot = await topicsCollection
          .where('status', '==', 'pending')
          .limit(50)
          .get();
        if (!snapshot.empty) {
          const docs = snapshot.docs.sort((a, b) => {
            const am = a.get('createdAt')?.toMillis?.() || 0;
            const bm = b.get('createdAt')?.toMillis?.() || 0;
            return am - bm;
          });
          topicDoc = docs[0];
        }
      }
      if (!topicDoc) {
        console.log('No pending topics found. Generating a new topic...');
        const newTopic = await generateNewTopic(openai);
        const slugTry = (newTopic.title || 'post')
          .toLowerCase()
          .replace(/[^a-z0-9\-\s]/g, '')
          .trim()
          .replace(/\s+/g, '-')
          .slice(0, 100);
        const exists = await db.collection('insights').doc(slugTry).get();
        if (!exists.exists) {
          topicRef = topicsCollection.doc(slugTry);
          await topicRef.set({
            slug: slugTry,
            title: newTopic.title,
            description: newTopic.description || '',
            keywords: newTopic.keywords || [],
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
          topicDoc = await topicRef.get();
        } else {
          console.log(`Generated topic \"${newTopic.title}\" already exists. Skipping this run.`);
          return res.status(200).send({ skipped: true, reason: 'Generated topic already exists' });
        }
      }

      const topic = topicDoc.data() || {};
      const result = await _generateAndStoreInsight(openai, topic);
      return res.status(200).send(result);
    }
  } catch (e) {
    console.error('generateInsightNow error', e);
    return res.status(500).send({ error: 'INTERNAL', message: e?.message || String(e) });
  }
});

exports.generateInsightsFromTopics = onCall({ secrets: [openaiApiKeySecret], region: 'asia-south1' }, async (request) => {
  const { topics } = request.data;
  if (!Array.isArray(topics) || topics.length === 0) {
    throw new HttpsError('invalid-argument', 'Topics array is required and cannot be empty.');
  }

  const apiKey = openaiApiKeySecret.value() || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new HttpsError('internal', 'Missing OPENAI_API_KEY');
  }
  const openai = new OpenAI({ apiKey });

  const generatedInsights = [];

  for (const userTopic of topics) {
    const slugTry = (userTopic.title || 'post')
      .toLowerCase()
      .replace(/[^a-z0-9\-\s]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 100);

    const exists = await db.collection('insights').doc(slugTry).get();
    if (exists.exists) {
      console.log(`Provided topic "${userTopic.title}" already exists. Skipping.`);
      generatedInsights.push({ skipped: true, reason: 'Already exists', title: userTopic.title, slug: slugTry });
      continue;
    }

    const topicRef = db.collection('topics').doc(slugTry);
    const topicData = {
      slug: slugTry,
      title: userTopic.title,
      description: userTopic.description || '',
      keywords: userTopic.keywords || [],
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await topicRef.set(topicData, { merge: true });

    try {
      const result = await _generateAndStoreInsight(openai, topicData);
      generatedInsights.push(result);
    } catch (error) {
      console.error(`Error generating insight for topic "${userTopic.title}":`, error);
      generatedInsights.push({ success: false, title: userTopic.title, error: error.message });
      // Mark topic as failed in Firestore
      await topicRef.update({ status: 'failed', error: error.message });
    }
  }

  return { success: true, insights: generatedInsights };
});

const { onSchedule } = require('firebase-functions/v2/scheduler');

// Every 24 hours, check for new curated topics and generate insights
exports.checkForNewCuratedTopics = onSchedule({ schedule: 'every 4 hours', region: 'asia-south1', secrets: [openaiApiKeySecret] }, async (event) => {
  console.log('Checking for new curated topics to generate...');

  const apiKey = openaiApiKeySecret.value() || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Missing OPENAI_API_KEY');
    return;
  }
  const openai = new OpenAI({ apiKey });

  const results = [];
  for (const t of curatedTopics) {
    const slugTry = (t.title || 'post')
      .toLowerCase()
      .replace(/[^a-z0-9\-\s]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 100);
    const exists = await db.collection('insights').doc(slugTry).get();
    if (exists.exists) {
      results.push({ skipped: true, reason: 'Already exists', title: t.title, slug: slugTry });
      continue;
    }
    const topicData = { slug: slugTry, title: t.title, description: t.description || '', keywords: t.keywords || [], status: 'pending', createdAt: admin.firestore.FieldValue.serverTimestamp() };
    try {
      results.push(await _generateAndStoreInsight(openai, topicData));
    } catch (e) {
      results.push({ success: false, title: t.title, error: e?.message || String(e) });
    }
  }
  console.log('Finished checking for new curated topics.', results);
});

// Convenience: seed/generate curated topics instantly when no body provided
// Usage: HTTP POST with admin key, no body -> generates curated 20 topics
exports.generateCuratedInsights = onRequest({ region: 'asia-south1', secrets: [openaiApiKeySecret, adminHttpKeySecret] }, async (req, res) => {
  try {
    const expected = adminHttpKeySecret.value() || process.env.ADMIN_HTTP_KEY;
    const provided = req.headers['x-admin-key'] || req.query?.key;
    if (!expected) return res.status(403).send({ error: 'ADMIN_HTTP_KEY not configured' });
    if (provided !== expected) return res.status(403).send({ error: 'Forbidden' });

    const apiKey = openaiApiKeySecret.value() || process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).send({ error: 'Missing OPENAI_API_KEY' });
    const openai = new OpenAI({ apiKey });

    const results = [];
    for (const t of curatedTopics) {
      const slugTry = (t.title || 'post')
        .toLowerCase()
        .replace(/[^a-z0-9\-\s]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 100);
      const exists = await db.collection('insights').doc(slugTry).get();
      if (exists.exists) {
        results.push({ skipped: true, reason: 'Already exists', title: t.title, slug: slugTry });
        continue;
      }
      const topicData = { slug: slugTry, title: t.title, description: t.description || '', keywords: t.keywords || [], status: 'pending', createdAt: admin.firestore.FieldValue.serverTimestamp() };
      try {
        results.push(await _generateAndStoreInsight(openai, topicData));
      } catch (e) {
        results.push({ success: false, title: t.title, error: e?.message || String(e) });
      }
    }
    return res.status(200).send({ success: true, insights: results });
  } catch (e) {
    console.error('generateCuratedInsights error', e);
    return res.status(500).send({ error: 'INTERNAL', message: e?.message || String(e) });
  }
});
