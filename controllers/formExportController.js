// controllers/formExportController.js
const FormSubmission = require("../models/formSubmission");
const FormTemplate = require("../models/formTemplate");
const Application = require("../models/application");
const User = require("../models/user");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const https = require('https');
const llnScoringService = require("../utils/llnScoringService");

// Helper function to format dates in AEST timezone
function formatDateAEST(date, includeTime = true) {
  if (!date) return 'N/A';
  
  try {
    const d = new Date(date);
    const options = {
      timeZone: 'Australia/Sydney', // AEST/AEDT
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    };
    
    if (includeTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
      options.second = '2-digit';
    }
    
    return d.toLocaleString('en-AU', options);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid Date';
  }
}

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

      // Get all form submissions for this application
      const submissions = await FormSubmission.find({
        applicationId: applicationId,
      })
        .populate("formTemplateId")
        .populate("manuallyEnteredBy", "firstName lastName email");

      if (submissions.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No submitted forms found for this application",
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
        .populate("manuallyEnteredBy", "firstName lastName email")
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
  // Add timeout to prevent hanging (120s)
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "PDF generation timed out. Please try again.",
      });
    }
  }, 120000);

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
      console.error('PDF stream error (form export):', e);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Error streaming PDF' });
      }
    });
    res.on('close', () => { try { doc.end(); } catch (_) {} });
    doc.pipe(res);
    if (typeof res.flushHeaders === 'function') { try { res.flushHeaders(); } catch (_) {} }

    // Add logo and header
    await addPDFHeader(doc, application);

    // Add each form submission
    const perFormTimeoutMs = 30000; // 30s per form guard (LLN forms can be large)
    for (let i = 0; i < submissions.length; i++) {
      if (i > 0) doc.addPage();
      try {
        await Promise.race([
          addFormSubmissionToPDF(doc, submissions[i]),
          new Promise((_, reject) => setTimeout(() => reject(new Error('form_render_timeout')), perFormTimeoutMs))
        ]);
      } catch (e) {
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#b91c1c').text('This form could not be fully rendered in time and was skipped.', 50, doc.y + 10);
      }
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

async function generateAllFormsPDF(res, submissions) {
  // Add timeout to prevent hanging (120s)
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "PDF generation timed out. Please try again.",
      });
    }
  }, 120000);

  try {
    const doc = new PDFDocument({ margin: 50, size: "A4" });

    if (typeof res.setTimeout === 'function') { try { res.setTimeout(120000); } catch (_) {} }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="all_forms_${Date.now()}.pdf"`
    );

    doc.on('error', (e) => {
      console.error('PDF stream error (all forms export):', e);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Error streaming PDF' });
      }
    });
    res.on('close', () => { try { doc.end(); } catch (_) {} });
    doc.pipe(res);
    if (typeof res.flushHeaders === 'function') { try { res.flushHeaders(); } catch (_) {} }

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
        .fillColor("#c41c34")
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
        if (i > 0) doc.addPage();
        try {
          await Promise.race([
            addFormSubmissionToPDF(doc, appSubmissions[i]),
            new Promise((_, reject) => setTimeout(() => reject(new Error('form_render_timeout')), 30000))
          ]);
        } catch (e) {
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#b91c1c').text('This form could not be fully rendered in time and was skipped.', 50, doc.y + 10);
        }
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

async function addPDFHeader(doc, application, title = null) {
  // Smaller header footprint
  const logoUrl = "https://certified.io/images/ebclogo.png";
  try {
    const https = require("https");
    const logoResponse = await new Promise((resolve, reject) => {
      https.get(logoUrl, (res) => {
        const data = [];
        res.on("data", (chunk) => data.push(chunk));
        res.on("end", () => resolve(Buffer.concat(data)));
        res.on("error", reject);
      });
    });
    // Smaller logo
    doc.image(logoResponse, 50, 32, { width: 70 });
  } catch (error) {
    console.warn("Could not add logo to PDF:", error.message);
  }

  // Title area: tighter spacing and Times fonts
  const brandRed = '#c41c34';
  doc.font('Times-Bold').fontSize(16).fillColor(brandRed);
  // Write title and capture ending Y to avoid overlap
  doc.y = 30;
  doc.text(
    title || `Forms Export - ${application?.certificationId?.name || "Application"}`,
    140,
    doc.y,
    { width: 420 }
  );
  const afterTitleY = doc.y;

  // Subsequent header lines placed relative to title height
  doc.font('Times-Roman').fontSize(11).fillColor(brandRed);
  if (application) {
    doc.text(`Student: ${application.userId.firstName} ${application.userId.lastName}`, 140, afterTitleY + 6);
    doc.text(`Application ID: ${application._id}`, 140, afterTitleY + 21);
    doc.text(`Generated: ${formatDateAEST(new Date())}`, 140, afterTitleY + 36);
  } else {
    doc.text(`Generated: ${formatDateAEST(new Date())}`, 140, afterTitleY + 6);
  }

  // Reduce space after header
  doc.moveDown(2);
}

async function addFormSubmissionToPDF(doc, submission) {
  const formTemplate = submission.formTemplateId;
  const rawFormData = submission.formData;

  const employerDirect = rawFormData && rawFormData.employerSubmission && rawFormData.employerSubmission.formData;
  const referenceDirect = rawFormData && rawFormData.referenceSubmission && rawFormData.referenceSubmission.formData;
  const parent = (rawFormData && rawFormData.$__parent) || {};
  const employerParent = parent.employerSubmission && parent.employerSubmission.formData;
  const referenceParent = parent.referenceSubmission && parent.referenceSubmission.formData;

  const employerData = employerDirect || employerParent || null;
  const referenceData = referenceDirect || referenceParent || null;

  const brandRed = '#c41c34';
  const isLLN = (formTemplate && (formTemplate.formType === 'lln_test' || (formTemplate.name || '').toLowerCase().includes('lln')));
  const scoreMap = {};
  if (isLLN && submission.scoringData && Array.isArray(submission.scoringData.scoreBreakdown)) {
    for (const item of submission.scoringData.scoreBreakdown) {
      if (item && item.fieldName) scoreMap[item.fieldName] = item;
    }
  }
  // Form title (Times)
  doc.font('Times-Bold').fontSize(14).fillColor(brandRed).text(formTemplate.name, 50, doc.y);
  doc
    .font('Times-Roman')
    .fontSize(11)
    .fillColor(brandRed)
    .text(`Submitted: ${formatDateAEST(submission.submittedAt)}`, 50, doc.y + 5);
  
  // Add manual entry disclaimer if applicable
  console.log(`[PDF] Processing submission ${submission._id}, entryType: ${submission.entryType}, isManual: ${submission.entryType === 'admin_manual'}`);
  if (submission.entryType === 'admin_manual') {
    doc.moveDown(0.5);
    doc
      .font('Times-Bold')
      .fontSize(10)
      .fillColor('#FF6B35')
      .text('MANUAL ENTRY DISCLAIMER:', 50, doc.y);
    doc
      .font('Times-Roman')
      .fontSize(9)
      .fillColor('#FF6B35')
      .text(`This form was manually entered by an administrator on ${formatDateAEST(submission.manuallyEnteredAt)}.`, 50, doc.y + 2);
    
    // Show admin name if available
    if (submission.manuallyEnteredBy && submission.manuallyEnteredBy.firstName) {
      doc.text(`Entered by: ${submission.manuallyEnteredBy.firstName} ${submission.manuallyEnteredBy.lastName}`, 50, doc.y + 2);
    }
    
    if (submission.manualEntryReason) {
      doc.text(`Reason: ${submission.manualEntryReason}`, 50, doc.y + 2);
    }
    if (submission.adminNotes) {
      doc.text(`Admin Notes: ${submission.adminNotes}`, 50, doc.y + 2);
    }
    doc.moveDown(0.5);
  }
  
  doc.moveDown();

  const renderWith = async (label, data) => {
    doc.font('Times-Bold').fontSize(13).fillColor(brandRed).text(label, 50, doc.y + 8);
    doc.moveDown(0.5);

    if (isRPLForm(formTemplate)) {
      await addRPLFormDataToPDF(doc, formTemplate, data || {});
    } else {
      await addRegularFormDataToPDF(doc, formTemplate, data || {}, { isLLN, scoreMap });
    }
  };

  if (employerData || referenceData) {
    if (employerData) await renderWith('Employer Response', employerData);
    if (referenceData) {
      if (employerData) {
        doc.addPage();
        await addPDFHeader(doc, null, null);
        doc.font('Times-Bold').fontSize(14).fillColor(brandRed).text(`${formTemplate.name} (continued)`, 50, doc.y + 6);
        doc.moveDown(0.3);
      }
      await renderWith('Reference Response', referenceData);
    }
  } else {
    if (isRPLForm(formTemplate)) {
      await addRPLFormDataToPDF(doc, formTemplate, rawFormData || {});
    } else {
      await addRegularFormDataToPDF(doc, formTemplate, rawFormData || {}, { isLLN, scoreMap });
    }
  }

  // If LLN form, append scoring section to PDF
  if (isLLN) {
    await addLLNScoringToPDF(doc, submission);
  }
}

function isRPLForm(template) {
  return template?.name && template.name.includes("RPL");
}

async function addRPLFormDataToPDF(doc, formTemplate, formData) {
  const sections = formTemplate.formStructure;
  const brandRed = '#c41c34';

  for (const section of sections) {
    if (doc.y > 750) { doc.addPage(); addPageHeader(doc, null); }

    // Section heading 14pt bold Times, brand red
    doc
      .font('Times-Bold')
      .fontSize(14)
      .fillColor(brandRed)
      .text(section.sectionTitle || section.section, 50, doc.y + 10, { width: 495, align: 'left' });
    doc.moveDown(0.6);

    if (section.section === "evidenceMatrix") {
      await handleEvidenceMatrixSection(doc, section, formData);
      continue;
    }
    if (section.section === "stage2SelfAssessmentQuestions") {
      await handleStage2QuestionsSection(doc, section, formData);
      continue;
    }

    if (section.fields) {
      for (const field of section.fields) {
        if (field.fieldType === "assessmentMatrix" && field.questions) {
          handleUnitAssessmentSection(doc, section, formData);
        } else {
          addFieldToPDF(doc, field, formData[field.fieldName]);
        }
      }
    } else {
      handleRPLSectionData(doc, section, formData);
    }

    doc.moveDown(0.5);
  }

async function addLLNScoringToPDF(doc, submission) {
  const brandRed = '#c41c34';
  const formTemplate = submission.formTemplateId || {};
  let scoringData = submission.scoringData || {};

  // Compute totals if missing
  if (!Array.isArray(scoringData.scoreBreakdown) || scoringData.scoreBreakdown.length === 0) {
    const breakdown = llnScoringService.initializeScoreFields(formTemplate, submission.formData || {});
    const totals = llnScoringService.calculateScores(breakdown);
    scoringData = { isMarked: false, scoreBreakdown: breakdown, totalScore: totals.totalScore, maxScore: totals.maxScore, percentage: totals.percentage };
  } else if (!scoringData.maxScore || scoringData.maxScore === 0) {
    const totals = llnScoringService.calculateScores(scoringData.scoreBreakdown);
    scoringData.totalScore = totals.totalScore;
    scoringData.maxScore = totals.maxScore;
    scoringData.percentage = totals.percentage;
  }

  // Section header
  if (doc.y > 730) { doc.addPage(); await addPDFHeader(doc, null, null); }
  doc
    .font('Times-Bold')
    .fontSize(14)
    .fillColor(brandRed)
    .text('LLN Scoring Summary', 50, doc.y + 12);
  doc.moveDown(0.6);

  // Totals line
  doc
    .font('Times-Roman')
    .fontSize(11)
    .fillColor('#111')
    .text(`Marked: ${scoringData.isMarked ? 'Yes' : 'No'}   Total: ${scoringData.totalScore || 0}/${scoringData.maxScore || 0}   Percentage: ${scoringData.percentage || 0}%`, 50, doc.y + 2);
  doc.moveDown(0.5);

  // Breakdown table-like list
  const items = scoringData.scoreBreakdown || [];
  if (items.length) {
    doc.font('Times-Bold').fontSize(12).fillColor(brandRed).text('Breakdown', 50, doc.y + 6);
    doc.moveDown(0.3);
    doc.font('Times-Roman').fontSize(11).fillColor('#111');

    for (const item of items) {
      if (doc.y > 760) { doc.addPage(); await addPDFHeader(doc, null, null); doc.font('Times-Bold').fontSize(12).fillColor(brandRed).text('Breakdown (cont.)', 50, doc.y + 8); doc.moveDown(0.3); doc.font('Times-Roman').fontSize(11).fillColor('#111'); }
      const label = item.label || item.fieldName || 'Score';
      const scoreStr = `${item.score || 0}/${item.maxScore || 0}`;
      doc.text(`• ${label}: ${scoreStr}${item.feedback ? ` — ${item.feedback}` : ''}`, 60, doc.y + 2, { width: 485 });
      doc.moveDown(0.1);
    }
  } else {
    doc.font('Times-Roman').fontSize(11).fillColor('#6b7280').text('No scoring fields detected.');
  }

  doc.moveDown(0.6);
}
}

async function addRegularFormDataToPDF(doc, formTemplate, formData, options = {}) {
  const structure = formTemplate.formStructure;
  const brandRed = '#c41c34';
  const isLLN = !!options.isLLN;
  const scoreMap = options.scoreMap || {};

  const resolveValue = (sectionKey, field) => {
    const direct = field.fieldName;
    const composite = sectionKey ? `${sectionKey}_${field.fieldName}` : null;
    if (composite && Object.prototype.hasOwnProperty.call(formData || {}, composite)) return formData[composite];
    if (formData && Object.prototype.hasOwnProperty.call(formData, direct)) return formData[direct];
    return null;
  };

  if (Array.isArray(structure) && structure[0]?.section) {
    for (const section of structure) {
      if (doc.y > 750) { doc.addPage(); addPageHeader(doc, null); }
      doc
        .font('Times-Bold')
        .fontSize(14)
        .fillColor(brandRed)
        .text(section.sectionTitle || section.section, 50, doc.y + 10);
      doc.moveDown(0.6);

      if (section.fields) {
        for (const field of section.fields) {
          const value = resolveValue(section.section, field);
          if (isLLN && isScoreFieldForExport(field)) {
            const item = scoreMap[field.fieldName];
            const scoreVal = item && typeof item.score === 'number' ? item.score : 0;
            const maxVal = item && typeof item.maxScore === 'number' ? item.maxScore : llnScoringService.extractMaxScore(field.label || '');
            addFieldToPDF(doc, field, `${scoreVal}/${maxVal}`);
          } else {
            addFieldToPDF(doc, field, value);
          }
        }
      }
      doc.moveDown(0.5);
    }
  } else {
    for (const field of structure) {
      const value = resolveValue(null, field);
      if (isLLN && isScoreFieldForExport(field)) {
        const item = scoreMap[field.fieldName];
        const scoreVal = item && typeof item.score === 'number' ? item.score : 0;
        const maxVal = item && typeof item.maxScore === 'number' ? item.maxScore : llnScoringService.extractMaxScore(field.label || '');
        addFieldToPDF(doc, field, `${scoreVal}/${maxVal}`);
      } else {
        addFieldToPDF(doc, field, value);
      }
    }
  }
}

function isScoreFieldForExport(field) {
  if (!field || typeof field !== 'object') return false;
  if (field.fieldType !== 'number') return false;
  const label = (field.label || '').toString();
  return /score/i.test(label) && /\(out of\s*\d+\)/i.test(label);
}

function addFieldToPDF(doc, field, value) {
  if (doc.y > 700) doc.addPage();

  const brandRed = '#c41c34';
  // Question (bold 12, Times, no trailing colon) in brand red
  const label = field.label ? field.label.replace(/:+\s*$/, '') : '';
  doc
    .font('Times-Bold')
    .fontSize(12)
    .fillColor(brandRed)
    .text(`${label}${field.required ? ' *' : ''}`, 50, doc.y + 5);

  // Answer (12, Times, black)
  let displayValue = '';
  if (field.fieldType === 'checkbox' && Array.isArray(value)) {
    displayValue = value.length > 0 ? value.join(', ') : 'None selected';
  } else if (typeof value === 'boolean') {
    displayValue = value ? 'Yes' : 'No';
  } else {
    displayValue = (value ?? '').toString() || 'Not provided';
  }

  doc
    .font('Times-Roman')
    .fontSize(12)
    .fillColor('#000000')
    .text(displayValue, 70, doc.y + 2, { width: 450, align: 'left' });
  doc.moveDown(0.6);
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
        .fillColor("#c41c34")
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
        .fillColor("#c41c34")
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
