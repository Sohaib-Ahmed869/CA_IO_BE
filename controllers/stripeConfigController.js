// controllers/stripeConfigController.js
const StripeConfig = require("../models/stripeConfig");
const RTO = require("../models/rto");
const StripeService = require("../services/stripeService");
const { logMe } = require("../utils/logger");

const stripeConfigController = {
  /**
   * Create Stripe configuration for RTO
   */
  createStripeConfig: async (req, res) => {
    try {
      const { rtoId } = req.params;
      const {
        stripeAccountId,
        secretKey,
        publishableKey,
        webhookSecret,
        paymentSettings = {},
        compliance = {},
        webhookEndpoints = []
      } = req.body;

      // Validate required fields
      if (!stripeAccountId || !secretKey || !publishableKey || !webhookSecret) {
        return res.status(400).json({
          success: false,
          message: "Missing required Stripe configuration fields",
          required: ["stripeAccountId", "secretKey", "publishableKey", "webhookSecret"]
        });
      }

      // Verify RTO exists
      const rto = await RTO.findById(rtoId);
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found"
        });
      }

      // Check if Stripe config already exists for this RTO
      const existingConfig = await StripeConfig.findOne({ rtoId });
      if (existingConfig) {
        return res.status(409).json({
          success: false,
          message: "Stripe configuration already exists for this RTO",
          data: { id: existingConfig._id }
        });
      }

      // Validate Stripe account ID format
      if (!/^acct_[0-9a-zA-Z]{16}$/.test(stripeAccountId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid Stripe account ID format"
        });
      }

      // Validate secret key format
      if (!secretKey.startsWith('sk_')) {
        return res.status(400).json({
          success: false,
          message: "Invalid Stripe secret key format"
        });
      }

      // Validate publishable key format
      if (!publishableKey.startsWith('pk_')) {
        return res.status(400).json({
          success: false,
          message: "Invalid Stripe publishable key format"
        });
      }

      // Validate webhook secret format
      if (!webhookSecret.startsWith('whsec_')) {
        return res.status(400).json({
          success: false,
          message: "Invalid Stripe webhook secret format"
        });
      }

      // Test Stripe connection
      try {
        const testStripe = require("stripe")(secretKey);
        const account = await testStripe.accounts.retrieve();
        
        if (account.id !== stripeAccountId) {
          return res.status(400).json({
            success: false,
            message: "Stripe account ID does not match the provided secret key"
          });
        }

        logMe('stripe.config.test_connection_success', {
          rtoId,
          stripeAccountId: account.id,
          accountType: account.type,
          country: account.country
        }, 'debug');

      } catch (stripeError) {
        return res.status(400).json({
          success: false,
          message: "Failed to connect to Stripe account",
          error: stripeError.message
        });
      }

      // Create Stripe configuration
      const stripeConfig = new StripeConfig({
        rtoId,
        stripeAccountId,
        secretKey,
        publishableKey,
        webhookSecret,
        paymentSettings: {
          currency: paymentSettings.currency || 'AUD',
          statementDescriptor: paymentSettings.statementDescriptor || 'CERTIFIED',
          statementDescriptorSuffix: paymentSettings.statementDescriptorSuffix || rto.shortName || 'RTO',
          receiptEmail: paymentSettings.receiptEmail || rto.contact?.email
        },
        compliance: {
          kycRequired: compliance.kycRequired !== false,
          taxIdRequired: compliance.taxIdRequired !== false,
          businessType: compliance.businessType || 'company',
          country: compliance.country || 'AU'
        },
        webhookEndpoints: webhookEndpoints.map(endpoint => ({
          url: endpoint.url,
          events: endpoint.events || ['payment_intent.succeeded', 'payment_intent.payment_failed'],
          enabled: endpoint.enabled !== false
        })),
        metadata: {
          setupBy: req.user._id,
          notes: `Stripe configuration setup for ${rto.name}`
        }
      });

      await stripeConfig.save();

      logMe('stripe.config.created', {
        rtoId,
        stripeAccountId,
        setupBy: req.user._id
      }, 'info');

      res.status(201).json({
        success: true,
        message: "Stripe configuration created successfully",
        data: {
          id: stripeConfig._id,
          stripeAccountId: stripeConfig.stripeAccountId,
          accountStatus: stripeConfig.accountStatus,
          capabilities: stripeConfig.capabilities,
          paymentSettings: stripeConfig.paymentSettings
        }
      });

    } catch (error) {
      logMe('stripe.config.create_error', {
        rtoId: req.params.rtoId,
        error: error.message,
        userId: req.user?._id
      }, 'error');

      res.status(500).json({
        success: false,
        message: "Failed to create Stripe configuration",
        error: error.message
      });
    }
  },

  /**
   * Get Stripe configuration for RTO
   */
  getStripeConfig: async (req, res) => {
    try {
      const { rtoId } = req.params;

      const stripeConfig = await StripeConfig.findOne({ rtoId, isActive: true });
      
      if (!stripeConfig) {
        return res.status(404).json({
          success: false,
          message: "No Stripe configuration found for this RTO"
        });
      }

      res.json({
        success: true,
        data: {
          id: stripeConfig._id,
          rtoId: stripeConfig.rtoId,
          stripeAccountId: stripeConfig.stripeAccountId,
          publishableKey: stripeConfig.publishableKey,
          accountStatus: stripeConfig.accountStatus,
          capabilities: stripeConfig.capabilities,
          paymentSettings: stripeConfig.paymentSettings,
          compliance: stripeConfig.compliance,
          webhookEndpoints: stripeConfig.webhookEndpoints,
          lastApiCall: stripeConfig.lastApiCall,
          apiCallCount: stripeConfig.apiCallCount,
          createdAt: stripeConfig.createdAt,
          updatedAt: stripeConfig.updatedAt
        }
      });

    } catch (error) {
      logMe('stripe.config.get_error', {
        rtoId: req.params.rtoId,
        error: error.message,
        userId: req.user?._id
      }, 'error');

      res.status(500).json({
        success: false,
        message: "Failed to retrieve Stripe configuration",
        error: error.message
      });
    }
  },

  /**
   * Update Stripe configuration for RTO
   */
  updateStripeConfig: async (req, res) => {
    try {
      const { rtoId } = req.params;
      const updates = req.body;

      const stripeConfig = await StripeConfig.findOne({ rtoId, isActive: true });
      
      if (!stripeConfig) {
        return res.status(404).json({
          success: false,
          message: "No Stripe configuration found for this RTO"
        });
      }

      // Validate secret key if provided
      if (updates.secretKey && !updates.secretKey.startsWith('sk_')) {
        return res.status(400).json({
          success: false,
          message: "Invalid Stripe secret key format"
        });
      }

      // Validate publishable key if provided
      if (updates.publishableKey && !updates.publishableKey.startsWith('pk_')) {
        return res.status(400).json({
          success: false,
          message: "Invalid Stripe publishable key format"
        });
      }

      // Validate webhook secret if provided
      if (updates.webhookSecret && !updates.webhookSecret.startsWith('whsec_')) {
        return res.status(400).json({
          success: false,
          message: "Invalid Stripe webhook secret format"
        });
      }

      // Update configuration
      Object.keys(updates).forEach(key => {
        if (key !== 'rtoId' && key !== '_id' && key !== 'createdAt' && key !== 'updatedAt') {
          stripeConfig[key] = updates[key];
        }
      });

      stripeConfig.updatedAt = new Date();
      await stripeConfig.save();

      logMe('stripe.config.updated', {
        rtoId,
        updatedFields: Object.keys(updates),
        userId: req.user._id
      }, 'info');

      res.json({
        success: true,
        message: "Stripe configuration updated successfully",
        data: {
          id: stripeConfig._id,
          stripeAccountId: stripeConfig.stripeAccountId,
          accountStatus: stripeConfig.accountStatus,
          capabilities: stripeConfig.capabilities,
          paymentSettings: stripeConfig.paymentSettings,
          updatedAt: stripeConfig.updatedAt
        }
      });

    } catch (error) {
      logMe('stripe.config.update_error', {
        rtoId: req.params.rtoId,
        error: error.message,
        userId: req.user?._id
      }, 'error');

      res.status(500).json({
        success: false,
        message: "Failed to update Stripe configuration",
        error: error.message
      });
    }
  },

  /**
   * Delete Stripe configuration for RTO
   */
  deleteStripeConfig: async (req, res) => {
    try {
      const { rtoId } = req.params;

      const stripeConfig = await StripeConfig.findOne({ rtoId, isActive: true });
      
      if (!stripeConfig) {
        return res.status(404).json({
          success: false,
          message: "No Stripe configuration found for this RTO"
        });
      }

      // Soft delete - mark as inactive
      stripeConfig.isActive = false;
      stripeConfig.updatedAt = new Date();
      await stripeConfig.save();

      logMe('stripe.config.deleted', {
        rtoId,
        stripeAccountId: stripeConfig.stripeAccountId,
        userId: req.user._id
      }, 'info');

      res.json({
        success: true,
        message: "Stripe configuration deleted successfully"
      });

    } catch (error) {
      logMe('stripe.config.delete_error', {
        rtoId: req.params.rtoId,
        error: error.message,
        userId: req.user?._id
      }, 'error');

      res.status(500).json({
        success: false,
        message: "Failed to delete Stripe configuration",
        error: error.message
      });
    }
  },

  /**
   * Test Stripe connection for RTO
   */
  testStripeConnection: async (req, res) => {
    try {
      const { rtoId } = req.params;

      const stripeService = new StripeService(rtoId);
      await stripeService.initialize();

      const stripe = await stripeService.getStripe();
      const account = await stripe.accounts.retrieve();

      res.json({
        success: true,
        message: "Stripe connection successful",
        data: {
          accountId: account.id,
          accountType: account.type,
          country: account.country,
          currency: account.default_currency,
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted
        }
      });

    } catch (error) {
      logMe('stripe.config.test_connection_error', {
        rtoId: req.params.rtoId,
        error: error.message,
        userId: req.user?._id
      }, 'error');

      res.status(500).json({
        success: false,
        message: "Failed to test Stripe connection",
        error: error.message
      });
    }
  },

  /**
   * Validate Stripe keys without creating/updating configuration
   */
  validateStripeKeys: async (req, res) => {
    try {
      const { rtoId } = req.params;
      const {
        stripeAccountId,
        secretKey,
        publishableKey,
        webhookSecret
      } = req.body;

      // Validate required fields
      if (!stripeAccountId || !secretKey || !publishableKey || !webhookSecret) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields for validation",
          required: ["stripeAccountId", "secretKey", "publishableKey", "webhookSecret"]
        });
      }

      // Validate Stripe account ID format
      if (!/^acct_[0-9a-zA-Z]{16}$/.test(stripeAccountId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid Stripe account ID format",
          data: {
            valid: false,
            validationResults: {
              stripeAccountId: "invalid",
              secretKey: "not_tested",
              publishableKey: "not_tested",
              webhookSecret: "not_tested",
              accountMatch: false,
              errors: ["Invalid Stripe account ID format"]
            }
          }
        });
      }

      // Validate secret key format
      if (!secretKey.startsWith('sk_')) {
        return res.status(400).json({
          success: false,
          message: "Invalid Stripe secret key format",
          data: {
            valid: false,
            validationResults: {
              stripeAccountId: "valid",
              secretKey: "invalid",
              publishableKey: "not_tested",
              webhookSecret: "not_tested",
              accountMatch: false,
              errors: ["Invalid secret key format"]
            }
          }
        });
      }

      // Validate publishable key format
      if (!publishableKey.startsWith('pk_')) {
        return res.status(400).json({
          success: false,
          message: "Invalid Stripe publishable key format",
          data: {
            valid: false,
            validationResults: {
              stripeAccountId: "valid",
              secretKey: "valid",
              publishableKey: "invalid",
              webhookSecret: "not_tested",
              accountMatch: false,
              errors: ["Invalid publishable key format"]
            }
          }
        });
      }

      // Validate webhook secret format
      if (!webhookSecret.startsWith('whsec_')) {
        return res.status(400).json({
          success: false,
          message: "Invalid Stripe webhook secret format",
          data: {
            valid: false,
            validationResults: {
              stripeAccountId: "valid",
              secretKey: "valid",
              publishableKey: "valid",
              webhookSecret: "invalid",
              accountMatch: false,
              errors: ["Invalid webhook secret format"]
            }
          }
        });
      }

      // Test Stripe connection with provided keys
      try {
        const stripe = require("stripe")(secretKey);
        const account = await stripe.accounts.retrieve();
        
        // Verify account ID matches
        if (account.id !== stripeAccountId) {
          return res.status(400).json({
            success: false,
            message: "Account ID mismatch",
            data: {
              valid: false,
              validationResults: {
                stripeAccountId: "valid",
                secretKey: "valid",
                publishableKey: "valid",
                webhookSecret: "valid",
                accountMatch: false,
                errors: ["Account ID does not match the provided secret key"]
              }
            }
          });
        }

        logMe('stripe.config.validation_success', {
          rtoId,
          stripeAccountId: account.id,
          accountType: account.type,
          country: account.country
        }, 'info');

        res.json({
          success: true,
          message: "Stripe keys validation successful",
          data: {
            valid: true,
            accountId: account.id,
            accountType: account.type,
            country: account.country,
            currency: account.default_currency,
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled,
            detailsSubmitted: account.details_submitted,
            businessProfile: {
              name: account.business_profile?.name,
              support_email: account.business_profile?.support_email
            },
            validationResults: {
              stripeAccountId: "valid",
              secretKey: "valid",
              publishableKey: "valid",
              webhookSecret: "valid",
              accountMatch: true
            }
          }
        });

      } catch (stripeError) {
        logMe('stripe.config.validation_error', {
          rtoId,
          stripeAccountId,
          error: stripeError.message
        }, 'error');

        return res.status(400).json({
          success: false,
          message: "Stripe connection failed",
          data: {
            valid: false,
            validationResults: {
              stripeAccountId: "valid",
              secretKey: "invalid",
              publishableKey: "not_tested",
              webhookSecret: "not_tested",
              accountMatch: false,
              errors: [stripeError.message]
            }
          }
        });
      }

    } catch (error) {
      logMe('stripe.config.validation_error', {
        rtoId: req.params.rtoId,
        error: error.message,
        userId: req.user?._id
      }, 'error');

      res.status(500).json({
        success: false,
        message: "Failed to validate Stripe keys",
        error: error.message
      });
    }
  },

  /**
   * Get all Stripe configurations (Admin only)
   */
  getAllStripeConfigs: async (req, res) => {
    try {
      const { page = 1, limit = 10, status, search } = req.query;
      const skip = (page - 1) * limit;

      let filter = { isActive: true };
      
      if (status) {
        filter.accountStatus = status;
      }

      if (search) {
        filter.$or = [
          { stripeAccountId: { $regex: search, $options: 'i' } }
        ];
      }

      const stripeConfigs = await StripeConfig.find(filter)
        .populate('rtoId', 'name rtoCode shortName')
        .populate('metadata.setupBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await StripeConfig.countDocuments(filter);

      res.json({
        success: true,
        data: {
          stripeConfigs: stripeConfigs.map(config => ({
            id: config._id,
            rtoId: config.rtoId,
            stripeAccountId: config.stripeAccountId,
            publishableKey: config.publishableKey,
            accountStatus: config.accountStatus,
            capabilities: config.capabilities,
            lastApiCall: config.lastApiCall,
            apiCallCount: config.apiCallCount,
            createdAt: config.createdAt,
            setupBy: config.metadata.setupBy
          })),
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total
          }
        }
      });

    } catch (error) {
      logMe('stripe.config.get_all_error', {
        error: error.message,
        userId: req.user?._id
      }, 'error');

      res.status(500).json({
        success: false,
        message: "Failed to retrieve Stripe configurations",
        error: error.message
      });
    }
  },

  /**
   * Test Stripe keys validity without transactions
   */
  testStripeKeys: async (req, res) => {
    try {
      const { secretKey, publishableKey, webhookSecret } = req.body;
      const stripe = require('stripe');

      const results = {
        secretKey: { status: 'PENDING', valid: false },
        publishableKey: { status: 'PENDING', valid: false },
        webhookSecret: { status: 'PENDING', valid: false },
        accountInfo: null,
        overallStatus: 'PENDING'
      };

      // Test 1: Validate Secret Key
      if (secretKey) {
        try {
          if (!secretKey.startsWith('sk_')) {
            results.secretKey = {
              status: 'FAIL',
              valid: false,
              error: 'Secret key must start with "sk_"'
            };
          } else {
            const stripeInstance = stripe(secretKey);
            
            // Test by retrieving account info (no transaction)
            const account = await stripeInstance.accounts.retrieve();
            
            results.secretKey = {
              status: 'PASS',
              valid: true,
              accountId: account.id,
              country: account.country,
              email: account.email,
              chargesEnabled: account.charges_enabled,
              payoutsEnabled: account.payouts_enabled,
              detailsSubmitted: account.details_submitted
            };

            results.accountInfo = {
              id: account.id,
              country: account.country,
              email: account.email,
              chargesEnabled: account.charges_enabled,
              payoutsEnabled: account.payouts_enabled,
              detailsSubmitted: account.details_submitted
            };
          }
        } catch (error) {
          results.secretKey = {
            status: 'FAIL',
            valid: false,
            error: error.message
          };
        }
      } else {
        results.secretKey = {
          status: 'FAIL',
          valid: false,
          error: 'Secret key is required'
        };
      }

      // Test 2: Validate Publishable Key
      if (publishableKey) {
        if (publishableKey.startsWith('pk_test_') || publishableKey.startsWith('pk_live_')) {
          results.publishableKey = {
            status: 'PASS',
            valid: true,
            environment: publishableKey.startsWith('pk_test_') ? 'test' : 'live'
          };
        } else {
          results.publishableKey = {
            status: 'FAIL',
            valid: false,
            error: 'Publishable key must start with "pk_test_" or "pk_live_"'
          };
        }
      } else {
        results.publishableKey = {
          status: 'FAIL',
          valid: false,
          error: 'Publishable key is required'
        };
      }

      // Test 3: Validate Webhook Secret
      if (webhookSecret) {
        if (webhookSecret.startsWith('whsec_')) {
          results.webhookSecret = {
            status: 'PASS',
            valid: true
          };
        } else {
          results.webhookSecret = {
            status: 'FAIL',
            valid: false,
            error: 'Webhook secret must start with "whsec_"'
          };
        }
      } else {
        results.webhookSecret = {
          status: 'FAIL',
          valid: false,
          error: 'Webhook secret is required'
        };
      }

      // Determine overall status
      const allValid = results.secretKey.valid && results.publishableKey.valid && results.webhookSecret.valid;
      results.overallStatus = allValid ? 'PASS' : 'FAIL';

      // Log the test
      logMe('stripe.keys.test', {
        overallStatus: results.overallStatus,
        secretKeyValid: results.secretKey.valid,
        publishableKeyValid: results.publishableKey.valid,
        webhookSecretValid: results.webhookSecret.valid,
        accountId: results.accountInfo?.id
      }, allValid ? 'info' : 'warn');

      res.json({
        success: true,
        message: "Stripe keys validation completed",
        data: results
      });

    } catch (error) {
      logMe('stripe.keys.test_error', {
        error: error.message
      }, 'error');

      res.status(500).json({
        success: false,
        message: "Failed to test Stripe keys",
        error: error.message
      });
    }
  },

  /**
   * Verify Stripe configuration for a specific RTO
   */
  verifyStripeConfig: async (req, res) => {
    try {
      const { rtoId } = req.params;
      const stripe = require('stripe');

      // Get Stripe configuration
      const stripeConfig = await StripeConfig.findOne({ rtoId }).populate('rtoId');
      
      if (!stripeConfig) {
        return res.status(404).json({
          success: false,
          message: "Stripe configuration not found for this RTO"
        });
      }

      if (!stripeConfig.isActive) {
        return res.status(400).json({
          success: false,
          message: "Stripe configuration is inactive"
        });
      }

      const results = {
        rtoName: stripeConfig.rtoId?.name || 'Unknown',
        rtoCode: stripeConfig.rtoId?.rtoCode || 'Unknown',
        stripeAccountId: stripeConfig.stripeAccountId,
        accountStatus: stripeConfig.accountStatus,
        tests: {},
        overallStatus: 'PENDING'
      };

      try {
        // Test 1: Verify Secret Key
        const secretKey = stripeConfig.getDecryptedSecretKey();
        const stripeInstance = stripe(secretKey);
        
        // Test by retrieving account info
        const account = await stripeInstance.accounts.retrieve();
        results.tests.secretKey = {
          status: 'PASS',
          accountId: account.id,
          country: account.country,
          email: account.email,
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted
        };

        // Test 2: Verify Publishable Key
        const publishableKey = stripeConfig.getDecryptedPublishableKey();
        results.tests.publishableKey = {
          status: publishableKey && publishableKey.startsWith('pk_') ? 'PASS' : 'FAIL',
          key: publishableKey ? publishableKey.substring(0, 20) + '...' : 'Not found'
        };

        // Test 3: Verify Webhook Secret
        const webhookSecret = stripeConfig.getDecryptedWebhookSecret();
        results.tests.webhookSecret = {
          status: webhookSecret && webhookSecret.startsWith('whsec_') ? 'PASS' : 'FAIL',
          secret: webhookSecret ? webhookSecret.substring(0, 20) + '...' : 'Not found'
        };

        // Test 4: Test Payment Intent Creation (Dry Run)
        try {
          const testPaymentIntent = await stripeInstance.paymentIntents.create({
            amount: 100, // $1.00 AUD
            currency: stripeConfig.paymentSettings?.currency || 'aud',
            metadata: {
              rtoId: stripeConfig.rtoId._id.toString(),
              test: 'true',
              verifiedAt: new Date().toISOString()
            },
            automatic_payment_methods: {
              enabled: true,
            },
          });
          
          results.tests.paymentIntent = {
            status: 'PASS',
            paymentIntentId: testPaymentIntent.id,
            amount: testPaymentIntent.amount,
            currency: testPaymentIntent.currency
          };

          // Cancel the test payment intent
          await stripeInstance.paymentIntents.cancel(testPaymentIntent.id);

        } catch (paymentError) {
          results.tests.paymentIntent = {
            status: 'FAIL',
            error: paymentError.message
          };
        }

        // Test 5: Account Capabilities
        results.tests.capabilities = {
          cardPayments: stripeConfig.capabilities?.cardPayments || false,
          transfers: stripeConfig.capabilities?.transfers || false,
          taxReporting: stripeConfig.capabilities?.taxReporting || false,
          accountChargesEnabled: account.charges_enabled,
          accountPayoutsEnabled: account.payouts_enabled
        };

        // Determine overall status
        const allTestsPass = Object.values(results.tests).every(test => 
          test.status === 'PASS' || (test.cardPayments !== undefined) // capabilities test
        );
        results.overallStatus = allTestsPass ? 'PASS' : 'FAIL';

        logMe('stripe.config.verification_success', {
          rtoId,
          stripeAccountId: stripeConfig.stripeAccountId,
          overallStatus: results.overallStatus
        }, 'info');

        res.json({
          success: true,
          message: "Stripe configuration verification completed",
          data: results
        });

      } catch (error) {
        results.tests.general = {
          status: 'FAIL',
          error: error.message
        };
        results.overallStatus = 'FAIL';

        logMe('stripe.config.verification_error', {
          rtoId,
          error: error.message
        }, 'error');

        res.json({
          success: true,
          message: "Stripe configuration verification completed with errors",
          data: results
        });
      }

    } catch (error) {
      logMe('stripe.config.verification_controller_error', {
        error: error.message
      }, 'error');

      res.status(500).json({
        success: false,
        message: "Failed to verify Stripe configuration",
        error: error.message
      });
    }
  },

  /**
   * Verify all Stripe configurations
   */
  verifyAllStripeConfigs: async (req, res) => {
    try {
      const stripe = require('stripe');
      const results = [];

      // Get all active Stripe configurations
      const stripeConfigs = await StripeConfig.find({ isActive: true }).populate('rtoId');
      
      if (stripeConfigs.length === 0) {
        return res.json({
          success: true,
          message: "No active Stripe configurations found",
          data: {
            total: 0,
            passed: 0,
            failed: 0,
            results: []
          }
        });
      }

      for (const config of stripeConfigs) {
        const result = {
          rtoName: config.rtoId?.name || 'Unknown',
          rtoCode: config.rtoId?.rtoCode || 'Unknown',
          stripeAccountId: config.stripeAccountId,
          accountStatus: config.accountStatus,
          tests: {},
          overallStatus: 'PENDING'
        };

        try {
          // Test Secret Key
          const secretKey = config.getDecryptedSecretKey();
          const stripeInstance = stripe(secretKey);
          const account = await stripeInstance.accounts.retrieve();
          
          result.tests.secretKey = {
            status: 'PASS',
            accountId: account.id,
            country: account.country,
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled
          };

          // Test other keys
          const publishableKey = config.getDecryptedPublishableKey();
          result.tests.publishableKey = {
            status: publishableKey && publishableKey.startsWith('pk_') ? 'PASS' : 'FAIL'
          };

          const webhookSecret = config.getDecryptedWebhookSecret();
          result.tests.webhookSecret = {
            status: webhookSecret && webhookSecret.startsWith('whsec_') ? 'PASS' : 'FAIL'
          };

          result.overallStatus = 'PASS';

        } catch (error) {
          result.tests.general = {
            status: 'FAIL',
            error: error.message
          };
          result.overallStatus = 'FAIL';
        }

        results.push(result);
      }

      const passed = results.filter(r => r.overallStatus === 'PASS').length;
      const failed = results.filter(r => r.overallStatus === 'FAIL').length;

      logMe('stripe.config.verify_all_completed', {
        total: results.length,
        passed,
        failed
      }, 'info');

      res.json({
        success: true,
        message: `Verified ${results.length} Stripe configurations`,
        data: {
          total: results.length,
          passed,
          failed,
          results
        }
      });

    } catch (error) {
      logMe('stripe.config.verify_all_error', {
        error: error.message
      }, 'error');

      res.status(500).json({
        success: false,
        message: "Failed to verify Stripe configurations",
        error: error.message
      });
    }
  }
};

module.exports = stripeConfigController;
