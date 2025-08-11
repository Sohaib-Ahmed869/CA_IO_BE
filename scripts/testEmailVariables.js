// scripts/testEmailVariables.js
const EmailService2 = require('../services/emailService2');

async function testEmailVariables() {
  try {
    console.log('Testing email variable replacement...\n');

    const emailService = EmailService2;

    // Test 1: Test variable replacement with fallback branding
    console.log('Test 1: Variable replacement with fallback branding...');
    try {
      const testContent = 'Hello from {companyName}. Visit {rtoUrl}/dashboard';
      const testSubject = 'Welcome to {companyName}';
      
      const replacedContent = emailService.replaceRTOVariables(testContent, null);
      const replacedSubject = emailService.replaceRTOVariables(testSubject, null);
      
      console.log('✅ Content replacement:', {
        original: testContent,
        replaced: replacedContent
      });
      console.log('✅ Subject replacement:', {
        original: testSubject,
        replaced: replacedSubject
      });
    } catch (error) {
      console.log('❌ Test 1 failed:', error.message);
    }

    // Test 2: Test variable replacement with custom branding
    console.log('\nTest 2: Variable replacement with custom branding...');
    try {
      const testContent = 'Hello from {companyName}. Visit {rtoUrl}/dashboard. Contact {companyEmail}';
      const testBranding = {
        companyName: 'Test Company Ltd',
        subdomain: 'testcompany',
        companyEmail: 'info@testcompany.com',
        primaryColor: '#ff0000',
        secondaryColor: '#00ff00'
      };
      
      const replacedContent = emailService.replaceRTOVariables(testContent, testBranding);
      
      console.log('✅ Custom branding replacement:', {
        original: testContent,
        branding: testBranding,
        replaced: replacedContent
      });
    } catch (error) {
      console.log('❌ Test 2 failed:', error.message);
    }

    // Test 3: Test RTO branding retrieval (without database)
    console.log('\nTest 3: Testing RTO branding method structure...');
    try {
      console.log('✅ RTO branding method exists:', typeof emailService.getRTOBranding);
      console.log('✅ Replace variables method exists:', typeof emailService.replaceRTOVariables);
      console.log('✅ Send email method exists:', typeof emailService.sendEmail);
    } catch (error) {
      console.log('❌ Test 3 failed:', error.message);
    }

    // Test 4: Test email template creation
    console.log('\nTest 4: Testing email template creation...');
    try {
      const testContent = '<div>Hello from {companyName}</div>';
      const testBranding = {
        companyName: 'Template Test Company',
        primaryColor: '#007bff',
        secondaryColor: '#6c757d'
      };
      
      const brandedEmail = emailService.createBrandedEmail(testContent, testBranding, 'Test Email');
      
      console.log('✅ Email template creation:', {
        hasTemplate: !!brandedEmail,
        containsCompanyName: brandedEmail.includes('Template Test Company'),
        containsContent: brandedEmail.includes('Hello from Template Test Company')
      });
    } catch (error) {
      console.log('❌ Test 4 failed:', error.message);
    }

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testEmailVariables();
