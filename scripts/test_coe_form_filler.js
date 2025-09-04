// scripts/test_coe_form_filler.js
const COEFormFiller = require('../utils/coeFormFiller');
const fs = require('fs');
const path = require('path');

// Mock data for testing
const mockUser = {
  _id: 'user123',
  firstName: 'John',
  lastName: 'Smith',
  email: 'john.smith@email.com',
  phone: '+61 412 345 678'
};

const mockApplication = {
  _id: 'APP-2024-001',
  certificationId: {
    name: 'Certificate IV in Business'
  }
};

const mockPayment = {
  totalAmount: 2500,
  currency: 'AUD',
  status: 'completed'
};

const mockEnrollmentFormData = {
  personalDetails: {
    dateOfBirth: '15/03/1995',
    address: '123 Collins Street, Melbourne VIC 3000'
  },
  course: {
    startDate: '01/02/2024',
    endDate: '30/06/2024',
    durationWeeks: '20'
  }
};

async function testCOEFormFiller() {
  try {
    console.log('Testing COE Form Filler...');
    
    const coeFiller = new COEFormFiller();
    const pdfBuffer = await coeFiller.fillCOEForm(
      mockUser, 
      mockApplication, 
      mockPayment, 
      mockEnrollmentFormData
    );

    const outputPath = path.join(__dirname, '../assets/coe_filled_sample.pdf');
    fs.writeFileSync(outputPath, pdfBuffer);
    
    console.log(`✅ COE filled successfully! Output: ${outputPath}`);
    console.log(`File size: ${pdfBuffer.length} bytes`);
    
  } catch (error) {
    console.error('❌ Error testing COE form filler:', error);
  }
}

testCOEFormFiller();
