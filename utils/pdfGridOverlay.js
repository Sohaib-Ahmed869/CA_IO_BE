// utils/pdfGridOverlay.js
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

async function generateGridOverlay(inputPath, outputPath, options = {}) {
  const {
    step = 10,
    highlightStep = 50,
    color = rgb(0.8, 0.8, 0.8),
    highlightColor = rgb(0.6, 0.6, 0.6),
    labelColor = rgb(0.2, 0.2, 0.2),
    labelEvery = 50,
    labelFontSize = 6,
  } = options;

  const bytes = fs.readFileSync(inputPath);
  const pdfDoc = await PDFDocument.load(bytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pageCount = pdfDoc.getPageCount();
  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.getPage(i);
    const { width, height } = page.getSize();

    // Vertical lines
    for (let x = 0; x <= width; x += step) {
      page.drawLine({
        start: { x, y: 0 },
        end: { x, y: height },
        thickness: x % highlightStep === 0 ? 0.6 : 0.2,
        color: x % highlightStep === 0 ? highlightColor : color,
      });
      if (x % labelEvery === 0) {
        page.drawText(String(x), { x: x + 2, y: 2, size: labelFontSize, font, color: labelColor });
        page.drawText(String(x), { x: x + 2, y: height - 8, size: labelFontSize, font, color: labelColor });
      }
    }

    // Horizontal lines
    for (let y = 0; y <= height; y += step) {
      page.drawLine({
        start: { x: 0, y },
        end: { x: width, y },
        thickness: y % highlightStep === 0 ? 0.6 : 0.2,
        color: y % highlightStep === 0 ? highlightColor : color,
      });
      if (y % labelEvery === 0) {
        page.drawText(String(y), { x: 2, y: y + 2, size: labelFontSize, font, color: labelColor });
        page.drawText(String(y), { x: width - 18, y: y + 2, size: labelFontSize, font, color: labelColor });
      }
    }

    // Origin marker
    page.drawCircle({ x: 0, y: 0, size: 2, color: rgb(1, 0, 0) });
  }

  const out = await pdfDoc.save();
  fs.writeFileSync(outputPath, out);
}

module.exports = { generateGridOverlay };
