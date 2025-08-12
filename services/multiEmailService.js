// services/multiEmailService.js
const nodemailer = require("nodemailer");
const EmailConfig = require("../models/emailConfig");
const logme = require("../utils/logger");

class MultiEmailService {
  constructor() {
    // System fallback transporter (current implementation)
    this.systemTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }

  // Get RTO email configuration from RTO model
  async getRTOEmailConfig(rtoId) {
    try {
      const RTO = require("../models/rto");
      
      // First try to get from RTO model (new approach)
      const rto = await RTO.findById(rtoId).select('+emailConfig.appPassword');
      
      if (rto && rto.emailConfig && rto.emailConfig.isEmailConfigured) {
        // Check if email configuration is tested and working
        if (rto.emailConfig.emailTestStatus === "success") {
          return {
            emailProvider: rto.emailConfig.emailProvider,
            email: rto.emailConfig.email,
            password: rto.emailConfig.appPassword,
            smtpHost: rto.emailConfig.smtpHost,
            smtpPort: rto.emailConfig.smtpPort,
            smtpSecure: rto.emailConfig.smtpSecure,
            isActive: true,
            testStatus: rto.emailConfig.emailTestStatus,
            source: 'rto_model'
          };
        } else {
          logme.warn(`RTO ${rtoId} email config not tested or failed, using system fallback`);
        }
      }
      
      // Fallback to old EmailConfig model
      const emailConfig = await EmailConfig.findOne({
        rtoId: rtoId,
        isActive: true,
      });

      if (emailConfig) {
        // Check if configuration is tested and working
        if (emailConfig.testStatus === "success") {
          return {
            ...emailConfig.toObject(),
            source: 'email_config_model'
          };
        } else {
          logme.warn(`Email config for RTO ${rtoId} not tested or failed, using system fallback`);
        }
      }

      logme.info(`No working email config found for RTO ${rtoId}, using system fallback`);
      return null;
    } catch (error) {
      logme.error("Error getting RTO email config:", error);
      return null;
    }
  }

  // Create transporter for RTO email configuration
  async createRTOTransporter(rtoId) {
    try {
      const emailConfig = await this.getRTOEmailConfig(rtoId);
      
      if (!emailConfig) {
        logme.info(`Using system fallback email for RTO ${rtoId}`);
        return {
          transporter: this.systemTransporter,
          from: process.env.GMAIL_USER,
          isSystem: true,
        };
      }

      let transporterConfig;
      // Support both EmailConfig mongoose doc (getPassword) and RTO model mapping (password)
      const resolvedPassword =
        emailConfig && typeof emailConfig.getPassword === "function"
          ? emailConfig.getPassword()
          : emailConfig?.password;
      
      switch (emailConfig.emailProvider) {
        case "gmail":
          transporterConfig = {
            service: "gmail",
            auth: {
              user: emailConfig.email,
              pass: resolvedPassword,
            },
          };
          break;
          
        case "outlook":
          transporterConfig = {
            host: "smtp-mail.outlook.com",
            port: 587,
            secure: false,
            auth: {
              user: emailConfig.email,
              pass: resolvedPassword,
            },
          };
          break;
          
        case "custom":
          transporterConfig = {
            host: emailConfig.smtpHost,
            port: emailConfig.smtpPort,
            secure: emailConfig.smtpSecure,
            auth: {
              user: emailConfig.email,
              pass: resolvedPassword,
            },
          };
          break;
          
        default:
          throw new Error(`Unsupported email provider: ${emailConfig.emailProvider}`);
      }

      const transporter = nodemailer.createTransport(transporterConfig);
      
      // Test connection before returning
      await transporter.verify();
      
      return {
        transporter,
        from: emailConfig.email,
        isSystem: false,
        emailConfig,
      };
      
    } catch (error) {
      logme.error(`Error creating RTO transporter for ${rtoId}:`, error);
      
      // Fallback to system email
      logme.info(`Falling back to system email for RTO ${rtoId}`);
      return {
        transporter: this.systemTransporter,
        from: process.env.GMAIL_USER,
        isSystem: true,
      };
    }
  }

  // Send email with RTO-specific configuration
  async sendEmail(rtoId, to, subject, html, options = {}) {
    try {
      const { transporter, from, isSystem, emailConfig } = await this.createRTOTransporter(rtoId);
      
      const mailOptions = {
        from: options.fromName ? `${options.fromName} <${from}>` : from,
        to,
        subject,
        html,
        ...options,
      };

      const result = await transporter.sendMail(mailOptions);
      
      // Update usage statistics if using RTO config
      if (!isSystem && emailConfig && typeof emailConfig.save === "function") {
        emailConfig.emailsSent = (emailConfig.emailsSent || 0) + 1;
        emailConfig.lastUsed = new Date();
        await emailConfig.save();
      }
      
      logme.info(`Email sent successfully to ${to} using ${isSystem ? 'system' : 'RTO'} email`);
      
      return {
        success: true,
        messageId: result.messageId,
        isSystem,
        rtoId,
      };
      
    } catch (error) {
      logme.error(`Error sending email to ${to}:`, error);
      
      // If RTO email failed, try system fallback
      if (rtoId) {
        logme.info(`Retrying with system email for ${to}`);
        return this.sendEmail(null, to, subject, html, options);
      }
      
      throw error;
    }
  }

  // Send email with RTO branding and configuration
  async sendBrandedEmail(rtoId, to, subject, content, branding = {}) {
    try {
      const { transporter, from, isSystem, emailConfig } = await this.createRTOTransporter(rtoId);
      
      // Create branded HTML
      const htmlContent = this.createBrandedHTML(content, branding, isSystem);
      
      const mailOptions = {
        from: branding.fromName ? `${branding.fromName} <${from}>` : from,
        to,
        subject,
        html: htmlContent,
      };

      const result = await transporter.sendMail(mailOptions);
      
      // Update usage statistics if using RTO config
      if (!isSystem && emailConfig && typeof emailConfig.save === "function") {
        emailConfig.emailsSent = (emailConfig.emailsSent || 0) + 1;
        emailConfig.lastUsed = new Date();
        await emailConfig.save();
      }
      
      logme.info(`Branded email sent successfully to ${to} using ${isSystem ? 'system' : 'RTO'} email`);
      
      return {
        success: true,
        messageId: result.messageId,
        isSystem,
        rtoId,
      };
      
    } catch (error) {
      logme.error(`Error sending branded email to ${to}:`, error);
      
      // If RTO email failed, try system fallback
      if (rtoId) {
        logme.info(`Retrying branded email with system email for ${to}`);
        return this.sendBrandedEmail(null, to, subject, content, branding);
      }
      
      throw error;
    }
  }

  // Create branded HTML content
  createBrandedHTML(content, branding = {}, isSystem = false) {
    const defaultBranding = {
      primaryColor: "#007bff",
      secondaryColor: "#6c757d",
      logoUrl: null,
      companyName: "System",
    };

    const finalBranding = { ...defaultBranding, ...branding };
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email</title>
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
            background: linear-gradient(135deg, ${finalBranding.primaryColor} 0%, ${finalBranding.secondaryColor} 100%);
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
          .message {
            margin-bottom: 20px;
            line-height: 1.8;
          }
          .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #666;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            ${finalBranding.logoUrl ? `<img src="${finalBranding.logoUrl}" alt="Logo" class="logo">` : ''}
            <h1 class="company-name">${finalBranding.companyName}</h1>
          </div>
          <div class="content">
            <div class="message">
              ${content}
            </div>
          </div>
          <div class="footer">
            <p>This email was sent from ${finalBranding.companyName}</p>
            ${isSystem ? '<p><small>Sent via system email service</small></p>' : ''}
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Test RTO email configuration
  async testRTOEmailConfig(rtoId) {
    try {
      const emailConfig = await EmailConfig.findOne({ rtoId: rtoId });
      
      if (!emailConfig) {
        throw new Error("Email configuration not found");
      }
      
      return await emailConfig.testConnection();
      
    } catch (error) {
      logme.error(`Error testing email config for RTO ${rtoId}:`, error);
      throw error;
    }
  }

  // Get email configuration status for RTO
  async getEmailConfigStatus(rtoId) {
    try {
      const emailConfig = await EmailConfig.findOne({ rtoId: rtoId });
      
      if (!emailConfig) {
        return {
          hasConfig: false,
          status: "not_configured",
          message: "No email configuration found",
        };
      }
      
      return {
        hasConfig: true,
        status: emailConfig.testStatus,
        isActive: emailConfig.isActive,
        emailProvider: emailConfig.emailProvider,
        email: emailConfig.email,
        lastTested: emailConfig.lastTested,
        testError: emailConfig.testError,
        emailsSent: emailConfig.emailsSent,
        lastUsed: emailConfig.lastUsed,
      };
      
    } catch (error) {
      logme.error(`Error getting email config status for RTO ${rtoId}:`, error);
      throw error;
    }
  }

  // Test email credentials before saving to RTO
  async testEmailCredentials(credentials) {
    // Extract variables at the top to ensure they're always available
    const { emailProvider, email, password, smtpHost, smtpPort, smtpSecure } = credentials;
    
    try {
      // Validate required fields first
      if (!emailProvider || !email || !password) {
        throw new Error('Email provider, email, and password are required');
      }
      
      // Validate email provider
      if (!['gmail', 'outlook', 'custom'].includes(emailProvider)) {
        throw new Error(`Unsupported email provider: ${emailProvider}`);
      }
      
      // Validate custom SMTP fields
      if (emailProvider === 'custom' && (!smtpHost || !smtpPort)) {
        throw new Error('SMTP host and port are required for custom provider');
      }
      
      let transporterConfig;
      
      switch (emailProvider) {
        case "gmail":
          transporterConfig = {
            service: "gmail",
            auth: { user: email, pass: password },
            // Add timeouts for faster validation
            connectionTimeout: 2000,    // 2 seconds
            greetingTimeout: 2000,      // 2 seconds
            socketTimeout: 2000,        // 2 seconds
            commandTimeout: 2000,       // 2 seconds
            // Add these for faster connection
            tls: { rejectUnauthorized: false },
            requireTLS: false,
            secure: false
          };
          break;
          
        case "outlook":
          transporterConfig = {
            host: "smtp-mail.outlook.com",
            port: 587,
            secure: false,
            auth: { user: email, pass: password },
            // Add timeouts for faster validation
            connectionTimeout: 2000,
            greetingTimeout: 2000,
            socketTimeout: 2000,
            commandTimeout: 2000,
            // Add these for faster connection
            tls: { rejectUnauthorized: false },
            requireTLS: false
          };
          break;
          
        case "custom":
          transporterConfig = {
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            auth: { user: email, pass: password },
            // Add timeouts for faster validation
            connectionTimeout: 2000,
            greetingTimeout: 2000,
            socketTimeout: 2000,
            commandTimeout: 2000,
            // Add these for faster connection
            tls: { rejectUnauthorized: false },
            requireTLS: false
          };
          break;
      }

      const transporter = nodemailer.createTransport(transporterConfig);
      
      // ONLY test connection - don't send email (much faster)
      await transporter.verify();
      
      logme.info("Email credentials validation successful", {
        emailProvider,
        email
      });

      return {
        success: true,
        message: "Email credentials validated successfully",
        messageId: null // No email sent
      };

    } catch (error) {
      logme.error("Email credentials validation failed", {
        emailProvider: emailProvider || 'unknown',
        email: email || 'unknown',
        error: error.message
      });

      return {
        success: false,
        message: `Validation failed: ${error.message}`
      };
    }
  }

  // Test RTO email configuration by sending a test email
  async testRTOEmail(rtoId, testEmail) {
    try {
      const emailConfig = await this.getRTOEmailConfig(rtoId);
      
      if (!emailConfig) {
        return {
          success: false,
          message: "No email configuration found for this RTO"
        };
      }

      const transporterInfo = await this.createRTOTransporter(rtoId);
      
      if (transporterInfo.isSystem) {
        return {
          success: false,
          message: "Using system fallback email - RTO email not configured properly"
        };
      }

      // Send test email
      const testResult = await transporterInfo.transporter.sendMail({
        from: transporterInfo.from,
        to: testEmail,
        subject: "RTO Email Configuration Test",
        html: `
          <h2>Email Configuration Test</h2>
          <p>This is a test email to verify that your RTO email configuration is working correctly.</p>
          <p><strong>From:</strong> ${transporterInfo.from}</p>
          <p><strong>Provider:</strong> ${emailConfig.emailProvider}</p>
          <p><strong>Sent at:</strong> ${new Date().toLocaleString()}</p>
          <hr>
          <p><em>If you received this email, your RTO email configuration is working properly!</em></p>
        `
      });

      logme.info("Test email sent successfully", {
        rtoId,
        testEmail,
        messageId: testResult.messageId,
        emailConfig: emailConfig.source
      });

      return {
        success: true,
        message: "Test email sent successfully",
        messageId: testResult.messageId
      };

    } catch (error) {
      logme.error("Test email failed", {
        rtoId,
        testEmail,
        error: error.message
      });

      return {
        success: false,
        message: `Test email failed: ${error.message}`
      };
    }
  }
}

module.exports = new MultiEmailService(); 