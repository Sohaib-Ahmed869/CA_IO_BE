// controllers/formExportController.js
const FormSubmission = require("../models/formSubmission");
const FormTemplate = require("../models/formTemplate");
const Application = require("../models/application");
const User = require("../models/user");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const https = require("https");
const Counter = require("../models/counter");
const { logMe } = require("../utils/logger");

const formExportController = {
  // Download all forms for a specific application as PDF
  downloadApplicationForms: async (req, res) => {
    try {
      logMe("form_export.download_application_forms.start", { applicationId: req.params.applicationId });
      const { applicationId } = req.params;
      const { format = "pdf", fast } = req.query; // Support different formats and fast mode

      // Get application with related data
      const application = await Application.findById(applicationId)
        .populate("userId", "firstName lastName email")
        .populate("certificationId", "name")
        .populate("rtoId", "name shortName rtoCode contact legal branding logo primaryColor secondaryColor status");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      await ensureApplicationAppCode(application);

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

      const rtoInfo = getRtoBrandingDetails(application.rtoId || req.rtoConfig);

      if (format === "pdf") {
        await generatePDFReport(res, application, submissions, {
          fast: fast === "1" || fast === "true",
          rtoInfo,
        });
      } else if (format === "json") {
        generateJSONReport(res, application, submissions);
      } else {
        return res.status(400).json({
          success: false,
          message: "Unsupported format. Use 'pdf' or 'json'",
        });
      }
    } catch (error) {
      logMe("form_export.download_application_forms.error", error, "error");
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

      const rtoInfo = getRtoBrandingDetails(req.rtoConfig);

      if (format === "pdf") {
        await generateAllFormsPDF(res, submissions, { rtoInfo });
      } else if (format === "json") {
        generateAllFormsJSON(res, submissions);
      } else {
        return res.status(400).json({
          success: false,
          message: "Unsupported format. Use 'pdf' or 'json'",
        });
      }
    } catch (error) {
      logMe("form_export.download_all_forms.error", error, "error");
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
      logMe("form_export.stats.error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error getting export statistics",
        error: error.message,
      });
    }
  },
};

// PDF Generation Functions
async function generatePDFReport(res, application, submissions, options = {}) {
  // Add timeout to prevent hanging (extend to 120s for larger exports)
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "PDF generation timed out. Please try again.",
      });
    }
  }, 120000); // 120 second timeout

  try {
    const doc = new PDFDocument({ margin: 50, size: "A4" });

    // Set response headers
    if (typeof res.setTimeout === 'function') {
      try { res.setTimeout(120000); } catch (_) {}
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="forms_${application._id}_${Date.now()}.pdf"`
    );

    doc.on('error', (e) => {
      logMe('pdf.stream_error', e, 'error');
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Error streaming PDF' });
      }
    });
    res.on('close', () => {
      try { doc.end(); } catch (_) {}
    });
    doc.pipe(res);
    if (typeof res.flushHeaders === 'function') {
      try { res.flushHeaders(); } catch (_) {}
    }

    // Add logo and header
    await addPDFHeader(doc, application, null, options);

    // Add each form submission
    const perFormTimeoutMs = options.fast ? 6000 : 12000;
    for (let i = 0; i < submissions.length; i++) {
      if (i > 0) {
        doc.addPage();
        // Add header to new page
        addPageHeader(doc, application);
        // Add form separator
        addFormSeparator(doc);
      }
      try {
        await Promise.race([
          addFormSubmissionToPDF(doc, submissions[i]),
          new Promise((_, reject) => setTimeout(() => reject(new Error('form_render_timeout')), perFormTimeoutMs))
        ]);
      } catch (e) {
        logMe('pdf.form_timeout', { submissionId: submissions[i]?._id }, 'warn');
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .fillColor('#b91c1c')
          .text('This form could not be fully rendered in time and was skipped.', 50, doc.y + 10);
      }
      // Yield back to event loop to avoid long blocking loops on big bundles
      await new Promise((resolve) => setImmediate(resolve));
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

async function generateAllFormsPDF(res, submissions, options = {}) {
  // Add timeout to prevent hanging
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "PDF generation timed out. Please try again.",
      });
    }
  }, 120000); // 120 second timeout

  try {
    const doc = new PDFDocument({ margin: 50, size: "A4" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="all_forms_${Date.now()}.pdf"`
    );

    if (typeof res.setTimeout === 'function') {
      try { res.setTimeout(120000); } catch (_) {}
    }
    doc.on('error', (e) => {
      logMe('pdf.stream_error_all_forms', e, 'error');
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Error streaming PDF' });
      }
    });
    res.on('close', () => {
      try { doc.end(); } catch (_) {}
    });
    doc.pipe(res);
    if (typeof res.flushHeaders === 'function') {
      try { res.flushHeaders(); } catch (_) {}
    }

    // Add header
    await addPDFHeader(doc, null, "All Forms Export", options);

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
        await new Promise((resolve) => setImmediate(resolve));
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

async function addPDFHeader(doc, application, title = null, options = {}) {
  const pageWidth = 595; // A4 width in points
  const margin = 50;
  const branding = options.rtoInfo || getRtoBrandingDetails(application?.rtoId);
  
  // Start at top with proper margin - dynamic positioning prevents overlap
  let currentY = 40;
  const logoWidth = 60;
  const logoHeight = 45;
  const logoRightMargin = 10; // Space between logo and text
  
  // Logo area - left side
  let logoBottom = currentY;
  try {
    const logoBuffer = await fetchLogoBuffer(branding.logoUrl);
    if (logoBuffer) {
      doc.image(logoBuffer, margin, currentY, { width: logoWidth, height: logoHeight, fit: [logoWidth, logoHeight] });
      logoBottom = currentY + logoHeight;
    } else {
      throw new Error("logo_not_found");
    }
  } catch (error) {
    // Fallback text logo - measure height
    doc.fontSize(14).font('Helvetica-Bold').fillColor(branding.primaryColor);
    const textHeight = doc.heightOfString(branding.name, { width: logoWidth });
    doc.text(branding.name, margin, currentY, { width: logoWidth });
    logoBottom = currentY + textHeight;
  }

  // Institution name next to logo - ensure it doesn't overlap with logo
  const logoRight = margin + logoWidth + logoRightMargin;
  const textAreaWidth = pageWidth - logoRight - margin;
  doc
    .fontSize(12)
    .font('Helvetica-Bold')
    .fillColor("#000000");
  
  const institutionText = branding.name.toUpperCase();
  const institutionTextHeight = doc.heightOfString(institutionText, { width: textAreaWidth });
  doc.text(institutionText, logoRight, currentY, { width: textAreaWidth, align: 'left' });
  
  // Update currentY to the bottom of whichever is taller: logo or institution text
  currentY = Math.max(logoBottom, currentY + institutionTextHeight) + 10;

  // Professional separator line - positioned dynamically
  doc
    .strokeColor("#000000")
    .lineWidth(1)
    .moveTo(margin, currentY)
    .lineTo(pageWidth - margin, currentY)
    .stroke();
  
  currentY += 15; // Space after separator

  // Document title - Centered and professional
  const titleText = title || `Form Submissions - ${application?.certificationId?.name || branding.name}`;
  doc
    .fontSize(16)
    .font('Helvetica-Bold')
    .fillColor("#000000");
  
  const titleHeight = doc.heightOfString(titleText, {
    width: pageWidth - (margin * 2),
    align: 'center',
    lineGap: 3
  });
  doc.text(titleText, margin, currentY, {
    width: pageWidth - (margin * 2),
    align: 'center',
    lineGap: 3
  });
  
  currentY += titleHeight + 15; // Space after title

  // Student Information - Clean and organized
  if (application) {
    // Student name - Bold
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor("#000000");
    
    const studentName = `Student: ${application.userId.firstName} ${application.userId.lastName}`;
    const studentNameHeight = doc.heightOfString(studentName, { width: pageWidth - (margin * 2) });
    doc.text(studentName, margin, currentY, { width: pageWidth - (margin * 2) });
    currentY += studentNameHeight + 8;
    
    // Application ID
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor("#333333");
    
    const appIdText = `Application ID: ${application.appCode}`;
    const appIdHeight = doc.heightOfString(appIdText, { width: pageWidth - (margin * 2) });
    doc.text(appIdText, margin, currentY, { width: pageWidth - (margin * 2) });
    currentY += appIdHeight + 8;
    
    // Generated date
    const generatedText = `Generated: ${new Date().toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`;
    const generatedHeight = doc.heightOfString(generatedText, { width: pageWidth - (margin * 2) });
    doc.text(generatedText, margin, currentY, { width: pageWidth - (margin * 2) });
    currentY += generatedHeight + 12;
  }

  // RTO metadata section - positioned dynamically
  doc.fontSize(9).font('Helvetica').fillColor("#666666");
  
  const metaLineParts = [];
  if (branding.abn) metaLineParts.push(`ABN: ${branding.abn}`);
  if (branding.rtoCode) metaLineParts.push(`RTO No: ${branding.rtoCode}`);
  if (branding.cricos) metaLineParts.push(`CRICOS: ${branding.cricos}`);
  if (metaLineParts.length > 0) {
    const metaText = metaLineParts.join(" | ");
    const metaHeight = doc.heightOfString(metaText, { width: pageWidth - (margin * 2) });
    doc.text(metaText, margin, currentY, { width: pageWidth - (margin * 2) });
    currentY += metaHeight + 5;
  }

  if (branding.address) {
    const addressHeight = doc.heightOfString(branding.address, { width: pageWidth - (margin * 2) });
    doc.text(branding.address, margin, currentY, { width: pageWidth - (margin * 2) });
    currentY += addressHeight + 5;
  }

  const contactParts = [];
  if (branding.phone) contactParts.push(`Phone: ${branding.phone}`);
  if (branding.email) contactParts.push(`Email: ${branding.email}`);
  if (contactParts.length > 0) {
    const contactText = contactParts.join(" | ");
    const contactHeight = doc.heightOfString(contactText, { width: pageWidth - (margin * 2) });
    doc.text(contactText, margin, currentY, { width: pageWidth - (margin * 2) });
    currentY += contactHeight + 10;
  }

  // Clean separator line under header - positioned dynamically
  doc
    .strokeColor("#cccccc")
    .lineWidth(0.5)
    .moveTo(margin, currentY)
    .lineTo(pageWidth - margin, currentY)
    .stroke();

  // Set starting position for content - ensure proper spacing
  doc.y = currentY + 15;
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

  // debug logs removed

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

async function fetchLogoBuffer(logoUrl) {
  if (!logoUrl) return null;
  try {
    return await new Promise((resolve, reject) => {
      https
        .get(logoUrl, (res) => {
          const data = [];
          res.on("data", (chunk) => data.push(chunk));
          res.on("end", () => resolve(Buffer.concat(data)));
          res.on("error", reject);
        })
        .on("error", reject);
    });
  } catch (error) {
    logMe("form_export.logo_fetch_error", { logoUrl, message: error.message }, "warn");
    return null;
  }
}

function getRtoBrandingDetails(rtoLike) {
  const fallbackName = process.env.RTO_NAME || "Certified Australia";
  const fallbackShort = process.env.RTO_SHORT || fallbackName || "CERT";
  const shortCode = fallbackShort.toString().replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10);
  const formattedAddress = rtoLike?.fullAddress || formatAddress(rtoLike?.contact?.address) || process.env.RTO_ADDRESS || "";

  return {
    name: rtoLike?.name || fallbackName,
    shortCode: rtoLike?.shortName || shortCode,
    rtoCode: rtoLike?.rtoCode || process.env.RTO_CODE || "",
    abn: rtoLike?.legal?.abn || process.env.RTO_ABN || "",
    cricos: rtoLike?.legal?.cricos || process.env.RTO_CRICOS || "",
    address: formattedAddress,
    phone: rtoLike?.contact?.phone || process.env.RTO_PHONE || "",
    email: rtoLike?.contact?.email || process.env.RTO_EMAIL || "",
    logoUrl: rtoLike?.branding?.logoUrl || rtoLike?.logo?.url || process.env.LOGO_URL || "",
    primaryColor: rtoLike?.primaryColor || rtoLike?.branding?.primaryColor || "#1f4e79",
    secondaryColor: rtoLike?.secondaryColor || rtoLike?.branding?.secondaryColor || "#6b7280",
  };
}

function formatAddress(address) {
  if (!address) return "";
  const parts = [address.street, address.city, address.state, address.postcode, address.country].filter(Boolean);
  return parts.join(", ");
}

async function ensureApplicationAppCode(application) {
  if (application?.appCode) return application.appCode;
  try {
    const rto = application?.rtoId;
    const shortSource = rto?.shortName || rto?.name || process.env.RTO_SHORT || process.env.RTO_NAME || "CERT";
    const rtoShort = shortSource.toString().replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10);
    const counterId = `application_${rto?._id?.toString() || "global"}`;
    const ctr = await Counter.findByIdAndUpdate(
      counterId,
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    const num = (ctr.seq || 1).toString().padStart(6, "0");
    application.appCode = `${rtoShort}-${num}`;
    try {
      await application.save();
    } catch (error) {
      logMe("form_export.appcode_save_error", { applicationId: application._id, message: error.message }, "warn");
    }
  } catch (error) {
    logMe("form_export.appcode_generation_error", { applicationId: application?._id, message: error.message }, "warn");
  }
  return application.appCode || application?._id?.toString();
}

// Format status from snake_case to Title Case
function formatStatus(status) {
  if (!status) return '';
  // Convert snake_case to Title Case (e.g., "payment_pending" -> "Payment Pending")
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

module.exports = formExportController;
