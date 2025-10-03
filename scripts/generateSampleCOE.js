// scripts/generateSampleCOE.js
const COETemplateFiller = require('../utils/coeTemplateFiller');
const path = require('path');
const fs = require('fs');

async function generateSampleCOE() {
  console.log('Generating sample COE PDF...');
  console.log('=' .repeat(50));

  try {
    const coeFiller = new COETemplateFiller();
    
    // Sample data for testing
    const sampleData = {
      user: {
        firstName: 'Victor',
        lastName: 'Ying',
        email: 'victor.ying@example.com',
        address: '456 Collins Street',
        city: 'Melbourne',
        state: 'VIC',
        postalCode: '3000',
        country: 'Australia',
        phoneNumber: '0412 345 678',
        phoneCode: '+61'
      },
      application: {
        _id: '507f1f77bcf86cd799439011',
        appCode: 'RPL-2024-001',
        certificationId: {
          name: 'Certificate IV in Ageing Support',
          code: 'CHC43015',
          price: 2500
        }
      },
      payment: {
        _id: '507f1f77bcf86cd799439012',
        totalAmount: 2500,
        status: 'completed',
        paymentType: 'one_time',
        completedAt: new Date()
      },
      enrollmentFormData: {
        courseStartDate: new Date('2024-02-01'),
        courseEndDate: new Date('2024-05-01'),
        durationWeeks: 12
      }
    };

    console.log('Sample data:');
    console.log(`- Student: ${sampleData.user.firstName} ${sampleData.user.lastName}`);
    console.log(`- Email: ${sampleData.user.email}`);
    console.log(`- Address: ${sampleData.user.address}, ${sampleData.user.city}, ${sampleData.user.state} ${sampleData.user.postalCode}`);
    console.log(`- Course: ${sampleData.application.certificationId.name}`);
    console.log(`- Application ID: ${sampleData.application.appCode}`);
    console.log(`- Payment: $${sampleData.payment.totalAmount} (${sampleData.payment.status})`);

    console.log('\nGenerating COE PDF...');
    
    // Generate the COE
    const coeBuffer = await coeFiller.fillCOETemplate(sampleData, { returnBuffer: true });
    
    if (coeBuffer && coeBuffer.length > 0) {
      // Create output directory if it doesn't exist
      const outputDir = path.join(__dirname, '..', 'temp');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `Sample-COE-${sampleData.user.firstName}-${sampleData.user.lastName}-${timestamp}.pdf`;
      const outputPath = path.join(outputDir, filename);
      
      // Save the PDF
      fs.writeFileSync(outputPath, coeBuffer);
      
      console.log('✅ COE generated successfully!');
      console.log(`   File: ${filename}`);
      console.log(`   Size: ${coeBuffer.length} bytes`);
      console.log(`   Full path: ${outputPath}`);
      console.log(`   Location: ${path.relative(process.cwd(), outputPath)}`);
      
      // Show what was filled in each field
      console.log('\nField values filled:');
      console.log('=' .repeat(30));
      console.log(`Date: ${new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })}`);
      console.log(`Student ID: ${sampleData.application.appCode}`);
      console.log(`Address: ${sampleData.user.address}, ${sampleData.user.city}, ${sampleData.user.state} ${sampleData.user.postalCode}, ${sampleData.user.country}`);
      console.log(`Student Name: ${sampleData.user.firstName} ${sampleData.user.lastName}`);
      console.log(`Course: ${sampleData.application.certificationId.name}`);
      
      console.log('\n📁 You can now open the PDF file to see the result!');
      
    } else {
      console.log('❌ COE generation failed - no buffer returned');
    }

  } catch (error) {
    console.error('❌ Error generating sample COE:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the sample generation
generateSampleCOE().catch(console.error);
