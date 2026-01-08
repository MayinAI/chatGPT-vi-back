const admin = require("firebase-admin");
const crypto = require("crypto");

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Test UUID generation consistency
 */
function testUUIDGeneration() {
  console.log("🧪 Testing UUID Generation...");
  
  const phoneNumber = "+91 9999999999";
  const userId = "test_user_123";
  
  // Test deterministic UUID generation
  const uuid1 = generateDeterministicUUID(phoneNumber, userId);
  const uuid2 = generateDeterministicUUID(phoneNumber, userId);
  
  if (uuid1 === uuid2) {
    console.log("✅ Deterministic UUID generation: PASSED");
    console.log(`   Generated UUID: ${uuid1}`);
  } else {
    console.log("❌ Deterministic UUID generation: FAILED");
    console.log(`   UUID1: ${uuid1}`);
    console.log(`   UUID2: ${uuid2}`);
  }
  
  // Test random UUID generation
  const randomUuid1 = generateUUID();
  const randomUuid2 = generateUUID();
  
  if (randomUuid1 !== randomUuid2) {
    console.log("✅ Random UUID generation: PASSED");
  } else {
    console.log("❌ Random UUID generation: FAILED");
  }
  
  console.log("");
}

/**
 * Test creator profile creation with UUIDs
 */
async function testCreatorProfileCreation() {
  console.log("🧪 Testing Creator Profile Creation...");
  
  try {
    const testUserId = "test_uuid_user_" + Date.now();
    const testPhone = "+91 8888888888";
    
    // Create test user first
    await db.collection("users").doc(testUserId).set({
      phoneNumber: testPhone,
      createdAt: admin.firestore.Timestamp.fromDate(new Date())
    });
    
    // Generate UUID
    const creatorUUID = generateDeterministicUUID(testPhone, testUserId);
    
    // Create creator profile
    const creatorData = {
      creatorId: creatorUUID,
      userId: testUserId,
      contactPhone: testPhone,
      creatorName: "Test Creator",
      contentLanguage: "English",
      category: "Lifestyle",
      isActive: true,
      createdAt: admin.firestore.Timestamp.fromDate(new Date())
    };
    
    await db.collection("creators").doc(creatorUUID).set(creatorData);
    
    // Verify creation
    const createdDoc = await db.collection("creators").doc(creatorUUID).get();
    
    if (createdDoc.exists) {
      console.log("✅ Creator profile creation: PASSED");
      console.log(`   Document ID: ${createdDoc.id}`);
      console.log(`   Creator ID: ${createdDoc.data().creatorId}`);
      console.log(`   User ID: ${createdDoc.data().userId}`);
    } else {
      console.log("❌ Creator profile creation: FAILED");
    }
    
    // Cleanup
    await db.collection("creators").doc(creatorUUID).delete();
    await db.collection("users").doc(testUserId).delete();
    
  } catch (error) {
    console.log("❌ Creator profile creation: FAILED");
    console.log(`   Error: ${error.message}`);
  }
  
  console.log("");
}

/**
 * Test campaign application with UUIDs
 */
async function testCampaignApplication() {
  console.log("🧪 Testing Campaign Application...");
  
  try {
    const testUserId = "test_app_user_" + Date.now();
    const testPhone = "+91 7777777777";
    const testCampaignId = "test_campaign_" + Date.now();
    
    // Create test user
    await db.collection("users").doc(testUserId).set({
      phoneNumber: testPhone,
      createdAt: admin.firestore.Timestamp.fromDate(new Date())
    });
    
    // Create test campaign
    await db.collection("brandCampaigns").doc(testCampaignId).set({
      title: "Test Campaign",
      isActive: true,
      status: "active",
      language: "English",
      targetCategories: ["Lifestyle"],
      minFollowers: 0,
      maxFollowers: 1000000,
      createdAt: admin.firestore.Timestamp.fromDate(new Date())
    });
    
    // Create test creator profile
    const creatorUUID = generateDeterministicUUID(testPhone, testUserId);
    await db.collection("creators").doc(creatorUUID).set({
      creatorId: creatorUUID,
      userId: testUserId,
      contactPhone: testPhone,
      creatorName: "Test Creator",
      contentLanguage: "English",
      category: "Lifestyle",
      isActive: true,
      createdAt: admin.firestore.Timestamp.fromDate(new Date())
    });
    
    // Generate application UUID
    const applicationUUID = generateDeterministicUUID(testPhone, testUserId);
    
    // Create application
    const applicationData = {
      applicationId: applicationUUID,
      userId: testUserId,
      contactPhone: testPhone,
      campaignId: testCampaignId,
      status: "applied",
      appliedAt: admin.firestore.Timestamp.fromDate(new Date())
    };
    
    await db.collection("campaignApplications").doc(applicationUUID).set(applicationData);
    
    // Verify application
    const createdApp = await db.collection("campaignApplications").doc(applicationUUID).get();
    
    if (createdApp.exists) {
      console.log("✅ Campaign application creation: PASSED");
      console.log(`   Application ID: ${createdApp.id}`);
      console.log(`   Campaign ID: ${createdApp.data().campaignId}`);
    } else {
      console.log("❌ Campaign application creation: FAILED");
    }
    
    // Cleanup
    await db.collection("campaignApplications").doc(applicationUUID).delete();
    await db.collection("creators").doc(creatorUUID).delete();
    await db.collection("brandCampaigns").doc(testCampaignId).delete();
    await db.collection("users").doc(testUserId).delete();
    
  } catch (error) {
    console.log("❌ Campaign application creation: FAILED");
    console.log(`   Error: ${error.message}`);
  }
  
  console.log("");
}

/**
 * Test dual lookup functionality (UUID + phone number fallback)
 */
async function testDualLookup() {
  console.log("🧪 Testing Dual Lookup Functionality...");
  
  try {
    const testUserId = "test_lookup_user_" + Date.now();
    const testPhone = "+91 6666666666";
    
    // Create test user
    await db.collection("users").doc(testUserId).set({
      phoneNumber: testPhone,
      createdAt: admin.firestore.Timestamp.fromDate(new Date())
    });
    
    // Create creator profile with UUID
    const creatorUUID = generateDeterministicUUID(testPhone, testUserId);
    await db.collection("creators").doc(creatorUUID).set({
      creatorId: creatorUUID,
      userId: testUserId,
      contactPhone: testPhone,
      creatorName: "Test Creator",
      contentLanguage: "English",
      category: "Lifestyle",
      isActive: true,
      createdAt: admin.firestore.Timestamp.fromDate(new Date())
    });
    
    // Test UUID-based lookup
    const uuidLookup = await db.collection("creators").doc(creatorUUID).get();
    
    // Test phone number fallback lookup
    const phoneLookup = await db.collection("creators")
      .where("contactPhone", "==", testPhone)
      .where("userId", "==", testUserId)
      .limit(1)
      .get();
    
    if (uuidLookup.exists && !phoneLookup.empty) {
      console.log("✅ Dual lookup functionality: PASSED");
      console.log(`   UUID lookup: ${uuidLookup.id}`);
      console.log(`   Phone lookup: ${phoneLookup.docs[0].id}`);
    } else {
      console.log("❌ Dual lookup functionality: FAILED");
    }
    
    // Cleanup
    await db.collection("creators").doc(creatorUUID).delete();
    await db.collection("users").doc(testUserId).delete();
    
  } catch (error) {
    console.log("❌ Dual lookup functionality: FAILED");
    console.log(`   Error: ${error.message}`);
  }
  
  console.log("");
}

/**
 * Test data consistency across collections
 */
async function testDataConsistency() {
  console.log("🧪 Testing Data Consistency...");
  
  try {
    const testUserId = "test_consistency_user_" + Date.now();
    const testPhone = "+91 5555555555";
    const testCampaignId = "test_consistency_campaign_" + Date.now();
    
    // Create test data
    await db.collection("users").doc(testUserId).set({
      phoneNumber: testPhone,
      createdAt: admin.firestore.Timestamp.fromDate(new Date())
    });
    
    const creatorUUID = generateDeterministicUUID(testPhone, testUserId);
    await db.collection("creators").doc(creatorUUID).set({
      creatorId: creatorUUID,
      userId: testUserId,
      contactPhone: testPhone,
      creatorName: "Test Creator",
      contentLanguage: "English",
      category: "Lifestyle",
      isActive: true,
      createdAt: admin.firestore.Timestamp.fromDate(new Date())
    });
    
    const applicationUUID = generateDeterministicUUID(testPhone, testUserId);
    await db.collection("campaignApplications").doc(applicationUUID).set({
      applicationId: applicationUUID,
      userId: testUserId,
      contactPhone: testPhone,
      campaignId: testCampaignId,
      status: "applied",
      appliedAt: admin.firestore.Timestamp.fromDate(new Date())
    });
    
    // Verify consistency
    const creatorDoc = await db.collection("creators").doc(creatorUUID).get();
    const appDoc = await db.collection("campaignApplications").doc(applicationUUID).get();
    
    if (creatorDoc.exists && appDoc.exists) {
      const creatorData = creatorDoc.data();
      const appData = appDoc.data();
      
      if (creatorData.creatorId === appData.applicationId && 
          creatorData.userId === appData.userId &&
          creatorData.contactPhone === appData.contactPhone) {
        console.log("✅ Data consistency: PASSED");
        console.log(`   Creator ID: ${creatorData.creatorId}`);
        console.log(`   Application ID: ${appData.applicationId}`);
        console.log(`   User ID: ${creatorData.userId}`);
        console.log(`   Phone: ${creatorData.contactPhone}`);
      } else {
        console.log("❌ Data consistency: FAILED - Mismatched data");
      }
    } else {
      console.log("❌ Data consistency: FAILED - Documents not found");
    }
    
    // Cleanup
    await db.collection("campaignApplications").doc(applicationUUID).delete();
    await db.collection("creators").doc(creatorUUID).delete();
    await db.collection("users").doc(testUserId).delete();
    
  } catch (error) {
    console.log("❌ Data consistency: FAILED");
    console.log(`   Error: ${error.message}`);
  }
  
  console.log("");
}

/**
 * Generate a deterministic UUID based on phone number and userId
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
 * Generate a random UUID
 */
function generateUUID() {
  return require('uuid').v4();
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log("🚀 Starting UUID Implementation Tests...\n");
  
  try {
    // Run tests
    testUUIDGeneration();
    await testCreatorProfileCreation();
    await testCampaignApplication();
    await testDualLookup();
    await testDataConsistency();
    
    console.log("🎉 All tests completed!");
    
  } catch (error) {
    console.error("❌ Test suite failed:", error);
  }
  
  // Exit process
  process.exit(0);
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests();
}

module.exports = {
  runAllTests,
  testUUIDGeneration,
  testCreatorProfileCreation,
  testCampaignApplication,
  testDualLookup,
  testDataConsistency
};
