// scripts/debugRTOLogo.js
require('dotenv').config();
const mongoose = require('mongoose');

// Models
const RTO = require('../models/rto');

// Connect to database
mongoose.connect(process.env.MONGODB_URI);

async function debugRTOLogo() {
  try {
    console.log('🔍 Debugging RTO logo configuration...\n');

    // Find RTO by name "Azka Iftikhar"
    const rto = await RTO.findOne({ name: /azka/i });
    
    if (!rto) {
      console.log('❌ No RTO found with name containing "azka"');
      return;
    }

    console.log('✅ Found RTO:', rto.name);
    console.log('RTO Code:', rto.rtoCode);
    console.log('RTO ID:', rto._id);

    console.log('\n📋 RTO Logo Configuration:');
    console.log('rto.branding:', JSON.stringify(rto.branding, null, 2));
    console.log('rto.logo:', JSON.stringify(rto.logo, null, 2));

    // Check all possible logo fields
    console.log('\n🖼️ Logo Field Analysis:');
    console.log('rto.branding?.logoUrl:', rto.branding?.logoUrl);
    console.log('rto.logo?.url:', rto.logo?.url);
    console.log('rto.logoUrl:', rto.logoUrl);
    console.log('rto.logo:', rto.logo);

    // Test the getRTOBranding method
    console.log('\n🧪 Testing getRTOBranding method:');
    const RTOEmailService = require('../services/rtoEmailService');
    const emailService = new RTOEmailService(rto);
    const branding = emailService.getRTOBranding();
    
    console.log('Final branding result:', JSON.stringify(branding, null, 2));

    // Check if we need to add a logo
    if (!rto.branding?.logoUrl && !rto.logo?.url) {
      console.log('\n💡 SOLUTION: Add a logo to the RTO');
      console.log('You need to update the RTO with a logo URL in either:');
      console.log('- rto.branding.logoUrl');
      console.log('- rto.logo.url');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the debug
debugRTOLogo();
