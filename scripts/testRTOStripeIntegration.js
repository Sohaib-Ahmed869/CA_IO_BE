// scripts/testRTOStripeIntegration.js
require('dotenv').config();
const mongoose = require('mongoose');
const StripeConfig = require('../models/stripeConfig');
const RTO = require('../models/rto');
const StripeService = require('../services/stripeService');
const { getRTOStripeService, getRTOPublishableKey } = require('../utils/rtoStripeUtils');

// Connect to database
mongoose.connect(process.env.MONGODB_URI);

async function testRTOStripeIntegration() {
  try {
    console.log('🧪 Testing RTO-Specific Stripe Integration...\n');

    // Test 1: Find existing RTO
    const rto = await RTO.findOne({ name: /azka/i });
    
    if (!rto) {
      console.log('❌ No RTO found with name containing "azka"');
      return;
    }

    console.log('✅ Found RTO:', rto.name);
    console.log('RTO Code:', rto.rtoCode);
    console.log('RTO ID:', rto._id);

    // Test 2: Check if Stripe config exists
    console.log('\n🔧 Test 2: Check Stripe Configuration');
    const existingConfig = await StripeConfig.findByRtoId(rto._id);
    
    if (existingConfig) {
      console.log('✅ Stripe configuration exists');
      console.log('Stripe Account ID:', existingConfig.stripeAccountId);
      console.log('Account Status:', existingConfig.accountStatus);
      console.log('Capabilities:', existingConfig.capabilities);
      console.log('Payment Settings:', existingConfig.paymentSettings);
      
      // Test decryption
      try {
        const decryptedSecretKey = existingConfig.getDecryptedSecretKey();
        console.log('✅ Secret key decryption successful');
        console.log('Secret key starts with:', decryptedSecretKey.substring(0, 10) + '...');
        
        const decryptedWebhookSecret = existingConfig.getDecryptedWebhookSecret();
        console.log('✅ Webhook secret decryption successful');
        console.log('Webhook secret starts with:', decryptedWebhookSecret.substring(0, 10) + '...');
      } catch (decryptError) {
        console.log('❌ Decryption failed:', decryptError.message);
      }
    } else {
      console.log('⚠️  No Stripe configuration found for this RTO');
      console.log('You need to create a Stripe configuration first');
    }

    // Test 3: Initialize Stripe Service
    console.log('\n🔧 Test 3: Initialize Stripe Service');
    try {
      const stripeService = await getRTOStripeService(rto._id);
      console.log('✅ Stripe service initialized successfully');
      
      const config = stripeService.getConfig();
      console.log('Service Config:', {
        rtoId: config.rtoId,
        stripeAccountId: config.stripeAccountId,
        accountStatus: config.accountStatus,
        publishableKey: config.publishableKey?.substring(0, 10) + '...'
      });
    } catch (stripeError) {
      console.log('❌ Stripe service initialization failed:', stripeError.message);
    }

    // Test 4: Get Publishable Key
    console.log('\n🔧 Test 4: Get Publishable Key');
    try {
      const publishableKey = await getRTOPublishableKey(rto._id);
      console.log('✅ Publishable key retrieved:', publishableKey.substring(0, 15) + '...');
    } catch (keyError) {
      console.log('❌ Failed to get publishable key:', keyError.message);
    }

    // Test 5: Test Stripe Connection
    console.log('\n🔧 Test 5: Test Stripe Connection');
    try {
      const stripeService = new StripeService(rto._id);
      await stripeService.initialize();
      
      const stripe = await stripeService.getStripe();
      const account = await stripe.accounts.retrieve();
      
      console.log('✅ Stripe connection successful');
      console.log('Account ID:', account.id);
      console.log('Account Type:', account.type);
      console.log('Country:', account.country);
      console.log('Charges Enabled:', account.charges_enabled);
      console.log('Payouts Enabled:', account.payouts_enabled);
    } catch (connectionError) {
      console.log('❌ Stripe connection failed:', connectionError.message);
    }

    // Test 6: Security Validation
    console.log('\n🔧 Test 6: Security Validation');
    
    // Check encryption
    if (existingConfig) {
      const isEncrypted = existingConfig.secretKey.startsWith('sk_encrypted_');
      console.log('Secret key encrypted:', isEncrypted ? '✅' : '❌');
      
      const webhookEncrypted = existingConfig.webhookSecret.startsWith('whsec_encrypted_');
      console.log('Webhook secret encrypted:', webhookEncrypted ? '✅' : '❌');
      
      // Check JSON serialization doesn't expose secrets
      const jsonConfig = existingConfig.toJSON();
      const hasSecretInJSON = jsonConfig.secretKey || jsonConfig.webhookSecret;
      console.log('Secrets exposed in JSON:', hasSecretInJSON ? '❌' : '✅');
    }

    // Test 7: List All Stripe Configs (Admin View)
    console.log('\n🔧 Test 7: List All Stripe Configurations');
    try {
      const allConfigs = await StripeConfig.find({ isActive: true });
      console.log(`✅ Found ${allConfigs.length} active Stripe configurations`);
      
      allConfigs.forEach((config, index) => {
        console.log(`  ${index + 1}. RTO: ${config.rtoId} | Account: ${config.stripeAccountId} | Status: ${config.accountStatus}`);
      });
    } catch (listError) {
      console.log('❌ Failed to list configurations:', listError.message);
    }

    console.log('\n🎉 RTO-Specific Stripe Integration Test Complete!');
    
    if (!existingConfig) {
      console.log('\n📝 Next Steps:');
      console.log('1. Create a Stripe account for this RTO');
      console.log('2. Configure API keys and webhook endpoints');
      console.log('3. Use POST /api/stripe-config/:rtoId to create configuration');
      console.log('4. Test the configuration with POST /api/stripe-config/:rtoId/test');
    }

  } catch (error) {
    console.error('❌ Test Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the test
testRTOStripeIntegration();
