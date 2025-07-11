// services/emailService.js
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs").promises;

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    // Your logo URL hosted on S3
    this.logoUrl = process.env.LOGO_URL || "https://certified.io/images/atrlogo.png";
    this.baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    this.companyName = "Certified.io";
    this.supportEmail = process.env.SUPPORT_EMAIL || "admission@atr.edu.au";
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
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
                <img src="${this.logoUrl}" alt="${this.companyName}" class="logo">
                <h1 class="header-title">${title}</h1>
            </div>
            <div class="content">
                ${content}
            </div>
            <div class="footer">
                <div class="company-name">${this.companyName}</div>
                <p>This email was sent from an automated system. Please do not reply to this email.</p>
                <p>If you have any questions, contact us at <a href="mailto:${this.supportEmail}">${this.supportEmail}</a></p>
                <p>&copy; ${new Date().getFullYear()} ${this.companyName}. All rights reserved.</p>
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
      <div class="greeting">Welcome to ${this.companyName}, ${user.firstName}!</div>
      <div class="message">
        Thank you for registering with us and starting your certification journey. We're excited to help you achieve your professional goals.
      </div>
      
      <div class="info-box">
        <h3>Your Application Details</h3>
        <p><strong>Certification:</strong> ${certification.name}</p>
        <p><strong>Application ID:</strong> ${user.applicationId || 'Will be provided shortly'}</p>
        <p><strong>Next Step:</strong> Complete your payment to proceed</p>
      </div>

      <div class="message">
        To get started, please log in to your account and complete the payment process. Once payment is confirmed, you'll be able to access your application dashboard and begin the certification process.
      </div>

      <a href="${this.baseUrl}" class="button">Login to Your Account</a>

      <div class="message">
        If you have any questions or need assistance, our support team is here to help. We look forward to supporting you on your certification journey!
      </div>
    `;

    const htmlContent = this.getBaseTemplate(content, "Welcome to Your Certification Journey");
    return this.sendEmail(user.email, `Welcome to ${this.companyName} - Let's Get Started!`, htmlContent);
  }

  // 2. Payment confirmation email
  async sendPaymentConfirmationEmail(user, application, payment) {
    const content = `
      <div class="greeting">Payment Confirmed, ${user.firstName}!</div>
      <div class="message">
        Great news! Your payment has been successfully processed. Your certification application is now active and you can proceed to the next steps.
      </div>
      
      <div class="info-box">
        <h3>Payment Details</h3>
        <p><strong>Amount Paid:</strong> $${payment.totalAmount}</p>
        <p><strong>Payment Method:</strong> ${payment.paymentType === 'one_time' ? 'One-time Payment' : 'Payment Plan'}</p>
        <p><strong>Transaction ID:</strong> ${payment._id}</p>
        <p><strong>Date:</strong> ${new Date(payment.completedAt).toLocaleDateString()}</p>
      </div>

      <div class="message">
        You can now access your application dashboard to complete the required forms and upload your supporting documents. An assessor will be assigned to your application shortly.
      </div>

      <a href="${this.baseUrl}/applications/${application._id}" class="button">View Your Application</a>

      <div class="message">
        Keep this email for your records. If you need to make changes or have questions about your application, please contact our support team.
      </div>
    `;

    const htmlContent = this.getBaseTemplate(content, "Payment Confirmation");
    return this.sendEmail(user.email, "Payment Confirmed - Your Application is Active", htmlContent);
  }

  // 3. Assessor assignment notification (to user)
  async sendAssessorAssignedEmail(user, application, assessor) {
    const content = `
      <div class="greeting">Your Assessor Has Been Assigned, ${user.firstName}!</div>
      <div class="message">
        We're pleased to inform you that a qualified assessor has been assigned to review your certification application. They will guide you through the assessment process.
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

      <a href="${this.baseUrl}/applications/${application._id}" class="button">View Application Status</a>

      <div class="message">
        If you have specific questions about the assessment process, you can reach out through your application dashboard or contact our support team.
      </div>
    `;

    const htmlContent = this.getBaseTemplate(content, "Assessor Assignment");
    return this.sendEmail(user.email, "Assessor Assigned to Your Application", htmlContent);
  }

  // 4. Form submission confirmation
  async sendFormSubmissionEmail(user, application, formName) {
    const content = `
      <div class="greeting">Form Submitted Successfully, ${user.firstName}!</div>
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

      <a href="${this.baseUrl}/applications/${application._id}" class="button">Check Application Status</a>

      <div class="message">
        Continue working on any remaining forms or documents while this one is being reviewed. This helps speed up your overall assessment process.
      </div>
    `;

    const htmlContent = this.getBaseTemplate(content, "Form Submission Confirmation");
    return this.sendEmail(user.email, `${formName} Submitted Successfully`, htmlContent);
  }

  // 5. Assessment completion notification
  async sendAssessmentCompletionEmail(user, application, assessor) {
    const content = `
      <div class="greeting">Assessment Complete, ${user.firstName}!</div>
      <div class="message">
        Congratulations! Your certification assessment has been completed successfully. Your application has been approved and you're now ready for certificate issuance.
      </div>
      
      <div class="info-box">
        <h3>Assessment Results</h3>
        <p><strong>Status:</strong> ✅ Approved</p>
        <p><strong>Assessed by:</strong> ${assessor.firstName} ${assessor.lastName}</p>
        <p><strong>Completion Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Next Step:</strong> Certificate Processing</p>
      </div>

      <div class="message">
        Your certificate is now being prepared and will be available for download shortly. You'll receive another notification once it's ready.
      </div>

      <a href="${this.baseUrl}/applications/${application._id}" class="button">View Assessment Results</a>

      <div class="message">
        Thank you for choosing ${this.companyName} for your certification needs. We're proud to be part of your professional development journey!
      </div>
    `;

    const htmlContent = this.getBaseTemplate(content, "Assessment Complete");
    return this.sendEmail(user.email, "🎉 Assessment Complete - Certificate Coming Soon!", htmlContent);
  }

  // 6. Certificate ready notification
  async sendCertificateReadyEmail(user, application, certificateUrl) {
    const content = `
      <div class="greeting">Your Certificate is Ready, ${user.firstName}!</div>
      <div class="message">
        🎉 Congratulations! Your certification has been officially issued and is now available for download. This is a significant achievement in your professional journey.
      </div>
      
      <div class="info-box">
        <h3>Certificate Details</h3>
        <p><strong>Certification:</strong> ${application.certificationName}</p>
        <p><strong>Issue Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Certificate ID:</strong> ${application.certificateId || 'Available in dashboard'}</p>
      </div>

      <div class="message">
        Your digital certificate is now available for download. You can access it anytime from your dashboard and share it with employers or professional networks.
      </div>

      <a href="${certificateUrl || this.baseUrl + '/certificates'}" class="button">Download Certificate</a>

      <div class="message">
        Keep your certificate in a safe place and remember to showcase your new qualification. We're proud of your achievement and look forward to supporting your continued professional growth.
      </div>
    `;

    const htmlContent = this.getBaseTemplate(content, "Certificate Ready");
    return this.sendEmail(user.email, "🏆 Your Certificate is Ready for Download!", htmlContent);
  }

  // Admin notification emails
  
  // 7. New application notification (to admin)
  async sendNewApplicationNotificationToAdmin(adminEmail, user, application) {
    const content = `
      <div class="greeting">New Application Received</div>
      <div class="message">
        A new certification application has been submitted and requires attention.
      </div>
      
      <div class="info-box">
        <h3>Application Details</h3>
        <p><strong>Student:</strong> ${user.firstName} ${user.lastName}</p>
        <p><strong>Email:</strong> ${user.email}</p>
        <p><strong>Certification:</strong> ${application.certificationName}</p>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Status:</strong> ${application.overallStatus}</p>
        <p><strong>Submitted:</strong> ${new Date(application.createdAt).toLocaleDateString()}</p>
      </div>

      <div class="message">
        Please review the application and assign an appropriate assessor when ready.
      </div>

      <a href="${this.baseUrl}/admin/applications/${application._id}" class="button">Review Application</a>
    `;

    const htmlContent = this.getBaseTemplate(content, "New Application - Admin Notification");
    return this.sendEmail(adminEmail, "New Certification Application Received", htmlContent);
  }

  // 8. Payment received notification (to admin)
  async sendPaymentReceivedNotificationToAdmin(adminEmail, user, payment) {
    const content = `
      <div class="greeting">Payment Received</div>
      <div class="message">
        A payment has been successfully processed for a certification application.
      </div>
      
      <div class="info-box">
        <h3>Payment Details</h3>
        <p><strong>Student:</strong> ${user.firstName} ${user.lastName}</p>
        <p><strong>Amount:</strong> $${payment.totalAmount}</p>
        <p><strong>Payment Type:</strong> ${payment.paymentType}</p>
        <p><strong>Transaction ID:</strong> ${payment._id}</p>
        <p><strong>Date:</strong> ${new Date(payment.completedAt).toLocaleDateString()}</p>
      </div>

      <div class="message">
        The application is now active and ready for assessment assignment.
      </div>

      <a href="${this.baseUrl}/admin/payments/${payment._id}" class="button">View Payment Details</a>
    `;

    const htmlContent = this.getBaseTemplate(content, "Payment Received - Admin Notification");
    return this.sendEmail(adminEmail, "Payment Received - Application Now Active", htmlContent);
  }

  // 9. Assessment ready notification (to assessor)
  async sendAssessmentReadyNotificationToAssessor(assessor, application, user) {
    const content = `
      <div class="greeting">New Assessment Assignment, ${assessor.firstName}!</div>
      <div class="message">
        You have been assigned a new certification application for assessment. The student has completed their payment and initial requirements.
      </div>
      
      <div class="info-box">
        <h3>Assessment Details</h3>
        <p><strong>Student:</strong> ${user.firstName} ${user.lastName}</p>
        <p><strong>Certification:</strong> ${application.certificationName}</p>
        <p><strong>Application ID:</strong> ${application._id}</p>
        <p><strong>Current Status:</strong> ${application.overallStatus}</p>
      </div>

      <div class="message">
        Please review the application materials and begin the assessment process. You can access all submitted forms and documents through your assessor dashboard.
      </div>

      <a href="${this.baseUrl}/assessor/applications/${application._id}" class="button">Start Assessment</a>

      <div class="message">
        If you have any questions about this assignment, please contact the administration team.
      </div>
    `;

    const htmlContent = this.getBaseTemplate(content, "New Assessment Assignment");
    return this.sendEmail(assessor.email, "New Assessment Assignment", htmlContent);
  }

  // 10. Form resubmission required notification
  async sendFormResubmissionRequiredEmail(user, application, formName, feedback) {
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

      <a href="${this.baseUrl}/applications/${application._id}/forms" class="button">Resubmit Form</a>

      <div class="message">
        Don't worry - this is a normal part of the assessment process. The feedback is designed to help you meet the certification requirements.
      </div>
    `;

    const htmlContent = this.getBaseTemplate(content, "Form Resubmission Required");
    return this.sendEmail(user.email, `Action Required: ${formName} Needs Updates`, htmlContent);
  }

  // Utility method to send multiple emails
  async sendBulkEmails(emails) {
    const results = [];
    for (const emailData of emails) {
      try {
        const result = await this.sendEmail(emailData.to, emailData.subject, emailData.html);
        results.push({ ...emailData, success: true, result });
      } catch (error) {
        results.push({ ...emailData, success: false, error: error.message });
      }
    }
    return results;
  }
}

module.exports = new EmailService();