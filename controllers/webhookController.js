// controllers/webhookController.js
const Payment = require("../models/payment");
const Application = require("../models/application");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const EmailHelpers = require("../utils/emailHelpers");


const webhookController = {
  // Handle Stripe webhooks
  handleStripeWebhook: async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case "payment_intent.succeeded":
          await handlePaymentIntentSucceeded(event.data.object);
          break;

        case "payment_intent.payment_failed":
          await handlePaymentIntentFailed(event.data.object);
          break;

        case "invoice.payment_succeeded":
          await handleInvoicePaymentSucceeded(event.data.object);
          break;

        case "invoice.payment_failed":
          await handleInvoicePaymentFailed(event.data.object);
          break;

        case "customer.subscription.updated":
          await handleSubscriptionUpdated(event.data.object);
          break;

        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(event.data.object);
          break;

        default:
          console.log(`Unhandled event type ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Webhook handler error:", error);
      res.status(500).json({ error: "Webhook handler failed" });
    }
  },
};

// Handle successful payment intent
async function handlePaymentIntentSucceeded(paymentIntent) {
  try {
    const payment = await Payment.findOne({
      stripePaymentIntentId: paymentIntent.id,
    });

    if (!payment) {
      console.log("Payment not found for payment intent:", paymentIntent.id);
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
      const { updateApplicationStep } = require("../utils/stepCalculator");
      await updateApplicationStep(payment.applicationId);
    } catch (error) {
      console.error("Error updating application progress:", error);
      // Fallback to legacy update
      await Application.findByIdAndUpdate(payment.applicationId, {
        overallStatus: "payment_completed",
        currentStep: 2,
      });
    }

    console.log("Payment completed successfully:", payment._id);
  } catch (error) {
    console.error("Error handling payment intent succeeded:", error);
  }
}

// Handle failed payment intent
async function handlePaymentIntentFailed(paymentIntent) {
  try {
    const payment = await Payment.findOne({
      stripePaymentIntentId: paymentIntent.id,
    });

    if (!payment) {
      console.log(
        "Payment not found for failed payment intent:",
        paymentIntent.id
      );
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

    console.log("Payment failed:", payment._id);
  } catch (error) {
    console.error("Error handling payment intent failed:", error);
  }
}

// Handle successful recurring payment
async function handleInvoicePaymentSucceeded(invoice) {
  try {
    const payment = await Payment.findOne({
      stripeSubscriptionId: invoice.subscription,
    });

    if (!payment) {
      console.log("Payment not found for subscription:", invoice.subscription);
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

      // Cancel subscription since it's completed
      try {
        await stripe.subscriptions.cancel(payment.stripeSubscriptionId);
      } catch (stripeError) {
        console.log("Error cancelling completed subscription:", stripeError);
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

    console.log("Recurring payment completed:", payment._id);
  } catch (error) {
    console.error("Error handling invoice payment succeeded:", error);
  }
}

// Handle failed recurring payment
async function handleInvoicePaymentFailed(invoice) {
  try {
    const payment = await Payment.findOne({
      stripeSubscriptionId: invoice.subscription,
    });

    if (!payment) {
      console.log(
        "Payment not found for failed invoice:",
        invoice.subscription
      );
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

    console.log("Recurring payment failed:", payment._id);
  } catch (error) {
    console.error("Error handling invoice payment failed:", error);
  }
}

// Handle subscription updates
async function handleSubscriptionUpdated(subscription) {
  try {
    const payment = await Payment.findOne({
      stripeSubscriptionId: subscription.id,
    });

    if (!payment) {
      console.log("Payment not found for subscription:", subscription.id);
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

    console.log("Subscription updated:", payment._id, subscription.status);
  } catch (error) {
    console.error("Error handling subscription updated:", error);
  }
}

// Handle subscription deletion
async function handleSubscriptionDeleted(subscription) {
  try {
    const payment = await Payment.findOne({
      stripeSubscriptionId: subscription.id,
    });

    if (!payment) {
      console.log(
        "Payment not found for deleted subscription:",
        subscription.id
      );
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

    console.log("Subscription deleted:", payment._id);
  } catch (error) {
    console.error("Error handling subscription deleted:", error);
  }
}

module.exports = webhookController;
