// models/payment.js - Updated schema to support admin processing
const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
    },
    certificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Certification",
      required: true,
    },
    paymentType: {
      type: String,
      enum: ["one_time", "payment_plan"],
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "AUD",
    },
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
        "refunded",
      ],
      default: "pending",
    },
    // Stripe payment intent for one-time payments
    stripePaymentIntentId: {
      type: String,
    },
    // Stripe subscription for payment plans
    stripeSubscriptionId: {
      type: String,
    },
    stripeCustomerId: {
      type: String,
    },
    // Payment plan details
    paymentPlan: {
      initialPayment: {
        amount: Number,
        status: {
          type: String,
          enum: ["pending", "completed", "failed"],
          default: "pending",
        },
        paidAt: Date,
        stripePaymentIntentId: String,
      },
      recurringPayments: {
        amount: Number,
        frequency: {
          type: String,
          enum: ["weekly", "fortnightly", "monthly", "custom"],
        },
        customInterval: {
          value: Number, // e.g., 3 for every 3 weeks
          unit: {
            type: String,
            enum: ["days", "weeks", "months"],
          },
        },
        startDate: Date,
        endDate: Date,
        totalPayments: Number,
        completedPayments: {
          type: Number,
          default: 0,
        },
      },
    },
    // Payment history for tracking all transactions
    paymentHistory: [
      {
        amount: Number,
        type: {
          type: String,
          enum: [
            "initial",
            "recurring",
            "one_time",
            "early_installment",
            "remaining_balance",
            "manual_full_payment",
            "manual_installment",
            "manual_remaining_installments",
          ],
        },
        status: {
          type: String,
          enum: ["pending", "completed", "failed"],
        },
        stripePaymentIntentId: String,
        paidAt: Date,
        failureReason: String,
        // ADD THIS FIELD for tracking admin-processed payments
        processedByAdmin: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],
    // Metadata - keeping as Map but handling assignment properly
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },
    completedAt: Date,
    failureReason: String,
    // Track if COE has been sent to avoid duplicates
    coeSent: {
      type: Boolean,
      default: false,
    },
    coeSentAt: Date,
    // Track if invoice email has been sent to avoid duplicates
    invoiceEmailSent: {
      type: Boolean,
      default: false,
    },
    invoiceEmailSentAt: Date,
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
paymentSchema.index({ userId: 1, status: 1 });
paymentSchema.index({ applicationId: 1 });
paymentSchema.index({ stripePaymentIntentId: 1 });
paymentSchema.index({ stripeSubscriptionId: 1 });

// Virtual for calculating remaining amount
paymentSchema.virtual("remainingAmount").get(function () {
  const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
  if (this.paymentType === "one_time") {
    return this.status === "completed" ? 0 : round2(this.totalAmount);
  }

  if (this.paymentType === "payment_plan") {
    const initialPaid =
      this.paymentPlan.initialPayment.status === "completed"
        ? round2(this.paymentPlan.initialPayment.amount)
        : 0;
    const recurringPaid = round2(
      this.paymentPlan.recurringPayments.completedPayments *
      this.paymentPlan.recurringPayments.amount
    );
    const rem = round2(this.totalAmount) - round2(initialPaid + recurringPaid);
    return rem < 0 ? 0 : round2(rem);
  }

  return round2(this.totalAmount);
});

// Method to check if payment is fully completed
paymentSchema.methods.isFullyPaid = function () {
  const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
  if (this.paymentType === "one_time") {
    return this.status === "completed";
  }

  if (this.paymentType === "payment_plan") {
    const initialCompleted =
      this.paymentPlan.initialPayment.status === "completed";
    const recurringCompleted =
      this.paymentPlan.recurringPayments.completedPayments >=
      this.paymentPlan.recurringPayments.totalPayments;
    // Also ensure remainingAmount is zero to 2dp
    return initialCompleted && recurringCompleted && round2(this.remainingAmount) === 0;
  }

  return false;
};

// Method to get next payment due date
paymentSchema.methods.getNextPaymentDate = function () {
  if (this.paymentType === "one_time" || this.isFullyPaid()) {
    return null;
  }

  if (this.paymentPlan.initialPayment.status !== "completed") {
    return new Date(); // Initial payment is due now
  }

  const { frequency, customInterval, startDate } =
    this.paymentPlan.recurringPayments;
  const completedPayments =
    this.paymentPlan.recurringPayments.completedPayments;

  let nextDate = new Date(startDate);

  for (let i = 0; i < completedPayments + 1; i++) {
    switch (frequency) {
      case "weekly":
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case "fortnightly":
        nextDate.setDate(nextDate.getDate() + 14);
        break;
      case "monthly":
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case "custom":
        if (customInterval.unit === "days") {
          nextDate.setDate(nextDate.getDate() + customInterval.value);
        } else if (customInterval.unit === "weeks") {
          nextDate.setDate(nextDate.getDate() + customInterval.value * 7);
        } else if (customInterval.unit === "months") {
          nextDate.setMonth(nextDate.getMonth() + customInterval.value);
        }
        break;
    }
  }

  return nextDate;
};

module.exports = mongoose.model("Payment", paymentSchema);
