# Mayin — ChatGPT Visibility Scanner (Backend)

Firebase Cloud Functions backend for **Mayin**'s ChatGPT-visibility scanner: runs the
actual scans, handles billing, and generates content. Pairs with the frontend at
[MayinAI/chatGPT-vi-front-](https://github.com/MayinAI/chatGPT-vi-front-).

This is an earlier, self-hosted iteration of Mayin's ChatGPT-visibility work, open-sourced
as-is.

## What it does

- **Visibility scanning** (`startVisibilityScanV2`, `startVisibilityScanHttp`) — runs a
  brand + category + location through OpenAI (GPT-4o / GPT-4o-mini) across a set of buyer
  prompts and scores how often the brand is mentioned against competitors
- **`findVisibilityReasons`** — diagnoses *why* a brand isn't mentioned more and suggests
  fixes, with an optional Perplexity fallback for source grounding
- **Billing** — Stripe checkout, one-time purchases, customer portal, and webhook handling
  (`createStripeCheckoutSession`, `createStripeOneTimeCheckout`,
  `createStripePortalSession`, `handleStripeWebhook`); legacy Razorpay subscription/order
  flow kept alongside it (`createRazorpaySubscription`, `razorpayWebhook`, etc.)
- **Content generation** (`blog-generator.js`) — generates and curates insight articles
- Firestore collections: `users`, `scans`, `reports`, `aiCache` (cached model answers),
  `visibilityDiagnostics` (cached "why aren't we mentioned" results, 7-day TTL)

## Stack

- **Platform**: Firebase Cloud Functions (Node.js 22, region `asia-south1`)
- **Database**: Cloud Firestore
- **AI**: OpenAI GPT-4o / GPT-4o-mini, optional Perplexity for diagnostics
- **Payments**: Stripe (primary), Razorpay (legacy)

## Setup

```bash
cd functions && npm install
firebase login
firebase use <your-project-id>

firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
# Razorpay secrets only if you're keeping the legacy flow

npm run deploy:production
```

Copy `.env.example` / `functions/.env.example` for the full list of expected variables.
Secrets are meant to live in Google Cloud Secret Manager in production, never committed —
see `env.production.template`.

## Where this leads

The GEO (generative engine optimization) idea behind this tool continues in
**[Mayin](https://mayin.app)** — now a Telegram bot instead of a dashboard. Give it a brand
and a category and it sends back a source map: every page AI models actually cite when
answering a buying question in that category, ranked by frequency, for a one-time $49.
No account, no subscription — the map itself is reproducible, so trust comes from being
able to run it again, not from a login-gated score.
