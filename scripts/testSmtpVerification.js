/**
 * SMTP Verification Test Script
 * 
 * This script demonstrates how to test SMTP configurations
 * Run with: node scripts/testSmtpVerification.js
 */

require('dotenv').config({ override: true });
const smtpVerifier = require('../utils/smtpVerifier');

// Test configurations for different providers
const testConfigs = [
  {
    name: "Gmail SMTP",
    config: {
      provider: "gmail",
      username: process.env.GMAIL_USERNAME || "your-email@gmail.com",
      password: process.env.GMAIL_APP_PASSWORD || "your-app-password",
      fromEmail: process.env.GMAIL_USERNAME || "your-email@gmail.com",
      fromName: "Test Sender"
    }
  },
  {
    name: "Generic SMTP",
    config: {
      provider: "smtp",
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      username: process.env.SMTP_USERNAME || "your-email@gmail.com",
      password: process.env.SMTP_PASSWORD || "your-password",
      fromEmail: process.env.SMTP_USERNAME || "your-email@gmail.com",
      fromName: "Test Sender"
    }
  },
  {
    name: "Outlook SMTP",
    config: {
      provider: "outlook",
      username: process.env.OUTLOOK_USERNAME || "your-email@outlook.com",
      password: process.env.OUTLOOK_PASSWORD || "your-password",
      fromEmail: process.env.OUTLOOK_USERNAME || "your-email@outlook.com",
      fromName: "Test Sender"
    }
  }
];

async function testSMTPConfigurations() {
  console.log("🔧 Testing SMTP Configurations...\n");

  for (const test of testConfigs) {
    console.log(`📧 Testing: ${test.name}`);
    console.log(`   Provider: ${test.config.provider}`);
    console.log(`   Host: ${test.config.host || 'default'}`);
    console.log(`   Port: ${test.config.port || 'default'}`);
    
    try {
      // Skip if credentials are not provided
      if (test.config.username === "your-email@gmail.com" || 
          test.config.password === "your-password" ||
          test.config.password === "your-app-password") {
        console.log("   ⏭️  Skipped (no credentials provided)\n");
        continue;
      }

      // Test quick verification first
      console.log("   🔍 Quick verification...");
      const quickResult = await smtpVerifier.quickVerify(test.config);
      
      if (quickResult.success) {
        console.log("   ✅ Quick verification: PASSED");
        
        // If quick verification passes, test full verification
        console.log("   🔍 Full verification...");
        const fullResult = await smtpVerifier.verifySMTPConfig(test.config);
        
        if (fullResult.success) {
          console.log("   ✅ Full verification: PASSED");
          console.log(`   ⏱️  Duration: ${fullResult.details.duration}ms`);
        } else {
          console.log("   ❌ Full verification: FAILED");
          console.log(`   📝 Error: ${fullResult.message}`);
        }
      } else {
        console.log("   ❌ Quick verification: FAILED");
        console.log(`   📝 Error: ${quickResult.message}`);
      }
      
    } catch (error) {
      console.log("   💥 Exception:", error.message);
    }
    
    console.log("");
  }
}

async function testInvalidConfigurations() {
  console.log("🧪 Testing Invalid Configurations...\n");

  const invalidConfigs = [
    {
      name: "Missing Credentials",
      config: {
        provider: "smtp",
        host: "smtp.gmail.com",
        port: 587
        // Missing username and password
      }
    },
    {
      name: "Invalid Host",
      config: {
        provider: "smtp",
        host: "invalid-host.example.com",
        port: 587,
        username: "test@example.com",
        password: "password"
      }
    },
    {
      name: "Invalid Port",
      config: {
        provider: "smtp",
        host: "smtp.gmail.com",
        port: 9999, // Invalid port
        username: "test@example.com",
        password: "password"
      }
    }
  ];

  for (const test of invalidConfigs) {
    console.log(`📧 Testing: ${test.name}`);
    
    try {
      const result = await smtpVerifier.verifySMTPConfig(test.config);
      
      if (result.success) {
        console.log("   ⚠️  Unexpected: Configuration should have failed");
      } else {
        console.log("   ✅ Expected failure: PASSED");
        console.log(`   📝 Error: ${result.message}`);
      }
      
    } catch (error) {
      console.log("   ✅ Expected exception:", error.message);
    }
    
    console.log("");
  }
}

async function main() {
  console.log("🚀 SMTP Verification Test Suite");
  console.log("================================\n");

  // Test valid configurations
  await testSMTPConfigurations();

  // Test invalid configurations
  await testInvalidConfigurations();

  console.log("✅ Test suite completed!");
  console.log("\n💡 To test with real credentials, set environment variables:");
  console.log("   GMAIL_USERNAME=your-email@gmail.com");
  console.log("   GMAIL_APP_PASSWORD=your-app-password");
  console.log("   SMTP_USERNAME=your-smtp-username");
  console.log("   SMTP_PASSWORD=your-smtp-password");
  console.log("   OUTLOOK_USERNAME=your-outlook-email");
  console.log("   OUTLOOK_PASSWORD=your-outlook-password");
}

// Run the test suite
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testSMTPConfigurations, testInvalidConfigurations };
