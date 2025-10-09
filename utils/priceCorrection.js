// utils/priceCorrection.js
/**
 * Price Correction Utility
 * Helps correct certification prices and update related payments
 */

const Certification = require("../models/certification");
const Payment = require("../models/payment");
const { calculateAmountWithStripeFees } = require("./stripeFeeCalculator");

/**
 * Correct certification price and update related payments
 * @param {string} certificationId - Certification ID to update
 * @param {number} newPrice - New price for the certification
 * @returns {Object} - Result of the correction
 */
async function correctCertificationPrice(certificationId, newPrice) {
  try {
    console.log(`🔧 Correcting certification ${certificationId} price to $${newPrice}`);
    
    // Update certification
    const certification = await Certification.findByIdAndUpdate(
      certificationId,
      { price: newPrice },
      { new: true, runValidators: true }
    );

    if (!certification) {
      throw new Error(`Certification ${certificationId} not found`);
    }

    console.log(`✅ Updated certification "${certification.name}" price to $${newPrice}`);

    // Find all pending payments for this certification
    const pendingPayments = await Payment.find({
      certificationId: certificationId,
      status: "pending"
    });

    console.log(`📊 Found ${pendingPayments.length} pending payments to update`);

    // Update each pending payment
    const updatedPayments = [];
    for (const payment of pendingPayments) {
      const grossAmount = calculateAmountWithStripeFees(newPrice);
      const stripeFees = grossAmount - newPrice;

      // Update payment metadata
      const currentMetadata = payment.metadata ? payment.metadata.toObject() : {};
      const updatedMetadata = {
        ...currentMetadata,
        originalPrice: newPrice,
        grossAmount: grossAmount,
        netAmount: newPrice,
        stripeFees: stripeFees,
        priceCorrected: true,
        correctedAt: new Date()
      };

      payment.totalAmount = newPrice;
      payment.set("metadata", updatedMetadata);
      
      await payment.save();
      updatedPayments.push(payment._id);
      
      console.log(`✅ Updated payment ${payment._id} - Amount: $${newPrice}, Customer pays: $${grossAmount}`);
    }

    return {
      success: true,
      certification: {
        id: certification._id,
        name: certification.name,
        oldPrice: certification.price,
        newPrice: newPrice
      },
      updatedPayments: updatedPayments,
      message: `Successfully corrected certification price and updated ${updatedPayments.length} payments`
    };

  } catch (error) {
    console.error("❌ Error correcting certification price:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get fee breakdown for a given amount
 * @param {number} amount - Amount to analyze
 * @returns {Object} - Fee breakdown
 */
function getFeeBreakdown(amount) {
  const grossAmount = calculateAmountWithStripeFees(amount);
  return {
    netAmount: amount,
    grossAmount: grossAmount,
    stripeFees: grossAmount - amount,
    breakdown: {
      percentage: "1.4%",
      fixed: "$0.30 AUD",
      total: `$${(grossAmount - amount).toFixed(2)}`
    }
  };
}

module.exports = {
  correctCertificationPrice,
  getFeeBreakdown
};


