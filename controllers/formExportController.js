// controllers/formExportController.js
const FormSubmission = require("../models/formSubmission");
const FormTemplate = require("../models/formTemplate");
const Application = require("../models/application");
const User = require("../models/user");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { LOGO_BASE64 } = require("../constants/logoBase64");
const { applyStaticPdfWatermark } = require("../utils/pdfWatermark");
const { PassThrough } = require("stream");

// Cached logo buffer for watermarking
let cachedLogoBuffer = null;

// Get logo buffer for header images (not watermarking)
// Watermarking is handled separately by applyStaticPdfWatermark() using pdf-lib
async function getLogoBuffer() {
  if (cachedLogoBuffer) return cachedLogoBuffer;

  // Use base64 logo constant for header images
  if (!LOGO_BASE64 || typeof LOGO_BASE64 !== "string") {
    console.warn("LOGO_BASE64 not set; skipping header logo image.");
    return null;
  }

  try {
    cachedLogoBuffer = Buffer.from(LOGO_BASE64, "base64");
    return cachedLogoBuffer;
  } catch (e) {
    console.warn(
      "Failed to decode LOGO_BASE64; skipping header logo image:",
      e.message
    );
    return null;
  }
}

// Watermarking is now handled by applyStaticPdfWatermark() using pdf-lib
// This provides better performance and supports PDF watermark files

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

      submissions.sort((a, b) => {
        const stepA = a.stepNumber != null ? Number(a.stepNumber) : 0;
        const stepB = b.stepNumber != null ? Number(b.stepNumber) : 0;
        if (stepA !== stepB) return stepA - stepB;
        const tA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const tB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return tA - tB;
      });

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
function getStudentInitialsFromApplication(application) {
  try {
    const first = (application?.userId?.firstName || "").trim();
    const last = (application?.userId?.lastName || "").trim();
    const firstInitial = first ? first[0].toUpperCase() : "";
    const lastInitial = last ? last[0].toUpperCase() : "";
    return `${firstInitial}${lastInitial}` || "";
  } catch (_) {
    return "";
  }
}

async function generatePDFReport(res, application, submissions, options = {}) {
  try {
    const studentInitials = getStudentInitialsFromApplication(application);
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    doc._studentInitials = studentInitials;
    doc._application = application;

    // Collect PDF buffer instead of streaming directly
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", async () => {
      try {
        const pdfBuffer = Buffer.concat(chunks);
        
        // Apply PDF watermark using pdf-lib (stamps watermark.pdf onto each page)
        const watermarkedBuffer = await applyStaticPdfWatermark(pdfBuffer);
        
        // Set response headers
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="forms_${application._id}_${Date.now()}.pdf"`
        );
        
        // Send watermarked PDF
        res.send(watermarkedBuffer);
      } catch (error) {
        console.error("PDF watermarking error:", error);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: "Error applying watermark",
            error: error.message,
          });
        }
      }
    });

    doc.on("error", (e) => {
      console.error("PDF stream error:", e);
      if (!res.headersSent) {
        res
          .status(500)
          .json({ success: false, message: "Error generating PDF" });
      }
    });

    // Ensure every new page gets header + initials
    doc.on("pageAdded", () => {
      addPageHeader(doc, doc._application, { studentInitials: doc._studentInitials, handwriting: true });
    });

    // Add logo and header
    await addPDFHeader(doc, application, null, options);

    // OPTIMIZED: Process forms in batches with yielding to event loop
    const batchSize = 5;
    for (let i = 0; i < submissions.length; i++) {
      if (i > 0) {
        doc.addPage();
        // Add header to new page
        addPageHeader(doc, application, { studentInitials, handwriting: true });
        // Add form separator
        addFormSeparator(doc);
      }

      try {
        // OPTIMIZED: Removed tight timeout, rely on overall process timeout
        await addFormSubmissionToPDF(doc, submissions[i], { studentInitials });
      } catch (e) {
        console.error(`Error rendering form ${i}:`, e.message);
        doc
          .fontSize(11)
          .font("Helvetica-Bold")
          .fillColor("#b91c1c")
          .text(
            "This form could not be fully rendered and was skipped.",
            50,
            doc.y + 10
          );
      }

      // OPTIMIZED: Yield to event loop every batch to prevent blocking
      if ((i + 1) % batchSize === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    doc.end();
  } catch (error) {
    console.error("PDF generation error:", error);
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
  let timeout = null;

  try {
    const doc = new PDFDocument({ margin: 50, size: "A4" });

    // Collect PDF buffer instead of streaming directly
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", async () => {
      try {
        const pdfBuffer = Buffer.concat(chunks);
        
        // Apply PDF watermark using pdf-lib (stamps watermark.pdf onto each page)
        const watermarkedBuffer = await applyStaticPdfWatermark(pdfBuffer);
        
        // Set response headers
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="all_forms_${Date.now()}.pdf"`
        );
        
        // Send watermarked PDF
        res.send(watermarkedBuffer);
        if (timeout) clearTimeout(timeout);
      } catch (error) {
        console.error("PDF watermarking error:", error);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: "Error applying watermark",
            error: error.message,
          });
        }
        if (timeout) clearTimeout(timeout);
      }
    });

    if (typeof res.setTimeout === 'function') {
      try { res.setTimeout(120000); } catch (_) {}
    }
    doc.on('error', (e) => {
      console.error('PDF stream error (all forms):', e);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Error generating PDF' });
      }
      if (timeout) clearTimeout(timeout);
    });

    // Ensure every new page gets header + initials
    doc.on("pageAdded", () => {
      addPageHeader(doc, null, { studentInitials: doc._studentInitials, handwriting: true });
    });

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
    if (!isFirstApp) {
      doc.addPage();
      addPageHeader(doc, appSubmissions[0].applicationId, { studentInitials });
    }
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

      // Derive initials per application
      const studentInitials = getStudentInitialsFromApplication(appSubmissions[0].applicationId);
      doc._studentInitials = studentInitials;
      doc._application = appSubmissions[0].applicationId;

      // Add each form
      for (let i = 0; i < appSubmissions.length; i++) {
        if (i > 0) {
          doc.addPage();
          // Add header to new page
          addPageHeader(doc, appSubmissions[i].applicationId, { studentInitials, handwriting: true });
          // Add form separator
          addFormSeparator(doc);
        }
        await addFormSubmissionToPDF(doc, appSubmissions[i], { studentInitials });
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    doc.end();
    if (timeout) clearTimeout(timeout);
  } catch (error) {
    if (timeout) clearTimeout(timeout);
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
  const initials =
    options.studentInitials ||
    doc._studentInitials ||
    getStudentInitialsFromApplication(application) ||
    "";
  
  // Professional header with proper spacing
  // Logo area - left side
  try {
    const logoBuffer = await getLogoBuffer();
    if (logoBuffer) {
      doc.image(logoBuffer, margin, 40, { width: 60, height: 45, fit: [60, 45] });
    } else {
      throw new Error("No logo buffer");
    }
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

  // Initials on top-right (handwriting-like font)
  if (initials) {
    doc
      .fontSize(12)
      .font(options.handwriting ? 'Times-Italic' : 'Helvetica-Bold')
      .fillColor("#000000")
      .text(initials, pageWidth - margin - 60, 50, { width: 60, align: 'right' });
  }

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
function addPageHeader(doc, application, options = {}) {
  const pageWidth = 595;
  const margin = 50;
  const initials =
    options.studentInitials ||
    doc._studentInitials ||
    getStudentInitialsFromApplication(application) ||
    "";
  
  // Just add a simple header line
  doc
    .strokeColor("#cccccc")
    .lineWidth(0.5)
    .moveTo(margin, 30)
    .lineTo(pageWidth - margin, 30)
    .stroke();

  // Initials on top-right for every page
  if (initials) {
    doc
      .fontSize(11)
      .font(options.handwriting ? 'Times-Italic' : 'Helvetica-Bold')
      .fillColor("#000000")
      .text(initials, pageWidth - margin - 60, 15, { width: 60, align: 'right' });
  }

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

function getIdentifierString(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);

  if (typeof value === "object") {
    if (typeof value.toString === "function") {
      const asString = value.toString();
      if (asString && asString !== "[object Object]") return asString;
    }
    if (value.id) return getIdentifierString(value.id);
    if (value._id) return getIdentifierString(value._id);
  }

  return null;
}

async function addFormSubmissionToPDF(doc, submission, footerOptions = {}) {
  const formTemplate = submission.formTemplateId;
  let formData = submission.formData || {};

  // Merge assessor form data with student form data if assessor has filled parts
  // This ensures assessor signatures and other assessor-filled fields are included
  // IMPORTANT: Only merge assessor-specific fields, don't override student signatures
  if (submission.assessorFormData && Object.keys(submission.assessorFormData).length > 0) {
    const assessorKeys = Object.keys(submission.assessorFormData);
    
    // Merge assessor data, but preserve student signature fields
    // Student signatures are typically named: studentSign, student_signature, etc.
    // Assessor signatures are typically named: assessor_signature, assessorSignature, etc.
    const mergedData = { ...formData };
    
    assessorKeys.forEach(key => {
      const keyLower = key.toLowerCase();
      const isAssessorSignature = keyLower.includes('assessor') && keyLower.includes('signature');
      const isStudentSignature = (keyLower.includes('student') && keyLower.includes('sign')) || 
                                 (keyLower === 'studentsign' || keyLower === 'student_sign');
      
      // Only merge assessor fields, never override student signatures
      if (!isStudentSignature) {
        mergedData[key] = submission.assessorFormData[key];
      }
    });
    
    formData = mergedData;
    
    // DEBUG: Log assessor data merge
    console.log('=== Merged Assessor Form Data ===');
    console.log('Assessor Data Keys:', assessorKeys);
    console.log('Assessor Signature Fields:', assessorKeys.filter(k => 
      k.includes('signature') || k.includes('Signature') || 
      submission.assessorFormData[k]?.kind === 'signature' ||
      submission.assessorFormData[k]?.dataUrl ||
      submission.assessorFormData[k]?.data
    ));
  }

  // DEBUG: Log form data to console to check what's being passed
  console.log('=== DEBUG: Form Submission PDF Generation ===');
  console.log('Form Template Name:', formTemplate.name);
  console.log('Form Data Keys:', Object.keys(formData || {}));
  console.log('Has Assessor Data:', !!submission.assessorFormData);
  console.log('Filled By:', submission.filledBy);
  console.log('Is RPL Form:', isRPLForm(formTemplate));
  console.log('============================================');

  // Form title - Professional formatting
  if (doc.y > 750) {
    doc.addPage();
    addPageHeader(doc, doc._application, {
      studentInitials: footerOptions.studentInitials || doc._studentInitials,
    });
  }
  
  // Add highlighted form details header box (similar to Final Audit Report style)
  const headerBoxY = doc.y;
  const headerBoxHeight = 80;
  const headerBoxWidth = 495;
  const headerBoxX = 50;
  
  // Draw highlighted box with light grey background
  doc
    .save()
    .rect(headerBoxX, headerBoxY, headerBoxWidth, headerBoxHeight)
    .fillColor("#f5f5f5")
    .fill()
    .restore();
  
  // Draw border
  doc
    .strokeColor("#000000")
    .lineWidth(1)
    .rect(headerBoxX, headerBoxY, headerBoxWidth, headerBoxHeight)
    .stroke();
  
  // Reset fill color to black for text
  doc.fillColor("#000000");
  
  // Form title at top left
  doc
    .fontSize(14)
    .font('Helvetica-Bold')
    .fillColor("#000000")
    .text(formTemplate.name, headerBoxX + 10, headerBoxY + 10, {
      width: headerBoxWidth - 20,
      align: 'left'
    });
  
  // Submission date at top right (formatted as DD/MM/YYYY - Australian format)
  const submittedDate = submission.submittedAt 
    ? (() => {
        const d = new Date(submission.submittedAt);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
      })()
    : "Not submitted";
  
  doc
    .fontSize(11)
    .font('Helvetica')
    .fillColor("#000000")
    .text(submittedDate, headerBoxX + 10, headerBoxY + 10, {
      width: headerBoxWidth - 20,
      align: 'right'
    });
  
  // Form Submission ID - Remove "verifier_" prefix if present for cleaner display
  let submissionId = submission._id ? submission._id.toString() : 'N/A';
  // Strip "verifier_" prefix if it exists (used for API routing but not needed in display)
  if (submissionId.startsWith('verifier_')) {
    submissionId = submissionId.replace('verifier_', '');
  }
  doc
    .fontSize(10)
    .font('Helvetica')
    .fillColor("#000000")
    .text(`Submission ID: ${submissionId}`, headerBoxX + 10, headerBoxY + 35, {
      width: headerBoxWidth - 20,
      align: 'left'
    });
  
  // Submission Date (detailed format) - Australian format: DD Month YYYY
  const submittedText = submission.submittedAt 
    ? (() => {
        const d = new Date(submission.submittedAt);
        const day = d.getDate();
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'];
        const month = monthNames[d.getMonth()];
        const year = d.getFullYear();
        return `${day} ${month} ${year}`;
      })()
    : "Not submitted";
  
  doc
    .fontSize(10)
    .font('Helvetica')
    .fillColor("#000000")
    .text(`Submitted: ${submittedText}`, headerBoxX + 10, headerBoxY + 50, {
      width: headerBoxWidth - 20,
      align: 'left'
    });
  
  // Status
  const statusText = submission.status || 'pending';
  doc
    .fontSize(10)
    .font('Helvetica')
    .fillColor("#000000")
    .text(`Status: ${statusText.charAt(0).toUpperCase() + statusText.slice(1)}`, headerBoxX + 10, headerBoxY + 50, {
      width: headerBoxWidth - 20,
      align: 'right'
    });
  
  // Move cursor below the header box
  doc.y = headerBoxY + headerBoxHeight + 15;

  // Check if RPL form
  if (isRPLForm(formTemplate)) {
    await addRPLFormDataToPDF(doc, formTemplate, formData);
  } else {
    // Third-party data is merged into submission.formData when the TPR flow completes
    // ($__parent is Mongoose-internal and is never present on lean/JSON exports — do not branch on it)
    if (submission.filledBy === "third-party") {
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor("#000000")
        .text("Third party submission (employer / reference data as stored)", 50, doc.y + 10);
      doc.moveDown(0.8);
    }
    await addRegularFormDataToPDF(doc, formTemplate, formData);
  }

  // Add footer area for description + student initials
  addFormStudentFooter(doc, {
    ...footerOptions,
    assessmentNotes: submission.assessmentNotes,
    assessorFeedback: submission.assessorFeedback,
  });
  
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

// Footer block at end of every rendered form for manual notes + initials
function addFormStudentFooter(doc, footerOptions = {}) {
  const initials = (footerOptions.studentInitials || "").toString().trim();
  const notesBlock = [
    footerOptions.assessmentNotes,
    footerOptions.assessorFeedback,
  ]
    .filter((s) => s && String(s).trim())
    .join("\n\n");
  // Ensure there is space; otherwise move to new page
  if (doc.y > 640) {
    doc.addPage();
    addPageHeader(doc, doc._application, {
      studentInitials: doc._studentInitials,
    });
  }

  doc.moveDown(1);

  // Description label
  doc
    .fontSize(11)
    .font("Helvetica-Bold")
    .fillColor("#000000")
    .text("Description / notes (assessor & system)", 50, doc.y + 5);

  const boxY = doc.y + 22;

  // Description box for assessor / admin notes
  doc
    .lineWidth(0.5)
    .strokeColor("#d1d5db")
    .rect(50, boxY, 495, 60)
    .stroke();

  if (notesBlock) {
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor("#374151")
      .text(notesBlock, 54, boxY + 4, { width: 487, lineGap: 2 });
  }

  // Student initials label + line (with optional prefilled initials)
  const initialsY = boxY + 75;
  doc
    .fontSize(10)
    .font("Helvetica")
    .fillColor("#000000")
    .text("Student initials:", 50, initialsY, { continued: true });

  if (initials) {
    doc.text(` ${initials}`, undefined, undefined);
  } else {
    doc.text(" ", undefined, undefined);
  }

  doc
    .strokeColor("#9ca3af")
    .lineWidth(0.5)
    .moveTo(140, initialsY + 10)
    .lineTo(260, initialsY + 10)
    .stroke();

  // Move cursor below footer
  doc.y = initialsY + 24;
}

function isRPLForm(template) {
  return template?.name && template.name.includes("RPL");
}

/** Candidate storage keys for a field (templates vary: plain, section_field, etc.) */
function collectFieldKeyCandidates(section, field) {
  const fn = field && field.fieldName;
  if (!fn) return [];
  const keys = [];
  const add = (k) => {
    if (k && !keys.includes(k)) keys.push(k);
  };
  add(fn);
  if (fn.includes(".")) add(fn.replace(/\./g, "_"));
  if (section && section.section) add(`${section.section}_${fn}`);
  if (section && section.section) add(`${section.section}_${fn.replace(/\./g, "_")}`);
  if (section && section.sectionId) add(`${section.sectionId}_${fn}`);
  if (section && section.id) add(`${section.id}_${fn}`);
  return keys;
}

/**
 * Resolve stored value for a template field — tries composite / suffixed keys used by the app.
 */
function getRawValueFromFormData(formData, section, field) {
  if (!formData || !field) return null;
  const candidates = collectFieldKeyCandidates(section, field);
  for (const k of candidates) {
    if (Object.prototype.hasOwnProperty.call(formData, k)) {
      const v = formData[k];
      if (v !== undefined && v !== null) return v;
    }
  }
  const fn = field.fieldName;
  if (!fn) return null;
  const suffix = `_${fn}`;
  for (const key of Object.keys(formData)) {
    if (key === fn || key.endsWith(suffix)) {
      const v = formData[key];
      if (v !== undefined && v !== null) return v;
    }
  }
  return null;
}

/**
 * True when a string looks like a storage key / field id rather than a human question label.
 */
function looksLikeTechnicalFieldLabel(s) {
  if (s == null || s === undefined) return true;
  const t = String(s).trim();
  if (!t) return true;
  if (t === String(s) && /\s{2,}/.test(t)) return false;
  if (/[.!?]/.test(t) && t.length > 24) return false;
  if (/\s/.test(t) && t.length > 18) return false;
  if (/^unit_\d+_[a-z0-9_]+$/i.test(t)) return true;
  if (/^[a-z][a-z0-9_]*_\d+_[a-z0-9_]+$/i.test(t)) return true;
  if (t === t.toLowerCase() && t.includes("_") && !/\s/.test(t) && t.length < 120) {
    return true;
  }
  return false;
}

/**
 * Map fieldName -> human label from section.content (units, items, competencies) so PDFs match the app.
 */
function buildFieldLabelMapFromSection(section) {
  const map = Object.create(null);
  if (!section || typeof section !== "object") return map;

  const set = (key, val) => {
    if (!key || val == null) return;
    const v = String(val).trim();
    if (v) map[key] = v;
  };

  if (Array.isArray(section.fields)) {
    section.fields.forEach((f) => {
      if (!f || !f.fieldName) return;
      const lab = f.label && String(f.label).trim();
      if (lab && !looksLikeTechnicalFieldLabel(lab) && lab !== f.fieldName) {
        set(f.fieldName, lab);
      }
    });
  }

  const ingestItems = (unitCode, items, name) => {
    if (!unitCode || !Array.isArray(items)) return;
    items.forEach((item, idx) => {
      const desc =
        item &&
        (item.description ||
          item.text ||
          item.label ||
          item.title ||
          item.question);
      if (!desc || typeof desc !== "string") return;
      const d = desc.trim();
      set(`${unitCode}_${name}_${idx + 1}_frequency`, d);
      set(`${unitCode}_${name}_${idx}_frequency`, d);
    });
  };

  const ingestUnit = (unit) => {
    const uc = unit.unitCode || unit.code || unit.id;
    if (!uc) return;
    if (unit.frequencyHeaderText) set(`${uc}_frequency_header`, unit.frequencyHeaderText);
    if (unit.frequencyHeader && typeof unit.frequencyHeader === "string") {
      set(`${uc}_frequency_header`, unit.frequencyHeader);
    }
    if (unit.sectionHeader) set(`${uc}_frequency_header`, unit.sectionHeader);
    if (unit.additionalInformation) {
      const ai = unit.additionalInformation;
      const lab =
        (typeof ai === "object" && ai.label) ||
        (typeof ai === "string" ? ai : null);
      if (lab) {
        set(`${uc}_additional_info`, String(lab).trim());
        set(`${uc}_additional_info_text`, String(lab).trim());
      }
    }
    ingestItems(uc, unit.items, "item");
    ingestItems(uc, unit.tasks, "item");
    if (Array.isArray(unit.competencies)) {
      unit.competencies.forEach((comp, compIndex) => {
        const desc =
          comp &&
          (comp.description || comp.text || comp.label || comp.title);
        if (desc && typeof desc === "string") {
          const d = desc.trim();
          set(`${uc}_comp${compIndex}_frequency`, d);
          set(`${uc}_comp_${compIndex}_frequency`, d);
        }
      });
    }
  };

  if (Array.isArray(section.content)) {
    section.content.forEach(ingestUnit);
  }
  if (section.content && Array.isArray(section.content.units)) {
    section.content.units.forEach(ingestUnit);
  }
  if (Array.isArray(section.units)) {
    section.units.forEach(ingestUnit);
  }

  return map;
}

function humanizeFieldNameForPdf(fieldName, field) {
  const fn = String(fieldName || "").trim();
  if (!fn) return "Field";

  let m = fn.match(/^(.+)_item_(\d+)_frequency$/i);
  if (m) {
    return `Task ${m[2]} — How often do you perform this? (${m[1]})`;
  }
  m = fn.match(/^(.+)_comp(\d+)_frequency$/i);
  if (m) {
    return `Competency ${parseInt(m[2], 10) + 1} — How often (${m[1]})`;
  }
  if (/_frequency_header$/i.test(fn)) {
    return "Frequency assessment — instructions";
  }
  if (/_additional_info/i.test(fn)) {
    const lab = field && field.label && String(field.label).trim();
    if (lab && !looksLikeTechnicalFieldLabel(lab)) return lab;
    return "Additional information";
  }
  if (/comment/i.test(fn) && /employer|supervisor|assessor/i.test(fn)) {
    const lab = field && field.label && String(field.label).trim();
    if (lab && !looksLikeTechnicalFieldLabel(lab)) return lab;
    return "Employer / supervisor comments";
  }

  return fn
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Prefer rich template labels; fall back to section-derived map; then humanize ids.
 */
function getPdfFieldDisplayLabel(field, labelMap = {}) {
  if (!field) return "Field";
  const fn = field.fieldName || "";

  const mapped = fn && labelMap[fn];
  if (mapped && String(mapped).trim()) return String(mapped).trim();

  const tryList = [
    field.label,
    field.question,
    field.description,
    field.helpText,
    field.title,
    field.subLabel,
  ];

  for (const c of tryList) {
    if (c == null || c === undefined) continue;
    const s = String(c).trim();
    if (!s) continue;
    if (s === fn && looksLikeTechnicalFieldLabel(s)) continue;
    if (!looksLikeTechnicalFieldLabel(s)) return s;
  }

  return humanizeFieldNameForPdf(fn, field);
}

function getAssessmentMatrixQuestionValue(formData, section, field, question) {
  if (!formData || !field || !question) return null;
  const qid = question.questionId ?? question.id ?? question._id;
  const keys = [
    qid != null ? `${field.fieldName}_${qid}` : null,
    section && qid != null ? `${section.section}_${field.fieldName}_${qid}` : null,
    qid != null ? String(qid) : null,
  ].filter(Boolean);
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(formData, k)) {
      const v = formData[k];
      if (v !== undefined && v !== null && v !== "") return v;
    }
  }
  if (qid != null) {
    const needle = `_${qid}`;
    for (const key of Object.keys(formData)) {
      if (
        key.endsWith(needle) &&
        key.includes(String(field.fieldName || ""))
      ) {
        return formData[key];
      }
    }
  }
  return null;
}

function renderAssessmentMatrixFieldToPDF(doc, section, field, formData, pdfContext = {}) {
  if (!field.questions || !field.questions.length) return;

  const labelMap =
    pdfContext.labelMap ||
    buildFieldLabelMapFromSection(section || {});

  if (doc.y > 750) {
    doc.addPage();
    addPageHeader(doc, doc._application, {
      studentInitials: doc._studentInitials,
    });
  }

  const heading =
    getPdfFieldDisplayLabel(field, labelMap) || "Assessment matrix";
  const labelText = heading.endsWith(":") ? heading : `${heading}:`;
  doc
    .fontSize(11)
    .font("Helvetica-Bold")
    .fillColor("#000000")
    .text(`${labelText}${field.required ? " *" : ""}`, 50, doc.y + 8, {
      width: 495,
      align: "left",
      lineGap: 3,
    });
  doc.moveDown(0.4);

  field.questions.forEach((question) => {
    if (doc.y > 750) {
      doc.addPage();
      addPageHeader(doc, doc._application, {
        studentInitials: doc._studentInitials,
      });
    }
    let qText = question.question || question.label || question.text || "";
    if (!qText || looksLikeTechnicalFieldLabel(qText)) {
      const qid = question.questionId ?? question.id;
      if (qid && field.fieldName) {
        const syntheticKey = `${field.fieldName}_${qid}`;
        if (labelMap[syntheticKey]) qText = labelMap[syntheticKey];
      }
    }
    if (!qText) qText = "Question";

    const value = getAssessmentMatrixQuestionValue(
      formData,
      section,
      field,
      question
    );
    const display =
      value !== null && value !== undefined && String(value).trim() !== ""
        ? String(value)
        : "No response provided";
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#374151")
      .text(`Q: ${qText}`, 70, doc.y + 3, { width: 450 });
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#6b7280")
      .text(`A: ${display}`, 90, doc.y + 2, { width: 430 });
    doc.moveDown(0.45);
  });
  doc.moveDown(0.5);
}

async function addRPLFormDataToPDF(doc, formTemplate, formData) {
  const sections = formTemplate.formStructure;

  for (const section of sections) {
    // Section header - Bold and smaller
    // Check if we need a new page
    if (doc.y > 750) {
      doc.addPage();
      addPageHeader(doc, doc._application, {
        studentInitials: doc._studentInitials,
      });
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
      const labelMap = buildFieldLabelMapFromSection(section);
      // Handle section with explicit fields
      for (const field of section.fields) {
        if (field.fieldType === "assessmentMatrix" && field.questions) {
          renderAssessmentMatrixFieldToPDF(doc, section, field, formData, {
            labelMap,
          });
        } else {
          const rawValue = getRawValueFromFormData(formData, section, field);
          const cands = collectFieldKeyCandidates(section, field);
          const value = resolveFieldValue(field, rawValue, formData, cands);
          addFieldToPDF(doc, field, value, formData, { labelMap });
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
        addPageHeader(doc, doc._application, {
          studentInitials: doc._studentInitials,
        });
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
        const labelMap = buildFieldLabelMapFromSection(section);
        for (const field of section.fields) {
          if (field.fieldType === "assessmentMatrix" && field.questions) {
            renderAssessmentMatrixFieldToPDF(doc, section, field, formData, {
              labelMap,
            });
            continue;
          }

          const cands = collectFieldKeyCandidates(section, field);
          const rawValue = getRawValueFromFormData(formData, section, field);
          const value = resolveFieldValue(field, rawValue, formData, cands);

          if (
            field.fieldType === "rating-matrix" &&
            value &&
            typeof value === "object" &&
            !Array.isArray(value)
          ) {
            addMatrixToPDF(doc, field, value, { labelMap });
          } else if (field.fieldType === "rating-matrix") {
            addMatrixToPDF(doc, field, value && typeof value === "object" ? value : {}, { labelMap });
          } else {
            addFieldToPDF(doc, field, value, formData, { labelMap });
          }
        }
      }
      doc.moveDown();
    }
  } else {
    // Flat structure
    const flatLabelMap = buildFieldLabelMapFromSection({
      fields: Array.isArray(structure) ? structure : [],
    });
    for (const field of structure) {
      const rawValue = formData
        ? getRawValueFromFormData(formData, null, field)
        : null;
      const value = resolveFieldValue(field, rawValue, formData, [
        field.fieldName,
      ]);

      if (field.fieldType === "assessmentMatrix" && field.questions) {
        renderAssessmentMatrixFieldToPDF(doc, null, field, formData, {
          labelMap: flatLabelMap,
        });
        continue;
      }

      if (
        field.fieldType === "rating-matrix" &&
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        addMatrixToPDF(doc, field, value, { labelMap: flatLabelMap });
      } else if (field.fieldType === "rating-matrix") {
        addMatrixToPDF(doc, field, value && typeof value === "object" ? value : {}, { labelMap: flatLabelMap });
      } else {
        addFieldToPDF(doc, field, value, formData, { labelMap: flatLabelMap });
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
  
  const fieldName = field.fieldName || '';

  // Check for signature artifacts (e.g., fieldName_drawing, fieldName_signedAt, etc.)
  // Only match artifacts that correspond to THIS specific field
  const hasSignatureArtifacts = keys.some(
    (key) =>
      key &&
      formData &&
      (formData[`${key}_drawing`] ||
        formData[`${key}_signedAt`] ||
        formData[`${key}_signedBy`] ||
        formData[`${key}_name`])
  );

  // Check if the field name itself has a _drawing key or contains image data
  // IMPORTANT: Only match signatures that correspond to THIS field, not any signature
  const fieldNameLower = (fieldName || '').toLowerCase();
  const isAssessorSignatureField = fieldNameLower.includes('assessor') || field.fieldType === 'assessor_signature';
  const isStudentSignatureField = !isAssessorSignatureField && (fieldNameLower.includes('student') || fieldNameLower.includes('sign'));
  
  const hasDirectDrawingKey = formData && (
    // Direct match: fieldName_drawing exists
    formData[`${fieldName}_drawing`] ||
    // Field value itself contains image data
    (formData[fieldName] && typeof formData[fieldName] === 'string' && formData[fieldName].includes('data:image')) ||
    // For assessor signature fields ONLY: check for assessor signature patterns
    (isAssessorSignatureField && Object.keys(formData).some(k => {
      const kLower = k.toLowerCase();
      return kLower.includes('assessor') && 
             kLower.includes('signature') && 
             (k.endsWith('_drawing') || k.includes('drawing')) &&
             kLower.includes(fieldNameLower.replace(/_/g, '')); // Must match field name
    })) ||
    // For student signature fields: check for student signature patterns (exclude assessor)
    (isStudentSignatureField && Object.keys(formData).some(k => {
      const kLower = k.toLowerCase();
      const matchesField = kLower.includes(fieldNameLower.replace(/_/g, '')) || 
                          (kLower.includes('student') && kLower.includes('sign'));
      const isAssessorSig = kLower.includes('assessor') && kLower.includes('signature');
      return matchesField && !isAssessorSig && (k.endsWith('_drawing') || k.includes('drawing'));
    }))
  );

  const isSignatureField =
    field.fieldType === "signature" ||
    field.fieldType === "assessor_signature" ||
    (rawValue &&
      typeof rawValue === "object" &&
      (rawValue.kind === "signature" ||
        rawValue.style ||
        rawValue.dataUrl ||
        rawValue.data)) ||
    hasSignatureArtifacts ||
    hasDirectDrawingKey;

  if (!isSignatureField) {
    return rawValue;
  }

  const normalizedFromValue = normalizeSignatureInput(rawValue);
  if (normalizedFromValue) {
    attachSignatureMetadata(normalizedFromValue, formData, keys);
    return normalizedFromValue;
  }

  // Check for drawing value using field name patterns
  let drawingValue = keys
    .map((key) => (key && formData ? formData[`${key}_drawing`] : null))
    .find((val) => !!val);
  
  // If not found, also check for assessor signature patterns (e.g., assessor_signature_drawing)
  // This handles cases where assessor signatures are stored with different naming conventions
  // IMPORTANT: Only match signatures that correspond to THIS specific field, not any signature
  if (!drawingValue && formData && fieldName) {
    const fieldNameLower = fieldName.toLowerCase();
    const isAssessorSignatureField = fieldNameLower.includes('assessor') || field.fieldType === 'assessor_signature';
    const isStudentSignatureField = !isAssessorSignatureField && (fieldNameLower.includes('student') || fieldNameLower.includes('sign'));
    
    // Look for signature drawing data that matches THIS field specifically
    const possibleKeys = Object.keys(formData).filter(k => {
      const kLower = k.toLowerCase();
      const isDrawingKey = k.endsWith('_drawing') || k.includes('drawing');
      const isImageData = typeof formData[k] === 'string' && 
                         (formData[k].startsWith('data:image') || formData[k].length > 100);
      
      if (!isDrawingKey || !isImageData) return false;
      
      // For assessor signature fields, only match assessor signatures
      if (isAssessorSignatureField) {
        return kLower.includes('assessor') && kLower.includes('signature');
      }
      
      // For student signature fields, only match student signatures (NOT assessor signatures)
      if (isStudentSignatureField) {
        // Match if key contains field name (e.g., "studentSign_drawing") OR student-related terms
        // BUT explicitly exclude assessor signatures
        const matchesFieldName = kLower.includes(fieldNameLower.replace(/_/g, '')) || 
                                (kLower.includes('student') && kLower.includes('sign'));
        const isAssessorSig = kLower.includes('assessor') && kLower.includes('signature');
        return matchesFieldName && !isAssessorSig;
      }
      
      // For generic signature fields, match if key contains field name
      return kLower.includes(fieldNameLower.replace(/_/g, ''));
    });
    
    if (possibleKeys.length > 0) {
      // Prefer exact match with field name
      const exactMatch = possibleKeys.find(k => 
        k.toLowerCase().includes(fieldNameLower.replace(/_/g, ''))
      );
      drawingValue = formData[exactMatch || possibleKeys[0]];
    }
  }
  
  if (drawingValue) {
    const normalizedDrawing = normalizeSignatureDrawing(drawingValue);
    if (normalizedDrawing) {
      attachSignatureMetadata(normalizedDrawing, formData, keys);
      return normalizedDrawing;
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

function addFieldToPDF(doc, field, rawValue, formData = null, pdfContext = {}) {
  if (doc.y > 700) doc.addPage();

  const labelMap = pdfContext.labelMap || {};
  const labelBase = getPdfFieldDisplayLabel(field, labelMap);

  // Static / structural fields — still render text for audit trails
  if (
    field.fieldType === "label" ||
    field.fieldType === "heading" ||
    field.fieldType === "divider" ||
    field.fieldType === "info"
  ) {
    if (doc.y > 750) {
      doc.addPage();
      addPageHeader(doc, doc._application, {
        studentInitials: doc._studentInitials,
      });
    }
    const staticText =
      field.text ||
      field.html ||
      field.content ||
      (field.label &&
      !looksLikeTechnicalFieldLabel(String(field.label))
        ? String(field.label).trim()
        : null) ||
      (field.fieldType === "divider" ? "—" : labelBase);
    const size = field.fieldType === "heading" ? 12 : 10;
    doc
      .fontSize(size)
      .font(field.fieldType === "heading" ? "Helvetica-Bold" : "Helvetica")
      .fillColor(field.fieldType === "heading" ? "#111827" : "#374151")
      .text(staticText, 50, doc.y + 8, { width: 495, lineGap: 3 });
    doc.moveDown(field.fieldType === "divider" ? 0.6 : 1);
    return;
  }

  // Question label - Professional formatting
  const labelText = labelBase.endsWith(":") ? labelBase : `${labelBase}:`;
  
  // Check if we need a new page
  if (doc.y > 750) {
    doc.addPage();
    addPageHeader(doc, doc._application, {
      studentInitials: doc._studentInitials,
    });
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

  // Signature special handling - check field type first, then check for signature artifacts in formData
  const isSignatureFieldByType = field.fieldType === 'signature' || field.fieldType === 'assessor_signature';
  const isSignatureFieldByValue = rawValue && typeof rawValue === 'object' && rawValue.kind === 'signature';
  
  // Also check if this field has signature artifacts (like _drawing suffix) even if rawValue is null
  const fieldName = field.fieldName || '';
  const hasSignatureArtifacts = formData && (
    formData[`${fieldName}_drawing`] ||
    (fieldName.toLowerCase().includes('signature') && Object.keys(formData).some(k => 
      k.toLowerCase().includes('signature') && 
      (k.endsWith('_drawing') || k.includes('drawing')) &&
      typeof formData[k] === 'string' && formData[k].startsWith('data:image')
    ))
  );
  
  if (isSignatureFieldByType || isSignatureFieldByValue || hasSignatureArtifacts) {
    // If rawValue is not a signature object but we have signature artifacts, resolve it properly
    if (!rawValue || (typeof rawValue !== 'object' || rawValue.kind !== 'signature')) {
      // Re-resolve the field value to get the signature data
      const resolvedValue = resolveFieldValue(field, rawValue, formData, [fieldName]);
      renderSignature(doc, resolvedValue || {});
    } else {
      renderSignature(doc, rawValue || {});
    }
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
      addPageHeader(doc, doc._application, {
        studentInitials: doc._studentInitials,
      });
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
    const emptyLine =
      field.fieldType === "checkbox"
        ? "None selected"
        : "No response provided";
    if (doc.y > 750) {
      doc.addPage();
      addPageHeader(doc, doc._application, {
        studentInitials: doc._studentInitials,
      });
    }
    doc
      .fontSize(10)
      .font("Helvetica-Oblique")
      .fillColor("#6b7280")
      .text(emptyLine, 60, doc.y + 5, { width: 475, align: "left", lineGap: 3 });
    doc.moveDown(1.2);
  }
}

// Pretty renderer for rating-matrix fields (object of label -> value)
function addMatrixToPDF(doc, field, matrixObj, pdfContext = {}) {
  if (doc.y > 700) doc.addPage();

  const labelMap = pdfContext.labelMap || {};
  const labelBase = getPdfFieldDisplayLabel(field, labelMap) || "Rating matrix";

  // Question label - Bold (remove extra colons)
  const labelText = labelBase.endsWith(":") ? labelBase : `${labelBase}:`;
  
  // Check if we need a new page
  if (doc.y > 750) {
    doc.addPage();
    addPageHeader(doc, doc._application, {
      studentInitials: doc._studentInitials,
    });
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

  const lines =
    matrixObj && Object.keys(matrixObj).length > 0
      ? Object.entries(matrixObj).map(([k, v]) => {
          const value = v && v.toString().trim() !== "" ? v : "Not provided";
          return `${k}: ${value}`;
        })
      : ["No response provided (matrix empty)"];

  const text = lines.join("\n");

  // Check if we need a new page
  if (doc.y > 750) {
    doc.addPage();
    addPageHeader(doc, doc._application, {
      studentInitials: doc._studentInitials,
    });
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
          const value = getAssessmentMatrixQuestionValue(
            formData,
            section,
            field,
            question
          );
          const display =
            value !== null &&
            value !== undefined &&
            String(value).trim() !== ""
              ? String(value)
              : "No response provided";
          hasResponses = true;
          if (doc.y > 750) {
            doc.addPage();
            addPageHeader(doc, doc._application, {
              studentInitials: doc._studentInitials,
            });
          }
          doc
            .fontSize(9)
            .fillColor("#374151")
            .text(`Q: ${question.question}`, 70, doc.y + 3, { width: 450 });
          doc
            .fontSize(9)
            .fillColor("#6b7280") 
            .text(`A: ${display}`, 90, doc.y + 2, { width: 430 });
          doc.moveDown(0.4);
        });

        if (!hasResponses) {
          doc
            .fontSize(9)
            .fillColor("#6b7280")
            .text("No questions in template for this matrix.", 90, doc.y + 3);
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
        for (let i = 0; i < unitField.questions.length; i++) {
          const question = unitField.questions[i];
          const questionKey = `${unitField.fieldName}_question_${i}`;
          const altKey =
            typeof question === "string" ? question : question?.questionId;
          const response =
            formData[questionKey] ??
            (altKey != null ? formData[altKey] : undefined);
          const display =
            response !== undefined &&
            response !== null &&
            String(response).trim() !== ""
              ? String(response)
              : "No response provided";

          if (doc.y > 750) {
            doc.addPage();
            addPageHeader(doc, doc._application, {
              studentInitials: doc._studentInitials,
            });
          }
          const qLabel =
            typeof question === "string"
              ? question
              : question?.question || question?.label || "";
          doc
            .fontSize(9)
            .fillColor("#374151")
            .text(`Q${i + 1}: ${qLabel}`, 70, doc.y + 3, { width: 450 });
          doc
            .fontSize(9)
            .fillColor("#6b7280")
            .text(`A: ${display}`, 90, doc.y + 2, { width: 430 });
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
    forms: submissions.map((submission) => {
      let formId = submission._id ? submission._id.toString() : null;
      // Remove "verifier_" prefix if present for cleaner display
      if (formId && formId.startsWith('verifier_')) {
        formId = formId.replace('verifier_', '');
      }
      return {
        formId: formId,
        formName: submission.formTemplateId.name,
        submittedAt: submission.submittedAt,
        status: submission.status,
        data: submission.formData,
      };
    }),
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
    forms: submissions.map((submission) => {
      let formId = submission._id ? submission._id.toString() : null;
      // Remove "verifier_" prefix if present for cleaner display
      if (formId && formId.startsWith('verifier_')) {
        formId = formId.replace('verifier_', '');
      }
      return {
        formId: formId,
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
      };
    }),
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="all_forms_${Date.now()}.json"`
  );

  res.json(report);
}

module.exports = formExportController;