// utils/paymentUtils.js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const paymentUtils = {
  // Format currency amount
  formatCurrency: (amount, currency = "AUD") => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: currency,
    }).format(amount);
  },

  // Convert dollars to cents for Stripe
  dollarsToCents: (dollars) => {
    return Math.round(dollars * 100);
  },

  // Convert cents to dollars from Stripe
  centsToDollars: (cents) => {
    return cents / 100;
  },

  // Calculate payment plan totals
  calculatePaymentPlanTotals: (plan) => {
    const initialAmount = plan.initialPayment?.amount || 0;
    const recurringTotal =
      (plan.recurringPayments?.amount || 0) *
      (plan.recurringPayments?.totalPayments || 0);

    return {
      initialAmount,
      recurringTotal,
      grandTotal: initialAmount + recurringTotal,
    };
  },

  // Apply discount to amount
  applyDiscount: (originalAmount, discount, discountType) => {
    if (discountType === "percentage") {
      return originalAmount * (1 - discount / 100);
    } else {
      return Math.max(0, originalAmount - discount);
    }
  },

  // Get payment frequency in days
  getFrequencyInDays: (frequency, customInterval = null) => {
    switch (frequency) {
      case "weekly":
        return 7;
      case "fortnightly":
        return 14;
      case "monthly":
        return 30;
      case "custom":
        if (customInterval?.unit === "days") {
          return customInterval.value;
        } else if (customInterval?.unit === "weeks") {
          return customInterval.value * 7;
        } else if (customInterval?.unit === "months") {
          return customInterval.value * 30;
        }
        return 30; // Default to monthly
      default:
        return 30;
    }
  },

  // Calculate next payment date
  calculateNextPaymentDate: (
    startDate,
    frequency,
    customInterval,
    paymentsCompleted = 0
  ) => {
    const start = new Date(startDate);
    const frequencyDays = paymentUtils.getFrequencyInDays(
      frequency,
      customInterval
    );

    const nextDate = new Date(start);
    nextDate.setDate(start.getDate() + frequencyDays * (paymentsCompleted + 1));

    return nextDate;
  },

  // Validate payment amount
  validatePaymentAmount: (amount, minAmount = 0.5, maxAmount = 50000) => {
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount)) {
      return { valid: false, message: "Amount must be a valid number" };
    }

    if (numAmount < minAmount) {
      return { valid: false, message: `Amount must be at least $${minAmount}` };
    }

    if (numAmount > maxAmount) {
      return { valid: false, message: `Amount cannot exceed $${maxAmount}` };
    }

    return { valid: true };
  },

  // Create or retrieve Stripe customer
  createOrRetrieveCustomer: async (userEmail, userName, userPhone) => {
    try {
      // Check if customer already exists
      const existingCustomers = await stripe.customers.list({
        email: userEmail,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        return existingCustomers.data[0];
      }

      // Create new customer
      return await stripe.customers.create({
        email: userEmail,
        name: userName,
        phone: userPhone,
      });
    } catch (error) {
      console.error("Error creating/retrieving Stripe customer:", error);
      throw new Error("Failed to create payment customer");
    }
  },

  // Generate payment plan schedule
  generatePaymentSchedule: (plan) => {
    const schedule = [];
    const startDate = new Date(plan.recurringPayments.startDate);

    // Add initial payment if exists
    if (plan.initialPayment?.amount > 0) {
      schedule.push({
        type: "initial",
        amount: plan.initialPayment.amount,
        dueDate: new Date(), // Due immediately
        status: plan.initialPayment.status || "pending",
      });
    }

    // Add recurring payments
    for (let i = 0; i < plan.recurringPayments.totalPayments; i++) {
      const dueDate = paymentUtils.calculateNextPaymentDate(
        startDate,
        plan.recurringPayments.frequency,
        plan.recurringPayments.customInterval,
        i
      );

      schedule.push({
        type: "recurring",
        amount: plan.recurringPayments.amount,
        dueDate: dueDate,
        paymentNumber: i + 1,
        status:
          i < plan.recurringPayments.completedPayments
            ? "completed"
            : "pending",
      });
    }

    return schedule;
  },

  // Get payment status badge info
  getPaymentStatusInfo: (status) => {
    const statusMap = {
      pending: {
        color: "orange",
        text: "Pending",
        description: "Payment is pending",
      },
      processing: {
        color: "blue",
        text: "Processing",
        description: "Payment plan is active",
      },
      completed: {
        color: "green",
        text: "Completed",
        description: "Payment successfully completed",
      },
      failed: {
        color: "red",
        text: "Failed",
        description: "Payment failed",
      },
      cancelled: {
        color: "gray",
        text: "Cancelled",
        description: "Payment was cancelled",
      },
      refunded: {
        color: "purple",
        text: "Refunded",
        description: "Payment was refunded",
      },
    };

    return statusMap[status] || statusMap.pending;
  },

  // Format payment plan description
  formatPaymentPlanDescription: (plan) => {
    const totals = paymentUtils.calculatePaymentPlanTotals(plan);
    let description = "";

    if (plan.initialPayment?.amount > 0) {
      description += `Initial payment of ${paymentUtils.formatCurrency(
        plan.initialPayment.amount
      )}`;
    }

    if (plan.recurringPayments?.amount > 0) {
      if (description) description += ", then ";

      description += `${plan.recurringPayments.totalPayments} ${
        plan.recurringPayments.frequency
      } payments of ${paymentUtils.formatCurrency(
        plan.recurringPayments.amount
      )}`;
    }

    description += ` (Total: ${paymentUtils.formatCurrency(
      totals.grandTotal
    )})`;

    return description;
  },

  // Check if payment is overdue
  isPaymentOverdue: (dueDate, status) => {
    if (status === "completed") return false;
    return new Date() > new Date(dueDate);
  },

  // Get days until due
  getDaysUntilDue: (dueDate) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  },
};

module.exports = paymentUtils;
