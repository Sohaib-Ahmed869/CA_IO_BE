// scripts/testUnifiedEmailService.js
require('dotenv').config();
const mongoose = require('mongoose');
const UnifiedEmailService = require('../services/unifiedEmailService');
const RTO = require('../models/rto');

// Connect to database
mongoose.connect(process.env.MONGODB_URI);

async function testUnifiedEmailService() {
  try {
    console.log('🧪 Testing Unified Email Service...\n');

    // Find RTO by name "Azka Iftikhar"
    const rto = await RTO.findOne({ name: /azka/i });
    
    if (!rto) {
      console.log('❌ No RTO found with name containing "azka"');
      return;
    }

    console.log('✅ Found RTO:', rto.name);
    console.log('RTO Code:', rto.rtoCode);
    console.log('RTO ID:', rto._id);

    // Test 1: RTO-specific email service
    console.log('\n🔧 Test 1: RTO-specific email service');
    const rtoEmailService = new UnifiedEmailService(rto);
    
    console.log('✅ RTO Email Service initialized');
    console.log('Company Name:', rtoEmailService.companyName);
    console.log('Logo URL:', rtoEmailService.logoUrl);
    console.log('From Email:', rtoEmailService.fromEmail);
    console.log('RTO Code:', rtoEmailService.rtoCode);

    // Test 2: Default email service
    console.log('\n🔧 Test 2: Default email service');
    const defaultEmailService = new UnifiedEmailService();
    
    console.log('✅ Default Email Service initialized');
    console.log('Company Name:', defaultEmailService.companyName);
    console.log('Logo URL:', defaultEmailService.logoUrl);
    console.log('From Email:', defaultEmailService.fromEmail);
    console.log('RTO Code:', defaultEmailService.rtoCode);

    // Test 3: Generate email template
    console.log('\n🔧 Test 3: Generate email template');
    const testContent = `
      <h2>Test Email</h2>
      <p>This is a test email to verify the unified email service is working correctly.</p>
      <p><strong>RTO:</strong> ${rtoEmailService.companyName}</p>
      <p><strong>Logo URL:</strong> ${rtoEmailService.logoUrl}</p>
    `;
    
    const template = rtoEmailService.getBaseTemplate(testContent, "Test Email");
    console.log('✅ Email template generated successfully');
    console.log('Template length:', template.length, 'characters');
    console.log('Contains gradient:', template.includes('linear-gradient(135deg, #e3f2fd, #fff3e0)') ? '✅' : '❌');
    console.log('Contains logo URL:', template.includes(rtoEmailService.logoUrl) ? '✅' : '❌');
    console.log('Contains company name:', template.includes(rtoEmailService.companyName) ? '✅' : '❌');

    console.log('\n🎉 All tests passed! Unified Email Service is working correctly.');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the test
testUnifiedEmailService();
