// scripts/inspect_pdf.js
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

(async () => {
  try {
    const inputPath = process.argv[2] || 'assets/coe_template.pdf';
    const buf = fs.readFileSync(inputPath);
    const pdf = await PDFDocument.load(buf);

    const pageCount = pdf.getPageCount();
    const sizes = [];
    for (let i = 0; i < pageCount; i++) {
      const page = pdf.getPage(i);
      const { width, height } = page.getSize();
      sizes.push({ page: i + 1, width, height });
    }

    let hasForm = false;
    let fieldNames = [];
    try {
      const form = pdf.getForm();
      if (form) {
        const fields = form.getFields();
        if (fields && fields.length > 0) {
          hasForm = true;
          fieldNames = fields.map(f => f.getName());
        }
      }
    } catch (_) {
      // No form present or not supported
    }

    console.log(JSON.stringify({ pageCount, sizes, hasForm, fieldNames }, null, 2));
  } catch (err) {
    console.error('inspect_error', err.message);
    process.exit(1);
  }
})();
