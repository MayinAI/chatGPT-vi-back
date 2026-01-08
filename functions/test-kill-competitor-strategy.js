
const { initializeApp } = require('firebase/app');
const { getFunctions, httpsCallable } = require('firebase/functions');

// Firebase configuration (replace with your actual config)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "mayin-d52c6.firebaseapp.com",
  projectId: "mayin-d52c6",
  storageBucket: "mayin-d52c6.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app, 'asia-south1');

// Test the "Kill Your Competitor" strategy generator
async function testKillCompetitorStrategy() {
  console.log('🚀 Testing "Kill Your Competitor" Strategy Generation...');

  try {
    const testData = {
      brandName: "Mayin",
      competitorName: "CompetitorX"
    };

    console.log('📋 Test Data:');
    console.log(JSON.stringify(testData, null, 2));
    console.log('\n' + '='.repeat(80) + '\n');

    const generateStrategy = httpsCallable(functions, 'generateKillYourCompetitorStrategy');
    
    console.log('🤖 Generating Strategy...');
    
    const result = await generateStrategy(testData);
    const response = result.data;

    if (response.success) {
      console.log('✅ Strategy Generated Successfully!');
      console.log('\n' + '='.repeat(80));
      console.log('🎯 KILL YOUR COMPETITOR STRATEGY');
      console.log('='.repeat(80));
      console.log(JSON.stringify(response.strategy, null, 2));
    } else {
      console.log('❌ Failed to generate strategy:');
      console.log(response.error || 'Unknown error');
    }
    
  } catch (error) {
    console.error('💥 Error testing strategy generation:');
    console.error(error.message);
  }
}

// Run the test
testKillCompetitorStrategy();
