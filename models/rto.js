const mongoose = require("mongoose");

const rtoSchema = new mongoose.Schema(
  {
    // Basic RTO Information
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },
    shortName: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      maxlength: 10
    },
    rtoCode: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      maxlength: 10
    },
    
    // Leadership
    ceoName: {
      type: String,
      required: true,
      trim: true
    },
    ceoEmail: {
      type: String,
      trim: true,
      lowercase: true
    },
    
    // Branding & Visual Identity
    logo: {
      url: {
        type: String,
        trim: true
      },
      alt: {
        type: String,
        trim: true,
        default: "RTO Logo"
      }
    },
    primaryColor: {
      type: String,
      trim: true,
      default: "#1f4e79"
    },
    secondaryColor: {
      type: String,
      trim: true,
      default: "#6b7280"
    },
    
    // Email Configuration
    emailConfig: {
      provider: {
        type: String,
        enum: ["smtp", "sendgrid", "aws-ses", "mailgun"],
        default: "smtp"
      },
      host: {
        type: String,
        trim: true
      },
      port: {
        type: Number,
        default: 587
      },
      secure: {
        type: Boolean,
        default: false
      },
      username: {
        type: String,
        trim: true
      },
      password: {
        type: String,
        trim: true
      },
      fromEmail: {
        type: String,
        trim: true,
        lowercase: true
      },
      fromName: {
        type: String,
        trim: true
      },
      replyTo: {
        type: String,
        trim: true,
        lowercase: true
      },
      apiKey: {
        type: String,
        trim: true
      }
    },
    
    // Important Documents
    documents: {
      confirmationOfEnrolment: {
        template: {
          type: String, // base64 or file path
          trim: true
        },
        required: {
          type: Boolean,
          default: true
        }
      },
      offerLetter: {
        template: {
          type: String,
          trim: true
        },
        required: {
          type: Boolean,
          default: true
        }
      },
      invoiceTemplate: {
        type: String,
        trim: true
      },
      termsAndConditions: {
        type: String,
        trim: true
      },
      privacyPolicy: {
        type: String,
        trim: true
      }
    },
    
    // Feature Switches
    features: {
      // User Management
      userManagement: {
        type: Boolean,
        default: true
      },
      
      // Task Management
      taskManagement: {
        type: Boolean,
        default: true
      },
      
      // Role-based Access Control
      roleBasedAccess: {
        type: Boolean,
        default: true
      }
    },
    
    // Contact Information
    contact: {
      address: {
        street: String,
        city: String,
        state: String,
        postcode: String,
        country: {
          type: String,
          default: "Australia"
        }
      },
      phone: {
        type: String,
        trim: true
      },
      website: {
        type: String,
        trim: true
      },
      supportEmail: {
        type: String,
        trim: true,
        lowercase: true
      }
    },
    
    // System Configuration
    timezone: {
      type: String,
      default: "Australia/Sydney"
    },
    dateFormat: {
      type: String,
      default: "DD/MM/YYYY"
    },
    currency: {
      type: String,
      default: "AUD"
    },
    
    // Status & Metadata
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active"
    },
    isDefault: {
      type: Boolean,
      default: false
    },
    
    // Audit fields
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for performance
rtoSchema.index({ rtoCode: 1 });
rtoSchema.index({ shortName: 1 });
rtoSchema.index({ status: 1 });
rtoSchema.index({ isDefault: 1 });

// Virtual for full address
rtoSchema.virtual("fullAddress").get(function() {
  if (!this.contact?.address) return "";
  
  const addr = this.contact.address;
  const parts = [addr.street, addr.city, addr.state, addr.postcode, addr.country]
    .filter(Boolean);
  return parts.join(", ");
});

// Virtual for display name
rtoSchema.virtual("displayName").get(function() {
  return this.name || this.shortName || this.rtoCode;
});

// Instance methods
rtoSchema.methods.isFeatureEnabled = function(feature) {
  return this.features?.[feature] === true;
};

rtoSchema.methods.getEmailConfig = function() {
  return {
    provider: this.emailConfig?.provider || "smtp",
    host: this.emailConfig?.host,
    port: this.emailConfig?.port || 587,
    secure: this.emailConfig?.secure || false,
    auth: {
      user: this.emailConfig?.username,
      pass: this.emailConfig?.password
    },
    from: {
      email: this.emailConfig?.fromEmail,
      name: this.emailConfig?.fromName
    },
    replyTo: this.emailConfig?.replyTo,
    apiKey: this.emailConfig?.apiKey
  };
};

rtoSchema.methods.getBranding = function() {
  return {
    name: this.name,
    shortName: this.shortName,
    logo: this.logo,
    primaryColor: this.primaryColor,
    secondaryColor: this.secondaryColor,
    ceoName: this.ceoName,
    displayName: this.displayName,
    fullAddress: this.fullAddress
  };
};

// Static methods
rtoSchema.statics.findByCode = function(rtoCode) {
  return this.findOne({ rtoCode, status: "active" });
};

rtoSchema.statics.getDefault = function() {
  return this.findOne({ isDefault: true, status: "active" });
};

rtoSchema.statics.getAllActive = function() {
  return this.find({ status: "active" }).sort({ name: 1 });
};

module.exports = mongoose.model("RTO", rtoSchema);
