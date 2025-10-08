// services/emailService.js
require("dotenv").config();
const nodemailer = require("nodemailer");
const InvoiceGenerator = require("../utils/invoiceGenerator");
const { generateCOEFromTemplate } = require("../utils/coeTemplateFiller");
const path = require("path");
const { logMe } = require("../utils/logger");

class EmailService {
  constructor(rtoConfig = null) {
    this.rtoConfig = rtoConfig;
    this.transporter = null;
    this.invoiceGenerator = new InvoiceGenerator(rtoConfig);
    // COE template filler is now imported as a function
    
    this.initializeTransporter();
  }

  /**
   * Initialize nodemailer transporter with RTO-specific or default configuration
   */
  initializeTransporter() {
    const provider = (process.env.EMAIL_PROVIDER || '').toLowerCase();
    let smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpAuthMethod;

    if (provider === 'gmail') {
      smtpHost = 'smtp.gmail.com';
      smtpPort = Number(process.env.SMTP_PORT || 465);
      smtpSecure = typeof process.env.SMTP_SECURE === "string" ? process.env.SMTP_SECURE.toLowerCase() === "true" : smtpPort === 465;
      smtpUser = process.env.GMAIL_USER || process.env.SMTP_USER;
      smtpPass = process.env.GMAIL_APP_PASSWORD || process.env.GOOGLE_APP_PASSWORD || process.env.SMTP_PASS;
    } else if (provider === 'outlook' || provider === 'office365' || provider === 'microsoft') {
      smtpHost = process.env.SMTP_HOST || 'smtp-mail.outlook.com';
      smtpPort = Number(process.env.SMTP_PORT || 587);
      smtpSecure = typeof process.env.SMTP_SECURE === "string" ? process.env.SMTP_SECURE.toLowerCase() === "true" : false;
      smtpUser = process.env.OUTLOOK_USER || process.env.SMTP_USER;
      smtpPass = process.env.OUTLOOK_APP_PASSWORD || process.env.OUTLOOK_PASSWORD || process.env.SMTP_PASS;
      smtpAuthMethod = process.env.SMTP_AUTH_METHOD || 'LOGIN';
    } else { // Default to custom/Zoho
      smtpHost = process.env.SMTP_HOST || "smtp.zoho.com";
      smtpPort = Number(process.env.SMTP_PORT || 587);
      smtpSecure = typeof process.env.SMTP_SECURE === "string" ? process.env.SMTP_SECURE.toLowerCase() === "true" : smtpPort === 465;
      smtpUser = process.env.SMTP_USER || process.env.ZOHO_USER || "admin@edwardbusinesscollege.edu.au";
      smtpPass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || process.env.ZOHO_APP_PASSWORD || "";
    }

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
        method: smtpAuthMethod || 'LOGIN',
      },
      requireTLS: !smtpSecure,
      tls: {
        ciphers: "SSLv3",
      },
    });

    logMe('email.service.initialized', {
      provider,
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      rtoCode: this.rtoConfig?.rtoCode || 'default'
    }, 'debug');
  }

  /**
   * Get RTO branding information
   */
  getRTOBranding() {
    if (this.rtoConfig) {
      const branding = {
        name: this.rtoConfig.name || 'RTO',
        shortName: this.rtoConfig.shortName || this.rtoConfig.rtoCode || 'RTO',
        logoUrl: this.rtoConfig.logo?.url || this.rtoConfig.branding?.logoUrl || 'https://certified.io/images/default-logo.png',
        primaryColor: this.rtoConfig.primaryColor || this.rtoConfig.branding?.primaryColor || '#1E40AF',
        secondaryColor: this.rtoConfig.secondaryColor || this.rtoConfig.branding?.secondaryColor || '#F59E0B',
        contactEmail: this.rtoConfig.contact?.supportEmail || this.rtoConfig.contact?.email || 'support@certified.io',
        address: this.rtoConfig.contact?.address || 'Australia',
        phone: this.rtoConfig.contact?.phone || '',
        website: this.rtoConfig.contact?.website || 'https://certified.io'
      };
      
      logMe('email.branding.resolved', {
        rtoCode: this.rtoConfig.rtoCode,
        name: branding.name,
        logoUrl: branding.logoUrl,
        primaryColor: branding.primaryColor,
        secondaryColor: branding.secondaryColor
      }, 'debug');
      
      return branding;
    }
    
    return {
      name: 'Certified.IO',
      shortName: 'CERTIFIED',
      logoUrl: 'https://certified.io/images/certified-australia-logo.png',
      primaryColor: '#1E40AF',
      secondaryColor: '#F59E0B',
      contactEmail: 'support@certified.io',
      address: 'Australia',
      phone: '',
      website: 'https://certified.io'
    };
  }

  /**
   * Generate email header with gradient background and dynamic logo
   */
  generateEmailHeader(title, branding) {
    return `
      <div style="
        background: linear-gradient(135deg, #7DA9FF 0%, #BFD3FF 30%, #FFFFFF 50%, #FFE0CF 70%, #FFB58A 100%);
        padding: 40px 20px;
        text-align: center;
        border-radius: 8px 8px 0 0;
        margin: 0;
        position: relative;
      ">
        <div style="
          margin: 0 auto 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 80px;
          height: 80px;
        ">
          <img src="${branding.logoUrl}" alt="${branding.name}" style="
            width: 80px;
            height: 80px;
            object-fit: contain;
            background: transparent;
          " onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div style="
            display: none;
            width: 80px;
            height: 80px;
            background: transparent;
            align-items: center;
            justify-content: center;
            color: ${branding.primaryColor};
            font-weight: bold;
            font-size: 24px;
            text-shadow: 0 2px 4px rgba(255,255,255,0.8);
          ">${branding.shortName.substring(0, 2).toUpperCase()}</div>
        </div>
        <h1 style="
          color: #333;
          margin: 0;
          font-size: 28px;
          font-weight: 600;
          text-shadow: 0 2px 4px rgba(255,255,255,0.8);
        ">${title}</h1>
      </div>
    `;
  }

  /**
   * Generate email footer with gradient background and RTO information
   */
  generateEmailFooter(branding) {
    return `
      <div style="
        background: linear-gradient(135deg, #7DA9FF 0%, #BFD3FF 30%, #FFFFFF 50%, #FFE0CF 70%, #FFB58A 100%);
        padding: 30px 20px;
        text-align: center;
        border-radius: 0 0 8px 8px;
        margin: 0;
      ">
        <h3 style="
          color: #333;
          margin: 0 0 15px 0;
          font-size: 20px;
          font-weight: 600;
          text-shadow: 0 2px 4px rgba(255,255,255,0.8);
        ">${branding.name}</h3>
        
        <p style="
          color: rgba(51,51,51,0.8);
          margin: 0 0 10px 0;
          font-size: 14px;
          line-height: 1.5;
          text-shadow: 0 1px 2px rgba(255,255,255,0.6);
        ">This email was sent from an automated system. Please do not reply to this email.</p>
        
        <p style="
          color: rgba(51,51,51,0.8);
          margin: 0 0 10px 0;
          font-size: 14px;
          text-shadow: 0 1px 2px rgba(255,255,255,0.6);
        ">If you have any questions, contact us at <a href="mailto:${branding.contactEmail}" style="color: ${branding.primaryColor}; text-decoration: underline; text-shadow: 0 1px 2px rgba(255,255,255,0.6);">${branding.contactEmail}</a></p>
        
        ${branding.phone ? `
        <p style="
          color: rgba(51,51,51,0.8);
          margin: 0 0 10px 0;
          font-size: 14px;
          text-shadow: 0 1px 2px rgba(255,255,255,0.6);
        ">Phone: ${branding.phone}</p>
        ` : ''}
        
        ${branding.address ? `
        <p style="
          color: rgba(51,51,51,0.8);
          margin: 0 0 15px 0;
          font-size: 14px;
          text-shadow: 0 1px 2px rgba(255,255,255,0.6);
        ">${branding.address}</p>
        ` : ''}
        
        <p style="
          color: rgba(51,51,51,0.7);
          margin: 0;
          font-size: 12px;
          text-shadow: 0 1px 2px rgba(255,255,255,0.6);
        ">© ${new Date().getFullYear()} ${branding.name}. All rights reserved.</p>
      </div>
    `;
  }

  /**
   * Generate complete email template with header, content, and footer
   */
  generateEmailTemplate(content, title, branding = null) {
    const brandInfo = branding || this.getRTOBranding();
    
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
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f8fafc;
          }
          .email-container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          }
          .email-content {
            padding: 40px 30px;
            background: white;
          }
          .cta-button {
            display: inline-block;
            background: linear-gradient(135deg, #7DA9FF 0%, #BFD3FF 30%, #FFFFFF 50%, #FFE0CF 70%, #FFB58A 100%);
            color: #333;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
            transition: transform 0.2s ease;
            text-shadow: 0 1px 2px rgba(255,255,255,0.6);
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
          .cta-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          }
          .info-box {
            background: #f1f5f9;
            border-left: 4px solid ${brandInfo.primaryColor};
            padding: 20px;
            margin: 20px 0;
            border-radius: 0 6px 6px 0;
          }
          .info-box h3 {
            margin: 0 0 10px 0;
            color: ${brandInfo.primaryColor};
            font-size: 16px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            margin: 8px 0;
            padding: 5px 0;
            border-bottom: 1px solid #e2e8f0;
          }
          .info-row:last-child {
            border-bottom: none;
          }
          .info-label {
            font-weight: 600;
            color: #475569;
          }
          .info-value {
            color: #334155;
          }
          .powered-by {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            color: #64748b;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          ${this.generateEmailHeader(title, brandInfo)}
          <div class="email-content">
            ${content}
          </div>
          ${this.generateEmailFooter(brandInfo)}
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Send email with RTO-specific branding
   */
  async sendEmail(to, subject, htmlContent, attachments = []) {
    try {
      if (!this.transporter) {
        this.initializeTransporter();
      }

      const branding = this.getRTOBranding();
      
      logMe('email.send_attempt', {
        rtoCode: this.rtoConfig?.rtoCode || 'default',
        to,
        subject,
        fromEmail: process.env.SMTP_USER || process.env.GMAIL_USER
      });

      const mailOptions = {
        from: `"${branding.name}" <${process.env.SMTP_USER || process.env.GMAIL_USER}>`,
        to,
        subject,
        html: htmlContent,
        attachments,
        replyTo: branding.contactEmail
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logMe('email.sent', {
        rtoCode: this.rtoConfig?.rtoCode || 'default',
        messageId: result.messageId,
        to
      });
      
      return { success: true, messageId: result.messageId };
    } catch (error) {
      logMe('email.send_error', {
        rtoCode: this.rtoConfig?.rtoCode || 'default',
        to,
        error: error.message
      }, 'error');
      throw error;
    }
  }

  /**
   * Send COE email with generated PDF attachment
   */
  async sendCOEEmail(user, application, payment, enrollmentFormData) {
    try {
      const branding = this.getRTOBranding();
      
      const content = `
        <p>Dear ${user.firstName} ${user.lastName},</p>
        
        <p>Congratulations! Your payment has been processed successfully, and we're pleased to provide you with your Confirmation of Enrollment (COE).</p>
        
        <div class="info-box">
          <h3>Your Application Details</h3>
          <div class="info-row">
            <span class="info-label">Application ID:</span>
            <span class="info-value">${application.appCode}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Certification:</span>
            <span class="info-value">${application.certificationId.name}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Payment Amount:</span>
            <span class="info-value">$${payment.totalAmount}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Payment Date:</span>
            <span class="info-value">${new Date(payment.completedAt).toLocaleDateString()}</span>
          </div>
        </div>
        
        <p>Your COE document is attached to this email. Please keep this document safe as it confirms your enrollment in our certification program.</p>
        
        <p>If you have any questions about your enrollment or the next steps in your certification journey, please don't hesitate to contact us.</p>
        
        <div class="powered-by">Powered by Certified.IO</div>
      `;

      const htmlContent = this.generateEmailTemplate(content, "Confirmation of Enrollment (COE)", branding);

      // Generate COE PDF
      let attachments = [];
      try {
        const coeData = {
          user: user,
          application: application,
          payment: payment,
          enrollmentFormData: enrollmentFormData
        };
        
        const coeBuffer = await generateCOEFromTemplate(coeData);
        if (coeBuffer && coeBuffer.length) {
          attachments.push({
            filename: `COE-${user.firstName}-${user.lastName}-${application.appCode || application._id}.pdf`,
            content: coeBuffer,
            contentType: 'application/pdf'
          });
          logMe('coe.pdf.generated', {
            size: coeBuffer.length,
            filename: `COE-${user.firstName}-${user.lastName}-${application.appCode || application._id}.pdf`
          });
        }
      } catch (coeError) {
        logMe('coe.pdf.generation_failed', {
          error: coeError.message,
          userId: user._id,
          applicationId: application._id
        }, 'error');
      }

      await this.sendEmail(
        user.email,
        `Confirmation of Enrollment (COE) - ${application.certificationId.name}`,
        htmlContent,
        attachments
      );

      logMe('coe.email.sent', {
        userId: user._id,
        applicationId: application._id,
        paymentId: payment._id,
        rtoCode: this.rtoConfig?.rtoCode || 'default'
      });

    } catch (error) {
      logMe('coe.email.error', {
        error: error.message,
        userId: user._id,
        applicationId: application._id
      }, 'error');
      throw error;
    }
  }

  /**
   * Send assessor assignment email
   */
  async sendAssessorAssignmentEmail(user, application, assessor) {
    try {
      const branding = this.getRTOBranding();
      
      const content = `
        <p>Great News, ${user.firstName}!</p>
        
        <p>Your application has been assigned to a qualified assessor who will guide you through the certification process.</p>
        
        <div class="info-box">
          <h3>Your Assessment Team</h3>
          <div class="info-row">
            <span class="info-label">Assigned Assessor:</span>
            <span class="info-value">${assessor.firstName} ${assessor.lastName}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Certification:</span>
            <span class="info-value">${application.certificationId.name}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Application ID:</span>
            <span class="info-value">${application.appCode}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Current Status:</span>
            <span class="info-value">in_progress</span>
          </div>
          <div class="info-row">
            <span class="info-label">Assignment Date:</span>
            <span class="info-value">${new Date().toLocaleDateString()}</span>
          </div>
        </div>
        
        <p>Your assessor will review your application and provide guidance throughout the process. They may reach out to you with questions or requests for additional information.</p>
        
        <div style="text-align: center;">
          <a href="${branding.website}/applications/${application._id}" class="cta-button">View Application</a>
        </div>
        
        <p>Keep an eye on your email and dashboard for updates from your assessor. You're one step closer to achieving your certification!</p>
        
        <div class="powered-by">Powered by Certified.IO</div>
      `;

      const htmlContent = this.generateEmailTemplate(content, "Assessor Assigned", branding);

      await this.sendEmail(
        user.email,
        "Assessor Assigned to Your Application",
        htmlContent
      );

      logMe('assessor.assignment.email.sent', {
        userId: user._id,
        applicationId: application._id,
        assessorId: assessor._id,
        rtoCode: this.rtoConfig?.rtoCode || 'default'
      });

    } catch (error) {
      logMe('assessor.assignment.email.error', {
        error: error.message,
        userId: user._id,
        applicationId: application._id
      }, 'error');
      throw error;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(user, resetToken) {
    try {
      const branding = this.getRTOBranding();
      const resetUrl = `${branding.website}/reset-password?token=${resetToken}`;
      
      const content = `
        <p>Hello ${user.firstName},</p>
        
        <p>You requested a password reset for your account. Click the button below to reset your password:</p>
        
        <div style="text-align: center;">
          <a href="${resetUrl}" class="cta-button">Reset Password</a>
        </div>
        
        <p>If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
        
        <p>This link will expire in 1 hour for security reasons.</p>
        
        <div class="powered-by">Powered by Certified.IO</div>
      `;

      const htmlContent = this.generateEmailTemplate(content, "Password Reset Request", branding);

      await this.sendEmail(
        user.email,
        "Password Reset Request",
        htmlContent
      );

      logMe('password.reset.email.sent', {
        userId: user._id,
        rtoCode: this.rtoConfig?.rtoCode || 'default'
      });

    } catch (error) {
      logMe('password.reset.email.error', {
        error: error.message,
        userId: user._id
      }, 'error');
      throw error;
    }
  }

  /**
   * Send payment confirmation email
   */
  async sendPaymentConfirmationEmail(user, application, payment) {
    try {
      const branding = this.getRTOBranding();
      
      // Generate invoice PDF
      let invoiceAttachment = null;
      try {
        const invoiceBuffer = await this.invoiceGenerator.generateInvoicePDF(payment, user, application);
        invoiceAttachment = {
          filename: `Invoice-${user.firstName}-${user.lastName}-${application.appCode || application._id}.pdf`,
          content: invoiceBuffer,
          contentType: 'application/pdf'
        };
      } catch (invoiceError) {
        logMe('email.invoice_generation_error', {
          error: invoiceError.message,
          userId: user._id,
          applicationId: application._id
        }, 'error');
        // Continue without invoice if generation fails
      }
      
      const content = `
        <p>Dear ${user.firstName} ${user.lastName},</p>
        
        <p>Thank you for your payment! We have successfully processed your payment for your certification application.</p>
        
        <div class="info-box">
          <h3>Payment Details</h3>
          <div class="info-row">
            <span class="info-label">Application ID:</span>
            <span class="info-value">${application.appCode}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Certification:</span>
            <span class="info-value">${application.certificationId.name}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Amount Paid:</span>
            <span class="info-value">$${payment.totalAmount}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Payment Date:</span>
            <span class="info-value">${new Date(payment.completedAt).toLocaleDateString()}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Payment Method:</span>
            <span class="info-value">${payment.paymentType === 'payment_plan' ? 'Payment Plan' : 'One-time Payment'}</span>
          </div>
        </div>
        
        <p>Your application is now being processed. You will receive further updates about your certification journey via email.</p>
        
        <div style="text-align: center;">
          <a href="${branding.website}/applications/${application._id}" class="cta-button">View Application</a>
        </div>
        
        <p>If you have any questions about your payment or application, please don't hesitate to contact us.</p>
        
        <div class="powered-by">Powered by Certified.IO</div>
      `;

      const htmlContent = this.generateEmailTemplate(content, "Payment Confirmation", branding);

      // Get certification name for subject
      const certificationName = application.certificationId?.name || 'Your Certification';
      
      await this.sendEmail(
        user.email,
        `Payment Confirmation - ${certificationName}`,
        htmlContent,
        invoiceAttachment ? [invoiceAttachment] : []
      );

      logMe('payment.confirmation.email.sent', {
        userId: user._id,
        applicationId: application._id,
        paymentId: payment._id,
        rtoCode: this.rtoConfig?.rtoCode || 'default'
      });

    } catch (error) {
      logMe('payment.confirmation.email.error', {
        error: error.message,
        userId: user._id,
        applicationId: application._id
      }, 'error');
      throw error;
    }
  }

  /**
   * Send form submission confirmation email
   */
  async sendFormSubmissionEmail(user, application, formName) {
    try {
      const branding = this.getRTOBranding();
      
      const content = `
        <p>Dear ${user.firstName} ${user.lastName},</p>
        
        <p>Thank you for submitting your ${formName} form. We have received your submission and it is now being reviewed.</p>
        
        <div class="info-box">
          <h3>Submission Details</h3>
          <div class="info-row">
            <span class="info-label">Application ID:</span>
            <span class="info-value">${application.appCode}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Form Name:</span>
            <span class="info-value">${formName}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Submission Date:</span>
            <span class="info-value">${new Date().toLocaleDateString()}</span>
          </div>
        </div>
        
        <p>Our team will review your submission and get back to you with any feedback or next steps.</p>
        
        <div class="powered-by">Powered by Certified.IO</div>
      `;

      const htmlContent = this.generateEmailTemplate(content, "Form Submission Confirmation", branding);

      await this.sendEmail(
        user.email,
        `Form Submission Confirmation - ${formName}`,
        htmlContent
      );

      logMe('form.submission.email.sent', {
        userId: user._id,
        applicationId: application._id,
        formName,
        rtoCode: this.rtoConfig?.rtoCode || 'default'
      });

    } catch (error) {
      logMe('form.submission.email.error', {
        error: error.message,
        userId: user._id,
        applicationId: application._id
      }, 'error');
      throw error;
    }
  }

  /**
   * Send form resubmission required email
   */
  async sendFormResubmissionRequiredEmail(user, application, formName, feedback) {
    try {
      const branding = this.getRTOBranding();
      
      const content = `
        <p>Dear ${user.firstName} ${user.lastName},</p>
        
        <p>We have reviewed your ${formName} form submission and need some additional information or corrections.</p>
        
        <div class="info-box">
          <h3>Feedback</h3>
          <p>${feedback}</p>
        </div>
        
        <div class="info-box">
          <h3>Next Steps</h3>
          <div class="info-row">
            <span class="info-label">Application ID:</span>
            <span class="info-value">${application.appCode}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Form Name:</span>
            <span class="info-value">${formName}</span>
          </div>
        </div>
        
        <p>Please review the feedback above and resubmit your form with the required changes.</p>
        
        <div style="text-align: center;">
          <a href="${branding.website}/applications/${application._id}" class="cta-button">Resubmit Form</a>
        </div>
        
        <div class="powered-by">Powered by Certified.IO</div>
      `;

      const htmlContent = this.generateEmailTemplate(content, "Form Resubmission Required", branding);

      await this.sendEmail(
        user.email,
        `Form Resubmission Required - ${formName}`,
        htmlContent
      );

      logMe('form.resubmission.email.sent', {
        userId: user._id,
        applicationId: application._id,
        formName,
        rtoCode: this.rtoConfig?.rtoCode || 'default'
      });

    } catch (error) {
      logMe('form.resubmission.email.error', {
        error: error.message,
        userId: user._id,
        applicationId: application._id
      }, 'error');
      throw error;
    }
  }

  /**
   * Send form approval email
   */
  async sendFormApprovalEmail(user, application, formName, assessor) {
    try {
      const branding = this.getRTOBranding();
      
      const content = `
        <p>Dear ${user.firstName} ${user.lastName},</p>
        
        <p>Great news! Your ${formName} form has been approved by your assessor.</p>
        
        <div class="info-box">
          <h3>Approval Details</h3>
          <div class="info-row">
            <span class="info-label">Application ID:</span>
            <span class="info-value">${application.appCode}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Form Name:</span>
            <span class="info-value">${formName}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Approved by:</span>
            <span class="info-value">${assessor.firstName} ${assessor.lastName}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Approval Date:</span>
            <span class="info-value">${new Date().toLocaleDateString()}</span>
          </div>
        </div>
        
        <p>You can now proceed to the next step in your certification process.</p>
        
        <div style="text-align: center;">
          <a href="${branding.website}/applications/${application._id}" class="cta-button">View Application</a>
        </div>
        
        <div class="powered-by">Powered by Certified.IO</div>
      `;

      const htmlContent = this.generateEmailTemplate(content, "Form Approved", branding);

      await this.sendEmail(
        user.email,
        `Form Approved - ${formName}`,
        htmlContent
      );

      logMe('form.approval.email.sent', {
        userId: user._id,
        applicationId: application._id,
        formName,
        assessorId: assessor._id,
        rtoCode: this.rtoConfig?.rtoCode || 'default'
      });

    } catch (error) {
      logMe('form.approval.email.error', {
        error: error.message,
        userId: user._id,
        applicationId: application._id
      }, 'error');
      throw error;
    }
  }

  /**
   * Send assessment completion email
   */
  async sendAssessmentCompletionEmail(user, application, assessor) {
    try {
      const branding = this.getRTOBranding();
      
      const content = `
        <p>Dear ${user.firstName} ${user.lastName},</p>
        
        <p>Congratulations! Your assessment has been completed by your assessor.</p>
        
        <div class="info-box">
          <h3>Assessment Details</h3>
          <div class="info-row">
            <span class="info-label">Application ID:</span>
            <span class="info-value">${application.appCode}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Certification:</span>
            <span class="info-value">${application.certificationId.name}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Assessed by:</span>
            <span class="info-value">${assessor.firstName} ${assessor.lastName}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Completion Date:</span>
            <span class="info-value">${new Date().toLocaleDateString()}</span>
          </div>
        </div>
        
        <p>Your assessment is now complete. We will review the results and notify you of the next steps in your certification process.</p>
        
        <div style="text-align: center;">
          <a href="${branding.website}/applications/${application._id}" class="cta-button">View Results</a>
        </div>
        
        <div class="powered-by">Powered by Certified.IO</div>
      `;

      const htmlContent = this.generateEmailTemplate(content, "Assessment Complete", branding);

      await this.sendEmail(
        user.email,
        "Assessment Complete",
        htmlContent
      );

      logMe('assessment.completion.email.sent', {
        userId: user._id,
        applicationId: application._id,
        assessorId: assessor._id,
        rtoCode: this.rtoConfig?.rtoCode || 'default'
      });

    } catch (error) {
      logMe('assessment.completion.email.error', {
        error: error.message,
        userId: user._id,
        applicationId: application._id
      }, 'error');
      throw error;
    }
  }

  /**
   * Send certificate ready email
   */
  async sendCertificateReadyEmail(user, application, certificateUrl) {
    try {
      const branding = this.getRTOBranding();
      
      const content = `
        <p>Dear ${user.firstName} ${user.lastName},</p>
        
        <p>Congratulations! Your certificate is ready for download.</p>
        
        <div class="info-box">
          <h3>Certificate Details</h3>
          <div class="info-row">
            <span class="info-label">Application ID:</span>
            <span class="info-value">${application.appCode}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Certification:</span>
            <span class="info-value">${application.certificationId.name}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Issue Date:</span>
            <span class="info-value">${new Date().toLocaleDateString()}</span>
          </div>
        </div>
        
        <p>Your certificate has been successfully issued. You can download it using the link below.</p>
        
        <div style="text-align: center;">
          <a href="${certificateUrl}" class="cta-button">Download Certificate</a>
        </div>
        
        <p>Please keep your certificate safe as it is your official proof of certification.</p>
        
        <div class="powered-by">Powered by Certified.IO</div>
      `;

      const htmlContent = this.generateEmailTemplate(content, "Certificate Ready", branding);

      await this.sendEmail(
        user.email,
        "Your Certificate is Ready",
        htmlContent
      );

      logMe('certificate.ready.email.sent', {
        userId: user._id,
        applicationId: application._id,
        certificateUrl,
        rtoCode: this.rtoConfig?.rtoCode || 'default'
      });

    } catch (error) {
      logMe('certificate.ready.email.error', {
        error: error.message,
        userId: user._id,
        applicationId: application._id
      }, 'error');
      throw error;
    }
  }

  /**
   * Send certificate download email
   */
  async sendCertificateDownloadEmail(user, application, certificateDetails) {
    try {
      const branding = this.getRTOBranding();
      
      const content = `
        <p>Dear ${user.firstName} ${user.lastName},</p>
        
        <p>Congratulations! Your certificate has been issued and is ready for download.</p>
        
        <div class="info-box">
          <h3>Certificate Details</h3>
          <div class="info-row">
            <span class="info-label">Application ID:</span>
            <span class="info-value">${application.appCode}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Certification:</span>
            <span class="info-value">${certificateDetails.certificationName}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Certificate ID:</span>
            <span class="info-value">${certificateDetails.certificateId}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Issue Date:</span>
            <span class="info-value">${new Date(certificateDetails.issueDate).toLocaleDateString()}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Expiry Date:</span>
            <span class="info-value">${new Date(certificateDetails.expiryDate).toLocaleDateString()}</span>
          </div>
          ${certificateDetails.grade ? `
          <div class="info-row">
            <span class="info-label">Grade:</span>
            <span class="info-value">${certificateDetails.grade}</span>
          </div>
          ` : ''}
        </div>
        
        <p>Your certificate is now available for download. Please keep this document safe as it is your official proof of certification.</p>
        
        <div style="text-align: center;">
          <a href="${certificateDetails.downloadUrl}" class="cta-button">Download Certificate</a>
        </div>
        
        <p>If you have any questions about your certificate or need assistance, please don't hesitate to contact us.</p>
        
        <div class="powered-by">Powered by Certified.IO</div>
      `;

      const htmlContent = this.generateEmailTemplate(content, "Your Certificate is Ready", branding);

      await this.sendEmail(
        user.email,
        `Your Certificate is Ready - ${certificateDetails.certificationName}`,
        htmlContent
      );

      logMe('certificate.download.email.sent', {
        userId: user._id,
        applicationId: application._id,
        certificateId: certificateDetails.certificateId,
        rtoCode: this.rtoConfig?.rtoCode || 'default'
      });

    } catch (error) {
      logMe('certificate.download.email.error', {
        error: error.message,
        userId: user._id,
        applicationId: application._id
      }, 'error');
      throw error;
    }
  }

  /**
   * Send welcome email for new users
   */
  async sendWelcomeEmail(user, certification = null) {
    try {
      const branding = this.getRTOBranding();
      
      const content = `
        <p>Welcome to ${branding.name}, ${user.firstName}!</p>
        
        <p>Thank you for registering with us. We're excited to help you achieve your certification goals.</p>
        
        ${certification ? `
        <div class="info-box">
          <h3>Your Certification</h3>
          <div class="info-row">
            <span class="info-label">Certification:</span>
            <span class="info-value">${certification.name}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Description:</span>
            <span class="info-value">${certification.description}</span>
          </div>
        </div>
        ` : ''}
        
        <p>Your account has been created successfully. You can now:</p>
        <ul>
          <li>Complete your application forms</li>
          <li>Upload required documents</li>
          <li>Track your application progress</li>
          <li>Communicate with your assessor</li>
        </ul>
        
        <div style="text-align: center;">
          <a href="${branding.website}/dashboard" class="cta-button">Access Your Dashboard</a>
        </div>
        
        <p>If you have any questions, please don't hesitate to contact our support team.</p>
        
        <div class="powered-by">Powered by Certified.IO</div>
      `;

      const htmlContent = this.generateEmailTemplate(content, "Welcome to " + branding.name, branding);

      await this.sendEmail(
        user.email,
        "Welcome to " + branding.name,
        htmlContent
      );

      logMe('welcome.email.sent', {
        userId: user._id,
        rtoCode: this.rtoConfig?.rtoCode || 'default'
      });

    } catch (error) {
      logMe('welcome.email.error', {
        error: error.message,
        userId: user._id
      }, 'error');
      throw error;
    }
  }
}

// Create default instance for backward compatibility
const defaultEmailService = new EmailService();

module.exports = {
  EmailService,
  defaultEmailService,
  // Backward compatibility exports
  sendEmail: (to, subject, html, attachments = []) => defaultEmailService.sendEmail(to, subject, html, attachments),
  sendCOEEmail: (user, application, payment, enrollmentFormData) => defaultEmailService.sendCOEEmail(user, application, payment, enrollmentFormData),
  sendAssessorAssignmentEmail: (user, application, assessor) => defaultEmailService.sendAssessorAssignmentEmail(user, application, assessor),
  sendPasswordResetEmail: (user, resetToken) => defaultEmailService.sendPasswordResetEmail(user, resetToken),
  sendPaymentConfirmationEmail: (user, application, payment) => defaultEmailService.sendPaymentConfirmationEmail(user, application, payment),
  sendWelcomeEmail: (user, certification) => defaultEmailService.sendWelcomeEmail(user, certification),
  sendFormSubmissionEmail: (user, application, formName) => defaultEmailService.sendFormSubmissionEmail(user, application, formName),
  sendFormResubmissionRequiredEmail: (user, application, formName, feedback) => defaultEmailService.sendFormResubmissionRequiredEmail(user, application, formName, feedback),
  sendFormApprovalEmail: (user, application, formName, assessor) => defaultEmailService.sendFormApprovalEmail(user, application, formName, assessor),
  sendAssessmentCompletionEmail: (user, application, assessor) => defaultEmailService.sendAssessmentCompletionEmail(user, application, assessor),
  sendCertificateReadyEmail: (user, application, certificateUrl) => defaultEmailService.sendCertificateReadyEmail(user, application, certificateUrl),
  sendCertificateDownloadEmail: (user, application, certificateDetails) => defaultEmailService.sendCertificateDownloadEmail(user, application, certificateDetails)
};
