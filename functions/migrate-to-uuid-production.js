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
  const hash = crypto.createHash('sha256');
  hash.update(phoneNumber + userId);
  const hashHex = hash.digest('hex');
  
  return [
    hashHex.substring(0, 8),
    hashHex.substring(8, 12),
    '5' + hashHex.substring(13, 16),
    hashHex.substring(16, 18),
    hashHex.substring(18, 30)
  ].join('-');
}

/**
 * Create migration backup
 */
async function createMigrationBackup() {
  console.log("📦 Creating migration backup...");
  
  try {
    const backupData = {
      timestamp: admin.firestore.Timestamp.fromDate(new Date()),
      collections: {}
    };
    
    // Backup creators collection
    const creatorsSnapshot = await db.collection("creators").get();
    backupData.collections.creators = creatorsSnapshot.docs.map(doc => ({
      id: doc.id,
      data: doc.data()
    }));
    
    // Backup campaign applications
    const applicationsSnapshot = await db.collection("campaignApplications").get();
    backupData.collections.campaignApplications = applicationsSnapshot.docs.map(doc => ({
      id: doc.id,
      data: doc.data()
    }));
    
    // Backup campaign submissions
    const submissionsSnapshot = await db.collection("campaignSubmissions").get();
    backupData.collections.campaignSubmissions = submissionsSnapshot.docs.map(doc => ({
      id: doc.id,
      data: doc.data()
    }));
    
    // Backup video submissions
    const videosSnapshot = await db.collection("videoSubmissions").get();
    backupData.collections.videoSubmissions = videosSnapshot.docs.map(doc => ({
      id: doc.id,
      data: doc.data()
    }));
    
    // Store backup
    await db.collection("migrationBackups").doc("uuid_migration_" + Date.now()).set(backupData);
    
    console.log("✅ Migration backup created successfully");
    return true;
    
  } catch (error) {
    console.error("❌ Failed to create migration backup:", error);
    return false;
  }
}

/**
 * Migrate creators collection from phone number to UUID
 */
async function migrateCreators() {
  console.log("🔄 Starting creators migration...");
  
  try {
    const creatorsSnapshot = await db.collection("creators").get();
    let migratedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    
    console.log(`📊 Found ${creatorsSnapshot.docs.length} creator profiles to migrate`);
    
    for (const doc of creatorsSnapshot.docs) {
      try {
        const creatorData = doc.data();
        const phoneNumber = creatorData.contactPhone;
        const userId = creatorData.userId;
        
        if (!phoneNumber || !userId) {
          console.log(`⚠️  Skipping creator ${doc.id}: missing phone or userId`);
          skippedCount++;
          continue;
        }
        
        // Check if already migrated
        if (creatorData.creatorId && creatorData.creatorId !== doc.id) {
          console.log(`ℹ️  Creator ${doc.id} already migrated to ${creatorData.creatorId}`);
          migratedCount++;
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
          originalDocId: doc.id,
          migrationVersion: "1.0"
        });
        
        // Update user document
        await db.collection("users").doc(userId).update({
          creatorProfileId: creatorUUID,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Delete old document
        await doc.ref.delete();
        
        migratedCount++;
        console.log(`✅ Migrated creator: ${doc.id} -> ${creatorUUID}`);
        
        // Add small delay to avoid overwhelming Firestore
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        errorCount++;
        console.error(`❌ Error migrating creator ${doc.id}:`, error.message);
      }
    }
    
    console.log(`🎯 Creators migration completed: ${migratedCount} migrated, ${errorCount} errors, ${skippedCount} skipped`);
    return { migratedCount, errorCount, skippedCount };
    
  } catch (error) {
    console.error("❌ Error in creators migration:", error);
    throw error;
  }
}

/**
 * Migrate campaign applications collection
 */
async function migrateCampaignApplications() {
  console.log("🔄 Starting campaign applications migration...");
  
  try {
    const applicationsSnapshot = await db.collection("campaignApplications").get();
    let migratedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    
    console.log(`📊 Found ${applicationsSnapshot.docs.length} applications to migrate`);
    
    for (const doc of applicationsSnapshot.docs) {
      try {
        const appData = doc.data();
        const phoneNumber = appData.contactPhone;
        const userId = appData.userId;
        
        if (!phoneNumber || !userId) {
          console.log(`⚠️  Skipping application ${doc.id}: missing phone or userId`);
          skippedCount++;
          continue;
        }
        
        // Check if already migrated
        if (appData.applicationId && appData.applicationId !== doc.id) {
          console.log(`ℹ️  Application ${doc.id} already migrated to ${appData.applicationId}`);
          migratedCount++;
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
          originalDocId: doc.id,
          migrationVersion: "1.0"
        });
        
        // Delete old document
        await doc.ref.delete();
        
        migratedCount++;
        console.log(`✅ Migrated application: ${doc.id} -> ${appUUID}`);
        
        // Add small delay to avoid overwhelming Firestore
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        errorCount++;
        console.error(`❌ Error migrating application ${doc.id}:`, error.message);
      }
    }
    
    console.log(`🎯 Applications migration completed: ${migratedCount} migrated, ${errorCount} errors, ${skippedCount} skipped`);
    return { migratedCount, errorCount, skippedCount };
    
  } catch (error) {
    console.error("❌ Error in applications migration:", error);
    throw error;
  }
}

/**
 * Migrate campaign submissions collection
 */
async function migrateCampaignSubmissions() {
  console.log("🔄 Starting campaign submissions migration...");
  
  try {
    const submissionsSnapshot = await db.collection("campaignSubmissions").get();
    let migratedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    
    console.log(`📊 Found ${submissionsSnapshot.docs.length} submissions to migrate`);
    
    for (const doc of submissionsSnapshot.docs) {
      try {
        const subData = doc.data();
        const phoneNumber = subData.contactPhone;
        const userId = subData.userId;
        
        if (!phoneNumber || !userId) {
          console.log(`⚠️  Skipping submission ${doc.id}: missing phone or userId`);
          skippedCount++;
          continue;
        }
        
        // Check if already migrated
        if (subData.submissionId && subData.submissionId !== doc.id) {
          console.log(`ℹ️  Submission ${doc.id} already migrated to ${subData.submissionId}`);
          migratedCount++;
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
          originalDocId: doc.id,
          migrationVersion: "1.0"
        });
        
        // Delete old document
        await doc.ref.delete();
        
        migratedCount++;
        console.log(`✅ Migrated submission: ${doc.id} -> ${subUUID}`);
        
        // Add small delay to avoid overwhelming Firestore
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        errorCount++;
        console.error(`❌ Error migrating submission ${doc.id}:`, error.message);
      }
    }
    
    console.log(`🎯 Submissions migration completed: ${migratedCount} migrated, ${errorCount} errors, ${skippedCount} skipped`);
    return { migratedCount, errorCount, skippedCount };
    
  } catch (error) {
    console.error("❌ Error in submissions migration:", error);
    throw error;
  }
}

/**
 * Migrate video submissions collection
 */
async function migrateVideoSubmissions() {
  console.log("🔄 Starting video submissions migration...");
  
  try {
    const videosSnapshot = await db.collection("videoSubmissions").get();
    let migratedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    
    console.log(`📊 Found ${videosSnapshot.docs.length} video submissions to migrate`);
    
    for (const doc of videosSnapshot.docs) {
      try {
        const videoData = doc.data();
        const phoneNumber = videoData.contactPhone;
        const userId = videoData.userId;
        
        if (!phoneNumber || !userId) {
          console.log(`⚠️  Skipping video submission ${doc.id}: missing phone or userId`);
          skippedCount++;
          continue;
        }
        
        // Check if already migrated
        if (videoData.submissionId && videoData.submissionId !== doc.id) {
          console.log(`ℹ️  Video submission ${doc.id} already migrated to ${videoData.submissionId}`);
          migratedCount++;
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
          originalDocId: doc.id,
          migrationVersion: "1.0"
        });
        
        // Delete old document
        await doc.ref.delete();
        
        migratedCount++;
        console.log(`✅ Migrated video submission: ${doc.id} -> ${videoUUID}`);
        
        // Add small delay to avoid overwhelming Firestore
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        errorCount++;
        console.error(`❌ Error migrating video submission ${doc.id}:`, error.message);
      }
    }
    
    console.log(`🎯 Video submissions migration completed: ${migratedCount} migrated, ${errorCount} errors, ${skippedCount} skipped`);
    return { migratedCount, errorCount, skippedCount };
    
  } catch (error) {
    console.error("❌ Error in video submissions migration:", error);
    throw error;
  }
}

/**
 * Validate migration results
 */
async function validateMigration() {
  console.log("🔍 Validating migration results...");
  
  try {
    let validationErrors = [];
    
    // Check creators collection
    const creatorsSnapshot = await db.collection("creators").get();
    for (const doc of creatorsSnapshot.docs) {
      const data = doc.data();
      if (!data.creatorId || data.creatorId !== doc.id) {
        validationErrors.push(`Creator ${doc.id}: missing or mismatched creatorId`);
      }
      if (!data.migratedAt) {
        validationErrors.push(`Creator ${doc.id}: missing migration timestamp`);
      }
    }
    
    // Check campaign applications
    const applicationsSnapshot = await db.collection("campaignApplications").get();
    for (const doc of applicationsSnapshot.docs) {
      const data = doc.data();
      if (!data.applicationId || data.applicationId !== doc.id) {
        validationErrors.push(`Application ${doc.id}: missing or mismatched applicationId`);
      }
      if (!data.migratedAt) {
        validationErrors.push(`Application ${doc.id}: missing migration timestamp`);
      }
    }
    
    // Check campaign submissions
    const submissionsSnapshot = await db.collection("campaignSubmissions").get();
    for (const doc of submissionsSnapshot.docs) {
      const data = doc.data();
      if (!data.submissionId || data.submissionId !== doc.id) {
        validationErrors.push(`Submission ${doc.id}: missing or mismatched submissionId`);
      }
      if (!data.migratedAt) {
        validationErrors.push(`Submission ${doc.id}: missing migration timestamp`);
      }
    }
    
    if (validationErrors.length === 0) {
      console.log("✅ Migration validation passed - all records properly migrated");
      return true;
    } else {
      console.log("❌ Migration validation failed:");
      validationErrors.forEach(error => console.log(`   - ${error}`));
      return false;
    }
    
  } catch (error) {
    console.error("❌ Error during validation:", error);
    return false;
  }
}

/**
 * Create migration summary
 */
async function createMigrationSummary(results) {
  console.log("📋 Creating migration summary...");
  
  try {
    const summary = {
      timestamp: admin.firestore.Timestamp.fromDate(new Date()),
      status: "completed",
      results: results,
      totalMigrated: Object.values(results).reduce((sum, result) => sum + result.migratedCount, 0),
      totalErrors: Object.values(results).reduce((sum, result) => sum + result.errorCount, 0),
      totalSkipped: Object.values(results).reduce((sum, result) => sum + result.skippedCount, 0),
      migrationVersion: "1.0"
    };
    
    await db.collection("migrationSummaries").doc("uuid_migration_" + Date.now()).set(summary);
    
    console.log("✅ Migration summary created");
    return summary;
    
  } catch (error) {
    console.error("❌ Failed to create migration summary:", error);
    return null;
  }
}

/**
 * Main migration function
 */
async function runProductionMigration() {
  console.log("🚀 Starting Production UUID Migration...");
  console.log("⚠️  This will convert phone number-based records to UUID-based records");
  console.log("📊 Creating backup before migration...\n");
  
  try {
    // Create backup
    const backupCreated = await createMigrationBackup();
    if (!backupCreated) {
      console.log("❌ Migration aborted - backup creation failed");
      return;
    }
    
    console.log("🔄 Starting data migration...\n");
    
    // Run migrations in order
    const creatorsResult = await migrateCreators();
    console.log("");
    
    const applicationsResult = await migrateCampaignApplications();
    console.log("");
    
    const submissionsResult = await migrateCampaignSubmissions();
    console.log("");
    
    const videosResult = await migrateVideoSubmissions();
    console.log("");
    
    // Compile results
    const results = {
      creators: creatorsResult,
      applications: applicationsResult,
      submissions: submissionsResult,
      videos: videosResult
    };
    
    // Validate migration
    console.log("🔍 Validating migration...\n");
    const validationPassed = await validateMigration();
    
    if (validationPassed) {
      // Create summary
      const summary = await createMigrationSummary(results);
      
      console.log("🎉 Production UUID migration completed successfully!");
      console.log("📊 Migration Summary:");
      console.log(`   Total Records Migrated: ${summary.totalMigrated}`);
      console.log(`   Total Errors: ${summary.totalErrors}`);
      console.log(`   Total Skipped: ${summary.totalSkipped}`);
      
      if (summary.totalErrors === 0) {
        console.log("✅ All records migrated successfully!");
      } else {
        console.log("⚠️  Some records had errors - check logs for details");
      }
    } else {
      console.log("❌ Migration validation failed - manual review required");
    }
    
  } catch (error) {
    console.error("❌ Production migration failed:", error);
    console.log("🔄 Consider rolling back to backup if needed");
  }
  
  // Exit process
  process.exit(0);
}

// Run migration if this file is executed directly
if (require.main === module) {
  runProductionMigration();
}

module.exports = {
  runProductionMigration,
  createMigrationBackup,
  migrateCreators,
  migrateCampaignApplications,
  migrateCampaignSubmissions,
  migrateVideoSubmissions,
  validateMigration,
  createMigrationSummary
};
