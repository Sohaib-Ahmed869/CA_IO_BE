// controllers/pdfReportController.js
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const User = require('../models/user');
const Application = require('../models/application');
const Payment = require('../models/payment');
const Certification = require('../models/certification');
const Certificate = require('../models/certificate');
const FormSubmission = require('../models/formSubmission');
const DocumentUpload = require('../models/documentUpload');

// Helper function to download image from URL and return as buffer
const downloadImageFromURL = (url) => {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;
    
    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
        return;
      }
      
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', (error) => {
      reject(error);
    });
  });
};

// Helper function to find field in form structure
const findFieldInFormStructure = (formStructure, fieldName) => {
  if (!formStructure || typeof formStructure !== 'object') return null;
  
  // Recursively search through the form structure
  const searchInObject = (obj) => {
    if (!obj || typeof obj !== 'object') return null;
    
    // Check if this object has the field we're looking for
    if (obj.name === fieldName || obj.id === fieldName || obj.fieldName === fieldName || obj.questionId === fieldName) {
      return obj;
    }
    
    // Search in nested objects and arrays
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (Array.isArray(value)) {
          for (const item of value) {
            const result = searchInObject(item);
            if (result) return result;
          }
        } else if (typeof value === 'object') {
          const result = searchInObject(value);
          if (result) return result;
        }
      }
    }
    
    return null;
  };
  
  return searchInObject(formStructure);
};

const pdfReportController = {
  // Get student data as JSON response
  getStudentData: async (req, res) => {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }

      console.log(`📋 Getting student data for user: ${userId}`);

      // Get user data
      const user = await User.findById(userId).lean();
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Get all applications for this user
      const applications = await Application.find({ userId: userId })
        .populate('certificationId', 'name description price')
        .populate('certificateId')
        .lean();

      // Get all form submissions with full form template data
      let formSubmissions = await FormSubmission.find({ userId: userId })
        .populate('formTemplateId', 'name description formStructure')
        .lean();

      // Handle multiple form templates for the same qualification (old vs new versions)
      const oldFormId = '686de5a7259aaa972b4f881b';
      const newFormId = '68ac3ad0652cce1dbeacf8e0';
      
      // Check if user has submission to old form
      const hasOldFormSubmission = formSubmissions.some(sub => 
        sub.formTemplateId && sub.formTemplateId._id.toString() === oldFormId
      );
      
      // Filter form submissions based on logic
      if (hasOldFormSubmission) {
        // If user submitted to old form, only show old form submissions
        formSubmissions = formSubmissions.filter(sub => 
          !sub.formTemplateId || sub.formTemplateId._id.toString() !== newFormId
        );
      } else {
        // If no old form submission, only show new form submissions
        formSubmissions = formSubmissions.filter(sub => 
          !sub.formTemplateId || sub.formTemplateId._id.toString() !== oldFormId
        );
      }

      // Get all document uploads with proper structure
      const documentUploads = await DocumentUpload.find({ userId: userId }).lean();
      
      // Also get documents from applications (nested structure)
      const applicationDocuments = [];
      applications.forEach(app => {
        if (app.documentUploadId) {
          applicationDocuments.push(app.documentUploadId);
        }
      });
      
      // Get detailed document uploads
      const detailedDocumentUploads = await DocumentUpload.find({ 
        $or: [
          { userId: userId },
          { _id: { $in: applicationDocuments } }
        ]
      }).lean();

      // Get all payments
      const payments = await Payment.find({ userId: userId }).lean();

      // Get RTO information from environment variables
      const rtoInfo = {
        name: process.env.RTO_NAME || "Certified Australia",
        logo: process.env.LOGO_URL || "https://certifiedaustralia.com.au/logo.png",
        address: process.env.RTO_ADDRESS || "123 Education Street, Sydney NSW 2000",
        phone: process.env.RTO_PHONE || "+61 2 1234 5678",
        email: process.env.SUPPORT_EMAIL || "info@certifiedaustralia.com.au",
        rto_code: process.env.RTO_CODE || "12345",
        website: process.env.RTO_WEBSITE || "www.certifiedaustralia.com.au"
      };

      // Process documents to handle nested structure
      const allDocuments = [];
      detailedDocumentUploads.forEach(docUpload => {
        if (docUpload.documents && Array.isArray(docUpload.documents)) {
          docUpload.documents.forEach(doc => {
            allDocuments.push({
              ...doc,
              documentUrl: `https://${process.env.AWS_S3_BUCKET || 'certifiediobucket'}.s3.amazonaws.com/${doc.s3Key}`,
              fileSizeKB: doc.fileSize ? (doc.fileSize / 1024).toFixed(2) : 0
            });
          });
        } else {
          // Single document structure
          allDocuments.push({
            ...docUpload,
            documentUrl: `https://${process.env.AWS_S3_BUCKET || 'certifiediobucket'}.s3.amazonaws.com/${docUpload.s3Key}`,
            fileSizeKB: docUpload.fileSize ? (docUpload.fileSize / 1024).toFixed(2) : 0
          });
        }
      });

      // Process certificates
      const certificates = [];
      for (const application of applications) {
        if (application.certificateId) {
          const certificate = await Certificate.findById(application.certificateId).lean();
          if (certificate) {
            certificates.push({
              ...certificate,
              certificateUrl: certificate.s3Key ? `https://${process.env.AWS_S3_BUCKET || 'certifiediobucket'}.s3.amazonaws.com/${certificate.s3Key}` : null,
              applicationId: application._id,
              qualification: application.certificationId?.name
            });
          }
        }
      }

      const responseData = {
        success: true,
        message: "Student data retrieved successfully",
        data: {
          rtoInfo,
          user: {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phoneCode: user.phoneCode,
            phoneNumber: user.phoneNumber,
            phone: user.phoneCode && user.phoneNumber ? `${user.phoneCode} ${user.phoneNumber}` : 'Not provided',
            userType: user.userType,
            createdAt: user.createdAt,
            isActive: user.isActive
          },
          applications: applications.map(app => ({
            _id: app._id,
            qualification: app.certificationId?.name || 'Unknown',
            qualificationDescription: app.certificationId?.description || '',
            price: app.certificationId?.price || 0,
            status: app.overallStatus,
            currentStep: app.currentStep,
            createdAt: app.createdAt,
            completedAt: app.completedAt,
            assignedAssessor: app.assignedAssessor,
            certificateId: app.certificateId
          })),
          formSubmissions: formSubmissions.map(submission => {
            // Map responses with question text
            const responsesWithQuestions = [];
            
            if (submission.responses && submission.responses.length > 0) {
              submission.responses.forEach(response => {
                // Find the corresponding question in the form template
                const formStructure = submission.formTemplateId?.formStructure || {};
                const questionField = findFieldInFormStructure(formStructure, response.question);
                
                responsesWithQuestions.push({
                  questionId: response.question,
                  questionText: questionField?.question || questionField?.label || questionField?.title || questionField?.text || response.question,
                  questionType: questionField?.type || 'text',
                  answer: response.answer || response.value || response.text,
                  fieldName: response.question
                });
              });
            }
            
            // Also map formData with question text
            const formDataWithQuestions = {};
            if (submission.formData && typeof submission.formData === 'object') {
              const formStructure = submission.formTemplateId?.formStructure || {};
              Object.entries(submission.formData).forEach(([key, value]) => {
                const questionField = findFieldInFormStructure(formStructure, key);
                
                formDataWithQuestions[key] = {
                  value: value,
                  questionText: questionField?.question || questionField?.label || questionField?.title || questionField?.text || key,
                  questionType: questionField?.type || 'text'
                };
              });
            }
            
            return {
              _id: submission._id,
              formName: submission.formTemplateId?.name || 'Unknown Form',
              formDescription: submission.formTemplateId?.description || '',
              status: submission.status,
              submittedAt: submission.submittedAt,
              responses: responsesWithQuestions,
              formData: formDataWithQuestions,
              applicationId: submission.applicationId,
              stepNumber: 1, // Always show as step 1 since it's the enrolment form
              formTemplate: {
                _id: submission.formTemplateId?._id,
                name: submission.formTemplateId?.name,
                description: submission.formTemplateId?.description,
                formStructure: submission.formTemplateId?.formStructure || []
              }
            };
          }),
          documents: allDocuments.map(doc => ({
            _id: doc._id,
            originalName: doc.originalName,
            documentType: doc.documentType,
            category: doc.category,
            fileName: doc.fileName,
            fileSize: doc.fileSize,
            fileSizeKB: doc.fileSizeKB,
            mimeType: doc.mimeType,
            fileExtension: doc.fileExtension,
            isVerified: doc.isVerified,
            verificationStatus: doc.verificationStatus,
            uploadedAt: doc.uploadedAt,
            notes: doc.notes,
            documentUrl: doc.documentUrl,
            s3Key: doc.s3Key,
            s3Bucket: doc.s3Bucket
          })),
          payments: payments.map(payment => ({
            _id: payment._id,
            amount: payment.totalAmount,
            status: payment.status,
            type: payment.paymentType,
            currency: payment.currency,
            createdAt: payment.createdAt,
            completedAt: payment.completedAt,
            applicationId: payment.applicationId,
            stripePaymentIntentId: payment.stripePaymentIntentId,
            stripeSubscriptionId: payment.stripeSubscriptionId,
            paymentHistory: payment.paymentHistory || []
          })),
          certificates,
          summary: {
            totalApplications: applications.length,
            totalFormSubmissions: formSubmissions.length,
            totalDocuments: allDocuments.length,
            totalPayments: payments.length,
            certificatesIssued: certificates.length,
            completedApplications: applications.filter(app => app.overallStatus === 'completed').length,
            paidApplications: payments.filter(payment => payment.status === 'completed').length
          }
        }
      };

      console.log(`✅ Student data retrieved successfully for user: ${userId}`);
      res.json(responseData);

    } catch (error) {
      console.error('❌ Error retrieving student data:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving student data',
        error: error.message
      });
    }
  },

  // Generate comprehensive student audit report
  generateStudentReport: async (req, res) => {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }

      console.log(`📋 Generating PDF report for user: ${userId}`);

      // Get user data
      const user = await User.findById(userId).lean();
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Get all applications for this user
      const applications = await Application.find({ userId: userId })
        .populate('certificationId', 'name description price')
        .populate('certificateId')
        .lean();

      // Get all form submissions
      let formSubmissions = await FormSubmission.find({ userId: userId })
        .populate('formTemplateId', 'name description formStructure')
        .lean();

      // Handle multiple form templates for the same qualification (old vs new versions)
      const oldFormId = '686de5a7259aaa972b4f881b';
      const newFormId = '68ac3ad0652cce1dbeacf8e0';
      
      // Check if user has submission to old form
      const hasOldFormSubmission = formSubmissions.some(sub => 
        sub.formTemplateId && sub.formTemplateId._id.toString() === oldFormId
      );
      
      // Filter form submissions based on logic
      if (hasOldFormSubmission) {
        // If user submitted to old form, only show old form submissions
        formSubmissions = formSubmissions.filter(sub => 
          !sub.formTemplateId || sub.formTemplateId._id.toString() !== newFormId
        );
      } else {
        // If no old form submission, only show new form submissions
        formSubmissions = formSubmissions.filter(sub => 
          !sub.formTemplateId || sub.formTemplateId._id.toString() !== oldFormId
        );
      }

       // Get all document uploads with proper structure
       const documentUploads = await DocumentUpload.find({ userId: userId }).lean();
       
       // Also get documents from applications (nested structure)
       const applicationDocuments = [];
       applications.forEach(app => {
         if (app.documentUploadId) {
           applicationDocuments.push(app.documentUploadId);
         }
       });
       
       // Get detailed document uploads
       const detailedDocumentUploads = await DocumentUpload.find({ 
         $or: [
           { userId: userId },
           { _id: { $in: applicationDocuments } }
         ]
       }).lean();

      // Get all payments
      const payments = await Payment.find({ userId: userId }).lean();

       // Get RTO information from environment variables
       const rtoInfo = {
         name: process.env.RTO_NAME || "Certified Australia",
         logo: process.env.LOGO_URL || null, // Set to null if no URL provided
         address: process.env.RTO_ADDRESS || "123 Education Street, Sydney NSW 2000",
         phone: process.env.RTO_PHONE || "+61 2 1234 5678",
         email: process.env.SUPPORT_EMAIL || "info@certifiedaustralia.com.au",
         rto_code: process.env.RTO_CODE || "12345"
       };

      // Generate PDF
      const doc = new PDFDocument({
        size: 'A4',
        margins: {
          top: 50,
          bottom: 50,
          left: 50,
          right: 50
        }
      });

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="student-audit-report-${user.firstName}-${user.lastName}.pdf"`);

      // Pipe PDF to response
      doc.pipe(res);

       // Generate PDF content
       await generatePDFContent(doc, {
         user,
         applications,
         formSubmissions,
         documentUploads: detailedDocumentUploads,
         payments,
         rtoInfo
       });

      // Finalize PDF
      doc.end();

      console.log(`✅ PDF report generated successfully for user: ${userId}`);

    } catch (error) {
      console.error('❌ Error generating PDF report:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating PDF report',
        error: error.message
      });
    }
  }
};

// Generate PDF content function
const generatePDFContent = async (doc, data) => {
  const { user, applications, formSubmissions, documentUploads, payments, rtoInfo } = data;

   // Header with Logo
   let logoHeight = 0;
   if (rtoInfo.logo && rtoInfo.logo !== 'null' && rtoInfo.logo !== '' && rtoInfo.logo.startsWith('http')) {
     try {
       // Download logo from URL and add to PDF
       const logoBuffer = await downloadImageFromURL(rtoInfo.logo);
       doc.image(logoBuffer, 50, 30, { width: 150, height: 80 });
       logoHeight = 90;
       console.log('✅ Logo loaded successfully from URL:', rtoInfo.logo);
     } catch (error) {
       console.log('❌ Logo loading failed:', error.message);
       console.log('Logo URL was:', rtoInfo.logo);
       // Skip logo if URL fails
       logoHeight = 0;
     }
   } else {
     if (rtoInfo.logo) {
       console.log('⚠️ Logo URL is not a valid HTTP URL:', rtoInfo.logo);
     } else {
       console.log('⚠️ No logo URL provided in environment variables');
     }
   }
   
   const headerStartY = 30 + logoHeight;
   
   doc.fontSize(20)
      .font('Helvetica-Bold')
      .text('STUDENT AUDIT REPORT', 50, headerStartY, { align: 'center' });
   
   doc.fontSize(10)
      .font('Helvetica')
      .text(`Generated on: ${new Date().toLocaleDateString()}`, 50, headerStartY + 25, { align: 'center' });

  // RTO Information Table
  const rtoStartY = headerStartY + 55;
  
  // Calculate height needed for RTO info table
  const rtoInfoHeight = 120; // Increased height for table format
  
  // Create table with proper columns
  const tableData = [
    { label: 'RTO Name:', value: rtoInfo.name },
    { label: 'RTO Code:', value: rtoInfo.rto_code },
    { label: 'Address:', value: rtoInfo.address },
    { label: 'Website:', value: rtoInfo.website || 'N/A' },
    { label: 'Phone:', value: rtoInfo.phone },
    { label: 'Email:', value: rtoInfo.email }
  ];
  
  // Draw table border
  doc.rect(50, rtoStartY, 500, rtoInfoHeight)
     .stroke();
  
  // Draw vertical line to separate columns
  const columnWidth = 150; // Width for label column
  doc.moveTo(50 + columnWidth, rtoStartY)
     .lineTo(50 + columnWidth, rtoStartY + rtoInfoHeight)
     .stroke();
  
  // Add table content
  let currentRowY = rtoStartY + 15;
  const rowHeight = 18;
  
  tableData.forEach((row, index) => {
    // Add label (left column)
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .text(row.label, 60, currentRowY);
    
    // Add value (right column)
    doc.fontSize(10)
       .font('Helvetica')
       .text(row.value, 60 + columnWidth + 10, currentRowY, { width: 380 });
    
    currentRowY += rowHeight;
  });

  let currentY = rtoStartY + rtoInfoHeight + 20; // More space after RTO box

  // Student Information Section
  doc.fontSize(14)
     .font('Helvetica-Bold')
     .text('1. STUDENT INFORMATION', 50, currentY);
  
  currentY += 25;
  
  // Student info with proper spacing
  doc.fontSize(11)
     .font('Helvetica-Bold')
     .text(`Full Name: ${user.firstName} ${user.lastName}`, 50, currentY)
     .text(`Email: ${user.email}`, 300, currentY);
  
  currentY += 18;
  
  doc.fontSize(10)
     .font('Helvetica')
     .text(`Phone: ${user.phoneCode || ''} ${user.phoneNumber || 'Not provided'}`, 50, currentY)
     .text(`User ID: ${user._id}`, 300, currentY);
  
  currentY += 18;
  
  doc.text(`Registration Date: ${new Date(user.createdAt).toLocaleDateString()}`, 50, currentY)
     .text(`User Type: ${user.userType}`, 300, currentY);
  
  currentY += 30;

  // Document Uploads Section (moved to top)
  doc.fontSize(14)
     .font('Helvetica-Bold')
     .text('2. DOCUMENT UPLOADS', 50, currentY);
  
  currentY += 25;

  if (documentUploads.length === 0) {
    doc.fontSize(10)
       .font('Helvetica')
       .text('No documents uploaded.', 50, currentY);
    currentY += 20;
  } else {
     // Handle documents array structure
     const allDocuments = [];
     documentUploads.forEach(docUpload => {
       if (docUpload.documents && Array.isArray(docUpload.documents)) {
         docUpload.documents.forEach(doc => {
           allDocuments.push(doc);
         });
       } else {
         // Single document structure
         allDocuments.push(docUpload);
       }
     });

     allDocuments.forEach((document, index) => {
       // Calculate approximate height needed for this document entry
       const documentEntryHeight = 140; // Increased height for better spacing
       
       if (currentY + documentEntryHeight > 700) {
         doc.addPage();
         currentY = 50;
       }

       // Document header with better formatting
       doc.fontSize(12)
          .font('Helvetica-Bold')
          .text(`${index + 1}. ${document.originalName || 'Unknown Document'}`, 50, currentY);
       currentY += 20;
       
       // Document details in a cleaner format
       doc.fontSize(10)
          .font('Helvetica-Bold')
          .text(`Document Type:`, 60, currentY)
          .text(`Category:`, 60, currentY + 18)
          .text(`Verification Status:`, 60, currentY + 36)
          .text(`Upload Date:`, 60, currentY + 54);
       
       doc.fontSize(10)
          .font('Helvetica')
          .text(`${document.documentType || 'Unknown'}`, 180, currentY)
          .text(`${document.category || 'N/A'}`, 180, currentY + 18)
          .text(`${document.isVerified ? 'Verified' : 'Not Verified'} (${document.verificationStatus || 'Pending'})`, 180, currentY + 36)
          .text(`${document.uploadedAt ? new Date(document.uploadedAt).toLocaleDateString() : 'Unknown'}`, 180, currentY + 54);
       
       currentY += 72; // Space for the 4 lines above
       
       // File details on the right side
       if (document.fileSize) {
         doc.fontSize(9)
            .font('Helvetica')
            .text(`Size: ${(document.fileSize / 1024).toFixed(2)} KB`, 350, currentY - 72)
            .text(`Format: ${document.fileExtension || document.mimeType || 'Unknown'}`, 350, currentY - 54);
       }
       
       // Document URL (if available) - Make it clickable
       if (document.s3Key) {
         const documentUrl = `https://${process.env.AWS_S3_BUCKET || 'certifiediobucket'}.s3.amazonaws.com/${document.s3Key}`;
         doc.fontSize(9)
            .font('Helvetica')
            .fillColor('blue')
            .text(`${documentUrl}`, 60, currentY, { 
              width: 480,
              link: documentUrl
            })
            .fillColor('black');
         currentY += 25;
       }
       
       // Notes (if available)
       if (document.notes) {
         doc.fontSize(9)
            .font('Helvetica')
            .text(`Notes: ${document.notes}`, 60, currentY, { width: 480 });
         currentY += 25;
       }
       
       currentY += 20; // Space between documents
     });
  }

  // Payments Section (moved to top)
  doc.fontSize(14)
     .font('Helvetica-Bold')
     .text('3. PAYMENT DETAILS', 50, currentY);
  
  currentY += 25;

  if (payments.length === 0) {
    doc.fontSize(10)
       .font('Helvetica')
       .text('No payment records found.', 50, currentY);
    currentY += 20;
  } else {
    payments.forEach((payment, index) => {
      if (currentY > 700) {
        doc.addPage();
        currentY = 50;
      }

      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text(`Payment ${index + 1}`, 50, currentY);
      
      currentY += 20;
      
      doc.fontSize(10)
         .font('Helvetica')
         .text(`Payment ID: ${payment._id}`, 50, currentY)
         .text(`Amount: $${payment.totalAmount}`, 300, currentY);
      
      currentY += 15;
      
      doc.text(`Status: ${payment.status}`, 50, currentY)
         .text(`Type: ${payment.paymentType}`, 300, currentY);
      
      currentY += 15;
      
      doc.text(`Created: ${new Date(payment.createdAt).toLocaleDateString()}`, 50, currentY);
      
      if (payment.completedAt) {
        doc.text(`Completed: ${new Date(payment.completedAt).toLocaleDateString()}`, 300, currentY);
      }
      
      currentY += 20;
    });
  }

  // Applications Section
  doc.fontSize(14)
     .font('Helvetica-Bold')
     .text('4. APPLICATIONS', 50, currentY);
  
  currentY += 25;

  if (applications.length === 0) {
    doc.fontSize(10)
       .font('Helvetica')
       .text('No applications found.', 50, currentY);
    currentY += 20;
  } else {
    applications.forEach((application, index) => {
      // Check if we need a new page
      if (currentY > 700) {
        doc.addPage();
        currentY = 50;
      }

      // Application header
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text(`${index + 1}. Application ID: ${application._id}`, 50, currentY);
      
      currentY += 20;
      
      // Application details with better spacing and qualification name handling
      const qualificationName = application.certificationId?.name || 'Unknown';
      const status = application.overallStatus;
      
      // Handle long qualification names
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .text('Qualification:', 50, currentY);
      
      // Calculate height needed for qualification name
      const qualificationHeight = doc.heightOfString(qualificationName, { width: 200 });
      
      doc.fontSize(10)
         .font('Helvetica')
         .text(qualificationName, 130, currentY, { width: 200 })
         .text(`Status: ${status}`, 350, currentY);
      
      currentY += Math.max(qualificationHeight, 18);
      
      doc.text(`Created: ${new Date(application.createdAt).toLocaleDateString()}`, 50, currentY)
         .text(`Completed: ${application.completedAt ? new Date(application.completedAt).toLocaleDateString() : 'Not completed'}`, 300, currentY);
      
      currentY += 18;
      
      doc.text(`Current Step: ${application.currentStep}`, 50, currentY);
      
      // Add assessor info if available
      if (application.assignedAssessor) {
        currentY += 18;
        doc.text(`Assigned Assessor: ${application.assignedAssessor}`, 50, currentY);
      }
      
      currentY += 25; // More space between applications
    });
  }

  // Form Submissions Section
  doc.fontSize(14)
     .font('Helvetica-Bold')
     .text('5. FORM SUBMISSIONS', 50, currentY);
  
  currentY += 25;

  if (formSubmissions.length === 0) {
    doc.fontSize(10)
       .font('Helvetica')
       .text('No form submissions found.', 50, currentY);
    currentY += 20;
  } else {
    formSubmissions.forEach((submission, index) => {
      if (currentY > 700) {
        doc.addPage();
        currentY = 50;
      }

      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text(`${index + 1}. ${submission.formTemplateId?.name || 'Unknown Form'}`, 50, currentY);
      
      currentY += 20;
      
      doc.fontSize(10)
         .font('Helvetica')
         .text(`Submission ID: ${submission._id}`, 50, currentY)
         .text(`Status: ${submission.status}`, 300, currentY);
      
      currentY += 15;
      
      doc.text(`Submitted: ${new Date(submission.submittedAt).toLocaleDateString()}`, 50, currentY);
      
       // Add form responses - handle different response structures
       if (submission.responses && submission.responses.length > 0) {
         currentY += 25;
         doc.fontSize(11)
            .font('Helvetica-Bold')
            .text('Form Responses:', 50, currentY);
         
         currentY += 20;
         
         submission.responses.forEach(response => {
           if (currentY > 700) {
             doc.addPage();
             currentY = 50;
           }
           
           // Handle different response formats - get actual question text from form structure
           let questionText = response.questionText || response.question || response.fieldName || 'Unknown Question';
           
           // If we don't have questionText, try to get it from form structure
           if (questionText === response.question || questionText === response.fieldName) {
             const formStructure = submission.formTemplateId?.formStructure || {};
             if (formStructure && Object.keys(formStructure).length > 0) {
               const questionField = findFieldInFormStructure(formStructure, response.question || response.fieldName);
               if (questionField) {
                 questionText = questionField.question || questionField.label || questionField.title || questionField.text || questionText;
               }
             } else {
               // Form template missing or empty, create a more meaningful question text
               const fieldName = response.question || response.fieldName || 'Unknown';
               if (fieldName.match(/^u\d+q\d+$/)) {
                 const match = fieldName.match(/^u(\d+)q(\d+)$/);
                 if (match) {
                   questionText = `Unit ${match[1]}, Question ${match[2]}`;
                 }
               } else {
                 questionText = fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
               }
             }
           }
           
           let answerText = response.answer || response.value || response.text || 'No answer provided';
           
           // Format long answers
           if (typeof answerText === 'object') {
             answerText = JSON.stringify(answerText);
           }
           
           // Calculate height needed for this response
           const questionHeight = doc.heightOfString(`Q: ${questionText}`, { width: 480 });
           const answerHeight = doc.heightOfString(`A: ${answerText}`, { width: 460 });
           const totalResponseHeight = questionHeight + answerHeight + 30; // 30 for spacing
           
           // Check if we need a new page
           if (currentY + totalResponseHeight > 700) {
             doc.addPage();
             currentY = 50;
           }
           
           // Add question with better formatting
           doc.fontSize(10)
              .font('Helvetica-Bold')
              .text(`Q: ${questionText}`, 60, currentY, { width: 480 });
           currentY += questionHeight + 8;
           
           // Add answer with proper line breaks and better formatting
           doc.fontSize(9)
              .font('Helvetica')
              .text(`A: ${answerText}`, 70, currentY, { width: 460 });
           currentY += answerHeight + 25; // More space after each response
         });
       } else if (submission.formData && typeof submission.formData === 'object') {
         // Handle formData object structure
         currentY += 25;
         doc.fontSize(11)
            .font('Helvetica-Bold')
            .text('Form Data:', 50, currentY);
         
         currentY += 20;
         
         Object.entries(submission.formData).forEach(([key, value]) => {
           // Handle enhanced formData structure with questionText
           let questionText = key;
           let answerText = value;
           
           if (typeof value === 'object' && value.questionText) {
             questionText = value.questionText;
             answerText = value.value;
           } else {
             // Try to get question text from form structure
             const formStructure = submission.formTemplateId?.formStructure || {};
             if (formStructure && Object.keys(formStructure).length > 0) {
               const questionField = findFieldInFormStructure(formStructure, key);
               if (questionField) {
                 questionText = questionField.question || questionField.label || questionField.title || questionField.text || key;
               }
             } else {
               // Form template missing or empty, create a more meaningful question text
               if (key.match(/^u\d+q\d+$/)) {
                 const match = key.match(/^u(\d+)q(\d+)$/);
                 if (match) {
                   questionText = `Unit ${match[1]}, Question ${match[2]}`;
                 }
               } else {
                 questionText = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
               }
             }
           }
           
           if (typeof answerText === 'object') {
             answerText = JSON.stringify(answerText);
           }
           
           // Calculate height needed for this response
           const questionHeight = doc.heightOfString(`${questionText}:`, { width: 480 });
           const answerHeight = doc.heightOfString(`${answerText}`, { width: 460 });
           const totalResponseHeight = questionHeight + answerHeight + 30; // 30 for spacing
           
           // Check if we need a new page
           if (currentY + totalResponseHeight > 700) {
             doc.addPage();
             currentY = 50;
           }
           
           // Add question with better formatting
           doc.fontSize(10)
              .font('Helvetica-Bold')
              .text(`Q: ${questionText}`, 60, currentY, { width: 480 });
           currentY += questionHeight + 8;
           
           // Add answer with proper line breaks and better formatting
           doc.fontSize(9)
              .font('Helvetica')
              .text(`A: ${answerText}`, 70, currentY, { width: 460 });
           currentY += answerHeight + 25; // More space after each response
         });
       }
      
      currentY += 30; // More space between form submissions
    });
  }


  // Certificates Section
  doc.fontSize(14)
     .font('Helvetica-Bold')
     .text('6. CERTIFICATES', 50, currentY);
  
  currentY += 25;

  const certificatesIssued = applications.filter(app => app.certificateId).length;
  
  doc.fontSize(10)
     .font('Helvetica')
     .text(`Total Certificates Issued: ${certificatesIssued}`, 50, currentY);
  
  currentY += 20;

   applications.forEach(async (application, index) => {
     if (application.certificateId) {
       if (currentY > 700) {
         doc.addPage();
         currentY = 50;
       }

       // Get certificate details
       const certificate = await Certificate.findById(application.certificateId).lean();
       
       doc.fontSize(10)
          .font('Helvetica-Bold')
          .text(`Certificate ${index + 1}`, 50, currentY);
       
       currentY += 15;
       
       doc.fontSize(10)
          .font('Helvetica')
          .text(`Certificate ID: ${application.certificateId}`, 50, currentY)
          .text(`Certificate Number: ${certificate?.certificateNumber || 'N/A'}`, 300, currentY);
       
       currentY += 15;
       
       doc.text(`Issue Date: ${certificate?.uploadedAt ? new Date(certificate.uploadedAt).toLocaleDateString() : 'N/A'}`, 50, currentY)
          .text(`Grade: ${certificate?.grade || 'N/A'}`, 300, currentY);
       
       currentY += 15;
       
       if (certificate?.s3Key) {
         const certificateUrl = `https://${process.env.AWS_S3_BUCKET || 'certifiediobucket'}.s3.amazonaws.com/${certificate.s3Key}`;
         doc.fontSize(9)
            .fillColor('blue')
            .text(`Click to view certificate: ${certificateUrl}`, 50, currentY, { 
              width: 480,
              link: certificateUrl
            })
            .fillColor('black');
         currentY += 15;
       }
       
       if (certificate?.notes) {
         doc.text(`Notes: ${certificate.notes}`, 50, currentY, { width: 480 });
         currentY += 15;
       }
       
       currentY += 10;
     }
   });

  // Summary Section - Check if we need a new page
  if (currentY > 650) {
    doc.addPage();
    currentY = 50;
  }
  
  doc.fontSize(14)
     .font('Helvetica-Bold')
     .text('7. AUDIT SUMMARY', 50, currentY);
  
  currentY += 25;

  doc.fontSize(10)
     .font('Helvetica')
     .text(`Total Applications: ${applications.length}`, 50, currentY)
     .text(`Total Form Submissions: ${formSubmissions.length}`, 300, currentY);
  
  currentY += 15;
  
   // Calculate total documents from nested structure
   const totalDocuments = documentUploads.reduce((total, docUpload) => {
     if (docUpload.documents && Array.isArray(docUpload.documents)) {
       return total + docUpload.documents.length;
     }
     return total + 1;
   }, 0);
   
   doc.text(`Total Documents Uploaded: ${totalDocuments}`, 50, currentY)
     .text(`Total Payments: ${payments.length}`, 300, currentY);
  
  currentY += 15;
  
  doc.text(`Certificates Issued: ${certificatesIssued}`, 50, currentY);

  // Footer - ensure it's on the same page or add new page if needed
  if (currentY > 720) {
    doc.addPage();
    currentY = 50;
  }
  
  doc.fontSize(8)
     .font('Helvetica')
     .text(`Report generated on ${new Date().toLocaleString()}`, 50, currentY + 20, { align: 'center' });
};

module.exports = pdfReportController;
