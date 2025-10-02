// utils/rtoStripeUtils.js
const StripeService = require("../services/stripeService");
const { logMe } = require("../utils/logger");

/**
 * Get RTO-specific Stripe service
 */
const getRTOStripeService = async (rtoId) => {
  try {
    if (!rtoId) {
      throw new Error("RTO ID is required for Stripe service");
    }

    const stripeService = new StripeService(rtoId);
    await stripeService.initialize();
    
    return stripeService;
  } catch (error) {
    logMe('rto.stripe.service_error', {
      rtoId,
      error: error.message
    }, 'error');
    throw error;
  }
};

/**
 * Create or retrieve customer using RTO-specific Stripe service
 */
const createOrRetrieveRTOCustomer = async (rtoId, userEmail, userName, userPhone, metadata = {}) => {
  try {
    const stripeService = await getRTOStripeService(rtoId);
    return await stripeService.createOrRetrieveCustomer(userEmail, userName, userPhone, metadata);
  } catch (error) {
    logMe('rto.stripe.customer_error', {
      rtoId,
      userEmail,
      error: error.message
    }, 'error');
    throw error;
  }
};

/**
 * Create payment intent using RTO-specific Stripe service
 */
const createRTOPaymentIntent = async (rtoId, amount, currency, customerId, metadata = {}) => {
  try {
    const stripeService = await getRTOStripeService(rtoId);
    return await stripeService.createPaymentIntent(amount, currency, customerId, metadata);
  } catch (error) {
    logMe('rto.stripe.payment_intent_error', {
      rtoId,
      amount,
      customerId,
      error: error.message
    }, 'error');
    throw error;
  }
};

/**
 * Create setup intent using RTO-specific Stripe service
 */
const createRTOSetupIntent = async (rtoId, customerId, metadata = {}) => {
  try {
    const stripeService = await getRTOStripeService(rtoId);
    return await stripeService.createSetupIntent(customerId, metadata);
  } catch (error) {
    logMe('rto.stripe.setup_intent_error', {
      rtoId,
      customerId,
      error: error.message
    }, 'error');
    throw error;
  }
};

/**
 * Retrieve payment intent using RTO-specific Stripe service
 */
const retrieveRTOPaymentIntent = async (rtoId, paymentIntentId) => {
  try {
    const stripeService = await getRTOStripeService(rtoId);
    return await stripeService.retrievePaymentIntent(paymentIntentId);
  } catch (error) {
    logMe('rto.stripe.retrieve_payment_intent_error', {
      rtoId,
      paymentIntentId,
      error: error.message
    }, 'error');
    throw error;
  }
};

/**
 * Confirm payment intent using RTO-specific Stripe service
 */
const confirmRTOPaymentIntent = async (rtoId, paymentIntentId, paymentMethodId = null) => {
  try {
    const stripeService = await getRTOStripeService(rtoId);
    return await stripeService.confirmPaymentIntent(paymentIntentId, paymentMethodId);
  } catch (error) {
    logMe('rto.stripe.confirm_payment_intent_error', {
      rtoId,
      paymentIntentId,
      error: error.message
    }, 'error');
    throw error;
  }
};

/**
 * Cancel payment intent using RTO-specific Stripe service
 */
const cancelRTOPaymentIntent = async (rtoId, paymentIntentId, reason = 'requested_by_customer') => {
  try {
    const stripeService = await getRTOStripeService(rtoId);
    return await stripeService.cancelPaymentIntent(paymentIntentId, reason);
  } catch (error) {
    logMe('rto.stripe.cancel_payment_intent_error', {
      rtoId,
      paymentIntentId,
      error: error.message
    }, 'error');
    throw error;
  }
};

/**
 * Refund payment using RTO-specific Stripe service
 */
const refundRTOPayment = async (rtoId, paymentIntentId, amount = null, reason = 'requested_by_customer') => {
  try {
    const stripeService = await getRTOStripeService(rtoId);
    return await stripeService.refundPayment(paymentIntentId, amount, reason);
  } catch (error) {
    logMe('rto.stripe.refund_error', {
      rtoId,
      paymentIntentId,
      amount,
      error: error.message
    }, 'error');
    throw error;
  }
};

/**
 * Get RTO-specific publishable key
 */
const getRTOPublishableKey = async (rtoId) => {
  try {
    const stripeService = await getRTOStripeService(rtoId);
    return stripeService.getPublishableKey();
  } catch (error) {
    logMe('rto.stripe.publishable_key_error', {
      rtoId,
      error: error.message
    }, 'error');
    throw error;
  }
};

/**
 * Get RTO-specific Stripe configuration
 */
const getRTOStripeConfig = async (rtoId) => {
  try {
    const stripeService = await getRTOStripeService(rtoId);
    return stripeService.getConfig();
  } catch (error) {
    logMe('rto.stripe.config_error', {
      rtoId,
      error: error.message
    }, 'error');
    throw error;
  }
};

module.exports = {
  getRTOStripeService,
  createOrRetrieveRTOCustomer,
  createRTOPaymentIntent,
  createRTOSetupIntent,
  retrieveRTOPaymentIntent,
  confirmRTOPaymentIntent,
  cancelRTOPaymentIntent,
  refundRTOPayment,
  getRTOPublishableKey,
  getRTOStripeConfig
};
