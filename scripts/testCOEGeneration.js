// scripts/testCOEGeneration.js
const COETemplateFiller = require('../utils/coeTemplateFiller');
const path = require('path');

async function testCOEGeneration() {
  console.log('Testing COE generation with new template...');
  console.log('=' .repeat(60));

  try {
    const coeFiller = new COETemplateFiller();
    
    // Test data
    const testData = {
      user: {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        address: '123 Main Street',
        city: 'Melbourne',
        state: 'VIC',
        postalCode: '3000',
        country: 'Australia'
      },
      application: {
        _id: '507f1f77bcf86cd799439011',
        appCode: 'APP-2024-001',
        certificationId: {
          name: 'Certificate IV in Ageing Support',
          code: 'CHC43015'
        }
      },
      payment: {
        _id: '507f1f77bcf86cd799439012',
        totalAmount: 2500,
        status: 'completed',
        paymentType: 'one_time'
      },
      enrollmentFormData: {
        courseStartDate: new Date('2024-02-01'),
        courseEndDate: new Date('2024-05-01')
      }
    };

    console.log('Test data prepared:');
    console.log('- Student:', testData.user.firstName, testData.user.lastName);
    console.log('- Course:', testData.application.certificationId.name);
    console.log('- Application ID:', testData.application.appCode);
    console.log('- Payment:', `$${testData.payment.totalAmount}`);

    // Generate COE
    console.log('\nGenerating COE PDF...');
    const coeBuffer = await coeFiller.fillCOETemplate(testData, { returnBuffer: true });
    
    if (coeBuffer && coeBuffer.length > 0) {
      console.log(`✅ COE generated successfully!`);
      console.log(`   Size: ${coeBuffer.length} bytes`);
      
      // Save test file
      const testOutputPath = path.join(__dirname, '..', 'temp', 'test-coe.pdf');
      const fs = require('fs');
      
      // Ensure temp directory exists
      const tempDir = path.dirname(testOutputPath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      fs.writeFileSync(testOutputPath, coeBuffer);
      console.log(`   Saved to: ${testOutputPath}`);
      
      // Test field info
      console.log('\nField information:');
      const fieldInfo = await coeFiller.getFieldInfo();
      fieldInfo.forEach((field, index) => {
        console.log(`   ${index + 1}. ${field.name} (${field.type}): "${field.value}"`);
      });
      
    } else {
      console.log('❌ COE generation failed - no buffer returned');
    }

  } catch (error) {
    console.error('❌ Error testing COE generation:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testCOEGeneration().catch(console.error);
