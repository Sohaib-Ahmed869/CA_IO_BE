// scripts/analyze_field_positions.js
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function analyzeFieldPositions() {
  try {
    const pdfPath = path.join(__dirname, '../assets/Template_OFFER LETTER (1) - ALIT __ CEO Emily (1).pdf');
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    
    const fields = form.getFields();
    console.log(`\nAnalyzing ${fields.length} form fields...\n`);
    
    // Try to get field positions and other properties
    fields.forEach((field, index) => {
      const name = field.getName();
      try {
        // Get field properties
        const widget = field.acroField.getWidgets()[0];
        const rect = widget.getRectangle();
        const page = pdfDoc.getPages()[widget.getPageRef().objectNumber - 1];
        const pageNumber = pdfDoc.getPages().indexOf(page) + 1;
        
        console.log(`Field ${index + 1}: ${name}`);
        console.log(`  Page: ${pageNumber}`);
        console.log(`  Position: x=${rect.x}, y=${rect.y}, width=${rect.width}, height=${rect.height}`);
        console.log(`  Type: ${field.constructor.name}`);
        console.log('');
        
      } catch (error) {
        console.log(`Field ${index + 1}: ${name} - Error getting position: ${error.message}`);
      }
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

analyzeFieldPositions();
