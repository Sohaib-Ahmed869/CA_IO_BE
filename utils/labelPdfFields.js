const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

async function main() {
	// Configure input/output
	const inputPath = process.env.PDF_INPUT || path.join('assets', 'CAIO-Offer Letter (2).pdf');
	const outputPath = process.env.PDF_OUTPUT || path.join('assets', 'CAIO-Offer Letter (2) - labeled.pdf');

	if (!fs.existsSync(inputPath)) {
		console.error(`Input PDF not found at: ${inputPath}`);
		process.exit(1);
	}

	const inputBytes = fs.readFileSync(inputPath);
	const pdfDoc = await PDFDocument.load(inputBytes, { updateMetadata: false });
	const form = pdfDoc.getForm();
	const fields = form.getFields();

	// Collect field names with stable index
	const fieldEntries = fields.map((f, idx) => ({ index: idx + 1, name: f.getName(), type: f.constructor.name }));

	// Create a cover page with a legend of fields so users can map numbers to names
	const firstPage = pdfDoc.getPage(0);
	const { width: baseWidth, height: baseHeight } = firstPage.getSize();
	const cover = pdfDoc.insertPage(0, [baseWidth, baseHeight]);
	const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
	const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

	const margin = 36;
	let cursorY = baseHeight - margin;

	// Title
	cover.drawText('CAIO Offer Letter – Form Field Legend', {
		x: margin,
		y: cursorY,
		font: fontBold,
		size: 18,
		color: rgb(0.1, 0.1, 0.1),
	});
	cursorY -= 28;

	// Subtitle
	const subtitle = 'Use this legend to map Field # to the actual field name inside the PDF forms.';
	cover.drawText(subtitle, {
		x: margin,
		y: cursorY,
		font,
		size: 10,
		color: rgb(0.2, 0.2, 0.2),
	});
	cursorY -= 18;

	// Draw a simple two-column list if there are many fields
	const lineHeight = 14;
	const colWidth = (baseWidth - margin * 2) / 2;
	let col = 0;
	const rowsPerColumn = Math.floor((cursorY - margin) / lineHeight);

	fieldEntries.forEach((entry, i) => {
		if (i > 0 && i % rowsPerColumn === 0) {
			col += 1;
			cursorY = baseHeight - margin - 28 - 18; // reset below headers
		}
		const x = margin + col * colWidth;
		cover.drawText(`Field ${entry.index}: ${entry.name} (${entry.type})`, {
			x,
			y: cursorY,
			font,
			size: 10,
			color: rgb(0.15, 0.15, 0.15),
		});
		cursorY -= lineHeight;
	});

	// Also write the label directly inside each field so it's visible in-place
	// Use a standard font for field appearances
	form.updateFieldAppearances(font);
	fields.forEach((field, idx) => {
		try {
			const entry = fieldEntries[idx];
			const label = `Field ${entry.index}: ${entry.name} (${entry.type})`;
			// Only set text for text fields; skip others if present
			if (typeof field.setText === 'function') {
				field.setText(label);
			}
		} catch (e) {
			// ignore individual field errors to proceed with others
		}
	});

	// Save output
	const outBytes = await pdfDoc.save();
	fs.writeFileSync(outputPath, outBytes);

	// Also print a JSON mapping for easy copy/paste
	console.log(JSON.stringify({
		pdf: path.basename(inputPath),
		output: path.basename(outputPath),
		fieldCount: fieldEntries.length,
		fields: fieldEntries,
	}, null, 2));
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});


