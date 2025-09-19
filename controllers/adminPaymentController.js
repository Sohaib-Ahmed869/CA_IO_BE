// controllers/adminPaymentController.js
const Payment = require("../models/payment");
const Application = require("../models/application");
const User = require("../models/user");
const Certification = require("../models/certification");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const EmailHelpers = require("../utils/emailHelpers");


const adminPaymentController = {
  // Get all payments with filtering and pagination
  getAllPayments: async (req, res) => {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        paymentType,
        search,
        sortBy = "newest",
        dateFrom,
        dateTo,
      } = req.query;

      // Build filter object
      const filter = {};
      if (status && status !== "all") {
        filter.status = status;
      }
      if (paymentType && paymentType !== "all") {
        filter.paymentType = paymentType;
      }

      // Date range filter
      if (dateFrom || dateTo) {
        filter.createdAt = {};
        if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
        if (dateTo) filter.createdAt.$lte = new Date(dateTo);
      }

      // Search filter
      let searchFilter = {};
      if (search && search.trim() !== "") {
        const users = await User.find({
          $or: [
            { firstName: { $regex: search, $options: "i" } },
            { lastName: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        }).select("_id");

        const userIds = users.map((user) => user._id);
        searchFilter = { userId: { $in: userIds } };
      }

      const finalFilter = { ...filter, ...searchFilter };

      // Sort options
      let sortObject = {};
      switch (sortBy) {
        case "oldest":
          sortObject = { createdAt: 1 };
          break;
        case "amount":
          sortObject = { totalAmount: -1 };
          break;
        case "status":
          sortObject = { status: 1 };
          break;
        default: // newest
          sortObject = { createdAt: -1 };
      }

      const payments = await Payment.find(finalFilter)
        .populate("userId", "firstName lastName email")
        .populate("applicationId", "overallStatus")
        .populate("certificationId", "name price")
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort(sortObject);

      const total = await Payment.countDocuments(finalFilter);

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
      console.error("Get all payments error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching payments",
      });
    }
  },

  // Get payment statistics
  getPaymentStats: async (req, res) => {
    try {
      const stats = await Payment.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalAmount: { $sum: "$totalAmount" },
          },
        },
      ]);

      const paymentPlanStats = await Payment.aggregate([
        {
          $match: { paymentType: "payment_plan" },
        },
        {
          $group: {
            _id: null,
            totalPlans: { $sum: 1 },
            activePlans: {
              $sum: {
                $cond: [{ $eq: ["$status", "processing"] }, 1, 0],
              },
            },
            completedPlans: {
              $sum: {
                $cond: [{ $eq: ["$status", "completed"] }, 1, 0],
              },
            },
          },
        },
      ]);

      const monthlyRevenue = await Payment.aggregate([
        {
          $match: {
            status: "completed",
            completedAt: {
              $gte: new Date(
                new Date().getFullYear(),
                new Date().getMonth(),
                1
              ),
            },
          },
        },
        {
          $group: {
            _id: null,
            revenue: { $sum: "$totalAmount" },
          },
        },
      ]);

      const formattedStats = {
        total: 0,
        completed: 0,
        pending: 0,
        failed: 0,
        totalRevenue: 0,
        monthlyRevenue: monthlyRevenue[0]?.revenue || 0,
        paymentPlans: paymentPlanStats[0] || {
          totalPlans: 0,
          activePlans: 0,
          completedPlans: 0,
        },
      };

      stats.forEach((stat) => {
        formattedStats.total += stat.count;
        formattedStats.totalRevenue += stat.totalAmount;

        switch (stat._id) {
          case "completed":
            formattedStats.completed = stat.count;
            break;
          case "pending":
          case "processing":
            formattedStats.pending += stat.count;
            break;
          case "failed":
          case "cancelled":
            formattedStats.failed += stat.count;
            break;
        }
      });

      res.json({
        success: true,
        data: formattedStats,
      });
    } catch (error) {
      console.error("Get payment stats error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching payment statistics",
      });
    }
  },

  // Get specific payment details
  getPaymentDetails: async (req, res) => {
    try {
      const { paymentId } = req.params;

      const payment = await Payment.findById(paymentId)
        .populate("userId", "firstName lastName email phoneNumber")
        .populate("applicationId", "overallStatus currentStep")
        .populate("certificationId", "name price description");

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Payment not found",
        });
      }

      // Get Stripe payment details if available
      let stripeDetails = null;
      if (payment.stripePaymentIntentId) {
        try {
          stripeDetails = await stripe.paymentIntents.retrieve(
            payment.stripePaymentIntentId
          );
        } catch (stripeError) {
          console.log("Error fetching Stripe details:", stripeError);
        }
      }

      res.json({
        success: true,
        data: {
          payment,
          stripeDetails,
        },
      });
    } catch (error) {
      console.error("Get payment details error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching payment details",
      });
    }
  },

  // Create custom payment plan for application
  createCustomPaymentPlan: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const {
        paymentType,
        initialPayment,
        recurringAmount,
        frequency,
        customInterval,
        totalPayments,
        discount,
        discountType,
        startDate,
        notes,
      } = req.body;

      const application = await Application.findById(applicationId)
        .populate("userId")
        .populate("certificationId");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      // CHECK IF PAYMENT ALREADY EXISTS AND DELETE IT
      const existingPayment = await Payment.findOne({ applicationId });
      if (existingPayment) {
        // Cancel Stripe subscription if exists
        if (existingPayment.stripeSubscriptionId) {
          try {
            await stripe.subscriptions.cancel(
              existingPayment.stripeSubscriptionId
            );
          } catch (stripeError) {
            console.log("Error cancelling existing subscription:", stripeError);
          }
        }

        // Delete the existing payment
        await Payment.findByIdAndDelete(existingPayment._id);
      }

      let totalAmount = application.certificationId.price;

      // Apply discount
      if (discount && discount > 0) {
        if (discountType === "percentage") {
          totalAmount = totalAmount * (1 - discount / 100);
        } else {
          totalAmount = Math.max(0, totalAmount - discount);
        }
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

      const paymentData = {
        userId: application.userId._id,
        applicationId: applicationId,
        certificationId: application.certificationId._id,
        paymentType: paymentType,
        totalAmount: totalAmount,
        status: "pending",
        stripeCustomerId: customer.id,
        metadata: {
          originalPrice: application.certificationId.price,
          discount: discount,
          discountType: discountType,
          notes: notes,
          createdBy: req.user.id,
          replacedExisting: !!existingPayment, // Track if this replaced an existing payment
        },
      };

      if (paymentType === "payment_plan") {
        paymentData.paymentPlan = {
          initialPayment: {
            amount: initialPayment || 0,
            status: "pending",
          },
          recurringPayments: {
            amount: recurringAmount,
            frequency: frequency,
            customInterval: customInterval,
            startDate: new Date(startDate),
            totalPayments: totalPayments,
            completedPayments: 0,
          },
        };
      }

      const payment = await Payment.create(paymentData);

      // Update application with new payment ID (do not downgrade if certificate issued)
      const app = await Application.findById(applicationId).select('finalCertificate.s3Key overallStatus');
      const updateApp = { paymentId: payment._id };
      if (!app?.finalCertificate?.s3Key && app?.overallStatus !== 'certificate_issued') {
        updateApp.overallStatus = 'payment_pending';
      }
      await Application.findByIdAndUpdate(applicationId, updateApp);

      const populatedPayment = await Payment.findById(payment._id)
        .populate("userId", "firstName lastName email")
        .populate("certificationId", "name price");

      // Send email notification to student about the payment plan creation
      try {
        const EmailHelpers = require("../utils/emailHelpers");
        await EmailHelpers.handlePaymentPlanCreated(
          application.userId,
          application,
          populatedPayment,
          req.user
        );
      } catch (emailError) {
        console.error("Error sending payment plan creation email:", emailError);
        // Don't fail the payment plan creation if email fails
      }

      res.status(201).json({
        success: true,
        message: existingPayment
          ? "Payment plan updated successfully"
          : "Custom payment plan created successfully",
        data: populatedPayment,
      });
    } catch (error) {
      console.error("Create custom payment plan error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating custom payment plan",
      });
    }
  },

  // Update payment plan
  updatePaymentPlan: async (req, res) => {
    try {
      const { paymentId } = req.params;
      const updates = req.body;

      const payment = await Payment.findById(paymentId);
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Payment not found",
        });
      }

      // Only allow updates if payment is still pending or processing
      if (!["pending", "processing"].includes(payment.status)) {
        return res.status(400).json({
          success: false,
          message: "Cannot update completed or failed payment",
        });
      }

      // Update allowed fields
      const allowedUpdates = [
        "totalAmount",
        "paymentPlan",
        "metadata",
        "status",
      ];

      allowedUpdates.forEach((field) => {
        if (updates[field] !== undefined) {
          payment[field] = updates[field];
        }
      });

      await payment.save();

      const updatedPayment = await Payment.findById(paymentId)
        .populate("userId", "firstName lastName email")
        .populate("certificationId", "name price");

      res.json({
        success: true,
        message: "Payment plan updated successfully",
        data: updatedPayment,
      });
    } catch (error) {
      console.error("Update payment plan error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating payment plan",
      });
    }
  },

  // Apply discount to existing payment
  applyDiscount: async (req, res) => {
    try {
      const { paymentId } = req.params;
      const { discount, discountType, reason } = req.body;

      const payment = await Payment.findById(paymentId).populate(
        "certificationId"
      );
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Payment not found",
        });
      }

      if (payment.status === "completed") {
        return res.status(400).json({
          success: false,
          message: "Cannot apply discount to completed payment",
        });
      }

      const originalPrice =
        payment.metadata?.originalPrice || payment.totalAmount;
      let newAmount = originalPrice;

      if (discountType === "percentage") {
        newAmount = originalPrice * (1 - discount / 100);
      } else {
        newAmount = Math.max(0, originalPrice - discount);
      }

      payment.totalAmount = newAmount;
      const currentMetadata = payment.metadata
        ? payment.metadata.toObject()
        : {};
      const updatedMetadata = {
        ...currentMetadata,
        discount: discount,
        discountType: discountType,
        discountReason: reason,
        discountAppliedBy: req.user.id,
        discountAppliedAt: new Date(),
      };
      payment.set("metadata", updatedMetadata);

      await payment.save();

      res.json({
        success: true,
        message: "Discount applied successfully",
        data: {
          oldAmount: originalPrice,
          newAmount: newAmount,
          discount: discount,
          discountType: discountType,
        },
      });
    } catch (error) {
      console.error("Apply discount error:", error);
      res.status(500).json({
        success: false,
        message: "Error applying discount",
      });
    }
  },

  // Refund payment
  refundPayment: async (req, res) => {
    try {
      const { paymentId } = req.params;
      const { amount, reason } = req.body;

      const payment = await Payment.findById(paymentId);
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Payment not found",
        });
      }

      if (payment.status !== "completed") {
        return res.status(400).json({
          success: false,
          message: "Can only refund completed payments",
        });
      }

      // Process refund through Stripe
      let refund;
      try {
        refund = await stripe.refunds.create({
          payment_intent: payment.stripePaymentIntentId,
          amount: amount ? Math.round(amount * 100) : undefined, // Convert to cents
          reason: "requested_by_customer",
          metadata: {
            refund_reason: reason,
            refunded_by: req.user.id,
          },
        });
      } catch (stripeError) {
        console.error("Stripe refund error:", stripeError);
        return res.status(500).json({
          success: false,
          message: "Error processing refund",
        });
      }

      // Update payment status
      payment.status = "refunded";
      const currentMetadata = payment.metadata
        ? payment.metadata.toObject()
        : {};
      const updatedMetadata = {
        ...currentMetadata,
        refundId: refund.id,
        refundAmount: refund.amount / 100,
        refundReason: reason,
        refundedBy: req.user.id,
        refundedAt: new Date(),
      };
      payment.set("metadata", updatedMetadata);

      await payment.save();

      res.json({
        success: true,
        message: "Payment refunded successfully",
        data: {
          refundId: refund.id,
          refundAmount: refund.amount / 100,
        },
      });
    } catch (error) {
      console.error("Refund payment error:", error);
      res.status(500).json({
        success: false,
        message: "Error processing refund",
      });
    }
  },

  // Cancel payment plan
  cancelPaymentPlan: async (req, res) => {
    try {
      const { paymentId } = req.params;
      const { reason } = req.body;

      const payment = await Payment.findById(paymentId);
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Payment not found",
        });
      }

      // Cancel Stripe subscription if exists
      if (payment.stripeSubscriptionId) {
        try {
          await stripe.subscriptions.cancel(payment.stripeSubscriptionId);
        } catch (stripeError) {
          console.log("Error cancelling Stripe subscription:", stripeError);
        }
      }

      payment.status = "cancelled";
      const currentMetadata = payment.metadata
        ? payment.metadata.toObject()
        : {};
      const updatedMetadata = {
        ...currentMetadata,
        cancellationReason: reason,
        cancelledBy: req.user.id,
        cancelledAt: new Date(),
      };
      payment.set("metadata", updatedMetadata);

      await payment.save();

      res.json({
        success: true,
        message: "Payment plan cancelled successfully",
        data: payment,
      });
    } catch (error) {
      console.error("Cancel payment plan error:", error);
      res.status(500).json({
        success: false,
        message: "Error cancelling payment plan",
      });
    }
  },

  // Get payment analytics
  getPaymentAnalytics: async (req, res) => {
    try {
      const { period = "month" } = req.query;

      let dateFilter = {};
      const now = new Date();

      switch (period) {
        case "week":
          dateFilter = {
            createdAt: {
              $gte: new Date(now.setDate(now.getDate() - 7)),
            },
          };
          break;
        case "month":
          dateFilter = {
            createdAt: {
              $gte: new Date(now.getFullYear(), now.getMonth(), 1),
            },
          };
          break;
        case "year":
          dateFilter = {
            createdAt: {
              $gte: new Date(now.getFullYear(), 0, 1),
            },
          };
          break;
      }

      const analytics = await Payment.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: {
              $dateToString: {
                format: period === "year" ? "%Y-%m" : "%Y-%m-%d",
                date: "$createdAt",
              },
            },
            totalRevenue: {
              $sum: {
                $cond: [{ $eq: ["$status", "completed"] }, "$totalAmount", 0],
              },
            },
            totalPayments: { $sum: 1 },
            completedPayments: {
              $sum: {
                $cond: [{ $eq: ["$status", "completed"] }, 1, 0],
              },
            },
            failedPayments: {
              $sum: {
                $cond: [{ $in: ["$status", ["failed", "cancelled"]] }, 1, 0],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      console.error("Get payment analytics error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching payment analytics",
      });
    }
  },

  // Add these methods to your existing adminPaymentController.js

  // Admin creates payment intent on behalf of student
  createPaymentIntentForStudent: async (req, res) => {
    try {
      const { applicationId } = req.params;

      const application = await Application.findById(applicationId)
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
          userId: application.userId._id.toString(),
          certificationId: application.certificationId._id.toString(),
          processedByAdmin: req.user.id,
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      // Create or update payment record
      if (!payment) {
        payment = await Payment.create({
          userId: application.userId._id,
          applicationId: applicationId,
          certificationId: application.certificationId._id,
          paymentType: "one_time",
          totalAmount: paymentAmount,
          status: "pending",
          stripePaymentIntentId: paymentIntent.id,
          stripeCustomerId: customer.id,
          metadata: {
            processedByAdmin: req.user.id,
          },
        });
      } else {
        payment.stripePaymentIntentId = paymentIntent.id;
        payment.stripeCustomerId = customer.id;
        payment.status = "pending";
        const currentMetadata = payment.metadata
          ? payment.metadata.toObject()
          : {};
        const updatedMetadata = {
          ...currentMetadata,
          processedByAdmin: req.user.id,
        };
        payment.set("metadata", updatedMetadata);
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
      console.error("Admin create payment intent error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating payment intent",
      });
    }
  },

  // Admin confirms payment on behalf of student
  confirmPaymentForStudent: async (req, res) => {
    try {
      const { paymentIntentId } = req.body;

      // Retrieve payment intent from Stripe
      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId
      );

      if (paymentIntent.status !== "succeeded") {
        return res.status(400).json({
          success: false,
          message: "Payment not completed",
        });
      }

      // Handle remaining balance payment
      if (paymentIntent.metadata.paymentType === "remaining_balance") {
        const originalPayment = await Payment.findById(
          paymentIntent.metadata.originalPaymentId
        );

        // Cancel the subscription
        if (originalPayment.stripeSubscriptionId) {
          await stripe.subscriptions.cancel(
            originalPayment.stripeSubscriptionId
          );
        }

        // Update payment record
        originalPayment.status = "completed";
        originalPayment.completedAt = new Date();
        originalPayment.paymentPlan.recurringPayments.completedPayments =
          originalPayment.paymentPlan.recurringPayments.totalPayments;

        // Add to payment history
        originalPayment.paymentHistory.push({
          amount: parseFloat(paymentIntent.amount / 100),
          type: "remaining_balance",
          status: "completed",
          stripePaymentIntentId: paymentIntentId,
          paidAt: new Date(),
          processedByAdmin: req.user.id,
        });

        await originalPayment.save();

        // Update application status
        await Application.findByIdAndUpdate(originalPayment.applicationId, {
          overallStatus: "payment_completed",
          currentStep: 2,
        });

        return res.json({
          success: true,
          message: "Remaining balance paid successfully by admin",
          data: { paymentId: originalPayment._id },
        });
      }

      // Handle early installment payment
      if (paymentIntent.metadata.paymentType === "early_installment") {
        const originalPayment = await Payment.findById(
          paymentIntent.metadata.originalPaymentId
        );

        // Update completed payments count
        originalPayment.paymentPlan.recurringPayments.completedPayments += 1;

        // Add to payment history
        originalPayment.paymentHistory.push({
          amount: parseFloat(paymentIntent.amount / 100),
          type: "early_installment",
          status: "completed",
          stripePaymentIntentId: paymentIntentId,
          paidAt: new Date(),
          processedByAdmin: req.user.id,
        });

        await originalPayment.save();
        return res.json({
          success: true,
          message: "Early installment payment successful (processed by admin)",
          data: { paymentId: originalPayment._id },
        });
      }

      // Regular payment
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
        processedByAdmin: req.user.id,
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

      res.json({
        success: true,
        message: "Payment confirmed successfully by admin",
        data: {
          paymentId: payment._id,
          amount: payment.totalAmount,
          status: payment.status,
        },
      });
    } catch (error) {
      console.error("Admin confirm payment error:", error);
      res.status(500).json({
        success: false,
        message: "Error confirming payment",
      });
    }
  },

  // Admin pays remaining balance for student
  payRemainingBalanceForStudent: async (req, res) => {
    try {
      const { applicationId } = req.params;

      const application = await Application.findById(applicationId);

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
          processedByAdmin: req.user.id,
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
      console.error("Admin pay remaining balance error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating payment for remaining balance",
      });
    }
  },

  // Admin pays next installment for student
  payNextInstallmentForStudent: async (req, res) => {
    try {
      const { applicationId } = req.params;

      const payment = await Payment.findOne({
        applicationId,
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
          processedByAdmin: req.user.id,
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
      console.error("Admin pay next installment error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating payment for next installment",
      });
    }
  },

  // Admin creates setup intent for student
  createSetupIntentForStudent: async (req, res) => {
    try {
      const { applicationId } = req.body;

      const application = await Application.findById(applicationId).populate(
        "userId"
      );

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
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
          message: "Error creating customer",
        });
      }

      // Update payment record with customer ID if applicationId provided
      if (applicationId) {
        await Payment.findOneAndUpdate(
          { applicationId: applicationId },
          { stripeCustomerId: customer.id }
        );
      }

      const setupIntent = await stripe.setupIntents.create({
        customer: customer.id,
        payment_method_types: ["card"],
        metadata: {
          processedByAdmin: req.user.id,
        },
      });

      res.json({
        success: true,
        data: {
          clientSecret: setupIntent.client_secret,
          customerId: customer.id,
        },
      });
    } catch (error) {
      console.error("Admin create setup intent error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating setup intent",
      });
    }
  },

  // Admin sets up payment plan for student
  setupPaymentPlanForStudent: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { setupIntentId } = req.body;

      if (!setupIntentId) {
        return res.status(400).json({
          success: false,
          message: "Setup Intent ID is required",
        });
      }

      const application = await Application.findById(applicationId)
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
              processedByAdmin: req.user.id,
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
              processedByAdmin: req.user.id, // Add this field to payment history schema
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
              name: `${application.certificationId.name} - Payment Plan (Admin Processed)`,
            },
          });

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
                processedByAdmin: req.user.id,
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

      // FIX: Properly handle metadata assignment
      payment.status = "processing";

      // Convert existing metadata to plain object and add new field
      const currentMetadata = payment.metadata
        ? payment.metadata.toObject()
        : {};
      const updatedMetadata = {
        ...currentMetadata,
        processedByAdmin: req.user.id,
      };

      // Set the metadata using the set method to avoid Mongoose casting issues
      payment.set("metadata", updatedMetadata);

      await payment.save();

      // Update application status
      await Application.findByIdAndUpdate(applicationId, {
        overallStatus: "payment_completed",
        currentStep: 2,
      });

      const user = await User.findById(application.userId);
      await EmailHelpers.handlePaymentPlanSetup(user, application, payment);

      res.json({
        success: true,
        message: "Payment plan setup successfully by admin",
        data: {
          paymentId: payment._id,
          subscriptionId: payment.stripeSubscriptionId,
          initialPaymentStatus: payment.paymentPlan.initialPayment.status,
        },
      });
    } catch (error) {
      console.error("Admin setup payment plan error:", error);
      res.status(500).json({
        success: false,
        message: "Error setting up payment plan",
      });
    }
  },

  // 1. Mark whole payment as paid manually
  markPaymentAsPaid: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { notes } = req.body;

      const application = await Application.findById(applicationId);
      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      const payment = await Payment.findOne({ applicationId });
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Payment not found",
        });
      }

      if (payment.status === "completed") {
        return res.status(400).json({
          success: false,
          message: "Payment already completed",
        });
      }

      // Cancel Stripe subscription if it exists (for payment plans)
      if (payment.stripeSubscriptionId) {
        try {
          await stripe.subscriptions.cancel(payment.stripeSubscriptionId);
        } catch (stripeError) {
          console.log("Error cancelling Stripe subscription:", stripeError);
        }
      }

      // Mark payment as completed
      payment.status = "completed";
      payment.completedAt = new Date();

      // For payment plans, mark all payments as completed
      if (payment.paymentType === "payment_plan") {
        payment.paymentPlan.initialPayment.status = "completed";
        payment.paymentPlan.initialPayment.paidAt = new Date();
        payment.paymentPlan.recurringPayments.completedPayments =
          payment.paymentPlan.recurringPayments.totalPayments;
      }

      // Add to payment history
      payment.paymentHistory.push({
        amount: payment.totalAmount,
        type: "manual_full_payment",
        status: "completed",
        paidAt: new Date(),
        processedByAdmin: req.user.id,
      });

      // Update metadata
      const currentMetadata = payment.metadata
        ? payment.metadata.toObject()
        : {};
      const updatedMetadata = {
        ...currentMetadata,
        manuallyMarkedAsPaid: true,
        manualPaymentNotes: notes || "Marked as paid by admin",
        manualPaymentBy: req.user.id,
        manualPaymentAt: new Date(),
      };
      payment.set("metadata", updatedMetadata);

      await payment.save();

      // Update application status
      await Application.findByIdAndUpdate(applicationId, {
        overallStatus: "payment_completed",
        currentStep: 2,
      });

      res.json({
        success: true,
        message: "Payment marked as paid successfully",
        data: {
          paymentId: payment._id,
          amount: payment.totalAmount,
          status: payment.status,
        },
      });
    } catch (error) {
      console.error("Mark payment as paid error:", error);
      res.status(500).json({
        success: false,
        message: "Error marking payment as paid",
      });
    }
  },

  // 2. Mark next installment as paid manually
  markNextInstallmentAsPaid: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { notes } = req.body;

      const payment = await Payment.findOne({
        applicationId,
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
          message: "Payment plan already completed",
        });
      }

      // Check if there are more installments to pay
      const { completedPayments, totalPayments, amount } =
        payment.paymentPlan.recurringPayments;

      if (completedPayments >= totalPayments) {
        return res.status(400).json({
          success: false,
          message: "All installments already paid",
        });
      }

      // Mark next installment as paid
      payment.paymentPlan.recurringPayments.completedPayments += 1;

      // Add to payment history
      payment.paymentHistory.push({
        amount: amount,
        type: "manual_installment",
        status: "completed",
        paidAt: new Date(),
        processedByAdmin: req.user.id,
      });

      // Update metadata
      const currentMetadata = payment.metadata
        ? payment.metadata.toObject()
        : {};
      const updatedMetadata = {
        ...currentMetadata,
        [`manualInstallment_${completedPayments + 1}`]: {
          markedBy: req.user.id,
          markedAt: new Date(),
          notes: notes || "Installment marked as paid by admin",
        },
      };
      payment.set("metadata", updatedMetadata);

      // If this was the last installment, mark payment as completed
      if (
        payment.paymentPlan.recurringPayments.completedPayments >= totalPayments
      ) {
        payment.status = "completed";
        payment.completedAt = new Date();

        // Cancel Stripe subscription
        if (payment.stripeSubscriptionId) {
          try {
            await stripe.subscriptions.cancel(payment.stripeSubscriptionId);
          } catch (stripeError) {
            console.log("Error cancelling Stripe subscription:", stripeError);
          }
        }

        // Update application status
        await Application.findByIdAndUpdate(applicationId, {
          overallStatus: "payment_completed",
          currentStep: 2,
        });
      } else {
        // Skip next payment in Stripe subscription
        if (payment.stripeSubscriptionId) {
          try {
            // Get the subscription
            const subscription = await stripe.subscriptions.retrieve(
              payment.stripeSubscriptionId
            );

            // Update the subscription to skip the next invoice
            await stripe.subscriptions.update(payment.stripeSubscriptionId, {
              proration_behavior: "none",
              metadata: {
                ...subscription.metadata,
                skip_next_invoice: "true",
                skipped_by_admin: req.user.id,
                skipped_at: new Date().toISOString(),
              },
            });
          } catch (stripeError) {
            console.log("Error updating Stripe subscription:", stripeError);
          }
        }
      }

      await payment.save();

      res.json({
        success: true,
        message: "Next installment marked as paid successfully",
        data: {
          paymentId: payment._id,
          completedPayments:
            payment.paymentPlan.recurringPayments.completedPayments,
          totalPayments: payment.paymentPlan.recurringPayments.totalPayments,
          remainingAmount: payment.remainingAmount,
          isCompleted: payment.status === "completed",
        },
      });
    } catch (error) {
      console.error("Mark next installment as paid error:", error);
      res.status(500).json({
        success: false,
        message: "Error marking next installment as paid",
      });
    }
  },

  // 3. Mark remaining installments as paid manually
  markRemainingInstallmentsAsPaid: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { notes } = req.body;

      const payment = await Payment.findOne({
        applicationId,
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
          message: "Payment plan already completed",
        });
      }

      const { completedPayments, totalPayments, amount } =
        payment.paymentPlan.recurringPayments;
      const remainingInstallments = totalPayments - completedPayments;

      if (remainingInstallments <= 0) {
        return res.status(400).json({
          success: false,
          message: "No remaining installments to pay",
        });
      }

      // Cancel Stripe subscription
      if (payment.stripeSubscriptionId) {
        try {
          await stripe.subscriptions.cancel(payment.stripeSubscriptionId);
        } catch (stripeError) {
          console.log("Error cancelling Stripe subscription:", stripeError);
        }
      }

      // Mark all remaining installments as paid
      payment.paymentPlan.recurringPayments.completedPayments = totalPayments;
      payment.status = "completed";
      payment.completedAt = new Date();

      // Add to payment history
      payment.paymentHistory.push({
        amount: remainingInstallments * amount,
        type: "manual_remaining_installments",
        status: "completed",
        paidAt: new Date(),
        processedByAdmin: req.user.id,
      });

      // Update metadata
      const currentMetadata = payment.metadata
        ? payment.metadata.toObject()
        : {};
      const updatedMetadata = {
        ...currentMetadata,
        remainingInstallmentsMarkedAsPaid: true,
        remainingInstallmentsCount: remainingInstallments,
        remainingInstallmentsAmount: remainingInstallments * amount,
        remainingInstallmentsNotes:
          notes || "Remaining installments marked as paid by admin",
        remainingInstallmentsBy: req.user.id,
        remainingInstallmentsAt: new Date(),
      };
      payment.set("metadata", updatedMetadata);

      await payment.save();

      // Update application status using new step calculator
      try {
        const { updateApplicationStep } = require("../utils/stepCalculator");
        await updateApplicationStep(applicationId);
      } catch (error) {
        console.error("Error updating application progress:", error);
        // Fallback to legacy update
        await Application.findByIdAndUpdate(applicationId, {
          overallStatus: "payment_completed",
          currentStep: 2,
        });
      }

      res.json({
        success: true,
        message: "Remaining installments marked as paid successfully",
        data: {
          paymentId: payment._id,
          paidInstallments: remainingInstallments,
          paidAmount: remainingInstallments * amount,
          totalAmount: payment.totalAmount,
          status: payment.status,
        },
      });
    } catch (error) {
      console.error("Mark remaining installments as paid error:", error);
      res.status(500).json({
        success: false,
        message: "Error marking remaining installments as paid",
      });
    }
  },
};

module.exports = adminPaymentController;
