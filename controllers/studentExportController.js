// controllers/studentExportController.js
const User = require("../models/user");
const Application = require("../models/application");
const FormSubmission = require("../models/formSubmission");
const DocumentUpload = require("../models/documentUpload");
const Payment = require("../models/payment");
const PDFDocument = require("pdfkit");

const studentExportController = {
  // Export students in CSV format
  exportStudentsCSV: async (req, res) => {
    try {
      const {
        status,
        certification,
        assessor,
        dateFrom,
        dateTo,
        includeFields = 'basic'
      } = req.query;

      // Build filter based on user role
      const userId = req.user.id;
      const userRole = req.user.userType;
      
      let applicationFilter = {};
      
      // If assessor, only show their assigned students
      if (userRole === 'assessor') {
        applicationFilter.assignedAssessor = userId;
      }
      
      // Apply additional filters
      if (status && status !== 'all') {
        applicationFilter.overallStatus = status;
      }
      
      if (certification && certification !== 'all') {
        applicationFilter.certificationId = certification;
      }
      
      if (assessor && assessor !== 'all' && userRole !== 'assessor') {
        applicationFilter.assignedAssessor = assessor;
      }
      
      if (dateFrom || dateTo) {
        applicationFilter.createdAt = {};
        if (dateFrom) applicationFilter.createdAt.$gte = new Date(dateFrom);
        if (dateTo) applicationFilter.createdAt.$lte = new Date(dateTo);
      }

      // Get applications with student data
      const applications = await Application.find(applicationFilter)
        .populate('userId', 'firstName lastName email phoneNumber createdAt')
        .populate('certificationId', 'name')
        .populate('assignedAssessor', 'firstName lastName email')
        .populate('paymentId')
        .sort({ createdAt: -1 });

      // Determine which fields to include
      const fieldSets = {
        basic: ['firstName', 'lastName', 'email', 'phoneNumber', 'applicationId', 'certification', 'status', 'createdAt'],
        detailed: ['firstName', 'lastName', 'email', 'phoneNumber', 'applicationId', 'certification', 'status', 'assignedAssessor', 'currentStep', 'paymentStatus', 'createdAt', 'updatedAt'],
        full: ['firstName', 'lastName', 'email', 'phoneNumber', 'applicationId', 'certification', 'status', 'assignedAssessor', 'currentStep', 'paymentStatus', 'paymentAmount', 'documentsStatus', 'formsCompleted', 'createdAt', 'updatedAt']
      };
      
      const selectedFields = fieldSets[includeFields] || fieldSets.basic;

      // Prepare CSV data
      const csvData = await Promise.all(applications.map(async (app) => {
        const student = app.userId;
        const certification = app.certificationId;
        const assessor = app.assignedAssessor;
        
        // Get additional data for full export
        let documentsCount = 0;
        let formsCount = 0;
        let paymentAmount = 0;
        let paymentStatus = 'pending';
        
        if (includeFields === 'full') {
          // Get documents count
          const documentUpload = await DocumentUpload.findOne({ applicationId: app._id });
          documentsCount = documentUpload ? documentUpload.documents.length : 0;
          
          // Get forms count
          const formSubmissions = await FormSubmission.countDocuments({ applicationId: app._id });
          formsCount = formSubmissions;
          
          // Get payment info
          if (app.paymentId) {
            const payment = await Payment.findById(app.paymentId);
            if (payment) {
              paymentAmount = payment.totalAmount || 0;
              paymentStatus = payment.status || 'pending';
            }
          }
        }

        const rowData = {};
        
        // Map field data
        if (selectedFields.includes('firstName')) rowData.firstName = student.firstName;
        if (selectedFields.includes('lastName')) rowData.lastName = student.lastName;
        if (selectedFields.includes('email')) rowData.email = student.email;
        if (selectedFields.includes('phoneNumber')) rowData.phoneNumber = student.phoneNumber;
        if (selectedFields.includes('applicationId')) rowData.applicationId = app._id.toString();
        if (selectedFields.includes('certification')) rowData.certification = certification ? certification.name : 'N/A';
        if (selectedFields.includes('status')) rowData.status = app.overallStatus;
        if (selectedFields.includes('assignedAssessor')) rowData.assignedAssessor = assessor ? `${assessor.firstName} ${assessor.lastName}` : 'Unassigned';
        if (selectedFields.includes('currentStep')) rowData.currentStep = app.currentStep || 1;
        if (selectedFields.includes('paymentStatus')) rowData.paymentStatus = paymentStatus;
        if (selectedFields.includes('paymentAmount')) rowData.paymentAmount = paymentAmount;
        if (selectedFields.includes('documentsStatus')) rowData.documentsStatus = documentsCount > 0 ? 'Uploaded' : 'Pending';
        if (selectedFields.includes('formsCompleted')) rowData.formsCompleted = formsCount;
        if (selectedFields.includes('createdAt')) rowData.createdAt = app.createdAt.toLocaleDateString();
        if (selectedFields.includes('updatedAt')) rowData.updatedAt = app.updatedAt.toLocaleDateString();
        
        return rowData;
      }));

      // Generate CSV content
      const csvHeader = selectedFields.map(field => {
        const headerMap = {
          firstName: 'First Name',
          lastName: 'Last Name',
          email: 'Email',
          phoneNumber: 'Phone Number',
          applicationId: 'Application ID',
          certification: 'Certification',
          status: 'Status',
          assignedAssessor: 'Assigned Assessor',
          currentStep: 'Current Step',
          paymentStatus: 'Payment Status',
          paymentAmount: 'Payment Amount',
          documentsStatus: 'Documents Status',
          formsCompleted: 'Forms Completed',
          createdAt: 'Created Date',
          updatedAt: 'Updated Date'
        };
        return headerMap[field] || field;
      }).join(',');

      const csvRows = csvData.map(row => 
        selectedFields.map(field => {
          const value = row[field] || '';
          // Escape commas and quotes in CSV
          return typeof value === 'string' && value.includes(',') ? `"${value.replace(/"/g, '""')}"` : value;
        }).join(',')
      );

      const csvContent = [csvHeader, ...csvRows].join('\n');

      // Set headers for file download
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `students_export_${timestamp}.csv`;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      res.send(csvContent);

    } catch (error) {
      console.error('Export students CSV error:', error);
      res.status(500).json({
        success: false,
        message: 'Error exporting student data',
      });
    }
  },

  // Export students in Excel format
  exportStudentsExcel: async (req, res) => {
    try {
      const ExcelJS = require('exceljs');
      const {
        status,
        certification,
        assessor,
        dateFrom,
        dateTo,
        includeFields = 'basic'
      } = req.query;

      // Build filter (same logic as CSV)
      const userId = req.user.id;
      const userRole = req.user.userType;
      
      let applicationFilter = {};
      
      if (userRole === 'assessor') {
        applicationFilter.assignedAssessor = userId;
      }
      
      if (status && status !== 'all') {
        applicationFilter.overallStatus = status;
      }
      
      if (certification && certification !== 'all') {
        applicationFilter.certificationId = certification;
      }
      
      if (assessor && assessor !== 'all' && userRole !== 'assessor') {
        applicationFilter.assignedAssessor = assessor;
      }
      
      if (dateFrom || dateTo) {
        applicationFilter.createdAt = {};
        if (dateFrom) applicationFilter.createdAt.$gte = new Date(dateFrom);
        if (dateTo) applicationFilter.createdAt.$lte = new Date(dateTo);
      }

      const applications = await Application.find(applicationFilter)
        .populate('userId', 'firstName lastName email phoneNumber createdAt')
        .populate('certificationId', 'name')
        .populate('assignedAssessor', 'firstName lastName email')
        .populate('paymentId')
        .sort({ createdAt: -1 });

      // Create workbook and worksheet
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Students');

      // Define columns based on includeFields
      const fieldSets = {
        basic: [
          { header: 'First Name', key: 'firstName', width: 15 },
          { header: 'Last Name', key: 'lastName', width: 15 },
          { header: 'Email', key: 'email', width: 25 },
          { header: 'Phone Number', key: 'phoneNumber', width: 15 },
          { header: 'Application ID', key: 'applicationId', width: 25 },
          { header: 'Certification', key: 'certification', width: 30 },
          { header: 'Status', key: 'status', width: 15 },
          { header: 'Created Date', key: 'createdAt', width: 12 }
        ],
        detailed: [
          { header: 'First Name', key: 'firstName', width: 15 },
          { header: 'Last Name', key: 'lastName', width: 15 },
          { header: 'Email', key: 'email', width: 25 },
          { header: 'Phone Number', key: 'phoneNumber', width: 15 },
          { header: 'Application ID', key: 'applicationId', width: 25 },
          { header: 'Certification', key: 'certification', width: 30 },
          { header: 'Status', key: 'status', width: 15 },
          { header: 'Assigned Assessor', key: 'assignedAssessor', width: 20 },
          { header: 'Current Step', key: 'currentStep', width: 12 },
          { header: 'Payment Status', key: 'paymentStatus', width: 15 },
          { header: 'Created Date', key: 'createdAt', width: 12 },
          { header: 'Updated Date', key: 'updatedAt', width: 12 }
        ],
        full: [
          { header: 'First Name', key: 'firstName', width: 15 },
          { header: 'Last Name', key: 'lastName', width: 15 },
          { header: 'Email', key: 'email', width: 25 },
          { header: 'Phone Number', key: 'phoneNumber', width: 15 },
          { header: 'Application ID', key: 'applicationId', width: 25 },
          { header: 'Certification', key: 'certification', width: 30 },
          { header: 'Status', key: 'status', width: 15 },
          { header: 'Assigned Assessor', key: 'assignedAssessor', width: 20 },
          { header: 'Current Step', key: 'currentStep', width: 12 },
          { header: 'Payment Status', key: 'paymentStatus', width: 15 },
          { header: 'Payment Amount', key: 'paymentAmount', width: 15 },
          { header: 'Documents Status', key: 'documentsStatus', width: 15 },
          { header: 'Forms Completed', key: 'formsCompleted', width: 15 },
          { header: 'Created Date', key: 'createdAt', width: 12 },
          { header: 'Updated Date', key: 'updatedAt', width: 12 }
        ]
      };

      worksheet.columns = fieldSets[includeFields] || fieldSets.basic;

      // Style the header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6E6FA' }
      };

      // Add data rows
      for (const app of applications) {
        const student = app.userId;
        const certification = app.certificationId;
        const assessor = app.assignedAssessor;
        
        // Get additional data for full export
        let documentsCount = 0;
        let formsCount = 0;
        let paymentAmount = 0;
        let paymentStatus = 'pending';
        
        if (includeFields === 'full') {
          const documentUpload = await DocumentUpload.findOne({ applicationId: app._id });
          documentsCount = documentUpload ? documentUpload.documents.length : 0;
          
          const formSubmissions = await FormSubmission.countDocuments({ applicationId: app._id });
          formsCount = formSubmissions;
          
          if (app.paymentId) {
            const payment = await Payment.findById(app.paymentId);
            if (payment) {
              paymentAmount = payment.totalAmount || 0;
              paymentStatus = payment.status || 'pending';
            }
          }
        }

        worksheet.addRow({
          firstName: student.firstName,
          lastName: student.lastName,
          email: student.email,
          phoneNumber: student.phoneNumber,
          applicationId: app._id.toString(),
          certification: certification ? certification.name : 'N/A',
          status: app.overallStatus,
          assignedAssessor: assessor ? `${assessor.firstName} ${assessor.lastName}` : 'Unassigned',
          currentStep: app.currentStep || 1,
          paymentStatus: paymentStatus,
          paymentAmount: paymentAmount,
          documentsStatus: documentsCount > 0 ? 'Uploaded' : 'Pending',
          formsCompleted: formsCount,
          createdAt: app.createdAt.toLocaleDateString(),
          updatedAt: app.updatedAt.toLocaleDateString()
        });
      }

      // Set response headers
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `students_export_${timestamp}.xlsx`;
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Write to response
      await workbook.xlsx.write(res);
      res.end();

    } catch (error) {
      console.error('Export students Excel error:', error);
      res.status(500).json({
        success: false,
        message: 'Error exporting student data',
      });
    }
  },

  // Export students in PDF format
  exportStudentsPDF: async (req, res) => {
    try {
      const {
        status,
        certification,
        assessor,
        dateFrom,
        dateTo,
        includeFields = 'detailed'
      } = req.query;

      // Build filter based on user role
      const userId = req.user.id;
      const userRole = req.user.userType;
      
      let applicationFilter = {};
      
      // If assessor, only show their assigned students
      if (userRole === 'assessor') {
        applicationFilter.assignedAssessor = userId;
      }
      
      // Apply additional filters
      if (status && status !== 'all') {
        applicationFilter.overallStatus = status;
      }
      
      if (certification && certification !== 'all') {
        applicationFilter.certificationId = certification;
      }
      
      if (assessor && assessor !== 'all' && userRole !== 'assessor') {
        applicationFilter.assignedAssessor = assessor;
      }
      
      if (dateFrom || dateTo) {
        applicationFilter.createdAt = {};
        if (dateFrom) applicationFilter.createdAt.$gte = new Date(dateFrom);
        if (dateTo) applicationFilter.createdAt.$lte = new Date(dateTo);
      }

      // Get applications with student data
      const applications = await Application.find(applicationFilter)
        .populate('userId', 'firstName lastName email phoneNumber createdAt')
        .populate('certificationId', 'name')
        .populate('assignedAssessor', 'firstName lastName email')
        .populate('paymentId')
        .sort({ createdAt: -1 });

      // Generate PDF
      await generateStudentsPDF(res, applications, {
        includeFields,
        userRole,
        filters: { status, certification, assessor, dateFrom, dateTo }
      });

    } catch (error) {
      console.error('Export students PDF error:', error);
      res.status(500).json({
        success: false,
        message: 'Error exporting student data to PDF',
      });
    }
  },

  // Export single student application as PDF
  exportSingleStudentPDF: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const userId = req.user.id;
      const userRole = req.user.userType;

      // Build filter based on user role
      let applicationFilter = { _id: applicationId };
      
      // If assessor, only allow their assigned students
      if (userRole === 'assessor') {
        applicationFilter.assignedAssessor = userId;
      }

      // Get the specific application with all details
      const application = await Application.findOne(applicationFilter)
        .populate('userId', 'firstName lastName email phoneNumber createdAt')
        .populate('certificationId', 'name price description')
        .populate('assignedAssessor', 'firstName lastName email')
        .populate('initialScreeningFormId')
        .populate('paymentId')
        .populate({
          path: 'formSubmissions.formTemplateId',
          select: 'name'
        });

      if (!application) {
        return res.status(404).json({
          success: false,
          message: 'Application not found or access denied',
        });
      }

      // Get additional data
      const [documentUpload, formSubmissions] = await Promise.all([
        DocumentUpload.findOne({ applicationId: application._id }),
        FormSubmission.find({ applicationId: application._id })
          .populate('formTemplateId', 'name')
          .sort({ submittedAt: -1 })
      ]);

      // Generate PDF
      await generateSingleStudentPDF(res, application, {
        documentUpload,
        formSubmissions,
        userRole
      });

    } catch (error) {
      console.error('Export single student PDF error:', error);
      res.status(500).json({
        success: false,
        message: 'Error exporting student application PDF',
      });
    }
  },

  // Get export statistics
  getExportStats: async (req, res) => {
    try {
      const userId = req.user.id;
      const userRole = req.user.userType;
      
      let applicationFilter = {};
      
      // If assessor, only show their assigned students
      if (userRole === 'assessor') {
        applicationFilter.assignedAssessor = userId;
      }

      const [
        totalStudents,
        activeApplications,
        completedApplications,
        pendingPayments
      ] = await Promise.all([
        Application.countDocuments(applicationFilter),
        Application.countDocuments({ ...applicationFilter, overallStatus: { $in: ['in_progress', 'under_review'] } }),
        Application.countDocuments({ ...applicationFilter, overallStatus: 'completed' }),
        Application.countDocuments({ ...applicationFilter, overallStatus: 'payment_pending' })
      ]);

      res.json({
        success: true,
        data: {
          totalStudents,
          activeApplications,
          completedApplications,
          pendingPayments
        }
      });

    } catch (error) {
      console.error('Get export stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting export statistics',
      });
    }
  }
};

// PDF Generation Functions
async function generateSingleStudentPDF(res, application, options) {
  const doc = new PDFDocument({ margin: 50, size: "A4" });

  // Set response headers
  const student = application.userId;
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `student_${student.firstName}_${student.lastName}_${timestamp}.pdf`;
  
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  );

  doc.pipe(res);

  // Add header
  await addSingleStudentPDFHeader(doc, application);

  // Add student details
  addStudentDetails(doc, application);

  // Add certification details
  addCertificationDetails(doc, application);

  // Add application progress (student-visible only)
  addApplicationProgress(doc, application, options);

  // Add payment information
  addPaymentInformation(doc, application);

  // Add form submissions
  addFormSubmissions(doc, options.formSubmissions);

  // Add documents information
  addDocumentsInformation(doc, options.documentUpload);

  doc.end();
}

async function generateStudentsPDF(res, applications, options) {
  const doc = new PDFDocument({ margin: 50, size: "A4" });

  // Set response headers
  const timestamp = new Date().toISOString().split('T')[0];
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="students_export_${timestamp}.pdf"`
  );

  doc.pipe(res);

  // Add header
  await addPDFHeader(doc, options);

  // Add filter information
  addFilterInfo(doc, options.filters);

  // Add students table
  await addStudentsTable(doc, applications, options.includeFields);

  doc.end();
}

async function addPDFHeader(doc, options) {
  // Add logo from URL (reusing the same logic as form export)
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
    doc.image(logoResponse, 50, 50, { width: 100 });
  } catch (error) {
    console.warn("Could not add logo to PDF:", error.message);
  }

  // Add title
  doc
    .fontSize(20)
    .fillColor("#c41c34")
    .text("Students Export Report", 200, 60);

  doc
    .fontSize(12)
    .fillColor("#6b7280")
    .text(
      `Generated: ${new Date().toLocaleString()}`,
      200,
      85
    );

  doc
    .fontSize(10)
    .fillColor("#6b7280")
    .text(
      `Exported by: ${options.userRole === 'assessor' ? 'Assessor' : 'Administrator'}`,
      200,
      100
    );

  doc.moveDown(3);
}

function addFilterInfo(doc, filters) {
  if (!filters) return;

  doc
    .fontSize(14)
    .fillColor("#374151")
    .text("Applied Filters:", 50, doc.y + 10);

  doc.fontSize(10).fillColor("#6b7280");

  let hasFilters = false;
  
  if (filters.status && filters.status !== 'all') {
    doc.text(`• Status: ${filters.status}`, 70, doc.y + 5);
    hasFilters = true;
  }
  
  if (filters.certification && filters.certification !== 'all') {
    doc.text(`• Certification: ${filters.certification}`, 70, doc.y + 3);
    hasFilters = true;
  }
  
  if (filters.assessor && filters.assessor !== 'all') {
    doc.text(`• Assessor: ${filters.assessor}`, 70, doc.y + 3);
    hasFilters = true;
  }
  
  if (filters.dateFrom) {
    doc.text(`• Date From: ${new Date(filters.dateFrom).toLocaleDateString()}`, 70, doc.y + 3);
    hasFilters = true;
  }
  
  if (filters.dateTo) {
    doc.text(`• Date To: ${new Date(filters.dateTo).toLocaleDateString()}`, 70, doc.y + 3);
    hasFilters = true;
  }

  if (!hasFilters) {
    doc.text("• No filters applied (showing all students)", 70, doc.y + 5);
  }

  doc.moveDown(2);
}

async function addStudentsTable(doc, applications, includeFields) {
  // Table headers
  const headers = getTableHeaders(includeFields);
  const startY = doc.y;
  const tableTop = startY + 20;
  const rowHeight = 25;
  
  // Draw table header
  doc
    .fontSize(10)
    .fillColor("#ffffff");

  // Header background
  doc
    .rect(50, tableTop, 500, rowHeight)
    .fill("#374151");

  // Header text
  let xPosition = 60;
  headers.forEach((header, index) => {
    const width = getColumnWidth(header.key, includeFields);
    doc.text(header.label, xPosition, tableTop + 8, { width: width - 10 });
    xPosition += width;
  });

  // Table rows
  let currentY = tableTop + rowHeight;
  
  for (let i = 0; i < applications.length; i++) {
    const app = applications[i];
    
    // Check if we need a new page
    if (currentY > 700) {
      doc.addPage();
      currentY = 50;
      
      // Redraw header on new page
      doc
        .rect(50, currentY, 500, rowHeight)
        .fill("#374151");
      
      xPosition = 60;
      doc.fillColor("#ffffff");
      headers.forEach((header) => {
        const width = getColumnWidth(header.key, includeFields);
        doc.text(header.label, xPosition, currentY + 8, { width: width - 10 });
        xPosition += width;
      });
      
      currentY += rowHeight;
    }

    // Row background (alternating colors)
    const rowColor = i % 2 === 0 ? "#f9fafb" : "#ffffff";
    doc
      .rect(50, currentY, 500, rowHeight)
      .fill(rowColor);

    // Get row data
    const rowData = await getRowData(app, includeFields);
    
    // Row text
    xPosition = 60;
    doc.fillColor("#374151").fontSize(8);
    
    headers.forEach((header) => {
      const width = getColumnWidth(header.key, includeFields);
      const value = rowData[header.key] || '';
      doc.text(String(value), xPosition, currentY + 8, { 
        width: width - 10,
        height: rowHeight - 6,
        ellipsis: true
      });
      xPosition += width;
    });

    currentY += rowHeight;
  }

  // Add summary
  doc.moveDown(2);
  doc
    .fontSize(12)
    .fillColor("#374151")
    .text(`Total Students: ${applications.length}`, 50, currentY + 20);
}

function getTableHeaders(includeFields) {
  const allHeaders = {
    firstName: { key: 'firstName', label: 'First Name' },
    lastName: { key: 'lastName', label: 'Last Name' },
    email: { key: 'email', label: 'Email' },
    phoneNumber: { key: 'phoneNumber', label: 'Phone' },
    certification: { key: 'certification', label: 'Certification' },
    status: { key: 'status', label: 'Status' },
    assignedAssessor: { key: 'assignedAssessor', label: 'Assessor' },
    currentStep: { key: 'currentStep', label: 'Step' },
    paymentStatus: { key: 'paymentStatus', label: 'Payment' },
    createdAt: { key: 'createdAt', label: 'Created' }
  };

  const fieldSets = {
    basic: ['firstName', 'lastName', 'email', 'certification', 'status', 'createdAt'],
    detailed: ['firstName', 'lastName', 'email', 'certification', 'status', 'assignedAssessor', 'currentStep', 'createdAt'],
    full: ['firstName', 'lastName', 'email', 'certification', 'status', 'assignedAssessor', 'currentStep', 'paymentStatus', 'createdAt']
  };

  const selectedFields = fieldSets[includeFields] || fieldSets.detailed;
  return selectedFields.map(field => allHeaders[field]);
}

function getColumnWidth(fieldKey, includeFields) {
  // Adjust column widths based on the number of columns
  const fieldSets = {
    basic: 6,
    detailed: 8,
    full: 9
  };
  
  const columnCount = fieldSets[includeFields] || 8;
  const baseWidth = 500 / columnCount;
  
  // Adjust specific columns
  const widthAdjustments = {
    email: baseWidth * 1.5,
    certification: baseWidth * 1.3,
    assignedAssessor: baseWidth * 1.2,
    firstName: baseWidth * 0.8,
    lastName: baseWidth * 0.8,
    currentStep: baseWidth * 0.6,
    createdAt: baseWidth * 0.9
  };
  
  return widthAdjustments[fieldKey] || baseWidth;
}

async function getRowData(app, includeFields) {
  const student = app.userId;
  const certification = app.certificationId;
  const assessor = app.assignedAssessor;
  
  // Get additional data if needed
  let paymentStatus = 'pending';
  
  if (includeFields === 'full' && app.paymentId) {
    const payment = await Payment.findById(app.paymentId);
    if (payment) {
      paymentStatus = payment.status || 'pending';
    }
  }

  return {
    firstName: student.firstName,
    lastName: student.lastName,
    email: student.email,
    phoneNumber: student.phoneNumber,
    certification: certification ? certification.name : 'N/A',
    status: app.overallStatus || 'pending',
    assignedAssessor: assessor ? `${assessor.firstName} ${assessor.lastName}` : 'Unassigned',
    currentStep: app.currentStep || 1,
    paymentStatus: paymentStatus,
    createdAt: app.createdAt.toLocaleDateString()
  };
}

// Helper functions for single student PDF
async function addSingleStudentPDFHeader(doc, application) {
  // Add logo from URL (using ALIT logo)
  const logoUrl = process.env.LOGO_URL || "";
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
    doc.image(logoResponse, 50, 50, { width: 100 });
  } catch (error) {
    console.warn("Could not add logo to PDF:", error.message);
  }

  const student = application.userId;

  // Add title
  doc
    .fontSize(20)
    .fillColor("#1f2937")
    .text(`ALIT Student Application Report`, 200, 60);

  doc
    .fontSize(14)
    .fillColor("#374151")
    .text(`${student.firstName} ${student.lastName}`, 200, 85);

  doc
    .fontSize(10)
    .fillColor("#6b7280")
    .text(
      `Application ID: ${application._id}`,
      200,
      105
    );

  doc.text(
    `Generated: ${new Date().toLocaleString()}`,
    200,
    120
  );

  // Add ALIT company info
  doc
    .fontSize(10)
    .fillColor("#9ca3af")
    .text("ALIT EDUCATION GROUP PTY. LTD.", 200, 140);
  doc.text("Trading as Australian Leading Institute of Technology", 200, 155);
  doc.text("ABN: 61 610 991 145 | RTO No: 45156 | CRICOS: 03981M", 200, 170);
  doc.text("Level 2, 25-35 George Street, Parramatta, NSW 2150", 200, 185);
  doc.text("Telephone: (03) 99175018 | Email: info@alit.edu.au", 200, 200);

  doc.moveDown(4);
}

function addStudentDetails(doc, application) {
  const student = application.userId;
  
  doc
    .fontSize(16)
    .fillColor("#1f2937")
    .text("Student Information", 50, doc.y);
  
  doc.moveDown(0.5);

  // Create info box background
  const startY = doc.y;
  doc
    .rect(50, startY, 500, 120)
    .fill("#f8fafc");

  doc
    .fontSize(11)
    .fillColor("#374151");

  const leftColumn = 70;
  const rightColumn = 320;
  let currentY = startY + 20;

  // Left column
  doc.text("Name:", leftColumn, currentY, { continued: true });
  doc.fillColor("#6b7280").text(` ${student.firstName} ${student.lastName}`);
  
  currentY += 20;
  doc.fillColor("#374151").text("Email:", leftColumn, currentY, { continued: true });
  doc.fillColor("#6b7280").text(` ${student.email}`);

  currentY += 20;
  doc.fillColor("#374151").text("Phone:", leftColumn, currentY, { continued: true });
  doc.fillColor("#6b7280").text(` ${student.phoneCode} ${student.phoneNumber}`);

  // Right column
  currentY = startY + 20;
  doc.fillColor("#374151").text("Application Date:", rightColumn, currentY, { continued: true });
  doc.fillColor("#6b7280").text(` ${application.createdAt.toLocaleDateString()}`);

  currentY += 20;
  doc.fillColor("#374151").text("Status:", rightColumn, currentY, { continued: true });
  doc.fillColor("#6b7280").text(` ${application.overallStatus || 'Pending'}`);

  currentY += 20;
  doc.fillColor("#374151").text("Current Step:", rightColumn, currentY, { continued: true });
  doc.fillColor("#6b7280").text(` ${application.currentStep || 1}`);

  doc.y = startY + 130;
  doc.moveDown(1);
}

function addCertificationDetails(doc, application) {
  const certification = application.certificationId;
  
  doc
    .fontSize(16)
    .fillColor("#c41c34")
    .text("Certification Details", 50, doc.y);
  
  doc.moveDown(0.5);

  // Calculate required height based on description length
  const description = certification.description || 'No description available';
  const descriptionLines = Math.ceil(description.length / 70); // Approximate characters per line
  const dynamicHeight = Math.max(120, 80 + (descriptionLines * 12)); // Minimum 120px, grow with content

  // Create info box background
  const startY = doc.y;
  doc
    .rect(50, startY, 500, dynamicHeight)
    .fill("#f0f9ff");

  doc
    .fontSize(11)
    .fillColor("#374151");

  const leftMargin = 70;
  let currentY = startY + 20;

  doc.text("Certification:", leftMargin, currentY, { continued: true });
  doc.fillColor("#6b7280").text(` ${certification.name}`);
  
  currentY += 20;
  doc.fillColor("#374151").text("Price:", leftMargin, currentY, { continued: true });
  doc.fillColor("#6b7280").text(` $${certification.price} AUD`);

  currentY += 20;
  doc.fillColor("#374151").text("Description:", leftMargin, currentY);
  currentY += 15;
  
  // Measure the actual height of the description text
  const descriptionHeight = doc.heightOfString(description, {
    width: 460,
    align: 'left'
  });
  
  doc.fillColor("#6b7280").text(description, leftMargin, currentY, {
    width: 460,
    align: 'left'
  });

  // Set doc.y to after the description text plus padding
  doc.y = currentY + descriptionHeight + 15;
  doc.moveDown(1);
}

function addApplicationProgress(doc, application, options) {
  // Check if we need a new page
  if (doc.y > 650) {
    doc.addPage();
  }

  doc
    .fontSize(16)
    .fillColor("#c41c34")
    .text("Application Progress", 50, doc.y);
  
  doc.moveDown(0.5);

  // Calculate dynamic height based on content
  const baseHeight = 80;
  const assessorHeight = application.assignedAssessor ? 55 : 25;
  // Only student-visible submissions (user + third-party)
  const studentVisibleSubs = (application.formSubmissions || []).filter((s) =>
    s.filledBy === 'user' || s.filledBy === 'third-party'
  );
  const formSubmissionsHeight = Math.max(35, (studentVisibleSubs.length || 0) * 20 + 15);
  const totalContentHeight = assessorHeight + formSubmissionsHeight + 20; // 20px padding
  const boxHeight = Math.max(baseHeight, totalContentHeight);

  // Create info box background
  const startY = doc.y;
  doc
    .rect(50, startY, 500, boxHeight)
    .fill("#f0fdf4");

  doc
    .fontSize(11)
    .fillColor("#374151");

  const leftMargin = 70;
  let currentY = startY + 20;

  // Assessor information
  if (application.assignedAssessor) {
    doc.text("Assigned Assessor:", leftMargin, currentY, { continued: true });
    doc.fillColor("#6b7280").text(` ${application.assignedAssessor.firstName} ${application.assignedAssessor.lastName}`);
    currentY += 15;
    doc.fillColor("#374151").text("Assessor Email:", leftMargin, currentY, { continued: true });
    doc.fillColor("#6b7280").text(` ${application.assignedAssessor.email}`);
    currentY += 20;
  } else {
    doc.text("Assigned Assessor:", leftMargin, currentY, { continued: true });
    doc.fillColor("#ef4444").text(" Not Assigned");
    currentY += 25;
  }

  // Form submissions progress
  doc.fillColor("#374151").text("Form Submissions:", leftMargin, currentY);
  currentY += 15;

  if (studentVisibleSubs && studentVisibleSubs.length > 0) {
    studentVisibleSubs.forEach((submission) => {
      const statusColor = submission.status === 'submitted' ? '#16a34a' : '#6b7280';
      doc.fillColor("#6b7280").text(`• Step ${submission.stepNumber}: ${submission.title}`, leftMargin + 20, currentY);
      doc.fillColor(statusColor).text(` (${submission.status})`, doc.x, currentY);
      currentY += 20;
    });
  } else {
    doc.fillColor("#6b7280").text("No form submissions yet", leftMargin + 20, currentY);
    currentY += 20;
  }

  // Set doc.y to after the content with proper spacing
  doc.y = startY + boxHeight + 15;
  doc.moveDown(1);
}

function addPaymentInformation(doc, application) {
  // Check if we need a new page
  if (doc.y > 650) {
    doc.addPage();
  }

  doc
    .fontSize(16)
    .fillColor("#c41c34")
    .text("Payment Information", 50, doc.y);
  
  doc.moveDown(0.5);

  // Calculate dynamic height based on payment type
  const baseHeight = 100;
  const hasPaymentPlan = application.paymentId?.paymentType === 'payment_plan';
  const boxHeight = hasPaymentPlan ? 120 : baseHeight;

  // Create info box background
  const startY = doc.y;
  doc
    .rect(50, startY, 500, boxHeight)
    .fill("#fefce8");

  doc
    .fontSize(11)
    .fillColor("#374151");

  const leftMargin = 70;
  let currentY = startY + 20;

  if (application.paymentId) {
    const payment = application.paymentId;
    
    doc.text("Payment Type:", leftMargin, currentY, { continued: true });
    doc.fillColor("#6b7280").text(` ${payment.paymentType || 'One-time'}`);
    
    currentY += 20;
    doc.fillColor("#374151").text("Total Amount:", leftMargin, currentY, { continued: true });
    doc.fillColor("#6b7280").text(` $${payment.totalAmount} ${payment.currency}`);

    currentY += 20;
    doc.fillColor("#374151").text("Payment Status:", leftMargin, currentY, { continued: true });
    const statusColor = payment.status === 'completed' ? '#16a34a' : '#ef4444';
    doc.fillColor(statusColor).text(` ${payment.status || 'Pending'}`);

    if (payment.paymentType === 'payment_plan') {
      currentY += 20;
      doc.fillColor("#374151").text("Installments Completed:", leftMargin, currentY, { continued: true });
      doc.fillColor("#6b7280").text(` ${payment.paymentPlan.recurringPayments.completedPayments || 0}`);
    }
  } else {
    doc.text("Payment Status:", leftMargin, currentY, { continued: true });
    doc.fillColor("#ef4444").text(" No payment record");
  }

  doc.y = startY + boxHeight + 15;
  doc.moveDown(1);
}

function addFormSubmissions(doc, formSubmissions) {
  if (!formSubmissions || formSubmissions.length === 0) return;

  doc
    .fontSize(16)
    .fillColor("#c41c34")
    .text("Form Submissions Details", 50, doc.y);
  
  doc.moveDown(0.5);

  formSubmissions.forEach((submission, index) => {
    if (doc.y > 650) {
      doc.addPage();
    }

    // Create info box background
    const startY = doc.y;
    doc
      .rect(50, startY, 500, 80)
      .fill(index % 2 === 0 ? "#f8fafc" : "#ffffff");

    doc
      .fontSize(11)
      .fillColor("#374151");

    const leftMargin = 70;
    let currentY = startY + 15;

    doc.text("Form:", leftMargin, currentY, { continued: true });
    doc.fillColor("#6b7280").text(` ${submission.formTemplateId.name}`);
    
    currentY += 18;
    doc.fillColor("#374151").text("Submitted:", leftMargin, currentY, { continued: true });
    doc.fillColor("#6b7280").text(` ${submission.submittedAt.toLocaleDateString()}`);

    currentY += 18;
    doc.fillColor("#374151").text("Status:", leftMargin, currentY, { continued: true });
    const statusColor = submission.status === 'submitted' ? '#16a34a' : '#6b7280';
    doc.fillColor(statusColor).text(` ${submission.status}`);

    doc.y = startY + 85;
  });

  doc.moveDown(1);
}

function addDocumentsInformation(doc, documentUpload) {
  // Check if we need a new page
  if (doc.y > 700) {
    doc.addPage();
  }

  doc
    .fontSize(16)
    .fillColor("#c41c34")
    .text("Documents Information", 50, doc.y);
  
  doc.moveDown(0.5);

  // Create info box background
  const startY = doc.y;
  doc
    .rect(50, startY, 500, 70)
    .fill("#f0f9ff");

  doc
    .fontSize(11)
    .fillColor("#374151");

  const leftMargin = 70;
  let currentY = startY + 20;

  if (documentUpload && documentUpload.documents.length > 0) {
    doc.text("Documents Uploaded:", leftMargin, currentY, { continued: true });
    doc.fillColor("#6b7280").text(` ${documentUpload.documents.length} file(s)`);
    
    currentY += 20;
    doc.fillColor("#374151").text("Upload Status:", leftMargin, currentY, { continued: true });
    const statusColor = documentUpload.status === 'verified' ? '#16a34a' : '#6b7280';
    doc.fillColor(statusColor).text(` ${documentUpload.status || 'Pending'}`);
  } else {
    doc.text("Documents:", leftMargin, currentY, { continued: true });
    doc.fillColor("#ef4444").text(" No documents uploaded");
  }

  doc.y = startY + 80;
  doc.moveDown(1);
}

module.exports = studentExportController;
