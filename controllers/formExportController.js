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

      // Get all form submissions for this application
      const submissions = await FormSubmission.find({
        applicationId: applicationId,
      }).populate("formTemplateId");

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
}

async function generateAllFormsPDF(res, submissions) {
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
      await addFormSubmissionToPDF(doc, appSubmissions[i]);
    }
  }

  doc.end();
}

async function addPDFHeader(doc, application, title = null) {
  // Add logo if file exists
  // Add logo from URL
  const logoUrl = "https://certified.io/images/ebclogo.png";
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
    doc.image(logoResponse, 50, 50, { width: 100 });
  } catch (error) {
    console.warn("Could not add logo to PDF:", error.message);
  }

  // Add title
  doc
    .fontSize(20)
    .fillColor("#c41c34")
    .text(
      title ||
        `Forms Export - ${application?.certificationId?.name || "Application"}`,
      200,
      20
    );

  if (application) {
    doc
      .fontSize(12)
      .fillColor("#6b7280")
      .text(
        `Student: ${application.userId.firstName} ${application.userId.lastName}`,
        200,
        100
      );
    doc.text(`Application ID: ${application._id}`, 200, 115);
  }

  doc.text(
    `Generated: ${new Date().toLocaleString()}`,
    200,
    application ? 130 : 100
  );
  doc.moveDown(3);
}

async function addFormSubmissionToPDF(doc, submission) {
  const formTemplate = submission.formTemplateId;
  const formData = submission.formData;

  // Form title
  doc.fontSize(18).fillColor("#c41c34").text(formTemplate.name, 50, doc.y);
  doc
    .fontSize(10)
    .fillColor("#6b7280")
    .text(
      `Submitted: ${submission.submittedAt.toLocaleString()}`,
      50,
      doc.y + 5
    );
  doc.moveDown();

  // Check if RPL form
  if (isRPLForm(formTemplate)) {
    await addRPLFormDataToPDF(doc, formTemplate, formData);
  } else {
    await addRegularFormDataToPDF(doc, formTemplate, formData);
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
      .fillColor("#c41c34")
      .text(section.sectionTitle || section.section, 50, doc.y + 10);
    doc.moveDown();

    if (section.fields) {
      // Handle section with explicit fields
      for (const field of section.fields) {
        addFieldToPDF(doc, field, formData[field.fieldName]);
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
        .fillColor("#c41c34")
        .text(section.sectionTitle || section.section, 50, doc.y + 10);
      doc.moveDown();

      if (section.fields) {
        for (const field of section.fields) {
          addFieldToPDF(doc, field, formData[field.fieldName]);
        }
      }
      doc.moveDown();
    }
  } else {
    // Flat structure
    for (const field of structure) {
      addFieldToPDF(doc, field, formData[field.fieldName]);
    }
  }
}

function addFieldToPDF(doc, field, value) {
  if (doc.y > 700) doc.addPage();

  doc
    .fontSize(10)
    .fillColor("#374151")
    .text(`${field.label}${field.required ? " *" : ""}:`, 50, doc.y + 5);

  let displayValue = "";

  if (field.fieldType === "checkbox" && Array.isArray(value)) {
    displayValue = value.length > 0 ? value.join(", ") : "None selected";
  } else if (typeof value === "boolean") {
    displayValue = value ? "Yes" : "No";
  } else {
    displayValue = value || "Not provided";
  }

  doc
    .fontSize(9)
    .fillColor("#6b7280")
    .text(displayValue, 70, doc.y + 3, { width: 450, align: "left" });
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
      // Generic handling for other sections
      doc
        .fontSize(9)
        .fillColor("#6b7280")
        .text("Complex section data - refer to original form", 70, doc.y + 3);
      break;
  }
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
