// models/emailConfig.js
const mongoose = require("mongoose");
const crypto = require("crypto");

const emailConfigSchema = new mongoose.Schema(
  {
    rtoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RTO",
      required: true,
      unique: true,
    },
    emailProvider: {
      type: String,
      enum: ["gmail", "outlook", "custom"],
      required: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
    },
    // Encrypted password
    encryptedPassword: {
      type: String,
      required: true,
    },
    // For custom SMTP
    smtpHost: {
      type: String,
      trim: true,
    },
    smtpPort: {
      type: Number,
      default: 587,
    },
    smtpSecure: {
      type: Boolean,
      default: false, // true for 465, false for other ports
    },
    // Configuration status
    isActive: {
      type: Boolean,
      default: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    // Test status
    lastTested: {
      type: Date,
    },
    testStatus: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
    },
    testError: {
      type: String,
    },
    // Usage tracking
    emailsSent: {
      type: Number,
      default: 0,
    },
    lastUsed: {
      type: Date,
    },
    // Created/Updated
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
emailConfigSchema.index({ rtoId: 1 });
emailConfigSchema.index({ isActive: 1 });
emailConfigSchema.index({ emailProvider: 1 });

// Encryption key (should be in environment variables in production)
const ENCRYPTION_KEY = process.env.EMAIL_ENCRYPTION_KEY || "your-secret-key-32-chars-long!!";

// Encryption/Decryption methods
emailConfigSchema.methods.encryptPassword = function(password) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher("aes-256-cbc", ENCRYPTION_KEY);
  let encrypted = cipher.update(password, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
};

emailConfigSchema.methods.decryptPassword = function() {
  try {
    const parts = this.encryptedPassword.split(":");
    const iv = Buffer.from(parts[0], "hex");
    const encrypted = parts[1];
    const decipher = crypto.createDecipher("aes-256-cbc", ENCRYPTION_KEY);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    throw new Error("Failed to decrypt password");
  }
};

// Pre-save middleware to encrypt password
emailConfigSchema.pre("save", function(next) {
  if (this.isModified("password")) {
    this.encryptedPassword = this.encryptPassword(this.password);
  }
  next();
});

// Virtual for password (for setting, not getting)
emailConfigSchema.virtual("password").set(function(password) {
  this._password = password;
});

// Method to set password
emailConfigSchema.methods.setPassword = function(password) {
  this.encryptedPassword = this.encryptPassword(password);
};

// Method to get decrypted password
emailConfigSchema.methods.getPassword = function() {
  return this.decryptPassword();
};

// Method to test email configuration
emailConfigSchema.methods.testConnection = async function() {
  const nodemailer = require("nodemailer");
  
  try {
    let transporterConfig;
    
    switch (this.emailProvider) {
      case "gmail":
        transporterConfig = {
          service: "gmail",
          auth: {
            user: this.email,
            pass: this.getPassword(),
          },
        };
        break;
        
      case "outlook":
        transporterConfig = {
          host: "smtp-mail.outlook.com",
          port: 587,
          secure: false,
          auth: {
            user: this.email,
            pass: this.getPassword(),
          },
        };
        break;
        
      case "custom":
        transporterConfig = {
          host: this.smtpHost,
          port: this.smtpPort,
          secure: this.smtpSecure,
          auth: {
            user: this.email,
            pass: this.getPassword(),
          },
        };
        break;
        
      default:
        throw new Error("Unsupported email provider");
    }
    
    const transporter = nodemailer.createTransport(transporterConfig);
    
    // Test the connection
    await transporter.verify();
    
    // Update test status
    this.testStatus = "success";
    this.lastTested = new Date();
    this.testError = null;
    
    await this.save();
    return true;
    
  } catch (error) {
    this.testStatus = "failed";
    this.lastTested = new Date();
    this.testError = error.message;
    await this.save();
    throw error;
  }
};

module.exports = mongoose.model("EmailConfig", emailConfigSchema); 