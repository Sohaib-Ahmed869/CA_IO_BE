// controllers/formExportController.js
const FormSubmission = require("../models/formSubmission");
const FormTemplate = require("../models/formTemplate");
const Application = require("../models/application");
const User = require("../models/user");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const https = require('https');
const http = require('http');

const formExportController = {
  // Download all forms for a specific application as PDF
  downloadApplicationForms: async (req, res) => {
    try {
      console.log("here");
      const { applicationId } = req.params;
      const { format = "pdf", fast } = req.query; // Support different formats and fast mode

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

      // Ensure friendly appCode exists for legacy records
      if (application && !application.appCode) {
        try {
          const Counter = require('../models/counter');
          const rto = (process.env.RTO_SHORT || process.env.RTO_NAME || 'CERT')
            .toString()
            .replace(/[^A-Za-z0-9]/g, '')
            .toUpperCase()
            .slice(0, 10);
          const ctr = await Counter.findByIdAndUpdate('application', { $inc: { seq: 1 } }, { new: true, upsert: true });
          const num = (ctr.seq || 1).toString().padStart(6, '0');
          application.appCode = `${rto}-${num}`;
          try { await application.save(); } catch (_) {}
        } catch (_) {}
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
        await generatePDFReport(res, application, submissions, { fast: fast === '1' || fast === 'true' });
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
      console.error('PDF stream error:', e);
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
      console.error('PDF stream error (all forms):', e);
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
  
  // Professional header with proper spacing
  // Logo area - left side
  try {
    const logoUrl = process.env.LOGO_URL || "https://certified.io/images/certified-australia-logo.png";
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
      .text(process.env.RTO_NAME || "Certified Australia", margin, 55);
  }

  // Institution name next to logo
  doc
    .fontSize(12)
    .font('Helvetica-Bold')
    .fillColor("#000000")
    .text((process.env.RTO_NAME || "Certified Australia").toUpperCase(), margin + 70, 50);

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
    
  // Application ID (friendly)
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor("#333333")
    .text(`Application ID: ${application.appCode}`, margin, studentInfoY + 20);
    
    // Generated date
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor("#333333")
      .text(
        `Generated: ${new Date().toLocaleString('en-AU', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          timeZone: 'Australia/Sydney'
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
  
  const submittedText = submission.submittedAt ? new Date(submission.submittedAt).toLocaleString('en-AU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    timeZone: 'Australia/Sydney'
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
        } else if (field.fieldType === "table") {
          await renderTableToPDF(doc, field, formData);
        } else if (field.fieldType === "interactiveGraph" && formData[field.fieldName]) {
          await renderGraphToPDF(doc, field, formData[field.fieldName]);
        } else if (field.image || (field.fieldType === "image" && formData[field.fieldName])) {
          await renderImageToPDF(doc, field, field.image || formData[field.fieldName]);
        } else {
          // Handle regular fields
          addFieldToPDF(doc, field, formData[field.fieldName], formData);
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
          const rawValue =
            (formData && (formData[directKey] ?? formData[compositeKey])) ?? null;
          const value = resolveFieldValue(field, rawValue, formData, [
            directKey,
            compositeKey,
          ]);

          if (
            field.fieldType === "rating-matrix" &&
            value &&
            typeof value === "object" &&
            !Array.isArray(value)
          ) {
            addMatrixToPDF(doc, field, value);
          } else if (field.fieldType === "table") {
            await renderTableToPDF(doc, field, formData);
          } else if (field.fieldType === "interactiveGraph" && value) {
            await renderGraphToPDF(doc, field, value);
          } else if (field.image || (field.fieldType === "image" && value)) {
            await renderImageToPDF(doc, field, field.image || value);
          } else {
            addFieldToPDF(doc, field, value, formData);
          }
        }
      }
      doc.moveDown();
    }
  } else {
    // Flat structure
    for (const field of structure) {
      const rawValue = formData ? formData[field.fieldName] : null;
      const value = resolveFieldValue(field, rawValue, formData, [
        field.fieldName,
      ]);

      if (
        field.fieldType === "rating-matrix" &&
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        addMatrixToPDF(doc, field, value);
      } else if (field.fieldType === "table") {
        await renderTableToPDF(doc, field, formData);
      } else if (field.fieldType === "interactiveGraph" && value) {
        await renderGraphToPDF(doc, field, value);
      } else if (field.image || (field.fieldType === "image" && value)) {
        await renderImageToPDF(doc, field, field.image || value);
      } else {
        addFieldToPDF(doc, field, value, formData);
      }
    }
  }
}

function resolveFieldValue(field, rawValue, formData, candidateKeys = []) {
  if (!field) {
    return rawValue;
  }

  const keys = (candidateKeys || [])
    .filter(Boolean)
    .concat(field.fieldName || []);

  const hasSignatureArtifacts = keys.some(
    (key) =>
      key &&
      formData &&
      (formData[`${key}_drawing`] ||
        formData[`${key}_signedAt`] ||
        formData[`${key}_signedBy`] ||
        formData[`${key}_name`])
  );

  const isSignatureField =
    field.fieldType === "signature" ||
    (rawValue &&
      typeof rawValue === "object" &&
      (rawValue.kind === "signature" ||
        rawValue.style ||
        rawValue.dataUrl ||
        rawValue.data)) ||
    hasSignatureArtifacts;

  if (!isSignatureField) {
    return rawValue;
  }

  const normalizedFromValue = normalizeSignatureInput(rawValue);
  if (normalizedFromValue) {
    attachSignatureMetadata(normalizedFromValue, formData, keys);
    return normalizedFromValue;
  }

  const drawingValue = keys
    .map((key) => {
      if (!key || !formData) return null;
      // Check for _drawing suffix
      const drawingKey = `${key}_drawing`;
      if (formData[drawingKey]) return formData[drawingKey];
      // Also check direct key with drawing in name
      if (key.includes('drawing') && formData[key]) return formData[key];
      return null;
    })
    .find((val) => !!val);
  if (drawingValue) {
    const normalizedDrawing = normalizeSignatureDrawing(drawingValue);
    if (normalizedDrawing) {
      attachSignatureMetadata(normalizedDrawing, formData, keys);
      return normalizedDrawing;
    }
  }
  
  // Also check if rawValue itself is a base64 string
  if (rawValue && typeof rawValue === 'string' && rawValue.length > 100) {
    if (rawValue.startsWith('data:image') || /^[A-Za-z0-9+/=]+$/.test(rawValue.replace(/\s/g, ''))) {
      const normalizedBase64 = normalizeSignatureDrawing(rawValue);
      if (normalizedBase64) {
        attachSignatureMetadata(normalizedBase64, formData, keys);
        return normalizedBase64;
      }
    }
  }

  const typedFallback = keys
    .map((key) => (key && formData ? formData[`${key}_text`] : null))
    .find((val) => !!val);
  const normalizedTyped = normalizeSignatureInput(typedFallback);
  if (normalizedTyped) {
    attachSignatureMetadata(normalizedTyped, formData, keys);
    return normalizedTyped;
  }

  return rawValue;
}

function normalizeSignatureInput(value) {
  if (!value) return null;

  if (typeof value === "object") {
    if (
      value.kind === "signature" ||
      value.style ||
      value.type ||
      value.dataUrl ||
      value.data ||
      value.text
    ) {
      return {
        kind: value.kind || "signature",
        style: value.style || value.type || (value.text ? "typed" : "draw"),
        dataUrl: value.dataUrl,
        data: value.data,
        text: value.text,
        signedAt: value.signedAt,
        signedBy: value.signedBy,
      };
    }
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        return normalizeSignatureInput(parsed);
      } catch (_) {
        // ignore JSON parse errors
      }
    }
    if (trimmed.startsWith("data:image")) {
      return {
        kind: "signature",
        style: "draw",
        dataUrl: trimmed,
      };
    }
    if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 200) {
      return {
        kind: "signature",
        style: "draw",
        data: trimmed,
      };
    }
    return {
      kind: "signature",
      style: "typed",
      text: trimmed,
    };
  }

  return null;
}

function normalizeSignatureDrawing(drawingValue) {
  if (!drawingValue) return null;

  let dataUrl = null;
  let data = null;

  if (typeof drawingValue === "string") {
    if (drawingValue.startsWith("data:image")) {
      dataUrl = drawingValue;
    } else {
      data = drawingValue;
    }
  } else if (typeof drawingValue === "object") {
    dataUrl = drawingValue.dataUrl || drawingValue.dataURL || null;
    data =
      drawingValue.data ||
      drawingValue.raw ||
      drawingValue.payload ||
      drawingValue.value ||
      null;
  }

  if (!dataUrl && data && typeof data === "string" && data.startsWith("data:image")) {
    dataUrl = data;
    data = null;
  }

  if (!dataUrl && !data) {
    return null;
  }

  const signature = {
    kind: "signature",
    style: "draw",
  };

  if (dataUrl) signature.dataUrl = dataUrl;
  if (!dataUrl && data) signature.data = data;

  return signature;
}

function attachSignatureMetadata(signature, formData, keys = []) {
  if (!signature || !formData) return;

  if (!signature.signedBy) {
    const signedBy = keys
      .map(
        (key) =>
          formData[`${key}_signedBy`] ||
          formData[`${key}_name`] ||
          formData[`${key}_author`] ||
          null
      )
      .find((val) => !!val);
    if (signedBy) signature.signedBy = signedBy;
  }

  if (!signature.signedAt) {
    const signedAt = keys
      .map(
        (key) =>
          formData[`${key}_signedAt`] ||
          formData[`${key}_timestamp`] ||
          formData[`${key}_date`] ||
          null
      )
      .find((val) => !!val);
    if (signedAt) signature.signedAt = signedAt;
  }
}

function renderSignature(doc, signatureValue) {
  // signatureValue expected: { kind: "signature", style: "draw"|"typed"|"initials", dataUrl? | {mime, data}? | text, fontVariant?, signedAt?, signedBy? }
  // Also handle direct base64 strings or data URLs
  const boxWidth = 250;
  const boxHeight = 80;
  const x = 60;
  const y = doc.y + 6;

  // Check if we need a new page
  if (y + boxHeight > 750) {
    doc.addPage();
    addPageHeader(doc, null);
    const newY = doc.y + 6;
    doc.y = newY;
    return renderSignature(doc, signatureValue);
  }

  // Draw a light border box
  doc
    .lineWidth(0.5)
    .strokeColor('#9ca3af')
    .rect(x, y, boxWidth, boxHeight)
    .stroke();

  // Handle direct base64 string or data URL
  if (typeof signatureValue === 'string') {
    let base64Data = null;
    if (signatureValue.startsWith('data:image')) {
      const commaIdx = signatureValue.indexOf(',');
      if (commaIdx !== -1) {
        base64Data = signatureValue.substring(commaIdx + 1);
      } else {
        // No comma found, try the whole string
        base64Data = signatureValue;
      }
    } else {
      // Assume it's pure base64 - clean it first
      base64Data = signatureValue.replace(/\s/g, '').replace(/\n/g, '').replace(/\r/g, '');
    }
    
    if (base64Data && base64Data.length > 50) {
      try {
        // Clean base64 string (remove whitespace and newlines)
        base64Data = base64Data.replace(/\s/g, '').replace(/\n/g, '').replace(/\r/g, '');
        const imgBuffer = Buffer.from(base64Data, 'base64');
        
        if (imgBuffer && imgBuffer.length > 0) {
          doc.image(imgBuffer, x + 6, y + 6, { fit: [boxWidth - 12, boxHeight - 12], align: 'left', valign: 'center' });
          doc.y = y + boxHeight + 4;
          return;
        }
      } catch (e) {
        console.warn('Failed to render signature from base64 string:', e.message);
        // Fall through to try other methods
      }
    }
  }

  const style = (signatureValue && (signatureValue.style || signatureValue.type)) || '';

  if (style === 'draw' || !style) {
    // Extract base64 data
    let base64Data = null;
    if (signatureValue && signatureValue.dataUrl && typeof signatureValue.dataUrl === 'string') {
      const commaIdx = signatureValue.dataUrl.indexOf(',');
      if (commaIdx !== -1) {
        base64Data = signatureValue.dataUrl.substring(commaIdx + 1);
      } else {
        // Might be pure base64
        base64Data = signatureValue.dataUrl;
      }
    } else if (signatureValue && signatureValue.data && typeof signatureValue.data === 'string') {
      if (signatureValue.data.startsWith('data:image')) {
        const commaIdx = signatureValue.data.indexOf(',');
        base64Data = commaIdx !== -1 ? signatureValue.data.substring(commaIdx + 1) : signatureValue.data;
      } else {
        base64Data = signatureValue.data; // expected pure base64 without data URL prefix
      }
    } else if (signatureValue && typeof signatureValue === 'string') {
      // Direct base64 string
      if (signatureValue.startsWith('data:image')) {
        const commaIdx = signatureValue.indexOf(',');
        base64Data = commaIdx !== -1 ? signatureValue.substring(commaIdx + 1) : signatureValue;
      } else {
        base64Data = signatureValue;
      }
    }

    try {
      if (base64Data && base64Data.length > 0) {
        // Clean base64 string (remove whitespace and newlines)
        base64Data = base64Data.replace(/\s/g, '').replace(/\n/g, '').replace(/\r/g, '');
        
        // Validate base64 format
        if (base64Data.length < 50) {
          throw new Error('Base64 data too short');
        }
        
        const imgBuffer = Buffer.from(base64Data, 'base64');
        
        // Validate buffer was created successfully
        if (!imgBuffer || imgBuffer.length === 0) {
          throw new Error('Failed to create image buffer');
        }
        
        // Fit image within box, leaving padding
        doc.image(imgBuffer, x + 6, y + 6, { 
          fit: [boxWidth - 12, boxHeight - 12], 
          align: 'left', 
          valign: 'center' 
        });
      } else {
        doc
          .fontSize(10)
          .fillColor('#6b7280')
          .text('No signature image provided', x + 8, y + 8, { width: boxWidth - 16 });
      }
    } catch (e) {
      console.warn('Failed to render signature image:', e.message, e.stack);
      doc
        .fontSize(10)
        .fillColor('#ef4444')
        .text(`Invalid signature image: ${e.message}`, x + 8, y + 8, { width: boxWidth - 16 });
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

// Helper function to download image from URL
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${res.statusCode}`));
        return;
      }
      const data = [];
      res.on('data', (chunk) => data.push(chunk));
      res.on('end', () => resolve(Buffer.concat(data)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Helper function to calculate text height
function calculateTextHeight(doc, text, width, fontSize = 9) {
  const lines = doc.heightOfString(text, { width, fontSize });
  return lines;
}

// Helper function to render table in PDF
async function renderTableToPDF(doc, field, formData) {
  if (!field.table || !field.table.columns || !field.table.rows) {
    return;
  }

  const table = field.table;
  const columns = table.columns;
  const rows = table.rows || [];
  
  // Get table data from formData if fieldName exists
  if (field.fieldName && formData) {
    // Check for table-specific data in formData (e.g., table_16_row_0_col_3)
    const tablePrefix = `${field.fieldName}_row_`;
    const tableDataKeys = Object.keys(formData).filter(key => key.startsWith(tablePrefix));
    if (tableDataKeys.length > 0) {
      // Reconstruct table data from formData keys
      const rowMap = {};
      const drawingMap = {}; // Store _drawing values separately
      
      tableDataKeys.forEach(key => {
        // Check for _drawing suffix (signatures)
        if (key.endsWith('_drawing')) {
          const match = key.match(/row_(\d+)_col_(\d+)_drawing/);
          if (match) {
            const rowIdx = parseInt(match[1]);
            const colIdx = parseInt(match[2]);
            if (!drawingMap[rowIdx]) drawingMap[rowIdx] = {};
            drawingMap[rowIdx][colIdx] = formData[key];
          }
        } else {
          const match = key.match(/row_(\d+)_col_(\d+)/);
          if (match) {
            const rowIdx = parseInt(match[1]);
            const colIdx = parseInt(match[2]);
            if (!rowMap[rowIdx]) rowMap[rowIdx] = {};
            rowMap[rowIdx][colIdx] = formData[key];
          }
        }
      });
      
      // Merge with original rows
      rows.forEach((row, idx) => {
        if (rowMap[idx]) {
          Object.keys(rowMap[idx]).forEach(colIdx => {
            const colKey = `col_${parseInt(colIdx) + 1}`;
            if (row[colKey] === undefined) {
              row[colKey] = rowMap[idx][colIdx];
            }
          });
        }
        // Store drawing data for signature rendering
        if (drawingMap[idx]) {
          if (!row._drawings) row._drawings = {};
          Object.keys(drawingMap[idx]).forEach(colIdx => {
            row._drawings[colIdx] = drawingMap[idx][colIdx];
          });
        }
      });
    }
  }

  // Calculate column widths
  const pageWidth = 495;
  const margin = 50;
  const availableWidth = pageWidth - (margin * 2);
  const numCols = columns.length;
  const colWidth = availableWidth / numCols;
  const cellPadding = 5;
  const minRowHeight = 20;

  // Check if we need a new page
  if (doc.y > 650) {
    doc.addPage();
    addPageHeader(doc, null);
  }

  // Draw table header
  let currentY = doc.y + 10;
  
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000');
  
  // Calculate header height
  let headerHeight = minRowHeight;
  columns.forEach((col) => {
    const headerText = col.title || col.key || '';
    const height = calculateTextHeight(doc, headerText, colWidth - (cellPadding * 2), 9);
    headerHeight = Math.max(headerHeight, height + (cellPadding * 2));
  });
  
  // Draw header background
  doc.rect(margin, currentY, availableWidth, headerHeight).fill('#f0f0f0');
  
  // Draw header text
  columns.forEach((col, idx) => {
    const x = margin + (idx * colWidth);
    const headerText = col.title || col.key || '';
    doc.text(headerText, x + cellPadding, currentY + cellPadding, {
      width: colWidth - (cellPadding * 2),
      align: col.align || 'left'
    });
  });
  
  currentY += headerHeight;
  
  // Draw rows
  doc.font('Helvetica').fillColor('#333333').fontSize(8);
  
  rows.forEach((row, rowIdx) => {
    // Calculate row height based on content
    let rowHeight = minRowHeight;
    const cellHeights = [];
    
    columns.forEach((col, colIdx) => {
      const colKey = col.key || `col_${colIdx + 1}`;
      let cellValue = '';
      let isSignatureCell = false;
      
      // Check if this cell has signature data
      const hasDrawingData = row._drawings && row._drawings[colIdx];
      if (hasDrawingData) {
        isSignatureCell = true;
      } else if (formData && field.fieldName) {
        const drawingKey = `${field.fieldName}_row_${rowIdx}_col_${colIdx}_drawing`;
        if (formData[drawingKey]) {
          isSignatureCell = true;
        }
      }
      
      // Handle different row types
      if (row.type === 'custom' && row.content) {
        // Custom content row - extract text from content array
        if (Array.isArray(row.content)) {
          cellValue = row.content.map(item => {
            if (typeof item === 'object' && item.label) {
              return item.label;
            }
            return String(item || '');
          }).join(' | ');
        } else {
          cellValue = '[Custom Content]';
        }
      } else if (row.type === 'section' && row.label) {
        cellValue = row.label;
      } else if (row.type === 'input' && row.label) {
        // For input rows, check if this cell has signature
        if (!isSignatureCell) {
          cellValue = row.label;
        }
      } else if (row.type === 'radio' && row.label) {
        cellValue = row.label;
      } else if (row.type === 'checkbox' && row.options) {
        cellValue = Array.isArray(row.options) ? row.options.join(', ') : String(row.options);
      } else {
        // Regular cell value
        cellValue = row[colKey] || row[colIdx] || '';
        
        // Check if cellValue is base64 signature
        if (typeof cellValue === 'string' && cellValue.length > 100 && 
            (cellValue.startsWith('data:image') || /^[A-Za-z0-9+/=\s]+$/.test(cellValue.replace(/\s/g, '')))) {
          isSignatureCell = true;
          cellValue = '';
        } else if (typeof cellValue === 'object' && cellValue !== null) {
          if (cellValue.value !== undefined) {
            const val = cellValue.value;
            if (typeof val === 'string' && val.length > 100 && val.startsWith('data:image')) {
              isSignatureCell = true;
              cellValue = '';
            } else {
              cellValue = String(val);
            }
          } else if (cellValue.readonly !== undefined) {
            cellValue = String(cellValue.value || '');
          } else if (cellValue.label !== undefined) {
            cellValue = String(cellValue.label);
          } else if (cellValue.type === 'signature' && cellValue.dataUrl) {
            isSignatureCell = true;
            cellValue = '';
          } else if (Array.isArray(cellValue)) {
            cellValue = cellValue.map(v => typeof v === 'object' ? (v.label || v.value || JSON.stringify(v)) : String(v)).join(', ');
          } else {
            // Don't show JSON, show meaningful text
            cellValue = cellValue.label || cellValue.text || cellValue.name || '';
          }
        }
        cellValue = String(cellValue || '').trim();
      }
      
      // Calculate height for this cell (signatures need more space)
      let cellHeight = minRowHeight;
      if (isSignatureCell) {
        cellHeight = 50; // Fixed height for signature images
      } else if (cellValue) {
        cellHeight = calculateTextHeight(doc, cellValue, colWidth - (cellPadding * 2), 8);
        cellHeight = Math.max(minRowHeight - (cellPadding * 2), cellHeight + (cellPadding * 2));
      }
      cellHeights.push(cellHeight);
      rowHeight = Math.max(rowHeight, cellHeight);
    });
    
    // Check if we need a new page
    if (currentY + rowHeight > 750) {
      doc.addPage();
      addPageHeader(doc, null);
      currentY = doc.y + 10;
    }
    
    // Draw row border
    doc.strokeColor('#cccccc').lineWidth(0.5)
      .moveTo(margin, currentY)
      .lineTo(margin + availableWidth, currentY)
      .stroke();
    
    // Draw cells - use for loop to handle async properly
    for (let colIdx = 0; colIdx < columns.length; colIdx++) {
      const col = columns[colIdx];
      const x = margin + (colIdx * colWidth);
      const colKey = col.key || `col_${colIdx + 1}`;
      let cellValue = '';
      let isSignatureCell = false;
      let signatureData = null;
      
      // Check if this cell has signature data
      const hasDrawingData = row._drawings && row._drawings[colIdx];
      if (hasDrawingData) {
        signatureData = row._drawings[colIdx];
        isSignatureCell = true;
      } else if (formData && field.fieldName) {
        // Check formData for _drawing suffix
        const drawingKey = `${field.fieldName}_row_${rowIdx}_col_${colIdx}_drawing`;
        if (formData[drawingKey]) {
          signatureData = formData[drawingKey];
          isSignatureCell = true;
        }
      }
      
      // Handle different row types
      if (row.type === 'custom' && row.content) {
        if (Array.isArray(row.content)) {
          cellValue = row.content.map(item => {
            if (typeof item === 'object' && item.label) {
              return item.label;
            }
            return String(item || '');
          }).join(' | ');
        } else {
          cellValue = '[Custom Content]';
        }
      } else if (row.type === 'section' && row.label) {
        cellValue = row.label;
      } else if (row.type === 'input' && row.label) {
        // For input rows, check if this cell has signature data
        if (!isSignatureCell) {
          cellValue = row.label;
        }
      } else if (row.type === 'radio' && row.label) {
        cellValue = row.label;
      } else if (row.type === 'checkbox' && row.options) {
        cellValue = Array.isArray(row.options) ? row.options.join(', ') : String(row.options);
      } else {
        cellValue = row[colKey] || row[colIdx] || '';
        
        // Check if cellValue itself is a base64 string
        if (typeof cellValue === 'string' && cellValue.length > 100 && 
            (cellValue.startsWith('data:image') || /^[A-Za-z0-9+/=\s]+$/.test(cellValue.replace(/\s/g, '')))) {
          signatureData = cellValue;
          isSignatureCell = true;
          cellValue = '';
        } else if (typeof cellValue === 'object' && cellValue !== null) {
          if (cellValue.value !== undefined) {
            const val = cellValue.value;
            if (typeof val === 'string' && val.length > 100 && val.startsWith('data:image')) {
              signatureData = val;
              isSignatureCell = true;
              cellValue = '';
            } else {
              cellValue = String(val);
            }
          } else if (cellValue.readonly !== undefined) {
            cellValue = String(cellValue.value || '');
          } else if (cellValue.label !== undefined) {
            cellValue = String(cellValue.label);
          } else if (cellValue.type === 'signature' && (cellValue.dataUrl || cellValue.data)) {
            signatureData = cellValue.dataUrl || cellValue.data;
            isSignatureCell = true;
            cellValue = '';
          } else if (Array.isArray(cellValue)) {
            cellValue = cellValue.map(v => typeof v === 'object' ? (v.label || v.value || JSON.stringify(v)) : String(v)).join(', ');
          } else {
            cellValue = cellValue.label || cellValue.text || cellValue.name || '';
          }
        }
        cellValue = String(cellValue || '').trim();
      }
      
      // Render signature image if this is a signature cell
      if (isSignatureCell && signatureData) {
        try {
          let base64Data = null;
          if (typeof signatureData === 'string') {
            if (signatureData.startsWith('data:image')) {
              const commaIdx = signatureData.indexOf(',');
              base64Data = commaIdx !== -1 ? signatureData.substring(commaIdx + 1) : signatureData;
            } else {
              base64Data = signatureData;
            }
          }
          
          if (base64Data && base64Data.length > 50) {
            base64Data = base64Data.replace(/\s/g, '').replace(/\n/g, '').replace(/\r/g, '');
            const imgBuffer = Buffer.from(base64Data, 'base64');
            const sigWidth = Math.min(colWidth - (cellPadding * 2), 100);
            const sigHeight = Math.min(rowHeight - (cellPadding * 2), 50);
            
            if (imgBuffer && imgBuffer.length > 0) {
              doc.image(imgBuffer, x + cellPadding, currentY + cellPadding, {
                fit: [sigWidth, sigHeight],
                align: 'left',
                valign: 'top'
              });
            }
          }
        } catch (e) {
          console.warn(`Failed to render signature in table cell row ${rowIdx} col ${colIdx}:`, e.message);
          doc.fontSize(7).font('Helvetica').fillColor('#999999');
          doc.text('[Signature]', x + cellPadding, currentY + cellPadding, {
            width: colWidth - (cellPadding * 2)
          });
        }
      } else if (cellValue) {
        // Draw cell text with proper wrapping
        doc.fontSize(8).font('Helvetica').fillColor('#333333');
        doc.text(cellValue, x + cellPadding, currentY + cellPadding, {
          width: colWidth - (cellPadding * 2),
          align: col.align || 'left',
          lineGap: 2
        });
      }
      
      // Draw vertical border
      if (colIdx < numCols - 1) {
        doc.moveTo(x + colWidth, currentY)
          .lineTo(x + colWidth, currentY + rowHeight)
          .stroke();
      }
    }
    
    currentY += rowHeight;
  });
  
  // Draw bottom border
  doc.moveTo(margin, currentY)
    .lineTo(margin + availableWidth, currentY)
    .stroke();
  
  doc.y = currentY + 10;
  doc.moveDown(0.5);
}

// Helper function to render interactive graph
async function renderGraphToPDF(doc, field, graphData) {
  if (!graphData || typeof graphData !== 'object') {
    return;
  }

  // Check if we need a new page
  if (doc.y > 650) {
    doc.addPage();
    addPageHeader(doc, null);
  }

  const startY = doc.y + 10;
  let currentY = startY;
  const leftMargin = 50;
  const graphWidth = 400;
  const barHeight = 25;
  const barSpacing = 35;
  const maxBarWidth = 300;

  // Render graph title
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000');
  doc.text(field.label || 'Graph:', leftMargin, currentY, { width: 495 });
  currentY += 20;

  doc.fontSize(9).font('Helvetica').fillColor('#333333');
  
  // For bar charts, render actual bars
  if (field.graphConfig && field.graphConfig.type === 'barPlot') {
    const categories = field.graphConfig.xAxis?.categories || [];
    const data = graphData;
    
    // Find max value for scaling
    const values = categories.map(cat => data[cat] || 0);
    const maxValue = Math.max(...values, 1);
    
    categories.forEach((category, idx) => {
      if (currentY > 750) {
        doc.addPage();
        addPageHeader(doc, null);
        currentY = doc.y + 10;
      }
      
      const value = data[category] || 0;
      const barWidth = (value / maxValue) * maxBarWidth;
      
      // Draw label
      doc.fontSize(9).font('Helvetica').fillColor('#333333');
      doc.text(`${category}:`, leftMargin, currentY + 5, { width: 100 });
      
      // Draw value
      doc.text(`${value}`, leftMargin + 110, currentY + 5, { width: 50 });
      
      // Draw bar background
      doc.rect(leftMargin + 170, currentY, maxBarWidth, barHeight)
        .fill('#e5e7eb')
        .stroke('#d1d5db');
      
      // Draw bar fill
      if (barWidth > 0) {
        doc.rect(leftMargin + 170, currentY, barWidth, barHeight)
          .fill('#3b82f6')
          .stroke('#2563eb');
      }
      
      currentY += barSpacing;
    });
  } else {
    // Generic object rendering - create simple bar chart
    const entries = Object.entries(graphData);
    const maxValue = Math.max(...entries.map(([_, v]) => Number(v) || 0), 1);
    
    entries.forEach(([key, value]) => {
      if (currentY > 750) {
        doc.addPage();
        addPageHeader(doc, null);
        currentY = doc.y + 10;
      }
      
      const numValue = Number(value) || 0;
      const barWidth = (numValue / maxValue) * maxBarWidth;
      
      // Draw label
      doc.fontSize(9).font('Helvetica').fillColor('#333333');
      doc.text(`${key}:`, leftMargin, currentY + 5, { width: 100 });
      
      // Draw value
      doc.text(`${numValue}`, leftMargin + 110, currentY + 5, { width: 50 });
      
      // Draw bar background
      doc.rect(leftMargin + 170, currentY, maxBarWidth, barHeight)
        .fill('#e5e7eb')
        .stroke('#d1d5db');
      
      // Draw bar fill
      if (barWidth > 0) {
        doc.rect(leftMargin + 170, currentY, barWidth, barHeight)
          .fill('#3b82f6')
          .stroke('#2563eb');
      }
      
      currentY += barSpacing;
    });
  }

  doc.y = currentY + 10;
  doc.moveDown(0.5);
}

// Helper function to render image field
async function renderImageToPDF(doc, field, imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return;
  }

  // Check if we need a new page
  if (doc.y > 700) {
    doc.addPage();
    addPageHeader(doc, null);
  }

  try {
    const imageBuffer = await downloadImage(imageUrl);
    const maxWidth = 400;
    const maxHeight = 300;
    
    // Get image dimensions (simplified - PDFKit will handle scaling)
    doc.image(imageBuffer, 50, doc.y + 10, {
      width: maxWidth,
      height: maxHeight,
      fit: [maxWidth, maxHeight],
      align: 'left'
    });
    
    doc.y += maxHeight + 20;
    doc.moveDown(0.5);
  } catch (error) {
    console.warn(`Failed to load image ${imageUrl}:`, error.message);
    doc.fontSize(9).font('Helvetica').fillColor('#999999');
    doc.text(`[Image could not be loaded: ${imageUrl}]`, 50, doc.y + 10, { width: 495 });
    doc.moveDown(1);
  }
}

function addFieldToPDF(doc, field, rawValue, formData = {}) {
  if (doc.y > 700) doc.addPage();

  // Handle table fields
  if (field.fieldType === 'table') {
    // Note: renderTableToPDF is async but we can't make addFieldToPDF async without major refactoring
    // So we'll handle tables in the calling code instead
    return;
  }

  // Handle image fields
  if (field.fieldType === 'image' || field.image) {
    // Note: renderImageToPDF is async but we can't make addFieldToPDF async without major refactoring
    // So we'll handle images in the calling code instead
    return;
  }

  // Handle interactive graph fields
  if (field.fieldType === 'interactiveGraph' && rawValue) {
    // Note: renderGraphToPDF is async but we can't make addFieldToPDF async without major refactoring
    // So we'll handle graphs in the calling code instead
    return;
  }

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

  // Signature special handling - check multiple conditions
  const isSignatureFieldType = field.fieldType === 'signature';
  const isSignatureObject = rawValue && typeof rawValue === 'object' && (rawValue.kind === 'signature' || rawValue.dataUrl || rawValue.data);
  const isSignatureString = rawValue && typeof rawValue === 'string' && (
    rawValue.startsWith('data:image') || 
    (rawValue.length > 100 && /^[A-Za-z0-9+/=\s]+$/.test(rawValue) && rawValue.includes('base64'))
  );
  const hasSignatureInName = field.fieldName && (
    field.fieldName.toLowerCase().includes('signature') || 
    field.fieldName.toLowerCase().includes('sign')
  );
  
  if (isSignatureFieldType || isSignatureObject || isSignatureString || hasSignatureInName) {
    // If it's a string, normalize it first
    let signatureValue = rawValue;
    if (typeof rawValue === 'string') {
      signatureValue = normalizeSignatureInput(rawValue) || normalizeSignatureDrawing(rawValue) || rawValue;
    }
    renderSignature(doc, signatureValue || {});
    return;
  }

  const normalize = (val) => {
    if (val == null || val === undefined) return null; // Don't show "Not provided" for empty values
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (trimmed === "") return null;
      // Skip base64 strings - they should be handled as signatures, not rendered as text
      if (trimmed.startsWith('data:image') || 
          (trimmed.length > 100 && /^[A-Za-z0-9+/=\s]+$/.test(trimmed) && (trimmed.includes('base64') || trimmed.length > 500))) {
        return null; // Don't render base64 as text
      }
      return trimmed;
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
    // Calculate text height to prevent overlap
    const textHeight = calculateTextHeight(doc, displayValue, 475, 10);
    const requiredHeight = textHeight + 15; // Add padding
    
    // Check if we need a new page
    if (doc.y + requiredHeight > 750) {
      doc.addPage();
      addPageHeader(doc, null);
    }
    
    const startY = doc.y + 5;
    
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor("#333333")
      .text(displayValue, 60, startY, { 
        width: 475, 
        align: "left",
        lineGap: 3
      });
    
    // Move cursor based on actual text height
    doc.y = startY + textHeight + 10;
    doc.moveDown(0.5);
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
