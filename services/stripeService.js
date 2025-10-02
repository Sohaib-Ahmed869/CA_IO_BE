// services/stripeService.js
const stripe = require("stripe");
const StripeConfig = require("../models/stripeConfig");
const { logMe } = require("../utils/logger");

class StripeService {
  constructor(rtoId = null) {
    this.rtoId = rtoId;
    this.stripeConfig = null;
    this.stripeInstance = null;
  }

  /**
   * Initialize Stripe instance with RTO-specific configuration
   */
  async initialize() {
    try {
      if (!this.rtoId) {
        throw new Error("RTO ID is required for Stripe service initialization");
      }

      // Get RTO-specific Stripe configuration
      this.stripeConfig = await StripeConfig.findByRtoId(this.rtoId);
      
      if (!this.stripeConfig) {
        throw new Error(`No Stripe configuration found for RTO: ${this.rtoId}`);
      }

      if (!this.stripeConfig.isActive) {
        throw new Error(`Stripe configuration is inactive for RTO: ${this.rtoId}`);
      }

      if (this.stripeConfig.accountStatus !== 'active') {
        throw new Error(`Stripe account is not active for RTO: ${this.rtoId}. Status: ${this.stripeConfig.accountStatus}`);
      }

      // Decrypt and initialize Stripe instance
      const secretKey = this.stripeConfig.getDecryptedSecretKey();
      this.stripeInstance = stripe(secretKey);

      logMe('stripe.service.initialized', {
        rtoId: this.rtoId,
        stripeAccountId: this.stripeConfig.stripeAccountId,
        accountStatus: this.stripeConfig.accountStatus
      }, 'debug');

      return this;
    } catch (error) {
      logMe('stripe.service.initialization_error', {
        rtoId: this.rtoId,
        error: error.message
      }, 'error');
      throw error;
    }
  }

  /**
   * Get Stripe instance (lazy initialization)
   */
  async getStripe() {
    if (!this.stripeInstance) {
      await this.initialize();
    }
    return this.stripeInstance;
  }

  /**
   * Get RTO-specific publishable key
   */
  getPublishableKey() {
    if (!this.stripeConfig) {
      throw new Error("Stripe service not initialized");
    }
    return this.stripeConfig.publishableKey;
  }

  /**
   * Get RTO-specific webhook secret
   */
  getWebhookSecret() {
    if (!this.stripeConfig) {
      throw new Error("Stripe service not initialized");
    }
    return this.stripeConfig.getDecryptedWebhookSecret();
  }

  /**
   * Create or retrieve Stripe customer for RTO
   */
  async createOrRetrieveCustomer(userEmail, userName, userPhone, metadata = {}) {
    try {
      const stripe = await this.getStripe();
      
      // Add RTO context to metadata
      const customerMetadata = {
        ...metadata,
        rtoId: this.rtoId.toString(),
        rtoCode: this.stripeConfig.rtoCode || 'unknown'
      };

      // Check if customer already exists for this RTO
      const existingCustomers = await stripe.customers.list({
        email: userEmail,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        const customer = existingCustomers.data[0];
        
        // Update metadata to include RTO context
        await stripe.customers.update(customer.id, {
          metadata: customerMetadata
        });
        
        logMe('stripe.customer.retrieved', {
          rtoId: this.rtoId,
          customerId: customer.id,
          email: userEmail
        }, 'debug');
        
        return customer;
      }

      // Create new customer with RTO context
      const customer = await stripe.customers.create({
        email: userEmail,
        name: userName,
        phone: userPhone,
        metadata: customerMetadata,
        description: `Customer for RTO: ${this.stripeConfig.rtoCode || this.rtoId}`
      });

      logMe('stripe.customer.created', {
        rtoId: this.rtoId,
        customerId: customer.id,
        email: userEmail
      }, 'debug');

      return customer;
    } catch (error) {
      logMe('stripe.customer.error', {
        rtoId: this.rtoId,
        email: userEmail,
        error: error.message
      }, 'error');
      throw error;
    }
  }

  /**
   * Create payment intent for RTO
   */
  async createPaymentIntent(amount, currency, customerId, metadata = {}) {
    try {
      const stripe = await this.getStripe();
      
      // Add RTO context to metadata
      const paymentMetadata = {
        ...metadata,
        rtoId: this.rtoId.toString(),
        rtoCode: this.stripeConfig.rtoCode || 'unknown'
      };

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency || this.stripeConfig.paymentSettings.currency,
        customer: customerId,
        metadata: paymentMetadata,
        statement_descriptor: this.stripeConfig.paymentSettings.statementDescriptor,
        statement_descriptor_suffix: this.stripeConfig.paymentSettings.statementDescriptorSuffix,
        receipt_email: this.stripeConfig.paymentSettings.receiptEmail
      });

      logMe('stripe.payment_intent.created', {
        rtoId: this.rtoId,
        paymentIntentId: paymentIntent.id,
        amount: amount,
        currency: currency
      }, 'debug');

      return paymentIntent;
    } catch (error) {
      logMe('stripe.payment_intent.error', {
        rtoId: this.rtoId,
        amount: amount,
        error: error.message
      }, 'error');
      throw error;
    }
  }

  /**
   * Create setup intent for RTO
   */
  async createSetupIntent(customerId, metadata = {}) {
    try {
      const stripe = await this.getStripe();
      
      const setupMetadata = {
        ...metadata,
        rtoId: this.rtoId.toString(),
        rtoCode: this.stripeConfig.rtoCode || 'unknown'
      };

      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        metadata: setupMetadata,
        usage: 'off_session'
      });

      logMe('stripe.setup_intent.created', {
        rtoId: this.rtoId,
        setupIntentId: setupIntent.id,
        customerId: customerId
      }, 'debug');

      return setupIntent;
    } catch (error) {
      logMe('stripe.setup_intent.error', {
        rtoId: this.rtoId,
        customerId: customerId,
        error: error.message
      }, 'error');
      throw error;
    }
  }

  /**
   * Create payment method for RTO
   */
  async createPaymentMethod(type, cardDetails, customerId) {
    try {
      const stripe = await this.getStripe();
      
      const paymentMethod = await stripe.paymentMethods.create({
        type: type,
        card: cardDetails,
        customer: customerId,
        metadata: {
          rtoId: this.rtoId.toString(),
          rtoCode: this.stripeConfig.rtoCode || 'unknown'
        }
      });

      logMe('stripe.payment_method.created', {
        rtoId: this.rtoId,
        paymentMethodId: paymentMethod.id,
        type: type,
        customerId: customerId
      }, 'debug');

      return paymentMethod;
    } catch (error) {
      logMe('stripe.payment_method.error', {
        rtoId: this.rtoId,
        type: type,
        error: error.message
      }, 'error');
      throw error;
    }
  }

  /**
   * Retrieve payment intent for RTO
   */
  async retrievePaymentIntent(paymentIntentId) {
    try {
      const stripe = await this.getStripe();
      
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      // Verify this payment intent belongs to this RTO
      if (paymentIntent.metadata.rtoId !== this.rtoId.toString()) {
        throw new Error(`Payment intent ${paymentIntentId} does not belong to RTO ${this.rtoId}`);
      }

      logMe('stripe.payment_intent.retrieved', {
        rtoId: this.rtoId,
        paymentIntentId: paymentIntentId,
        status: paymentIntent.status
      }, 'debug');

      return paymentIntent;
    } catch (error) {
      logMe('stripe.payment_intent.retrieve_error', {
        rtoId: this.rtoId,
        paymentIntentId: paymentIntentId,
        error: error.message
      }, 'error');
      throw error;
    }
  }

  /**
   * Confirm payment intent for RTO
   */
  async confirmPaymentIntent(paymentIntentId, paymentMethodId = null) {
    try {
      const stripe = await this.getStripe();
      
      const confirmParams = {};
      if (paymentMethodId) {
        confirmParams.payment_method = paymentMethodId;
      }

      const paymentIntent = await stripe.paymentIntents.confirm(
        paymentIntentId,
        confirmParams
      );

      logMe('stripe.payment_intent.confirmed', {
        rtoId: this.rtoId,
        paymentIntentId: paymentIntentId,
        status: paymentIntent.status
      }, 'debug');

      return paymentIntent;
    } catch (error) {
      logMe('stripe.payment_intent.confirm_error', {
        rtoId: this.rtoId,
        paymentIntentId: paymentIntentId,
        error: error.message
      }, 'error');
      throw error;
    }
  }

  /**
   * Cancel payment intent for RTO
   */
  async cancelPaymentIntent(paymentIntentId, reason = 'requested_by_customer') {
    try {
      const stripe = await this.getStripe();
      
      const paymentIntent = await stripe.paymentIntents.cancel(paymentIntentId, {
        cancellation_reason: reason
      });

      logMe('stripe.payment_intent.cancelled', {
        rtoId: this.rtoId,
        paymentIntentId: paymentIntentId,
        reason: reason
      }, 'debug');

      return paymentIntent;
    } catch (error) {
      logMe('stripe.payment_intent.cancel_error', {
        rtoId: this.rtoId,
        paymentIntentId: paymentIntentId,
        error: error.message
      }, 'error');
      throw error;
    }
  }

  /**
   * Refund payment for RTO
   */
  async refundPayment(paymentIntentId, amount = null, reason = 'requested_by_customer') {
    try {
      const stripe = await this.getStripe();
      
      const refundParams = {
        payment_intent: paymentIntentId,
        reason: reason
      };

      if (amount) {
        refundParams.amount = Math.round(amount * 100); // Convert to cents
      }

      const refund = await stripe.refunds.create(refundParams);

      logMe('stripe.refund.created', {
        rtoId: this.rtoId,
        refundId: refund.id,
        paymentIntentId: paymentIntentId,
        amount: amount
      }, 'debug');

      return refund;
    } catch (error) {
      logMe('stripe.refund.error', {
        rtoId: this.rtoId,
        paymentIntentId: paymentIntentId,
        error: error.message
      }, 'error');
      throw error;
    }
  }

  /**
   * Update API call count and last call timestamp
   */
  async updateApiUsage() {
    try {
      if (this.stripeConfig) {
        await StripeConfig.findByIdAndUpdate(this.stripeConfig._id, {
          $inc: { apiCallCount: 1 },
          lastApiCall: new Date()
        });
      }
    } catch (error) {
      logMe('stripe.usage_update_error', {
        rtoId: this.rtoId,
        error: error.message
      }, 'warn');
    }
  }

  /**
   * Get RTO-specific Stripe configuration
   */
  getConfig() {
    return {
      rtoId: this.rtoId,
      stripeAccountId: this.stripeConfig?.stripeAccountId,
      publishableKey: this.stripeConfig?.publishableKey,
      accountStatus: this.stripeConfig?.accountStatus,
      capabilities: this.stripeConfig?.capabilities,
      paymentSettings: this.stripeConfig?.paymentSettings
    };
  }
}

module.exports = StripeService;

