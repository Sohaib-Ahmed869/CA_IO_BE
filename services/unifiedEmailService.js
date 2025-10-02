// services/unifiedEmailService.js
require("dotenv").config();
const nodemailer = require("nodemailer");
const InvoiceGenerator = require("../utils/invoiceGenerator");
const { logMe } = require("../utils/logger");

class UnifiedEmailService {
  constructor(rtoConfig = null) {
    this.rtoConfig = rtoConfig;
    this.transporter = null;
    this.invoiceGenerator = null;
    
    this.initializeConfig();
    this.initializeTransporter();
  }

  /**
   * Initialize configuration - RTO-specific if available, otherwise defaults
   */
  initializeConfig() {
    if (this.rtoConfig) {
      // Use RTO-specific configuration
      this.logoUrl = this.rtoConfig.branding?.logoUrl || this.rtoConfig.logo?.url || "https://certified.io/images/certified-australia-logo.png";
      this.companyName = this.rtoConfig.name || "Certified IO";
      this.rtoCode = this.rtoConfig.rtoCode || "CERT";
      this.ceoName = this.rtoConfig.ceoName || "CEO";
      this.supportEmail = this.rtoConfig.contact?.email || "support@certified.io";
      
      // Company contact details from RTO config
      this.companyPhone = this.rtoConfig.contact?.phone || "(03) 99175018";
      this.companyEmail = this.rtoConfig.contact?.email || "info@certified.io";
      this.companyWebsite = this.rtoConfig.contact?.website || "https://certified.io";
      this.companyAddress = this.rtoConfig.contact?.address || "500 Spencer St, West Melbourne, VIC, 3003";
      this.abn = this.rtoConfig.legal?.abn || "61 610 991 145";
      this.cricos = this.rtoConfig.legal?.cricos || "03981M";
      
      // Always use Certified IO branding for consistency
      this.primaryColor = "#009934";
      this.secondaryColor = "#007a29";
      this.headerGradient = "linear-gradient(135deg, #e3f2fd, #fff3e0)"; // Certified IO gradient
      this.headerTextColor = "#5a6475";
      this.baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      this.fromEmail = this.rtoConfig.emailConfig?.fromEmail || "noreply@certified.io";
      
      // Initialize RTO-specific invoice generator
      this.invoiceGenerator = new InvoiceGenerator(this.rtoConfig);
      
      logMe('unified.email.rto_config_loaded', {
        rtoCode: this.rtoConfig.rtoCode,
        companyName: this.companyName,
        logoUrl: this.logoUrl,
        fromEmail: this.fromEmail
      }, 'debug');
    } else {
      // Use default configuration
      this.logoUrl = process.env.LOGO_URL || "https://certified.io/images/certified-australia-logo.png";
      this.primaryColor = process.env.PRIMARY_COLOR || "#009934";
      this.secondaryColor = process.env.SECONDARY_COLOR || "#007a29";
      this.headerGradient = process.env.EMAIL_HEADER_GRADIENT || "linear-gradient(135deg, #e3f2fd, #fff3e0)";
      this.headerTextColor = process.env.EMAIL_HEADER_TEXT || "#5a6475";
      this.baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      this.companyName = process.env.RTO_NAME || "Certified Australia";
      this.rtoCode = process.env.RTO_CODE || "45818";
      this.ceoName = process.env.CEO_NAME || "Wardi Roel Shamoon Botani";
      this.supportEmail = process.env.SUPPORT_EMAIL || "admin@edwardbusinesscollege.edu.au";
      this.fromEmail = process.env.GMAIL_USER || "admin@edwardbusinesscollege.edu.au";
      
      this.companyPhone = process.env.COMPANY_PHONE || "(03) 99175018";
      this.companyEmail = process.env.COMPANY_EMAIL || "info@certifiedaustralia.edu.au";
      this.companyWebsite = process.env.COMPANY_WEBSITE || "www.certifiedaustralia.edu.au";
      this.companyAddress = process.env.COMPANY_ADDRESS || "500 Spencer St, West Melbourne, VIC, 3003";
      this.abn = process.env.ABN || "61 610 991 145";
      this.cricos = process.env.CRICOS || "03981M";
      
      // Initialize default invoice generator
      this.invoiceGenerator = new InvoiceGenerator();
      
      logMe('unified.email.default_config_loaded', {
        companyName: this.companyName,
        logoUrl: this.logoUrl,
        fromEmail: this.fromEmail
      }, 'debug');
    }
  }

  /**
   * Initialize nodemailer transporter
   */
  initializeTransporter() {
    if (this.rtoConfig && this.rtoConfig.emailConfig) {
      // Use RTO-specific SMTP configuration
      const emailConfig = this.rtoConfig.emailConfig;
      const smtpVerifier = require("../utils/smtpVerifier");
      this.transporter = smtpVerifier.createTransporter(emailConfig);
      
      logMe('unified.email.rto_transporter_initialized', {
        rtoCode: this.rtoConfig.rtoCode,
        provider: emailConfig.provider,
        host: emailConfig.host,
        fromEmail: emailConfig.fromEmail
      }, 'debug');
    } else {
      // Use default SMTP configuration
      const provider = (process.env.EMAIL_PROVIDER || '').toLowerCase();
      const smtpHost = provider === 'gmail' ? 'smtp.gmail.com' : process.env.SMTP_HOST || "smtp.zoho.com";
      const smtpPort = Number(process.env.SMTP_PORT || (provider === 'gmail' ? 465 : 587));
      const smtpSecureEnv = process.env.SMTP_SECURE;
      const smtpSecure = typeof smtpSecureEnv === "string"
        ? smtpSecureEnv.toLowerCase() === "true"
        : smtpPort === 465;
      const smtpUser =
        (provider === 'gmail' ? (process.env.GMAIL_USER || process.env.SMTP_USER) : process.env.SMTP_USER) ||
        process.env.ZOHO_USER || "admin@edwardbusinesscollege.edu.au";
      const smtpPass =
        (provider === 'gmail' ? (process.env.GMAIL_APP_PASSWORD || process.env.GOOGLE_APP_PASSWORD || process.env.SMTP_PASS) : process.env.SMTP_PASS) ||
        process.env.SMTP_PASSWORD || process.env.ZOHO_APP_PASSWORD || "";
      const smtpAuthMethod = process.env.SMTP_AUTH_METHOD;

      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPass,
          method: smtpAuthMethod,
        },
        requireTLS: !smtpSecure,
        tls: {
          ciphers: "SSLv3",
        },
      });
      
      logMe('unified.email.default_transporter_initialized', {
        host: smtpHost,
        port: smtpPort,
        fromEmail: smtpUser
      }, 'debug');
    }
  }

  // Base email template with Certified IO gradient
  getBaseTemplate(content, title) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
            body {
                margin: 0;
                padding: 0;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                line-height: 1.6;
                color: #3b3f5c;
                background-color: #f8fafc;
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                margin-top: 20px;
                margin-bottom: 20px;
            }
            .header {
                background: ${this.headerGradient};
                padding: 24px 32px;
                text-align: center;
                border-radius: 12px 12px 0 0;
            }
            .header img {
                max-height: 60px;
                width: auto;
                margin-bottom: 16px;
                border-radius: 8px;
            }
            .header h1 {
                color: ${this.headerTextColor};
                margin: 0;
                font-size: 24px;
                font-weight: 600;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
            }
            .content {
                padding: 32px;
                background-color: #ffffff;
            }
            .content h2 {
                color: ${this.primaryColor};
                margin-top: 0;
                margin-bottom: 20px;
                font-size: 20px;
                font-weight: 600;
            }
            .content p {
                margin-bottom: 16px;
                font-size: 16px;
                line-height: 1.6;
                color: #333;
            }
            .button {
                display: inline-block;
                background: linear-gradient(135deg, ${this.primaryColor}, ${this.secondaryColor});
                color: white;
                padding: 14px 28px;
                text-decoration: none;
                border-radius: 8px;
                font-weight: 600;
                font-size: 16px;
                margin: 20px 0;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                transition: all 0.3s ease;
            }
            .button:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
            }
            .footer {
                background: ${this.headerGradient};
                padding: 24px 32px;
                text-align: center;
                border-radius: 0 0 12px 12px;
            }
            .footer p {
                margin: 0;
                color: ${this.headerTextColor};
                font-size: 14px;
                line-height: 1.5;
            }
            .footer a {
                color: ${this.headerTextColor};
                text-decoration: none;
                font-weight: 600;
            }
            .footer a:hover {
                text-decoration: underline;
            }
            .divider {
                height: 2px;
                background: linear-gradient(90deg, transparent, ${this.primaryColor}, transparent);
                margin: 24px 0;
                border: none;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="${this.logoUrl}" alt="${this.companyName} Logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                <div style="display: none; font-size: 24px; font-weight: bold; color: ${this.headerTextColor};">Certified IO</div>
                <h1>Certified IO</h1>
            </div>
            <div class="content">
                ${content}
            </div>
            <hr class="divider">
            <div class="footer">
                <p>
                    <strong>${this.companyName}</strong><br>
                    ${this.companyAddress}<br>
                    Phone: ${this.companyPhone} | Email: ${this.companyEmail}<br>
                    Website: <a href="${this.companyWebsite}">${this.companyWebsite}</a><br>
                    ABN: ${this.abn} | CRICOS: ${this.cricos}
                </p>
                <p style="margin-top: 16px; font-size: 12px;">
                    This email was sent by <a href="https://certified.io">Certified IO</a> - Your trusted education partner.
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  // Send email using the configured transporter
  async sendEmail(to, subject, html) {
    try {
      const mailOptions = {
        from: this.fromEmail,
        to,
        subject,
        html,
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logMe('unified.email.sent', {
        to,
        subject,
        rtoCode: this.rtoConfig?.rtoCode || 'default',
        companyName: this.companyName
      }, 'debug');

      return result;
    } catch (error) {
      logMe('unified.email.error', {
        to,
        subject,
        error: error.message,
        rtoCode: this.rtoConfig?.rtoCode || 'default'
      }, 'error');
      throw error;
    }
  }

  // 1. Welcome email
  async sendWelcomeEmail(user, certification) {
    const content = `
      <h2>Welcome to ${this.companyName}!</h2>
      <p>Dear ${user.firstName} ${user.lastName},</p>
      
      <p>Welcome to <strong>${this.companyName}</strong>! We're excited to have you join our learning community.</p>
      
      <div style="border-left: 4px solid ${this.primaryColor}; padding-left: 20px; margin: 30px 0;">
        <h3 style="color: ${this.primaryColor}; margin-top: 0; font-size: 20px;">Your Program Details:</h3>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Program:</strong> ${certification.name}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>RTO Code:</strong> ${this.rtoCode}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Start Date:</strong> ${new Date().toLocaleDateString()}</p>
      </div>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">Your application has been successfully created. You can now access your student portal to track your progress and complete your requirements.</p>
      
      <a href="${this.baseUrl}/student/dashboard" class="button">Access Your Student Portal</a>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333;">If you have any questions, please don't hesitate to contact our support team.</p>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333;">Best regards,<br>
      The <strong>${this.companyName}</strong> Team at Certified IO</p>
    `;

    return await this.sendEmail(
      user.email,
      `Welcome to ${this.companyName}!`,
      this.getBaseTemplate(content, "Welcome")
    );
  }

  // 2. Payment confirmation email with invoice
  async sendPaymentConfirmationEmail(user, application, payment) {
    try {
      logMe('unified.invoice.generate_start', { paymentId: payment._id, user: user.email });
      
      // Generate invoice PDF and HTML using RTO-specific data
      const invoicePdfBuffer = await this.invoiceGenerator.generateInvoicePDF(payment, user, application);
      const invoiceHtml = await this.invoiceGenerator.generateInvoiceHTML(payment, user, application);
      
      const content = `
        <h2>Payment Confirmation</h2>
        <p>Dear ${user.firstName} ${user.lastName},</p>
        
        <p>Great news! Your payment has been successfully processed for <strong>${this.companyName}</strong>.</p>
        
        <div style="border-left: 4px solid ${this.primaryColor}; padding-left: 20px; margin: 30px 0;">
          <h3 style="color: ${this.primaryColor}; margin-top: 0; font-size: 20px;">Payment Details:</h3>
          <p style="margin: 8px 0; font-size: 16px;"><strong>Application ID:</strong> ${application.appCode}</p>
          <p style="margin: 8px 0; font-size: 16px;"><strong>Amount Paid:</strong> $${payment.amount.toFixed(2)}</p>
          <p style="margin: 8px 0; font-size: 16px;"><strong>Payment Date:</strong> ${new Date().toLocaleDateString()}</p>
          <p style="margin: 8px 0; font-size: 16px;"><strong>Status:</strong> ${payment.status}</p>
        </div>
        
        <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">Your payment has been processed successfully. Please find your invoice attached to this email.</p>
        
        <a href="${this.baseUrl}/student/dashboard" class="button">View Payment Details</a>
        
        <p style="font-size: 16px; line-height: 1.6; color: #333;">Thank you for choosing <strong>${this.companyName}</strong> for your education journey.</p>
        
        <p style="font-size: 16px; line-height: 1.6; color: #333;">Best regards,<br>
        The <strong>${this.companyName}</strong> Team at Certified IO</p>
      `;

      const htmlContent = this.getBaseTemplate(content, "Payment Confirmation");
      
      // Send email with PDF attachment
      const mailOptions = {
        from: this.fromEmail,
        to: user.email,
        subject: "Payment Confirmation - Thank You!",
        html: htmlContent,
        attachments: [
          {
            filename: `invoice-${application.appCode}.pdf`,
            content: invoicePdfBuffer,
            contentType: 'application/pdf'
          }
        ]
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logMe('unified.invoice.email_sent', {
        paymentId: payment._id,
        user: user.email,
        applicationCode: application.appCode,
        rtoCode: this.rtoConfig?.rtoCode || 'default'
      });

      return result;
    } catch (error) {
      logMe('unified.invoice.error', {
        paymentId: payment._id,
        error: error.message,
        rtoCode: this.rtoConfig?.rtoCode || 'default'
      }, 'error');
      throw error;
    }
  }

  // 3. COE email
  async sendCOEEmail(user, application, payment, enrollmentFormData) {
    try {
      logMe('unified.coe.generate_start', { 
        applicationId: application._id, 
        user: user.email,
        rtoCode: this.rtoConfig?.rtoCode || 'default'
      });
      
      const content = `
        <h2>Confirmation of Enrollment (COE)</h2>
        <p>Dear ${user.firstName} ${user.lastName},</p>
        
        <p>Congratulations! Your enrollment has been confirmed for <strong>${this.companyName}</strong>.</p>
        
        <div style="border-left: 4px solid ${this.primaryColor}; padding-left: 20px; margin: 30px 0;">
          <h3 style="color: ${this.primaryColor}; margin-top: 0; font-size: 20px;">Enrollment Details:</h3>
          <p style="margin: 8px 0; font-size: 16px;"><strong>Application ID:</strong> ${application.appCode}</p>
          <p style="margin: 8px 0; font-size: 16px;"><strong>Program:</strong> ${application.certificationId.name}</p>
          <p style="margin: 8px 0; font-size: 16px;"><strong>RTO Code:</strong> ${this.rtoCode}</p>
          <p style="margin: 8px 0; font-size: 16px;"><strong>Enrollment Date:</strong> ${new Date().toLocaleDateString()}</p>
        </div>
        
        <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">Your Confirmation of Enrollment (COE) document has been generated and is attached to this email. Please keep this document safe as it confirms your enrollment in our program.</p>
        
        <a href="${this.baseUrl}/student/dashboard" class="button">Access Your Student Portal</a>
        
        <p style="font-size: 16px; line-height: 1.6; color: #333;">We're excited to have you as part of our learning community. If you have any questions, please don't hesitate to contact us.</p>
        
        <p style="font-size: 16px; line-height: 1.6; color: #333;">Best regards,<br>
        The <strong>${this.companyName}</strong> Team at Certified IO</p>
      `;

      return await this.sendEmail(
        user.email,
        "Confirmation of Enrollment (COE) - Welcome!",
        this.getBaseTemplate(content, "Confirmation of Enrollment")
      );
    } catch (error) {
      logMe('unified.coe.error', {
        applicationId: application._id,
        error: error.message,
        rtoCode: this.rtoConfig?.rtoCode || 'default'
      }, 'error');
      throw error;
    }
  }

  // 4. Form submission confirmation
  async sendFormSubmissionEmail(user, application, formName) {
    const content = `
      <h2>Form Submission Confirmation</h2>
      <p>Dear ${user.firstName} ${user.lastName},</p>
      
      <p>Your form <strong>"${formName}"</strong> has been successfully submitted for <strong>${application.certificationId.name}</strong>.</p>
      
      <div style="border-left: 4px solid ${this.primaryColor}; padding-left: 20px; margin: 30px 0;">
        <h3 style="color: ${this.primaryColor}; margin-top: 0; font-size: 20px;">Submission Details:</h3>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Form:</strong> ${formName}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Application ID:</strong> ${application.appCode}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Submitted:</strong> ${new Date().toLocaleDateString()}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Status:</strong> Under Review</p>
      </div>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">Your submission is now being reviewed. You will be notified once the review is complete.</p>
      
      <a href="${this.baseUrl}/student/dashboard" class="button">Check Application Status</a>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333;">Best regards,<br>
      The <strong>${this.companyName}</strong> Team at Certified IO</p>
    `;

    return await this.sendEmail(
      user.email,
      "Form Submission Confirmation",
      this.getBaseTemplate(content, "Form Submission Confirmation")
    );
  }

  // 5. Form resubmission required
  async sendFormResubmissionRequiredEmail(user, application, formName, feedback) {
    const content = `
      <h2>Form Resubmission Required</h2>
      <p>Dear ${user.firstName} ${user.lastName},</p>
      
      <p>Your form <strong>"${formName}"</strong> requires resubmission for <strong>${application.certificationId.name}</strong>.</p>
      
      <div style="border-left: 4px solid #ff9800; padding-left: 20px; margin: 30px 0;">
        <h3 style="color: #ff9800; margin-top: 0; font-size: 20px;">Feedback:</h3>
        <p style="margin: 8px 0; font-size: 16px; color: #333;">${feedback}</p>
      </div>
      
      <div style="border-left: 4px solid ${this.primaryColor}; padding-left: 20px; margin: 30px 0;">
        <h3 style="color: ${this.primaryColor}; margin-top: 0; font-size: 20px;">Application Details:</h3>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Application ID:</strong> ${application.appCode}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Form:</strong> ${formName}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Program:</strong> ${application.certificationId.name}</p>
      </div>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">Please review the feedback above and resubmit your form with the required changes.</p>
      
      <a href="${this.baseUrl}/student/dashboard" class="button">Resubmit Form</a>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333;">Best regards,<br>
      The <strong>${this.companyName}</strong> Team at Certified IO</p>
    `;

    return await this.sendEmail(
      user.email,
      "Form Resubmission Required",
      this.getBaseTemplate(content, "Form Resubmission Required")
    );
  }

  // 6. Form approval
  async sendFormApprovalEmail(user, application, formName, assessor) {
    const content = `
      <h2>Form Approved</h2>
      <p>Dear ${user.firstName} ${user.lastName},</p>
      
      <p>Congratulations! Your form <strong>"${formName}"</strong> for <strong>${application.certificationId.name}</strong> has been approved by ${assessor.firstName} ${assessor.lastName}.</p>
      
      <div style="border-left: 4px solid #4caf50; padding-left: 20px; margin: 30px 0;">
        <h3 style="color: #4caf50; margin-top: 0; font-size: 20px;">Form Details:</h3>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Application ID:</strong> ${application.appCode}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Form:</strong> ${formName}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Program:</strong> ${application.certificationId.name}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Approved by:</strong> ${assessor.firstName} ${assessor.lastName}</p>
      </div>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">You can continue with the next steps in your application process.</p>
      
      <a href="${this.baseUrl}/student/dashboard" class="button">View Dashboard</a>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333;">Best regards,<br>
      The <strong>${this.companyName}</strong> Team at Certified IO</p>
    `;

    return await this.sendEmail(
      user.email,
      "Form Approved",
      this.getBaseTemplate(content, "Form Approved")
    );
  }

  // 7. Assessment completion
  async sendAssessmentCompletionEmail(user, application, assessor) {
    const content = `
      <h2>Assessment Completed</h2>
      <p>Dear ${user.firstName} ${user.lastName},</p>
      
      <p>Your assessment for <strong>${application.certificationId.name}</strong> has been completed by ${assessor.firstName} ${assessor.lastName}.</p>
      
      <div style="border-left: 4px solid #4caf50; padding-left: 20px; margin: 30px 0;">
        <h3 style="color: #4caf50; margin-top: 0; font-size: 20px;">Assessment Details:</h3>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Application ID:</strong> ${application.appCode}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Assessor:</strong> ${assessor.firstName} ${assessor.lastName}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Program:</strong> ${application.certificationId.name}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Status:</strong> Completed</p>
      </div>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">Your assessment has been successfully completed. You will be notified about the next steps.</p>
      
      <a href="${this.baseUrl}/student/dashboard" class="button">View Application Status</a>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333;">Best regards,<br>
      The <strong>${this.companyName}</strong> Team at Certified IO</p>
    `;

    return await this.sendEmail(
      user.email,
      "Assessment Completed",
      this.getBaseTemplate(content, "Assessment Completed")
    );
  }

  // 8. Certificate ready
  async sendCertificateReadyEmail(user, application, certificateUrl) {
    const content = `
      <h2>Certificate Ready!</h2>
      <p>Dear ${user.firstName} ${user.lastName},</p>
      
      <p>Congratulations! Your certificate for <strong>${application.certificationId.name}</strong> has been successfully issued.</p>
      
      <div style="border-left: 4px solid #4caf50; padding-left: 20px; margin: 30px 0;">
        <h3 style="color: #4caf50; margin-top: 0; font-size: 20px;">Certificate Details:</h3>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Application ID:</strong> ${application.appCode}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Program:</strong> ${application.certificationId.name}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Issue Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p style="margin: 8px 0; font-size: 16px;"><strong>Status:</strong> Certificate Issued</p>
      </div>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">Your certificate is now available for download. Please keep this email and the certificate for your records.</p>
      
      <a href="${certificateUrl}" class="button">Download Certificate</a>
      
      <p style="font-size: 16px; line-height: 1.6; color: #333;">Congratulations on your achievement!<br>
      The <strong>${this.companyName}</strong> Team at Certified IO</p>
    `;

    return await this.sendEmail(
      user.email,
      "Certificate Ready - Congratulations!",
      this.getBaseTemplate(content, "Certificate Ready")
    );
  }

  // Add other email methods as needed...
  // Note: sendEmail method is already defined above
}

module.exports = UnifiedEmailService;
