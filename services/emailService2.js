// services/emailService2.js
const nodemailer = require("nodemailer");
const logme = require("../utils/logger");
const RTO = require("../models/rto");
const RTOAssets = require("../models/rtoAssets");

// Single email transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// Clean, reusable email template
const emailTemplate = ({ title, branding, content }) => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f4f4f4;
          }
          .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header {
      background: linear-gradient(135deg, ${branding.primaryColor} 0%, ${branding.secondaryColor} 100%);
            padding: 30px 20px;
            text-align: center;
            color: white;
          }
          .logo {
            max-height: 60px;
            max-width: 200px;
            margin-bottom: 15px;
            display: block;
            margin-left: auto;
            margin-right: auto;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }
          .company-name {
            font-size: 24px;
            font-weight: bold;
            margin: 0;
          }
          .content {
            padding: 30px 20px;
          }
          .greeting {
            font-size: 20px;
            font-weight: bold;
      color: ${branding.primaryColor};
            margin-bottom: 20px;
          }
          .message {
            margin-bottom: 20px;
            line-height: 1.8;
          }
          .info-box {
            background-color: #f8f9fa;
      border-left: 4px solid ${branding.primaryColor};
            padding: 20px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .info-box h3 {
            margin-top: 0;
      color: ${branding.primaryColor};
          }
          .button {
            display: inline-block;
      background-color: ${branding.primaryColor};
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
            margin: 20px 0;
          }
          .button:hover {
      background-color: ${branding.secondaryColor};
          }
          .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            border-top: 1px solid #e9ecef;
          }
          .footer-text {
            color: #6c757d;
            font-size: 14px;
            margin: 0;
          }
          @media only screen and (max-width: 600px) {
            .email-container {
              margin: 10px;
            }
            .header {
              padding: 20px 15px;
            }
            .content {
              padding: 20px 15px;
            }
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
      ${branding.logoUrl ? `<img src="${branding.logoUrl}" alt="${branding.companyName}" class="logo">` : ''}
      <h1 class="company-name">${branding.companyName}</h1>
          </div>
          
          <div class="content">
            ${content}
          </div>
          
          <div class="footer">
            <p class="footer-text">
        This email was sent by ${branding.companyName}<br>
              Powered by Certified.IO
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

class EmailService2 {
  // Get RTO branding information
  async getRTOBranding(rtoId) {
    try {
      if (!rtoId) {
        return this.getDefaultBranding();
      }

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('RTO branding timeout')), 5000);
      });

      const brandingPromise = (async () => {
        const rto = await RTO.findById(rtoId);
        if (!rto) {
          logme.warn("RTO not found, using default branding", { rtoId });
          return this.getDefaultBranding();
        }

        // Get RTO assets (logo, colors) - handle the correct logo field structure
        let logoUrl = null;
        let primaryColor = rto.primaryColor || '#007bff';
        let secondaryColor = rto.secondaryColor || '#6c757d';
        
        try {
          const rtoAssets = await RTOAssets.findOne({ rtoId });
          if (rtoAssets && rtoAssets.logo && rtoAssets.logo.url && rtoAssets.logo.isActive) {
            logoUrl = rtoAssets.logo.url;
            logme.info('Found active RTO logo', { rtoId, logoUrl });
          }
        } catch (assetsError) {
          logme.warn('Error fetching RTO assets, using RTO colors', { rtoId, error: assetsError.message });
        }
        
        const branding = {
          companyName: rto.companyName || 'Training Organization',
          ceoName: rto.ceoName || 'CEO',
          ceoCode: rto.ceoCode || 'CEO',
          rtoNumber: rto.rtoNumber || 'RTO',
          companyEmail: rto.email || 'support@training.org',
          companyPhone: rto.phone || 'Contact Support',
          companyAddress: rto.address ? this.formatAddress(rto.address) : 'Contact Support',
          logoUrl: logoUrl,
          primaryColor: primaryColor,
          secondaryColor: secondaryColor,
          subdomain: rto.subdomain || 'training',
        };

        logme.info('RTO branding retrieved successfully', { 
          rtoId, 
          companyName: branding.companyName,
          hasLogo: !!logoUrl,
          logoUrl: logoUrl
        });

        return branding;
      })();

      // Race between timeout and branding retrieval
      return await Promise.race([brandingPromise, timeoutPromise]);
    } catch (error) {
      logme.error("Error getting RTO branding:", error);
      return this.getDefaultBranding();
    }
  }

  // Default branding fallback
  getDefaultBranding() {
    return {
      companyName: 'Certified Training Organization',
      ceoName: 'CEO',
      ceoCode: 'CEO',
      rtoNumber: 'RTO',
      companyEmail: 'support@certified.io',
      companyPhone: 'Contact Support',
      companyAddress: 'Contact Support',
      logoUrl: null,
      primaryColor: '#007bff',
      secondaryColor: '#6c757d',
      subdomain: 'certified',
    };
  }

  // Format address for email templates
  formatAddress(address) {
    if (!address) return '';
    
    const parts = [
      address.street,
      address.city,
      address.state,
      address.postalCode,
      address.country
    ].filter(part => part && part.trim());
    
    return parts.join(', ');
  }

  // Replace RTO variables in content
  replaceRTOVariables(content, branding) {
    if (!branding) {
      branding = this.getDefaultBranding();
    }

    let processed = content;

    // Replace company information
    processed = processed.replace(/{companyName}/g, branding.companyName);
    processed = processed.replace(/{ceoName}/g, branding.ceoName);
    processed = processed.replace(/{ceoCode}/g, branding.ceoCode);
    processed = processed.replace(/{rtoNumber}/g, branding.rtoNumber);
    processed = processed.replace(/{companyEmail}/g, branding.companyEmail);
    processed = processed.replace(/{companyPhone}/g, branding.companyPhone);
    processed = processed.replace(/{companyAddress}/g, branding.companyAddress);

    // Replace URL placeholders
    const rtoUrl = process.env.NODE_ENV === 'production' 
      ? `https://${branding.subdomain}.certified.io`
      : `http://localhost:3000`;

    processed = processed.replace(/{rtoUrl}/g, rtoUrl);
    processed = processed.replace(/{rtoUrl}/g, rtoUrl); // Handle both cases

    return processed;
  }

  // Create branded email with template
  createBrandedEmail(content, branding, title = "Email") {
    return emailTemplate({ title, branding, content });
  }

  // Main send email method
  async sendEmail(to, subject, content, rtoId = null) {
    try {
      // Get RTO branding
      const branding = await this.getRTOBranding(rtoId);
      
      // Replace variables in content and subject
      const processedContent = this.replaceRTOVariables(content, branding);
      const processedSubject = this.replaceRTOVariables(subject, branding);
      
      // Create branded email
      const brandedEmail = this.createBrandedEmail(processedContent, branding, processedSubject);
      
      // Send email
      const mailOptions = {
        from: process.env.GMAIL_USER,
        to,
        subject: processedSubject,
        html: brandedEmail,
      };

      const result = await transporter.sendMail(mailOptions);
      
      logme.info("Email sent successfully", {
        to,
        rtoId,
        subject: processedSubject,
        messageId: result.messageId
      });
      
      return {
        success: true,
        messageId: result.messageId,
        rtoId: rtoId || null,
      };
    } catch (error) {
      logme.error("Send email error:", error);
      throw error;
    }
  }

  // Welcome email
  async sendWelcomeEmail(user, certification, rtoId = null) {
    const content = `
      <div class="greeting">Welcome to {companyName}, ${user.firstName}!</div>
      <div class="message">
        Thank you for choosing {companyName} for your certification journey. We're excited to have you on board!
      </div>
      
      <div class="info-box">
        <h3>Your Certification Details</h3>
        <p><strong>Certification:</strong> ${certification.name}</p>
        <p><strong>Student ID:</strong> ${user._id}</p>
        <p><strong>Registration Date:</strong> ${new Date().toLocaleDateString()}</p>
      </div>

      <div class="message">
        Your application is now being processed. You'll receive updates on your progress throughout your certification journey.
      </div>

      <a href="{rtoUrl}/dashboard" class="button">Access Your Dashboard</a>

      <div class="message">
        If you have any questions, please don't hesitate to contact us at {companyEmail} or call {companyPhone}.
      </div>
    `;

    return this.sendEmail(user.email, "Welcome to {companyName} - Your Certification Journey Begins!", content, rtoId);
  }

  // Payment confirmation email
  async sendPaymentConfirmationEmail(user, application, payment, rtoId = null) {
    const content = `
      <div class="greeting">Payment Confirmation, ${user.firstName}!</div>
      <div class="message">
        Thank you for your payment. Your transaction has been processed successfully by {companyName}.
      </div>
      
      <div class="info-box">
        <h3>Payment Details</h3>
        <p><strong>Amount:</strong> $${payment.totalAmount}</p>
        <p><strong>Payment ID:</strong> ${payment._id}</p>
        <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Status:</strong> Completed</p>
      </div>

      <div class="message">
        Your application is now being processed. You'll receive updates on your progress.
      </div>

      <a href="{rtoUrl}/dashboard" class="button">View Your Application</a>

      <div class="message">
        If you have any questions, please contact us at {companyEmail}.
      </div>
    `;

    return this.sendEmail(user.email, "Payment Confirmation - {companyName}", content, rtoId);
  }

  // Assessor assigned email
  async sendAssessorAssignedEmail(user, application, assessor, rtoId = null) {
    const content = `
      <div class="greeting">Assessor Assigned, ${user.firstName}!</div>
      <div class="message">
        Great news! {companyName} has assigned an assessor to your application.
      </div>
      
      <div class="info-box">
        <h3>Assessor Details</h3>
        <p><strong>Name:</strong> ${assessor.firstName} ${assessor.lastName}</p>
        <p><strong>Email:</strong> ${assessor.email}</p>
        <p><strong>Assignment Date:</strong> ${new Date().toLocaleDateString()}</p>
      </div>

      <div class="message">
        Your assessor will review your application and provide feedback. You'll be notified of any updates.
      </div>

      <a href="{rtoUrl}/dashboard" class="button">Check Your Progress</a>

      <div class="message">
        For any questions, please contact us at {companyEmail}.
      </div>
    `;

    return this.sendEmail(user.email, "Assessor Assigned - {companyName}", content, rtoId);
  }

  // Assessment completion email
  async sendAssessmentCompletionEmail(user, application, assessor, rtoId = null) {
    const content = `
      <div class="greeting">Assessment Complete, ${user.firstName}!</div>
      <div class="message">
        Your assessment has been completed by {companyName}. Here are the details:
      </div>
      
      <div class="info-box">
        <h3>Assessment Details</h3>
        <p><strong>Assessor:</strong> ${assessor.firstName} ${assessor.lastName}</p>
        <p><strong>Completion Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Status:</strong> Assessment Complete</p>
      </div>

      <div class="message">
        Your application is now being processed for the next stage. You'll receive updates on your progress.
      </div>

      <a href="{rtoUrl}/dashboard" class="button">View Your Progress</a>

      <div class="message">
        If you have any questions, please contact us at {companyEmail}.
      </div>
    `;

    return this.sendEmail(user.email, "Assessment Complete - {companyName}", content, rtoId);
  }

  // Certificate ready email
  async sendCertificateReadyEmail(user, application, certificateUrl, rtoId = null) {
    const content = `
      <div class="greeting">Certificate Ready, ${user.firstName}!</div>
      <div class="message">
        Congratulations! Your certificate is ready for download from {companyName}.
      </div>
      
      <div class="info-box">
        <h3>Certificate Details</h3>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Issue Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Status:</strong> Certificate Issued</p>
      </div>

      <div class="message">
        You can now download your certificate from your dashboard.
      </div>

      <a href="{rtoUrl}/dashboard" class="button">Download Certificate</a>

      <div class="message">
        If you have any issues, please contact us at {companyEmail}.
      </div>
    `;

    return this.sendEmail(user.email, "Certificate Ready - {companyName}", content, rtoId);
  }

  // New application notification to admin
  async sendNewApplicationNotificationToAdmin(adminEmail, user, application, rtoId = null) {
    const content = `
      <div class="greeting">New Application Received</div>
      <div class="message">
        A new application has been submitted to {companyName}.
      </div>
      
      <div class="info-box">
        <h3>Application Details</h3>
        <p><strong>Student:</strong> ${user.firstName} ${user.lastName}</p>
        <p><strong>Email:</strong> ${user.email}</p>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Submission Date:</strong> ${new Date().toLocaleDateString()}</p>
      </div>

      <div class="message">
        Please review and process this application as soon as possible.
      </div>

      <a href="{rtoUrl}/admin/applications/${application._id}" class="button">Review Application</a>
    `;

    return this.sendEmail(adminEmail, "New Application - {companyName}", content, rtoId);
  }

  // Payment received notification to admin
  async sendPaymentReceivedNotificationToAdmin(adminEmail, user, payment, rtoId = null) {
    const content = `
      <div class="greeting">Payment Received</div>
      <div class="message">
        A new payment has been received by {companyName}.
      </div>
      
      <div class="info-box">
        <h3>Payment Details</h3>
        <p><strong>Student:</strong> ${user.firstName} ${user.lastName}</p>
        <p><strong>Amount:</strong> $${payment.totalAmount}</p>
        <p><strong>Payment ID:</strong> ${payment._id}</p>
        <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
      </div>

      <div class="message">
        Please process this payment and update the application status.
      </div>

      <a href="{rtoUrl}/admin/payments/${payment._id}" class="button">View Payment</a>
    `;

    return this.sendEmail(adminEmail, "Payment Received - {companyName}", content, rtoId);
  }

  // Assessment ready notification to assessor
  async sendAssessmentReadyNotificationToAssessor(assessor, application, user, rtoId = null) {
    const content = `
      <div class="greeting">Assessment Ready, ${assessor.firstName}!</div>
      <div class="message">
        A new application is ready for assessment at {companyName}.
      </div>
      
      <div class="info-box">
        <h3>Application Details</h3>
        <p><strong>Student:</strong> ${user.firstName} ${user.lastName}</p>
        <p><strong>Email:</strong> ${user.email}</p>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Submission Date:</strong> ${new Date().toLocaleDateString()}</p>
      </div>

      <div class="message">
        Please review and assess this application as soon as possible.
      </div>

      <a href="{rtoUrl}/assessor/applications/${application._id}" class="button">Review Application</a>
    `;

    return this.sendEmail(assessor.email, "Assessment Ready - {companyName}", content, rtoId);
  }

  // Form submission email
  async sendFormSubmissionEmail(user, application, formName, rtoId = null) {
    const content = `
      <div class="greeting">Form Submitted, ${user.firstName}!</div>
      <div class="message">
        Your form "${formName}" has been successfully submitted to {companyName}.
      </div>
      
      <div class="info-box">
        <h3>Submission Details</h3>
        <p><strong>Form Name:</strong> ${formName}</p>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Submission Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Status:</strong> Submitted for Review</p>
      </div>

      <div class="message">
        Your form is now being reviewed by our team. You'll receive updates on your progress.
      </div>

      <a href="{rtoUrl}/dashboard" class="button">View Your Progress</a>

      <div class="message">
        If you have any questions, please contact us at {companyEmail}.
      </div>
    `;

    return this.sendEmail(user.email, "Form Submitted - {companyName}", content, rtoId);
  }

  // Form resubmission required email
  async sendFormResubmissionRequiredEmail(user, application, formName, feedback, rtoId = null) {
    const content = `
      <div class="greeting">Resubmission Required, ${user.firstName}!</div>
      <div class="message">
        Your form "${formName}" requires resubmission at {companyName}.
      </div>
      
      <div class="info-box">
        <h3>Resubmission Details</h3>
        <p><strong>Form Name:</strong> ${formName}</p>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Feedback:</strong> ${feedback}</p>
        <p><strong>Action Required:</strong> Please resubmit with corrections</p>
      </div>

      <div class="message">
        Please review the feedback and resubmit your form with the necessary corrections.
      </div>

      <a href="{rtoUrl}/dashboard" class="button">Resubmit Form</a>

      <div class="message">
        If you have any questions, please contact us at {companyEmail}.
      </div>
    `;

    return this.sendEmail(user.email, "Resubmission Required - {companyName}", content, rtoId);
  }

  // Application rejection email
  async sendApplicationRejectionEmail(user, application, rejectionReason, assessor, rtoId = null) {
    const content = `
      <div class="greeting">Application Update, ${user.firstName}!</div>
      <div class="message">
        We regret to inform you that your application to {companyName} has been rejected.
      </div>
      
      <div class="info-box">
        <h3>Rejection Details</h3>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Assessor:</strong> ${assessor.firstName} ${assessor.lastName}</p>
        <p><strong>Rejection Reason:</strong> ${rejectionReason}</p>
        <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
      </div>

      <div class="message">
        We encourage you to review the feedback and consider reapplying in the future.
      </div>

      <div class="message">
        If you have any questions, please contact us at {companyEmail}.
      </div>
    `;

    return this.sendEmail(user.email, "Application Update - {companyName}", content, rtoId);
  }

  // Application resubmission email
  async sendApplicationResubmissionEmail(user, application, resubmissionReason, assessor, rtoId = null) {
    const content = `
      <div class="greeting">Resubmission Required, ${user.firstName}!</div>
    <div class="message">
        Your application to {companyName} requires resubmission.
    </div>
    
    <div class="info-box">
        <h3>Resubmission Details</h3>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Assessor:</strong> ${assessor.firstName} ${assessor.lastName}</p>
        <p><strong>Reason:</strong> ${resubmissionReason}</p>
        <p><strong>Action Required:</strong> Please provide additional information</p>
    </div>

    <div class="message">
        Please review the requirements and resubmit your application with the necessary information.
    </div>

      <a href="{rtoUrl}/dashboard" class="button">Resubmit Application</a>

    <div class="message">
        If you have any questions, please contact us at {companyEmail}.
    </div>
  `;

    return this.sendEmail(user.email, "Resubmission Required - {companyName}", content, rtoId);
  }

  // Document submission email
  async sendDocumentSubmissionEmail(user, application, documentType, rtoId = null) {
    const content = `
      <div class="greeting">Document Submitted, ${user.firstName}!</div>
    <div class="message">
        Your ${documentType} document has been successfully submitted to {companyName}.
    </div>
    
    <div class="info-box">
        <h3>Submission Details</h3>
        <p><strong>Document Type:</strong> ${documentType}</p>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Submission Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Status:</strong> Submitted for Review</p>
    </div>

    <div class="message">
        Your document is now being reviewed by our team. You'll receive updates on your progress.
    </div>

      <a href="{rtoUrl}/dashboard" class="button">View Your Progress</a>

    <div class="message">
        If you have any questions, please contact us at {companyEmail}.
    </div>
  `;

    return this.sendEmail(user.email, "Document Submitted - {companyName}", content, rtoId);
  }

  // Document verification email
  async sendDocumentVerificationEmail(user, application, assessor, verificationStatus, rejectionReason = null, rtoId = null) {
    const content = `
      <div class="greeting">Document Verification Update, ${user.firstName}!</div>
    <div class="message">
        Your document verification status has been updated at {companyName}.
    </div>
    
    <div class="info-box">
        <h3>Verification Details</h3>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Assessor:</strong> ${assessor.firstName} ${assessor.lastName}</p>
        <p><strong>Status:</strong> ${verificationStatus}</p>
        <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
        ${rejectionReason ? `<p><strong>Rejection Reason:</strong> ${rejectionReason}</p>` : ''}
    </div>

    <div class="message">
        ${verificationStatus === 'approved' 
          ? 'Your document has been approved and your application is progressing.' 
          : 'Please review the feedback and resubmit if necessary.'}
    </div>

      <a href="{rtoUrl}/dashboard" class="button">View Your Progress</a>

    <div class="message">
        If you have any questions, please contact us at {companyEmail}.
    </div>
  `;

    return this.sendEmail(user.email, "Document Verification Update - {companyName}", content, rtoId);
  }

  // Form approval email
  async sendFormApprovalEmail(user, application, formName, assessor, rtoId = null) {
    const content = `
      <div class="greeting">Form Approved, ${user.firstName}!</div>
    <div class="message">
        Congratulations! Your form "${formName}" has been approved by {companyName}.
    </div>
    
    <div class="info-box">
        <h3>Approval Details</h3>
        <p><strong>Form Name:</strong> ${formName}</p>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Assessor:</strong> ${assessor.firstName} ${assessor.lastName}</p>
        <p><strong>Approval Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Status:</strong> Approved</p>
    </div>

    <div class="message">
        Your form has been approved and your application is progressing to the next stage.
    </div>

      <a href="{rtoUrl}/dashboard" class="button">View Your Progress</a>

    <div class="message">
        If you have any questions, please contact us at {companyEmail}.
    </div>
  `;

    return this.sendEmail(user.email, "Form Approved - {companyName}", content, rtoId);
  }

  // Enrollment confirmation email
  async sendEnrollmentConfirmationEmail(user, application, certificationName, rtoId = null) {
    const content = `
      <div class="greeting">Enrollment Confirmed, ${user.firstName}!</div>
    <div class="message">
        Welcome to {companyName}! Your enrollment has been confirmed.
    </div>
    
    <div class="info-box">
        <h3>Enrollment Details</h3>
        <p><strong>Certification:</strong> ${certificationName}</p>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Enrollment Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Status:</strong> Enrolled</p>
    </div>

    <div class="message">
        You are now officially enrolled in your certification program. We're excited to support you on your journey!
    </div>

      <a href="{rtoUrl}/dashboard" class="button">Access Your Dashboard</a>

    <div class="message">
        If you have any questions, please contact us at {companyEmail}.
    </div>
  `;

    return this.sendEmail(user.email, "Enrollment Confirmed - {companyName}", content, rtoId);
  }

  // Installment payment email
  async sendInstallmentPaymentEmail(user, application, payment, installmentAmount, rtoId = null) {
    const content = `
      <div class="greeting">Installment Payment Due, ${user.firstName}!</div>
    <div class="message">
        This is a reminder from {companyName} that your installment payment is due.
    </div>
    
      <div class="info-box">
        <h3>Payment Details</h3>
        <p><strong>Amount Due:</strong> $${installmentAmount}</p>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Due Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Payment ID:</strong> ${payment._id}</p>
    </div>

    <div class="message">
        Please make your payment to continue with your certification program.
    </div>

      <a href="{rtoUrl}/dashboard" class="button">Make Payment</a>

    <div class="message">
        If you have any questions, please contact us at {companyEmail}.
    </div>
  `;

    return this.sendEmail(user.email, "Installment Payment Due - {companyName}", content, rtoId);
  }

  // Third party employer email
  async sendThirdPartyEmployerEmail(employerEmail, employerName, student, formTemplate, formUrl, rtoId = null) {
    const content = `
      <div class="greeting">Form Request from {companyName}</div>
    <div class="message">
        Hello ${employerName},<br><br>
        ${student.firstName} ${student.lastName} has requested your assistance in completing a form for their certification at {companyName}.
    </div>
    
    <div class="info-box">
        <h3>Form Details</h3>
        <p><strong>Form Name:</strong> ${formTemplate.name}</p>
        <p><strong>Student:</strong> ${student.firstName} ${student.lastName}</p>
        <p><strong>Student Email:</strong> ${student.email}</p>
        <p><strong>Request Date:</strong> ${new Date().toLocaleDateString()}</p>
    </div>

    <div class="message">
        Please click the button below to access and complete the form.
    </div>

      <a href="${formUrl}" class="button">Complete Form</a>

    <div class="message">
        If you have any questions, please contact us at {companyEmail}.
    </div>
  `;

    return this.sendEmail(employerEmail, "Form Request - {companyName}", content, rtoId);
  }

  // Third party reference email
  async sendThirdPartyReferenceEmail(referenceEmail, referenceName, student, formTemplate, formUrl, rtoId = null) {
    const content = `
      <div class="greeting">Reference Request from {companyName}</div>
      <div class="message">
        Hello ${referenceName},<br><br>
        ${student.firstName} ${student.lastName} has requested your reference for their certification at {companyName}.
      </div>
      
      <div class="info-box">
        <h3>Reference Details</h3>
        <p><strong>Form Name:</strong> ${formTemplate.name}</p>
        <p><strong>Student:</strong> ${student.firstName} ${student.lastName}</p>
        <p><strong>Student Email:</strong> ${student.email}</p>
        <p><strong>Request Date:</strong> ${new Date().toLocaleDateString()}</p>
      </div>

      <div class="message">
        Please click the button below to provide your reference.
      </div>

      <a href="${formUrl}" class="button">Provide Reference</a>

      <div class="message">
        If you have any questions, please contact us at {companyEmail}.
      </div>
    `;

    return this.sendEmail(referenceEmail, "Reference Request - {companyName}", content, rtoId);
  }

  // Third party combined email
  async sendThirdPartyCombinedEmail(email, employerName, referenceName, student, formTemplate, formUrl, rtoId = null) {
    const content = `
      <div class="greeting">Form Request from {companyName}</div>
      <div class="message">
        Hello,<br><br>
        ${student.firstName} ${student.lastName} has requested your assistance in completing forms for their certification at {companyName}.
      </div>
      
      <div class="info-box">
        <h3>Request Details</h3>
        <p><strong>Form Name:</strong> ${formTemplate.name}</p>
        <p><strong>Student:</strong> ${student.firstName} ${student.lastName}</p>
        <p><strong>Student Email:</strong> ${student.email}</p>
        <p><strong>Request Date:</strong> ${new Date().toLocaleDateString()}</p>
        ${employerName ? `<p><strong>Employer:</strong> ${employerName}</p>` : ''}
        ${referenceName ? `<p><strong>Reference:</strong> ${referenceName}</p>` : ''}
      </div>

      <div class="message">
        Please click the button below to access and complete the required forms.
      </div>

      <a href="${formUrl}" class="button">Complete Forms</a>

      <div class="message">
        If you have any questions, please contact us at {companyEmail}.
      </div>
    `;

    return this.sendEmail(email, "Form Request - {companyName}", content, rtoId);
  }

  // Certificate download email
  async sendCertificateDownloadEmail(user, application, certificateDetails, rtoId = null) {
    const content = `
      <div class="greeting">Certificate Download, ${user.firstName}!</div>
    <div class="message">
        Your certificate is ready for download from {companyName}.
    </div>
    
      <div class="info-box">
        <h3>Certificate Details</h3>
        <p><strong>Certificate Number:</strong> ${certificateDetails.certificateNumber}</p>
        <p><strong>Issue Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Expiry Date:</strong> ${new Date(certificateDetails.expiryDate).toLocaleDateString()}</p>
        <p><strong>Grade:</strong> ${certificateDetails.grade}</p>
    </div>

    <div class="message">
        You can download your certificate from your dashboard.
    </div>

      <a href="{rtoUrl}/dashboard" class="button">Download Certificate</a>

    <div class="message">
        If you have any issues, please contact us at {companyEmail}.
    </div>
  `;

    return this.sendEmail(user.email, "Certificate Download - {companyName}", content, rtoId);
  }

  // Certificate verification email
  async sendCertificateVerificationEmail(verifierEmail, certificateDetails, student, rtoId = null) {
    const content = `
      <div class="greeting">Certificate Verification Request</div>
    <div class="message">
        Hello,<br><br>
        A certificate verification request has been submitted to {companyName}.
    </div>

      <div class="info-box">
        <h3>Certificate Details</h3>
        <p><strong>Certificate Number:</strong> ${certificateDetails.certificateNumber}</p>
        <p><strong>Student:</strong> ${student.firstName} ${student.lastName}</p>
        <p><strong>Issue Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Status:</strong> Valid</p>
    </div>

    <div class="message">
        This certificate has been verified and is valid.
    </div>

    <div class="message">
        If you have any questions, please contact us at {companyEmail}.
    </div>
  `;

    return this.sendEmail(verifierEmail, "Certificate Verification - {companyName}", content, rtoId);
  }

  // Certificate expiry reminder email
  async sendCertificateExpiryReminderEmail(user, certificateDetails, daysUntilExpiry, rtoId = null) {
    const content = `
      <div class="greeting">Certificate Expiry Reminder, ${user.firstName}!</div>
    <div class="message">
        This is a reminder from {companyName} that your certificate will expire soon.
    </div>
    
    <div class="info-box">
        <h3>Certificate Details</h3>
        <p><strong>Certificate Number:</strong> ${certificateDetails.certificateNumber}</p>
        <p><strong>Days Until Expiry:</strong> ${daysUntilExpiry}</p>
        <p><strong>Expiry Date:</strong> ${new Date(certificateDetails.expiryDate).toLocaleDateString()}</p>
    </div>

    <div class="message">
        Please renew your certification to maintain your credentials.
    </div>

      <a href="{rtoUrl}/dashboard" class="button">Renew Certification</a>

    <div class="message">
        If you have any questions, please contact us at {companyEmail}.
    </div>
  `;

    return this.sendEmail(user.email, "Certificate Expiry Reminder - {companyName}", content, rtoId);
  }
}

module.exports = new EmailService2();
