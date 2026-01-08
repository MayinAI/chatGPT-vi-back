const { initializeApp } = require('firebase/app');
const { getFunctions, httpsCallable } = require('firebase/functions');

// Firebase configuration
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

// Test simple Razorpay config access
async function testSimpleRazorpayConfig() {
  console.log('🧪 Testing Simple Razorpay Config Access...\n');

  try {
    const getRazorpayConfig = httpsCallable(functions, 'getRazorpayConfig');
    
    console.log('📞 Calling getRazorpayConfig function...');
    const result = await getRazorpayConfig();
    const response = result.data;

    console.log('✅ Response received:');
    console.log(JSON.stringify(response, null, 2));

    if (response.keyId) {
      console.log('\n🎉 Razorpay Key ID is accessible!');
      console.log(`Key ID: ${response.keyId}`);
      console.log(`Environment: ${response.environment}`);
    } else {
      console.log('\n❌ No key ID found in response');
    }

  } catch (error) {
    console.error('❌ Error testing Razorpay config:', error);
    if (error.code === 'functions/unavailable') {
      console.log('💡 Make sure Firebase Functions are deployed and accessible');
    }
  }
}

// Run the test
testSimpleRazorpayConfig().catch(console.error);
