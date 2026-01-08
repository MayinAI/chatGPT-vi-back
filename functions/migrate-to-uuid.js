const admin = require("firebase-admin");
const crypto = require("crypto");

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Generate a deterministic UUID based on phone number and userId
 * @param {string} phoneNumber - User's phone number
 * @param {string} userId - Firebase Auth UID
 * @return {string} Deterministic UUID string
 */
function generateDeterministicUUID(phoneNumber, userId) {
  // Create a hash from phone number + userId for consistency
  const hash = crypto.createHash('sha256');
  hash.update(phoneNumber + userId);
  const hashHex = hash.digest('hex');
  
  // Convert hash to UUID format (version 5)
  return [
    hashHex.substring(0, 8),
    hashHex.substring(8, 12),
    '5' + hashHex.substring(13, 16),
    hashHex.substring(16, 18),
    hashHex.substring(18, 30)
  ].join('-');
}

/**
 * Migrate creators collection from phone number to UUID
 */
async function migrateCreators() {
  console.log("Starting creators migration...");
  
  try {
    const creatorsSnapshot = await db.collection("creators").get();
    let migratedCount = 0;
    let errorCount = 0;
    
    for (const doc of creatorsSnapshot.docs) {
      try {
        const creatorData = doc.data();
        const phoneNumber = creatorData.contactPhone;
        const userId = creatorData.userId;
        
        if (!phoneNumber || !userId) {
          console.log(`Skipping creator ${doc.id}: missing phone or userId`);
          continue;
        }
        
        // Generate UUID
        const creatorUUID = generateDeterministicUUID(phoneNumber, userId);
        
        // Create new document with UUID
        const newCreatorRef = db.collection("creators").doc(creatorUUID);
        await newCreatorRef.set({
          ...creatorData,
          creatorId: creatorUUID,
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          originalDocId: doc.id
        });
        
        // Update user document
        await db.collection("users").doc(userId).update({
          creatorProfileId: creatorUUID,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Delete old document
        await doc.ref.delete();
        
        migratedCount++;
        console.log(`Migrated creator: ${doc.id} -> ${creatorUUID}`);
        
      } catch (error) {
        errorCount++;
        console.error(`Error migrating creator ${doc.id}:`, error);
      }
    }
    
    console.log(`Creators migration completed: ${migratedCount} migrated, ${errorCount} errors`);
    
  } catch (error) {
    console.error("Error in creators migration:", error);
  }
}

/**
 * Migrate campaign applications collection
 */
async function migrateCampaignApplications() {
  console.log("Starting campaign applications migration...");
  
  try {
    const applicationsSnapshot = await db.collection("campaignApplications").get();
    let migratedCount = 0;
    let errorCount = 0;
    
    for (const doc of applicationsSnapshot.docs) {
      try {
        const appData = doc.data();
        const phoneNumber = appData.contactPhone;
        const userId = appData.userId;
        
        if (!phoneNumber || !userId) {
          console.log(`Skipping application ${doc.id}: missing phone or userId`);
          continue;
        }
        
        // Generate UUID
        const appUUID = generateDeterministicUUID(phoneNumber, userId);
        
        // Create new document with UUID
        const newAppRef = db.collection("campaignApplications").doc(appUUID);
        await newAppRef.set({
          ...appData,
          applicationId: appUUID,
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          originalDocId: doc.id
        });
        
        // Delete old document
        await doc.ref.delete();
        
        migratedCount++;
        console.log(`Migrated application: ${doc.id} -> ${appUUID}`);
        
      } catch (error) {
        errorCount++;
        console.error(`Error migrating application ${doc.id}:`, error);
      }
    }
    
    console.log(`Applications migration completed: ${migratedCount} migrated, ${errorCount} errors`);
    
  } catch (error) {
    console.error("Error in applications migration:", error);
  }
}

/**
 * Migrate campaign submissions collection
 */
async function migrateCampaignSubmissions() {
  console.log("Starting campaign submissions migration...");
  
  try {
    const submissionsSnapshot = await db.collection("campaignSubmissions").get();
    let migratedCount = 0;
    let errorCount = 0;
    
    for (const doc of submissionsSnapshot.docs) {
      try {
        const subData = doc.data();
        const phoneNumber = subData.contactPhone;
        const userId = subData.userId;
        
        if (!phoneNumber || !userId) {
          console.log(`Skipping submission ${doc.id}: missing phone or userId`);
          continue;
        }
        
        // Generate UUID
        const subUUID = generateDeterministicUUID(phoneNumber, userId);
        
        // Create new document with UUID
        const newSubRef = db.collection("campaignSubmissions").doc(subUUID);
        await newSubRef.set({
          ...subData,
          submissionId: subUUID,
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          originalDocId: doc.id
        });
        
        // Delete old document
        await doc.ref.delete();
        
        migratedCount++;
        console.log(`Migrated submission: ${doc.id} -> ${subUUID}`);
        
      } catch (error) {
        errorCount++;
        console.error(`Error migrating submission ${doc.id}:`, error);
      }
    }
    
    console.log(`Submissions migration completed: ${migratedCount} migrated, ${errorCount} errors`);
    
  } catch (error) {
    console.error("Error in submissions migration:", error);
  }
}

/**
 * Migrate video submissions collection
 */
async function migrateVideoSubmissions() {
  console.log("Starting video submissions migration...");
  
  try {
    const videosSnapshot = await db.collection("videoSubmissions").get();
    let migratedCount = 0;
    let errorCount = 0;
    
    for (const doc of videosSnapshot.docs) {
      try {
        const videoData = doc.data();
        const phoneNumber = videoData.contactPhone;
        const userId = videoData.userId;
        
        if (!phoneNumber || !userId) {
          console.log(`Skipping video submission ${doc.id}: missing phone or userId`);
          continue;
        }
        
        // Generate UUID
        const videoUUID = generateDeterministicUUID(phoneNumber, userId);
        
        // Create new document with UUID
        const newVideoRef = db.collection("videoSubmissions").doc(videoUUID);
        await newVideoRef.set({
          ...videoData,
          submissionId: videoUUID,
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          originalDocId: doc.id
        });
        
        // Delete old document
        await doc.ref.delete();
        
        migratedCount++;
        console.log(`Migrated video submission: ${doc.id} -> ${videoUUID}`);
        
      } catch (error) {
        errorCount++;
        console.error(`Error migrating video submission ${doc.id}:`, error);
      }
    }
    
    console.log(`Video submissions migration completed: ${migratedCount} migrated, ${errorCount} errors`);
    
  } catch (error) {
    console.error("Error in video submissions migration:", error);
  }
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log("Starting UUID migration...");
  console.log("This will convert phone number-based records to UUID-based records");
  
  try {
    // Run migrations in order
    await migrateCreators();
    await migrateCampaignApplications();
    await migrateCampaignSubmissions();
    await migrateVideoSubmissions();
    
    console.log("UUID migration completed successfully!");
    
  } catch (error) {
    console.error("Migration failed:", error);
  }
  
  // Exit process
  process.exit(0);
}

// Run migration if this file is executed directly
if (require.main === module) {
  runMigration();
}

module.exports = {
  runMigration,
  generateDeterministicUUID,
  migrateCreators,
  migrateCampaignApplications,
  migrateCampaignSubmissions,
  migrateVideoSubmissions
};
