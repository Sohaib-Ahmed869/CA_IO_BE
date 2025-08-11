// scripts/testEmail.js
require('dotenv').config();
const EmailService2 = require('../services/emailService2');

async function testEmail() {
  try {
    console.log('Testing email service...\n');

    const emailService = EmailService2;

    // Test 1: Send email without RTO ID (should use fallback branding)
    console.log('Test 1: Sending email without RTO ID...');
    try {
      const result1 = await emailService.sendEmail(
        'test@example.com',
        'Test Email - {companyName}',
        '<div>Hello, this is a test email from {companyName}. Visit us at {rtoUrl}/dashboard</div>'
      );
      console.log('✅ Test 1 passed:', result1);
    } catch (error) {
      console.log('❌ Test 1 failed:', error.message);
    }

    // Test 2: Send email with RTO ID (should use RTO branding)
    console.log('\nTest 2: Sending email with RTO ID...');
    try {
      const result2 = await emailService.sendEmail(
        'test@example.com',
        'Test Email - {companyName}',
        '<div>Hello, this is a test email from {companyName}. Visit us at {rtoUrl}/dashboard</div>',
        '689048c0da47f115c0e8015b' // Use the RTO ID from your earlier examples
      );
      console.log('✅ Test 2 passed:', result2);
    } catch (error) {
      console.log('❌ Test 2 failed:', error.message);
    }

    // Test 3: Test RTO branding retrieval
    console.log('\nTest 3: Testing RTO branding retrieval...');
    try {
      const branding = await emailService.getRTOBranding('689048c0da47f115c0e8015b');
      console.log('✅ RTO branding retrieved:', {
        companyName: branding?.companyName,
        hasLogo: !!branding?.logoUrl,
        primaryColor: branding?.primaryColor
      });
    } catch (error) {
      console.log('❌ RTO branding retrieval failed:', error.message);
    }

    // Test 4: Test variable replacement
    console.log('\nTest 4: Testing variable replacement...');
    try {
      const testContent = 'Hello from {companyName}. Visit {rtoUrl}/dashboard';
      const testBranding = {
        companyName: 'Test Company',
        subdomain: 'testcompany'
      };
      const replaced = emailService.replaceRTOVariables(testContent, testBranding);
      console.log('✅ Variable replacement test:', {
        original: testContent,
        replaced: replaced
      });
    } catch (error) {
      console.log('❌ Variable replacement test failed:', error.message);
    }

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testEmail();
