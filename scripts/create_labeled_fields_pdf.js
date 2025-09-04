// scripts/create_labeled_fields_pdf.js
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function createLabeledFieldsPDF() {
  try {
    console.log('Creating PDF with labeled fields...\n');
    
    const pdfPath = path.join(__dirname, '../assets/Template_OFFER LETTER (1) - ALIT __ CEO Emily (1).pdf');
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    
    const fields = form.getFields();
    console.log(`Found ${fields.length} form fields\n`);
    
    // Fill each field with its field name and position number
    fields.forEach((field, index) => {
      try {
        const fieldName = field.getName();
        const label = `FIELD ${index + 1}: ${fieldName}`;
        field.setText(label);
        console.log(`Labeled field ${index + 1}: ${fieldName}`);
      } catch (error) {
        console.warn(`Could not label field ${index + 1}:`, error.message);
      }
    });

    // Flatten the form to make it non-editable
    form.flatten();

    // Generate the PDF buffer
    const labeledPdfBytes = await pdfDoc.save();
    
    const outputPath = path.join(__dirname, '../assets/coe_template_with_field_labels.pdf');
    fs.writeFileSync(outputPath, labeledPdfBytes);
    
    console.log(`\n✅ Labeled PDF created: ${outputPath}`);
    console.log(`File size: ${labeledPdfBytes.length} bytes`);
    console.log('\nNow you can open this PDF and see which field corresponds to which content!');
    
  } catch (error) {
    console.error('Error creating labeled PDF:', error);
  }
}

createLabeledFieldsPDF();
