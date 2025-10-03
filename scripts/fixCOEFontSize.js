// scripts/fixCOEFontSize.js
const fs = require('fs');
const path = require('path');
const pdfLib = require('pdf-lib');

async function fixCOEFontSize() {
  console.log('Fixing COE template font size...');
  console.log('=' .repeat(50));

  try {
    const templatePath = path.join(__dirname, '..', 'assets', 'Confirmation of Enrolment Template _RPL - Victor Ying.pdf');
    const outputPath = path.join(__dirname, '..', 'assets', 'Confirmation of Enrolment Template _RPL - Victor Ying_Fixed.pdf');
    
    if (!fs.existsSync(templatePath)) {
      console.error('Template file not found:', templatePath);
      return;
    }

    console.log('Loading PDF template...');
    const pdfBuffer = fs.readFileSync(templatePath);
    const pdfDoc = await pdfLib.PDFDocument.load(pdfBuffer);
    
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    
    console.log(`Found ${fields.length} form fields to fix:`);
    
    // Get a font that matches the document
    const fonts = await pdfDoc.embedFont('Helvetica');
    
    fields.forEach((field, index) => {
      const fieldName = field.getName();
      console.log(`  ${index + 1}. ${fieldName}`);
      
      try {
        if (field.constructor.name === 'PDFTextField') {
          // Set font size to match document text (typically 10-11pt)
          const fontSize = 10; // Smaller font size to match document
          
          // Update the field's appearance with the correct font and size
          field.updateAppearances({
            font: fonts,
            fontSize: fontSize,
            color: pdfLib.rgb(0, 0, 0) // Black color
          });
          
          console.log(`    ✅ Set font size to ${fontSize}pt`);
        }
      } catch (error) {
        console.log(`    ⚠️ Could not update field: ${error.message}`);
      }
    });
    
    console.log('\nSaving fixed template...');
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);
    
    console.log('✅ Fixed template saved to:', outputPath);
    console.log('\nNext steps:');
    console.log('1. Review the fixed template');
    console.log('2. If it looks good, replace the original template');
    console.log('3. Test COE generation with the new template');
    
  } catch (error) {
    console.error('❌ Error fixing font size:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the font fix
fixCOEFontSize().catch(console.error);
