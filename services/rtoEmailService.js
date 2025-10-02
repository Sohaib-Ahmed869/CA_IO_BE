// services/rtoEmailService.js
const nodemailer = require("nodemailer");
const { logMe } = require("../utils/logger");
const smtpVerifier = require("../utils/smtpVerifier");

class RTOEmailService {
  constructor(rtoConfig) {
    this.rtoConfig = rtoConfig;
    this.transporter = null;
    this.initializeTransporter();
  }

  /**
   * Initialize nodemailer transporter using RTO-specific SMTP configuration
   */
  async initializeTransporter() {
    try {
      if (!this.rtoConfig || !this.rtoConfig.emailConfig) {
        throw new Error("RTO email configuration not found");
      }

      const emailConfig = this.rtoConfig.emailConfig;
      
      // Create transporter using RTO's SMTP configuration
      this.transporter = smtpVerifier.createTransporter(emailConfig);
      
      logMe("rto.email.transporter_initialized", {
        rtoCode: this.rtoConfig.rtoCode,
        provider: emailConfig.provider,
        host: emailConfig.host,
        fromEmail: emailConfig.fromEmail
      });

    } catch (error) {
      logMe("rto.email.transporter_error", {
        rtoCode: this.rtoConfig?.rtoCode,
        error: error.message
      }, "error");
      throw error;
    }
  }

  /**
   * Get RTO-specific branding data
   */
  getRTOBranding() {
    // Always use Certified IO branding (same for all RTOs)
    const defaultBranding = {
      companyName: "Certified IO",
      logoUrl: "https://certified.io/images/certified-australia-logo.png",
      primaryColor: "#009934",
      secondaryColor: "#007a29",
      website: "https://certified.io"
    };

    if (!this.rtoConfig) {
      return defaultBranding;
    }

    // Only make logo and company name dynamic, keep everything else as Certified IO
    const branding = {
      companyName: this.rtoConfig.name || "Certified IO",
      logoUrl: this.rtoConfig.branding?.logoUrl || this.rtoConfig.logo?.url || "https://certified.io/images/certified-australia-logo.png",
      primaryColor: defaultBranding.primaryColor, // Keep Certified IO colors
      secondaryColor: defaultBranding.secondaryColor, // Keep Certified IO colors
      website: defaultBranding.website, // Keep Certified IO website
      ceoName: this.rtoConfig.ceoName || "CEO"
    };

    // Debug logging for branding
    logMe('rto.branding.debug', {
      rtoCode: this.rtoConfig.rtoCode,
      branding: branding,
      rtoConfigBranding: this.rtoConfig.branding,
      rtoConfigLogo: this.rtoConfig.logo,
      rtoConfigName: this.rtoConfig.name,
      finalLogoUrl: branding.logoUrl
    }, 'debug');

    return branding;
  }

  /**
   * Get RTO-specific email configuration
   */
  getEmailConfig() {
    if (!this.rtoConfig || !this.rtoConfig.emailConfig) {
      return {
        fromEmail: "noreply@certified.io",
        fromName: "Certified Australia"
      };
    }

    const emailConfig = this.rtoConfig.emailConfig;
    return {
      fromEmail: emailConfig.fromEmail || "noreply@certified.io",
      fromName: emailConfig.fromName || this.rtoConfig.name || "Certified Australia",
      replyTo: emailConfig.replyTo || emailConfig.fromEmail
    };
  }

  /**
   * Generate base email template with RTO-specific branding
   */
  getBaseTemplate(content, title) {
    const branding = this.getRTOBranding();
    const emailConfig = this.getEmailConfig();

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
        }
        .email-container {
            background-color: white;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #e3f2fd, #fff3e0);
            color: #333;
            padding: 40px 30px;
            text-align: center;
            border-radius: 12px 12px 0 0;
        }
        .logo {
            max-width: 150px;
            height: auto;
            margin-bottom: 20px;
            display: block;
            margin-left: auto;
            margin-right: auto;
        }
        .logo-fallback {
            display: inline-block;
            background-color: white;
            color: ${branding.primaryColor};
            padding: 10px 20px;
            border-radius: 5px;
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 15px;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 700;
            color: #333;
            margin-top: 10px;
        }
        .content {
            padding: 40px 30px;
        }
        .content h2 {
            color: #1976d2;
            margin-top: 0;
            font-size: 24px;
            font-weight: 600;
        }
        .footer {
            background: linear-gradient(135deg, #e3f2fd, #fff3e0);
            padding: 20px;
            text-align: center;
            border-top: 1px solid #e9ecef;
            font-size: 14px;
            color: #6c757d;
        }
        .footer a {
            color: #1976d2;
            text-decoration: none;
        }
        .button {
            display: inline-block;
            background: linear-gradient(135deg, #1976d2, #ff9800);
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 8px;
            margin: 20px 0;
            font-weight: 600;
            font-size: 16px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        .button:hover {
            background: linear-gradient(135deg, #1565c0, #f57c00);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <img src="${branding.logoUrl}" alt="Certified IO" class="logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';">
            <div class="logo-fallback" style="display: none;">Certified IO</div>
            <h1>${title}</h1>
        </div>
        <div class="content">
            ${content}
        </div>
        <div class="footer">
            <p>Certified IO</p>
            <p>This email was sent from an automated system. Please do not reply to this email.</p>
            <p>If you have any questions, contact us at ${this.rtoConfig?.contact?.email || emailConfig.fromEmail}</p>
            <p>© ${new Date().getFullYear()} Certified IO. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
    `;
  }

  /**
   * Send email using RTO-specific configuration
   */
  async sendEmail(to, subject, htmlContent, attachments = []) {
    try {
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      const emailConfig = this.getEmailConfig();
      
      logMe('rto.email.send_attempt', { 
        rtoCode: this.rtoConfig.rtoCode,
        to, 
        subject,
        fromEmail: emailConfig.fromEmail 
      });
      
      const mailOptions = {
        from: `"${emailConfig.fromName}" <${emailConfig.fromEmail}>`,
        to,
        subject,
        html: htmlContent,
        attachments: attachments,
        replyTo: emailConfig.replyTo
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logMe('rto.email.sent', { 
        rtoCode: this.rtoConfig.rtoCode,
        messageId: result.messageId,
        to 
      });
      
      return { success: true, messageId: result.messageId };
    } catch (error) {
      logMe('rto.email.send_error', { 
        rtoCode: this.rtoConfig?.rtoCode,
        to,
        error: error.message,
        code: error.code 
      }, 'error');
      throw error;
    }
  }

  /**
   * Send welcome email for new user registration
   */
  async sendWelcomeEmail(user, certification) {
    const branding = this.getRTOBranding();
    
    const content = `
      <h2>Welcome to ${branding.companyName}!</h2>
      <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 30px;">Dear ${user.firstName} ${user.lastName},</p>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">Welcome to ${branding.companyName}! We're excited to have you join our learning community.</p>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 30px;">You have successfully registered for the <strong>${certification.name}</strong> program.</p>
      
      <div style="border-left: 4px solid #1976d2; padding-left: 20px; margin: 30px 0;">
        <h3 style="color: #1976d2; margin-top: 0; font-size: 20px;">Here are your next steps:</h3>
        <p style="margin: 8px 0; font-size: 16px;">• Complete your enrollment form</p>
        <p style="margin: 8px 0; font-size: 16px;">• Upload required documents</p>
        <p style="margin: 8px 0; font-size: 16px;">• Make payment to secure your spot</p>
      </div>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">If you have any questions, please don't hesitate to contact us.</p>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333;">Best regards,<br>
      The ${branding.companyName} Team at Certified IO</p>
    `;

    return await this.sendEmail(
      user.email,
      `Welcome to ${branding.companyName} - ${certification.name}`,
      this.getBaseTemplate(content, `Welcome to ${branding.companyName}`)
    );
  }

  /**
   * Send payment confirmation email with RTO-specific invoice
   */
  async sendPaymentConfirmationEmail(user, payment, application) {
    try {
      const branding = this.getRTOBranding();
      const { logMe } = require("../utils/logger");
      
      logMe('rto.invoice.generate_start', { 
        paymentId: payment._id, 
        user: user.email,
        rtoCode: this.rtoConfig.rtoCode 
      });
      
      // Generate PDF invoice with RTO-specific data
      const InvoiceGenerator = require("../utils/invoiceGenerator");
      const invoiceGenerator = new InvoiceGenerator(this.rtoConfig);
      const pdfBuffer = await invoiceGenerator.generateInvoicePDF(payment, user, application);
      logMe('rto.invoice.pdf_generated', { size: pdfBuffer.length }, 'debug');
      
      // Generate HTML invoice for email with RTO-specific data
      const invoiceHTML = invoiceGenerator.generateInvoiceHTML(payment, user, application);
      logMe('rto.invoice.html_generated', { length: invoiceHTML.length }, 'debug');
      
      const content = `
        <h2>Payment Confirmed, ${user.firstName}!</h2>
        <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 30px;">
          Great news! Your payment has been successfully processed for <strong>${branding.companyName}</strong>. Your Qualification application is now active and you can proceed to the next steps.
        </p>
        
        <div style="border-left: 4px solid #1976d2; padding-left: 20px; margin: 30px 0;">
          <h3 style="color: #1976d2; margin-top: 0; font-size: 20px;">Payment Summary</h3>
          <p style="margin: 8px 0; font-size: 16px;"><strong>Amount Paid:</strong> $${payment.totalAmount}</p>
          <p style="margin: 8px 0; font-size: 16px;"><strong>Payment Method:</strong> ${payment.paymentType === 'payment_plan' ? 'Payment Plan' : 'One-time Payment'}</p>
          <p style="margin: 8px 0; font-size: 16px;"><strong>Transaction ID:</strong> ${payment._id}</p>
          <p style="margin: 8px 0; font-size: 16px;"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
        </div>
        
        <div style="margin: 30px 0;">
          <h3 style="color: #1976d2; font-size: 20px;">📄 Your Invoice:</h3>
          <p style="font-size: 16px; line-height: 1.6; color: #333;">Please find your detailed invoice below and attached as a PDF for your records.</p>
          ${invoiceHTML}
        </div>
        
        <div style="margin: 30px 0;">
          <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">You can now access your application dashboard to complete the required forms and upload your supporting documents. An assessor will be assigned to your application shortly.</p>
          <a href="${process.env.FRONTEND_URL}/student/dashboard" class="button">View Your Application</a>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
          <p style="font-size: 14px; color: #666; line-height: 1.5;">Keep this email and the attached invoice for your records. If you need to make changes or have questions about your application, please contact our support team.</p>
        </div>
      `;

      // Create attachments array with PDF invoice
      const attachments = [
        {
          filename: `Invoice-${payment._id}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ];

      return await this.sendEmail(
        user.email,
        `${branding.companyName} - Payment Confirmation & Invoice`,
        this.getBaseTemplate(content, "Payment Confirmation & Invoice"),
        attachments
      );
    } catch (error) {
      const { logMe } = require("../utils/logger");
      logMe('rto.email.payment_confirmation_error', {
        rtoCode: this.rtoConfig?.rtoCode,
        userEmail: user?.email,
        error: error.message
      }, 'error');
      throw error;
    }
  }

  /**
   * Send COE (Confirmation of Enrollment) email
   */
  async sendCOEEmail(user, application, payment, enrollmentFormData) {
    const branding = this.getRTOBranding();
    
    // Generate COE PDF buffer (same logic as default service)
    let coePdfBuffer;
    try {
      const { generateCOEPDF } = require("../utils/coeGenerator");
      coePdfBuffer = await generateCOEPDF(user, application, payment, enrollmentFormData, this.rtoConfig);
    } catch (error) {
      console.error("Error generating COE PDF:", error);
      // Continue without PDF attachment if generation fails
    }
    
    const content = `
      <div style="text-align: right; margin-bottom: 30px; color: #2d3748; font-size: 14px;">
        ${new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}<br>
        ${branding.companyName}<br>
        Contact: ${this.rtoConfig?.contact?.phone || '0451 781 759'}<br>
        Email: ${this.rtoConfig?.contact?.email || 'admin@certified.io'}<br>
        Website: ${this.rtoConfig?.contact?.website || 'www.certifiedaustralia.edu.au'}<br>
        Address: ${this.rtoConfig?.contact?.address || '500 Spencer St, West Melbourne, VIC, 3003'}
      </div>

      <h2>Confirmation of Enrollment (COE)</h2>
      <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 30px;">Dear ${user.firstName} ${user.lastName},</p>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">Congratulations! Your enrollment in <strong>${application.certificationId.name}</strong> has been confirmed for <strong>${branding.companyName}</strong>.</p>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 30px;">Please find your Confirmation of Enrollment document attached to this email.</p>
      
      <div style="border-left: 4px solid #1976d2; padding-left: 20px; margin: 30px 0;">
        <h3 style="color: #1976d2; margin-top: 0; font-size: 20px;">Confirmation of Enrollment (COE):</h3>
        <p style="margin: 8px 0; font-size: 16px;"><strong>${user.firstName} ${user.lastName}</strong> has been formally enrolled in</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>${application.certificationId.name}</strong></p>
        <p style="margin: 8px 0; font-size: 16px;">at <strong>${branding.companyName}</strong> - RTO Code ${this.rtoConfig?.rtoCode || '0000'}</p>
        <p style="margin: 8px 0; font-size: 16px;">on ${new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Payment Status:</strong> Paid In Full</p>
      </div>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">This is your official Confirmation of Enrollment (COE) notification.</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.FRONTEND_URL}/student/dashboard" class="button">Access Your Student Portal</a>
      </div>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333;">Best regards,<br>
      The ${branding.companyName} Team at Certified IO</p>
    `;

    const attachments = [
      {
        filename: `COE-${application.appCode}.pdf`,
        content: coePdfBuffer,
        contentType: 'application/pdf'
      }
    ];

    return await this.sendEmail(
      user.email,
      `Confirmation of Enrollment - ${application.certificationId.name}`,
      this.getBaseTemplate(content, "Confirmation of Enrollment"),
      attachments
    );
  }

  /**
   * Send notification email to assessors
   */
  async sendAssessorNotificationEmail(assessor, student, application, formName) {
    const branding = this.getRTOBranding();
    
    const content = `
      <h2>New Assessment Request</h2>
      <p>Dear ${assessor.firstName} ${assessor.lastName},</p>
      
      <p>You have been assigned a new assessment request.</p>
      
      <p><strong>Student Details:</strong></p>
      <ul>
        <li>Name: ${student.firstName} ${student.lastName}</li>
        <li>Email: ${student.email}</li>
        <li>Program: ${application.certificationId.name}</li>
        <li>Form: ${formName}</li>
      </ul>
      
      <p>Please log in to your assessor portal to review and complete the assessment.</p>
      
      <p>Best regards,<br>
      The ${branding.companyName} Team</p>
    `;

    return await this.sendEmail(
      assessor.email,
      `New Assessment Request - ${student.firstName} ${student.lastName}`,
      this.getBaseTemplate(content, "New Assessment Request")
    );
  }

  /**
   * Send form submission confirmation email
   */
  async sendFormSubmissionEmail(user, application, formName) {
    const { logMe } = require("../utils/logger");
    
    logMe('rto.email.form_submission_method_called', {
      rtoCode: this.rtoConfig?.rtoCode,
      rtoName: this.rtoConfig?.name,
      userEmail: user?.email,
      applicationCode: application?.appCode,
      formName: formName
    }, 'debug');

    const content = `
      <h2>Form Submission Confirmation</h2>
      <p>Dear ${user.firstName} ${user.lastName},</p>
      <p>Your form has been successfully submitted for review.</p>
      <div style="border-left: 4px solid #1976d2; padding-left: 20px; margin: 30px 0;">
        <h3 style="color: #1976d2; margin-top: 0; font-size: 20px;">Submission Details:</h3>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Application ID:</strong> ${application.appCode}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Form Name:</strong> ${formName}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Submitted:</strong> ${new Date().toLocaleDateString()}</p>
      </div>
      <p style="font-size: 16px; line-height: 1.6; color: #333;">Our team will review your submission and notify you of the status.</p>
      <p style="font-size: 16px; line-height: 1.6; color: #333;">Best regards,<br>
      The ${this.rtoConfig.name} Team at Certified IO</p>
    `;
    
    return await this.sendEmail(
      user.email,
      "Form Submission Confirmation",
      this.getBaseTemplate(content, "Form Submission Confirmation")
    );
  }

  /**
   * Send assessment completion email
   */
  async sendAssessmentCompletionEmail(user, application, assessor) {
    const content = `
      <h2>Assessment Completed</h2>
      <p>Dear ${user.firstName} ${user.lastName},</p>
      <p>Your assessment has been completed successfully.</p>
      <div style="border-left: 4px solid #4caf50; padding-left: 20px; margin: 30px 0;">
        <h3 style="color: #4caf50; margin-top: 0; font-size: 20px;">Assessment Details:</h3>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Application ID:</strong> ${application.appCode}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Assessor:</strong> ${assessor.firstName} ${assessor.lastName}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Status:</strong> Completed</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Completed:</strong> ${new Date().toLocaleDateString()}</p>
      </div>
      <p style="font-size: 16px; line-height: 1.6; color: #333;">Your application is now ready for the next stage.</p>
      <p style="font-size: 16px; line-height: 1.6; color: #333;">Best regards,<br>
      The ${this.rtoConfig.name} Team at Certified IO</p>
    `;
    
    return await this.sendEmail(
      user.email,
      "Assessment Completed",
      this.getBaseTemplate(content, "Assessment Completed")
    );
  }

  /**
   * Send certificate ready email
   */
  async sendCertificateReadyEmail(user, application, certificateUrl) {
    const content = `
      <h2>Certificate Ready - Congratulations!</h2>
      <p>Dear ${user.firstName} ${user.lastName},</p>
      <p>Congratulations! Your certificate is now ready for download.</p>
      <div style="border-left: 4px solid #4caf50; padding-left: 20px; margin: 30px 0;">
        <h3 style="color: #4caf50; margin-top: 0; font-size: 20px;">Certificate Details:</h3>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Application ID:</strong> ${application.appCode}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Certificate URL:</strong> <a href="${certificateUrl}">Download Certificate</a></p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Issued:</strong> ${new Date().toLocaleDateString()}</p>
      </div>
      <p style="font-size: 16px; line-height: 1.6; color: #333;">You can download your certificate using the link above.</p>
      <p style="font-size: 16px; line-height: 1.6; color: #333;">Best regards,<br>
      The ${this.rtoConfig.name} Team at Certified IO</p>
    `;
    
    return await this.sendEmail(
      user.email,
      "Certificate Ready - Congratulations!",
      this.getBaseTemplate(content, "Certificate Ready")
    );
  }

  /**
   * Send document submission email
   */
  async sendDocumentSubmissionEmail(user, application, documentType) {
    const content = `
      <h2>Documents Submitted for Review</h2>
      <p>Dear ${user.firstName} ${user.lastName},</p>
      <p>Your ${documentType.toLowerCase()} have been successfully submitted for review.</p>
      <div style="border-left: 4px solid #1976d2; padding-left: 20px; margin: 30px 0;">
        <h3 style="color: #1976d2; margin-top: 0; font-size: 20px;">Submission Details:</h3>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Application ID:</strong> ${application.appCode}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Document Type:</strong> ${documentType}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Submitted:</strong> ${new Date().toLocaleDateString()}</p>
      </div>
      <p style="font-size: 16px; line-height: 1.6; color: #333;">Our team will review your documents and notify you of the status.</p>
      <p style="font-size: 16px; line-height: 1.6; color: #333;">Best regards,<br>
      The ${this.rtoConfig.name} Team at Certified IO</p>
    `;
    
    return await this.sendEmail(
      user.email,
      "Documents Submitted for Review",
      this.getBaseTemplate(content, "Documents Submitted")
    );
  }

  /**
   * Send document verification email
   */
  async sendDocumentVerificationEmail(user, application, assessor, status, rejectionReason = null) {
    const isVerified = status === "verified";
    const content = `
      <h2>${isVerified ? 'Documents Verified - Application Progressing!' : 'Document Review Required - Action Needed'}</h2>
      <p>Dear ${user.firstName} ${user.lastName},</p>
      <p>${isVerified 
        ? `Great news! Your documents have been successfully verified by ${assessor.firstName} ${assessor.lastName}.`
        : 'Your documents require additional information or corrections before they can be approved.'
      }</p>
      <div style="border-left: 4px solid ${isVerified ? '#4caf50' : '#ff9800'}; padding-left: 20px; margin: 30px 0;">
        <h3 style="color: ${isVerified ? '#4caf50' : '#ff9800'}; margin-top: 0; font-size: 20px;">${isVerified ? 'Verification' : 'Review'} Details:</h3>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Application ID:</strong> ${application.appCode}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>${isVerified ? 'Verified by' : 'Reviewed by'}:</strong> ${assessor.firstName} ${assessor.lastName}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Status:</strong> ${isVerified ? 'Verified' : (status === 'rejected' ? 'Rejected' : 'Requires Update')}</p>
        ${rejectionReason ? `<p style="margin: 8px 0; font-size: 16px;"><strong>Reason:</strong> ${rejectionReason}</p>` : ''}
        <p style="margin: 8px 0; font-size: 16px;"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
      </div>
      <p style="font-size: 16px; line-height: 1.6; color: #333;">${isVerified 
        ? 'Your application is now progressing to the next stage.'
        : 'Please review the feedback above and resubmit your documents with the required changes.'
      }</p>
      <p style="font-size: 16px; line-height: 1.6; color: #333;">Best regards,<br>
      The ${this.rtoConfig.name} Team at Certified IO</p>
    `;
    
    return await this.sendEmail(
      user.email,
      isVerified ? "Documents Verified - Application Progressing!" : "Document Review Required - Action Needed",
      this.getBaseTemplate(content, isVerified ? "Documents Verified" : "Document Review Required")
    );
  }

  /**
   * Send form resubmission required email
   */
  async sendFormResubmissionRequiredEmail(user, application, formName, feedback) {
    const content = `
      <h2>Form Resubmission Required</h2>
      <p>Dear ${user.firstName} ${user.lastName},</p>
      <p>Your form submission requires some additional information or corrections.</p>
      <div style="border-left: 4px solid #ff9800; padding-left: 20px; margin: 30px 0;">
        <h3 style="color: #ff9800; margin-top: 0; font-size: 20px;">Feedback:</h3>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Application ID:</strong> ${application.appCode}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Form Name:</strong> ${formName}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Required Changes:</strong> ${feedback}</p>
      </div>
      <p style="font-size: 16px; line-height: 1.6; color: #333;">Please review the feedback above and resubmit your form with the required changes.</p>
      <p style="font-size: 16px; line-height: 1.6; color: #333;">Best regards,<br>
      The ${this.rtoConfig.name} Team at Certified IO</p>
    `;
    
    return await this.sendEmail(
      user.email,
      "Form Resubmission Required",
      this.getBaseTemplate(content, "Form Resubmission Required")
    );
  }

  /**
   * Send form approval email
   */
  async sendFormApprovalEmail(user, application, formName, assessor) {
    const content = `
      <h2>Form Approved</h2>
      <p>Dear ${user.firstName} ${user.lastName},</p>
      <p>Congratulations! Your form has been approved by our assessor.</p>
      <div style="border-left: 4px solid #4caf50; padding-left: 20px; margin: 30px 0;">
        <h3 style="color: #4caf50; margin-top: 0; font-size: 20px;">Approval Details:</h3>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Application ID:</strong> ${application.appCode}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Form Name:</strong> ${formName}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Approved by:</strong> ${assessor.firstName} ${assessor.lastName}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Approved:</strong> ${new Date().toLocaleDateString()}</p>
      </div>
      <p style="font-size: 16px; line-height: 1.6; color: #333;">Your application is now progressing to the next stage.</p>
      <p style="font-size: 16px; line-height: 1.6; color: #333;">Best regards,<br>
      The ${this.rtoConfig.name} Team at Certified IO</p>
    `;
    
    return await this.sendEmail(
      user.email,
      "Form Approved",
      this.getBaseTemplate(content, "Form Approved")
    );
  }

  /**
   * Send admin account creation email
   */
  async sendAdminCreatedAccountEmail(user, plainPassword) {
    const content = `
      <h2>Admin Account Created</h2>
      <p>Dear ${user.firstName} ${user.lastName},</p>
      <p>Your admin account has been created successfully.</p>
      <div style="border-left: 4px solid #1976d2; padding-left: 20px; margin: 30px 0;">
        <h3 style="color: #1976d2; margin-top: 0; font-size: 20px;">Account Details:</h3>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Email:</strong> ${user.email}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Temporary Password:</strong> ${plainPassword}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>User Type:</strong> ${user.userType}</p>
      </div>
      <p style="font-size: 16px; line-height: 1.6; color: #333;">Please log in and change your password immediately.</p>
      <p style="font-size: 16px; line-height: 1.6; color: #333;">Best regards,<br>
      The ${this.rtoConfig.name} Team at Certified IO</p>
    `;
    
    return await this.sendEmail(
      user.email,
      "Admin Account Created",
      this.getBaseTemplate(content, "Admin Account Created")
    );
  }

  /**
   * Send certificate download email
   */
  async sendCertificateDownloadEmail(user, application, certificateDetails) {
    const content = `
      <h2>Certificate Ready - Congratulations!</h2>
      <p>Dear ${user.firstName} ${user.lastName},</p>
      <p>Congratulations! Your certificate is now ready for download.</p>
      <div style="border-left: 4px solid #4caf50; padding-left: 20px; margin: 30px 0;">
        <h3 style="color: #4caf50; margin-top: 0; font-size: 20px;">Certificate Details:</h3>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Application ID:</strong> ${application.appCode}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Certificate Number:</strong> ${certificateDetails.certificateNumber || 'N/A'}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Issued:</strong> ${new Date().toLocaleDateString()}</p>
      </div>
      <p style="font-size: 16px; line-height: 1.6; color: #333;">You can download your certificate from your student portal.</p>
      <p style="font-size: 16px; line-height: 1.6; color: #333;">Best regards,<br>
      The ${this.rtoConfig.name} Team at Certified IO</p>
    `;
    
    return await this.sendEmail(
      user.email,
      "Certificate Ready - Congratulations!",
      this.getBaseTemplate(content, "Certificate Ready")
    );
  }
}

module.exports = RTOEmailService;
