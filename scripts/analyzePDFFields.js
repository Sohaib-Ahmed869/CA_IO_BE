// scripts/analyzePDFFields.js
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// Check if pdf-lib is available for field analysis
let pdfLib;
try {
  pdfLib = require('pdf-lib');
} catch (e) {
  console.log('pdf-lib not available. Install it with: npm install pdf-lib');
  process.exit(1);
}

async function analyzePDFFields() {
  const pdfPath = path.join(__dirname, '..', 'assets', 'Confirmation of Enrolment Template _RPL - Victor Ying.pdf');
  
  if (!fs.existsSync(pdfPath)) {
    console.error('PDF file not found:', pdfPath);
    console.log('Make sure the file exists in the assets folder');
    return;
  }

  try {
    console.log('Analyzing PDF fields in:', pdfPath);
    console.log('=' .repeat(80));
    
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfDoc = await pdfLib.PDFDocument.load(pdfBuffer);
    
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    
    console.log(`Found ${fields.length} fillable fields:`);
    console.log('=' .repeat(80));
    
    fields.forEach((field, index) => {
      const fieldName = field.getName();
      const fieldType = field.constructor.name;
      
      console.log(`${index + 1}. Field Name: "${fieldName}"`);
      console.log(`   Type: ${fieldType}`);
      
      // Try to get additional field properties
      try {
        if (fieldType === 'PDFTextField') {
          const textField = field;
          console.log(`   Value: "${textField.getText() || '(empty)'}"`);
          console.log(`   Max Length: ${textField.getMaxLength() || 'unlimited'}`);
        } else if (fieldType === 'PDFCheckBox') {
          const checkBox = field;
          console.log(`   Checked: ${checkBox.isChecked()}`);
        } else if (fieldType === 'PDFRadioGroup') {
          const radioGroup = field;
          console.log(`   Selected: "${radioGroup.getSelected() || 'none'}"`);
          console.log(`   Options: ${radioGroup.getOptions().join(', ')}`);
        } else if (fieldType === 'PDFDropdown') {
          const dropdown = field;
          console.log(`   Selected: "${dropdown.getSelected() || 'none'}"`);
          console.log(`   Options: ${dropdown.getOptions().join(', ')}`);
        }
      } catch (e) {
        console.log(`   (Unable to read field properties)`);
      }
      
      console.log('');
    });
    
    console.log('=' .repeat(80));
    console.log('Field mapping suggestions:');
    console.log('=' .repeat(80));
    
    // Generate mapping suggestions based on common field names
    const mappingSuggestions = generateMappingSuggestions(fields);
    mappingSuggestions.forEach(suggestion => {
      console.log(suggestion);
    });
    
    console.log('\nNext steps:');
    console.log('1. Review the field names above');
    console.log('2. Tell me which field maps to which data (e.g., "field1 = student name")');
    console.log('3. I will update the COE generator to use the new template');
    
  } catch (error) {
    console.error('Error analyzing PDF:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Make sure the PDF has fillable form fields');
    console.log('2. Try opening the PDF in Adobe Acrobat and check if fields are editable');
    console.log('3. Ensure the PDF is not password protected');
  }
}

function generateMappingSuggestions(fields) {
  const suggestions = [];
  
  // Common field name patterns and their likely data sources
  const patterns = {
    'name': ['student', 'firstName', 'lastName', 'fullName'],
    'email': ['email', 'mail'],
    'phone': ['phone', 'mobile', 'contact'],
    'address': ['address', 'street', 'location'],
    'date': ['date', 'birth', 'enrollment', 'start', 'end'],
    'course': ['course', 'program', 'qualification', 'certification'],
    'rto': ['rto', 'provider', 'institute'],
    'cricos': ['cricos'],
    'abn': ['abn'],
    'payment': ['payment', 'fee', 'amount', 'cost'],
    'signature': ['signature', 'sign'],
    'reference': ['reference', 'ref', 'id'],
    'application': ['application', 'app', 'enrollment']
  };
  
  fields.forEach(field => {
    const fieldName = field.getName().toLowerCase();
    
    for (const [category, keywords] of Object.entries(patterns)) {
      if (keywords.some(keyword => fieldName.includes(keyword))) {
        suggestions.push(`"${field.getName()}" → likely ${category} data`);
        break;
      }
    }
  });
  
  if (suggestions.length === 0) {
    suggestions.push('No obvious field patterns detected. Manual mapping required.');
  }
  
  return suggestions;
}

// Run the analysis
analyzePDFFields().catch(console.error);
