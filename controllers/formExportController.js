// controllers/formExportController.js
const FormSubmission = require("../models/formSubmission");
const logme = require("../utils/logger");
const FormTemplate = require("../models/formTemplate");
const Application = require("../models/application");
const User = require("../models/user");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const https = require('https');

const formExportController = {
  // Test endpoint for debugging
  testLogging: async (req, res) => {
    try {
      logme.info("Test logging endpoint called");
      logme.warn("This is a warning message");
      logme.error("This is an error message");
      logme.debug("This is a debug message");
      
      res.json({
        success: true,
        message: "Logging test completed",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logme.error("Test logging error:", error);
      res.status(500).json({
        success: false,
        message: "Error in test logging",
        error: error.message
      });
    }
  },

  // Download all forms for a specific application as PDF
  downloadApplicationForms: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { format = "pdf" } = req.query; // Support different formats

      // Build application query with RTO filtering
      let applicationQuery = { _id: applicationId };
      if (req.rtoId) {
        applicationQuery.rtoId = req.rtoId;
      }

      // Get application with related data
      const application = await Application.findOne(applicationQuery)
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
      logme.error("Download forms error:", error);
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
      
      logme.info("Form export request", { format, certificationId, dateFrom, dateTo, rtoId: req.rtoId });

      // Build query filters
      let submissionQuery = { status: "submitted" };
      let applicationQuery = {};

      // Add RTO filtering
      if (req.rtoId) {
        applicationQuery.rtoId = req.rtoId;
        logme.info("RTO filtering applied", { rtoId: req.rtoId });
      }

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
        logme.info("Applications found", { count: applications.length, applicationIds });
      }

      logme.info("Final submission query", submissionQuery);

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

      logme.info("Submissions found", { count: submissions.length });

      if (submissions.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No forms found matching the criteria",
        });
      }

      // Log sample submission for debugging
      if (submissions.length > 0) {
        const sampleSubmission = submissions[0];
        logme.info("Sample submission", {
          formId: sampleSubmission._id,
          formName: sampleSubmission.formTemplateId?.name,
          hasFormData: !!sampleSubmission.formData,
          formDataKeys: sampleSubmission.formData ? Object.keys(sampleSubmission.formData) : [],
          formTemplateStructure: sampleSubmission.formTemplateId?.formStructure ? 'exists' : 'missing'
        });
      }

      if (format === "pdf") {
        logme.info("Generating PDF export");
        await generateAllFormsPDF(res, submissions);
      } else if (format === "json") {
        logme.info("Generating JSON export");
        generateAllFormsJSON(res, submissions);
      } else {
        return res.status(400).json({
          success: false,
          message: "Unsupported format. Use 'pdf' or 'json'",
        });
      }
    } catch (error) {
      logme.error("Download all forms error:", error);
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
      // Build match stage with RTO filtering
      let matchStage = { status: "submitted" };
      
      // Add RTO filtering if available
      if (req.rtoId) {
        // First get applications for this RTO
        const applications = await Application.find({ rtoId: req.rtoId }).select('_id');
        const applicationIds = applications.map(app => app._id);
        
        if (applicationIds.length > 0) {
          matchStage.applicationId = { $in: applicationIds };
        } else {
          // No applications for this RTO, return empty stats
          return res.json({
            success: true,
            data: [],
          });
        }
      }

      const stats = await FormSubmission.aggregate([
        { $match: matchStage },
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
      logme.error("Export stats error:", error);
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
  try {
    const doc = new PDFDocument({ margin: 50, size: "A4" });

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="forms_${application._id}_${Date.now()}.pdf"`
    );

    // Handle PDF generation errors
    doc.on('error', (error) => {
      logme.error("PDF generation error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: "Error generating PDF",
          error: error.message,
        });
      }
    });

    // Handle PDF finish event
    doc.on('end', () => {
      logme.info("PDF generation completed successfully");
    });

    doc.pipe(res);

    // Add header
    await addPDFHeader(doc, application);

    // Add each form submission
    for (let i = 0; i < submissions.length; i++) {
      if (i > 0) doc.addPage();
      await addFormSubmissionToPDF(doc, submissions[i]);
    }

    doc.end();
  } catch (error) {
    logme.error("PDF generation error:", error);
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
  try {
    const doc = new PDFDocument({ margin: 50, size: "A4" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="all_forms_${Date.now()}.pdf"`
    );

    // Handle PDF generation errors
    doc.on('error', (error) => {
      logme.error("PDF generation error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: "Error generating PDF",
          error: error.message,
        });
      }
    });

    // Handle PDF finish event
    doc.on('end', () => {
      logme.info("PDF generation completed successfully");
    });

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
  } catch (error) {
    logme.error("PDF generation error:", error);
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
  // Add title first (no logo for now to avoid issues)
  doc
    .fontSize(20)
    .fillColor("#c41c34")
    .text(
      title ||
        `Forms Export - ${application?.certificationId?.name || "Application"}`,
      50,
      50
    );

  if (application) {
    doc
      .fontSize(12)
      .fillColor("#6b7280")
      .text(
        `Student: ${application.userId.firstName} ${application.userId.lastName}`,
        50,
        80
      );
    doc.text(`Application ID: ${application._id}`, 50, 95);
  }

  doc.text(
    `Generated: ${new Date().toLocaleString()}`,
    50,
    application ? 110 : 80
  );
  doc.moveDown(3);
}

async function addFormSubmissionToPDF(doc, submission) {
  try {
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
  } catch (error) {
    logme.error("Error adding form submission to PDF:", error);
    doc
      .fontSize(12)
      .fillColor("#ef4444")
      .text("Error processing form data", 50, doc.y);
    doc.moveDown();
  }
}

function isRPLForm(template) {
  return template?.name && template.name.includes("RPL");
}

async function addRPLFormDataToPDF(doc, formTemplate, formData) {
  try {
    const sections = formTemplate.formStructure;

    if (!sections || !Array.isArray(sections)) {
      doc
        .fontSize(12)
        .fillColor("#ef4444")
        .text("No RPL sections found", 50, doc.y);
      doc.moveDown();
      return;
    }

    // Get field mappings for better display
    const fieldMappings = getFieldMappings(formTemplate);

    for (const section of sections) {
      if (!section) continue;
      
      // Section header
      doc
        .fontSize(14)
        .fillColor("#c41c34")
        .text(section.sectionTitle || section.section || "Section", 50, doc.y + 10);
      doc.moveDown();

      if (section.fields && Array.isArray(section.fields)) {
        // Handle section with explicit fields
        for (const field of section.fields) {
          if (field && field.fieldName) {
            addFieldToPDF(doc, field, formData[field.fieldName]);
          }
        }
      } else {
        // Handle complex RPL sections
        handleRPLSectionData(doc, section, formData);
      }

      doc.moveDown();
    }
  } catch (error) {
    logme.error("Error processing RPL form data:", error);
    doc
      .fontSize(12)
      .fillColor("#ef4444")
      .text("Error processing RPL form data", 50, doc.y);
    doc.moveDown();
  }
}

async function addRegularFormDataToPDF(doc, formTemplate, formData) {
  try {
    const structure = formTemplate.formStructure;

    if (!structure) {
      doc
        .fontSize(12)
        .fillColor("#ef4444")
        .text("No form structure found", 50, doc.y);
      doc.moveDown();
      return;
    }

    // Get field mappings for better display
    const fieldMappings = getFieldMappings(formTemplate);

    if (Array.isArray(structure) && structure[0]?.section) {
      // Nested structure
      for (const section of structure) {
        if (!section) continue;
        
        doc
          .fontSize(14)
          .fillColor("#c41c34")
          .text(section.sectionTitle || section.section || "Section", 50, doc.y + 10);
        doc.moveDown();

        if (section.fields && Array.isArray(section.fields)) {
          for (const field of section.fields) {
            if (field && field.fieldName) {
              addFieldToPDF(doc, field, formData[field.fieldName]);
            }
          }
        }
        doc.moveDown();
      }
    } else if (Array.isArray(structure)) {
      // Flat structure
      for (const field of structure) {
        if (field && field.fieldName) {
          addFieldToPDF(doc, field, formData[field.fieldName]);
        }
      }
    } else {
      // Fallback: display all form data with field mappings
      doc
        .fontSize(12)
        .fillColor("#374151")
        .text("Form Data:", 50, doc.y);
      doc.moveDown();

      for (const [key, value] of Object.entries(formData)) {
        let fieldLabel = fieldMappings[key] || key;
        
        // If all fields have the same label (like "New Field"), make them unique
        if (fieldLabel === "New Field") {
          fieldLabel = `Field ${key}`;
        }
        
        const processedValue = processFieldValue(value);
        
        doc
          .fontSize(10)
          .fillColor("#374151")
          .text(`${fieldLabel}:`, 50, doc.y + 5);
        
        doc
          .fontSize(9)
          .fillColor("#6b7280")
          .text(processedValue, 70, doc.y + 3, { width: 450, align: "left" });
        doc.moveDown(0.5);
      }
    }
  } catch (error) {
    logme.error("Error processing regular form data:", error);
    doc
      .fontSize(12)
      .fillColor("#ef4444")
      .text("Error processing form data", 50, doc.y);
    doc.moveDown();
  }
}

function addFieldToPDF(doc, field, value) {
  if (doc.y > 700) doc.addPage();

  // Skip if field doesn't have a label
  if (!field.label) {
    return;
  }

  doc
    .fontSize(10)
    .fillColor("#374151")
    .text(`${field.label}${field.required ? " *" : ""}:`, 50, doc.y + 5);

  let displayValue = "";

  // Handle different field types and values
  if (value === undefined || value === null) {
    displayValue = "Not provided";
  } else if (field.fieldType === "checkbox" && Array.isArray(value)) {
    displayValue = value.length > 0 ? value.join(", ") : "None selected";
  } else if (typeof value === "boolean") {
    displayValue = value ? "Yes" : "No";
  } else if (typeof value === "string" && value.trim() === "") {
    displayValue = "Not provided";
  } else if (Array.isArray(value)) {
    displayValue = value.length > 0 ? value.join(", ") : "None selected";
  } else {
    displayValue = String(value);
  }

  // Ensure displayValue is not undefined
  if (displayValue === undefined) {
    displayValue = "Not provided";
  }

  doc
    .fontSize(9)
    .fillColor("#6b7280")
    .text(displayValue, 70, doc.y + 3, { width: 450, align: "left" });
  doc.moveDown(0.5);
}

function handleRPLSectionData(doc, section, formData) {
  try {
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
  } catch (error) {
    logme.error("Error handling RPL section data:", error);
    doc
      .fontSize(9)
      .fillColor("#ef4444")
      .text("Error processing section data", 70, doc.y + 3);
  }
}

function handleStage2Questions(doc, section, formData) {
  try {
    if (section.fields && Array.isArray(section.fields)) {
      section.fields.forEach((unitField) => {
        if (!unitField) return;
        
        doc
          .fontSize(12)
          .fillColor("#c41c34")
          .text(unitField.label || "Unit", 50, doc.y + 5);

        if (unitField.questions && Array.isArray(unitField.questions)) {
          unitField.questions.forEach((question) => {
            if (!question) return;
            
            const value = formData[question.questionId] || "Not answered";
            doc
              .fontSize(9)
              .fillColor("#6b7280")
              .text(`Q: ${question.question || "Question"}`, 70, doc.y + 3);
            doc.text(`A: ${value}`, 70, doc.y + 2);
            doc.moveDown(0.3);
          });
        }
        doc.moveDown();
      });
    }
  } catch (error) {
    logme.error("Error handling stage 2 questions:", error);
    doc
      .fontSize(9)
      .fillColor("#ef4444")
      .text("Error processing stage 2 questions", 70, doc.y + 3);
  }
}

function handleEvidenceMatrix(doc, section, formData) {
  try {
    if (section.fields && Array.isArray(section.fields)) {
      section.fields.forEach((evidenceField) => {
        if (!evidenceField) return;
        
        doc
          .fontSize(10)
          .fillColor("#374151")
          .text(evidenceField.label || "Evidence", 50, doc.y + 5);

        if (evidenceField.units && Array.isArray(evidenceField.units)) {
          const checkedUnits = evidenceField.units.filter((unit) => {
            if (!evidenceField.fieldName) return false;
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
  } catch (error) {
    logme.error("Error handling evidence matrix:", error);
    doc
      .fontSize(9)
      .fillColor("#ef4444")
      .text("Error processing evidence matrix", 70, doc.y + 3);
  }
}

// Helper function to process form data for export
function processFormDataForExport(formData, formTemplate) {
  logme.info("Processing form data for export", {
    hasFormData: !!formData,
    formDataType: typeof formData,
    formDataKeys: formData ? Object.keys(formData) : [],
    hasTemplate: !!formTemplate,
    templateName: formTemplate?.name
  });

  if (!formData || typeof formData !== 'object' || Object.keys(formData).length === 0) {
    logme.info("No form data found, creating default entries");
    // If no form data, try to get field names from template structure
    const fieldMappings = getFieldMappings(formTemplate);
    const processedData = {};
    
    // Create entries for all fields with "Not provided" values
    for (const [fieldName, fieldLabel] of Object.entries(fieldMappings)) {
      // If all fields have the same label (like "New Field"), make them unique
      let uniqueLabel = fieldLabel;
      if (fieldLabel === "New Field") {
        uniqueLabel = `Field ${fieldName}`;
      }
      processedData[uniqueLabel] = "Not provided";
    }
    
    logme.info("Created default entries", { 
      fieldMappingsCount: Object.keys(fieldMappings).length,
      processedDataCount: Object.keys(processedData).length
    });
    
    return processedData;
  }

  const processedData = {};
  
  // Get field mappings from form template
  const fieldMappings = getFieldMappings(formTemplate);
  
  logme.info("Processing form data with mappings", {
    originalKeys: Object.keys(formData),
    mappingKeys: Object.keys(fieldMappings),
    sampleMappings: Object.entries(fieldMappings).slice(0, 3)
  });
  
  // Process each field in the form data
  for (const [key, value] of Object.entries(formData)) {
    // Get the field label from mappings, or use the key if not found
    let fieldLabel = fieldMappings[key] || key;
    
    // If all fields have the same label (like "New Field"), make them unique
    if (fieldLabel === "New Field") {
      fieldLabel = `Field ${key}`;
    }
    
    let processedValue;
    if (value === undefined || value === null) {
      processedValue = "Not provided";
    } else if (typeof value === 'boolean') {
      processedValue = value ? "Yes" : "No";
    } else if (Array.isArray(value)) {
      processedValue = value.length > 0 ? value.join(", ") : "None selected";
    } else if (typeof value === 'string' && value.trim() === '') {
      processedValue = "Not provided";
    } else {
      processedValue = value;
    }
    
    // Check if we're overwriting a field
    if (processedData[fieldLabel] !== undefined) {
      logme.warn(`Overwriting field: ${fieldLabel} (was: ${processedData[fieldLabel]}, now: ${processedValue})`);
    }
    
    processedData[fieldLabel] = processedValue;
    
    logme.info(`Processed field: ${key} -> ${fieldLabel} = ${processedValue}`);
  }

  logme.info("Form data processing completed", {
    originalCount: Object.keys(formData).length,
    processedCount: Object.keys(processedData).length
  });

  return processedData;
}

// Helper function to get field mappings from form template
function getFieldMappings(formTemplate) {
  if (!formTemplate || !formTemplate.formStructure) {
    logme.warn("No form template or form structure found", { 
      hasTemplate: !!formTemplate, 
      hasStructure: formTemplate ? !!formTemplate.formStructure : false 
    });
    return {};
  }

  const mappings = {};
  const structure = formTemplate.formStructure;

  logme.info("Extracting field mappings", { 
    formName: formTemplate.name,
    structureType: Array.isArray(structure) ? 'array' : typeof structure,
    structureKeys: typeof structure === 'object' ? Object.keys(structure) : 'not object'
  });

  // Log the first few items of the structure to understand the format
  if (Array.isArray(structure) && structure.length > 0) {
    logme.info("Sample structure items", {
      item0: structure[0],
      item1: structure[1],
      item2: structure[2]
    });
  }

  // Recursively extract field mappings from form structure
  function extractFields(items) {
    if (!Array.isArray(items)) {
      logme.warn("Items is not an array", { items });
      return;
    }
    
    items.forEach((item, index) => {
      if (item && typeof item === 'object') {
        // If item has fieldName and label, create mapping
        if (item.fieldName && item.label) {
          mappings[item.fieldName] = item.label;
          logme.info(`Found field mapping: ${item.fieldName} -> ${item.label}`);
        }
        
        // If item has fields array, recurse
        if (item.fields && Array.isArray(item.fields)) {
          extractFields(item.fields);
        }
        
        // If item has questions array, handle them
        if (item.questions && Array.isArray(item.questions)) {
          item.questions.forEach(question => {
            if (question.questionId && question.question) {
              mappings[question.questionId] = question.question;
              logme.info(`Found question mapping: ${question.questionId} -> ${question.question}`);
            }
          });
        }
      } else {
        logme.warn(`Invalid item at index ${index}`, { item });
      }
    });
  }

  // Handle different structure formats
  if (Array.isArray(structure)) {
    logme.info("Processing array structure");
    extractFields(structure);
  } else if (structure.sections && Array.isArray(structure.sections)) {
    logme.info("Processing sections structure");
    extractFields(structure.sections);
  } else {
    logme.warn("Unknown structure format", { structure });
  }

  logme.info("Field mappings extracted", { 
    mappingCount: Object.keys(mappings).length,
    mappings: Object.keys(mappings).slice(0, 5) // Show first 5 mappings
  });

  return mappings;
}

// Helper function to process field values for display
function processFieldValue(value) {
  if (value === undefined || value === null) {
    return "Not provided";
  } else if (typeof value === 'boolean') {
    return value ? "Yes" : "No";
  } else if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "None selected";
  } else if (typeof value === 'string' && value.trim() === '') {
    return "Not provided";
  } else {
    return String(value);
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
      data: processFormDataForExport(submission.formData, submission.formTemplateId),
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
  logme.info("Starting JSON generation", { submissionCount: submissions.length });
  
  const report = {
    exportDate: new Date().toISOString(),
    totalForms: submissions.length,
    forms: submissions.map((submission, index) => {
      logme.info(`Processing submission ${index + 1}/${submissions.length}`, {
        formId: submission._id,
        formName: submission.formTemplateId?.name,
        hasFormData: !!submission.formData,
        formDataKeys: submission.formData ? Object.keys(submission.formData) : []
      });
      
      const processedData = processFormDataForExport(submission.formData, submission.formTemplateId);
      logme.info(`Processed data for submission ${index + 1}`, {
        originalKeys: submission.formData ? Object.keys(submission.formData) : [],
        processedKeys: Object.keys(processedData),
        sampleProcessedData: Object.entries(processedData).slice(0, 3) // Show first 3 entries
      });
      
      const formEntry = {
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
        data: processedData,
      };
      
      logme.info(`Form entry ${index + 1} created`, {
        formId: formEntry.formId,
        formName: formEntry.formName,
        dataKeys: Object.keys(formEntry.data),
        dataSample: Object.entries(formEntry.data).slice(0, 2)
      });
      
      return formEntry;
    }),
  };

  logme.info("JSON generation completed", { 
    totalForms: report.totalForms,
    sampleFormData: report.forms.length > 0 ? Object.keys(report.forms[0].data) : []
  });

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="all_forms_${Date.now()}.json"`
  );

  // Log the final report structure
  logme.info("Final report structure", {
    hasReport: !!report,
    hasForms: !!report.forms,
    formsLength: report.forms?.length,
    sampleForm: report.forms?.length > 0 ? {
      formId: report.forms[0].formId,
      formName: report.forms[0].formName,
      hasData: !!report.forms[0].data,
      dataKeys: report.forms[0].data ? Object.keys(report.forms[0].data) : []
    } : null
  });

  res.json(report);
}

module.exports = formExportController;
