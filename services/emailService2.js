// services/emailService.js
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs").promises;

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.zoho.com",
      port: process.env.SMTP_PORT || 587,
      secure: false, // Use STARTTLS
      auth: {
        user: process.env.ZOHO_USER || "admin@edwardbusinesscollege.edu.au",
        pass: process.env.ZOHO_APP_PASSWORD, // Use app-specific password from Zoho
      },
      // Additional Zoho-specific settings
      requireTLS: true,
      tls: {
        ciphers: "SSLv3",
      },
    });

    // Your logo URL hosted on S3
    this.logoUrl =
      process.env.LOGO_URL || "https://certified.io/images/ebclogo.png";
    this.baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    this.companyName = process.env.RTO_NAME || "Edward Business College";
    this.rtoCode = process.env.RTO_CODE || "45818";
    this.ceoName = process.env.CEO_NAME || "Wardi Roel Shamoon Botani";
    this.supportEmail =
      process.env.SUPPORT_EMAIL || "admin@edwardbusinesscollege.edu.au";
  }

  // Base email template
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
                color: #333333;
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
                background: linear-gradient(135deg, #b8626a 0%, #c64e50 100%);
                padding: 30px 40px;
                text-align: center;
            }
            .logo {
                max-width: 150px;
                height: auto;
                margin-bottom: 15px;
            }
            .header-title {
                color: #ffffff;
                font-size: 24px;
                font-weight: 600;
                margin: 0;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
            }
            .content {
                padding: 40px;
            }
            .greeting {
                font-size: 18px;
                font-weight: 600;
                color: #2d3748;
                margin-bottom: 20px;
            }
            .message {
                font-size: 16px;
                color: #4a5568;
                margin-bottom: 25px;
                line-height: 1.7;
            }
            .button {
                display: inline-block;
                padding: 14px 28px;
                background: linear-gradient(135deg, #b8626a 0%, #c64e50 100%);
                color: #ffffff;
                text-decoration: none;
                border-radius: 8px;
                font-weight: 600;
                font-size: 16px;
                text-align: center;
                margin: 20px 0;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                transition: transform 0.2s ease;
            }
             .button:visited {
                color: #ffffff !important;
                text-decoration: none !important;
            }
            .button:link {
                color: #ffffff !important;
                text-decoration: none !important;
            }
            .button:active {
                color: #ffffff !important;
                text-decoration: none !important;
            }
            .button:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
            }
            .info-box {
                background-color: #f7fafc;
                border-left: 4px solid #667eea;                padding: 20px;
                margin: 25px 0;
                border-radius: 4px;
            }
            .info-box h3 {
                margin: 0 0 10px 0;
                color: #2d3748;
                font-size: 16px;
                font-weight: 600;
            }
            .info-box p {
                margin: 5px 0;
                color: #4a5568;
                font-size: 14px;
            }
            .footer {
                background-color: #2d3748;
                color: #a0aec0;
                padding: 30px 40px;
                text-align: center;
                font-size: 14px;
            }
            .footer a {
                color:rgb(255, 255, 255);
                text-decoration: none;
            }
            .footer .company-name {
                color: #ffffff;
                font-weight: 600;
                font-size: 16px;
                margin-bottom: 10px;
            }
            .divider {
                height: 1px;
                background-color: #e2e8f0;
                margin: 30px 0;
            }
            @media only screen and (max-width: 600px) {
                .container {
                    margin: 10px;
                    border-radius: 8px;
                }
                .header,
                .content,
                .footer {
                    padding: 20px;
                }
                .header-title {
                    font-size: 20px;
                }
                .greeting {
                    font-size: 16px;
                }
                .message {
                    font-size: 14px;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="${this.logoUrl}" alt="${
      this.companyName
    }" class="logo">
                <h1 class="header-title">${title}</h1>
            </div>
            <div class="content">
                ${content}
            </div>
            <div class="footer">
                <div class="company-name">${this.companyName}</div>
                <p>This email was sent from an automated system. Please do not reply to this email.</p>
                <p>If you have any questions, contact us at <a href="mailto:${
                  this.supportEmail
                }">${this.supportEmail}</a></p>
                <p>&copy; ${new Date().getFullYear()} ${
      this.companyName
    }. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>`;
  }

  // Send email method
  async sendEmail(to, subject, htmlContent) {
    try {
      const mailOptions = {
        from: `"${this.companyName}" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html: htmlContent,
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log("Email sent successfully:", result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error("Error sending email:", error);
      throw error;
    }
  }

  // 1. Welcome email for new user registration
  async sendWelcomeEmail(user, certification) {
    const content = `
      <div class="greeting">Welcome, ${user.firstName}!</div>
      <div class="message">
        You have successfully submitted your application with ${this.companyName} RTO. We're excited to help you achieve your professional goals.
      </div>
      
      <div class="info-box">
        <h3>Your Application Details</h3>
        <p><strong>Qualification:</strong> ${certification.name}</p>
        <p><strong>Next Step:</strong> Complete your payment to proceed</p>
      </div>

      <div class="message">
       To get started, please log in to your account and complete the payment process. Once payment is confirmed, you'll be able to access your application dashboard and begin the qualification process.
      </div>

      <a href="${this.baseUrl}" class="button">Login to Your Account</a>

      <div class="message">
       If you have any questions or need assistance, our support team is here to help. We look forward to supporting you on your qualification journey!
      </div>

      <div class="divider"></div>
<div style="text-align: center; color: #64748b; font-size: 12px;">
  Powered by Certified.IO
</div>
    `;

    const htmlContent = this.getBaseTemplate(
      content,
      "Welcome to Your Qualification Journey"
    );
    return this.sendEmail(
      user.email,
      `Welcome to Your Qualification Journey - Let's Get Started!`,
      htmlContent
    );
  }

  // 2. Payment confirmation email
  async sendPaymentConfirmationEmail(user, application, payment) {
    const content = `
      <div class="greeting">Payment Confirmed, ${user.firstName}!</div>
      <div class="message">
        Great news! Your payment has been successfully processed. Your Qualification application is now active and you can proceed to the next steps.
      </div>
      
      <div class="info-box">
        <h3>Payment Details</h3>
        <p><strong>Amount Paid:</strong> $${payment.totalAmount}</p>
        <p><strong>Payment Method:</strong> ${
          payment.paymentType === "one_time"
            ? "One-time Payment"
            : "Payment Plan"
        }</p>
        <p><strong>Transaction ID:</strong> ${payment._id}</p>
        <p><strong>Date:</strong> ${new Date(
          payment.completedAt
        ).toLocaleDateString()}</p>
      </div>

      <div class="message">
        You can now access your application dashboard to complete the required forms and upload your supporting documents. An assessor will be assigned to your application shortly.
      </div>

      <a href="${this.baseUrl}" class="button">View Your Application</a>

      <div class="message">
        Keep this email for your records. If you need to make changes or have questions about your application, please contact our support team.
      </div>
    `;

    const htmlContent = this.getBaseTemplate(content, "Payment Confirmation");
    return this.sendEmail(
      user.email,
      "Payment Confirmed - Your Application is Active",
      htmlContent
    );
  }

  // 3. Assessor assignment notification (to user)
  async sendAssessorAssignedEmail(user, application, assessor) {
    const content = `
      <div class="greeting">Your Assessor Has Been Assigned, ${user.firstName}!</div>
      <div class="message">
        We're pleased to inform you that a qualified assessor has been assigned to review your Qualification application. They will guide you through the assessment process.
      </div>
      
      <div class="info-box">
        <h3>Your Assessor</h3>
        <p><strong>Name:</strong> ${assessor.firstName} ${assessor.lastName}</p>
        <p><strong>Specialization:</strong> ${application.certificationName}</p>
        <p><strong>Application ID:</strong> ${application._id}</p>
      </div>

      <div class="message">
        Your assessor will review your submitted forms and documents. They may contact you if additional information is needed. You can track the progress of your assessment in your dashboard.
      </div>

      <a href="${this.baseUrl}" class="button">View Application Status</a>

      <div class="message">
        If you have specific questions about the assessment process, you can reach out through your application dashboard or contact our support team.
      </div>
    `;

    const htmlContent = this.getBaseTemplate(content, "Assessor Assignment");
    return this.sendEmail(
      user.email,
      "Assessor Assigned to Your Application",
      htmlContent
    );
  }

  // 4. Form submission confirmation
  async sendFormSubmissionEmail(user, application, formName) {
    const content = `
      <div class="greeting">Form Submitted Successfully, ${
        user.firstName
      }!</div>
      <div class="message">
        Thank you for submitting your ${formName}. We have received your form and it's now under review by your assigned assessor.
      </div>
      
      <div class="info-box">
        <h3>Submission Details</h3>
        <p><strong>Form:</strong> ${formName}</p>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Submitted:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Status:</strong> Under Review</p>
      </div>

      <div class="message">
        Your assessor will review the submitted form and provide feedback. If any changes are required, you'll receive a notification with specific instructions.
      </div>

      <a href="${this.baseUrl}" class="button">Check Application Status</a>

      <div class="message">
        Continue working on any remaining forms or documents while this one is being reviewed. This helps speed up your overall assessment process.
      </div>
    `;

    const htmlContent = this.getBaseTemplate(
      content,
      "Form Submission Confirmation"
    );
    return this.sendEmail(
      user.email,
      `${formName} Submitted Successfully`,
      htmlContent
    );
  }

  // 5. Assessment completion notification
  async sendAssessmentCompletionEmail(user, application, assessor) {
    const content = `
      <div class="greeting">Assessment Complete, ${user.firstName}!</div>
      <div class="message">
        Congratulations! Your Qualification assessment has been completed successfully. Your application has been approved and you're now ready for certificate issuance.
      </div>
      
      <div class="info-box">
        <h3>Assessment Results</h3>
        <p><strong>Status:</strong> ✅ Approved</p>
        <p><strong>Assessed by:</strong> ${assessor.firstName} ${
      assessor.lastName
    }</p>
        <p><strong>Completion Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Next Step:</strong> Certificate Processing</p>
      </div>

      <div class="message">
        Your certificate is now being prepared and will be available for download shortly. You'll receive another notification once it's ready.
      </div>

      <a href="${this.baseUrl}" class="button">View Assessment Results</a>

      <div class="message">
        Thank you for choosing ${
          this.companyName
        } for your Qualification needs. We're proud to be part of your professional development journey!
      </div>
    `;

    const htmlContent = this.getBaseTemplate(content, "Assessment Complete");
    return this.sendEmail(
      user.email,
      "Assessment Complete - Certificate Coming Soon!",
      htmlContent
    );
  }

  // 6. Certificate ready notification
  async sendCertificateReadyEmail(user, application, certificateUrl) {
    const content = `
      <div class="greeting">Your Certificate is Ready, ${user.firstName}!</div>
      <div class="message">
        Congratulations! Your Qualification has been officially issued and is now available for download. This is a significant achievement in your professional journey.
      </div>
      
      <div class="info-box">
        <h3>Certificate Details</h3>
        <p><strong>Qualification:</strong> ${application.certificationName}</p>
        <p><strong>Issue Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Certificate ID:</strong> ${
          application.certificateId || "Available in dashboard"
        }</p>
      </div>

      <div class="message">
        Your digital certificate is now available for download. You can access it anytime from your dashboard and share it with employers or professional networks.
      </div>

      <a href="${
        certificateUrl || this.baseUrl
      }" class="button">Download Certificate</a>

      <div class="message">
        Keep your certificate in a safe place and remember to showcase your new qualification. We're proud of your achievement and look forward to supporting your continued professional growth.
      </div>
    `;

    const htmlContent = this.getBaseTemplate(content, "Certificate Ready");
    return this.sendEmail(
      user.email,
      "🏆 Your Certificate is Ready for Download!",
      htmlContent
    );
  }

  // Admin notification emails

  // 7. New application notification (to admin)
  async sendNewApplicationNotificationToAdmin(adminEmail, user, application) {
    const content = `
      <div class="greeting">New Application Received</div>
      <div class="message">
        A new Qualification application has been submitted and requires attention.
      </div>
      
      <div class="info-box">
        <h3>Application Details</h3>
        <p><strong>Student:</strong> ${user.firstName} ${user.lastName}</p>
        <p><strong>Email:</strong> ${user.email}</p>
        <p><strong>Qualification:</strong> ${application.certificationName}</p>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Status:</strong> ${application.overallStatus}</p>
        <p><strong>Submitted:</strong> ${new Date(
          application.createdAt
        ).toLocaleDateString()}</p>
      </div>

      <div class="message">
        Please review the application and assign an appropriate assessor when ready.
      </div>

      <a href="${this.baseUrl}" class="button">Review Application</a>
    `;

    const htmlContent = this.getBaseTemplate(
      content,
      "New Application - Admin Notification"
    );
    return this.sendEmail(
      adminEmail,
      "New Qualification Application Received",
      htmlContent
    );
  }

  // 8. Payment received notification (to admin)
  async sendPaymentReceivedNotificationToAdmin(adminEmail, user, payment) {
    const content = `
      <div class="greeting">Payment Received</div>
      <div class="message">
        A payment has been successfully processed for a Qualification application.
      </div>
      
      <div class="info-box">
        <h3>Payment Details</h3>
        <p><strong>Student:</strong> ${user.firstName} ${user.lastName}</p>
        <p><strong>Amount:</strong> $${payment.totalAmount}</p>
        <p><strong>Payment Type:</strong> ${payment.paymentType}</p>
        <p><strong>Transaction ID:</strong> ${payment._id}</p>
        <p><strong>Date:</strong> ${new Date(
          payment.completedAt
        ).toLocaleDateString()}</p>
      </div>

      <div class="message">
        The application is now active and ready for assessment assignment.
      </div>

      <a href="${this.baseUrl}" class="button">View Payment Details</a>
    `;

    const htmlContent = this.getBaseTemplate(
      content,
      "Payment Received - Admin Notification"
    );
    return this.sendEmail(
      adminEmail,
      "Payment Received - Application Now Active",
      htmlContent
    );
  }

  // 9. Assessment ready notification (to assessor)
  async sendAssessmentReadyNotificationToAssessor(assessor, application, user) {
    const content = `
      <div class="greeting">New Assessment Assignment, ${assessor.firstName}!</div>
      <div class="message">
        You have been assigned a new Qualification application for assessment. The student has completed their payment and initial requirements.
      </div>
      
      <div class="info-box">
        <h3>Assessment Details</h3>
        <p><strong>Student:</strong> ${user.firstName} ${user.lastName}</p>
        <p><strong>Qualification:</strong> ${application.certificationName}</p>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Current Status:</strong> ${application.overallStatus}</p>
      </div>

      <div class="message">
        Please review the application materials and begin the assessment process. You can access all submitted forms and documents through your assessor dashboard.
      </div>

      <a href="${this.baseUrl}" class="button">Start Assessment</a>

      <div class="message">
        If you have any questions about this assignment, please contact the administration team.
      </div>
    `;

    const htmlContent = this.getBaseTemplate(
      content,
      "New Assessment Assignment"
    );
    return this.sendEmail(
      assessor.email,
      "New Assessment Assignment",
      htmlContent
    );
  }

  // Add this method to your EmailService class
  async sendDocumentResubmissionRequiredEmail(
    user,
    application,
    assessor,
    rejectionReason
  ) {
    const content = `
    <div class="greeting">Action Required, ${user.firstName}</div>
    <div class="message">
      Your assessor has reviewed your submitted documents and has requested some changes. Please review the feedback below and resubmit the required documents.
    </div>
    
    <div class="info-box" style="background-color: #fff8e1; border-left-color: #ffa726;">
      <h3>Document Review Feedback</h3>
      <p><strong>Status:</strong> Requires Changes</p>
      <p><strong>Reviewed by:</strong> ${assessor.firstName} ${assessor.lastName}</p>
      <p><strong>Feedback:</strong></p>
      <p style="background: #f8f9fa; padding: 10px; border-radius: 4px; margin-top: 10px;">${rejectionReason}</p>
    </div>

    <div class="message">
      Please address the feedback provided and resubmit your documents. Your assessor will review the updated submission promptly.
    </div>

    <a href="${this.baseUrl}" class="button">Resubmit Documents</a>

    <div class="message">
      Don't worry - this is a normal part of the assessment process. The feedback is designed to help you meet the qualification requirements.
    </div>

    <div class="divider"></div>
    <div style="text-align: center; color: #64748b; font-size: 12px;">
      Powered by Certified.IO
    </div>
  `;

    const htmlContent = this.getBaseTemplate(
      content,
      "Document Resubmission Required"
    );
    return this.sendEmail(
      user.email,
      `Action Required: Document Changes Needed`,
      htmlContent
    );
  }
  // 10. Form resubmission required notification
  async sendFormResubmissionRequiredEmail(
    user,
    application,
    formName,
    feedback
  ) {
    const content = `
      <div class="greeting">Action Required, ${user.firstName}</div>
      <div class="message">
        Your assessor has reviewed your ${formName} and has requested some changes. Please review the feedback below and resubmit the form.
      </div>
      
      <div class="info-box">
        <h3>Assessment Feedback</h3>
        <p><strong>Form:</strong> ${formName}</p>
        <p><strong>Status:</strong> Requires Changes</p>
        <p><strong>Feedback:</strong></p>
        <p style="background: #f8f9fa; padding: 10px; border-radius: 4px; margin-top: 10px;">${feedback}</p>
      </div>

      <div class="message">
        Please address the feedback provided and resubmit the form. Your assessor will review the updated submission promptly.
      </div>

      <a href="${this.baseUrl}" class="button">Resubmit Form</a>

      <div class="message">
        Don't worry - this is a normal part of the assessment process. The feedback is designed to help you meet the Qualification requirements.
      </div>
    `;

    const htmlContent = this.getBaseTemplate(
      content,
      "Form Resubmission Required"
    );
    return this.sendEmail(
      user.email,
      `Action Required: ${formName} Needs Updates`,
      htmlContent
    );
  }

  // Utility method to send multiple emails
  async sendBulkEmails(emails) {
    const results = [];
    for (const emailData of emails) {
      try {
        const result = await this.sendEmail(
          emailData.to,
          emailData.subject,
          emailData.html
        );
        results.push({ ...emailData, success: true, result });
      } catch (error) {
        results.push({ ...emailData, success: false, error: error.message });
      }
    }
    return results;
  }

  // 11. Third-party employer email
  async sendThirdPartyEmployerEmail(
    employerEmail,
    employerName,
    student,
    formTemplate,
    formUrl
  ) {
    const content = `
    <div class="greeting">Dear ${employerName},</div>
    <div class="message">
      ${student.firstName} ${student.lastName} has requested you to complete a reference form as their employer for their qualification application with ${this.companyName} RTO.
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

    <div class="divider"></div>
    <div style="text-align: center; color: #64748b; font-size: 12px;">
      Powered by Certified.IO
    </div>
  `;

    const htmlContent = this.getBaseTemplate(
      content,
      "Employer Reference Request"
    );
    return this.sendEmail(
      employerEmail,
      `Reference Request for ${student.firstName} ${student.lastName}`,
      htmlContent
    );
  }

  // 12. Third-party reference email
  async sendThirdPartyReferenceEmail(
    referenceEmail,
    referenceName,
    student,
    formTemplate,
    formUrl
  ) {
    const content = `
    <div class="greeting">Dear ${referenceName},</div>
    <div class="message">
      ${student.firstName} ${student.lastName} has requested you to complete a professional reference form for their qualification application with ${this.companyName}.
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

    <div class="divider"></div>
    <div style="text-align: center; color: #64748b; font-size: 12px;">
      Powered by Certified.IO
    </div>
  `;

    const htmlContent = this.getBaseTemplate(
      content,
      "Professional Reference Request"
    );
    return this.sendEmail(
      referenceEmail,
      `Reference Request for ${student.firstName} ${student.lastName}`,
      htmlContent
    );
  }

  // 13. Third-party combined email
  async sendThirdPartyCombinedEmail(
    email,
    employerName,
    referenceName,
    student,
    formTemplate,
    formUrl
  ) {
    const content = `
    <div class="greeting">Dear ${employerName},</div>
    <div class="message">
      ${student.firstName} ${student.lastName} has requested you to complete a comprehensive reference form for their Qualification application with ${this.companyName} RTO.
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

    <div class="divider"></div>
    <div style="text-align: center; color: #64748b; font-size: 12px;">
      Powered by Certified.IO
    </div>
  `;

    const htmlContent = this.getBaseTemplate(
      content,
      "Combined Reference Request"
    );
    return this.sendEmail(
      email,
      `Reference Request for ${student.firstName} ${student.lastName}`,
      htmlContent
    );
  }

  async sendCertificateDownloadEmail(user, application, certificateDetails) {
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
        this.baseUrl +
          "/certificates/download/" +
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

    <div class="divider"></div>

   

   

    <div class="divider"></div>
    <div style="text-align: center; color: #64748b; font-size: 12px;">
      Powered by Certified.IO
    </div>
  `;

    const htmlContent = this.getBaseTemplate(
      content,
      "Your Certificate is Ready!"
    );
    return this.sendEmail(
      user.email,
      `Certificate Ready - Download Now!`,
      htmlContent
    );
  }

  // 15. Certificate verification email (for employers/third parties)
  async sendCertificateVerificationEmail(
    verifierEmail,
    certificateDetails,
    student
  ) {
    const content = `
    <div class="greeting">Certificate Verification</div>
    <div class="message">
      This email confirms the authenticity of a certificate issued by ${
        this.companyName
      } RTO.
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
        Visit our verification portal at <a href="${
          this.baseUrl
        }" style="color: #667eea;">${
      this.baseUrl
    }/verify</a> and enter Certificate ID: ${certificateDetails.certificateId}
      </p>
    </div>

    <div class="message">
      If you have any questions about this certificate or need additional information, please contact our support team.
    </div>

    <div class="divider"></div>
    <div style="text-align: center; color: #64748b; font-size: 12px;">
      Powered by Certified.IO
    </div>
  `;

    const htmlContent = this.getBaseTemplate(
      content,
      "Certificate Verification"
    );
    return this.sendEmail(
      verifierEmail,
      `Certificate Verification - ${certificateDetails.certificationName}`,
      htmlContent
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
      <a href="${
        this.baseUrl
      }" class="button" style="background: linear-gradient(135deg, #ff9800 0%, #ffb74d 100%);">
        Renew Certificate Now
      </a>
    </div>

    <div class="message">
      Don't let your hard-earned Qualification expire! Start the renewal process today to avoid any interruption in your certified status.
    </div>

    <div class="divider"></div>
    <div style="text-align: center; color: #64748b; font-size: 12px;">
      Powered by Certified.IO
    </div>
  `;

    const htmlContent = this.getBaseTemplate(
      content,
      "Certificate Expiry Reminder"
    );
    return this.sendEmail(
      user.email,
      `Action Required: Certificate Expiring in ${daysUntilExpiry} Days`,
      htmlContent
    );
  }

  async sendDocumentSubmissionEmail(user, application, documentType) {
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

    <a href="${this.baseUrl}" class="button">Check Application Status</a>

    <div class="message">
      Continue working on any remaining requirements while these documents are being reviewed. This helps speed up your overall assessment process.
    </div>

    <div class="divider"></div>
    <div style="text-align: center; color: #64748b; font-size: 12px;">
      Powered by Certified.IO
    </div>
  `;

    const htmlContent = this.getBaseTemplate(content, "Documents Submitted");
    return this.sendEmail(
      user.email,
      `${documentType} Submitted Successfully`,
      htmlContent
    );
  }

  // 19. Document verification result email (approved or rejected)
  async sendDocumentVerificationEmail(
    user,
    application,
    assessor,
    verificationStatus,
    rejectionReason = null
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

      <a href="${this.baseUrl}" class="button">View Application Progress</a>

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

      <a href="${this.baseUrl}" class="button">Resubmit Documents</a>

      <div class="message">
        Don't worry - this is a normal part of the assessment process. The feedback is designed to help you meet the qualification requirements successfully.
      </div>
    `;
      emailSubject = "Action Required: Document Changes Needed";
      emailTitle = "Document Resubmission Required";
    }

    content += `
    <div class="divider"></div>
    <div style="text-align: center; color: #64748b; font-size: 12px;">
      Powered by Certified.IO
    </div>
  `;

    const htmlContent = this.getBaseTemplate(content, emailTitle);
    return this.sendEmail(user.email, emailSubject, htmlContent);
  }

  async sendFormApprovalEmail(user, application, formName, assessor) {
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

    <a href="${this.baseUrl}" class="button">View Application Progress</a>

    <div class="message">
      Continue working on any remaining forms or requirements to complete your qualification process.
    </div>

    <div class="divider"></div>
    <div style="text-align: center; color: #64748b; font-size: 12px;">
      Powered by Certified.IO
    </div>
  `;

    const htmlContent = this.getBaseTemplate(content, "Form Approved");
    return this.sendEmail(
      user.email,
      `✅ ${formName} Approved - Well Done!`,
      htmlContent
    );
  }

  // 1. ADD THIS NEW METHOD TO YOUR EmailService class (services/emailService.js)

  // 21. Enrollment confirmation email - formal notification
  async sendEnrollmentConfirmationEmail(user, application, certificationName) {
    const currentDate = new Date().toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const content = `
    <div style="text-align: right; margin-bottom: 30px; color: #2d3748; font-size: 14px;">
      ${currentDate}<br>
      ${this.companyName}<br>
      Contact: 0451 781 759<br>
      Email: admin@ebc.edu.au<br>
      Website: www.ebc.edu.au<br>
      Address: 3 Parramatta Sq. PARRAMATTA NSW, 2150
    </div>

    <div class="greeting">Dear ${user.firstName} ${user.lastName},</div>
    
    <div class="message">
      This is to notify that;
    </div>

    <div class="info-box" style=" text-align: center; padding: 25px;">
      <h3 style="color: #2d3748; margin-bottom: 15px;"> Confirmation of Enrolment</h3>
      <p style="font-size: 16px; color: #2d3748; margin: 5px 0;">
        <strong>${user.firstName} ${user.lastName}</strong> has been formally enrolled in
      </p>
      <p style="color: #000000ff; margin: 10px 0;">
        ${certificationName}
      </p>
      <p style="font-size: 16px; color: #2d3748; margin: 5px 0;">
        at <strong>${this.companyName} - RTO Code ${this.rtoCode}</strong>
      </p>
      <p style="font-size: 16px; color: #2d3748; margin: 5px 0;">
        on <strong>${currentDate}</strong>
      </p>
    </div>

    <div class="message">
      Please contact us, if you have any queries or need additional information. We can be contacted by phone at <strong>0451 781 759</strong>
    </div>

    <div class="message">
      Thank you in advance for your cooperation and prompt attention to this matter.
    </div>

    <a href="${this.baseUrl}" class="button">View Your Enrolment Profile</a>

    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; color: #2d3748; font-weight: 600;">Sincerely,</p>
      <p style="margin: 10px 0 0 0; color: #2d3748; font-weight: 600;">
        ${this.ceoName}<br>
        <span style="font-weight: 400; color: #4a5568;">CEO</span>
      </p>
    </div>

    <div class="divider"></div>
    <div style="text-align: center; color: #64748b; font-size: 12px;">
      ${this.companyName} - RTO Code ${this.rtoCode}<br>
      Powered by Certified.IO
    </div>
  `;

    const htmlContent = this.getBaseTemplate(
      content,
      "Confirmation of Enrolment"
    );
    return this.sendEmail(
      user.email,
      `Confirmation of Enrolment - ${certificationName}`,
      htmlContent
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

    <a href="${this.baseUrl}" class="button">View Payment Progress</a>

    <div class="message">
      Thank you for staying current with your payment plan. This helps ensure smooth processing of your qualification.
    </div>

    <div class="divider"></div>
    <div style="text-align: center; color: #64748b; font-size: 12px;">
      Powered by Certified.IO
    </div>
  `;

    const htmlContent = this.getBaseTemplate(
      content,
      "Installment Payment Received"
    );
    return this.sendEmail(
      user.email,
      "Installment Payment Confirmed - Thank You!",
      htmlContent
    );
  }
}

module.exports = new EmailService();
