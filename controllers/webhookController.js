// controllers/webhookController.js
const Payment = require("../models/payment");
const Application = require("../models/application");
const User = require("../models/user");
const StripeConfig = require("../models/stripeConfig");
const stripe = require("stripe");
const EmailHelpers = require("../utils/emailHelpers");
const { updateApplicationStep } = require("../utils/stepCalculator");
const ThirdPartyFormSubmission = require("../models/thirdPartyFormSubmission");
const { logMe } = require("../utils/logger");


const webhookController = {
  // Handle Stripe webhooks - Multi-RTO support
  handleStripeWebhook: async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;
    let stripeConfig = null;

    try {
      // Get raw body for signature verification
      const rawBody = req.body.toString();
      
      // First, try to extract RTO context from the webhook payload
      // Parse the raw body to get metadata without verifying signature yet
      const eventData = JSON.parse(rawBody);
      const rtoId = eventData.data?.object?.metadata?.rtoId;
      
      logMe('webhook.received', {
        eventType: eventData.type,
        rtoId: rtoId || 'unknown',
        paymentIntentId: eventData.data?.object?.id
      }, 'debug');

      if (rtoId) {
        // Get RTO-specific Stripe configuration
        stripeConfig = await StripeConfig.findOne({ rtoId: rtoId });
        
        if (stripeConfig && stripeConfig.isActive) {
          // Use RTO-specific webhook secret for signature verification
          const webhookSecret = stripeConfig.getDecryptedWebhookSecret();
          event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
          
          logMe('webhook.rto_signature_verified', {
            rtoId,
            stripeAccountId: stripeConfig.stripeAccountId,
            eventType: event.type
          }, 'debug');
        } else {
          throw new Error(`No active Stripe configuration found for RTO: ${rtoId}`);
        }
      } else {
        // Fallback to global webhook secret for backward compatibility
        logMe('webhook.fallback_to_global', { 
          eventType: eventData.type,
          reason: 'No RTO metadata found'
        }, 'warn');
        
        event = stripe.webhooks.constructEvent(
          rawBody,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      }
    } catch (err) {
      logMe('webhook.signature_verification_failed', {
        error: err.message,
        rtoId: stripeConfig?.rtoId || 'unknown'
      }, 'error');
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      // Pass RTO context to all handlers
      const rtoContext = stripeConfig ? {
        rtoId: stripeConfig.rtoId,
        stripeConfig: stripeConfig,
        stripeInstance: stripe(stripeConfig.getDecryptedSecretKey())
      } : null;

      switch (event.type) {
        case "payment_intent.succeeded":
          await handlePaymentIntentSucceeded(event.data.object, rtoContext);
          break;

        case "payment_intent.payment_failed":
          await handlePaymentIntentFailed(event.data.object, rtoContext);
          break;

        case "invoice.payment_succeeded":
          await handleInvoicePaymentSucceeded(event.data.object, rtoContext);
          break;

        case "invoice.payment_failed":
          await handleInvoicePaymentFailed(event.data.object, rtoContext);
          break;

        case "customer.subscription.updated":
          await handleSubscriptionUpdated(event.data.object, rtoContext);
          break;

        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(event.data.object, rtoContext);
          break;

        default:
          logMe('webhook.unhandled_event', {
            eventType: event.type,
            rtoId: rtoContext?.rtoId || 'unknown'
          }, 'info');
      }

      logMe('webhook.processed_successfully', {
        eventType: event.type,
        rtoId: rtoContext?.rtoId || 'unknown'
      }, 'debug');

      res.json({ received: true });
    } catch (error) {
      logMe('webhook.handler_error', {
        error: error.message,
        eventType: event.type,
        rtoId: stripeConfig?.rtoId || 'unknown'
      }, 'error');
      res.status(500).json({ error: "Webhook handler failed" });
    }
  },
};

function computeAggregateStatus(doc) {
  const statuses = [
    doc.verification?.employer?.status,
    doc.verification?.reference?.status,
    doc.isSameEmail ? doc.verification?.combined?.status : undefined,
  ].filter(Boolean);
  if (statuses.some(s => s === 'verified')) return 'verified';
  if (statuses.some(s => s === 'rejected')) return 'rejected';
  if (statuses.length && statuses.every(s => s === 'not_sent')) return 'none';
  return 'pending';
}

// Helper: mark verified by token/messageId
async function markVerified(setTarget, tprId, responseContent) {
  const setObj = {};
  setObj[`verification.${setTarget}.responseContent`] = responseContent || '';
  setObj[`verification.${setTarget}.status`] = 'verified';
  setObj[`verification.${setTarget}.verifiedAt`] = new Date();
  await ThirdPartyFormSubmission.findByIdAndUpdate(tprId, { $set: setObj });
  const updated = await ThirdPartyFormSubmission.findById(tprId);
  const aggregate = computeAggregateStatus(updated);
  await ThirdPartyFormSubmission.findByIdAndUpdate(tprId, { $set: { verificationStatus: aggregate } });
}

function firstString(val) {
  if (!val) return '';
  if (Array.isArray(val)) return (val[0] || '').toString();
  return val.toString();
}

function headerLookup(headersObj, key) {
  if (!headersObj) return '';
  const lower = Object.create(null);
  for (const k of Object.keys(headersObj)) lower[k.toLowerCase()] = headersObj[k];
  return firstString(lower[key.toLowerCase()]);
}

function extractTokenFromPlus(toLike) {
  if (!toLike) return null;
  const m = toLike.match(/\+tpr-([A-Za-z0-9]+)/i);
  return m ? m[1] : null;
}

function extractMessageIds(str) {
  if (!str) return [];
  return (str.match(/<[^>]+>/g) || []).map(s => s.replace(/[<>]/g, ''));
}

// Inbound email webhook (generic) - enhanced
webhookController.handleInboundEmail = async (req, res) => {
  try {
    const payload = req.body || {};

    // Common provider fields
    const subject = payload.subject || '';
    const text = payload.text || payload['TextBody'] || '';
    const html = payload.html || payload['HtmlBody'] || '';

    // Headers can come as array of {name,value} or object
    let headersObj = {};
    if (payload.headers && Array.isArray(payload.headers)) {
      for (const h of payload.headers) headersObj[(h.name || h.Name || '').toLowerCase()] = h.value || h.Value || '';
    } else if (payload.headers && typeof payload.headers === 'object') {
      headersObj = payload.headers;
    } else if (payload['Headers'] && Array.isArray(payload['Headers'])) {
      for (const h of payload['Headers']) headersObj[(h.Name || '').toLowerCase()] = h.Value || '';
    }

    // Also check top-level provider fields
    const toList = [];
    if (payload.to) toList.push(firstString(payload.to));
    if (payload.To) toList.push(firstString(payload.To));
    if (payload['Delivered-To']) toList.push(firstString(payload['Delivered-To']));
    const hdrTo = headerLookup(headersObj, 'to');
    const hdrDeliveredTo = headerLookup(headersObj, 'delivered-to');
    const hdrCc = headerLookup(headersObj, 'cc');
    const allTo = [hdrTo, hdrDeliveredTo, hdrCc, ...toList].filter(Boolean).join(',');

    // Strategy 1: plus-address alias
    let token = extractTokenFromPlus(allTo);
    if (token) {
      const tpr = await ThirdPartyFormSubmission.findOne({
        $or: [
          { 'verification.employer.token': token },
          { 'verification.reference.token': token },
          { 'verification.combined.token': token },
        ],
      });
      if (tpr) {
        const target = tpr.verification?.employer?.token === token ? 'employer' :
                       tpr.verification?.reference?.token === token ? 'reference' : 'combined';
        await markVerified(target, tpr._id, text || html || subject);
        return res.status(200).json({ success: true });
      }
    }

    // Strategy 2: threading headers
    const inReplyTo = headerLookup(headersObj, 'in-reply-to');
    const references = headerLookup(headersObj, 'references');
    const ids = [...new Set([...extractMessageIds(inReplyTo), ...extractMessageIds(references)])];
    for (const id of ids) {
      const tpr = await ThirdPartyFormSubmission.findOne({
        $or: [
          { 'verification.employer.lastSentMessageId': id },
          { 'verification.reference.lastSentMessageId': id },
          { 'verification.combined.lastSentMessageId': id },
        ],
      });
      if (tpr) {
        let target = 'combined';
        if (tpr.verification?.employer?.lastSentMessageId === id) target = 'employer';
        else if (tpr.verification?.reference?.lastSentMessageId === id) target = 'reference';
        await markVerified(target, tpr._id, text || html || subject);
        return res.status(200).json({ success: true });
      }
    }

    // Strategy 3: fallback Ref Code in subject/body
    const allText = `${subject}\n${text}\n${html}`;
    const match = allText.match(/TPR-([A-Za-z0-9]+)/);
    if (match) {
      token = match[1];
      const tpr = await ThirdPartyFormSubmission.findOne({
        $or: [
          { 'verification.employer.token': token },
          { 'verification.reference.token': token },
          { 'verification.combined.token': token },
        ],
      });
      if (tpr) {
        const target = tpr.verification?.employer?.token === token ? 'employer' :
                       tpr.verification?.reference?.token === token ? 'reference' : 'combined';
        await markVerified(target, tpr._id, text || html || subject);
        return res.status(200).json({ success: true });
      }
    }

    return res.status(200).json({ success: true, message: 'No TPR match' });
  } catch (error) {
    console.error('Inbound email webhook error:', error);
    return res.status(200).json({ success: true }); // avoid retries storm
  }
};


// Handle successful payment intent
async function handlePaymentIntentSucceeded(paymentIntent, rtoContext = null) {
  try {
    const payment = await Payment.findOne({
      stripePaymentIntentId: paymentIntent.id,
    });

    if (!payment) {
      logMe('webhook.payment_not_found', {
        paymentIntentId: paymentIntent.id,
        rtoId: rtoContext?.rtoId || 'unknown'
      }, 'warn');
      return;
    }

    // Update payment status
    payment.status = "completed";
    payment.completedAt = new Date();

    // Add to payment history
    payment.paymentHistory.push({
      amount: paymentIntent.amount / 100,
      type: payment.paymentType === "payment_plan" ? "initial" : "one_time",
      status: "completed",
      stripePaymentIntentId: paymentIntent.id,
      paidAt: new Date(),
    });

    await payment.save();

    // Update application status using new step calculator
    try {
      await updateApplicationStep(payment.applicationId);
    } catch (error) {
      logMe('webhook.application_step_update_error', {
        error: error.message,
        applicationId: payment.applicationId,
        rtoId: rtoContext?.rtoId || 'unknown'
      }, 'error');
      // Fallback to legacy update
      await Application.findByIdAndUpdate(payment.applicationId, {
        overallStatus: "payment_completed",
        currentStep: 2,
      });
    }

    logMe('webhook.payment_completed', {
      paymentId: payment._id,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount / 100,
      rtoId: rtoContext?.rtoId || 'unknown'
    }, 'info');
  } catch (error) {
    logMe('webhook.payment_intent_succeeded_error', {
      error: error.message,
      paymentIntentId: paymentIntent.id,
      rtoId: rtoContext?.rtoId || 'unknown'
    }, 'error');
  }
}

// Handle failed payment intent
async function handlePaymentIntentFailed(paymentIntent, rtoContext = null) {
  try {
    const payment = await Payment.findOne({
      stripePaymentIntentId: paymentIntent.id,
    });

    if (!payment) {
      logMe('webhook.payment_not_found_failed', {
        paymentIntentId: paymentIntent.id,
        rtoId: rtoContext?.rtoId || 'unknown'
      }, 'warn');
      return;
    }

    payment.status = "failed";
    payment.failureReason =
      paymentIntent.last_payment_error?.message || "Payment failed";

    // Add to payment history
    payment.paymentHistory.push({
      amount: paymentIntent.amount / 100,
      type: payment.paymentType === "payment_plan" ? "initial" : "one_time",
      status: "failed",
      stripePaymentIntentId: paymentIntent.id,
      failureReason: payment.failureReason,
    });

    await payment.save();

    logMe('webhook.payment_failed', {
      paymentId: payment._id,
      paymentIntentId: paymentIntent.id,
      failureReason: payment.failureReason,
      rtoId: rtoContext?.rtoId || 'unknown'
    }, 'info');
  } catch (error) {
    logMe('webhook.payment_intent_failed_error', {
      error: error.message,
      paymentIntentId: paymentIntent.id,
      rtoId: rtoContext?.rtoId || 'unknown'
    }, 'error');
  }
}

// Handle successful recurring payment
async function handleInvoicePaymentSucceeded(invoice, rtoContext = null) {
  try {
    const payment = await Payment.findOne({
      stripeSubscriptionId: invoice.subscription,
    });

    if (!payment) {
      logMe('webhook.subscription_payment_not_found', {
        subscriptionId: invoice.subscription,
        rtoId: rtoContext?.rtoId || 'unknown'
      }, 'warn');
      return;
    }

    // Increment completed payments
    payment.paymentPlan.recurringPayments.completedPayments += 1;

    // Add to payment history
    payment.paymentHistory.push({
      amount: invoice.amount_paid / 100,
      type: "recurring",
      status: "completed",
      paidAt: new Date(),
    });

    // Check if payment plan is fully completed
    if (
      payment.paymentPlan.recurringPayments.completedPayments >=
      payment.paymentPlan.recurringPayments.totalPayments
    ) {
      payment.status = "completed";
      payment.completedAt = new Date();

      // Cancel subscription since it's completed - use RTO-specific Stripe instance
      try {
        const stripeInstance = rtoContext?.stripeInstance || stripe(process.env.STRIPE_SECRET_KEY);
        await stripeInstance.subscriptions.cancel(payment.stripeSubscriptionId);
      } catch (stripeError) {
        logMe('webhook.subscription_cancel_error', {
          error: stripeError.message,
          subscriptionId: payment.stripeSubscriptionId,
          rtoId: rtoContext?.rtoId || 'unknown'
        }, 'error');
      }
    }

    await payment.save();

    const user = await User.findById(payment.userId);
    const application = await Application.findById(payment.applicationId);
    const installmentNumber =
      payment.paymentPlan.recurringPayments.completedPayments;

    await EmailHelpers.handlePaymentPlanPayment(
      user,
      application,
      payment,
      installmentNumber
    );

    // Check if COE should be sent (if enrollment form already exists)
    await EmailHelpers.triggerEmailsForEvent('payment_completed', user, application, payment).catch(console.error);

    logMe('webhook.recurring_payment_completed', {
      paymentId: payment._id,
      subscriptionId: invoice.subscription,
      installmentNumber,
      rtoId: rtoContext?.rtoId || 'unknown'
    }, 'info');
  } catch (error) {
    logMe('webhook.invoice_payment_succeeded_error', {
      error: error.message,
      subscriptionId: invoice.subscription,
      rtoId: rtoContext?.rtoId || 'unknown'
    }, 'error');
  }
}

// Handle failed recurring payment
async function handleInvoicePaymentFailed(invoice, rtoContext = null) {
  try {
    const payment = await Payment.findOne({
      stripeSubscriptionId: invoice.subscription,
    });

    if (!payment) {
      logMe('webhook.subscription_payment_not_found_failed', {
        subscriptionId: invoice.subscription,
        rtoId: rtoContext?.rtoId || 'unknown'
      }, 'warn');
      return;
    }

    // Add failed payment to history
    payment.paymentHistory.push({
      amount: invoice.amount_due / 100,
      type: "recurring",
      status: "failed",
      failureReason: "Invoice payment failed",
    });

    await payment.save();

    logMe('webhook.recurring_payment_failed', {
      paymentId: payment._id,
      subscriptionId: invoice.subscription,
      rtoId: rtoContext?.rtoId || 'unknown'
    }, 'info');
  } catch (error) {
    logMe('webhook.invoice_payment_failed_error', {
      error: error.message,
      subscriptionId: invoice.subscription,
      rtoId: rtoContext?.rtoId || 'unknown'
    }, 'error');
  }
}

// Handle subscription updates
async function handleSubscriptionUpdated(subscription, rtoContext = null) {
  try {
    const payment = await Payment.findOne({
      stripeSubscriptionId: subscription.id,
    });

    if (!payment) {
      logMe('webhook.subscription_not_found_updated', {
        subscriptionId: subscription.id,
        rtoId: rtoContext?.rtoId || 'unknown'
      }, 'warn');
      return;
    }

    // Update payment status based on subscription status
    if (subscription.status === "active") {
      payment.status = "processing";
    } else if (subscription.status === "canceled") {
      payment.status = "cancelled";
    } else if (subscription.status === "past_due") {
      payment.status = "processing"; // Keep as processing but note the issue
    }

    await payment.save();

    logMe('webhook.subscription_updated', {
      paymentId: payment._id,
      subscriptionId: subscription.id,
      status: subscription.status,
      rtoId: rtoContext?.rtoId || 'unknown'
    }, 'info');
  } catch (error) {
    logMe('webhook.subscription_updated_error', {
      error: error.message,
      subscriptionId: subscription.id,
      rtoId: rtoContext?.rtoId || 'unknown'
    }, 'error');
  }
}

// Handle subscription deletion
async function handleSubscriptionDeleted(subscription, rtoContext = null) {
  try {
    const payment = await Payment.findOne({
      stripeSubscriptionId: subscription.id,
    });

    if (!payment) {
      logMe('webhook.subscription_not_found_deleted', {
        subscriptionId: subscription.id,
        rtoId: rtoContext?.rtoId || 'unknown'
      }, 'warn');
      return;
    }

    // Only mark as cancelled if not already completed
    if (payment.status !== "completed") {
      payment.status = "cancelled";
      payment.metadata = {
        ...payment.metadata,
        subscriptionCancelledAt: new Date(),
      };
    }

    await payment.save();

    logMe('webhook.subscription_deleted', {
      paymentId: payment._id,
      subscriptionId: subscription.id,
      rtoId: rtoContext?.rtoId || 'unknown'
    }, 'info');
  } catch (error) {
    logMe('webhook.subscription_deleted_error', {
      error: error.message,
      subscriptionId: subscription.id,
      rtoId: rtoContext?.rtoId || 'unknown'
    }, 'error');
  }
}

module.exports = webhookController;
