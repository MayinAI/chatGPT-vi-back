// Flutter Production Configuration for OneGoal1Crore
// Copy this configuration to your Flutter app

class ProductionConfig {
  // Firebase Project Configuration
  static const String firebaseProjectId = 'YOUR_PROJECT_ID';
  
  // Production Environment
  static const bool isProduction = true;
  static const String environment = 'production';
  static const String appVersion = '1.0.1'; // Updated version for closed testing
  
  // Cloud Functions URLs (HTTP Endpoints)
  static const String baseUrl = 'https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net';
  
  // HTTP Endpoints
  static const String aiChatUrl = 'https://callaichat-xamfzjydta-uc.a.run.app';
  static const String checkSubscriptionStatusUrl = 'https://checksubscriptionstatus-xamfzjydta-uc.a.run.app';
  static const String cancelSubscriptionUrl = 'https://cancelsubscription-xamfzjydta-uc.a.run.app';
  static const String razorpayWebhookUrl = 'https://razorpaywebhook-xamfzjydta-uc.a.run.app';
  
  // Callable Functions (use with Firebase Functions)
  static const String getRazorpayConfigFunction = 'getRazorpayConfig';
  static const String createRazorpaySubscriptionFunction = 'createRazorpaySubscription';
  static const String migrateUserDataFunction = 'migrateUserData';
  
  // App Configuration
  static const int maxMessageLength = 1000;
  static const int maxChatHistoryLength = 20;
  static const int subscriberMessageLimit = 1000;
  static const int freeUserMessageLimit = 10;
  
  // Request Timeouts
  static const Duration httpTimeout = Duration(seconds: 30);
  static const Duration aiChatTimeout = Duration(seconds: 60);
  
  // Rate Limiting (Client-side awareness)
  static const int maxRequestsPerMinute = 60;
  static const Duration rateLimitWindow = Duration(minutes: 1);
}

// Example usage in your Flutter app:
/*
import 'package:http/http.dart' as http;
import 'package:cloud_functions/cloud_functions.dart';

class ApiService {
  static final FirebaseFunctions _functions = FirebaseFunctions.instanceFor(
    region: 'us-central1',
  );

  // Example: Call AI Chat endpoint
  static Future<Map<String, dynamic>> callAIChat({
    required String userMessage,
    required List<Map<String, dynamic>> chatHistory,
    String? systemPrompt,
  }) async {
    try {
      final response = await http.post(
        Uri.parse(ProductionConfig.aiChatUrl),
        headers: {
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'userMessage': userMessage,
          'chatHistory': chatHistory,
          'systemPrompt': systemPrompt,
        }),
      ).timeout(ProductionConfig.aiChatTimeout);

      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      } else if (response.statusCode == 429) {
        throw Exception('Rate limit exceeded. Please try again later.');
      } else {
        throw Exception('Failed to get AI response: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Network error: $e');
    }
  }

  // Example: Call Razorpay Config (Callable Function)
  static Future<Map<String, dynamic>> getRazorpayConfig() async {
    try {
      final callable = _functions.httpsCallable(
        ProductionConfig.getRazorpayConfigFunction,
      );
      
      final result = await callable.call();
      return Map<String, dynamic>.from(result.data);
    } catch (e) {
      throw Exception('Failed to get Razorpay config: $e');
    }
  }

  // Example: Create Subscription (Callable Function)
  static Future<Map<String, dynamic>> createSubscription({
    required String planId,
  }) async {
    try {
      final callable = _functions.httpsCallable(
        ProductionConfig.createRazorpaySubscriptionFunction,
      );
      
      final result = await callable.call({
        'planId': planId,
      });
      
      return Map<String, dynamic>.from(result.data);
    } catch (e) {
      throw Exception('Failed to create subscription: $e');
    }
  }

  // Example: Check Subscription Status
  static Future<Map<String, dynamic>> checkSubscriptionStatus({
    required String userId,
  }) async {
    try {
      final response = await http.post(
        Uri.parse(ProductionConfig.checkSubscriptionStatusUrl),
        headers: {
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'userId': userId,
        }),
      ).timeout(ProductionConfig.httpTimeout);

      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      } else {
        throw Exception('Failed to check subscription: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Network error: $e');
    }
  }
}

// Error Handling Helper
class ApiException implements Exception {
  final String message;
  final int? statusCode;
  
  ApiException(this.message, [this.statusCode]);
  
  @override
  String toString() => 'ApiException: $message${statusCode != null ? ' (Status: $statusCode)' : ''}';
}

// Rate Limiting Helper
class RateLimiter {
  static final Map<String, List<DateTime>> _requestHistory = {};
  
  static bool canMakeRequest(String endpoint) {
    final now = DateTime.now();
    final key = endpoint;
    
    if (!_requestHistory.containsKey(key)) {
      _requestHistory[key] = [];
    }
    
    final history = _requestHistory[key]!;
    
    // Remove old requests outside the window
    history.removeWhere((time) => 
      now.difference(time) > ProductionConfig.rateLimitWindow
    );
    
    // Check if we can make a new request
    if (history.length >= ProductionConfig.maxRequestsPerMinute) {
      return false;
    }
    
    // Add current request
    history.add(now);
    return true;
  }
}
*/ 