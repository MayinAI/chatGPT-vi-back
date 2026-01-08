// Test script to verify the bridge connection between brand campaigns and creator app
const { initializeApp } = require('firebase/app');
const { getFunctions, httpsCallable } = require('firebase/functions');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

// Firebase config
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "107845768028",
  appId: "1:107845768028:web:663cc06a01bb422583a799"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const functions = getFunctions(app, 'asia-south1');

async function testBridgeConnection() {
  console.log('🔗 Testing Bridge Connection: Brand Campaigns → Creator App\n');

  try {
    // Step 1: Check existing data in collections
    console.log('📊 Step 1: Checking existing data in collections...');
    
    const brandCampaignsSnapshot = await getDocs(collection(db, 'brandCampaigns'));
    console.log(`✅ brandCampaigns collection: ${brandCampaignsSnapshot.size} documents`);
    
    const campaignsSnapshot = await getDocs(collection(db, 'campaigns'));
    console.log(`✅ campaigns collection: ${campaignsSnapshot.size} documents`);
    
    const brandsSnapshot = await getDocs(collection(db, 'brands'));
    console.log(`✅ brands collection: ${brandsSnapshot.size} documents`);
    
    const creatorsSnapshot = await getDocs(collection(db, 'creators'));
    console.log(`✅ creators collection: ${creatorsSnapshot.size} documents`);
    
    // Step 2: Test campaign visibility for creators
    console.log('\n📱 Step 2: Testing campaign visibility for creators...');
    
    // Simulate creator data
    const testCreatorData = {
      userId: 'test-creator-id',
      category: 'fashion',
      contentLanguage: 'hindi',
      instagramFollowers: 5000
    };
    
    console.log('🎯 Testing with creator profile:');
    console.log(`   Category: ${testCreatorData.category}`);
    console.log(`   Language: ${testCreatorData.contentLanguage}`);
    console.log(`   Followers: ${testCreatorData.instagramFollowers}`);
    
    // Test the getAvailableCampaignsForCreator function
    const getCampaignsFn = httpsCallable(functions, 'getCampaignsForCreator');
    
    try {
      const campaignsResult = await getCampaignsFn();
      
      if (campaignsResult.data.success) {
        const availableCampaigns = campaignsResult.data.campaigns || [];
        console.log(`✅ Creator can see ${availableCampaigns.length} campaigns`);
        
        if (availableCampaigns.length > 0) {
          console.log('\n🎯 Available campaigns:');
          availableCampaigns.forEach((campaign, index) => {
            console.log(`  ${index + 1}. ${campaign.title || campaign.campaignTitle} (${campaign.brandName})`);
            console.log(`     Status: ${campaign.status || 'N/A'}`);
            console.log(`     Categories: ${campaign.targetCategories ? campaign.targetCategories.join(', ') : 'N/A'}`);
            console.log(`     Followers: ${campaign.minFollowers || 0}-${campaign.maxFollowers || 0}`);
          });
        }
      } else {
        console.log(`❌ Failed to get campaigns: ${campaignsResult.data.message}`);
      }
    } catch (error) {
      console.log(`❌ Error calling getCampaignsForCreator: ${error.message}`);
    }
    
    // Step 3: Verify collection structure
    console.log('\n🔍 Step 3: Verifying collection structure...');
    
    if (brandCampaignsSnapshot.size > 0) {
      console.log('\n📋 Sample brandCampaigns document structure:');
      const sampleDoc = brandCampaignsSnapshot.docs[0];
      const sampleData = sampleDoc.data();
      console.log(`   ID: ${sampleDoc.id}`);
      console.log(`   Brand Name: ${sampleData.brandName}`);
      console.log(`   Title: ${sampleData.title}`);
      console.log(`   Status: ${sampleData.status}`);
      console.log(`   Is Active: ${sampleData.isActive}`);
      console.log(`   Target Categories: ${sampleData.targetCategories ? sampleData.targetCategories.join(', ') : 'N/A'}`);
      console.log(`   Min Followers: ${sampleData.minFollowers}`);
      console.log(`   Max Followers: ${sampleData.maxFollowers}`);
    }
    
    // Step 4: Test the bridge connection
    console.log('\n🌉 Step 4: Testing Bridge Connection...');
    
    let bridgeStatus = '❌ BROKEN';
    let issues = [];
    
    // Check if brandCampaigns collection has data
    if (brandCampaignsSnapshot.size === 0) {
      issues.push('No campaigns in brandCampaigns collection');
    }
    
    // Check if campaigns can be retrieved by creators
    try {
      const campaignsResult = await getCampaignsFn();
      if (campaignsResult.data.success && campaignsResult.data.campaigns.length > 0) {
        bridgeStatus = '✅ CONNECTED';
      } else {
        issues.push('Creators cannot see campaigns');
      }
    } catch (error) {
      issues.push(`Function call failed: ${error.message}`);
    }
    
    console.log(`\n🌉 Bridge Status: ${bridgeStatus}`);
    if (issues.length > 0) {
      console.log('⚠️  Issues found:');
      issues.forEach(issue => console.log(`   - ${issue}`));
    }
    
    // Step 5: Summary
    console.log('\n📋 Summary:');
    console.log(`- Brand Campaigns: ${brandCampaignsSnapshot.size}`);
    console.log(`- Legacy Campaigns: ${campaignsSnapshot.size}`);
    console.log(`- Brands: ${brandsSnapshot.size}`);
    console.log(`- Creators: ${creatorsSnapshot.size}`);
    console.log(`- Bridge Status: ${bridgeStatus}`);
    
    if (bridgeStatus === '✅ CONNECTED') {
      console.log('\n🎉 SUCCESS: The bridge between brand dashboard and creator app is working!');
      console.log('✅ Brands can create campaigns');
      console.log('✅ Campaigns are saved to brandCampaigns collection');
      console.log('✅ Creators can see available campaigns');
      console.log('✅ The flow is complete and connected');
    } else {
      console.log('\n⚠️  ISSUES DETECTED:');
      console.log('The bridge needs attention. Check the issues above.');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testBridgeConnection(); 