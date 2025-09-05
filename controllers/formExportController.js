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
      if (i > 0) doc.addPage();
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
        if (i > 0) doc.addPage();
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
  // Add logo from environment variable
  const logoUrl = process.env.LOGO_URL || "https://certified.io/images/alitlogo.png";
  try {
    // For URLs, you need to download the image first or use a different approach
    // PDFKit doesn't directly support URLs, you'll need to fetch the image data
    const https = require("https");
    const logoResponse = await new Promise((resolve, reject) => {
      https.get(logoUrl, (res) => {
        const data = [];
        res.on("data", (chunk) => data.push(chunk));
        res.on("end", () => resolve(Buffer.concat(data)));
        res.on("error", reject);
      });
    });
    doc.image(logoResponse, 50, 50, { width: 80, height: 60, fit: [80, 60] });
  } catch (error) {
    console.warn("Could not add logo to PDF:", error.message);
    // Add text logo as fallback
    doc
      .fontSize(16)
      .fillColor("#1f4e79")
      .text("ALIT", 50, 70);
  }

  // Add title (positioned to avoid overlap)
  const titleText = title || `Forms Export - ${application?.certificationId?.name || "Application"}`;
  
  // Use PDFKit's built-in text wrapping with better positioning
  doc
    .fontSize(16)
    .fillColor("#1f4e79")
    .text(titleText, 200, 70, {
      width: 300,
      align: 'left',
      lineGap: 8
    });
  
  // Calculate approximate height for positioning other elements
  const lines = Math.ceil(doc.widthOfString(titleText, { fontSize: 16 }) / 300);
  const yPosition = 70 + (lines * 30);

  // Adjust student info position based on title height with more spacing
  const studentInfoY = yPosition + 40;
  
  if (application) {
    doc
      .fontSize(12)
      .fillColor("#6b7280")
      .text(
        `Student: ${application.userId.firstName} ${application.userId.lastName}`,
        200,
        studentInfoY
      );
    doc.text(`Application ID: ${application._id}`, 200, studentInfoY + 20);
  }

  // Company details removed from top as requested

  doc.text(
    `Generated: ${new Date().toLocaleString()}`,
    200,
    application ? studentInfoY + 40 : studentInfoY + 20
  );
  
  doc.moveDown(2);
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

  // Form title
  doc.fontSize(18).fillColor("#1f4e79").text(formTemplate.name, 50, doc.y);
  const submittedText = submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : "Not submitted";
  doc
    .fontSize(10)
    .fillColor("#6b7280")
    .text(
      `Submitted: ${submittedText}`,
      50,
      doc.y + 5
    );
  doc.moveDown();

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
          .fontSize(12)
          .fillColor("#374151")
          .text("Third Party Submission (Employer & Reference)", 50, doc.y + 10);
        doc.moveDown(0.5);
        await addRegularFormDataToPDF(doc, formTemplate, employerData);
      } else {
        if (employerData) {
          doc
            .fontSize(12)
            .fillColor("#374151")
            .text("Employer Submission", 50, doc.y + 10);
          doc.moveDown(0.5);
          await addRegularFormDataToPDF(doc, formTemplate, employerData);
        }
        if (referenceData) {
          if (doc.y > 700) doc.addPage();
          doc
            .fontSize(12)
            .fillColor("#374151")
            .text("Referral Submission", 50, doc.y + 10);
          doc.moveDown(0.5);
          await addRegularFormDataToPDF(doc, formTemplate, referenceData);
        }
      }
    } else {
      await addRegularFormDataToPDF(doc, formTemplate, formData);
    }
  }
}

function isRPLForm(template) {
  return template?.name && template.name.includes("RPL");
}

async function addRPLFormDataToPDF(doc, formTemplate, formData) {
  const sections = formTemplate.formStructure;

  for (const section of sections) {
    // Section header
    doc
      .fontSize(14)
      .fillColor("#1f4e79")
      .text(section.sectionTitle || section.section, 50, doc.y + 10);
    doc.moveDown();

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
      doc
        .fontSize(14)
        .fillColor("#1f4e79")
        .text(section.sectionTitle || section.section, 50, doc.y + 10);
      doc.moveDown();

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

function addFieldToPDF(doc, field, rawValue) {
  if (doc.y > 700) doc.addPage();

  doc
    .fontSize(10)
    .fillColor("#374151")
    .text(`${field.label}${field.required ? " *" : ""}:`, 50, doc.y + 5);

  const normalize = (val) => {
    if (val == null) return "Not provided";
    if (typeof val === "string") return val.trim() === "" ? "Not provided" : val;
    if (typeof val === "number") return String(val);
    if (typeof val === "boolean") return val ? "Yes" : "No";
    if (Array.isArray(val)) {
      if (val.length === 0) return "Not provided";
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
      if (typeof val.value !== "undefined") return normalize(val.value);
      if (typeof val.label !== "undefined") return normalize(val.label);
      if (typeof val.text !== "undefined") return normalize(val.text);
      if (Array.isArray(val.options)) return normalize(val.options);
      // Fallback: render key: value lines for plain objects
      const entries = Object.entries(val);
      if (entries.length === 0) return "Not provided";
      return entries.map(([k, v]) => `${k}: ${normalize(v)}`).join("\n");
    }
    return "Not provided";
  };

  // Handle checkbox specifically first to preserve "None selected"
  let displayValue = "";
  if (field.fieldType === "checkbox" && Array.isArray(rawValue)) {
    displayValue = rawValue.length > 0 ? rawValue.map(normalize).join(", ") : "None selected";
  } else {
    displayValue = normalize(rawValue);
  }

  doc
    .fontSize(9)
    .fillColor("#6b7280")
    .text(displayValue, 70, doc.y + 3, { width: 450, align: "left" });
  doc.moveDown(0.5);
}

// Pretty renderer for rating-matrix fields (object of label -> value)
function addMatrixToPDF(doc, field, matrixObj) {
  if (doc.y > 700) doc.addPage();

  doc
    .fontSize(10)
    .fillColor("#374151")
    .text(`${field.label}${field.required ? " *" : ""}:`, 50, doc.y + 5);

  const lines = Object.entries(matrixObj || {}).map(([k, v]) => `${k}: ${v || 'Not provided'}`);
  const text = lines.length ? lines.join("\n") : 'Not provided';

  doc
    .fontSize(9)
    .fillColor("#6b7280")
    .text(text, 70, doc.y + 3, { width: 450, align: "left" });
  doc.moveDown(0.5);
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
