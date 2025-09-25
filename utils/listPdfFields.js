// List AcroForm fields from a PDF so we can map them
// Usage: node utils/listPdfFields.js [pathToPdf]

const fs = require('fs');
const path = require('path');

async function main() {
  const target = process.argv[2] || path.join(__dirname, '..', 'assets', 'CAIO-Offer Letter (1).pdf');
  if (!fs.existsSync(target)) {
    console.error('PDF not found at:', target);
    process.exit(1);
  }

  // Lazy-load pdf-lib to avoid adding to cold start if unused
  const { PDFDocument } = require('pdf-lib');
  const bytes = fs.readFileSync(target);
  const pdfDoc = await PDFDocument.load(bytes);

  const form = pdfDoc.getForm();
  const fields = form.getFields();

  if (!fields || fields.length === 0) {
    console.log('No AcroForm fields found.');
    return;
  }

  const out = fields.map((f) => {
    const name = f.getName();
    const type = f.constructor && f.constructor.name ? f.constructor.name : 'Unknown';
    let value = null;
    try {
      // Attempt to read value depending on field subtype
      if (typeof f.getText === 'function') value = f.getText();
      else if (typeof f.isChecked === 'function') value = f.isChecked();
      else if (typeof f.getOptions === 'function') value = f.getOptions();
    } catch (_) {}
    return { name, type, value };
  });

  console.log(JSON.stringify({ pdf: path.basename(target), fieldCount: out.length, fields: out }, null, 2));
}

main().catch((err) => {
  console.error('Error reading PDF fields:', err);
  process.exit(1);
});


