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
    
    // Debug: Log RTO config in EmailService constructor
    logMe('email.service.constructor', {
      hasRtoConfig: !!rtoConfig,
      rtoCode: rtoConfig?.rtoCode,
      rtoName: rtoConfig?.name,
      rtoId: rtoConfig?._id
    });
    
    this.initializeTransporter();
  }

  /**
   * Initialize nodemailer transporter with RTO-specific or default configuration
   */
  initializeTransporter() {
    let smtpConfig;

    // Use RTO-specific email configuration if available
    if (this.rtoConfig?.emailConfig) {
      const emailConfig = this.rtoConfig.emailConfig;
      smtpConfig = {
        host: emailConfig.host,
        port: emailConfig.port || 587,
        secure: emailConfig.secure || false,
        auth: {
          user: emailConfig.username,
          pass: emailConfig.password,
          method: 'LOGIN'
        },
        requireTLS: !emailConfig.secure,
        tls: {
          ciphers: "SSLv3",
          rejectUnauthorized: false
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
      };

      logMe('email.service.rto_initialized', {
        rtoCode: this.rtoConfig.rtoCode,
        rtoName: this.rtoConfig.name,
        provider: emailConfig.provider,
        host: emailConfig.host,
        port: emailConfig.port,
        secure: emailConfig.secure,
        fromEmail: emailConfig.fromEmail
      }, 'debug');
    } else {
      // Fallback to global environment configuration
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

      smtpConfig = {
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
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
      };

      logMe('email.service.global_initialized', {
      provider,
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      rtoCode: this.rtoConfig?.rtoCode || 'default'
    }, 'debug');
    }

    this.transporter = nodemailer.createTransport(smtpConfig);
  }

  /**
   * Get RTO branding information
   */
  getRTOBranding() {
    if (this.rtoConfig) {
      // Format address properly
      let formattedAddress = 'Australia';
      if (this.rtoConfig.contact?.address) {
        if (typeof this.rtoConfig.contact.address === 'string') {
          formattedAddress = this.rtoConfig.contact.address;
        } else if (typeof this.rtoConfig.contact.address === 'object') {
          const addressParts = [
            this.rtoConfig.contact.address.street,
            this.rtoConfig.contact.address.city,
            this.rtoConfig.contact.address.state,
            this.rtoConfig.contact.address.postcode,
            this.rtoConfig.contact.address.country
          ].filter(part => part && part.trim() !== '');
          
          formattedAddress = addressParts.length > 0 ? addressParts.join(', ') : 'Australia';
        }
      }

      const branding = {
        name: this.rtoConfig.name || 'RTO',
        shortName: this.rtoConfig.shortName || this.rtoConfig.rtoCode || 'RTO',
        logoUrl: this.rtoConfig.logo?.url || this.rtoConfig.branding?.logoUrl || 'https://certified.io/images/default-logo.png',
        primaryColor: this.rtoConfig.primaryColor || this.rtoConfig.branding?.primaryColor || '#1E40AF',
        secondaryColor: this.rtoConfig.secondaryColor || this.rtoConfig.branding?.secondaryColor || '#F59E0B',
        contactEmail: this.rtoConfig.contact?.supportEmail || this.rtoConfig.contact?.email || 'support@certified.io',
        address: formattedAddress,
        phone: this.rtoConfig.contact?.phone || '',
        website: this.rtoConfig.contact?.website || 'https://certified.io'
      };
      
      // Debug: Log branding resolution
      logMe('email.branding.resolved', {
        rtoCode: this.rtoConfig.rtoCode,
        name: branding.name,
        logoUrl: branding.logoUrl,
        contactEmail: branding.contactEmail,
        phone: branding.phone,
        website: branding.website,
        primaryColor: branding.primaryColor,
        secondaryColor: branding.secondaryColor,
        formattedAddress: formattedAddress
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
   * Send email with RTO-specific branding and SMTP configuration
   */
  async sendEmail(to, subject, htmlContent, attachments = []) {
    try {
      if (!this.transporter) {
        this.initializeTransporter();
      }

      const branding = this.getRTOBranding();
      
      // Check if SMTP bypass is enabled
      const SMTP_BYPASS = process.env.SMTP_BYPASS === 'true';
      
      if (SMTP_BYPASS) {
        // Bypass SMTP - just log emails
        console.log('📧 EMAIL BYPASS - Email logged instead of sent:');
        console.log('   To:', to);
        console.log('   Subject:', subject);
        console.log('   RTO:', branding.name || 'Default');
        console.log('   Content preview:', htmlContent.substring(0, 200) + '...');
        if (attachments && attachments.length > 0) {
          console.log('   Attachments:', attachments.length, 'files');
        }
        
        logMe('email.bypass_sent', {
          rtoCode: this.rtoConfig?.rtoCode || 'default',
          to,
          subject,
          branding: branding.name,
          attachments: attachments.length
        });
        
        return { success: true, messageId: 'bypass-' + Date.now() };
      }
      
      // Determine from email based on RTO config or environment
      let fromEmail, fromName;
      if (this.rtoConfig?.emailConfig?.fromEmail) {
        fromEmail = this.rtoConfig.emailConfig.fromEmail;
        fromName = this.rtoConfig.emailConfig.fromName || branding.name;
      } else {
        fromEmail = process.env.OUTLOOK_USER || process.env.SMTP_USER || process.env.GMAIL_USER;
        fromName = branding.name;
      }
      
      logMe('email.send_attempt', {
        rtoCode: this.rtoConfig?.rtoCode || 'default',
        to,
        subject,
        fromEmail,
        fromName,
        usingRTOConfig: !!this.rtoConfig?.emailConfig
      });

      const mailOptions = {
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject,
        html: htmlContent,
        attachments,
        replyTo: this.rtoConfig?.emailConfig?.replyTo || branding.contactEmail
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logMe('email.sent', {
        rtoCode: this.rtoConfig?.rtoCode || 'default',
        messageId: result.messageId,
        to,
        fromEmail,
        usingRTOConfig: !!this.rtoConfig?.emailConfig
      });
      
      return { success: true, messageId: result.messageId };
    } catch (error) {
      logMe('email.send_error', {
        rtoCode: this.rtoConfig?.rtoCode || 'default',
        to,
        error: error.message,
        usingRTOConfig: !!this.rtoConfig?.emailConfig
      }, 'error');
      
      // If SMTP fails and bypass is not enabled, fall back to bypass mode
      if (!process.env.SMTP_BYPASS) {
        console.log('❌ SMTP failed, falling back to bypass mode:');
        console.log('   Error:', error.message);
        console.log('   To:', to);
        console.log('   Subject:', subject);
        
        return { success: true, messageId: 'fallback-' + Date.now(), error: error.message };
      }
      
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
          enrollmentFormData: enrollmentFormData,
          rtoConfig: this.rtoConfig
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

  // Third-party employer email
  async sendThirdPartyEmployerEmail(employerEmail, employerName, student, formTemplate, formUrl) {
    const branding = this.getRTOBranding();
    
    const content = `
      <div class="greeting">Dear ${employerName},</div>
      <div class="message">
        ${student.firstName} ${student.lastName} has requested you to complete a reference form as their employer for their qualification application with ${branding.name} RTO.
      </div>
      
      <div class="info-box">
        <h3>Reference Request Details</h3>
        <p><strong>Student:</strong> ${student.firstName} ${student.lastName}</p>
        <p><strong>Form:</strong> ${formTemplate.name}</p>
        <p><strong>Your Role:</strong> Employer Reference</p>
        <p><strong>Estimated Time:</strong> 5-10 minutes</p>
      </div>

      <div class="message">
        Your honest assessment will help us evaluate ${student.firstName}'s qualifications. The form is secure and your responses will be kept confidential.
      </div>

      <a href="${formUrl}" class="button">Complete Employer Reference Form</a>

      <div class="message">
        This secure link will expire in 30 days. If you have any questions about this request, please contact our support team.
      </div>
    `;

    const htmlContent = this.generateEmailTemplate(content, "Employer Reference Request");
    return this.sendEmail(
      employerEmail,
      `Reference Request for ${student.firstName} ${student.lastName}`,
      htmlContent
    );
  }

  // Third-party reference email
  async sendThirdPartyReferenceEmail(referenceEmail, referenceName, student, formTemplate, formUrl) {
    const branding = this.getRTOBranding();
    
    const content = `
      <div class="greeting">Dear ${referenceName},</div>
      <div class="message">
        ${student.firstName} ${student.lastName} has requested you to complete a professional reference form for their qualification application with ${branding.name}.
      </div>
      
      <div class="info-box">
        <h3>Reference Request Details</h3>
        <p><strong>Student:</strong> ${student.firstName} ${student.lastName}</p>
        <p><strong>Form:</strong> ${formTemplate.name}</p>
        <p><strong>Your Role:</strong> Professional Reference</p>
        <p><strong>Estimated Time:</strong> 5-10 minutes</p>
      </div>

      <div class="message">
        Your professional assessment will help us evaluate ${student.firstName}'s qualifications and experience. All responses are confidential and secure.
      </div>

      <a href="${formUrl}" class="button">Complete Reference Form</a>

      <div class="message">
        This secure link will expire in 30 days. Thank you for taking the time to support ${student.firstName}'s professional development.
      </div>
    `;

    const htmlContent = this.generateEmailTemplate(content, "Professional Reference Request");
    return this.sendEmail(
      referenceEmail,
      `Reference Request for ${student.firstName} ${student.lastName}`,
      htmlContent
    );
  }

  // Third-party combined email
  async sendThirdPartyCombinedEmail(email, employerName, referenceName, student, formTemplate, formUrl) {
    const branding = this.getRTOBranding();
    
    const content = `
      <div class="greeting">Dear ${employerName},</div>
      <div class="message">
        ${student.firstName} ${student.lastName} has requested you to complete a comprehensive reference form for their qualification application with ${branding.name} RTO.
      </div>
      
      <div class="info-box">
        <h3>Combined Reference Request</h3>
        <p><strong>Student:</strong> ${student.firstName} ${student.lastName}</p>
        <p><strong>Form:</strong> ${formTemplate.name}</p>
        <p><strong>Your Roles:</strong> Employer Reference & Professional Reference</p>
        <p><strong>Estimated Time:</strong> 8-12 minutes</p>
      </div>

      <div class="message">
        Since you've been listed as both the employer and professional reference, we've created one comprehensive form that covers both aspects. Your assessment will help us evaluate ${student.firstName}'s qualifications from both perspectives.
      </div>

      <a href="${formUrl}" class="button">Complete Combined Reference Form</a>

      <div class="message">
        This secure link will expire in 30 days. All responses are confidential and will be used solely for qualification assessment purposes.
      </div>
    `;

    const htmlContent = this.generateEmailTemplate(content, "Combined Reference Request");
    return this.sendEmail(
      email,
      `Reference Request for ${student.firstName} ${student.lastName}`,
      htmlContent
    );
  }

  // TPR verification email
  async sendTPRVerificationEmail(to, ctx) {
    const { recipientName, studentName, qualificationName, rtoNumber, token, shortCode } = ctx;
    const branding = this.getRTOBranding();
    const refCode = `TPR-${shortCode || token}`; // prefer short code in visible markers
    const subject = `Employer Verification Request`;

    // Build a unique reply-to alias using plus-addressing from SMTP_USER by default
    let replyTo;
    try {
      const base = (process.env.SMTP_USER || '').split('@');
      if (base.length === 2) {
        const local = base[0];
        const domain = base[1];
        replyTo = `${local}+tpr-${token}@${domain}`;
      }
    } catch (_) {}

    const content = `
    <div class="message">Dear ${recipientName},</div>

    <div class="message">I hope this message finds you well.</div>

    <div class="message">
      I am contacting you on behalf of <strong>${rtoNumber}</strong> regarding <strong>${studentName}</strong>${qualificationName ? `, who has applied for <strong>${qualificationName}</strong> Qualification.` : '.'}
    </div>

    <div class="message">
      As part of our standard verification process, we would appreciate it if you could kindly confirm the following details regarding their employment:
    </div>

    <div class="info-box">
      <p><strong>Position Title:</strong></p>
      <p><strong>Employment Period (Start–End):</strong></p>
      <p><strong>Employment Type:</strong> Full-time / Part-time / Casual</p>
      <p><strong>Key duties and responsibilities:</strong></p>
    </div>

    <div class="message">
      Please reply to this email with the above details. If you prefer to discuss over the phone, contact us on <a href="mailto:${branding.supportEmail || 'support@certified.io'}">${branding.supportEmail || 'support@certified.io'}</a>.
    </div>

    <div class="message" style="margin-top: 12px;">
      Your cooperation is greatly appreciated and will assist us in accurately assessing their eligibility.
    </div>

    <div class="message" style="margin-top: 12px;">
      Warm Regards,<br/>
      Student Support Officer
    </div>
    <div style="display:none;color:#ffffff;font-size:1px;line-height:1px">${refCode}</div>`;

    const html = this.generateEmailTemplate(content, 'Employer Verification Request');

    // Send using transporter directly to set Reply-To
    const mailOptions = {
      from: `"${branding.name || 'Certified Australia'}" <${process.env.SMTP_USER}>`,
      to,
      subject: shortCode ? `Employer Verification Request (Ref: ${shortCode})` : subject,
      html,
      headers: replyTo ? { 'Reply-To': replyTo, 'X-TPR-Ref': refCode } : { 'X-TPR-Ref': refCode },
    };
    const result = await this.transporter.sendMail(mailOptions);
    return { subject, html, messageId: result && result.messageId };
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
  sendCertificateDownloadEmail: (user, application, certificateDetails) => defaultEmailService.sendCertificateDownloadEmail(user, application, certificateDetails),
  sendThirdPartyEmployerEmail: (employerEmail, employerName, student, formTemplate, formUrl) => defaultEmailService.sendThirdPartyEmployerEmail(employerEmail, employerName, student, formTemplate, formUrl),
  sendThirdPartyReferenceEmail: (referenceEmail, referenceName, student, formTemplate, formUrl) => defaultEmailService.sendThirdPartyReferenceEmail(referenceEmail, referenceName, student, formTemplate, formUrl),
  sendThirdPartyCombinedEmail: (email, employerName, referenceName, student, formTemplate, formUrl) => defaultEmailService.sendThirdPartyCombinedEmail(email, employerName, referenceName, student, formTemplate, formUrl),
  sendTPRVerificationEmail: (recipientEmail, data) => defaultEmailService.sendTPRVerificationEmail(recipientEmail, data)
};
