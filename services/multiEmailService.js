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

  // Get RTO email configuration
  async getRTOEmailConfig(rtoId) {
    try {
      const emailConfig = await EmailConfig.findOne({
        rtoId: rtoId,
        isActive: true,
      });

      if (!emailConfig) {
        logme.info(`No email config found for RTO ${rtoId}, using system fallback`);
        return null;
      }

      // Check if configuration is tested and working
      if (emailConfig.testStatus !== "success") {
        logme.warn(`Email config for RTO ${rtoId} not tested or failed, using system fallback`);
        return null;
      }

      return emailConfig;
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
      
      switch (emailConfig.emailProvider) {
        case "gmail":
          transporterConfig = {
            service: "gmail",
            auth: {
              user: emailConfig.email,
              pass: emailConfig.getPassword(),
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
              pass: emailConfig.getPassword(),
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
              pass: emailConfig.getPassword(),
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
      if (!isSystem && emailConfig) {
        emailConfig.emailsSent += 1;
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
      if (!isSystem && emailConfig) {
        emailConfig.emailsSent += 1;
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
}

module.exports = new MultiEmailService(); 