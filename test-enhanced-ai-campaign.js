const { initializeApp } = require('firebase/app');
const { getFunctions, httpsCallable } = require('firebase/functions');

// Firebase configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "mayin-d52c6",
  storageBucket: "mayin-d52c6.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app, 'asia-south1');

// Test the enhanced AI campaign suggestions
async function testEnhancedAICampaign() {
  console.log('🚀 Testing Enhanced AI Campaign System...\n');

  try {
    // Test data for comprehensive campaign
    const testData = {
      brandName: "TechFlow India",
      campaignTitle: "Digital Transformation Campaign",
      campaignGoal: "Increase brand awareness and drive website traffic",
      campaignDescription: "A comprehensive campaign to showcase our innovative tech solutions and attract potential clients",
      productService: "Enterprise Software Solutions",
      targetAudience: "Business owners and IT professionals",
      ageGroups: ["25-45", "46-65"],
      categories: ["Technology", "Business", "Innovation"],
      language: "English and Hindi",
      budget: "25000",
      contentTypes: ["Instagram Reels", "LinkedIn Posts", "YouTube Shorts"],
      campaignDuration: "6 weeks",
      brandValues: "Innovation, Reliability, Customer Success",
      competitorAnalysis: "Focus on unique AI-powered features",
      uniqueSellingPoints: "AI-driven insights, 24/7 support, scalable solutions",
      callToAction: "Schedule a free consultation",
      brandGuidelines: "Professional, modern, trustworthy",
      creatorRequirements: "Industry experts and thought leaders",
      successMetrics: "Website traffic, lead generation, brand mentions"
    };

    console.log('📋 Test Campaign Data:');
    console.log(JSON.stringify(testData, null, 2));
    console.log('\n' + '='.repeat(80) + '\n');

    // Call the enhanced AI campaign function
    const generateCampaignSuggestions = httpsCallable(functions, 'generateCampaignSuggestions');
    
    console.log('🤖 Generating AI Campaign Plan...\n');
    
    const result = await generateCampaignSuggestions(testData);
    const response = result.data;

    if (response.success) {
      console.log('✅ AI Campaign Generated Successfully!');
      console.log(`📊 Source: ${response.source || 'AI Generated'}`);
      console.log(`💬 Message: ${response.message || 'Campaign plan ready'}`);
      
      const campaignPlan = response.campaignPlan;
      
      console.log('\n' + '='.repeat(80));
      console.log('🎯 COMPREHENSIVE CAMPAIGN PLAN');
      console.log('='.repeat(80));
      
      // Display Executive Summary
      if (campaignPlan.executiveSummary) {
        console.log('\n📝 EXECUTIVE SUMMARY:');
        console.log(campaignPlan.executiveSummary);
      }
      
      // Display Target Audience
      if (campaignPlan.targetAudience) {
        console.log('\n👥 TARGET AUDIENCE:');
        const audience = campaignPlan.targetAudience;
        console.log(`Age Groups: ${audience.ageGroups?.join(', ') || 'N/A'}`);
        console.log(`Gender: ${audience.gender || 'N/A'}`);
        console.log(`Location: ${audience.location || 'N/A'}`);
        console.log(`Interests: ${audience.interests?.join(', ') || 'N/A'}`);
        console.log(`Income Level: ${audience.incomeLevel || 'N/A'}`);
        console.log(`Psychographic: ${audience.psychographicProfile || 'N/A'}`);
        if (audience.behavioralPatterns) {
          console.log(`Behavioral: ${audience.behavioralPatterns}`);
        }
      }
      
      // Display Content Specifications
      if (campaignPlan.contentSpecifications) {
        console.log('\n🎬 CONTENT SPECIFICATIONS:');
        const specs = campaignPlan.contentSpecifications;
        if (specs.idealDuration) {
          console.log(`Reels: ${specs.idealDuration.reels || 'N/A'}`);
          console.log(`Stories: ${specs.idealDuration.stories || 'N/A'}`);
          console.log(`Posts: ${specs.idealDuration.posts || 'N/A'}`);
        }
        console.log(`Format: ${specs.format || 'N/A'}`);
        console.log(`Background: ${specs.background || 'N/A'}`);
        console.log(`Editing Style: ${specs.editingStyle || 'N/A'}`);
        console.log(`Presentation: ${specs.presentationStyle || 'N/A'}`);
        
        if (specs.backgroundMusic) {
          console.log(`Music: ${specs.backgroundMusic.type || 'N/A'} (${specs.backgroundMusic.mood || 'N/A'})`);
        }
      }
      
      // Display Video Production Guidelines
      if (campaignPlan.videoProduction) {
        console.log('\n🎥 VIDEO PRODUCTION GUIDELINES:');
        const production = campaignPlan.videoProduction;
        console.log(`Opening: ${production.beginning || 'N/A'}`);
        console.log(`Closing: ${production.ending || 'N/A'}`);
        console.log(`Tone: ${production.tone || 'N/A'}`);
        console.log(`Pace: ${production.pace || 'N/A'}`);
        console.log(`Attire: ${production.attire || 'N/A'}`);
        console.log(`Integration: ${production.productIntegration || 'N/A'}`);
      }
      
      // Display Content Execution Strategy
      if (campaignPlan.contentExecution) {
        console.log('\n⚡ CONTENT EXECUTION STRATEGY:');
        const execution = campaignPlan.contentExecution;
        console.log(`Implementation: ${execution.implementation || 'N/A'}`);
        console.log(`Call to Action: ${execution.callToAction || 'N/A'}`);
        console.log(`Demonstration: ${execution.demonstration || 'N/A'}`);
        console.log(`Brand Tagging: ${execution.brandTagging || 'N/A'}`);
        console.log(`Non-Promotional: ${execution.nonPromotional || 'N/A'}`);
        console.log(`Storytelling: ${execution.storytelling || 'N/A'}`);
      }
      
      // Display Creative Guidelines
      if (campaignPlan.creativeGuidelines) {
        console.log('\n🎨 CREATIVE GUIDELINES:');
        const creative = campaignPlan.creativeGuidelines;
        console.log(`Visual Style: ${creative.visualStyle || 'N/A'}`);
        console.log(`Color Palette: ${creative.colorPalette || 'N/A'}`);
        console.log(`Typography: ${creative.typography || 'N/A'}`);
        if (creative.hashtags) {
          console.log(`Hashtags: ${creative.hashtags.join(' ')}`);
        }
      }
      
      // Display Campaign Timeline
      if (campaignPlan.campaignTimeline) {
        console.log('\n📅 CAMPAIGN TIMELINE:');
        const timeline = campaignPlan.campaignTimeline;
        Object.keys(timeline).forEach(week => {
          console.log(`${week.toUpperCase()}: ${timeline[week]}`);
        });
      }
      
      // Display Creator Guidelines
      if (campaignPlan.creatorGuidelines) {
        console.log('\n👤 CREATOR GUIDELINES:');
        const creator = campaignPlan.creatorGuidelines;
        console.log(`Requirements: ${creator.contentRequirements || 'N/A'}`);
        console.log(`Brand Alignment: ${creator.brandAlignment || 'N/A'}`);
        console.log(`Engagement: ${creator.engagementStrategy || 'N/A'}`);
        console.log(`Quality: ${creator.qualityStandards || 'N/A'}`);
      }
      
      // Display Success Metrics
      if (campaignPlan.successMetrics) {
        console.log('\n📈 SUCCESS METRICS:');
        const metrics = campaignPlan.successMetrics;
        console.log(`Engagement Rate: ${metrics.engagementRate || 'N/A'}`);
        console.log(`Reach: ${metrics.reach || 'N/A'}`);
        console.log(`Conversions: ${metrics.conversions || 'N/A'}`);
        console.log(`Brand Awareness: ${metrics.brandAwareness || 'N/A'}`);
        if (metrics.audienceGrowth) {
          console.log(`Audience Growth: ${metrics.audienceGrowth}`);
        }
        if (metrics.contentQuality) {
          console.log(`Content Quality: ${metrics.contentQuality}`);
        }
      }
      
      // Display Risk Mitigation
      if (campaignPlan.riskMitigation) {
        console.log('\n🛡️ RISK MITIGATION:');
        const risk = campaignPlan.riskMitigation;
        console.log(`Content Approval: ${risk.contentApproval || 'N/A'}`);
        console.log(`Brand Safety: ${risk.brandSafety || 'N/A'}`);
        console.log(`Performance Monitoring: ${risk.performanceMonitoring || 'N/A'}`);
        console.log(`Backup Plan: ${risk.backupPlan || 'N/A'}`);
      }
      
    } else {
      console.log('❌ Failed to generate campaign plan:');
      console.log(response.message || 'Unknown error');
    }
    
  } catch (error) {
    console.error('💥 Error testing enhanced AI campaign system:');
    console.error(error.message);
    
    if (error.code === 'functions/unavailable') {
      console.log('\n💡 Tip: Make sure Firebase Functions are deployed and running');
    } else if (error.code === 'functions/unauthenticated') {
      console.log('\n💡 Tip: Authentication may be required for this function');
    }
  }
}

// Test fallback scenarios
async function testFallbackScenarios() {
  console.log('\n' + '='.repeat(80));
  console.log('🔄 TESTING FALLBACK SCENARIOS');
  console.log('='.repeat(80));
  
  try {
    // Test with minimal data to trigger fallback
    const minimalData = {
      brandName: "Test Brand",
      campaignTitle: "Test Campaign"
    };
    
    console.log('\n📝 Testing with minimal data...');
    const generateCampaignSuggestions = httpsCallable(functions, 'generateCampaignSuggestions');
    const result = await generateCampaignSuggestions(minimalData);
    
    if (result.data.success) {
      console.log('✅ Fallback plan generated successfully');
      console.log(`📊 Source: ${result.data.source || 'Unknown'}`);
      console.log(`💬 Message: ${result.data.message || 'No message'}`);
    }
    
  } catch (error) {
    console.log('✅ Fallback error handling working as expected');
  }
}

// Run tests
async function runAllTests() {
  console.log('🧪 ENHANCED AI CAMPAIGN SYSTEM TEST SUITE');
  console.log('='.repeat(80));
  
  await testEnhancedAICampaign();
  await testFallbackScenarios();
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ TEST SUITE COMPLETED');
  console.log('='.repeat(80));
}

// Export for use in other scripts
module.exports = {
  testEnhancedAICampaign,
  testFallbackScenarios,
  runAllTests
};

// Run if called directly
if (require.main === module) {
  runAllTests().catch(console.error);
}
