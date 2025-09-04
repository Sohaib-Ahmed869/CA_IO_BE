// scripts/test_specific_fields.js
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

async function testSpecificFields() {
  try {
    console.log('Testing specific field mappings...\n');
    
    const coeFiller = new COEFormFiller();
    
    // Test 1: Fill only signature fields (last 2 fields)
    console.log('Test 1: Testing signature fields (41-42)...');
    const test1Fields = {};
    const fieldNames = [
      'Text-cn2VAtzk7t', 'Text-j3RVeIoPLM', 'Text-2peu82pH69', 'Text-ViGlMIsTLB',
      'Text-AXh9CDzCwA', 'Text-Jcyai6Rb9o', 'Text-SCoeNeXuyr', 'Text-XL9k8d7HES',
      'Text-Q8oVdZniPw', 'Text-tK56PmZo-D', 'Text-XA7urVfjc5', 'Text-QVOTH8qGJr',
      'Text-H8NdFrkzBV', 'Text-2ITRr_cMg_', 'Text-pnhfcrE6Kc', 'Text-88lguME7Q6',
      'Text-6KCIWoaWr8', 'Text-m7R1-bc4x0', 'Text-PlXqCeyoQq', 'Text-e1QjDQKtM5',
      'Text-VZPgAFcUBw', 'Text-y440oen0KX', 'Text-MM5Tmz8aDZ', 'Text--lAvLnPUir',
      'Text-hPK5wRyKEz', 'Text-LuZRKUJ8p-', 'Text-cSV4Myk-vc', 'Text-Cd22aK5acV',
      'Text-SPy32JyDAn', 'Text-M35HPqU33R', 'Text-6o0T20BOb_', 'Text-Pf090ej871',
      'Text-mFRvDHKevA', 'Text-5fkb5aKysO', 'Text-5cgxfqshDu', 'Text-JpIgtSHqAL',
      'Text-I8jLymtlQc', 'Text-EI-MrmQ7WN', 'Text-Rg_dsoL08k', 'Text-EfpObURhlB',
      'Text-eWSwqVdfiN', 'Text-A34-1wZUyC'
    ];
    
    // Fill only the last 2 fields with signature data
    test1Fields[fieldNames[40]] = 'John Smith'; // Student signature
    test1Fields[fieldNames[41]] = '04/09/2025'; // Signature date
    
    const pdfBuffer1 = await coeFiller.fillSpecificFields(test1Fields);
    const outputPath1 = path.join(__dirname, '../assets/test_signature_fields.pdf');
    fs.writeFileSync(outputPath1, pdfBuffer1);
    console.log(`✅ Signature test saved: ${outputPath1}`);
    
    // Test 2: Fill orientation fields (try different field positions)
    console.log('\nTest 2: Testing orientation fields...');
    const test2Fields = {};
    
    // Try filling fields 25-27 with orientation data
    test2Fields[fieldNames[24]] = '11/09/2025'; // Date
    test2Fields[fieldNames[25]] = '10:00 AM'; // Time  
    test2Fields[fieldNames[26]] = 'ALIT Campus, 500 Spencer Street, West Melbourne VIC 3003'; // Location
    
    const pdfBuffer2 = await coeFiller.fillSpecificFields(test2Fields);
    const outputPath2 = path.join(__dirname, '../assets/test_orientation_fields.pdf');
    fs.writeFileSync(outputPath2, pdfBuffer2);
    console.log(`✅ Orientation test saved: ${outputPath2}`);
    
    // Test 3: Fill financial fields
    console.log('\nTest 3: Testing financial fields...');
    const test3Fields = {};
    
    // Try filling fields 15-20 with financial data
    test2Fields[fieldNames[14]] = 'BSB50120 Diploma of Business'; // Course code
    test2Fields[fieldNames[15]] = '$200'; // Enrollment fee
    test2Fields[fieldNames[16]] = '$300'; // Material fee
    test2Fields[fieldNames[17]] = '$2000'; // Tuition fee
    test2Fields[fieldNames[18]] = '$2500'; // Total
    test2Fields[fieldNames[19]] = 'John Smith'; // Student name for financial section
    
    const pdfBuffer3 = await coeFiller.fillSpecificFields(test3Fields);
    const outputPath3 = path.join(__dirname, '../assets/test_financial_fields.pdf');
    fs.writeFileSync(outputPath3, pdfBuffer3);
    console.log(`✅ Financial test saved: ${outputPath3}`);
    
  } catch (error) {
    console.error('❌ Error testing specific fields:', error);
  }
}

testSpecificFields();
