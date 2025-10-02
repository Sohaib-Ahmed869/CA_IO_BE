// scripts/testStripeValidation.js
require('dotenv').config();
const axios = require('axios');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:5000/api';

async function testStripeValidation() {
  try {
    console.log('🧪 Testing Stripe Configuration Validation API...\n');

    // You'll need to replace these with actual test values
    const rtoId = '68dd30b9e045af45d302780d'; // Replace with actual RTO ID
    const authToken = 'your-admin-jwt-token'; // Replace with actual admin token

    // Test payload with fake keys for demonstration
    const testPayload = {
      stripeAccountId: 'acct_1234567890123456',
      secretKey: 'sk_test_51AbCdEf1234567890abcdef1234567890abcdef',
      publishableKey: 'pk_test_51AbCdEf1234567890abcdef1234567890abcdef',
      webhookSecret: 'whsec_1234567890abcdef1234567890abcdef12345678'
    };

    console.log('📋 Test Payload:');
    console.log(JSON.stringify(testPayload, null, 2));

    // Test 1: Validate Stripe Keys
    console.log('\n🔧 Test 1: Validate Stripe Keys');
    try {
      const response = await axios.post(
        `${API_BASE}/stripe-config/${rtoId}/validate`,
        testPayload,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ Validation Response:');
      console.log(JSON.stringify(response.data, null, 2));

      if (response.data.success) {
        console.log('\n🎉 Keys validation successful!');
        console.log('Account ID:', response.data.data.accountId);
        console.log('Account Type:', response.data.data.accountType);
        console.log('Country:', response.data.data.country);
        console.log('Charges Enabled:', response.data.data.chargesEnabled);
        console.log('Payouts Enabled:', response.data.data.payoutsEnabled);
      }

    } catch (error) {
      if (error.response) {
        console.log('❌ Validation failed:');
        console.log('Status:', error.response.status);
        console.log('Response:', JSON.stringify(error.response.data, null, 2));
      } else {
        console.log('❌ Network error:', error.message);
      }
    }

    // Test 2: Test Stripe Connection (if config exists)
    console.log('\n🔧 Test 2: Test Stripe Connection');
    try {
      const response = await axios.post(
        `${API_BASE}/stripe-config/${rtoId}/test`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ Connection Test Response:');
      console.log(JSON.stringify(response.data, null, 2));

    } catch (error) {
      if (error.response) {
        console.log('❌ Connection test failed:');
        console.log('Status:', error.response.status);
        console.log('Response:', JSON.stringify(error.response.data, null, 2));
      } else {
        console.log('❌ Network error:', error.message);
      }
    }

    // Test 3: Get Stripe Configuration
    console.log('\n🔧 Test 3: Get Stripe Configuration');
    try {
      const response = await axios.get(
        `${API_BASE}/stripe-config/${rtoId}`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ Configuration Response:');
      console.log(JSON.stringify(response.data, null, 2));

    } catch (error) {
      if (error.response) {
        console.log('❌ Get configuration failed:');
        console.log('Status:', error.response.status);
        console.log('Response:', JSON.stringify(error.response.data, null, 2));
      } else {
        console.log('❌ Network error:', error.message);
      }
    }

    console.log('\n📝 API Endpoints Summary:');
    console.log('POST /api/stripe-config/:rtoId/validate - Validate Stripe keys');
    console.log('POST /api/stripe-config/:rtoId/test - Test Stripe connection');
    console.log('GET  /api/stripe-config/:rtoId - Get configuration');
    console.log('POST /api/stripe-config/:rtoId - Create configuration');
    console.log('PUT  /api/stripe-config/:rtoId - Update configuration');
    console.log('DELETE /api/stripe-config/:rtoId - Delete configuration');
    console.log('GET  /api/stripe-config - List all configurations (admin)');

    console.log('\n🔧 Frontend Integration Example:');
    console.log(`
// Validate keys before saving
const validateKeys = async (rtoId, keys) => {
  const response = await fetch(\`/api/stripe-config/\${rtoId}/validate\`, {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${token}\`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(keys)
  });
  
  const data = await response.json();
  
  if (data.success) {
    console.log('Keys are valid:', data.data);
    return data.data;
  } else {
    console.log('Validation failed:', data.data.validationResults);
    throw new Error(data.message);
  }
};

// Usage
try {
  const validationResult = await validateKeys(rtoId, {
    stripeAccountId: 'acct_1234567890123456',
    secretKey: 'sk_live_your_secret_key',
    publishableKey: 'pk_live_your_publishable_key',
    webhookSecret: 'whsec_your_webhook_secret'
  });
  
  if (validationResult.valid) {
    // Proceed with creating configuration
    console.log('All keys are valid!');
  }
} catch (error) {
  console.error('Validation error:', error.message);
}
    `);

  } catch (error) {
    console.error('❌ Test Error:', error.message);
  }
}

// Run the test
testStripeValidation();
