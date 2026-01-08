const functions = require('firebase-functions');
const admin = require('firebase-admin');

// AI Engagement Analysis and Payment Calculator
exports.calculateCreatorPayments = functions.https.onCall(async (data, context) => {
    // Check if user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { campaignId } = data;
    
    try {
        const db = admin.firestore();
        
        // Get campaign data
        const campaignDoc = await db.collection('campaigns').doc(campaignId).get();
        if (!campaignDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Campaign not found');
        }
        
        const campaignData = campaignDoc.data();
        const totalBudget = campaignData.budget;
        
        // Get all creator submissions for this campaign
        const submissionsSnapshot = await db.collection('campaigns')
            .doc(campaignId)
            .collection('submissions')
            .get();
        
        const submissions = [];
        submissionsSnapshot.forEach(doc => {
            submissions.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // Calculate AI engagement scores and payments
        const paymentResults = [];
        let totalPaid = 0;
        
        for (const submission of submissions) {
            const engagementScore = calculateEngagementScore(submission.metrics || {});
            const payment = calculatePayment(engagementScore, totalBudget, submissions.length);
            
            paymentResults.push({
                creatorId: submission.creatorId,
                creatorName: submission.creatorName,
                instagramHandle: submission.instagramHandle,
                engagementScore: engagementScore,
                payment: payment,
                metrics: submission.metrics || {},
                submissionId: submission.id
            });
            
            totalPaid += payment;
        }
        
        // Update campaign with payment calculations
        await db.collection('campaigns').doc(campaignId).update({
            paymentCalculations: {
                totalBudget: totalBudget,
                totalPaid: totalPaid,
                creatorCount: submissions.length,
                calculatedAt: admin.firestore.FieldValue.serverTimestamp(),
                payments: paymentResults
            },
            paymentStatus: 'calculated'
        });
        
        return {
            success: true,
            totalBudget: totalBudget,
            totalPaid: totalPaid,
            creatorCount: submissions.length,
            payments: paymentResults
        };
        
    } catch (error) {
        console.error('Error calculating payments:', error);
        throw new functions.https.HttpsError('internal', 'Error calculating payments');
    }
});

// AI Engagement Scoring Algorithm
function calculateEngagementScore(metrics) {
    const {
        likes = 0,
        comments = 0,
        shares = 0,
        saves = 0,
        views = 0,
        followers = 0
    } = metrics;
    
    // Prevent division by zero
    if (views === 0) return 0;
    
    // Engagement rate calculation
    const engagementRate = ((likes + comments + shares + saves) / views) * 100;
    
    // Weighted scoring system (more weight on comments and shares as they indicate higher engagement)
    const likeScore = (likes / views) * 100 * 0.25;
    const commentScore = (comments / views) * 100 * 0.35;
    const shareScore = (shares / views) * 100 * 0.25;
    const saveScore = (saves / views) * 100 * 0.15;
    
    // Quality bonus for high engagement
    let qualityBonus = 0;
    if (engagementRate > 8) qualityBonus = 25;
    else if (engagementRate > 5) qualityBonus = 15;
    else if (engagementRate > 3) qualityBonus = 10;
    else if (engagementRate > 1) qualityBonus = 5;
    
    // Follower reach bonus (micro-influencers often have higher engagement)
    let reachBonus = 0;
    if (followers < 1000) reachBonus = 20; // Nano influencers
    else if (followers < 10000) reachBonus = 15; // Micro influencers
    else if (followers < 100000) reachBonus = 10; // Mid-tier influencers
    else if (followers < 1000000) reachBonus = 5; // Macro influencers
    else reachBonus = 0; // Mega influencers
    
    // Content quality indicators
    let contentBonus = 0;
    if (comments > likes * 0.1) contentBonus = 10; // High comment ratio
    if (shares > likes * 0.05) contentBonus += 10; // High share ratio
    if (saves > likes * 0.02) contentBonus += 5; // High save ratio
    
    const totalScore = likeScore + commentScore + shareScore + saveScore + 
                      qualityBonus + reachBonus + contentBonus;
    
    return Math.min(Math.max(totalScore, 0), 100); // Cap between 0 and 100
}

// Calculate payment based on engagement score
function calculatePayment(engagementScore, baseBudget, totalCreators) {
    if (totalCreators === 0) return 0;
    
    // Base payment per creator
    const basePayment = baseBudget / totalCreators;
    
    // Score multiplier (0.3x to 2.5x based on performance)
    // This ensures that high performers get significantly more while poor performers get less
    const scoreMultiplier = 0.3 + (engagementScore / 100) * 2.2;
    
    const calculatedPayment = basePayment * scoreMultiplier;
    
    // Ensure minimum payment (at least 20% of base payment)
    const minimumPayment = basePayment * 0.2;
    
    return Math.round(Math.max(calculatedPayment, minimumPayment));
}

// Process payments to creators
exports.processCreatorPayments = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { campaignId } = data;
    
    try {
        const db = admin.firestore();
        
        // Get campaign with payment calculations
        const campaignDoc = await db.collection('campaigns').doc(campaignId).get();
        if (!campaignDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Campaign not found');
        }
        
        const campaignData = campaignDoc.data();
        const paymentCalculations = campaignData.paymentCalculations;
        
        if (!paymentCalculations) {
            throw new functions.https.HttpsError('failed-precondition', 'Payment calculations not found');
        }
        
        const batch = db.batch();
        
        // Process each creator payment
        for (const payment of paymentCalculations.payments) {
            // Create payment record
            const paymentRef = db.collection('payments').doc();
            batch.set(paymentRef, {
                campaignId: campaignId,
                creatorId: payment.creatorId,
                amount: payment.payment,
                engagementScore: payment.engagementScore,
                status: 'pending',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                processedAt: null
            });
            
            // Create notification for creator
            const notificationRef = db.collection('notifications').doc();
            batch.set(notificationRef, {
                userId: payment.creatorId,
                type: 'payment_processed',
                title: 'Payment Processed',
                message: `Your payment of ₹${payment.payment.toLocaleString()} has been processed for campaign "${campaignData.title}"`,
                amount: payment.payment,
                campaignId: campaignId,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                read: false
            });
            
            // Update creator's earnings
            const creatorRef = db.collection('users').doc(payment.creatorId);
            batch.update(creatorRef, {
                totalEarnings: admin.firestore.FieldValue.increment(payment.payment),
                lastPaymentAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        
        // Update campaign status
        batch.update(db.collection('campaigns').doc(campaignId), {
            paymentStatus: 'processed',
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
            totalPaid: paymentCalculations.totalPaid
        });
        
        await batch.commit();
        
        return {
            success: true,
            totalPaid: paymentCalculations.totalPaid,
            creatorCount: paymentCalculations.creatorCount,
            message: 'Payments processed successfully'
        };
        
    } catch (error) {
        console.error('Error processing payments:', error);
        throw new functions.https.HttpsError('internal', 'Error processing payments');
    }
});

// Get payment analytics for a campaign
exports.getPaymentAnalytics = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { campaignId } = data;
    
    try {
        const db = admin.firestore();
        
        const campaignDoc = await db.collection('campaigns').doc(campaignId).get();
        if (!campaignDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Campaign not found');
        }
        
        const campaignData = campaignDoc.data();
        const paymentCalculations = campaignData.paymentCalculations;
        
        if (!paymentCalculations) {
            return {
                success: false,
                message: 'Payment calculations not available'
            };
        }
        
        // Calculate analytics
        const payments = paymentCalculations.payments;
        const totalBudget = paymentCalculations.totalBudget;
        const totalPaid = paymentCalculations.totalPaid;
        
        const analytics = {
            totalBudget: totalBudget,
            totalPaid: totalPaid,
            budgetUtilization: (totalPaid / totalBudget) * 100,
            averageEngagementScore: payments.reduce((sum, p) => sum + p.engagementScore, 0) / payments.length,
            averagePayment: totalPaid / payments.length,
            highestPayment: Math.max(...payments.map(p => p.payment)),
            lowestPayment: Math.min(...payments.map(p => p.payment)),
            creatorCount: payments.length,
            paymentDistribution: {
                highPerformers: payments.filter(p => p.engagementScore >= 70).length,
                mediumPerformers: payments.filter(p => p.engagementScore >= 40 && p.engagementScore < 70).length,
                lowPerformers: payments.filter(p => p.engagementScore < 40).length
            }
        };
        
        return {
            success: true,
            analytics: analytics,
            payments: payments
        };
        
    } catch (error) {
        console.error('Error getting payment analytics:', error);
        throw new functions.https.HttpsError('internal', 'Error getting payment analytics');
    }
});

// Update engagement metrics for a submission
exports.updateEngagementMetrics = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { campaignId, submissionId, metrics } = data;
    
    try {
        const db = admin.firestore();
        
        // Update submission with new metrics
        await db.collection('campaigns')
            .doc(campaignId)
            .collection('submissions')
            .doc(submissionId)
            .update({
                metrics: metrics,
                metricsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        
        // Recalculate payments for the campaign
        const campaignDoc = await db.collection('campaigns').doc(campaignId).get();
        const campaignData = campaignDoc.data();
        
        if (campaignData.paymentStatus === 'calculated' || campaignData.paymentStatus === 'processed') {
            // Trigger payment recalculation
            await exports.calculateCreatorPayments({ campaignId }, context);
        }
        
        return {
            success: true,
            message: 'Engagement metrics updated successfully'
        };
        
    } catch (error) {
        console.error('Error updating engagement metrics:', error);
        throw new functions.https.HttpsError('internal', 'Error updating engagement metrics');
    }
}); 