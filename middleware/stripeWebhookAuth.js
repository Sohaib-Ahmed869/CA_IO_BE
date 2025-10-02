// middleware/stripeWebhookAuth.js
const { logMe } = require("../utils/logger");
const StripeConfig = require("../models/stripeConfig");

/**
 * Middleware to authenticate and identify RTO from Stripe webhook
 */
const stripeWebhookAuth = async (req, res, next) => {
  try {
    const sig = req.get('stripe-signature');
    
    if (!sig) {
      logMe('stripe.webhook.no_signature', {
        url: req.url,
        method: req.method
      }, 'warn');
      
      return res.status(400).json({
        success: false,
        message: "Missing Stripe signature header"
      });
    }

    // Extract webhook data
    let event;
    let rtoId = null;
    let stripeConfig = null;

    // Try to find RTO from webhook data
    try {
      // First, try to extract from payment intent metadata
      if (req.body.type === 'payment_intent.succeeded' || 
          req.body.type === 'payment_intent.payment_failed') {
        const paymentIntent = req.body.data.object;
        if (paymentIntent.metadata && paymentIntent.metadata.rtoId) {
          rtoId = paymentIntent.metadata.rtoId;
        }
      }

      // Try to extract from customer metadata
      if (!rtoId && req.body.data.object.customer) {
        const customerId = req.body.data.object.customer;
        const stripe = require("stripe");
        
        // We need to find the RTO by checking all Stripe configs
        // This is not ideal but necessary for webhook routing
        const allConfigs = await StripeConfig.find({ isActive: true });
        
        for (const config of allConfigs) {
          try {
            const secretKey = config.getDecryptedSecretKey();
            const stripeInstance = stripe(secretKey);
            const customer = await stripeInstance.customers.retrieve(customerId);
            
            if (customer.metadata && customer.metadata.rtoId) {
              rtoId = customer.metadata.rtoId;
              stripeConfig = config;
              break;
            }
          } catch (err) {
            // Continue to next config
            continue;
          }
        }
      }

      // If we found an RTO, verify the webhook signature
      if (rtoId && stripeConfig) {
        const webhookSecret = stripeConfig.getDecryptedWebhookSecret();
        const stripe = require("stripe");
        
        try {
          event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            webhookSecret
          );
          
          // Add RTO context to request
          req.rtoId = rtoId;
          req.stripeConfig = stripeConfig;
          req.stripeEvent = event;
          
          logMe('stripe.webhook.authenticated', {
            rtoId: rtoId,
            eventType: event.type,
            eventId: event.id,
            stripeAccountId: stripeConfig.stripeAccountId
          }, 'debug');
          
          next();
          return;
          
        } catch (err) {
          logMe('stripe.webhook.signature_verification_failed', {
            rtoId: rtoId,
            error: err.message,
            stripeAccountId: stripeConfig.stripeAccountId
          }, 'warn');
        }
      }

      // Fallback: try with default webhook secret for backward compatibility
      if (process.env.STRIPE_WEBHOOK_SECRET) {
        try {
          const stripe = require("stripe");
          event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
          );
          
          logMe('stripe.webhook.authenticated_default', {
            eventType: event.type,
            eventId: event.id
          }, 'debug');
          
          req.stripeEvent = event;
          req.rtoId = null; // No specific RTO context
          req.stripeConfig = null;
          
          next();
          return;
          
        } catch (err) {
          logMe('stripe.webhook.default_signature_failed', {
            error: err.message
          }, 'warn');
        }
      }

      throw new Error('Unable to authenticate webhook');

    } catch (err) {
      logMe('stripe.webhook.authentication_error', {
        error: err.message,
        url: req.url,
        hasSignature: !!sig
      }, 'error');

      return res.status(400).json({
        success: false,
        message: "Webhook authentication failed",
        error: err.message
      });
    }

  } catch (error) {
    logMe('stripe.webhook.middleware_error', {
      error: error.message,
      url: req.url
    }, 'error');

    return res.status(500).json({
      success: false,
      message: "Webhook processing error",
      error: error.message
    });
  }
};

module.exports = { stripeWebhookAuth };

