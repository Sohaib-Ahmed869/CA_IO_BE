// controllers/studentPaymentController.js
const Payment = require("../models/payment");
const Application = require("../models/application");
const User = require("../models/user");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const EmailHelpers = require("../utils/emailHelpers");

const studentPaymentController = {
  // Get payment details for application
  getPaymentForApplication: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const userId = req.user.id;

      // Verify application belongs to user
      const application = await Application.findOne({
        _id: applicationId,
        userId: userId,
      }).populate("certificationId", "name price");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      const payment = await Payment.findOne({ applicationId }).populate(
        "certificationId",
        "name price"
      );

      res.json({
        success: true,
        data: {
          application,
          payment,
          hasPayment: !!payment,
        },
      });
    } catch (error) {
      console.error("Get payment for application error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching payment details",
      });
    }
  },

  // Create payment intent for one-time payment
  createPaymentIntent: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const userId = req.user.id;

      const application = await Application.findOne({
        _id: applicationId,
        userId: userId,
      })
        .populate("userId")
        .populate("certificationId");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      // Check if payment already exists
      let payment = await Payment.findOne({ applicationId });

      if (payment && payment.status === "completed") {
        return res.status(400).json({
          success: false,
          message: "Payment already completed for this application",
        });
      }

      // Create or get Stripe customer
      let customer;
      try {
        const existingCustomers = await stripe.customers.list({
          email: application.userId.email,
          limit: 1,
        });

        if (existingCustomers.data.length > 0) {
          customer = existingCustomers.data[0];
        } else {
          customer = await stripe.customers.create({
            email: application.userId.email,
            name: `${application.userId.firstName} ${application.userId.lastName}`,
            phone: application.userId.phoneNumber,
          });
        }
      } catch (stripeError) {
        console.error("Stripe customer error:", stripeError);
        return res.status(500).json({
          success: false,
          message: "Error creating payment customer",
        });
      }

      // Use existing payment amount if custom plan was created by admin
      const paymentAmount =
        payment?.totalAmount || application.certificationId.price;

      // Create payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(paymentAmount * 100), // Convert to cents
        currency: "aud",
        customer: customer.id,
        metadata: {
          applicationId: applicationId,
          userId: userId,
          certificationId: application.certificationId._id.toString(),
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      // Create or update payment record
      if (!payment) {
        payment = await Payment.create({
          userId: userId,
          applicationId: applicationId,
          certificationId: application.certificationId._id,
          rtoId: req.rtoId, // Add RTO context
          paymentType: "one_time",
          totalAmount: paymentAmount,
          status: "pending",
          stripePaymentIntentId: paymentIntent.id,
          stripeCustomerId: customer.id,
        });
      } else {
        payment.stripePaymentIntentId = paymentIntent.id;
        payment.stripeCustomerId = customer.id;
        payment.status = "pending";
        await payment.save();
      }

      res.json({
        success: true,
        data: {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          amount: paymentAmount,
          currency: "aud",
        },
      });
    } catch (error) {
      console.error("Create payment intent error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating payment intent",
      });
    }
  },

  // Confirm payment success
  confirmPayment: async (req, res) => {
    try {
      const { paymentIntentId } = req.body;
      const { rtoId } = req.query; // Get rtoId from query params
      
      const payment = await Payment.findOne({
        stripePaymentIntentId: paymentIntentId,
      });

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Payment record not found",
        });
      }

      payment.status = "completed";
      payment.completedAt = new Date();

      // Add to payment history
      payment.paymentHistory.push({
        amount: payment.totalAmount,
        type: "one_time",
        status: "completed",
        stripePaymentIntentId: paymentIntentId,
        paidAt: new Date(),
      });

      await payment.save();

      // Update application status
      await Application.findByIdAndUpdate(payment.applicationId, {
        overallStatus: "payment_completed",
        currentStep: 2,
      });

      const user = await User.findById(payment.userId);
      const application = await Application.findById(
        payment.applicationId
      ).populate("certificationId");

      // Send response immediately, then send emails asynchronously
      res.json({
        success: true,
        message: "Payment confirmed successfully",
        data: {
          paymentId: payment._id,
          amount: payment.totalAmount,
          status: payment.status,
        },
      });

      // Send emails after response (non-blocking) with RTO branding
      EmailHelpers.handlePaymentCompleted(user, application, payment, rtoId || req.rtoId).catch(
        console.error
      );
    } catch (error) {
      console.error("Confirm payment error:", error);
      res.status(500).json({
        success: false,
        message: "Error confirming payment",
      });
    }
  },

  // Add this new method after confirmPayment:
  payRemainingBalance: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const userId = req.user.id;

      const application = await Application.findOne({
        _id: applicationId,
        userId: userId,
      });

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      const payment = await Payment.findOne({ applicationId });

      if (!payment || payment.paymentType !== "payment_plan") {
        return res.status(400).json({
          success: false,
          message: "Payment plan not found",
        });
      }

      const remainingAmount = payment.remainingAmount;

      if (remainingAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: "No remaining balance to pay",
        });
      }

      // Create payment intent for remaining amount
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(remainingAmount * 100),
        currency: "aud",
        customer: payment.stripeCustomerId,
        metadata: {
          applicationId: applicationId,
          paymentType: "remaining_balance",
          originalPaymentId: payment._id.toString(),
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      res.json({
        success: true,
        data: {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          amount: remainingAmount,
          currency: "aud",
        },
      });
    } catch (error) {
      console.error("Pay remaining balance error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating payment for remaining balance",
      });
    }
  },

  // Add method for next installment payment:
  payNextInstallment: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const userId = req.user.id;

      const payment = await Payment.findOne({
        applicationId,
        userId,
        paymentType: "payment_plan",
      });

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Payment plan not found",
        });
      }

      const installmentAmount = payment.paymentPlan.recurringPayments.amount;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(installmentAmount * 100),
        currency: "aud",
        customer: payment.stripeCustomerId,
        metadata: {
          applicationId: applicationId,
          paymentType: "early_installment",
          originalPaymentId: payment._id.toString(),
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      res.json({
        success: true,
        data: {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          amount: installmentAmount,
          currency: "aud",
        },
      });
    } catch (error) {
      console.error("Pay next installment error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating payment for next installment",
      });
    }
  },
  // Setup payment plan
  // Replace the existing setupPaymentPlan method with this:
  setupPaymentPlan: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { setupIntentId } = req.body; // Change from paymentMethodId to setupIntentId
      const userId = req.user.id;

      if (!setupIntentId) {
        return res.status(400).json({
          success: false,
          message: "Setup Intent ID is required",
        });
      }

      const application = await Application.findOne({
        _id: applicationId,
        userId: userId,
      })
        .populate("userId")
        .populate("certificationId");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      // Get payment plan details
      const payment = await Payment.findOne({ applicationId });
      if (!payment || payment.paymentType !== "payment_plan") {
        return res.status(400).json({
          success: false,
          message: "Payment plan not found or not configured",
        });
      }

      if (payment.status === "completed") {
        return res.status(400).json({
          success: false,
          message: "Payment plan already completed",
        });
      }

      // Retrieve the setup intent to get the payment method
      let setupIntent;
      try {
        setupIntent = await stripe.setupIntents.retrieve(setupIntentId);

        if (setupIntent.status !== "succeeded") {
          return res.status(400).json({
            success: false,
            message: "Setup intent not completed successfully",
          });
        }
      } catch (stripeError) {
        console.error("Setup intent retrieval error:", stripeError);
        return res.status(400).json({
          success: false,
          message: "Invalid setup intent provided",
        });
      }

      const paymentMethodId = setupIntent.payment_method;

      // Set as default payment method for customer
      await stripe.customers.update(payment.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      // Process initial payment if required
      if (payment.paymentPlan.initialPayment.amount > 0) {
        try {
          const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(payment.paymentPlan.initialPayment.amount * 100),
            currency: "aud",
            customer: payment.stripeCustomerId,
            payment_method: paymentMethodId,
            confirm: true,
            automatic_payment_methods: {
              enabled: true,
              allow_redirects: "never",
            },
            metadata: {
              applicationId: applicationId,
              paymentType: "initial",
            },
          });

          if (paymentIntent.status === "succeeded") {
            payment.paymentPlan.initialPayment.status = "completed";
            payment.paymentPlan.initialPayment.paidAt = new Date();
            payment.paymentPlan.initialPayment.stripePaymentIntentId =
              paymentIntent.id;

            // Add to payment history
            payment.paymentHistory.push({
              amount: payment.paymentPlan.initialPayment.amount,
              type: "initial",
              status: "completed",
              stripePaymentIntentId: paymentIntent.id,
              paidAt: new Date(),
            });
          }
        } catch (initialPaymentError) {
          console.error("Initial payment error:", initialPaymentError);
          return res.status(400).json({
            success: false,
            message:
              "Failed to process initial payment: " +
              initialPaymentError.message,
          });
        }
      }

      // Create recurring subscription if needed
      if (payment.paymentPlan.recurringPayments.amount > 0) {
        try {
          // Create price for recurring payments
          const price = await stripe.prices.create({
            unit_amount: Math.round(
              payment.paymentPlan.recurringPayments.amount * 100
            ),
            currency: "aud",
            recurring: {
              interval:
                payment.paymentPlan.recurringPayments.frequency === "monthly"
                  ? "month"
                  : payment.paymentPlan.recurringPayments.frequency === "weekly"
                  ? "week"
                  : "month",
              interval_count:
                payment.paymentPlan.recurringPayments.customInterval?.value ||
                1,
            },
            product_data: {
              name: `${application.certificationId.name} - Payment Plan`,
            },
          });

          // Create subscription
          // Create subscription schedule for exact number of payments
          const subscriptionSchedule =
            await stripe.subscriptionSchedules.create({
              customer: payment.stripeCustomerId,
              start_date: "now",
              end_behavior: "cancel",
              phases: [
                {
                  items: [
                    {
                      price: price.id,
                      quantity: 1,
                    },
                  ],
                  default_payment_method: paymentMethodId,
                  iterations:
                    payment.paymentPlan.recurringPayments.totalPayments,
                },
              ],
              metadata: {
                applicationId: applicationId,
                paymentId: payment._id.toString(),
              },
            });

          payment.stripeSubscriptionId = subscriptionSchedule.subscription;
        } catch (subscriptionError) {
          console.error("Subscription error:", subscriptionError);
          return res.status(400).json({
            success: false,
            message:
              "Failed to setup recurring payments: " +
              subscriptionError.message,
          });
        }
      }

      payment.status = "processing";
      await payment.save();

      // Update application status
      await Application.findByIdAndUpdate(applicationId, {
        overallStatus: "payment_completed",
        currentStep: 2,
      });

      res.json({
        success: true,
        message: "Payment plan setup successfully",
        data: {
          paymentId: payment._id,
          subscriptionId: payment.stripeSubscriptionId,
          initialPaymentStatus: payment.paymentPlan.initialPayment.status,
        },
      });
    } catch (error) {
      console.error("Setup payment plan error:", error);
      res.status(500).json({
        success: false,
        message: "Error setting up payment plan",
      });
    }
  },
  // Get user's payment history
  getPaymentHistory: async (req, res) => {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 10 } = req.query;

      const payments = await Payment.find({ userId })
        .populate("applicationId", "overallStatus")
        .populate("certificationId", "name price")
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Payment.countDocuments({ userId });

      res.json({
        success: true,
        data: {
          payments,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
          },
        },
      });
    } catch (error) {
      console.error("Get payment history error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching payment history",
      });
    }
  },

  // Get payment method details
  getPaymentMethods: async (req, res) => {
    try {
      const userId = req.user.id;

      // Get user's Stripe customer ID from any payment
      const payment = await Payment.findOne({ userId }).sort({ createdAt: -1 });

      if (!payment || !payment.stripeCustomerId) {
        return res.json({
          success: true,
          data: {
            paymentMethods: [],
          },
        });
      }

      const paymentMethods = await stripe.paymentMethods.list({
        customer: payment.stripeCustomerId,
        type: "card",
      });

      res.json({
        success: true,
        data: {
          paymentMethods: paymentMethods.data,
        },
      });
    } catch (error) {
      console.error("Get payment methods error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching payment methods",
      });
    }
  },

  // Update payment method
  updatePaymentMethod: async (req, res) => {
    try {
      const { paymentId } = req.params;
      const { paymentMethodId } = req.body;
      const userId = req.user.id;

      const payment = await Payment.findOne({
        _id: paymentId,
        userId: userId,
      });

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Payment not found",
        });
      }

      // Attach new payment method to customer
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: payment.stripeCustomerId,
      });

      // Update subscription if exists
      if (payment.stripeSubscriptionId) {
        await stripe.subscriptions.update(payment.stripeSubscriptionId, {
          default_payment_method: paymentMethodId,
        });
      }

      // Update customer default payment method
      await stripe.customers.update(payment.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      res.json({
        success: true,
        message: "Payment method updated successfully",
      });
    } catch (error) {
      console.error("Update payment method error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating payment method",
      });
    }
  },

  // Cancel payment plan (student initiated)
  cancelPaymentPlan: async (req, res) => {
    try {
      const { paymentId } = req.params;
      const { reason } = req.body;
      const userId = req.user.id;

      const payment = await Payment.findOne({
        _id: paymentId,
        userId: userId,
        paymentType: "payment_plan",
      });

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Payment plan not found",
        });
      }

      if (payment.status === "completed") {
        return res.status(400).json({
          success: false,
          message: "Cannot cancel completed payment plan",
        });
      }

      // Cancel Stripe subscription
      if (payment.stripeSubscriptionId) {
        await stripe.subscriptions.cancel(payment.stripeSubscriptionId);
      }

      payment.status = "cancelled";
      payment.metadata = {
        ...payment.metadata,
        cancellationReason: reason,
        cancelledBy: userId,
        cancelledAt: new Date(),
      };

      await payment.save();

      res.json({
        success: true,
        message: "Payment plan cancelled successfully",
      });
    } catch (error) {
      console.error("Cancel payment plan error:", error);
      res.status(500).json({
        success: false,
        message: "Error cancelling payment plan",
      });
    }
  },

  // Get next payment due date and amount
  getNextPaymentInfo: async (req, res) => {
    try {
      const { paymentId } = req.params;
      const userId = req.user.id;

      const payment = await Payment.findOne({
        _id: paymentId,
        userId: userId,
      });

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Payment not found",
        });
      }

      if (payment.paymentType === "one_time") {
        return res.json({
          success: true,
          data: {
            isOneTime: true,
            nextPaymentDate: null,
            nextPaymentAmount: 0,
            remainingAmount: payment.remainingAmount,
          },
        });
      }

      const nextPaymentDate = payment.getNextPaymentDate();
      const remainingAmount = payment.remainingAmount;

      res.json({
        success: true,
        data: {
          nextPaymentDate,
          nextPaymentAmount: payment.paymentPlan.recurringPayments.amount,
          remainingAmount,
          isFullyPaid: payment.isFullyPaid(),
          completedPayments:
            payment.paymentPlan.recurringPayments.completedPayments,
          totalPayments: payment.paymentPlan.recurringPayments.totalPayments,
        },
      });
    } catch (error) {
      console.error("Get next payment info error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching next payment info",
      });
    }
  },

  // Create setup intent for saving payment method
  createSetupIntent: async (req, res) => {
    try {
      const applicationId = req.body.applicationId; // Add this line to get applicationId
      const userId = req.user.id;
      const user = await User.findById(userId);

      // Create or get Stripe customer
      let customer;
      try {
        const existingCustomers = await stripe.customers.list({
          email: user.email,
          limit: 1,
        });

        if (existingCustomers.data.length > 0) {
          customer = existingCustomers.data[0];
        } else {
          customer = await stripe.customers.create({
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
            phone: user.phoneNumber,
          });
        }
      } catch (stripeError) {
        console.error("Stripe customer error:", stripeError);
        return res.status(500).json({
          success: false,
          message: "Error creating customer",
        });
      }

      // Update payment record with customer ID if applicationId provided
      if (applicationId) {
        await Payment.findOneAndUpdate(
          { applicationId: applicationId, userId: userId },
          { stripeCustomerId: customer.id }
        );
      }

      const setupIntent = await stripe.setupIntents.create({
        customer: customer.id,
        payment_method_types: ["card"],
      });

      res.json({
        success: true,
        data: {
          clientSecret: setupIntent.client_secret,
          customerId: customer.id,
        },
      });
    } catch (error) {
      console.error("Create setup intent error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating setup intent",
      });
    }
  },
  // Add this method to studentPaymentController.js
  getPaymentSummary: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const userId = req.user.id;

      // Verify application belongs to user
      const application = await Application.findOne({
        _id: applicationId,
        userId: userId,
      }).populate("certificationId", "name price");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      const payment = await Payment.findOne({ applicationId }).populate(
        "certificationId",
        "name price"
      );

      // Calculate payment progress for installment plans
      let paymentProgress = null;
      if (payment && payment.paymentType === "payment_plan") {
        const totalAmount = payment.totalAmount;
        const paidAmount = payment.paymentHistory
          .filter((p) => p.status === "completed")
          .reduce((sum, p) => sum + p.amount, 0);

        paymentProgress = {
          totalAmount,
          paidAmount,
          remainingAmount: totalAmount - paidAmount,
          nextPaymentDate: payment.getNextPaymentDate(),
          nextPaymentAmount: payment.paymentPlan.recurringPayments.amount,
          isFullyPaid: payment.isFullyPaid(),
          completedPayments:
            payment.paymentPlan.recurringPayments.completedPayments,
          totalPayments: payment.paymentPlan.recurringPayments.totalPayments,
        };
      }

      res.json({
        success: true,
        data: {
          application,
          payment,
          paymentProgress,
          hasPayment: !!payment,
        },
      });
    } catch (error) {
      console.error("Get payment summary error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching payment summary",
      });
    }
  },
};

module.exports = studentPaymentController;
