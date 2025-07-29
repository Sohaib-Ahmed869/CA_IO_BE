// services/rtoEmailService.js
const RTO = require("../models/rto");
const emailService = require("./emailService");

class RTOEmailService {
  async sendRTOTemplateEmail(rtoId, templateName, toEmail, variables = {}) {
    const rto = await RTO.findById(rtoId);
    if (!rto) throw new Error("RTO not found");
    const processed = rto.processEmailTemplate(templateName, variables);
    if (!processed) throw new Error("Template not found or inactive");
    return emailService.sendEmail({
      to: toEmail,
      subject: processed.subject,
      html: processed.body,
      from: processed.from,
      fromName: processed.fromName,
    });
  }
}

module.exports = new RTOEmailService(); 