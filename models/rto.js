// models/rto.js
const mongoose = require("mongoose");

const rtoSchema = new mongoose.Schema(
  {
    // Basic RTO Information
    companyName: { type: String, required: true, trim: true },
    ceoName: { type: String, required: true, trim: true },
    ceoCode: { type: String, required: false, unique: true, sparse: true, trim: true, uppercase: true },
    // logo field removed - now only in assets.logo
    subdomain: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9-]+$/ },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    // Email Configuration
    emailConfig: {
      emailProvider: { 
        type: String, 
        enum: ["gmail", "outlook", "custom"], 
        default: "gmail" 
      },
      email: { 
        type: String, 
        lowercase: true, 
        trim: true,
        validate: {
          validator: function(v) {
            if (!v) return true; // Optional if not provided
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(v);
          },
          message: 'Please provide a valid email address'
        }
      },
      appPassword: { 
        type: String, 
        trim: true,
        select: false // Don't include in queries by default
      },
      smtpHost: { 
        type: String, 
        trim: true 
      },
      smtpPort: { 
        type: Number, 
        default: 587 
      },
      smtpSecure: { 
        type: Boolean, 
        default: false 
      },
      isEmailConfigured: { 
        type: Boolean, 
        default: false 
      },
      lastEmailTest: { 
        type: Date 
      },
      emailTestStatus: { 
        type: String, 
        enum: ["pending", "success", "failed"], 
        default: "pending" 
      }
    },
    address: {
      street: String,
      city: String,
      state: String,
      postalCode: String,
      country: { type: String, default: "Australia" },
    },
    rtoNumber: { type: String, required: true, unique: true, trim: true },
    registrationDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    // Branding & Customization
    primaryColor: { type: String, default: "#007bff" },
    secondaryColor: { type: String, default: "#6c757d" },
    customCss: { type: String, default: "" },
    // Email Templates
    emailTemplates: {
      welcomeEmail: {
        subject: { type: String, default: "Welcome to {companyName}" },
        body: { type: String, default: "Welcome to {companyName}! We're excited to have you on board." },
        isActive: { type: Boolean, default: true },
      },
      passwordReset: {
        subject: { type: String, default: "Password Reset Request - {companyName}" },
        body: { type: String, default: "You requested a password reset. Click the link below to reset your password." },
        isActive: { type: Boolean, default: true },
      },
      applicationSubmitted: {
        subject: { type: String, default: "Application Submitted - {companyName}" },
        body: { type: String, default: "Your application has been submitted successfully. We'll review it and get back to you soon." },
        isActive: { type: Boolean, default: true },
      },
      certificateIssued: {
        subject: { type: String, default: "Certificate Issued - {companyName}" },
        body: { type: String, default: "Congratulations! Your certificate has been issued. You can download it from your dashboard." },
        isActive: { type: Boolean, default: true },
      },
      paymentReminder: {
        subject: { type: String, default: "Payment Reminder - {companyName}" },
        body: { type: String, default: "This is a reminder that your payment is due. Please complete the payment to continue with your certification." },
        isActive: { type: Boolean, default: true },
      },
    },
    // Settings & Configuration
    settings: {
      allowPublicRegistration: { type: Boolean, default: true },
      requireEmailVerification: { type: Boolean, default: true },
      allowSelfRegistration: { type: Boolean, default: true },
      features: {
        assessors: { type: Boolean, default: true },
        salesAgents: { type: Boolean, default: true },
        salesManagers: { type: Boolean, default: true },
        thirdPartyForms: { type: Boolean, default: false },
        forecasting: { type: Boolean, default: false },
        advancedAnalytics: { type: Boolean, default: false },
        customBranding: { type: Boolean, default: true },
        bulkOperations: { type: Boolean, default: false },
        apiAccess: { type: Boolean, default: false },
      },
      maxUsers: { type: Number, default: 1000 },
      maxCertifications: { type: Number, default: 50 },
      maxFormTemplates: { type: Number, default: 100 },
      maxAssessors: { type: Number, default: 50 },
      maxSalesAgents: { type: Number, default: 20 },
    },
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    subscription: {
      plan: { type: String, enum: ["basic", "professional", "enterprise"], default: "basic" },
      startDate: { type: Date, default: Date.now },
      endDate: { type: Date },
      isActive: { type: Boolean, default: true },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
    notes: {
      type: String,
      default: "",
    },
    deletedAt: { type: Date, default: null }, // Soft delete tracking
    // RTO Assets (documents, policies, etc.)
    assets: {
      logo: {
        url: String,
        key: String, // S3 key
        uploadedAt: Date,
        originalName: String, // Original filename
        fileSize: Number, // File size in bytes
        mimeType: String, // File MIME type
      },
      documents: [{
        title: String, // e.g., "Assessment Policy", "Student Handbook"
        type: String, // e.g., "policy", "handbook", "procedure"
        description: String, // Document description
        url: String,
        key: String, // S3 key
        uploadedAt: Date,
        originalName: String, // Original filename
        fileSize: Number, // File size in bytes
        mimeType: String, // File MIME type
        isActive: {
          type: Boolean,
          default: true,
        },
      }],
    },
  },
  { timestamps: true }
);

// Only add index for isActive since it doesn't have unique: true
rtoSchema.index({ isActive: 1 });

rtoSchema.virtual("fullDomain").get(function () {
  return `${this.subdomain}.certified.io`;
});
rtoSchema.virtual("logoUrl").get(function () {
  if (this.assets && this.assets.logo) {
    return this.assets.logo.url;
  }
  return null;
});

// Generate suggested email address based on subdomain
rtoSchema.methods.generateSuggestedEmail = function() {
  if (this.subdomain) {
    return `noreply@${this.subdomain}.certified.io`;
  }
  return null;
};

// Check if email configuration is complete
rtoSchema.methods.isEmailFullyConfigured = function() {
  return this.emailConfig && 
         this.emailConfig.isEmailConfigured && 
         this.emailConfig.emailTestStatus === 'success';
};
rtoSchema.methods.isOperational = function () {
  const now = new Date();
  return (
    this.isActive &&
    this.isVerified &&
    this.subscription.isActive &&
    (!this.subscription.endDate || this.subscription.endDate > now) &&
    (!this.expiryDate || this.expiryDate > now)
  );
};
rtoSchema.methods.getStats = async function () {
  const User = mongoose.model("User");
  const Certification = mongoose.model("Certification");
  const FormTemplate = mongoose.model("FormTemplate");
  const Application = mongoose.model("Application");
  const stats = await Promise.all([
    User.countDocuments({ rtoId: this._id }),
    Certification.countDocuments({ rtoId: this._id }),
    FormTemplate.countDocuments({ rtoId: this._id }),
    Application.countDocuments({ rtoId: this._id }),
  ]);
  return {
    totalUsers: stats[0],
    totalCertifications: stats[1],
    totalFormTemplates: stats[2],
    totalApplications: stats[3],
  };
};
rtoSchema.methods.hasFeature = function (featureName) {
  return this.settings.features[featureName] || false;
};
rtoSchema.methods.getAvailableUserTypes = function () {
  const availableTypes = ["user", "admin"];
  if (this.hasFeature("assessors")) availableTypes.push("assessor");
  if (this.hasFeature("salesAgents")) availableTypes.push("sales_agent");
  if (this.hasFeature("salesManagers")) availableTypes.push("sales_manager");
  return availableTypes;
};
rtoSchema.methods.processEmailTemplate = function (templateName, variables = {}) {
  const template = this.emailTemplates[templateName];
  if (!template || !template.isActive) return null;
  let subject = template.subject;
  let body = template.body;
  const replacements = {
    ...variables,
    companyName: this.companyName,
    ceoName: this.ceoName,
    ceoCode: this.ceoCode,
    subdomain: this.subdomain,
  };
  Object.keys(replacements).forEach(key => {
    const regex = new RegExp(`{${key}}`, 'g');
    subject = subject.replace(regex, replacements[key]);
    body = body.replace(regex, replacements[key]);
  });
  return { subject, body, from: this.email, fromName: this.companyName };
};
rtoSchema.methods.getLimits = function () {
  return {
    maxUsers: this.settings.maxUsers,
    maxCertifications: this.settings.maxCertifications,
    maxFormTemplates: this.settings.maxFormTemplates,
    maxAssessors: this.settings.maxAssessors,
    maxSalesAgents: this.settings.maxSalesAgents,
  };
};

module.exports = mongoose.model("RTO", rtoSchema); 