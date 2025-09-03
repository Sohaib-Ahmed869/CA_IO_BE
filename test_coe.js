// test_coe.js - Test script for COE generation
const COEGenerator = require('./utils/coeGenerator');

// Mock data for testing
const mockUser = {
  _id: '507f1f77bcf86cd799439011',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  phoneCode: '+61',
  phoneNumber: '123456789'
};

const mockApplication = {
  _id: '507f1f77bcf86cd799439012',
  certificationId: {
    name: 'Certificate IV in Business Administration',
    competencyUnits: [
      {
        name: 'BSBWHS401 - Implement and monitor WHS policies, procedures and programs',
        description: 'This unit describes the skills and knowledge required to implement and monitor an organisation\'s work health and safety (WHS) policies, procedures and programs in the relevant work area.'
      },
      {
        name: 'BSBWOR401 - Establish effective workplace relationships',
        description: 'This unit describes the skills and knowledge required to establish effective workplace relationships and communicate effectively with work colleagues, customers and clients.'
      }
    ]
  }
};

const mockPayment = {
  _id: '507f1f77bcf86cd799439013',
  paymentType: 'one_time',
  totalAmount: 2500,
  currency: 'AUD',
  status: 'completed',
  completedAt: new Date(),
  paymentHistory: [
    {
      amount: 2500,
      type: 'one_time',
      status: 'completed',
      paidAt: new Date()
    }
  ]
};

const mockEnrollmentFormData = {
  personalDetails: {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '+61 123456789',
    address: '123 Main Street, Melbourne, VIC 3000'
  },
  emergencyContact: {
    name: 'Jane Doe',
    relationship: 'Spouse',
    phone: '+61 987654321'
  },
  educationBackground: {
    highestQualification: 'Bachelor Degree',
    institution: 'University of Melbourne',
    yearCompleted: '2015'
  },
  workExperience: {
    yearsExperience: '5+ years',
    currentRole: 'Administrative Assistant',
    company: 'ABC Corporation'
  }
};

async function testCOEGeneration() {
  try {
    console.log('🚀 Starting COE generation test...');
    
    const coeGenerator = new COEGenerator();
    
    console.log('📄 Generating COE PDF...');
    const pdfBuffer = await coeGenerator.generateCOEPDF(
      mockUser,
      mockApplication,
      mockPayment,
      mockEnrollmentFormData
    );
    
    console.log('✅ COE PDF generated successfully!');
    console.log(`📊 PDF size: ${pdfBuffer.length} bytes`);
    
    // Save test PDF to file
    const fs = require('fs');
    const testFileName = `test_coe_${Date.now()}.pdf`;
    fs.writeFileSync(testFileName, pdfBuffer);
    console.log(`💾 Test PDF saved as: ${testFileName}`);
    
    console.log('🎉 COE generation test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during COE generation test:', error);
  }
}

// Run the test
testCOEGeneration();
