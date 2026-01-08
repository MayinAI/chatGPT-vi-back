const { initializeApp } = require('firebase/app');
const { getFunctions, httpsCallable } = require('firebase/functions');

// Firebase configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app, 'asia-south1');

// Test environment variables access
async function testEnvironmentVariables() {
  console.log('🧪 Testing Environment Variables Access...\n');

  try {
    // Create a simple test function call to check environment variables
    const testRazorpayIntegration = httpsCallable(functions, 'testRazorpayIntegration');
    
    console.log('📞 Calling testRazorpayIntegration function...');
    console.log('💡 This will show us if the environment variables are accessible');
    
    const result = await testRazorpayIntegration();
    const response = result.data;

    console.log('✅ Response received:');
    console.log(JSON.stringify(response, null, 2));

  } catch (error) {
    console.error('❌ Error details:');
    console.error('Code:', error.code);
    console.error('Message:', error.message);
    console.error('Details:', error.details);
    
    if (error.message.includes('key_id')) {
      console.log('\n🔍 ANALYSIS:');
      console.log('The error indicates that Razorpay key_id is missing.');
      console.log('This means the environment variables are not set in the deployed functions.');
      console.log('');
      console.log('💡 SOLUTIONS:');
      console.log('1. Set environment variables through Google Cloud Console');
      console.log('2. Use Firebase Secret Manager (if available)');
      console.log('3. Set environment variables in the function deployment');
      console.log('');
      console.log('🌐 Google Cloud Console:');
      console.log('https://console.cloud.google.com/functions/list?project=mayin-d52c6');
    }
  }
}

// Run the test
testEnvironmentVariables().catch(console.error);
