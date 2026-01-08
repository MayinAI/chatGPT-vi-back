const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const exampleTopics = [
  {
    title: "How ChatGPT search is changing brand discovery",
    keywords: ["ChatGPT search", "brand discovery", "AI search"],
    slug: "chatgpt-search-brand-discovery",
    status: "pending",
    publishedAt: null
  },
  {
    title: "LLM visibility: the new SEO frontier",
    keywords: ["LLM visibility", "SEO", "AI optimization"],
    slug: "llm-visibility-new-seo-frontier",
    status: "pending",
    publishedAt: null
  },
  {
    title: "AI visibility tools every startup should know",
    keywords: ["AI visibility tools", "startup marketing", "AI marketing"],
    slug: "ai-visibility-tools-for-startups",
    status: "pending",
    publishedAt: null
  },
  {
    title: "How Mayin helps brands appear in AI search",
    keywords: ["Mayin", "AI search", "brand visibility"],
    slug: "how-mayin-helps-brands-in-ai-search",
    status: "pending",
    publishedAt: null
  }
];

async function setupBlogTopics() {
  const topicsCollection = db.collection('topics');

  for (const topic of exampleTopics) {
    const topicRef = topicsCollection.doc(topic.slug);
    const doc = await topicRef.get();

    if (!doc.exists) {
      await topicRef.set(topic);
      console.log(`Added topic: ${topic.title}`);
    } else {
      console.log(`Topic already exists: ${topic.title}`);
    }
  }
}

setupBlogTopics().then(() => {
  console.log('Blog topics setup complete.');
  process.exit(0);
}).catch(error => {
  console.error('Error setting up blog topics:', error);
  process.exit(1);
});
