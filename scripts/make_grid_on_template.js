// scripts/make_grid_on_template.js
const path = require('path');
const fs = require('fs');
const { generateGridOverlay } = require('../utils/pdfGridOverlay');

(async () => {
  try {
    const input = path.join(process.cwd(), 'assets', 'coe_template.pdf');
    const output = path.join(process.cwd(), 'assets', 'coe_template_grid.pdf');
    await generateGridOverlay(input, output, { step: 10, highlightStep: 50, labelEvery: 50 });
    console.log('Wrote', output);
  } catch (err) {
    console.error('grid_error', err);
    process.exit(1);
  }
})();
