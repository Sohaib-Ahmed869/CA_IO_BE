// services/emailService.js
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs").promises;
const RTO = require("../models/rto");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// Clean, reusable email template
const emailTemplate = ({ title, finalBranding, content }) => `
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
      color: ${finalBranding.primaryColor};
      margin-bottom: 20px;
    }
    .message {
      margin-bottom: 20px;
      line-height: 1.8;
    }
    .info-box {
      background-color: #f8f9fa;
      border-left: 4px solid ${finalBranding.primaryColor};
      padding: 20px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .info-box h3 {
      margin-top: 0;
      color: ${finalBranding.primaryColor};
    }
    .button {
      display: inline-block;
      background-color: ${finalBranding.primaryColor};
      color: white;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 6px;
      font-weight: bold;
      margin: 20px 0;
      transition: background-color 0.3s ease;
    }
    .button:hover {
      background-color: ${finalBranding.secondaryColor};
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
      ${finalBranding.logoUrl ? `<img src="${finalBranding.logoUrl}" alt="${finalBranding.companyName}" class="logo">` : ''}
      <h1 class="company-name">${finalBranding.companyName}</h1>
    </div>

    <div class="content">
      ${content}
    </div>

    <div class="footer">
      <p class="footer-text">
        This email was sent by ${finalBranding.companyName}<br>
        Powered by Certified.IO
      </p>
    </div>
  </div>
</body>
</html>
`;

// Enhanced email service with automatic RTO branding
class EmailService2 {
  // Get RTO branding data
  async getRTOBranding(rtoId) {
    if (!rtoId) return null;
    
    try {
      const rto = await RTO.findById(rtoId);
      if (!rto) {
        console.error(`RTO not found for ID: ${rtoId}`);
        return null;
      }

      // Debug logging to help identify issues
      console.log(`RTO Branding for ${rtoId}:`, {
        companyName: rto.companyName,
        logoUrl: rto.assets?.logo?.url,
        primaryColor: rto.primaryColor,
        secondaryColor: rto.secondaryColor
      });

      // Provide fallback values to prevent undefined in emails
      return {
        companyName: rto.companyName || 'Certified Training Organization',
        ceoName: rto.ceoName || 'CEO',
        ceoCode: rto.ceoCode || 'CEO',
        rtoNumber: rto.rtoNumber || 'RTO',
        companyEmail: rto.email || 'support@certified.io',
        companyPhone: rto.phone || 'Contact Support',
        companyAddress: this.formatAddress(rto.address) || 'Contact Support',
        logoUrl: rto.assets?.logo?.url || null,
        primaryColor: rto.primaryColor || '#007bff',
        secondaryColor: rto.secondaryColor || '#6c757d',
        subdomain: rto.subdomain || 'certified',
      };
    } catch (error) {
      console.error("Error getting RTO branding:", error);
      return null;
    }
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
      console.log('No branding provided to replaceRTOVariables, using fallback values');
      // Use fallback values if no branding is provided
      const fallbackBranding = {
        companyName: 'Certified Training Organization',
        ceoName: 'CEO',
        ceoCode: 'CEO',
        rtoNumber: 'RTO',
        companyEmail: 'support@certified.io',
        companyPhone: 'Contact Support',
        companyAddress: 'Contact Support',
      };
      return this.replaceRTOVariables(content, fallbackBranding);
    }
    
    console.log('Replacing RTO variables with branding:', {
      companyName: branding.companyName,
      ceoName: branding.ceoName,
      rtoNumber: branding.rtoNumber,
      companyEmail: branding.companyEmail,
      companyPhone: branding.companyPhone
    });
    
    let processed = content;
    
    // Replace {variableName} with actual values, ensuring no undefined values
    Object.keys(branding).forEach(key => {
      const regex = new RegExp(`{${key}}`, 'gi');
      const value = branding[key];
      console.log(`Replacing {${key}} with:`, value);
      // Only replace if value is not null/undefined and not empty string
      if (value !== null && value !== undefined && value !== '') {
        processed = processed.replace(regex, value);
      } else {
        // Remove the placeholder entirely if no value is available
        processed = processed.replace(regex, '');
      }
    });

    // Replace RTO URL placeholders
    if (branding && branding.subdomain) {
      let rtoUrl;
      if (process.env.NODE_ENV === 'development') {
        rtoUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/${branding.subdomain}`;
      } else {
        rtoUrl = `${process.env.FRONTEND_URL || 'https://certified.io'}/${branding.subdomain}`;
      }
      processed = processed.replace(/{RTO_URL}/g, rtoUrl);
    }

    // Replace generic frontend URL
    const rtoUrlRegex = /{FRONTEND_URL}/g;
    processed = processed.replace(rtoUrlRegex, process.env.FRONTEND_URL || 'https://certified.io');

    console.log('Processed content length:', processed.length);
    return processed;
  }

  // Create branded email HTML using clean template
  createBrandedEmail(content, branding, title = "Email") {
    // Always use branded template, even if no branding is provided
    const fallbackBranding = {
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

    const finalBranding = branding || fallbackBranding;

    console.log('Creating branded email with:', {
      companyName: finalBranding.companyName,
      logoUrl: finalBranding.logoUrl,
      primaryColor: finalBranding.primaryColor,
      secondaryColor: finalBranding.secondaryColor
    });

    return emailTemplate({ title, finalBranding, content });
  }

  // Debug function to test RTO branding
  async debugRTOBranding(rtoId) {
    console.log(`Debugging RTO branding for ID: ${rtoId}`);
    const branding = await this.getRTOBranding(rtoId);
    console.log('Retrieved branding:', branding);
    return branding;
  }

  // Enhanced sendEmail with automatic RTO branding
  async sendEmail(to, subject, content, rtoId = null) {
    try {
      // Get RTO branding if rtoId is provided
      const branding = rtoId ? await this.getRTOBranding(rtoId) : null;
      
      // Debug logging for email sending
      if (rtoId) {
        console.log(`Sending email with RTO ID: ${rtoId}`);
        console.log('Branding data:', branding);
        console.log('Original subject:', subject);
        console.log('Original content:', content);
      }
      
      // Replace RTO variables in subject and content
      const processedSubject = branding ? this.replaceRTOVariables(subject, branding) : subject;
      const processedContent = branding ? this.replaceRTOVariables(content, branding) : content;
      
      console.log('Processed subject:', processedSubject);
      console.log('Processed content length:', processedContent.length);
      
      // Create branded HTML - only do this once
      const htmlContent = this.createBrandedEmail(processedContent, branding, processedSubject);
      
      // Set from address based on branding
      let fromAddress = process.env.GMAIL_USER;
      if (branding && branding.companyName) {
        fromAddress = `${branding.companyName} <${process.env.GMAIL_USER}>`;
      }
      
      const mailOptions = {
        from: fromAddress,
        to,
        subject: processedSubject,
        html: htmlContent,
      };

      return await transporter.sendMail(mailOptions);
    } catch (error) {
      console.error("Error sending email:", error);
      throw error;
    }
  }



  // Enhanced email methods with RTO support
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

      <a href="{rtoUrl}/dashboard" class="button">View Application Status</a>
    `;

    return this.sendEmail(user.email, "Payment Confirmation - {companyName}", content, rtoId);
  }

  async sendAssessorAssignedEmail(user, application, assessor, rtoId = null) {
    const content = `
      <div class="greeting">Assessor Assigned, ${user.firstName}!</div>
      <div class="message">
        An assessor has been assigned to your application by {companyName}.
      </div>
      
      <div class="info-box">
        <h3>Assessment Details</h3>
        <p><strong>Assessor:</strong> ${assessor.firstName} ${assessor.lastName}</p>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Status:</strong> Under Assessment</p>
      </div>

      <div class="message">
        Your assessor will review your application and may contact you if additional information is needed.
      </div>
    `;

    return this.sendEmail(user.email, "Assessor Assigned - {companyName}", content, rtoId);
  }

  async sendAssessmentCompletionEmail(user, application, assessor, rtoId = null) {
    const content = `
      <div class="greeting">Assessment Completed, ${user.firstName}!</div>
      <div class="message">
        Your assessment has been completed successfully by {companyName}.
      </div>
      
      <div class="info-box">
        <h3>Assessment Details</h3>
        <p><strong>Assessor:</strong> ${assessor.firstName} ${assessor.lastName}</p>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Status:</strong> Completed</p>
      </div>

      <div class="message">
        Your certificate will be issued shortly. You'll receive a notification when it's ready.
      </div>
    `;

    return this.sendEmail(user.email, "Assessment Completed - {companyName}", content, rtoId);
  }

  async sendCertificateReadyEmail(user, application, certificateUrl, rtoId = null) {
    const content = `
      <div class="greeting">Certificate Ready, ${user.firstName}!</div>
      <div class="message">
        Congratulations! Your certificate has been issued by {companyName} and is ready for download.
      </div>
      
      <div class="info-box">
        <h3>Certificate Details</h3>
        <p><strong>Student:</strong> ${user.firstName} ${user.lastName}</p>
        <p><strong>Qualification:</strong> ${application.certificationName}</p>
        <p><strong>Issue Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Certificate ID:</strong> ${application._id}</p>
      </div>

      <div class="message">
        You can download your certificate from your dashboard or click the button below.
      </div>

      <a href="${certificateUrl}" class="button">Download Certificate</a>
    `;

    return this.sendEmail(user.email, "Certificate Ready - {companyName}", content, rtoId);
  }

  // Add more email methods with RTO support...
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
        <p><strong>Certification:</strong> ${application.certificationName}</p>
        <p><strong>Submitted:</strong> ${new Date().toLocaleDateString()}</p>
      </div>

      <a href="{rtoUrl}/dashboard" class="button">Review Application</a>
    `;

    return this.sendEmail(adminEmail, "New Application Received - {companyName}", content, rtoId);
  }

  async sendPaymentReceivedNotificationToAdmin(adminEmail, user, payment, rtoId = null) {
    const content = `
      <div class="greeting">Payment Received</div>
      <div class="message">
        A payment has been received by {companyName}.
      </div>
      
      <div class="info-box">
        <h3>Payment Details</h3>
        <p><strong>Student:</strong> ${user.firstName} ${user.lastName}</p>
        <p><strong>Amount:</strong> $${payment.totalAmount}</p>
        <p><strong>Payment ID:</strong> ${payment._id}</p>
        <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
      </div>
    `;

    return this.sendEmail(adminEmail, "Payment Received - {companyName}", content, rtoId);
  }

  async sendAssessmentReadyNotificationToAssessor(assessor, application, user, rtoId = null) {
    const content = `
      <div class="greeting">New Assessment Assignment</div>
      <div class="message">
        You have been assigned a new application for assessment by {companyName}.
      </div>
      
      <div class="info-box">
        <h3>Application Details</h3>
        <p><strong>Student:</strong> ${user.firstName} ${user.lastName}</p>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Certification:</strong> ${application.certificationName}</p>
      </div>

      <a href="{rtoUrl}/dashboard" class="button">Review Application</a>
    `;

    return this.sendEmail(assessor.email, "New Assessment Assignment - {companyName}", content, rtoId);
  }

  async sendFormSubmissionEmail(user, application, formName, rtoId = null) {
    const content = `
      <div class="greeting">Form Submitted, ${user.firstName}!</div>
      <div class="message">
        Your ${formName} has been submitted successfully to {companyName}.
      </div>
      
      <div class="info-box">
        <h3>Submission Details</h3>
        <p><strong>Form:</strong> ${formName}</p>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Submitted:</strong> ${new Date().toLocaleDateString()}</p>
      </div>

      <div class="message">
        Your form is now under review. You'll receive updates on its status.
      </div>
    `;

    return this.sendEmail(user.email, "Form Submitted - {companyName}", content, rtoId);
  }

  async sendFormResubmissionRequiredEmail(user, application, formName, feedback, rtoId = null) {
    const content = `
      <div class="greeting">Form Resubmission Required, ${user.firstName}</div>
      <div class="message">
        Your ${formName} requires some changes before it can be approved by {companyName}.
      </div>
      
      <div class="info-box">
        <h3>Feedback</h3>
        <p>${feedback}</p>
      </div>

      <div class="message">
        Please review the feedback and resubmit your form with the required changes.
      </div>

      <a href="{rtoUrl}/dashboard" class="button">Resubmit Form</a>
    `;

    return this.sendEmail(user.email, "Form Resubmission Required - {companyName}", content, rtoId);
  }

  // Application rejection email
  async sendApplicationRejectionEmail(user, application, rejectionReason, assessor, rtoId = null) {
    const content = `
      <div class="greeting">Application Update, ${user.firstName}</div>
      <div class="message">
        We regret to inform you that your application has been rejected by {companyName}.
      </div>
      
      <div class="info-box">
        <h3>Rejection Details</h3>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Assessed By:</strong> ${assessor.firstName} ${assessor.lastName}</p>
        <p><strong>Reason:</strong> ${rejectionReason}</p>
      </div>

      <div class="message">
        If you believe this decision was made in error, please contact our support team for assistance.
      </div>

      <a href="{rtoUrl}/support" class="button">Contact Support</a>
    `;

    return this.sendEmail(user.email, "Application Rejected - {companyName}", content, rtoId);
  }

  // Application resubmission required email
  async sendApplicationResubmissionEmail(user, application, resubmissionReason, assessor, rtoId = null) {
    const content = `
      <div class="greeting">Application Resubmission Required, ${user.firstName}</div>
      <div class="message">
        Your application requires additional information before it can proceed with {companyName}.
      </div>
      
      <div class="info-box">
        <h3>Resubmission Required</h3>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Assessed By:</strong> ${assessor.firstName} ${assessor.lastName}</p>
        <p><strong>Reason:</strong> ${resubmissionReason}</p>
      </div>

      <div class="message">
        Please review the requirements and resubmit your application with the additional information.
      </div>

      <a href="{rtoUrl}/dashboard" class="button">Resubmit Application</a>
    `;

    return this.sendEmail(user.email, "Application Resubmission Required - {companyName}", content, rtoId);
  }

  async sendInstallmentPaymentEmail(user, application, payment, installmentAmount, rtoId = null) {
    const content = `
      <div class="greeting">Installment Payment Received, ${user.firstName}!</div>
      <div class="message">
        Your installment payment has been processed successfully by {companyName}.
      </div>
      
      <div class="info-box">
        <h3>Payment Details</h3>
        <p><strong>Amount:</strong> $${installmentAmount}</p>
        <p><strong>Payment ID:</strong> ${payment._id}</p>
        <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
      </div>

      <div class="message">
        Thank you for staying current with your payment plan.
      </div>
    `;

    return this.sendEmail(user.email, "Installment Payment Received - {companyName}", content, rtoId);
  }

  // 11. Third-party employer email
  async sendThirdPartyEmployerEmail(
    employerEmail,
    employerName,
    student,
    formTemplate,
    formUrl,
    rtoId = null
  ) {
    const content = `
    <div class="greeting">Dear ${employerName},</div>
    <div class="message">
      ${student.firstName} ${student.lastName} has requested you to complete a reference form as their employer for their qualification application with {companyName} RTO.
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

    return this.sendEmail(
      employerEmail,
      `Reference Request for ${student.firstName} ${student.lastName}`,
      content,
      rtoId
    );
  }

  // 12. Third-party reference email
  async sendThirdPartyReferenceEmail(
    referenceEmail,
    referenceName,
    student,
    formTemplate,
    formUrl,
    rtoId = null
  ) {
    const content = `
    <div class="greeting">Dear ${referenceName},</div>
    <div class="message">
      ${student.firstName} ${student.lastName} has requested you to complete a professional reference form for their qualification application with {companyName}.
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

    return this.sendEmail(
      referenceEmail,
      `Reference Request for ${student.firstName} ${student.lastName}`,
      content,
      rtoId
    );
  }

  // 13. Third-party combined email
  async sendThirdPartyCombinedEmail(
    email,
    employerName,
    referenceName,
    student,
    formTemplate,
    formUrl,
    rtoId = null
  ) {
    const content = `
    <div class="greeting">Dear ${employerName},</div>
    <div class="message">
      ${student.firstName} ${student.lastName} has requested you to complete a comprehensive reference form for their Qualification application with {companyName} RTO.
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
      This secure link will expire in 30 days. All responses are confidential and will be used solely for Qualification assessment purposes.
    </div>
  `;

    return this.sendEmail(
      email,
      `Reference Request for ${student.firstName} ${student.lastName}`,
      content,
      rtoId
    );
  }

  async sendCertificateDownloadEmail(user, application, certificateDetails, rtoId = null) {
    const content = `
    <div class="greeting">Congratulations, ${user.firstName}!</div>
    <div class="message">
      We are thrilled to inform you that your Qualification has been successfully completed and your official certificate is now ready for download!
    </div>
    
    <div class="info-box">
      <h3>Certificate Details</h3>
      
      <p><strong>Student Name:</strong> ${user.firstName} ${user.lastName}</p>
      <p><strong>Certificate ID:</strong> ${
        certificateDetails.certificateId || application.certificateId
      }</p>
      <p><strong>Issue Date:</strong> ${new Date(
        certificateDetails.issueDate || Date.now()
      ).toLocaleDateString()}</p>
      <p><strong>Valid Until:</strong> ${
        certificateDetails.expiryDate
          ? new Date(certificateDetails.expiryDate).toLocaleDateString()
          : "Lifetime"
      }</p>
    </div>

    <div class="message">
      Your digital certificate is now available for immediate download.
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${
        certificateDetails.downloadUrl ||
        "{rtoUrl}/certificates/download/" +
          certificateDetails.certificateId
      }" class="button" style="display: inline-block; padding: 16px 32px; font-size: 18px; font-weight: 600;">
        Download Your Certificate
      </a>
    </div>

    <div class="info-box" style="background-color: #fff8e1; border-left-color: #ffa726;">
      <h3>Important Information</h3>
      <p><strong>Certificate Format:</strong> High-quality PDF with security features</p>
      <p><strong>Download Access:</strong> Available anytime from your dashboard</p>
    </div>

    <div class="message">
      This achievement represents your dedication and hard work. We're proud to have been part of your professional development journey and look forward to supporting your continued success.
    </div>
  `;

    return this.sendEmail(
      user.email,
      `Certificate Ready - Download Now!`,
      content,
      rtoId
    );
  }

  // 15. Certificate verification email (for employers/third parties)
  async sendCertificateVerificationEmail(
    verifierEmail,
    certificateDetails,
    student,
    rtoId = null
  ) {
    const content = `
    <div class="greeting">Certificate Verification</div>
    <div class="message">
      This email confirms the authenticity of a certificate issued by {companyName} RTO.
    </div>
    
    <div class="info-box">
      <h3>✅ Verified Certificate Details</h3>
      <p><strong>Student Name:</strong> ${student.firstName} ${
      student.lastName
    }</p>
     
      <p><strong>Certificate ID:</strong> ${
        certificateDetails.certificateId
      }</p>
      <p><strong>Issue Date:</strong> ${new Date(
        certificateDetails.issueDate
      ).toLocaleDateString()}</p>
      <p><strong>Status:</strong> ✅ Valid and Verified</p>
    </div>

    <div class="message">
      This certificate has been verified through our secure verification system. The holder has successfully completed all requirements for this Qualification.
    </div>

    <div style="background-color: #f0f8ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 0; font-weight: 600; color: #2d3748;">For additional verification:</p>
      <p style="margin: 10px 0 0 0; color: #4a5568;">
        Visit our verification portal at <a href="{rtoUrl}/verify" style="color: #667eea;">{rtoUrl}/verify</a> and enter Certificate ID: ${certificateDetails.certificateId}
      </p>
    </div>

    <div class="message">
      If you have any questions about this certificate or need additional information, please contact our support team.
    </div>
  `;

    return this.sendEmail(
      verifierEmail,
      `Certificate Verification - ${certificateDetails.certificationName}`,
      content,
      rtoId
    );
  }

  // 16. Bulk certificate notification for multiple students
  async sendBulkCertificateNotifications(studentsData) {
    const emailPromises = studentsData.map(
      ({ user, application, certificateDetails }) =>
        this.sendCertificateDownloadEmail(user, application, certificateDetails)
    );

    try {
      const results = await Promise.allSettled(emailPromises);
      const successful = results.filter(
        (result) => result.status === "fulfilled"
      ).length;
      const failed = results.filter(
        (result) => result.status === "rejected"
      ).length;

      console.log(
        `Bulk certificate emails sent: ${successful} successful, ${failed} failed`
      );
      return { successful, failed, results };
    } catch (error) {
      console.error("Error sending bulk certificate emails:", error);
      throw error;
    }
  }

  // 17. Certificate expiry reminder email
  async sendCertificateExpiryReminderEmail(
    user,
    certificateDetails,
    daysUntilExpiry
  ) {
    const content = `
    <div class="greeting">Certificate Expiry Reminder, ${user.firstName}</div>
    <div class="message">
      This is a friendly reminder that your Qualification will expire in ${daysUntilExpiry} days. Take action now to maintain your certified status.
    </div>
    
    <div class="info-box" style="background-color: #fff3cd; border-left-color: #ffc107;">
      <h3>⚠️ Expiring Certificate</h3>
      <p><strong>Qualification:</strong> ${
        certificateDetails.certificationName
      }</p>
      <p><strong>Certificate ID:</strong> ${
        certificateDetails.certificateId
      }</p>
      <p><strong>Expiry Date:</strong> ${new Date(
        certificateDetails.expiryDate
      ).toLocaleDateString()}</p>
      <p><strong>Days Remaining:</strong> ${daysUntilExpiry} days</p>
    </div>

    <div class="message">
      To maintain your Qualification status, you'll need to complete the renewal process. This ensures your qualifications remain current and valid.
    </div>

    <div style="text-align: center; margin: 25px 0;">
      <a href="{rtoUrl}/dashboard" class="button" style="background: linear-gradient(135deg, #ff9800 0%, #ffb74d 100%);">
        Renew Certificate Now
      </a>
    </div>

    <div class="message">
      Don't let your hard-earned Qualification expire! Start the renewal process today to avoid any interruption in your certified status.
    </div>
  `;

    return this.sendEmail(
      user.email,
      `Action Required: Certificate Expiring in ${daysUntilExpiry} Days`,
      content
    );
  }

  async sendDocumentSubmissionEmail(user, application, documentType, rtoId = null) {
    const content = `
    <div class="greeting">Documents Submitted Successfully, ${
      user.firstName
    }!</div>
    <div class="message">
      Thank you for submitting your ${documentType.toLowerCase()}. We have received your submission and it's now under review by your assigned assessor.
    </div>
    
    <div class="info-box">
      <h3>Submission Details</h3>
      <p><strong>Document Type:</strong> ${documentType}</p>
      <p><strong>Application ID:</strong> ${application._id}</p>
      <p><strong>Submitted:</strong> ${new Date().toLocaleDateString()}</p>
      <p><strong>Status:</strong> Under Review</p>
    </div>

    <div class="message">
      Your assessor will review the submitted documents and provide feedback. If any changes are required, you'll receive a notification with specific instructions.
    </div>

          <a href="{rtoUrl}/dashboard" class="button">Check Application Status</a>

    <div class="message">
      Continue working on any remaining requirements while these documents are being reviewed. This helps speed up your overall assessment process.
    </div>
  `;

    return this.sendEmail(
      user.email,
      `${documentType} Submitted Successfully`,
      content,
      rtoId
    );
  }

  // 19. Document verification result email (approved or rejected)
  async sendDocumentVerificationEmail(
    user,
    application,
    assessor,
    verificationStatus,
    rejectionReason = null,
    rtoId = null
  ) {
    let content;
    let emailSubject;
    let emailTitle;

    if (verificationStatus === "verified") {
      // Documents approved
      content = `
      <div class="greeting">Documents Verified, ${user.firstName}!</div>
      <div class="message">
        Excellent news! Your supporting documents have been reviewed and verified by your assessor. 
      </div>
      
      <div class="info-box" style="background-color: #f0fff4; border-left-color: #48bb78;">
        <h3>✅ Verification Complete</h3>
        <p><strong>Status:</strong> Approved</p>
        <p><strong>Verified by:</strong> ${assessor.firstName} ${
        assessor.lastName
      }</p>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
      </div>

      <div class="message">
        Your documents meet all the qualification requirements. Your application is now progressing to the final assessment stages.
      </div>

      <a href="{rtoUrl}/dashboard" class="button">View Application Progress</a>

      <div class="message">
        Well done! You're making excellent progress toward your qualification completion.
      </div>
    `;
      emailSubject = "✅ Documents Verified - Application Progressing!";
      emailTitle = "Documents Verified";
    } else {
      // Documents need changes
      content = `
      <div class="greeting">Document Review Complete, ${user.firstName}</div>
      <div class="message">
        Your assessor has reviewed your submitted documents and has requested some changes before they can be approved.
      </div>
      
      <div class="info-box" style="background-color: #fff8e1; border-left-color: #ffa726;">
        <h3>Changes Required</h3>
        <p><strong>Status:</strong> Resubmission Required</p>
        <p><strong>Reviewed by:</strong> ${assessor.firstName} ${
        assessor.lastName
      }</p>
        <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
      </div>

      ${
        rejectionReason
          ? `
      <div class="info-box" style="background-color: #fef2f2; border-left-color: #f56565;">
        <h3>📝 Assessor Feedback</h3>
        <p style="background: #f8f9fa; padding: 15px; border-radius: 4px; margin-top: 10px; line-height: 1.6;">
          ${rejectionReason}
        </p>
      </div>
      `
          : ""
      }

      <div class="message">
        Please review the feedback above and resubmit your documents with the requested changes. Your assessor will review the updated submission promptly.
      </div>

      <a href="{rtoUrl}/dashboard" class="button">Resubmit Documents</a>

      <div class="message">
        Don't worry - this is a normal part of the assessment process. The feedback is designed to help you meet the qualification requirements successfully.
      </div>
    `;
      emailSubject = "Action Required: Document Changes Needed";
      emailTitle = "Document Resubmission Required";
    }

    return this.sendEmail(user.email, emailSubject, content, rtoId);
  }

  async sendFormApprovalEmail(user, application, formName, assessor, rtoId = null) {
    const content = `
    <div class="greeting">Form Approved, ${user.firstName}!</div>
    <div class="message">
      Great news! Your ${formName} has been reviewed and approved by your assessor.
    </div>
    
    <div class="info-box" style="background-color: #f0fff4; border-left-color: #48bb78;">
      <h3>✅ Form Approved</h3>
      <p><strong>Form:</strong> ${formName}</p>
      <p><strong>Approved by:</strong> ${assessor.firstName} ${
      assessor.lastName
    }</p>
      <p><strong>Application ID:</strong> ${application._id}</p>
      <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
    </div>

    <div class="message">
      Your form meets all the qualification requirements. Your application is progressing well toward completion.
    </div>

          <a href="{rtoUrl}/dashboard" class="button">View Application Progress</a>

    <div class="message">
      Continue working on any remaining forms or requirements to complete your qualification process.
    </div>
  `;

    return this.sendEmail(
      user.email,
      `✅ ${formName} Approved - Well Done!`,
      content,
      rtoId
    );
  }

  // 1. ADD THIS NEW METHOD TO YOUR EmailService class (services/emailService.js)

  // 21. Enrollment confirmation email - formal notification
  async sendEnrollmentConfirmationEmail(user, application, certificationName, rtoId = null) {
    const currentDate = new Date().toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const content = `
    <div class="greeting">Dear ${user.firstName} ${user.lastName},</div>
    
    <div class="message">
      This is to notify that;
    </div>

    <div class="info-box" style="text-align: center; padding: 25px;">
      <h3 style="color: #2d3748; margin-bottom: 15px;">Confirmation of Enrolment</h3>
      <p style="font-size: 16px; color: #2d3748; margin: 5px 0;">
        <strong>${user.firstName} ${user.lastName}</strong> has been formally enrolled in
      </p>
      <p style="font-size: 18px; color: #000000ff; margin: 10px 0;">
        ${certificationName}
      </p>
      <p style="font-size: 16px; color: #2d3748; margin: 5px 0;">
        at <strong>{companyName} - RTO Code {rtoNumber}</strong>
      </p>
      <p style="font-size: 16px; color: #2d3748; margin: 5px 0;">
        on <strong>${currentDate}</strong>
      </p>
    </div>

    <div class="message">
      Please contact us, if you have any queries or need additional information. We can be contacted by phone at <strong>{companyPhone}</strong>
    </div>

    <div class="message">
      Thank you in advance for your cooperation and prompt attention to this matter.
    </div>

          <a href="{rtoUrl}/dashboard" class="button">View Your Enrolment Profile</a>

    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; color: #2d3748; font-weight: 600;">Sincerely,</p>
      <p style="margin: 10px 0 0 0; color: #2d3748; font-weight: 600;">
        {ceoName}<br>
        <span style="font-weight: 400; color: #4a5568;">CEO</span>
      </p>
    </div>
  `;

    return this.sendEmail(
      user.email,
      `Confirmation of Enrolment - ${certificationName}`,
      content,
      rtoId
    );
  }

  // 22. Installment payment confirmation email
  async sendInstallmentPaymentEmail(
    user,
    application,
    payment,
    installmentAmount
  ) {
    const remainingPayments =
      payment.paymentPlan.recurringPayments.totalPayments -
      payment.paymentPlan.recurringPayments.completedPayments;
    const remainingAmount = payment.remainingAmount;

    const content = `
    <div class="greeting">Installment Payment Received, ${user.firstName}!</div>
    <div class="message">
      Thank you! Your installment payment has been successfully processed. Your payment plan is progressing well.
    </div>
    
    <div class="info-box">
      <h3>Payment Details</h3>
      <p><strong>Installment Amount:</strong> $${installmentAmount}</p>
      <p><strong>Payment Type:</strong> Early Installment Payment</p>
      <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
      <p><strong>Remaining Balance:</strong> $${remainingAmount}</p>
      <p><strong>Remaining Payments:</strong> ${remainingPayments}</p>
    </div>

    <div class="message">
      Your payment plan is on track! You can continue with your scheduled payments or pay additional installments early anytime.
    </div>

          <a href="{rtoUrl}/dashboard" class="button">View Payment Progress</a>

    <div class="message">
      Thank you for staying current with your payment plan. This helps ensure smooth processing of your qualification.
    </div>
  `;

    return this.sendEmail(
      user.email,
      "Installment Payment Confirmed - Thank You!",
      content,
      rtoId
    );
  }
}

module.exports = new EmailService2();
