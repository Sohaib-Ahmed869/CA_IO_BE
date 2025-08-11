// controllers/emailConfigController.js
const EmailConfig = require("../models/emailConfig");
const RTO = require("../models/rto");
const multiEmailService = require("../services/multiEmailService");
const logme = require("../utils/logger");
const { rtoFilter } = require("../middleware/tenant");

const emailConfigController = {
  // Create or update email configuration for RTO
  createOrUpdateEmailConfig: async (req, res) => {
    try {
      const {
        emailProvider,
        email,
        password,
        smtpHost,
        smtpPort,
        smtpSecure,
        isActive = true,
      } = req.body;

      const rtoId = req.rtoId || req.params.rtoId;
      const userId = req.user._id;

      // Validate RTO exists
      const rto = await RTO.findById(rtoId);
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
        });
      }

      // Validate required fields based on provider
      if (!emailProvider || !email || !password) {
        return res.status(400).json({
          success: false,
          message: "Email provider, email, and password are required",
        });
      }

      if (emailProvider === "custom" && (!smtpHost || !smtpPort)) {
        return res.status(400).json({
          success: false,
          message: "SMTP host and port are required for custom provider",
        });
      }

      // Check if configuration already exists
      let emailConfig = await EmailConfig.findOne({ rtoId });

      if (emailConfig) {
        // Update existing configuration
        emailConfig.emailProvider = emailProvider;
        emailConfig.email = email;
        emailConfig.setPassword(password);
        emailConfig.smtpHost = smtpHost;
        emailConfig.smtpPort = smtpPort;
        emailConfig.smtpSecure = smtpSecure;
        emailConfig.isActive = isActive;
        emailConfig.updatedBy = userId;
        emailConfig.testStatus = "pending"; // Reset test status
        emailConfig.testError = null;
      } else {
        // Create new configuration
        emailConfig = new EmailConfig({
          rtoId,
          emailProvider,
          email,
          smtpHost,
          smtpPort,
          smtpSecure,
          isActive,
          createdBy: userId,
        });
        emailConfig.setPassword(password);
      }

      await emailConfig.save();

      logme.info("Email configuration saved", {
        rtoId,
        emailProvider,
        email,
        createdBy: userId,
      });

      res.status(201).json({
        success: true,
        message: "Email configuration saved successfully",
        data: {
          id: emailConfig._id,
          rtoId: emailConfig.rtoId,
          emailProvider: emailConfig.emailProvider,
          email: emailConfig.email,
          isActive: emailConfig.isActive,
          testStatus: emailConfig.testStatus,
          createdAt: emailConfig.createdAt,
          updatedAt: emailConfig.updatedAt,
        },
      });
    } catch (error) {
      logme.error("Create/Update email config error:", error);
      res.status(500).json({
        success: false,
        message: "Error saving email configuration",
        error: error.message,
      });
    }
  },

  // Get email configuration for RTO
  getEmailConfig: async (req, res) => {
    try {
      const rtoId = req.rtoId || req.params.rtoId;

      const emailConfig = await EmailConfig.findOne({ rtoId })
        .populate("createdBy", "firstName lastName email")
        .populate("updatedBy", "firstName lastName email");

      if (!emailConfig) {
        return res.status(404).json({
          success: false,
          message: "Email configuration not found",
        });
      }

      // Get status from multi-email service
      const status = await multiEmailService.getEmailConfigStatus(rtoId);

      res.json({
        success: true,
        data: {
          id: emailConfig._id,
          rtoId: emailConfig.rtoId,
          emailProvider: emailConfig.emailProvider,
          email: emailConfig.email,
          smtpHost: emailConfig.smtpHost,
          smtpPort: emailConfig.smtpPort,
          smtpSecure: emailConfig.smtpSecure,
          isActive: emailConfig.isActive,
          testStatus: emailConfig.testStatus,
          lastTested: emailConfig.lastTested,
          testError: emailConfig.testError,
          emailsSent: emailConfig.emailsSent,
          lastUsed: emailConfig.lastUsed,
          createdBy: emailConfig.createdBy,
          updatedBy: emailConfig.updatedBy,
          createdAt: emailConfig.createdAt,
          updatedAt: emailConfig.updatedAt,
          status: status,
        },
      });
    } catch (error) {
      logme.error("Get email config error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching email configuration",
        error: error.message,
      });
    }
  },

  // Test email configuration
  testEmailConfig: async (req, res) => {
    try {
      const rtoId = req.rtoId || req.params.rtoId;

      const emailConfig = await EmailConfig.findOne({ rtoId });
      if (!emailConfig) {
        return res.status(404).json({
          success: false,
          message: "Email configuration not found",
        });
      }

      // Test the connection
      await emailConfig.testConnection();

      logme.info("Email configuration tested successfully", { rtoId });

      res.json({
        success: true,
        message: "Email configuration tested successfully",
        data: {
          testStatus: emailConfig.testStatus,
          lastTested: emailConfig.lastTested,
          testError: emailConfig.testError,
        },
      });
    } catch (error) {
      logme.error("Test email config error:", error);
      res.status(500).json({
        success: false,
        message: "Email configuration test failed",
        error: error.message,
      });
    }
  },

  // Send test email
  sendTestEmail: async (req, res) => {
    try {
      const { testEmail } = req.body;
      const rtoId = req.rtoId || req.params.rtoId;

      if (!testEmail) {
        return res.status(400).json({
          success: false,
          message: "Test email address is required",
        });
      }

      // Get RTO branding
      const rto = await RTO.findById(rtoId);
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
        });
      }

      const branding = {
        primaryColor: rto.primaryColor || "#007bff",
        secondaryColor: rto.secondaryColor || "#6c757d",
        logoUrl: rto.assets?.logo?.url || null,
        companyName: rto.companyName || "RTO",
        fromName: rto.companyName,
      };

      const subject = "Test Email - Email Configuration";
      const content = `
        <h2>Test Email</h2>
        <p>This is a test email to verify your email configuration.</p>
        <p><strong>RTO:</strong> ${rto.companyName}</p>
        <p><strong>Email Provider:</strong> ${rto.emailProvider || 'System'}</p>
        <p><strong>Sent at:</strong> ${new Date().toLocaleString()}</p>
        <p>If you received this email, your email configuration is working correctly!</p>
      `;

      const result = await multiEmailService.sendBrandedEmail(
        rtoId,
        testEmail,
        subject,
        content,
        branding
      );

      logme.info("Test email sent successfully", {
        rtoId,
        testEmail,
        isSystem: result.isSystem,
      });

      res.json({
        success: true,
        message: "Test email sent successfully",
        data: {
          messageId: result.messageId,
          isSystem: result.isSystem,
          rtoId: result.rtoId,
        },
      });
    } catch (error) {
      logme.error("Send test email error:", error);
      res.status(500).json({
        success: false,
        message: "Error sending test email",
        error: error.message,
      });
    }
  },

  // Delete email configuration
  deleteEmailConfig: async (req, res) => {
    try {
      const rtoId = req.rtoId || req.params.rtoId;

      const emailConfig = await EmailConfig.findOne({ rtoId });
      if (!emailConfig) {
        return res.status(404).json({
          success: false,
          message: "Email configuration not found",
        });
      }

      await EmailConfig.findByIdAndDelete(emailConfig._id);

      logme.info("Email configuration deleted", { rtoId });

      res.json({
        success: true,
        message: "Email configuration deleted successfully",
      });
    } catch (error) {
      logme.error("Delete email config error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting email configuration",
        error: error.message,
      });
    }
  },

  // Get email configuration status
  getEmailConfigStatus: async (req, res) => {
    try {
      const rtoId = req.rtoId || req.params.rtoId;

      const status = await multiEmailService.getEmailConfigStatus(rtoId);

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      logme.error("Get email config status error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching email configuration status",
        error: error.message,
      });
    }
  },

  // Get all email configurations (for admin)
  getAllEmailConfigs: async (req, res) => {
    try {
      const { page = 1, limit = 10, status, provider } = req.query;

      // Build filter
      const filter = {};
      if (status && status !== "all") {
        filter.testStatus = status;
      }
      if (provider && provider !== "all") {
        filter.emailProvider = provider;
      }

      // Get configurations with pagination
      const emailConfigs = await EmailConfig.find(filter)
        .populate("rtoId", "companyName subdomain")
        .populate("createdBy", "firstName lastName email")
        .sort({ updatedAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      // Get total count
      const total = await EmailConfig.countDocuments(filter);

      // Get status for each config
      const configsWithStatus = await Promise.all(
        emailConfigs.map(async (config) => {
          const status = await multiEmailService.getEmailConfigStatus(config.rtoId);
          return {
            ...config.toObject(),
            status: status,
          };
        })
      );

      res.json({
        success: true,
        data: {
          configs: configsWithStatus,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
          },
        },
      });
    } catch (error) {
      logme.error("Get all email configs error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching email configurations",
        error: error.message,
      });
    }
  },
};

module.exports = emailConfigController; 