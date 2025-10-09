// utils/stripeFeeCalculator.js
/**
 * Stripe Fee Calculator
 * Calculates the amount to charge including Stripe processing fees
 * so that the RTO receives the exact amount they want
 */

/**
 * Calculate Stripe fees for Australian cards
 * Stripe Australia fees: 1.4% + 30¢ AUD
 * @param {number} netAmount - The amount the RTO wants to receive
 * @returns {number} - The total amount to charge including fees
 */
function calculateAmountWithStripeFees(netAmount) {
  if (!netAmount || netAmount <= 0) {
    return 0;
  }

  // Stripe Australia fees: 1.4% + 30¢ AUD
  const stripePercentage = 0.014; // 1.4%
  const stripeFixedFee = 0.30; // 30¢ AUD
  
  // Calculate: netAmount = grossAmount - (grossAmount * 0.014 + 0.30)
  // Solving for grossAmount: grossAmount = (netAmount + 0.30) / (1 - 0.014)
  const grossAmount = (netAmount + stripeFixedFee) / (1 - stripePercentage);
  
  // Round to 2 decimal places
  return Math.round(grossAmount * 100) / 100;
}

/**
 * Calculate what the RTO will receive after Stripe fees
 * @param {number} grossAmount - The total amount charged
 * @returns {number} - The amount the RTO will receive
 */
function calculateNetAmountAfterStripeFees(grossAmount) {
  if (!grossAmount || grossAmount <= 0) {
    return 0;
  }

  // Stripe Australia fees: 1.4% + 30¢ AUD
  const stripePercentage = 0.014; // 1.4%
  const stripeFixedFee = 0.30; // 30¢ AUD
  
  const netAmount = grossAmount - (grossAmount * stripePercentage + stripeFixedFee);
  
  // Round to 2 decimal places
  return Math.round(netAmount * 100) / 100;
}

/**
 * Get Stripe fee breakdown
 * @param {number} amount - The amount to analyze
 * @returns {Object} - Fee breakdown
 */
function getStripeFeeBreakdown(amount) {
  if (!amount || amount <= 0) {
    return {
      grossAmount: 0,
      percentageFee: 0,
      fixedFee: 0,
      totalFees: 0,
      netAmount: 0
    };
  }

  const stripePercentage = 0.014; // 1.4%
  const stripeFixedFee = 0.30; // 30¢ AUD
  
  const percentageFee = Math.round(amount * stripePercentage * 100) / 100;
  const totalFees = percentageFee + stripeFixedFee;
  const netAmount = Math.round((amount - totalFees) * 100) / 100;

  return {
    grossAmount: amount,
    percentageFee,
    fixedFee: stripeFixedFee,
    totalFees: Math.round(totalFees * 100) / 100,
    netAmount
  };
}

module.exports = {
  calculateAmountWithStripeFees,
  calculateNetAmountAfterStripeFees,
  getStripeFeeBreakdown
};




