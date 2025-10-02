// models/stripeConfig.js
const mongoose = require("mongoose");

const stripeConfigSchema = new mongoose.Schema(
  {
    // RTO Reference
    rtoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RTO",
      required: true,
      unique: true,
      index: true,
    },

    // Stripe Account Configuration
    stripeAccountId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      validate: {
        validator: function(v) {
          // Stripe account ID format validation
          return /^acct_[0-9a-zA-Z]{16}$/.test(v);
        },
        message: 'Invalid Stripe account ID format'
      }
    },

    // Stripe API Keys (encrypted)
    secretKey: {
      type: String,
      required: true,
      // Will be encrypted before saving
    },

    publishableKey: {
      type: String,
      required: true,
      // Will be encrypted before saving
    },

    webhookSecret: {
      type: String,
      required: true,
      // Will be encrypted before saving
    },

    // Stripe Connect Configuration
    connectAccountId: {
      type: String,
      // For Stripe Connect (if using marketplace model)
    },

    // Stripe Account Status
    accountStatus: {
      type: String,
      enum: ['active', 'restricted', 'pending', 'rejected'],
      default: 'pending'
    },

    // Account Capabilities
    capabilities: {
      cardPayments: {
        type: Boolean,
        default: false
      },
      transfers: {
        type: Boolean,
        default: false
      },
      taxReporting: {
        type: Boolean,
        default: false
      }
    },

    // Webhook Configuration
    webhookEndpoints: [{
      url: {
        type: String,
        required: true
      },
      events: [{
        type: String
      }],
      enabled: {
        type: Boolean,
        default: true
      },
      lastTriggered: Date
    }],

    // Payment Processing Settings
    paymentSettings: {
      currency: {
        type: String,
        default: 'AUD'
      },
      statementDescriptor: {
        type: String,
        maxlength: 22,
        default: 'CERTIFIED'
      },
      statementDescriptorSuffix: {
        type: String,
        maxlength: 20
      },
      receiptEmail: {
        type: String,
        validate: {
          validator: function(v) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
          },
          message: 'Invalid email format'
        }
      }
    },

    // Compliance & Security
    compliance: {
      kycRequired: {
        type: Boolean,
        default: true
      },
      taxIdRequired: {
        type: Boolean,
        default: true
      },
      businessType: {
        type: String,
        enum: ['individual', 'company', 'non_profit', 'government_entity']
      },
      country: {
        type: String,
        default: 'AU'
      }
    },

    // Audit Trail
    lastApiCall: Date,
    lastWebhookReceived: Date,
    apiCallCount: {
      type: Number,
      default: 0
    },

    // Metadata
    metadata: {
      setupDate: {
        type: Date,
        default: Date.now
      },
      setupBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      notes: String
    },

    // Security
    isActive: {
      type: Boolean,
      default: true
    },

    // Encryption
    encryptionKey: {
      type: String,
      // Will store the encryption key reference
    }
  },
  {
    timestamps: true,
    toJSON: { 
      transform: function(doc, ret) {
        // Never expose secret keys in JSON responses
        delete ret.secretKey;
        delete ret.webhookSecret;
        delete ret.encryptionKey;
        return ret;
      }
    }
  }
);

// Indexes for performance
stripeConfigSchema.index({ rtoId: 1 });
stripeConfigSchema.index({ stripeAccountId: 1 });
stripeConfigSchema.index({ isActive: 1 });
stripeConfigSchema.index({ accountStatus: 1 });

// Pre-save middleware to encrypt sensitive data
stripeConfigSchema.pre('save', async function(next) {
  if (this.isModified('secretKey') || this.isModified('webhookSecret')) {
    try {
      const crypto = require('crypto');
      const algorithm = 'aes-256-gcm';
      
      // Generate encryption key if not exists
      if (!this.encryptionKey) {
        this.encryptionKey = crypto.randomBytes(32).toString('hex');
      }
      
      const key = Buffer.from(this.encryptionKey, 'hex');
      
      // Encrypt secret key
      if (this.secretKey && !this.secretKey.startsWith('sk_encrypted_')) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        cipher.setAAD(Buffer.from('stripe-secret'));
        
        let encrypted = cipher.update(this.secretKey, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        
        this.secretKey = `sk_encrypted_${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
      }
      
      // Encrypt webhook secret
      if (this.webhookSecret && !this.webhookSecret.startsWith('whsec_encrypted_')) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        cipher.setAAD(Buffer.from('stripe-webhook'));
        
        let encrypted = cipher.update(this.webhookSecret, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        
        this.webhookSecret = `whsec_encrypted_${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
      }
      
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Instance method to decrypt secret key
stripeConfigSchema.methods.getDecryptedSecretKey = function() {
  if (!this.secretKey.startsWith('sk_encrypted_')) {
    return this.secretKey; // Already decrypted or not encrypted
  }
  
  try {
    const crypto = require('crypto');
    const algorithm = 'aes-256-gcm';
    
    const key = Buffer.from(this.encryptionKey, 'hex');
    const parts = this.secretKey.replace('sk_encrypted_', '').split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAAD(Buffer.from('stripe-secret'));
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error('Failed to decrypt Stripe secret key');
  }
};

// Instance method to decrypt webhook secret
stripeConfigSchema.methods.getDecryptedWebhookSecret = function() {
  if (!this.webhookSecret.startsWith('whsec_encrypted_')) {
    return this.webhookSecret; // Already decrypted or not encrypted
  }
  
  try {
    const crypto = require('crypto');
    const algorithm = 'aes-256-gcm';
    
    const key = Buffer.from(this.encryptionKey, 'hex');
    const parts = this.webhookSecret.replace('whsec_encrypted_', '').split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAAD(Buffer.from('stripe-webhook'));
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error('Failed to decrypt Stripe webhook secret');
  }
};

// Static method to find by RTO ID
stripeConfigSchema.statics.findByRtoId = function(rtoId) {
  return this.findOne({ rtoId, isActive: true });
};

// Static method to find by Stripe account ID
stripeConfigSchema.statics.findByStripeAccountId = function(stripeAccountId) {
  return this.findOne({ stripeAccountId, isActive: true });
};

module.exports = mongoose.model("StripeConfig", stripeConfigSchema);
