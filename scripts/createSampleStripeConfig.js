// scripts/createSampleStripeConfig.js
require('dotenv').config();
const mongoose = require('mongoose');
const StripeConfig = require('../models/stripeConfig');
const RTO = require('../models/rto');

// Connect to database
mongoose.connect(process.env.MONGODB_URI);

async function createSampleStripeConfig() {
  try {
    console.log('🔧 Creating Sample Stripe Configuration...\n');

    // Find RTO by name "Azka Iftikhar"
    const rto = await RTO.findOne({ name: /azka/i });
    
    if (!rto) {
      console.log('❌ No RTO found with name containing "azka"');
      return;
    }

    console.log('✅ Found RTO:', rto.name);
    console.log('RTO Code:', rto.rtoCode);
    console.log('RTO ID:', rto._id);

    // Check if config already exists
    const existingConfig = await StripeConfig.findByRtoId(rto._id);
    if (existingConfig) {
      console.log('⚠️  Stripe configuration already exists for this RTO');
      console.log('Existing config ID:', existingConfig._id);
      return;
    }

    // Sample Stripe configuration data
    // NOTE: These are placeholder values - replace with actual Stripe account details
    const sampleConfig = {
      rtoId: rto._id,
      stripeAccountId: 'acct_sample123456789', // Replace with actual account ID
      secretKey: 'sk_test_sample_key_123456789', // Replace with actual secret key
      publishableKey: 'pk_test_sample_key_123456789', // Replace with actual publishable key
      webhookSecret: 'whsec_sample_webhook_secret_123456789', // Replace with actual webhook secret
      accountStatus: 'active',
      capabilities: {
        cardPayments: true,
        transfers: true,
        taxReporting: false
      },
      paymentSettings: {
        currency: 'AUD',
        statementDescriptor: 'CERTIFIED',
        statementDescriptorSuffix: rto.shortName || 'RTO',
        receiptEmail: rto.contact?.email || 'admin@certified.io'
      },
      compliance: {
        kycRequired: true,
        taxIdRequired: true,
        businessType: 'company',
        country: 'AU'
      },
      webhookEndpoints: [
        {
          url: `${process.env.FRONTEND_URL || 'https://certified.io'}/api/webhooks/stripe/${rto.rtoCode}`,
          events: [
            'payment_intent.succeeded',
            'payment_intent.payment_failed',
            'payment_intent.canceled',
            'payment_method.attached',
            'customer.created',
            'customer.updated'
          ],
          enabled: true
        }
      ],
      metadata: {
        setupBy: null, // Will be set by admin user
        notes: `Sample Stripe configuration for ${rto.name} (${rto.rtoCode})`
      }
    };

    console.log('\n📋 Sample Configuration:');
    console.log('RTO ID:', sampleConfig.rtoId);
    console.log('Stripe Account ID:', sampleConfig.stripeAccountId);
    console.log('Account Status:', sampleConfig.accountStatus);
    console.log('Currency:', sampleConfig.paymentSettings.currency);
    console.log('Statement Descriptor:', sampleConfig.paymentSettings.statementDescriptor);
    console.log('Webhook URL:', sampleConfig.webhookEndpoints[0].url);

    console.log('\n⚠️  IMPORTANT: This is a SAMPLE configuration with placeholder values!');
    console.log('To create a real configuration:');
    console.log('1. Create a Stripe account for this RTO');
    console.log('2. Get the actual API keys from Stripe Dashboard');
    console.log('3. Set up webhook endpoints in Stripe');
    console.log('4. Use the API endpoint: POST /api/stripe-config/:rtoId');
    console.log('\nOr manually create the configuration with real values:');

    console.log('\n📝 Example API Request:');
    console.log('POST /api/stripe-config/' + rto._id);
    console.log('Authorization: Bearer <admin-token>');
    console.log('Content-Type: application/json');
    console.log(JSON.stringify({
      stripeAccountId: 'acct_YOUR_ACTUAL_ACCOUNT_ID',
      secretKey: 'sk_live_YOUR_ACTUAL_SECRET_KEY',
      publishableKey: 'pk_live_YOUR_ACTUAL_PUBLISHABLE_KEY',
      webhookSecret: 'whsec_YOUR_ACTUAL_WEBHOOK_SECRET',
      paymentSettings: {
        currency: 'AUD',
        statementDescriptor: 'CERTIFIED',
        statementDescriptorSuffix: rto.shortName || 'RTO',
        receiptEmail: rto.contact?.email || 'admin@certified.io'
      },
      compliance: {
        kycRequired: true,
        taxIdRequired: true,
        businessType: 'company',
        country: 'AU'
      }
    }, null, 2));

    console.log('\n🔒 Security Features:');
    console.log('✅ Secret keys will be encrypted automatically');
    console.log('✅ RTO isolation enforced at API level');
    console.log('✅ Webhook signatures validated per RTO');
    console.log('✅ All operations logged with RTO context');
    console.log('✅ Cross-RTO access prevented');

    console.log('\n🎯 Benefits:');
    console.log('• Complete payment data isolation between RTOs');
    console.log('• RTO-specific customer management');
    console.log('• Independent webhook processing');
    console.log('• Secure key management with encryption');
    console.log('• Audit trail for all operations');
    console.log('• Compliance with PCI DSS requirements');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the script
createSampleStripeConfig();
