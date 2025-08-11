// scripts/testCertificateEmail.js
require('dotenv').config();
const mongoose = require('mongoose');
const emailService = require('../services/emailService2');

async function testCertificateEmail() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {});
    console.log('Connected to MongoDB');

    // Test data
    const testUser = {
      _id: 'test-user-id',
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com'
    };

    const testApplication = {
      _id: 'test-application-id',
      certificationId: {
        name: 'Test Certification'
      }
    };

    const testCertificateDetails = {
      certificateId: 'CERT-2025-123456',
      certificationName: 'Test Certification',
      downloadUrl: 'https://example.com/test-certificate.pdf',
      issueDate: new Date(),
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      grade: 'A',
      _id: 'test-application-id'
    };

    const testRtoId = '6899c00142ee6996f5802529'; // Use the RTO ID from your response

    console.log('🧪 Testing certificate email service...');
    console.log('- User:', testUser.email);
    console.log('- RTO ID:', testRtoId);
    console.log('- Download URL:', testCertificateDetails.downloadUrl);

    // Test 1: Test RTO branding retrieval
    console.log('\n📧 Test 1: Testing RTO branding retrieval...');
    try {
      const branding = await emailService.getRTOBranding(testRtoId);
      console.log('✅ RTO branding retrieved:', {
        companyName: branding.companyName,
        hasLogo: !!branding.logoUrl,
        primaryColor: branding.primaryColor,
        secondaryColor: branding.secondaryColor
      });
    } catch (error) {
      console.log('❌ RTO branding error:', error.message);
    }

    // Test 2: Test email sending
    console.log('\n📧 Test 2: Testing certificate email sending...');
    try {
      const result = await emailService.sendCertificateDownloadEmail(
        testUser,
        testApplication,
        testCertificateDetails,
        testRtoId
      );
      console.log('✅ Email sent successfully:', result);
    } catch (error) {
      console.log('❌ Email sending error:', error.message);
      console.log('Error stack:', error.stack);
    }

    // Test 3: Test with null RTO ID
    console.log('\n📧 Test 3: Testing with null RTO ID...');
    try {
      const result = await emailService.sendCertificateDownloadEmail(
        testUser,
        testApplication,
        testCertificateDetails,
        null
      );
      console.log('✅ Email sent successfully with default branding:', result);
    } catch (error) {
      console.log('❌ Email sending error with null RTO:', error.message);
    }

  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

testCertificateEmail();
