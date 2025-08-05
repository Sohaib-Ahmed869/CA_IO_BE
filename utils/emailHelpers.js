// utils/emailHelpers.js
const emailService = require("../services/emailService2");
const logme = require("../utils/logger");
const User = require("../models/user");

class EmailHelpers {
  // Get admin emails for notifications (RTO-specific)
  static async getAdminEmails(rtoId = null) {
    try {
      const query = {
        userType: "admin",
        isActive: true,
      };

      // Add RTO filtering if provided
      if (rtoId) {
        query.rtoId = rtoId;
      }

      const admins = await User.find(query).select("email");
      return admins.map((admin) => admin.email);
    } catch (error) {
      logme.error("Error fetching admin emails:", error);
      return [];
    }
  }

  // Send email to all admins (RTO-specific)
  static async notifyAdmins(subject, content, templateTitle, rtoId = null) {
    try {
      const adminEmails = await this.getAdminEmails(rtoId);
      
      const promises = adminEmails.map((email) =>
        emailService.sendEmail(
          email,
          subject,
          content,
          rtoId
        )
      );
      return Promise.allSettled(promises);
    } catch (error) {
      logme.error("Error sending admin notifications:", error);
    }
  }

  // Application lifecycle email triggers (RTO-specific)
  static async handleApplicationCreated(user, application, certification, rtoId = null) {
    try {
      // Send welcome email to user with RTO branding
      await emailService.sendWelcomeEmail(user, certification, rtoId);

      // Notify admins with RTO branding
      const adminEmails = await this.getAdminEmails(rtoId);
      for (const adminEmail of adminEmails) {
        await emailService.sendNewApplicationNotificationToAdmin(
          adminEmail,
          user,
          application,
          rtoId
        );
      }
    } catch (error) {
      logme.error("Error sending application created emails:", error);
    }
  }

  static async handlePaymentCompleted(user, application, payment, rtoId = null) {
    try {
      // Send confirmation to user with RTO branding
      await emailService.sendPaymentConfirmationEmail(user, application, payment, rtoId);

      // Notify admins with RTO branding
      const adminEmails = await this.getAdminEmails(rtoId);
      for (const adminEmail of adminEmails) {
        await emailService.sendPaymentReceivedNotificationToAdmin(
          adminEmail,
          user,
          payment,
          rtoId
        );
      }
    } catch (error) {
      logme.error("Error sending payment completed emails:", error);
    }
  }

  static async handleInstallmentPayment(user, application, payment, installmentAmount, rtoId = null) {
    try {
      await emailService.sendInstallmentPaymentEmail(
        user,
        application,
        payment,
        installmentAmount,
        rtoId
      );
    } catch (error) {
      logme.error("Error sending installment payment email:", error);
    }
  }

  // Add this method after handleInstallmentPayment
  static async handleRecurringPayment(user, application, payment, installmentNumber, rtoId = null) {
    try {
      const remainingPayments =
        payment.paymentPlan.recurringPayments.totalPayments -
        payment.paymentPlan.recurringPayments.completedPayments;

      const content = `
        <div class="greeting">Recurring Payment Processed, ${user.firstName}!</div>
        <div class="message">
          Your scheduled installment payment has been automatically processed. Thank you for staying current with your payment plan!
        </div>
        
        <div class="info-box">
          <h3>Payment Details</h3>
          <p><strong>Installment:</strong> ${installmentNumber} of ${payment.paymentPlan.recurringPayments.totalPayments}</p>
          <p><strong>Amount:</strong> $${payment.paymentPlan.recurringPayments.amount}</p>
          <p><strong>Payment Type:</strong> Automatic Recurring Payment</p>
          <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          <p><strong>Remaining Payments:</strong> ${remainingPayments}</p>
          <p><strong>Remaining Balance:</strong> $${payment.remainingAmount}</p>
        </div>

        <div class="message">
          ${remainingPayments > 0
            ? `Your next payment will be automatically processed on your scheduled date.`
            : `Congratulations! You have completed all payments for your certification.`
          }
        </div>

        <a href="${process.env.FRONTEND_URL}/applications/${application._id}" class="button">View Payment Progress</a>

        <div class="message">
          You can view your complete payment history and manage your payment plan anytime in your dashboard.
        </div>
      `;

      await emailService.sendEmail(
        user.email,
        "Recurring Payment Processed - Thank You!",
        content,
        rtoId
      );
    } catch (error) {
      logme.error("Error sending recurring payment email:", error);
    }
  }

  static async handleAssessorAssigned(user, application, assessor, rtoId = null) {
    try {
      // Notify user about assessor assignment with RTO branding
      await emailService.sendAssessorAssignedEmail(user, application, assessor, rtoId);

      // Notify assessor about new assignment with RTO branding
      await emailService.sendAssessmentReadyNotificationToAssessor(
        assessor,
        application,
        user,
        rtoId
      );
    } catch (error) {
      logme.error("Error sending assessor assignment emails:", error);
    }
  }

  static async handleFormSubmitted(user, application, formName, rtoId = null) {
    try {
      // Send confirmation to user with RTO branding
      await emailService.sendFormSubmissionEmail(user, application, formName, rtoId);
    } catch (error) {
      logme.error("Error sending form submission email:", error);
    }
  }

  static async handleFormResubmissionRequired(user, application, formName, feedback, rtoId = null) {
    try {
      // Notify user about required changes with RTO branding
      await emailService.sendFormResubmissionRequiredEmail(
        user,
        application,
        formName,
        feedback,
        rtoId
      );
    } catch (error) {
      logme.error("Error sending form resubmission email:", error);
    }
  }

  static async handleAssessmentCompleted(user, application, assessor, rtoId = null) {
    try {
      // Notify user about completion with RTO branding
      await emailService.sendAssessmentCompletionEmail(user, application, assessor, rtoId);

      // Notify admins with RTO branding
      const content = `
        <div class="greeting">Assessment Completed</div>
        <div class="message">
          An assessment has been completed and is ready for certificate issuance.
        </div>
        
        <div class="info-box">
          <h3>Details</h3>
          <p><strong>Student:</strong> ${user.firstName} ${user.lastName}</p>
          <p><strong>Qualification:</strong> ${application.certificationName}</p>
          <p><strong>Assessor:</strong> ${assessor.firstName} ${assessor.lastName}</p>
          <p><strong>Application ID:</strong> ${application._id}</p>
        </div>

        <div class="message">
          Please proceed with certificate generation.
        </div>

        <a href="${process.env.FRONTEND_URL}" class="button">Process Certificate</a>
      `;

      await this.notifyAdmins(
        "Assessment Completed - Certificate Processing Required",
        content,
        "Assessment Complete - Admin Action Required",
        rtoId
      );
    } catch (error) {
      logme.error("Error sending assessment completion emails:", error);
    }
  }

  static async handleCertificateIssued(user, application, certificateUrl, rtoId = null) {
    try {
      // Notify user about certificate with RTO branding
      await emailService.sendCertificateReadyEmail(user, application, certificateUrl, rtoId);

      // Notify admins for record keeping with RTO branding
      const content = `
        <div class="greeting">Certificate Issued</div>
        <div class="message">
          A certificate has been successfully issued.
        </div>
        
        <div class="info-box">
          <h3>Certificate Details</h3>
          <p><strong>Student:</strong> ${user.firstName} ${user.lastName}</p>
          <p><strong>Qualification:</strong> ${application.certificationName}</p>
          <p><strong>Issue Date:</strong> ${new Date().toLocaleDateString()}</p>
          <p><strong>Application ID:</strong> ${application._id}</p>
        </div>
      `;

      await this.notifyAdmins(
        "Certificate Issued - Record Update",
        content,
        "Certificate Issued",
        rtoId
      );
    } catch (error) {
      logme.error("Error sending certificate issued emails:", error);
    }
  }

  // Payment plan specific emails (RTO-specific)
  static async handlePaymentPlanSetup(user, application, payment, rtoId = null) {
    try {
      const content = `
        <div class="greeting">Payment Plan Activated, ${user.firstName}!</div>
        <div class="message">
          Your payment plan has been successfully set up. Your certification journey can now continue with your scheduled payments.
        </div>
        
        <div class="info-box">
          <h3>Payment Plan Details</h3>
          <p><strong>Total Amount:</strong> $${payment.totalAmount}</p>
          <p><strong>Initial Payment:</strong> $${payment.paymentPlan.initialPayment.amount}</p>
          <p><strong>Installment Amount:</strong> $${payment.paymentPlan.recurringPayments.amount}</p>
          <p><strong>Frequency:</strong> ${payment.paymentPlan.recurringPayments.frequency}</p>
          <p><strong>Total Installments:</strong> ${payment.paymentPlan.recurringPayments.totalPayments}</p>
        </div>

        <div class="message">
          Your next payment will be automatically processed according to your schedule. You can view and manage your payment plan in your dashboard.
        </div>

        <a href="${process.env.FRONTEND_URL}" class="button">View Payment Schedule</a>
      `;

      await emailService.sendEmail(
        user.email,
        "Payment Plan Successfully Activated",
        content,
        rtoId
      );
    } catch (error) {
      logme.error("Error sending payment plan setup email:", error);
    }
  }

  // Replace the existing handlePaymentPlanPayment method with this updated version:
  static async handlePaymentPlanPayment(
    user,
    application,
    payment,
    installmentNumber,
    paymentType = "recurring",
    rtoId = null
  ) {
    try {
      const paymentTypeText =
        paymentType === "early" ? "Early Installment" : "Scheduled Installment";

      const content = `
        <div class="greeting">Payment Received, ${user.firstName}!</div>
        <div class="message">
          Thank you! Your ${paymentTypeText.toLowerCase()} payment has been successfully processed.
        </div>
        
        <div class="info-box">
          <h3>Payment Details</h3>
          <p><strong>Payment Type:</strong> ${paymentTypeText}</p>
          <p><strong>Installment:</strong> ${installmentNumber} of ${payment.paymentPlan.recurringPayments.totalPayments}</p>
          <p><strong>Amount:</strong> $${payment.paymentPlan.recurringPayments.amount}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          <p><strong>Remaining Balance:</strong> $${payment.remainingAmount}</p>
        </div>

        <div class="message">
          ${payment.remainingAmount > 0
            ? `Your payment plan is progressing well. ${
                paymentType === "early"
                  ? "You can continue with early payments or follow your regular schedule."
                  : "Your next payment will be processed automatically."
              }`
            : `Congratulations! You have completed all payments for your certification.`
          }
        </div>

        <a href="${process.env.FRONTEND_URL}/applications/${application._id}" class="button">View Payment History</a>
      `;

      await emailService.sendEmail(
        user.email,
        `${paymentTypeText} Payment Received - Thank You!`,
        content,
        rtoId
      );
    } catch (error) {
      logme.error("Error sending payment plan payment email:", error);
    }
  }

  // Document verification emails (RTO-specific)
  static async handleDocumentsSubmitted(user, application, rtoId = null) {
    try {
      const content = `
        <div class="greeting">Documents Submitted, ${user.firstName}!</div>
        <div class="message">
          Thank you for submitting your supporting documents. They are now under review by your assigned assessor.
        </div>
        
        <div class="info-box">
          <h3>Next Steps</h3>
          <p><strong>Status:</strong> Under Review</p>
          <p><strong>Application ID:</strong> ${application._id}</p>
          <p><strong>Submitted:</strong> ${new Date().toLocaleDateString()}</p>
        </div>

        <div class="message">
          Your assessor will verify your documents and may contact you if additional information is needed. You'll receive a notification once the review is complete.
        </div>

        <a href="${process.env.FRONTEND_URL}" class="button">Check Status</a>
      `;

      await emailService.sendEmail(
        user.email,
        "Documents Submitted for Review",
        content,
        rtoId
      );
    } catch (error) {
      logme.error("Error sending documents submitted email:", error);
    }
  }

  static async handleDocumentsVerified(user, application, assessor, rtoId = null) {
    try {
      const content = `
        <div class="greeting">Documents Verified, ${user.firstName}!</div>
        <div class="message">
          Great news! Your supporting documents have been verified and approved by your assessor.
        </div>
        
        <div class="info-box">
          <h3>Verification Details</h3>
          <p><strong>Status:</strong> ✅ Verified</p>
          <p><strong>Verified by:</strong> ${assessor.firstName} ${assessor.lastName}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
        </div>

        <div class="message">
          Your application is progressing well. Continue with any remaining requirements to complete your certification process.
        </div>

        <a href="${process.env.FRONTEND_URL}" class="button">View Progress</a>
      `;

      await emailService.sendEmail(
        user.email,
        "Documents Verified - Application Progressing!",
        content,
        rtoId
      );
    } catch (error) {
      logme.error("Error sending documents verified email:", error);
    }
  }

  // System notification emails (RTO-specific)
  static async handleSystemMaintenance(maintenanceDetails, rtoId = null) {
    try {
      const content = `
        <div class="greeting">Scheduled Maintenance Notification</div>
        <div class="message">
          We will be performing scheduled maintenance on our system. During this time, some services may be temporarily unavailable.
        </div>
        
        <div class="info-box">
          <h3>Maintenance Details</h3>
          <p><strong>Start Time:</strong> ${maintenanceDetails.startTime}</p>
          <p><strong>Duration:</strong> ${maintenanceDetails.duration}</p>
          <p><strong>Affected Services:</strong> ${maintenanceDetails.affectedServices}</p>
        </div>

        <div class="message">
          We apologize for any inconvenience. All services will be fully restored after the maintenance window.
        </div>
      `;

      // Send to all active users
      const users = await User.find({ isActive: true }).select("email");
      const emailPromises = users.map((user) =>
        emailService.sendEmail(
          user.email,
          "Scheduled System Maintenance",
          content,
          rtoId
        )
      );

      return Promise.allSettled(emailPromises);
    } catch (error) {
      logme.error("Error sending maintenance notification emails:", error);
    }
  }

  // Password reset emails (RTO-specific)
  static async handlePasswordReset(user, resetToken, rtoId = null) {
    try {
      const resetUrl = `${process.env.FRONTEND_URL}`;

      const content = `
        <div class="greeting">Password Reset Request, ${user.firstName}</div>
        <div class="message">
          We received a request to reset your password. Click the button below to create a new password.
        </div>
        
        <div class="info-box">
          <h3>Security Notice</h3>
          <p><strong>Valid for:</strong> 10 minutes</p>
          <p><strong>If you didn't request this:</strong> Please ignore this email</p>
        </div>

        <a href="${resetUrl}" class="button">Reset Password</a>

        <div class="message">
          For security reasons, this link will expire in 10 minutes. If you need a new link, please request another password reset.
        </div>
      `;

      await emailService.sendEmail(
        user.email,
        "Password Reset Request",
        content,
        rtoId
      );
    } catch (error) {
      logme.error("Error sending password reset email:", error);
    }
  }

  // Weekly digest emails (RTO-specific)
  static async sendWeeklyDigestToAdmins(rtoId = null) {
    try {
      const adminEmails = await this.getAdminEmails(rtoId);
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);

      // Get weekly stats
      const Application = require("../models/application");
      const Payment = require("../models/payment");

      const baseFilter = rtoId ? { rtoId } : {};

      const [newApplications, completedPayments, issuedCertificates] =
        await Promise.all([
          Application.countDocuments({ 
            createdAt: { $gte: weekStart },
            ...baseFilter
          }),
          Payment.countDocuments({
            status: "completed",
            completedAt: { $gte: weekStart },
            ...baseFilter
          }),
          Application.countDocuments({
            overallStatus: "certificate_issued",
            updatedAt: { $gte: weekStart },
            ...baseFilter
          }),
        ]);

      const content = `
        <div class="greeting">Weekly Summary Report</div>
        <div class="message">
          Here's your weekly summary of platform activity for the week ending ${new Date().toLocaleDateString()}.
        </div>
        
        <div class="info-box">
          <h3>This Week's Highlights</h3>
          <p><strong>New Applications:</strong> ${newApplications}</p>
          <p><strong>Payments Processed:</strong> ${completedPayments}</p>
          <p><strong>Certificates Issued:</strong> ${issuedCertificates}</p>
        </div>

        <div class="message">
          Access your admin dashboard for detailed analytics and reports.
        </div>

        <a href="${process.env.FRONTEND_URL}" class="button">View Dashboard</a>
      `;

      const promises = adminEmails.map((email) =>
        emailService.sendEmail(
          email,
          "Weekly Platform Summary",
          content,
          rtoId
        )
      );

      return Promise.allSettled(promises);
    } catch (error) {
      logme.error("Error sending weekly digest emails:", error);
    }
  }
}

module.exports = EmailHelpers;
