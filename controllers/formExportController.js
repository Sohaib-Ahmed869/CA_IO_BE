// controllers/formExportController.js
const FormSubmission = require("../models/formSubmission");
const FormTemplate = require("../models/formTemplate");
const Application = require("../models/application");
const User = require("../models/user");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const https = require('https');

const formExportController = {
  // Download all forms for a specific application as PDF
  downloadApplicationForms: async (req, res) => {
    try {
      console.log("here");
      const { applicationId } = req.params;
      const { format = "pdf" } = req.query; // Support different formats

      // Get application with related data
      const application = await Application.findById(applicationId)
        .populate("userId", "firstName lastName email")
        .populate("certificationId", "name");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      // Get only finalized form submissions (exclude pending)
      const submissions = await FormSubmission.find({
        applicationId: applicationId,
        status: { $in: ["submitted", "assessed"] },
      }).populate("formTemplateId");

      if (submissions.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No submitted or assessed forms found for this application",
        });
      }

      if (format === "pdf") {
        await generatePDFReport(res, application, submissions);
      } else if (format === "json") {
        generateJSONReport(res, application, submissions);
      } else {
        return res.status(400).json({
          success: false,
          message: "Unsupported format. Use 'pdf' or 'json'",
        });
      }
    } catch (error) {
      console.error("Download forms error:", error);
      res.status(500).json({
        success: false,
        message: "Error downloading forms",
        error: error.message,
      });
    }
  },

  // Download all forms across all applications (Admin only)
  downloadAllForms: async (req, res) => {
    try {
      const { format = "pdf", certificationId, dateFrom, dateTo } = req.query;

      // Build query filters
      let submissionQuery = { status: "submitted" };
      let applicationQuery = {};

      if (certificationId) {
        applicationQuery.certificationId = certificationId;
      }

      if (dateFrom || dateTo) {
        submissionQuery.submittedAt = {};
        if (dateFrom) submissionQuery.submittedAt.$gte = new Date(dateFrom);
        if (dateTo) submissionQuery.submittedAt.$lte = new Date(dateTo);
      }

      // Get applications first if we have filters
      let applicationIds = [];
      if (Object.keys(applicationQuery).length > 0) {
        const applications = await Application.find(applicationQuery).select(
          "_id"
        );
        applicationIds = applications.map((app) => app._id);
        submissionQuery.applicationId = { $in: applicationIds };
      }

      // Get all submissions with populated data
      const submissions = await FormSubmission.find(submissionQuery)
        .populate({
          path: "applicationId",
          populate: [
            { path: "userId", select: "firstName lastName email" },
            { path: "certificationId", select: "name" },
          ],
        })
        .populate("formTemplateId")
        .sort({ submittedAt: -1 });

      if (submissions.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No forms found matching the criteria",
        });
      }

      if (format === "pdf") {
        await generateAllFormsPDF(res, submissions);
      } else if (format === "json") {
        generateAllFormsJSON(res, submissions);
      } else {
        return res.status(400).json({
          success: false,
          message: "Unsupported format. Use 'pdf' or 'json'",
        });
      }
    } catch (error) {
      console.error("Download all forms error:", error);
      res.status(500).json({
        success: false,
        message: "Error downloading all forms",
        error: error.message,
      });
    }
  },

  // Get form export statistics
  getExportStats: async (req, res) => {
    try {
      const stats = await FormSubmission.aggregate([
        { $match: { status: "submitted" } },
        {
          $group: {
            _id: {
              formTemplate: "$formTemplateId",
              month: { $month: "$submittedAt" },
              year: { $year: "$submittedAt" },
            },
            count: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: "formtemplates",
            localField: "_id.formTemplate",
            foreignField: "_id",
            as: "template",
          },
        },
        {
          $project: {
            formName: { $arrayElemAt: ["$template.name", 0] },
            month: "$_id.month",
            year: "$_id.year",
            count: 1,
          },
        },
        { $sort: { year: -1, month: -1 } },
      ]);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("Export stats error:", error);
      res.status(500).json({
        success: false,
        message: "Error getting export statistics",
        error: error.message,
      });
    }
  },
};

// PDF Generation Functions
async function generatePDFReport(res, application, submissions) {
  // Add timeout to prevent hanging
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "PDF generation timed out. Please try again.",
      });
    }
  }, 30000); // 30 second timeout

  try {
    const doc = new PDFDocument({ margin: 50, size: "A4" });

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="forms_${application._id}_${Date.now()}.pdf"`
    );

    doc.pipe(res);

    // Add logo and header
    await addPDFHeader(doc, application);

    // Add each form submission
    for (let i = 0; i < submissions.length; i++) {
      if (i > 0) {
        doc.addPage();
        // Add header to new page
        addPageHeader(doc, application);
        // Add form separator
        addFormSeparator(doc);
      }
      await addFormSubmissionToPDF(doc, submissions[i]);
    }

    doc.end();
    clearTimeout(timeout);
  } catch (error) {
    clearTimeout(timeout);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Error generating PDF",
        error: error.message,
      });
    }
  }
}

async function generateAllFormsPDF(res, submissions) {
  // Add timeout to prevent hanging
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "PDF generation timed out. Please try again.",
      });
    }
  }, 30000); // 30 second timeout

  try {
    const doc = new PDFDocument({ margin: 50, size: "A4" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="all_forms_${Date.now()}.pdf"`
    );

    doc.pipe(res);

    // Add header
    await addPDFHeader(doc, null, "All Forms Export");

    // Group submissions by application
    const submissionsByApp = submissions.reduce((acc, submission) => {
      const appId = submission.applicationId._id.toString();
      if (!acc[appId]) acc[appId] = [];
      acc[appId].push(submission);
      return acc;
    }, {});

    let isFirstApp = true;
    for (const [appId, appSubmissions] of Object.entries(submissionsByApp)) {
      if (!isFirstApp) doc.addPage();
      isFirstApp = false;

      // Add application header
      doc
        .fontSize(16)
        .fillColor("#1f4e79")
        .text(
          `Application: ${appSubmissions[0].applicationId.certificationId.name}`,
          50,
          doc.y + 20
        );
      doc
        .fontSize(12)
        .text(
          `Student: ${appSubmissions[0].applicationId.userId.firstName} ${appSubmissions[0].applicationId.userId.lastName}`,
          50,
          doc.y + 5
        );
      doc.text(
        `Email: ${appSubmissions[0].applicationId.userId.email}`,
        50,
        doc.y + 5
      );
      doc.moveDown();

      // Add each form
      for (let i = 0; i < appSubmissions.length; i++) {
        if (i > 0) {
          doc.addPage();
          // Add header to new page
          addPageHeader(doc, appSubmissions[i].applicationId);
          // Add form separator
          addFormSeparator(doc);
        }
        await addFormSubmissionToPDF(doc, appSubmissions[i]);
      }
    }

    doc.end();
    clearTimeout(timeout);
  } catch (error) {
    clearTimeout(timeout);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Error generating PDF",
        error: error.message,
      });
    }
  }
}

async function addPDFHeader(doc, application, title = null) {
  const pageWidth = 595; // A4 width in points
  const margin = 50;
  
  // Professional header with proper spacing
  // Logo area - left side
  try {
    const logoUrl = process.env.LOGO_URL || "https://certified.io/images/alitlogo.png";
    const https = require("https");
    const logoResponse = await new Promise((resolve, reject) => {
      https.get(logoUrl, (res) => {
        const data = [];
        res.on("data", (chunk) => data.push(chunk));
        res.on("end", () => resolve(Buffer.concat(data)));
        res.on("error", reject);
      });
    });
    doc.image(logoResponse, margin, 40, { width: 60, height: 45, fit: [60, 45] });
  } catch (error) {
    // Fallback text logo
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor("#1f4e79")
      .text("ALIT", margin, 55);
  }

  // Institution name next to logo
  doc
    .fontSize(12)
    .font('Helvetica-Bold')
    .fillColor("#000000")
    .text("AUSTRALIAN LEADING INSTITUTE OF TECHNOLOGY", margin + 70, 50);

  // Professional separator line
  doc
    .strokeColor("#000000")
    .lineWidth(1)
    .moveTo(margin, 80)
    .lineTo(pageWidth - margin, 80)
    .stroke();

  // Document title - Centered and professional
  const titleText = title || `Form Submissions - ${application?.certificationId?.name || "Application"}`;
  doc
    .fontSize(16)
    .font('Helvetica-Bold')
    .fillColor("#000000")
    .text(titleText, margin, 100, {
      width: pageWidth - (margin * 2),
      align: 'center',
      lineGap: 3
    });

  // Student Information - Clean and organized
  if (application) {
    const studentInfoY = 140;
    
    // Student name - Bold
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor("#000000")
      .text(`Student: ${application.userId.firstName} ${application.userId.lastName}`, margin, studentInfoY);
    
    // Application ID
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor("#333333")
      .text(`Application ID: ${application._id}`, margin, studentInfoY + 20);
    
    // Generated date
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor("#333333")
      .text(
        `Generated: ${new Date().toLocaleDateString('en-AU', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}`,
        margin,
        studentInfoY + 40
      );
  }

  // Clean separator line under student info
  doc
    .strokeColor("#cccccc")
    .lineWidth(0.5)
    .moveTo(margin, 200)
    .lineTo(pageWidth - margin, 200)
    .stroke();

  // Set starting position for content
  doc.y = 220;
}

// Simple page header for subsequent pages (minimal)
function addPageHeader(doc, application) {
  const pageWidth = 595;
  const margin = 50;
  
  // Just add a simple header line
  doc
    .strokeColor("#cccccc")
    .lineWidth(0.5)
    .moveTo(margin, 30)
    .lineTo(pageWidth - margin, 30)
    .stroke();

  // Set starting position for content
  doc.y = 50;
}

// Add form separator for better visual separation
function addFormSeparator(doc) {
  // Add a horizontal line
  doc
    .strokeColor("#cccccc")
    .lineWidth(1)
    .moveTo(50, doc.y + 10)
    .lineTo(545, doc.y + 10)
    .stroke();
  
  // Add some spacing
  doc.moveDown(1);
}

async function addFormSubmissionToPDF(doc, submission) {
  const formTemplate = submission.formTemplateId;
  const formData = submission.formData;

  // DEBUG: Log form data to console to check what's being passed
  console.log('=== DEBUG: Form Submission PDF Generation ===');
  console.log('Form Template Name:', formTemplate.name);
  console.log('Form Data Keys:', Object.keys(formData || {}));
  console.log('Is RPL Form:', isRPLForm(formTemplate));
  console.log('============================================');

  // Form title - Professional formatting
  if (doc.y > 750) {
    doc.addPage();
    addPageHeader(doc, null);
  }
  
  // Form title with proper spacing
  doc.fontSize(14).font('Helvetica-Bold').fillColor("#000000").text(formTemplate.name, 50, doc.y, {
    width: 495,
    align: 'left',
    lineGap: 3
  });
  
  const submittedText = submission.submittedAt ? new Date(submission.submittedAt).toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) : "Not submitted";
  
  doc
    .fontSize(10)
    .font('Helvetica')
    .fillColor("#666666")
    .text(
      `Submitted: ${submittedText}`,
      50,
      doc.y + 10
    );
  
  // Professional separator line
  doc
    .strokeColor("#e0e0e0")
    .lineWidth(0.5)
    .moveTo(50, doc.y + 20)
    .lineTo(545, doc.y + 20)
    .stroke();
  
  doc.moveDown(2);

  // Check if RPL form
  if (isRPLForm(formTemplate)) {
    await addRPLFormDataToPDF(doc, formTemplate, formData);
  } else {
    // Special handling for third-party composite payloads
    const isThirdParty = submission.filledBy === "third-party";
    const parent = formData && formData.$__parent ? formData.$__parent : null;
    const employerData = parent?.employerSubmission?.formData;
    const referenceData = parent?.referenceSubmission?.formData;

    if (isThirdParty && (employerData || referenceData)) {
      const bothPresent = employerData && referenceData;
      const areEqual = bothPresent && JSON.stringify(employerData) === JSON.stringify(referenceData);

      if (bothPresent && areEqual) {
        // Render once if both datasets are identical
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .fillColor("#000000")
          .text("Third Party Submission (Employer & Reference)", 50, doc.y + 10);
        doc.moveDown(0.8);
        await addRegularFormDataToPDF(doc, formTemplate, employerData);
      } else {
        if (employerData) {
          doc
            .fontSize(11)
            .font('Helvetica-Bold')
            .fillColor("#000000")
            .text("Employer Submission", 50, doc.y + 10);
          doc.moveDown(0.8);
          await addRegularFormDataToPDF(doc, formTemplate, employerData);
        }
        if (referenceData) {
          if (doc.y > 700) doc.addPage();
          doc
            .fontSize(11)
            .font('Helvetica-Bold')
            .fillColor("#000000")
            .text("Reference Submission", 50, doc.y + 10);
          doc.moveDown(0.8);
          await addRegularFormDataToPDF(doc, formTemplate, referenceData);
        }
      }
    } else {
      await addRegularFormDataToPDF(doc, formTemplate, formData);
    }
  }
  
  // Add form end separator
  addFormEndSeparator(doc);
}

// Add form end separator
function addFormEndSeparator(doc) {
  // Add some spacing before the separator
  doc.moveDown(1);
  
  // Add a horizontal line
  doc
    .strokeColor("#cccccc")
    .lineWidth(1)
    .moveTo(50, doc.y + 5)
    .lineTo(545, doc.y + 5)
    .stroke();
  
  // Add some spacing after the separator
  doc.moveDown(1.5);
}

function isRPLForm(template) {
  return template?.name && template.name.includes("RPL");
}

async function addRPLFormDataToPDF(doc, formTemplate, formData) {
  const sections = formTemplate.formStructure;

  for (const section of sections) {
    // Section header - Bold and smaller
    // Check if we need a new page
    if (doc.y > 750) {
      doc.addPage();
      addPageHeader(doc, null);
    }
    
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor("#000000")
      .text(section.sectionTitle || section.section, 50, doc.y + 10, {
        width: 495,
        align: 'left',
        lineGap: 2
      });
    doc.moveDown(1);

    // Special handling for evidence matrix section
    if (section.section === "evidenceMatrix") {
      await handleEvidenceMatrixSection(doc, section, formData);
      continue;
    }

    // Special handling for stage2SelfAssessmentQuestions section
    if (section.section === "stage2SelfAssessmentQuestions") {
      await handleStage2QuestionsSection(doc, section, formData);
      continue;
    }

    if (section.fields) {
      // Handle section with explicit fields
      for (const field of section.fields) {
        if (field.fieldType === "assessmentMatrix" && field.questions) {
          // Handle assessment matrix fields specially
          handleUnitAssessmentSection(doc, section, formData);
        } else {
          // Handle regular fields
          addFieldToPDF(doc, field, formData[field.fieldName]);
        }
      }
    } else {
      // Handle complex RPL sections
      handleRPLSectionData(doc, section, formData);
    }

    doc.moveDown();
  }
}

async function addRegularFormDataToPDF(doc, formTemplate, formData) {
  const structure = formTemplate.formStructure;

  if (Array.isArray(structure) && structure[0]?.section) {
    // Nested structure
    for (const section of structure) {
      // Check if we need a new page
      if (doc.y > 750) {
        doc.addPage();
        addPageHeader(doc, null);
      }
      
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .fillColor("#000000")
        .text(section.sectionTitle || section.section, 50, doc.y + 10, {
          width: 495,
          align: 'left',
          lineGap: 2
        });
      doc.moveDown(1);

      if (section.fields) {
        for (const field of section.fields) {
          const directKey = field.fieldName;
          const compositeKey = `${section.section}_${field.fieldName}`;
          const value =
            (formData && (formData[directKey] ?? formData[compositeKey])) ?? null;
          // Special pretty rendering for rating matrices
          if (field.fieldType === 'rating-matrix' && value && typeof value === 'object' && !Array.isArray(value)) {
            addMatrixToPDF(doc, field, value);
          } else {
            addFieldToPDF(doc, field, value);
          }
        }
      }
      doc.moveDown();
    }
  } else {
    // Flat structure
    for (const field of structure) {
      const value = formData ? formData[field.fieldName] : null;
      if (field.fieldType === 'rating-matrix' && value && typeof value === 'object' && !Array.isArray(value)) {
        addMatrixToPDF(doc, field, value);
      } else {
        addFieldToPDF(doc, field, value);
      }
    }
  }
}

function renderSignature(doc, signatureValue) {
  // signatureValue expected: { kind: "signature", style: "draw"|"typed"|"initials", dataUrl? | {mime, data}? | text, fontVariant?, signedAt?, signedBy? }
  const boxWidth = 250;
  const boxHeight = 80;
  const x = 60;
  const y = doc.y + 6;

  // Draw a light border box
  doc
    .lineWidth(0.5)
    .strokeColor('#9ca3af')
    .rect(x, y, boxWidth, boxHeight)
    .stroke();

  const style = (signatureValue && (signatureValue.style || signatureValue.type)) || '';

  if (style === 'draw') {
    // Extract base64 data
    let base64Data = null;
    if (signatureValue.dataUrl && typeof signatureValue.dataUrl === 'string') {
      const commaIdx = signatureValue.dataUrl.indexOf(',');
      if (commaIdx !== -1) base64Data = signatureValue.dataUrl.substring(commaIdx + 1);
    } else if (signatureValue.data && typeof signatureValue.data === 'string') {
      base64Data = signatureValue.data; // expected pure base64 without data URL prefix
    }

    try {
      if (base64Data) {
        const imgBuffer = Buffer.from(base64Data, 'base64');
        // Fit image within box, leaving padding
        doc.image(imgBuffer, x + 6, y + 6, { fit: [boxWidth - 12, boxHeight - 12], align: 'left', valign: 'center' });
      } else {
        doc
          .fontSize(10)
          .fillColor('#6b7280')
          .text('No signature image provided', x + 8, y + 8, { width: boxWidth - 16 });
      }
    } catch (e) {
      doc
        .fontSize(10)
        .fillColor('#ef4444')
        .text('Invalid signature image', x + 8, y + 8, { width: boxWidth - 16 });
    }
  } else if (style === 'typed' || style === 'initials') {
    const text = (signatureValue && signatureValue.text) || '';
    doc
      .fontSize(style === 'initials' ? 28 : 20)
      .font('Helvetica-Oblique')
      .fillColor('#111827')
      .text(text || '—', x + 12, y + 18, { width: boxWidth - 24, align: 'left' });
  } else {
    // Unknown style; render raw object as text inside the box
    doc
      .fontSize(10)
      .fillColor('#6b7280')
      .text('Signature data not available', x + 8, y + 8, { width: boxWidth - 16 });
  }

  // Move cursor below box
  doc.y = y + boxHeight + 4;

  // Metadata line
  const parts = [];
  if (signatureValue && signatureValue.signedBy) parts.push(`Signed by: ${signatureValue.signedBy}`);
  if (signatureValue && signatureValue.signedAt) {
    const dt = new Date(signatureValue.signedAt);
    if (!isNaN(dt.getTime())) parts.push(`Signed at: ${dt.toLocaleString()}`);
  }
  if (parts.length > 0) {
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#6b7280')
      .text(parts.join('  |  '), 60, doc.y + 2, { width: 475 });
    doc.moveDown(0.6);
  }
}

function addFieldToPDF(doc, field, rawValue) {
  if (doc.y > 700) doc.addPage();

  // Skip fields that are labels or don't have user input
  if (field.fieldType === 'label' || field.fieldType === 'heading' || field.fieldType === 'divider') {
    return;
  }

  // Question label - Professional formatting
  const labelText = field.label.endsWith(':') ? field.label : `${field.label}:`;
  
  // Check if we need a new page
  if (doc.y > 750) {
    doc.addPage();
    addPageHeader(doc, null);
  }
  
  doc
    .fontSize(11)
    .font('Helvetica-Bold')
    .fillColor('#000000')
    .text(`${labelText}${field.required ? " *" : ""}`, 50, doc.y + 8, {
      width: 495,
      align: 'left',
      lineGap: 3
    });

  // Signature special handling
  const isSignatureField = field.fieldType === 'signature' || (rawValue && typeof rawValue === 'object' && rawValue.kind === 'signature');
  if (isSignatureField) {
    renderSignature(doc, rawValue || {});
    return;
  }

  const normalize = (val) => {
    if (val == null || val === undefined) return null; // Don't show "Not provided" for empty values
    if (typeof val === "string") {
      const trimmed = val.trim();
      return trimmed === "" ? null : trimmed;
    }
    if (typeof val === "number") return String(val);
    if (typeof val === "boolean") return val ? "Yes" : "No";
    if (Array.isArray(val)) {
      if (val.length === 0) return null;
      // Pretty-print arrays of checklist objects
      if (typeof val[0] === 'object' && (val[0].item || val[0].num)) {
        return val.map((it) => {
          const num = it.num ? `${it.num}. ` : '';
          const item = it.item || it.text || '';
          const done = typeof it.done === 'boolean' ? (it.done ? 'Yes' : 'No') : (it.status || '');
          return `${num}${item}${done !== '' ? ` - ${done}` : ''}`.trim();
        }).join("\n");
      }
      return val.map(normalize).join(", ");
    }
    if (typeof val === "object") {
      if (val.kind === 'signature') return '[Signature]';
      if (typeof val.value !== "undefined") return normalize(val.value);
      if (typeof val.label !== "undefined") return normalize(val.label);
      if (typeof val.text !== "undefined") return normalize(val.text);
      if (Array.isArray(val.options)) return normalize(val.options);
      // Fallback: render key: value lines for plain objects
      const entries = Object.entries(val);
      if (entries.length === 0) return null;
      return entries.map(([k, v]) => `${k}: ${normalize(v)}`).join("\n");
    }
    return null;
  };

  // Handle checkbox specifically first to preserve "None selected"
  let displayValue = "";
  if (field.fieldType === "checkbox" && Array.isArray(rawValue)) {
    displayValue = rawValue.length > 0 ? rawValue.map(normalize).join(", ") : "None selected";
  } else {
    displayValue = normalize(rawValue);
  }

  // Only show the answer if there's actually a value
  if (displayValue !== null && displayValue !== "") {
    // Check if we need a new page
    if (doc.y > 750) {
      doc.addPage();
      addPageHeader(doc, null);
    }
    
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor("#333333")
      .text(displayValue, 60, doc.y + 5, { 
        width: 475, 
        align: "left",
        lineGap: 3
      });
    doc.moveDown(1.2);
  } else {
    // Just move down for spacing even if no answer
    doc.moveDown(1);
  }
}

// Pretty renderer for rating-matrix fields (object of label -> value)
function addMatrixToPDF(doc, field, matrixObj) {
  if (doc.y > 700) doc.addPage();

  // Skip if no data
  if (!matrixObj || Object.keys(matrixObj).length === 0) {
    return;
  }

  // Question label - Bold (remove extra colons)
  const labelText = field.label.endsWith(':') ? field.label : `${field.label}:`;
  
  // Check if we need a new page
  if (doc.y > 750) {
    doc.addPage();
    addPageHeader(doc, null);
  }
  
  doc
    .fontSize(10)
    .font('Helvetica-Bold')
    .fillColor("#000000")
    .text(`${labelText}${field.required ? " *" : ""}`, 50, doc.y + 5, {
      width: 495,
      align: 'left',
      lineGap: 2
    });

  const lines = Object.entries(matrixObj).map(([k, v]) => {
    const value = v && v.toString().trim() !== "" ? v : "Not provided";
    return `${k}: ${value}`;
  });
  const text = lines.join("\n");

  // Check if we need a new page
  if (doc.y > 750) {
    doc.addPage();
    addPageHeader(doc, null);
  }
  
  doc
    .fontSize(9)
    .font('Helvetica')
    .fillColor("#333333")
    .text(text, 70, doc.y + 3, { 
      width: 450, 
      align: "left",
      lineGap: 2
    });
  doc.moveDown(1);
}

function handleRPLSectionData(doc, section, formData) {
  // Handle different RPL section types based on section.section value
  switch (section.section) {
    case "stage2SelfAssessmentQuestions":
      handleStage2Questions(doc, section, formData);
      break;
    case "tableBEvidenceTypes":
      handleEvidenceMatrix(doc, section, formData);
      break;
    default:
      // Handle unit assessment sections (e.g., unit1Assessment, unit2Assessment, etc.)
      if (section.section && section.section.includes("Assessment")) {
        handleUnitAssessmentSection(doc, section, formData);
      } else {
        // Generic handling for other sections
        doc
          .fontSize(9)
          .fillColor("#6b7280")
          .text("Complex section data - refer to original form", 70, doc.y + 3);
      }
      break;
  }
}

function handleUnitAssessmentSection(doc, section, formData) {
  if (section.fields) {
    section.fields.forEach((field) => {
      if (field.fieldType === "assessmentMatrix" && field.questions) {
        doc
          .fontSize(12)
          .fillColor("#374151")
          .text("Self-Assessment Questions:", 70, doc.y + 10);
        doc.moveDown(0.5);

        // Track if any questions have responses
        let hasResponses = false;

        field.questions.forEach((question) => {
          // Look for responses using the composite key format: fieldName_questionId
          const compositeKey = `${field.fieldName}_${question.questionId}`;
          const value = formData[compositeKey];
          
          if (value) {
            hasResponses = true;
            doc
              .fontSize(9)
              .fillColor("#374151")
              .text(`Q: ${question.question}`, 70, doc.y + 3, { width: 450 });
            doc
              .fontSize(9)
              .fillColor("#6b7280") 
              .text(`A: ${value}`, 90, doc.y + 2, { width: 430 });
            doc.moveDown(0.4);
          }
        });

        if (!hasResponses) {
          doc
            .fontSize(9)
            .fillColor("#6b7280")
            .text("Not provided", 90, doc.y + 3);
          doc.moveDown(0.5);
        }
      }
    });
  }
  doc.moveDown();
}

function handleStage2Questions(doc, section, formData) {
  if (section.fields) {
    section.fields.forEach((unitField) => {
      doc
        .fontSize(12)
        .fillColor("#1f4e79")
        .text(unitField.label, 50, doc.y + 5);

      if (unitField.questions) {
        unitField.questions.forEach((question) => {
          const value = formData[question.questionId] || "Not answered";
          doc
            .fontSize(9)
            .fillColor("#6b7280")
            .text(`Q: ${question.question}`, 70, doc.y + 3);
          doc.text(`A: ${value}`, 70, doc.y + 2);
          doc.moveDown(0.3);
        });
      }
      doc.moveDown();
    });
  }
}

async function handleEvidenceMatrixSection(doc, section, formData) {
  doc
    .fontSize(12)
    .fillColor("#374151")
    .text("Evidence Matrix - Table A & B:", 50, doc.y + 5);
  doc.moveDown(0.5);

  if (section.fields) {
    for (const evidenceField of section.fields) {
      if (doc.y > 700) doc.addPage();
      
      doc
        .fontSize(10)
        .fillColor("#374151")
        .text(evidenceField.label, 50, doc.y + 5);

      if (evidenceField.units) {
        const checkedUnits = evidenceField.units.filter((unit) => {
          const fieldName = `${evidenceField.fieldName}_${unit}`;
          return formData[fieldName] === true;
        });

        if (checkedUnits.length > 0) {
          doc
            .fontSize(9)
            .fillColor("#6b7280")
            .text(`Selected Units: ${checkedUnits.join(", ")}`, 70, doc.y + 3, { width: 450 });
        } else {
          doc
            .fontSize(9)
            .fillColor("#6b7280")
            .text("No units selected", 70, doc.y + 3);
        }
      }
      doc.moveDown(0.5);
    }
  }
}

async function handleStage2QuestionsSection(doc, section, formData) {
  doc
    .fontSize(12)
    .fillColor("#374151")
    .text("Self-Assessment Questions:", 50, doc.y + 5);
  doc.moveDown(0.5);

  if (section.fields) {
    for (const unitField of section.fields) {
      if (doc.y > 700) doc.addPage();
      
      doc
        .fontSize(11)
        .fillColor("#1f4e79")
        .text(unitField.label, 50, doc.y + 5);

      if (unitField.questions) {
        let hasResponses = false;
        
        for (let i = 0; i < unitField.questions.length; i++) {
          const question = unitField.questions[i];
          const questionKey = `${unitField.fieldName}_question_${i}`;
          const response = formData[questionKey];
          
          if (response) {
            hasResponses = true;
            doc
              .fontSize(9)
              .fillColor("#374151")
              .text(`Q${i + 1}: ${question}`, 70, doc.y + 3, { width: 450 });
            doc
              .fontSize(9)
              .fillColor("#6b7280")
              .text(`A: ${response}`, 90, doc.y + 2, { width: 430 });
            doc.moveDown(0.3);
          }
        }
        
        if (!hasResponses) {
          doc
            .fontSize(9)
            .fillColor("#6b7280")
            .text("No responses provided", 70, doc.y + 3);
          doc.moveDown(0.3);
        }
      }
      doc.moveDown(0.5);
    }
  }
}

function handleEvidenceMatrix(doc, section, formData) {
  if (section.fields) {
    section.fields.forEach((evidenceField) => {
      doc
        .fontSize(10)
        .fillColor("#374151")
        .text(evidenceField.label, 50, doc.y + 5);

      if (evidenceField.units) {
        const checkedUnits = evidenceField.units.filter((unit) => {
          const fieldName = `${evidenceField.fieldName}_${unit}`;
          return formData[fieldName];
        });

        doc
          .fontSize(9)
          .fillColor("#6b7280")
          .text(
            checkedUnits.length > 0
              ? `Units: ${checkedUnits.join(", ")}`
              : "No units selected",
            70,
            doc.y + 3
          );
      }
      doc.moveDown(0.5);
    });
  }
}

// JSON Generation Functions
function generateJSONReport(res, application, submissions) {
  const report = {
    application: {
      id: application._id,
      student: {
        name: `${application.userId.firstName} ${application.userId.lastName}`,
        email: application.userId.email,
      },
      certification: application.certificationId.name,
      exportDate: new Date().toISOString(),
    },
    forms: submissions.map((submission) => ({
      formId: submission._id,
      formName: submission.formTemplateId.name,
      submittedAt: submission.submittedAt,
      status: submission.status,
      data: submission.formData,
    })),
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="forms_${application._id}_${Date.now()}.json"`
  );

  res.json(report);
}

function generateAllFormsJSON(res, submissions) {
  const report = {
    exportDate: new Date().toISOString(),
    totalForms: submissions.length,
    forms: submissions.map((submission) => ({
      formId: submission._id,
      formName: submission.formTemplateId.name,
      submittedAt: submission.submittedAt,
      status: submission.status,
      application: {
        id: submission.applicationId._id,
        student: {
          name: `${submission.applicationId.userId.firstName} ${submission.applicationId.userId.lastName}`,
          email: submission.applicationId.userId.email,
        },
        certification: submission.applicationId.certificationId.name,
      },
      data: submission.formData,
    })),
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="all_forms_${Date.now()}.json"`
  );

  res.json(report);
}

module.exports = formExportController;
