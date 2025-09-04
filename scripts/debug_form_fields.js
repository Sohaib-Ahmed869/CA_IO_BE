// scripts/debug_form_fields.js
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function debugFormFields() {
  try {
    const pdfPath = path.join(__dirname, '../assets/Template_OFFER LETTER (1) - ALIT __ CEO Emily (1).pdf');
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    
    const fields = form.getFields();
    console.log(`\nTotal fields found: ${fields.length}`);
    console.log('\nField details:');
    
    fields.forEach((field, index) => {
      const name = field.getName();
      const type = field.constructor.name;
      console.log(`${index + 1}. ${name} (${type})`);
    });

    // Try to get field values to see which ones are empty
    console.log('\nChecking field values:');
    fields.forEach((field, index) => {
      try {
        const value = field.getText();
        console.log(`${index + 1}. ${field.getName()}: "${value}"`);
      } catch (error) {
        console.log(`${index + 1}. ${field.getName()}: [Error getting value: ${error.message}]`);
      }
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

debugFormFields();
