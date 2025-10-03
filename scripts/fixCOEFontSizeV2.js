// scripts/fixCOEFontSizeV2.js
const fs = require('fs');
const path = require('path');
const pdfLib = require('pdf-lib');

async function fixCOEFontSizeV2() {
  console.log('Fixing COE template font size (Version 2)...');
  console.log('=' .repeat(50));

  try {
    const templatePath = path.join(__dirname, '..', 'assets', 'Confirmation of Enrolment Template _RPL - Victor Ying.pdf');
    const outputPath = path.join(__dirname, '..', 'assets', 'Confirmation of Enrolment Template _RPL - Victor Ying_FixedV2.pdf');
    
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
    
    fields.forEach((field, index) => {
      const fieldName = field.getName();
      console.log(`  ${index + 1}. ${fieldName}`);
      
      try {
        if (field.constructor.name === 'PDFTextField') {
          // Try to access the underlying AcroForm field
          const acroField = field.acroField;
          if (acroField) {
            // Set default appearance with smaller font size
            // The format is: /FontName fontSize Tf color
            // Using Helvetica (standard PDF font) with size 10
            const defaultAppearance = '/Helv 10 Tf 0 0 0 rg';
            
            try {
              acroField.setDefaultAppearance(defaultAppearance);
              console.log(`    ✅ Set default appearance: ${defaultAppearance}`);
            } catch (appearanceError) {
              console.log(`    ⚠️ Could not set appearance: ${appearanceError.message}`);
              
              // Try alternative approach - set DA (Default Appearance) directly
              try {
                const daString = pdfDoc.context.obj(defaultAppearance);
                acroField.dict.set(pdfLib.PDFName.of('DA'), daString);
                console.log(`    ✅ Set DA directly: ${defaultAppearance}`);
              } catch (daError) {
                console.log(`    ⚠️ Could not set DA: ${daError.message}`);
              }
            }
          } else {
            console.log(`    ⚠️ No AcroForm field found`);
          }
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
fixCOEFontSizeV2().catch(console.error);
