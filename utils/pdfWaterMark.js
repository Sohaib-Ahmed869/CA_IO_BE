// utils/pdfWatermark.js
// Lightweight helper to apply a static PDF watermark layer to every page
// of a generated PDF buffer, using a pre-built watermark.pdf in /assets.

const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");

const WATERMARK_PATH =
  process.env.PDF_WATERMARK_PATH ||
  path.join(__dirname, "..", "assets", "watermark.pdf");

/**
 * Apply a static watermark PDF (single-page) onto every page of an input PDF.
 * If watermark file is missing or anything fails, it simply returns the
 * original buffer so exports never break.
 *
 * @param {Buffer} inputBuffer - Original PDF bytes
 * @returns {Promise<Buffer>} - Watermarked PDF bytes
 */
async function applyStaticPdfWatermark(inputBuffer) {
  try {
    if (!inputBuffer || !Buffer.isBuffer(inputBuffer)) {
      return inputBuffer;
    }

    if (!fs.existsSync(WATERMARK_PATH)) {
      console.warn(
        "[pdfWatermark] watermark.pdf not found, skipping PDF watermark layer."
      );
      return inputBuffer;
    }

    const watermarkBytes = fs.readFileSync(WATERMARK_PATH);

    const [pdfDoc, watermarkDoc] = await Promise.all([
      PDFDocument.load(inputBuffer),
      PDFDocument.load(watermarkBytes),
    ]);

    // Embed the first page of the watermark PDF into the target document
    const [embeddedPage] = await pdfDoc.embedPages([
      watermarkDoc.getPage(0),
    ]);

    const wmWidth = embeddedPage.width;
    const wmHeight = embeddedPage.height;

    const pages = pdfDoc.getPages();

    for (const page of pages) {
      const { width, height } = page.getSize();

      // Draw the embedded watermark page scaled to fit, centered, low opacity
      const scale = Math.min(width / wmWidth, height / wmHeight);

      page.drawPage(embeddedPage, {
        x: (width - wmWidth * scale) / 2,
        y: (height - wmHeight * scale) / 2,
        xScale: scale,
        yScale: scale,
        opacity: 0.08,
      });
    }

    const outBytes = await pdfDoc.save();
    return Buffer.from(outBytes);
  } catch (err) {
    console.warn(
      "[pdfWatermark] Failed to apply static PDF watermark, returning original buffer:",
      err.message
    );
    return inputBuffer;
  }
}

module.exports = {
  applyStaticPdfWatermark,
};

