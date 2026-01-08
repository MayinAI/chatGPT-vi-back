// const admin = require('firebase-admin');

// // Initialize Firebase Admin SDK
// // IMPORTANT: This script requires a service account key file.
// // You will need to download your own service account key from the Firebase console
// // and place it in the same directory as this script.
// // For more information, see: https://firebase.google.com/docs/admin/setup
// const serviceAccount = require('./serviceAccountKey.json');

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
//   projectId: 'onegoal1crore-ai',
//   databaseURL: 'https://onegoal1crore-ai.firebaseio.com'
// });

const db = admin.firestore();

async function clearAllCampaigns() {
  try {
    console.log('🗑️  Starting campaign cleanup...');
    
    // Get all campaigns from brandCampaigns collection
    const campaignsSnapshot = await db.collection('brandCampaigns').get();
    
    if (campaignsSnapshot.empty) {
      console.log('✅ No campaigns found to delete');
      return;
    }
    
    console.log(`📊 Found ${campaignsSnapshot.size} campaigns to delete`);
    
    // Delete each campaign
    const deletePromises = campaignsSnapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(deletePromises);
    
    console.log('✅ Successfully deleted all campaigns');
    console.log('🎉 You can now start fresh with new campaigns!');
    
  } catch (error) {
    console.error('❌ Error clearing campaigns:', error);
  } finally {
    process.exit(0);
  }
}

// Run the cleanup
clearAllCampaigns();
