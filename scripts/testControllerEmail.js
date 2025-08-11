// scripts/testControllerEmail.js
require('dotenv').config();
const mongoose = require('mongoose');
const certificateController = require('../controllers/adminCertificateController');

async function testControllerEmail() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {});
    console.log('Connected to MongoDB');

    // Mock request object
    const mockReq = {
      rtoId: '6899c00142ee6996f5802529', // Use the RTO ID from your response
      user: {
        _id: '6899c0375d80acd423165261',
        firstName: 'admin',
        lastName: 'admin'
      },
      params: {
        applicationId: '6899d6e72fc287bb3f6670c0' // Use the application ID from your response
      },
      body: {
        expiryMonths: 12,
        grade: '33',
        notes: '2321'
      },
      file: {
        key: 'documents/6899c0375d80acd423165261/1754912535228-0c510ffdffc33790.pdf',
        originalname: 'forms_6899c4395d80acd42316632a.pdf'
      }
    };

    // Mock response object
    const mockRes = {
      status: (code) => {
        console.log(`Response status: ${code}`);
        return mockRes;
      },
      json: (data) => {
        console.log('Response data:', JSON.stringify(data, null, 2));
        return mockRes;
      },
      setHeader: (name, value) => {
        console.log(`Header set: ${name} = ${value}`);
        return mockRes;
      }
    };

    console.log('🧪 Testing certificate controller email functionality...');
    console.log('- RTO ID:', mockReq.rtoId);
    console.log('- Application ID:', mockReq.params.applicationId);
    console.log('- User ID:', mockReq.user._id);

    // Test the controller method
    try {
      await certificateController.uploadFinalCertificate(mockReq, mockRes);
      console.log('✅ Controller method completed successfully');
    } catch (error) {
      console.log('❌ Controller method error:', error.message);
      console.log('Error stack:', error.stack);
    }

  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

testControllerEmail();
