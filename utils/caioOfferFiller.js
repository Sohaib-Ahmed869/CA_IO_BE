const fs = require('fs');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const path = require('path');

// Default COE template: Confirmation of Enrolment (RPL) PDF
// Resolve path relative to project root
const DEFAULT_COE_TEMPLATE =
	process.env.COE_TEMPLATE_PATH ||
	path.join(__dirname, '..', 'assets', 'Confirmation of Enrolment Template _RPL - Victor Ying_Fixed.pdf');

async function fillOfferLetter({
	inputPath = DEFAULT_COE_TEMPLATE,
	outputPath = path.join(__dirname, '..', 'assets', 'CAIO-Offer Letter - filled.pdf'),
	data,
	returnBuffer = true,
}) {
	// Resolve input path if it's relative
	const resolvedInputPath = path.isAbsolute(inputPath) 
		? inputPath 
		: path.resolve(__dirname, '..', inputPath);
	
	// Check if file exists
	if (!fs.existsSync(resolvedInputPath)) {
		throw new Error(`COE template file not found at: ${resolvedInputPath}. Please check COE_TEMPLATE_PATH environment variable or ensure the template file exists in assets folder.`);
	}
	
	console.log(`Loading COE template from: ${resolvedInputPath}`);
	const existingPdfBytes = fs.readFileSync(resolvedInputPath);
	const pdfDoc = await PDFDocument.load(existingPdfBytes);
	const form = pdfDoc.getForm();
	const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

	// Default data if not provided
	const defaultData = {
		dateOfIssue: new Date().toLocaleDateString('en-AU', { year: 'numeric', month: '2-digit', day: '2-digit' }),
		referenceNumber: "CERT-000001", // Will be overridden with appCode
		studentName: "Sample Student",
		title: "Mr",
		familyName: "Student",
		givenName: "Sample",
		dateOfBirth: "1990-01-01", // YYYY-MM-DD for internal processing
		cricos: "CRICOS 099180J (CHC43015)",
		courseCode: "CHC43015",
		courseDetails: "Certificate IV in Ageing Support",
		courseStartDate: "2025-10-01",
		courseEndDate: "2026-03-31",
		durationWeeks: 4, // Default as requested
		cricosCode: "CRICOS 099180J",
		tuitionFee: "$2,500.00",
		total: "$2,500.00",
		totalAmount: "$2,500.00",
		orientationDate: new Date().toLocaleDateString('en-AU', { year: 'numeric', month: '2-digit', day: '2-digit' }),
		orientationTime: "10:00 AM",
		orientationLocation: "Shop 3/1236 Canterbury Rd, Roselands NSW 2196",
		studentSignatureText: "Sample Student",
		signatureDay: "24",
		signatureMonth: "09",
		signatureYear: "2025",
	};

	const fillData = { ...defaultData, ...data };

	// Helper to format dates
	const formatDate = (dateString, format = 'en-AU') => {
		if (!dateString) return '';
		const date = new Date(dateString);
		if (isNaN(date)) return dateString; // Return original if invalid date
		if (format === 'numeric-au') {
			return date.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
		}
		return date.toLocaleDateString(format, { year: 'numeric', month: 'long', day: 'numeric' });
	};

	// Fill AcroForm fields
	const fields = form.getFields();
	fields.forEach(field => {
		const name = field.getName();
		let valueToSet = '';

		switch (name) {
			// New COE template fields
			// 0 Text-9vtr2VWwTb  (Date - Australian)
			case "Text-9vtr2VWwTb":
				valueToSet = formatDate(fillData.dateOfIssue || new Date(), 'numeric-au');
				break;
			// 1 Text-Fh2rh0QTMj  (Student Id)
			case "Text-Fh2rh0QTMj":
				valueToSet =
					fillData.studentId ||
					fillData.referenceNumber ||
					fillData.appCode ||
					"";
				break;
			// 2 Text-1heFDAV9R2  (To: Name of student)
			case "Text-1heFDAV9R2":
				valueToSet = fillData.studentName;
				break;
			// 3 Text-RGfVKELzPD  (Name of student)
			case "Text-RGfVKELzPD":
				valueToSet = fillData.studentName;
				break;
			// 4 Text-zTndbwCiYz  (Certification Name)
			case "Text-zTndbwCiYz":
				valueToSet =
					fillData.courseDetails ||
					fillData.certificationName ||
					"";
				break;

			// Legacy CAIO Offer Letter fields (kept for backward compatibility)
			case "Text-UllZmITHRQ": // Field 1: Date of Issue
				valueToSet = formatDate(fillData.dateOfIssue, 'numeric-au');
				break;
			case "Text-AZg4toGk3f": // Field 2: Reference Number (appCode)
				valueToSet = fillData.referenceNumber || fillData.appCode || "CERT-000001";
				break;
			case "Text-gZOv54XQEC": // Field 3: Dear [Name] - not used in new mapping
				valueToSet = fillData.studentName;
				break;
			case "Text-ph3TyKtHQ_": // Field 4: Title
				valueToSet = fillData.title;
				break;
			case "Text-vG0_bCqjRr": // Field 5: Family Name
				valueToSet = fillData.familyName;
				break;
			case "Text-cGVfjqg9Rh": // Field 6: Given Name
				valueToSet = fillData.givenName;
				break;
			case "Text-rbjXAwIE8h": // Field 7: Date of Birth
				valueToSet = formatDate(fillData.dateOfBirth, 'numeric-au');
				break;
			case "Text-kgaiWFlG1z": // Field 8: CRICOS
				valueToSet = fillData.cricos;
				break;
			case "Text-FciXjOKmbX": // Field 9: Course Details
				valueToSet = fillData.courseDetails;
				break;
			case "Text-01AbUeelhn": // Field 10: Course Start - End Date
				valueToSet = `${formatDate(fillData.courseStartDate, 'numeric-au')} - ${formatDate(fillData.courseEndDate, 'numeric-au')}`;
				break;
			case "Text-Gw3ypk2MGf": // Field 11: Duration (weeks)
				valueToSet = String(fillData.durationWeeks);
				break;
			case "Text-osQ4UGNhGh": // Field 12: CRICOS Code
				valueToSet = fillData.cricosCode;
				break;
			case "Text-fP3cOT0Pab": // Field 13: Tuition fee
				valueToSet = fillData.tuitionFee;
				break;
			case "Text-Aeg0tHM-TH": // Field 14: Total
				valueToSet = fillData.total;
				break;
			case "Text-Hz7YDsIGEt": // Field 15: Total
				valueToSet = fillData.totalAmount;
				break;
			case "Text-PAIz_x3TSW": // Field 16: Orientation Date
				valueToSet = formatDate(fillData.orientationDate, 'numeric-au');
				break;
			case "Text-HXXwLRea8V": // Field 17: Orientation Time
				valueToSet = fillData.orientationTime;
				break;
			case "Text-aK_6lQw0OV": // Field 18: Orientation Location
				valueToSet = fillData.orientationLocation;
				break;
			case "Text-9XDRGZYLuf": // Field 19: I, _________________________ understand that:
				valueToSet = fillData.studentName; // Student name in the blank
				break;
			case "Text-4KEff1rRyf": // Field 20: Student's Signature
				valueToSet = fillData.studentSignatureText;
				break;
			case "Text-VvdLs7vfPt": // Field 21: Date day
				valueToSet = fillData.signatureDay;
				break;
			case "Text-EeDtfVkrs1": // Field 22: Date month
				valueToSet = fillData.signatureMonth;
				break;
			case "Text-vVr8ya5HLk": // Field 23: Date year
				valueToSet = fillData.signatureYear;
				break;
			default:
				// For other fields, if they exist in fillData, set them.
				if (fillData[name]) {
					valueToSet = String(fillData[name]);
				}
				break;
		}

		if (field.setText && valueToSet) {
			try {
				field.setText(valueToSet);
				field.setFontSize(11); // Set text size to 11pt
				console.log(`✓ Filled field "${name}": ${valueToSet.substring(0, 50)}${valueToSet.length > 50 ? '...' : ''}`);
			} catch (fieldError) {
				console.warn(`⚠ Could not fill field "${name}": ${fieldError.message}`);
			}
		}
	});

	// Flatten the form fields to ensure values are visible in all PDF viewers
	form.flatten();
	console.log('✓ COE PDF form flattened successfully');

	const outBytes = await pdfDoc.save();
	console.log(`✓ COE PDF generated successfully (${outBytes.length} bytes)`);
	
	if (outputPath && !returnBuffer) {
		// Ensure output directory exists
		const outputDir = path.dirname(outputPath);
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir, { recursive: true });
		}
		fs.writeFileSync(outputPath, outBytes);
		console.log(`✓ COE PDF saved to: ${outputPath}`);
	}
	
	return returnBuffer ? { outputPath, buffer: outBytes } : { outputPath };
}

// CLI execution
if (require.main === module) {
	const inputPdfPath = process.argv[2] || 'assets/CAIO-Offer Letter (2).pdf';
	const outputPdfPath = process.argv[3] || 'assets/CAIO-Offer Letter - filled.pdf';
	const dataJsonPath = process.argv[4];

	let data = {};
	if (dataJsonPath && fs.existsSync(dataJsonPath)) {
		data = JSON.parse(fs.readFileSync(dataJsonPath, 'utf8'));
	} else if (dataJsonPath) {
		console.warn(`Warning: Data JSON file not found at ${dataJsonPath}. Using default sample data.`);
	} else {
		console.log('No data JSON file provided. Using default sample data.');
	}

	fillOfferLetter({ inputPath: inputPdfPath, outputPath: outputPdfPath, data, returnBuffer: false })
		.catch(console.error);
}

module.exports = { fillOfferLetter };
