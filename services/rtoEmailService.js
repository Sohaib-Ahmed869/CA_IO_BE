// services/rtoEmailService.js
const RTO = require("../models/rto");
const logme = require("../utils/logger");
const emailService = require("./emailService");
const { rtoFilter } = require("../middleware/tenant");

class RTOEmailService {
  // Process email template with RTO-specific variables
  async processEmailTemplate(rtoId, templateName, variables = {}) {
    const rto = await RTO.findById(rtoId);
    if (!rto) throw new Error("RTO not found");

    // Get template from RTO settings
    const template = rto.emailTemplates[templateName];
    if (!template || !template.isActive) {
      throw new Error(`Template ${templateName} not found or inactive`);
    }

    // RTO-specific variables that can be used in templates
    const rtoVariables = {
      companyName: rto.companyName,
      ceoName: rto.ceoName,
      ceoCode: rto.ceoCode,
      rtoNumber: rto.rtoNumber,
      companyEmail: rto.email,
      companyPhone: rto.phone,
      companyAddress: this.formatAddress(rto.address),
      logoUrl: rto.assets?.logo?.url || null,
      primaryColor: rto.primaryColor,
      secondaryColor: rto.secondaryColor,
      subdomain: rto.subdomain,
      // Add more RTO-specific variables as needed
    };

    // Merge user variables with RTO variables
    const allVariables = { ...rtoVariables, ...variables };

    // Process template with variables
    const processedSubject = this.replaceVariables(template.subject, allVariables);
    const processedBody = this.replaceVariables(template.body, allVariables);

    return {
      subject: processedSubject,
      body: processedBody,
      from: rto.email,
      fromName: rto.companyName,
      rtoId: rto._id,
      logoUrl: rtoVariables.logoUrl,
      primaryColor: rtoVariables.primaryColor,
      secondaryColor: rtoVariables.secondaryColor,
    };
  }

  // Send email with RTO-specific branding
  async sendRTOTemplateEmail(rtoId, templateName, toEmail, variables = {}) {
    try {
      const processed = await this.processEmailTemplate(rtoId, templateName, variables);
      
      // Create HTML with RTO branding
      const htmlContent = this.createBrandedEmail(processed);
      
      return emailService.sendEmail(
        toEmail,
        processed.subject,
        htmlContent
      );
    } catch (error) {
      logme.error("Error sending RTO template email:", error);
      throw error;
    }
  }

  // Send email with custom content but RTO branding
  async sendRTOCustomEmail(rtoId, toEmail, subject, content, variables = {}) {
    try {
      const rto = await RTO.findById(rtoId);
      if (!rto) throw new Error("RTO not found");

      // Process content with RTO variables
      const rtoVariables = {
        companyName: rto.companyName,
        ceoName: rto.ceoName,
        ceoCode: rto.ceoCode,
        rtoNumber: rto.rtoNumber,
        companyEmail: rto.email,
        companyPhone: rto.phone,
        companyAddress: this.formatAddress(rto.address),
        logoUrl: rto.assets?.logo?.url || null,
        primaryColor: rto.primaryColor,
        secondaryColor: rto.secondaryColor,
        subdomain: rto.subdomain,
      };

      const allVariables = { ...rtoVariables, ...variables };
      const processedSubject = this.replaceVariables(subject, allVariables);
      const processedContent = this.replaceVariables(content, allVariables);

      const emailData = {
        subject: processedSubject,
        body: processedContent,
        from: rto.email,
        fromName: rto.companyName,
        rtoId: rto._id,
        logoUrl: rtoVariables.logoUrl,
        primaryColor: rtoVariables.primaryColor,
        secondaryColor: rtoVariables.secondaryColor,
      };

      const htmlContent = this.createBrandedEmail(emailData);
      
      return emailService.sendEmail(
        toEmail,
        emailData.subject,
        htmlContent
      );
    } catch (error) {
      logme.error("Error sending RTO custom email:", error);
      throw error;
    }
  }

  // Replace variables in template strings
  replaceVariables(template, variables) {
    let processed = template;
    
    // Replace {variableName} with actual values
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`{${key}}`, 'gi');
      processed = processed.replace(regex, variables[key] || '');
    });

    return processed;
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

  // Create branded email HTML
  createBrandedEmail(emailData) {
    const { body, logoUrl, primaryColor, secondaryColor, fromName } = emailData;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${emailData.subject}</title>
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
            background: linear-gradient(135deg, ${primaryColor || '#007bff'} 0%, ${secondaryColor || '#6c757d'} 100%);
            padding: 30px 20px;
            text-align: center;
            color: white;
          }
          .logo {
            max-height: 60px;
            max-width: 200px;
            margin-bottom: 15px;
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
            color: ${primaryColor || '#007bff'};
            margin-bottom: 20px;
          }
          .message {
            margin-bottom: 20px;
            line-height: 1.8;
          }
          .info-box {
            background-color: #f8f9fa;
            border-left: 4px solid ${primaryColor || '#007bff'};
            padding: 20px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .info-box h3 {
            margin-top: 0;
            color: ${primaryColor || '#007bff'};
          }
          .button {
            display: inline-block;
            background-color: ${primaryColor || '#007bff'};
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
            margin: 20px 0;
          }
          .button:hover {
            background-color: ${secondaryColor || '#6c757d'};
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
          .divider {
            height: 1px;
            background-color: #e9ecef;
            margin: 20px 0;
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
            ${logoUrl ? `<img src="${logoUrl}" alt="${fromName}" class="logo">` : ''}
            <h1 class="company-name">${fromName}</h1>
          </div>
          
          <div class="content">
            ${body}
          </div>
          
          <div class="footer">
            <p class="footer-text">
              This email was sent by ${fromName}<br>
              Powered by Certified.IO
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Get available email templates for an RTO
  async getRTOTemplates(rtoId) {
    const rto = await RTO.findById(rtoId);
    if (!rto) throw new Error("RTO not found");

    return rto.emailTemplates;
  }

  // Update email template for an RTO
  async updateRTOTemplate(rtoId, templateName, templateData) {
    const rto = await RTO.findById(rtoId);
    if (!rto) throw new Error("RTO not found");

    if (!rto.emailTemplates[templateName]) {
      throw new Error(`Template ${templateName} not found`);
    }

    // Update template
    rto.emailTemplates[templateName] = {
      ...rto.emailTemplates[templateName],
      ...templateData
    };

    await rto.save();
    return rto.emailTemplates[templateName];
  }

  // Test email template
  async testEmailTemplate(rtoId, templateName, testEmail, variables = {}) {
    return this.sendRTOTemplateEmail(rtoId, templateName, testEmail, variables);
  }
}

module.exports = new RTOEmailService(); 