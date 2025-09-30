/**
 * SMTP Configuration Test Script
 * 
 * This script helps test different SMTP configurations
 * Run with: node scripts/testSmtpConfig.js
 */

require('dotenv').config({ override: true });
const smtpVerifier = require('../utils/smtpVerifier');

// Test configurations
const testConfigs = [
  {
    name: "Gmail (Service)",
    config: {
      provider: "gmail",
      username: process.env.GMAIL_USERNAME || "iftikharazka1@gmail.com",
      password: process.env.GMAIL_APP_PASSWORD || "your-app-password",
      fromEmail: process.env.GMAIL_USERNAME || "iftikharazka1@gmail.com",
      fromName: "Test Sender"
    }
  },
  {
    name: "Gmail (SMTP)",
    config: {
      provider: "smtp",
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      username: process.env.GMAIL_USERNAME || "iftikharazka1@gmail.com",
      password: process.env.GMAIL_APP_PASSWORD || "your-app-password",
      fromEmail: process.env.GMAIL_USERNAME || "iftikharazka1@gmail.com",
      fromName: "Test Sender"
    }
  },
  {
    name: "Outlook",
    config: {
      provider: "outlook",
      username: process.env.OUTLOOK_USERNAME || "your-email@outlook.com",
      password: process.env.OUTLOOK_PASSWORD || "your-password",
      fromEmail: process.env.OUTLOOK_USERNAME || "your-email@outlook.com",
      fromName: "Test Sender"
    }
  }
];

async function testSMTPConfiguration() {
  console.log("🔧 SMTP Configuration Test");
  console.log("==========================\n");

  for (const test of testConfigs) {
    console.log(`📧 Testing: ${test.name}`);
    console.log(`   Provider: ${test.config.provider}`);
    
    // Skip if no credentials provided
    if (test.config.username.includes('your-') || test.config.password.includes('your-')) {
      console.log("   ⏭️  Skipped (no credentials provided)");
      console.log("");
      continue;
    }

    try {
      console.log("   🔍 Testing configuration...");
      
      // Test quick verification first
      const result = await smtpVerifier.quickVerify(test.config);
      
      if (result.success) {
        console.log("   ✅ SUCCESS: SMTP configuration is valid");
        console.log(`   📝 Message: ${result.message}`);
      } else {
        console.log("   ❌ FAILED: SMTP configuration is invalid");
        console.log(`   📝 Error: ${result.message}`);
        if (result.details) {
          console.log(`   🔍 Details: ${JSON.stringify(result.details, null, 2)}`);
        }
      }
      
    } catch (error) {
      console.log("   💥 EXCEPTION:", error.message);
    }
    
    console.log("");
  }
}

async function testGmailSpecific() {
  console.log("📧 Gmail Specific Tests");
  console.log("=======================\n");

  const gmailTests = [
    {
      name: "Gmail Service (Recommended)",
      config: {
        provider: "gmail",
        username: "iftikharazka1@gmail.com",
        password: "your-app-password", // Replace with actual app password
        fromEmail: "iftikharazka1@gmail.com",
        fromName: "Test Sender"
      }
    },
    {
      name: "Gmail SMTP (Alternative)",
      config: {
        provider: "smtp",
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        username: "iftikharazka1@gmail.com",
        password: "your-app-password", // Replace with actual app password
        fromEmail: "iftikharazka1@gmail.com",
        fromName: "Test Sender"
      }
    }
  ];

  for (const test of gmailTests) {
    console.log(`📧 ${test.name}`);
    
    if (test.config.password === "your-app-password") {
      console.log("   ⏭️  Skipped (replace with actual app password)");
      console.log("");
      continue;
    }

    try {
      const result = await smtpVerifier.quickVerify(test.config);
      
      if (result.success) {
        console.log("   ✅ SUCCESS");
      } else {
        console.log("   ❌ FAILED");
        console.log(`   📝 ${result.message}`);
      }
      
    } catch (error) {
      console.log("   💥 EXCEPTION:", error.message);
    }
    
    console.log("");
  }
}

async function main() {
  console.log("🚀 SMTP Configuration Test Suite");
  console.log("=================================\n");

  // Test general configurations
  await testSMTPConfiguration();

  // Test Gmail specific configurations
  await testGmailSpecific();

  console.log("📋 Gmail Setup Instructions:");
  console.log("============================");
  console.log("1. Enable 2-factor authentication on your Gmail account");
  console.log("2. Generate an App Password:");
  console.log("   - Go to Google Account settings");
  console.log("   - Security → 2-Step Verification → App passwords");
  console.log("   - Generate password for 'Mail'");
  console.log("3. Use the App Password (not your regular password)");
  console.log("4. For best results, use provider: 'gmail' instead of 'smtp'");
  console.log("\n💡 Recommended Gmail configuration:");
  console.log(JSON.stringify({
    provider: "gmail",
    username: "your-email@gmail.com",
    password: "your-16-character-app-password",
    fromEmail: "your-email@gmail.com",
    fromName: "Your Company Name"
  }, null, 2));
}

// Run the test
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testSMTPConfiguration, testGmailSpecific };
