// utils/emailHelpers.js
const emailService = require("../services/emailService2");
const User = require("../models/user");

class EmailHelpers {
  // Get admin emails for notifications
  static async getAdminEmails() {
    try {
      const admins = await User.find({
        userType: "admin",
        isActive: true,
      }).select("email");

      return admins.map((admin) => admin.email);
    } catch (error) {
      console.error("Error fetching admin emails:", error);
      return [];
    }
  }

  // Send email to all admins
  static async notifyAdmins(subject, content, templateTitle) {
    try {
      const adminEmails = await this.getAdminEmails();
      const promises = adminEmails.map((email) =>
        emailService.sendEmail(
          email,
          subject,
          emailService.getBaseTemplate(content, templateTitle)
        )
      );

      return Promise.allSettled(promises);
    } catch (error) {
      console.error("Error sending admin notifications:", error);
    }
  }

  // Application lifecycle email triggers
  static async handleApplicationCreated(user, application, certification) {
    try {
      // Send welcome email to user
      await emailService.sendWelcomeEmail(user, certification);

      // Notify admins
      const adminEmails = await this.getAdminEmails();
      for (const adminEmail of adminEmails) {
        await emailService.sendNewApplicationNotificationToAdmin(
          adminEmail,
          user,
          application
        );
      }
    } catch (error) {
      console.error("Error sending application created emails:", error);
    }
  }

  static async handlePaymentCompleted(user, application, payment) {
    try {
      // Send confirmation to user
      await emailService.sendPaymentConfirmationEmail(
        user,
        application,
        payment
      );

      // Notify admins
      const adminEmails = await this.getAdminEmails();
      for (const adminEmail of adminEmails) {
        await emailService.sendPaymentReceivedNotificationToAdmin(
          adminEmail,
          user,
          payment
        );
      }
    } catch (error) {
      console.error("Error sending payment completed emails:", error);
    }
  }

  static async handleAssessorAssigned(user, application, assessor) {
    try {
      // Notify user about assessor assignment
      await emailService.sendAssessorAssignedEmail(user, application, assessor);

      // Notify assessor about new assignment
      await emailService.sendAssessmentReadyNotificationToAssessor(
        assessor,
        application,
        user
      );
    } catch (error) {
      console.error("Error sending assessor assignment emails:", error);
    }
  }

  static async handleFormSubmitted(user, application, formName) {
    try {
      // Send confirmation to user
      await emailService.sendFormSubmissionEmail(user, application, formName);
    } catch (error) {
      console.error("Error sending form submission email:", error);
    }
  }

  static async handleFormResubmissionRequired(
    user,
    application,
    formName,
    feedback
  ) {
    try {
      // Notify user about required changes
      await emailService.sendFormResubmissionRequiredEmail(
        user,
        application,
        formName,
        feedback
      );
    } catch (error) {
      console.error("Error sending form resubmission email:", error);
    }
  }

  static async handleAssessmentCompleted(user, application, assessor) {
    try {
      // Notify user about completion
      await emailService.sendAssessmentCompletionEmail(
        user,
        application,
        assessor
      );

      // Notify admins
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
        "Assessment Complete - Admin Action Required"
      );
    } catch (error) {
      console.error("Error sending assessment completion emails:", error);
    }
  }

  static async handleCertificateIssued(user, application, certificateUrl) {
    try {
      // Notify user about certificate
      await emailService.sendCertificateReadyEmail(
        user,
        application,
        certificateUrl
      );

      // Notify admins for record keeping
      const content = `
        <div class="greeting">Certificate Issued</div>
        <div class="message">
          A certificate has been successfully issued.
        </div>
        
        <div class="info-box">
          <h3>Certificate Details</h3>
          <p><strong>Student:</strong> ${user.firstName} ${user.lastName}</p>
          <p><strong>Qualification:</strong> ${
            application.certificationName
          }</p>
          <p><strong>Issue Date:</strong> ${new Date().toLocaleDateString()}</p>
          <p><strong>Application ID:</strong> ${application._id}</p>
        </div>
      `;

      await this.notifyAdmins(
        "Certificate Issued - Record Update",
        content,
        "Certificate Issued"
      );
    } catch (error) {
      console.error("Error sending certificate issued emails:", error);
    }
  }

  // Payment plan specific emails
  static async handlePaymentPlanSetup(user, application, payment) {
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

      const htmlContent = emailService.getBaseTemplate(
        content,
        "Payment Plan Activated"
      );
      await emailService.sendEmail(
        user.email,
        "Payment Plan Successfully Activated",
        htmlContent
      );
    } catch (error) {
      console.error("Error sending payment plan setup email:", error);
    }
  }

  static async handlePaymentPlanPayment(
    user,
    application,
    payment,
    installmentNumber
  ) {
    try {
      const content = `
        <div class="greeting">Payment Received, ${user.firstName}!</div>
        <div class="message">
          Thank you! Your installment payment has been successfully processed.
        </div>
        
        <div class="info-box">
          <h3>Payment Details</h3>
          <p><strong>Installment:</strong> ${installmentNumber} of ${
        payment.paymentPlan.recurringPayments.totalPayments
      }</p>
          <p><strong>Amount:</strong> $${
            payment.paymentPlan.recurringPayments.amount
          }</p>
          <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          <p><strong>Remaining Balance:</strong> $${payment.remainingAmount}</p>
        </div>

        <div class="message">
          ${
            payment.remainingAmount > 0
              ? `Your next payment will be processed automatically according to your schedule.`
              : `Congratulations! You have completed all payments for your certification.`
          }
        </div>

        <a href="${
          process.env.FRONTEND_URL
        }" class="button">View Payment History</a>
      `;

      const htmlContent = emailService.getBaseTemplate(
        content,
        "Payment Received"
      );
      await emailService.sendEmail(
        user.email,
        "Installment Payment Received - Thank You!",
        htmlContent
      );
    } catch (error) {
      console.error("Error sending payment plan payment email:", error);
    }
  }

  // Document verification emails
  static async handleDocumentsSubmitted(user, application) {
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

      const htmlContent = emailService.getBaseTemplate(
        content,
        "Documents Submitted"
      );
      await emailService.sendEmail(
        user.email,
        "Documents Submitted for Review",
        htmlContent
      );
    } catch (error) {
      console.error("Error sending documents submitted email:", error);
    }
  }

  static async handleDocumentsVerified(user, application, assessor) {
    try {
      const content = `
        <div class="greeting">Documents Verified, ${user.firstName}!</div>
        <div class="message">
          Great news! Your supporting documents have been verified and approved by your assessor.
        </div>
        
        <div class="info-box">
          <h3>Verification Details</h3>
          <p><strong>Status:</strong> ✅ Verified</p>
          <p><strong>Verified by:</strong> ${assessor.firstName} ${
        assessor.lastName
      }</p>
          <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
        </div>

        <div class="message">
          Your application is progressing well. Continue with any remaining requirements to complete your certification process.
        </div>

        <a href="${process.env.FRONTEND_URL}" class="button">View Progress</a>
      `;

      const htmlContent = emailService.getBaseTemplate(
        content,
        "Documents Verified"
      );
      await emailService.sendEmail(
        user.email,
        "Documents Verified - Application Progressing!",
        htmlContent
      );
    } catch (error) {
      console.error("Error sending documents verified email:", error);
    }
  }

  // System notification emails
  static async handleSystemMaintenance(maintenanceDetails) {
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
          emailService.getBaseTemplate(content, "System Maintenance")
        )
      );

      return Promise.allSettled(emailPromises);
    } catch (error) {
      console.error("Error sending maintenance notification emails:", error);
    }
  }

  // Password reset emails (if not already implemented)
  static async handlePasswordReset(user, resetToken) {
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

      const htmlContent = emailService.getBaseTemplate(
        content,
        "Password Reset"
      );
      await emailService.sendEmail(
        user.email,
        "Password Reset Request",
        htmlContent
      );
    } catch (error) {
      console.error("Error sending password reset email:", error);
    }
  }

  // Weekly digest emails
  static async sendWeeklyDigestToAdmins() {
    try {
      const adminEmails = await this.getAdminEmails();
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);

      // Get weekly stats
      const Application = require("../models/application");
      const Payment = require("../models/payment");

      const [newApplications, completedPayments, issuedCertificates] =
        await Promise.all([
          Application.countDocuments({ createdAt: { $gte: weekStart } }),
          Payment.countDocuments({
            status: "completed",
            completedAt: { $gte: weekStart },
          }),
          Application.countDocuments({
            overallStatus: "certificate_issued",
            updatedAt: { $gte: weekStart },
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

        <a href="${
          process.env.FRONTEND_URL
        }" class="button">View Dashboard</a>
      `;

      const promises = adminEmails.map((email) =>
        emailService.sendEmail(
          email,
          "Weekly Platform Summary",
          emailService.getBaseTemplate(content, "Weekly Summary")
        )
      );

      return Promise.allSettled(promises);
    } catch (error) {
      console.error("Error sending weekly digest emails:", error);
    }
  }
}

module.exports = EmailHelpers;
