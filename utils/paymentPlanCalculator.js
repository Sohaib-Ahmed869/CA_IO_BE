// utils/paymentPlanCalculator.js
// Utility functions for payment plan calculations
// This ensures consistent calculation logic across the application

const paymentPlanCalculator = {
  /**
   * Calculate installment amount for payment plans
   * @param {number} totalAmount - Total amount to be paid
   * @param {number} initialPayment - Initial payment amount
   * @param {number} totalPayments - Number of installments
   * @returns {number} - Installment amount
   */
  calculateInstallmentAmount: (totalAmount, initialPayment, totalPayments) => {
    const remainingAmount = totalAmount - (initialPayment || 0);
    if (remainingAmount <= 0 || totalPayments <= 0) {
      return 0;
    }
    return Math.round((remainingAmount / totalPayments) * 100) / 100; // Round to 2 decimal places
  },

  /**
   * Recalculate payment plan after discount is applied
   * @param {Object} payment - Payment object
   * @param {number} newTotalAmount - New total amount after discount
   * @returns {Object} - Updated payment plan
   */
  recalculatePaymentPlan: (payment, newTotalAmount) => {
    if (payment.paymentType !== "payment_plan" || !payment.paymentPlan) {
      return payment.paymentPlan;
    }

    const { initialPayment, recurringPayments } = payment.paymentPlan;
    const initialAmount = initialPayment?.amount || 0;
    const totalPayments = recurringPayments?.totalPayments || 0;
    
    // Calculate new installment amount
    const newInstallmentAmount = paymentPlanCalculator.calculateInstallmentAmount(
      newTotalAmount,
      initialAmount,
      totalPayments
    );

    return {
      ...payment.paymentPlan,
      recurringPayments: {
        ...recurringPayments,
        amount: newInstallmentAmount
      }
    };
  },

  /**
   * Validate payment plan configuration
   * @param {Object} paymentPlan - Payment plan object
   * @param {number} totalAmount - Total amount
   * @returns {Object} - Validation result
   */
  validatePaymentPlan: (paymentPlan, totalAmount) => {
    const errors = [];
    
    if (!paymentPlan) {
      return { isValid: true, errors: [] };
    }

    const { initialPayment, recurringPayments } = paymentPlan;
    const initialAmount = initialPayment?.amount || 0;
    const installmentAmount = recurringPayments?.amount || 0;
    const totalPayments = recurringPayments?.totalPayments || 0;

    // Check if total adds up correctly
    const calculatedTotal = initialAmount + (installmentAmount * totalPayments);
    const tolerance = 0.01; // Allow 1 cent tolerance for rounding
    
    if (Math.abs(calculatedTotal - totalAmount) > tolerance) {
      errors.push(`Payment plan total (${calculatedTotal}) doesn't match expected total (${totalAmount})`);
    }

    // Check for negative amounts
    if (initialAmount < 0) {
      errors.push("Initial payment cannot be negative");
    }
    if (installmentAmount < 0) {
      errors.push("Installment amount cannot be negative");
    }
    if (totalPayments < 0) {
      errors.push("Total payments cannot be negative");
    }

    // Check if total exceeds original amount
    if (calculatedTotal > totalAmount + tolerance) {
      errors.push("Payment plan total exceeds the required amount");
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  },

  /**
   * Get payment status based on payment plan progress
   * @param {Object} payment - Payment object
   * @returns {string} - Payment status
   */
  getPaymentStatus: (payment) => {
    if (payment.paymentType === "one_time") {
      return payment.status;
    }

    if (payment.paymentType === "payment_plan") {
      const { initialPayment, recurringPayments } = payment.paymentPlan;
      const initialCompleted = initialPayment?.status === "completed";
      const recurringCompleted = recurringPayments?.completedPayments >= recurringPayments?.totalPayments;
      
      if (initialCompleted && recurringCompleted) {
        return "completed";
      } else if (initialCompleted || recurringPayments?.completedPayments > 0) {
        return "processing";
      } else {
        return "pending";
      }
    }

    return payment.status;
  },

  /**
   * Check if payment is fully completed
   * @param {Object} payment - Payment object
   * @returns {boolean} - Whether payment is fully completed
   */
  isPaymentCompleted: (payment) => {
    if (payment.paymentType === "one_time") {
      return payment.status === "completed";
    }

    if (payment.paymentType === "payment_plan") {
      const { initialPayment, recurringPayments } = payment.paymentPlan;
      const initialCompleted = initialPayment?.status === "completed";
      const recurringCompleted = recurringPayments?.completedPayments >= recurringPayments?.totalPayments;
      
      return initialCompleted && recurringCompleted;
    }

    return false;
  }
};

module.exports = paymentPlanCalculator;
