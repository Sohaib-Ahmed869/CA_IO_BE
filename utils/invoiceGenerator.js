// utils/invoiceGenerator.js
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const https = require('https');

class InvoiceGenerator {
  constructor() {
    this.companyName = process.env.RTO_NAME || "Certified Australia";
    this.companyLegalName = process.env.COMPANY_LEGAL || "E Training Group Pty Ltd";
    this.rtoCode = process.env.RTO_CODE || "45156";
    this.abn = process.env.ABN || "61 610 991 145";
    this.cricos = process.env.CRICOS || "03981M";
    this.companyAddress = process.env.COMPANY_ADDRESS || "500 Spencer St, West Melbourne, VIC, 3003";
    this.companyPhone = process.env.COMPANY_PHONE || "(03) 9917 5018";
    this.companyEmail =
      process.env.COMPANY_EMAIL ||
      process.env.SUPPORT_EMAIL ||
      "support@certified.io";
    this.companyWebsite = process.env.COMPANY_WEBSITE || "www.etraining.edu.au";
    this.nswOffice = process.env.NSW_OFFICE || "Level-6, 16-18 Wentworth Street, Parramatta, NSW 2150";
    this.vicOffice = process.env.VIC_OFFICE || "500 Spencer St, West Melbourne, VIC 3003";
    this.logoUrl = process.env.LOGO_URL || "https://certified.io/images/certified-australia-logo.png";
    this.primaryColor = process.env.PRIMARY_COLOR || "#009934";
    this.paymentLink = process.env.PAYMENT_LINK || `https://${this.companyWebsite.replace(/^https?:\/\//,'')}/payment/`;
    
    // Bank details
    this.bankAccountName = process.env.BANK_ACCOUNT_NAME || this.companyLegalName;
    this.bankName = process.env.BANK_NAME || "Commonwealth";
    this.bsb = process.env.BANK_BSB || "063-074";
    this.accountNumber = process.env.BANK_ACCOUNT_NUMBER || "1018 0987";
    this.swiftCode = process.env.BANK_SWIFT || "CTBAAU2S";
  }

  round2(v) {
    return Math.round((Number(v) || 0) * 100) / 100;
  }

  clampMoney(v) {
    const x = this.round2(v);
    return x < 0 ? 0 : x;
  }

  // Get the most recent payment date from history
  getMostRecentPaymentDate(payment) {
    try {
      if (Array.isArray(payment.paymentHistory) && payment.paymentHistory.length > 0) {
        const completedPayments = payment.paymentHistory
          .filter(h => h?.status === 'completed' && h?.paidAt)
          .sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));
        if (completedPayments.length > 0) {
          return new Date(completedPayments[0].paidAt);
        }
      }
      // Fallback to payment plan initial payment date
      if (payment.paymentType === 'payment_plan' && payment.paymentPlan?.initialPayment?.paidAt) {
        return new Date(payment.paymentPlan.initialPayment.paidAt);
      }
      // Final fallback
      return new Date(payment.completedAt || payment.createdAt);
    } catch (_) {
      return new Date(payment.completedAt || payment.createdAt);
    }
  }

  // Sum of all completed payments to date - ONLY from payment history to avoid double counting
  getPaidToDate(payment) {
    let paid = 0;
    try {
      // ONLY use payment history - this is the source of truth
      // Do NOT add from payment plan status as that would double count
      if (Array.isArray(payment.paymentHistory)) {
        for (const h of payment.paymentHistory) {
          if (h?.status === 'completed') {
            paid += (h.amount || 0);
          }
        }
      }
      
      // For one-time payments without history, use status
      if (payment.paymentType === 'one_time' && payment.status === 'completed' && (!payment.paymentHistory || payment.paymentHistory.length === 0)) {
        paid = payment.totalAmount || 0;
      }
    } catch (_) {}
    return this.round2(paid);
  }

  resolveInstallmentAmount(payment, override) {
    const n = (v) => {
      const x = Number(v);
      return Number.isFinite(x) ? x : 0;
    };
    if (override != null) return n(override);
    // Try latest completed history entry
    if (Array.isArray(payment?.paymentHistory)) {
      const last = [...payment.paymentHistory].reverse().find(h => h?.status === 'completed' && n(h.amount) > 0);
      if (last) return n(last.amount);
    }
    // Try plan recurring amount
    if (payment?.paymentPlan?.recurringPayments?.amount) return n(payment.paymentPlan.recurringPayments.amount);
    // Fallback to payment.amount
    return n(payment?.amount || 0);
  }

  async generateInvoicePDF(payment, user, application, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 30 });
        const buffers = [];
        
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });

        // Add header with blue banner
        await this.addHeader(doc, payment, user, application);

        // Add bill to section
        this.addBillToSection(doc, payment, user, application);

        // Add invoice details table
        const yAfterTable = this.addInvoiceTable(doc, payment, application, options);

        // Add totals section just below the table
        const yAfterTotals = this.addTotalsSection(doc, payment, { ...options, yStart: yAfterTable });

        // Add payment methods starting after totals
        this.addPaymentMethods(doc, yAfterTotals + 30);

        // Add footer
        this.addFooter(doc);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  async addHeader(doc, payment, user, application) {
    // Light green banner background
    doc.rect(0, 0, 595, 70)
       .fill('#EAF7EF');

    // Add logo - larger size for better visibility
    try {
      const logoResponse = await new Promise((resolve, reject) => {
        https.get(this.logoUrl, (res) => {
          const data = [];
          res.on('data', (chunk) => data.push(chunk));
          res.on('end', () => resolve(Buffer.concat(data)));
          res.on('error', reject);
        });
      });
      
      // Increased logo size for better visibility
      doc.image(logoResponse, 30, 15, { width: 80, height: 60, fit: [80, 60] });
    } catch (error) {
      console.warn("Could not add logo to invoice:", error.message);
      // Fallback text logo
      doc.fontSize(16)
         .fillColor(this.primaryColor)
         .text(this.companyName, 30, 35);
    }

    // Company name in banner - adjusted position for larger logo
    doc.fontSize(16)
       .fillColor(this.primaryColor)
       .text(this.companyName, 120, 35);

    // Decorative lines below banner
    doc.rect(0, 70, 595, 2)
       .fill('#CFEAD8');
    doc.rect(0, 72, 595, 2)
       .fill(this.primaryColor);

    // Invoice title
    doc.fontSize(18)
       .fillColor(this.primaryColor)
       .text('Tax Invoice/Receipt', 0, 85, { align: 'center', width: 595 });
  }

  addBillToSection(doc, payment, user, application) {
    const startY = 120;
    
    // Bill To section
    doc.fontSize(12)
       .fillColor('#000000')
       .text('Bill To', 30, startY);

    // Bill To box with proper dimensions
    doc.rect(30, startY + 15, 280, 90)
       .stroke(this.primaryColor);
    
    // Customer details in the box with proper spacing
    doc.fontSize(9)
       .fillColor('#000000')
       .text(`${user.firstName} ${user.lastName}`, 35, startY + 20, { width: 270 })
       .text(user.email, 35, startY + 35, { width: 270 })
       .text(`Application ID: ${application.appCode}`, 35, startY + 50, { width: 270 })
       .text(`Qualification: ${application.certificationId?.name || 'N/A'}`, 35, startY + 65, { width: 270 });

    // Invoice details on the right with proper spacing
    const rightX = 330;
    const paymentDate = this.getMostRecentPaymentDate(payment);
    doc.fontSize(9)
       .fillColor('#000000')
       .text('Invoice/Receipt Number:', rightX, startY)
       .text(payment._id, rightX + 100, startY, { width: 200 })
       .text('Invoice Date:', rightX, startY + 15)
       .text(paymentDate.toLocaleDateString('en-AU'), rightX + 100, startY + 15)
       .text('Order no.:', rightX, startY + 30)
       .text(application._id, rightX + 100, startY + 30, { width: 200 })
       .text('Date Paid:', rightX, startY + 45)
       .text(paymentDate.toLocaleDateString('en-AU'), rightX + 100, startY + 45);
  }

  addInvoiceTable(doc, payment, application, { overrideInstallmentAmount } = {}) {
    const startY = 230;
    let currentY = startY;

    // Table header
    doc.rect(30, currentY, 535, 20)
      .fillAndStroke('#f0f0f0', this.primaryColor);

    doc.fontSize(8)
      .fillColor('#000000')
      .text('Invoice Item', 35, currentY + 6)
      .text('Description', 80, currentY + 6)
      .text('Amount', 350, currentY + 6)
      .text('GST', 450, currentY + 6)
      .text('Total Amount', 500, currentY + 6);

    currentY += 20;

    const items = this.buildInvoiceItems(payment, application);
    let itemNumber = 1;
    for (const item of items) {
      doc.rect(30, currentY, 535, 25).stroke(this.primaryColor);
      const amount = item.amount || 0;
      // Use different color for discounts (negative amounts)
      const textColor = amount < 0 ? '#008000' : '#000000'; // Green for discounts
      doc.fontSize(8)
        .fillColor(textColor)
        .text(String(itemNumber), 35, currentY + 8)
        .text(item.label, 80, currentY + 8, { width: 260 })
        .text(`$${Math.abs(amount).toFixed(2)}`, 350, currentY + 8)
        .text(`$${(0).toFixed(2)}`, 450, currentY + 8)
        .text(`${amount < 0 ? '-' : ''}$${Math.abs(amount).toFixed(2)}`, 500, currentY + 8);
      currentY += 25;
      itemNumber++;
    }

    // AUD note
    doc.fontSize(7)
      .fillColor('#666666')
      .text('*All figures are in Australian Dollar (AUD)', 30, currentY + 10);

    return currentY + 25;
  }

  addTotalsSection(doc, payment, { overrideInstallmentAmount, yStart } = {}) {
    const minY = (typeof yStart === 'number' && yStart > 0) ? yStart : 340;
    const totalsY = Math.max(minY, 340);
    const rightX = 400;

    // Calculate proper totals accounting for discounts
    const metadata = payment.metadata ? (payment.metadata.toObject ? payment.metadata.toObject() : payment.metadata) : {};
    const totalDue = this.round2(payment.totalAmount || 0); // This is already the discounted amount if discount was applied
    const totalPaid = this.round2(this.getPaidToDate(payment)); // Sum of all completed payments from history
    const balanceDue = this.clampMoney(Math.max(0, totalDue - totalPaid)); // Remaining = Total (after discount) - Paid

    // Totals box - adjust height if discount is shown
    const hasDiscount = metadata.discount && metadata.discount > 0;
    const boxHeight = hasDiscount ? 65 : 50;
    doc.rect(rightX, totalsY, 165, boxHeight)
       .stroke(this.primaryColor);

    doc.fontSize(8)
       .fillColor('#000000')
       .text('Total Due', rightX + 5, totalsY + 8)
       .text('Total Paid', rightX + 5, totalsY + 23)
       .text('Balance Due', rightX + 5, totalsY + 38);

    doc.text(`$${totalDue.toFixed(2)}`, rightX + 100, totalsY + 8)
       .text(`$${totalPaid.toFixed(2)}`, rightX + 100, totalsY + 23)
       .text(`$${balanceDue.toFixed(2)}`, rightX + 100, totalsY + 38);
  }

  addPaymentMethods(doc, startYParam) {
    const startY = startYParam && startYParam > 0 ? startYParam : 410;

    doc.fontSize(8)
       .fillColor('#000000')
       .text(`Payment can be made using any of the following method. No obligation is created on ${this.companyName} until`, 30, startY, { width: 535 })
       .text('funds are cleared and an official receipt is issued.', 30, startY + 10, { width: 535 });

    let currentY = startY + 25;

   
    currentY += 35;

    // EFT Bank Transfer
    doc.text('• EFT Bank Transfer', 30, currentY)
       .text('Bank Account Details', 30, currentY + 10)
       .text('Please use this Reference Description:', 30, currentY + 20)
       .text(`Account Name: ${this.bankAccountName}`, 30, currentY + 30)
       .text(`Bank Name: ${this.bankName}.`, 30, currentY + 40)
       .text(`BSB: ${this.bsb}, Account Number: ${this.accountNumber}`, 30, currentY + 50)
       .text(`SWFT Code (for overseas transfers): ${this.swiftCode}`, 30, currentY + 60);

    currentY += 80;

    
  }

  addFooter(doc) {
    const footerY = 620;

    // Page number
    doc.fontSize(8)
       .fillColor('#000000')
       .text('Page 1 of 1', 500, footerY, { align: 'right' });

    // Company legal info
    doc.fontSize(6)
       .fillColor('#000000')
       .text(`${this.companyLegalName} Trading as`, 30, footerY + 10, { align: 'center', width: 535 })
       .text(`${this.companyName} | ABN: ${this.abn} | RTO No: ${this.rtoCode} | CRICOS: ${this.cricos}`, 30, footerY + 18, { align: 'center', width: 535 })
       .text(`${this.companyAddress} | Telephone: ${this.companyPhone} | Email: ${this.companyEmail} | Website: ${this.companyWebsite}`, 30, footerY + 26, { align: 'center', width: 535 });

    // Version/date stamp
    const today = new Date();
    const formatted = today.toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.text(`Invoice generated on ${formatted}`, 30, footerY + 38, { align: 'center', width: 535 });
  }

  generateInvoiceTableRows(payment, qualificationName, contractTotal, installmentAmount) {
    let rows = '';
    const items = this.buildInvoiceItems(payment, { certificationId: { name: qualificationName } });
    let idx = 1;
    for (const item of items) {
      const amount = item.amount || 0;
      // Use green color for discounts (negative amounts)
      const textColor = amount < 0 ? '#008000' : '#000000';
      const amountDisplay = amount < 0 ? '-$' + Math.abs(amount).toFixed(2) : '$' + amount.toFixed(2);
      rows += '<tr style="border: 1px solid ' + this.primaryColor + ';">' +
        '<td style="padding: 8px; border: 1px solid ' + this.primaryColor + ';">' + idx + '</td>' +
        '<td style="padding: 8px; border: 1px solid ' + this.primaryColor + '; color: ' + textColor + ';">' + item.label + '</td>' +
        '<td style="padding: 8px; border: 1px solid ' + this.primaryColor + '; text-align: right; color: ' + textColor + ';">' + amountDisplay + '</td>' +
        '<td style="padding: 8px; border: 1px solid ' + this.primaryColor + '; text-align: right;">$0.00</td>' +
        '<td style="padding: 8px; border: 1px solid ' + this.primaryColor + '; text-align: right; color: ' + textColor + ';">' + amountDisplay + '</td>' +
        '</tr>';
      idx++;
    }
    return rows;
  }

  // Build line items for invoice from payment history and fields
  buildInvoiceItems(payment, application) {
    const items = [];

    const history = Array.isArray(payment.paymentHistory) ? [...payment.paymentHistory] : [];
    history.sort((a, b) => new Date(a.paidAt || 0) - new Date(b.paidAt || 0));

    const totalInstallments = payment.paymentPlan?.recurringPayments?.totalPayments || 0;
    let installmentCounter = 0;

    // If one-time payment and have history, list those entries; fall back to single fee with discount if applicable
    if (payment.paymentType === 'one_time') {
      // Check for discount
      const metadata = payment.metadata ? (payment.metadata.toObject ? payment.metadata.toObject() : payment.metadata) : {};
      const originalPrice = metadata.originalPrice || payment.totalAmount;
      const discount = metadata.discount;
      const discountType = metadata.discountType;

      if (history.length > 0) {
        // Show original price and discount first if discount exists
        if (discount && discount > 0 && originalPrice > payment.totalAmount) {
          items.push({ label: 'Original Qualification Fee', amount: this.round2(originalPrice) });
          const discountAmount = this.round2(originalPrice - payment.totalAmount);
          if (discountType === 'percentage') {
            items.push({ label: `Discount (${discount}%)`, amount: -discountAmount });
          } else {
            items.push({ label: 'Discount', amount: -this.round2(discount) });
          }
        }
        
        // Then show payment history
        for (const h of history) {
          if (h.status !== 'completed') continue;
          let label = 'Payment';
          if (h.type === 'one_time') label = 'One-time Payment';
          else if (h.type === 'remaining_balance') label = 'Remaining Balance';
          else if (h.type === 'manual_full_payment') label = 'Manual Full Payment';
          items.push({ label, amount: this.round2(h.amount || 0) });
        }
      } else {
        // No history yet - show qualification fee with discount if applicable
        if (discount && discount > 0 && originalPrice > payment.totalAmount) {
          items.push({ label: 'Original Qualification Fee', amount: this.round2(originalPrice) });
          const discountAmount = this.round2(originalPrice - payment.totalAmount);
          if (discountType === 'percentage') {
            items.push({ label: `Discount (${discount}%)`, amount: -discountAmount });
          } else {
            items.push({ label: 'Discount', amount: -this.round2(discount) });
          }
        } else {
          const qualificationName = application?.certificationId?.name || 'Qualification Fee';
          items.push({ label: qualificationName, amount: this.round2(payment.totalAmount || 0) });
        }
      }
      return items;
    }

    // Payment plan: show original price, discount (if any), and then payment breakdown
    if (payment.paymentType === 'payment_plan') {
      // Get original price and discount info from metadata
      const metadata = payment.metadata ? (payment.metadata.toObject ? payment.metadata.toObject() : payment.metadata) : {};
      const originalPrice = metadata.originalPrice || payment.totalAmount;
      const discount = metadata.discount;
      const discountType = metadata.discountType;
      
      // If there's a discount, show original price and discount
      if (discount && discount > 0 && originalPrice > payment.totalAmount) {
        items.push({ label: 'Original Qualification Fee', amount: this.round2(originalPrice) });
        const discountAmount = this.round2(originalPrice - payment.totalAmount);
        if (discountType === 'percentage') {
          items.push({ label: `Discount (${discount}%)`, amount: -discountAmount });
        } else {
          items.push({ label: 'Discount', amount: -this.round2(discount) });
        }
      } else {
        // If no discount, just show the qualification fee
        const qualificationName = application?.certificationId?.name || 'Qualification Fee';
        items.push({ label: qualificationName, amount: this.round2(payment.totalAmount || 0) });
      }

      // Show initial payment only if it has been paid (from history)
      // This ensures invoice totals are accurate (only showing actual payments)
      const initialAmount = payment.paymentPlan?.initialPayment?.amount || 0;
      if (initialAmount > 0) {
        // Check if initial payment has been completed in history
        const initialHist = history.find(h => h.type === 'initial' && h.status === 'completed');
        if (initialHist && initialHist.amount > 0) {
          // Show actual paid amount from history
          items.push({ label: 'Initial Payment', amount: this.round2(initialHist.amount) });
        } else if (payment.paymentPlan?.initialPayment?.status === 'completed') {
          // Fallback: if status is completed but no history entry yet, use plan amount
          items.push({ label: 'Initial Payment', amount: this.round2(initialAmount) });
        }
        // Note: We don't show pending/scheduled initial payment as a line item
        // The "Balance Due" will show what's remaining, which includes the initial payment if not paid yet
      }

      // Add installments from history (completed payments)
      for (const h of history) {
        if (h.status !== 'completed') continue;
        // Skip initial payment as it's already added above
        if (h.type === 'initial') continue;
        if (h.type === 'early_installment' || h.type === 'manual_installment' || h.type === 'recurring') {
          installmentCounter += 1;
          const label = totalInstallments > 0
            ? `Installment ${installmentCounter} of ${totalInstallments}`
            : `Installment ${installmentCounter}`;
          items.push({ label, amount: this.round2(h.amount || 0) });
        }
      }

      // Remaining balance or manual full payment should also appear if present
      for (const h of history) {
        if (h.status !== 'completed') continue;
        if (h.type === 'remaining_balance') {
          items.push({ label: 'Remaining Balance', amount: this.round2(h.amount || 0) });
        }
        if (h.type === 'manual_full_payment') {
          items.push({ label: 'Manual Full Payment', amount: this.round2(h.amount || 0) });
        }
      }
    }

    return items;
  }

  generateInvoiceHTML(payment, user, application, options = {}) {
    const qualificationName = application.certificationId?.name || 'Qualification Fee';
    const contractTotal = payment.totalAmount || 0;
    const installmentAmount = payment.paymentType === 'payment_plan'
      ? (options.overrideInstallmentAmount != null ? options.overrideInstallmentAmount : (payment.amount || 0))
      : contractTotal;

    // Helpers for GST split
    const splitGST = (gross) => {
      const exGst = gross / 1.1;
      const gst = gross - exGst;
      return { exGst, gst };
    };

    const contractGST = splitGST(contractTotal);
    const installmentGST = splitGST(installmentAmount);

    // Totals box values - account for discounts properly
    const metadata = payment.metadata ? (payment.metadata.toObject ? payment.metadata.toObject() : payment.metadata) : {};
    const totalDue = contractTotal; // This is already the discounted amount if discount was applied
    const totalPaid = this.round2(this.getPaidToDate(payment)); // Sum of all completed payments from history
    const balanceDue = this.clampMoney(Math.max(0, totalDue - totalPaid)); // Remaining = Total (after discount) - Paid

    return `
      <div style="max-width: 800px; margin: 0 auto; background: #ffffff; border: 1px solid #e0e0e0; font-family: Arial, sans-serif;">
        <!-- Header with light blue banner -->
        <div style="background: #E6F3FF; color: ${this.primaryColor}; padding: 15px; position: relative;">
          <div style="display: flex; align-items: center;">
            <img src="${this.logoUrl}" alt="${this.companyName}" style="height: 50px; margin-right: 20px;">
            <div style="font-size: 16px; font-weight: 600; color: ${this.primaryColor};">${this.companyName}</div>
          </div>
        </div>
        
        <!-- Decorative lines -->
        <div style="height: 4px; background: linear-gradient(to bottom, #B3D9FF 0%, #B3D9FF 50%, ${this.primaryColor} 50%, ${this.primaryColor} 100%);"></div>

        <!-- Invoice title -->
        <div style="text-align: center; padding: 20px;">
          <h2 style="color: ${this.primaryColor}; margin: 0; font-size: 20px;">Tax Invoice/Receipt</h2>
        </div>

        <!-- Invoice Details -->
        <div style="padding: 20px; display: flex; justify-content: space-between;">
          <div style="flex: 1;">
            <h3 style="color: ${this.primaryColor}; margin-bottom: 10px;">Bill To:</h3>
            <div style="border: 1px solid ${this.primaryColor}; padding: 15px; min-height: 80px;">
              <p style="margin: 5px 0;"><strong>${user.firstName} ${user.lastName}</strong></p>
              <p style="margin: 5px 0;">${user.email}</p>
              <p style="margin: 5px 0;">Application ID: ${application.appCode || application._id}</p>
              <p style="margin: 5px 0;">Qualification: ${qualificationName}</p>
            </div>
          </div>
          <div style="flex: 1; margin-left: 20px;">
            <div style="font-size: 12px;">
              <p style="margin: 5px 0;"><strong>Invoice/Receipt Number:</strong> ${payment._id}</p>
              <p style="margin: 5px 0;"><strong>Invoice Date:</strong> ${this.getMostRecentPaymentDate(payment).toLocaleDateString('en-AU')}</p>
              <p style="margin: 5px 0;"><strong>Order no.:</strong> ${application._id}</p>
              <p style="margin: 5px 0;"><strong>Date Paid:</strong> ${this.getMostRecentPaymentDate(payment).toLocaleDateString('en-AU')}</p>
            </div>
          </div>
        </div>

        <!-- Invoice Table -->
        <div style="padding: 0 20px;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
              <tr style="background: #f0f0f0; border: 1px solid ${this.primaryColor};">
                <th style="padding: 8px; text-align: left; border: 1px solid ${this.primaryColor};">Invoice Item</th>
                <th style="padding: 8px; text-align: left; border: 1px solid ${this.primaryColor};">Description</th>
                <th style="padding: 8px; text-align: right; border: 1px solid ${this.primaryColor};">Amount</th>
                <th style="padding: 8px; text-align: right; border: 1px solid ${this.primaryColor};">GST</th>
                <th style="padding: 8px; text-align: right; border: 1px solid ${this.primaryColor};">Total Amount*</th>
              </tr>
            </thead>
            <tbody>
              ${this.generateInvoiceTableRows(payment, qualificationName, contractTotal, installmentAmount)}
            </tbody>
          </table>
          <p style="font-size: 10px; color: #666; margin: 10px 0;">*All figures are in Australian Dollar (AUD)</p>
        </div>

        <!-- Totals -->
        <div style="padding: 0 20px; display: flex; justify-content: flex-end;">
          <div style="border: 1px solid ${this.primaryColor}; padding: 10px; width: 200px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span>Total Due:</span>
              <span>$${totalDue.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span>Total Paid:</span>
              <span>$${totalPaid.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>Balance Due:</span>
              <span>$${balanceDue.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <!-- Payment Methods -->
        <div style="padding: 20px; background: #f9f9f9; margin-top: 20px;">
          <p style="margin-bottom: 15px; font-size: 11px;">Payment can be made using any of the following method. No obligation is created on Certified IO until funds are cleared and an official receipt is issued.</p>
          
          <div style="margin-bottom: 15px; font-size: 11px;">
            <p><strong>• EFT Bank Transfer</strong></p>
            <p><strong>Bank Account Details</strong></p>
            <p>Please use this Reference Description:</p>
            <p>Account Name: ${this.bankAccountName}</p>
            <p>Bank Name: ${this.bankName}</p>
            <p>BSB: ${this.bsb}, Account Number: ${this.accountNumber}</p>
            <p>SWFT Code (for overseas transfers): ${this.swiftCode}</p>
          </div>

          <div style="font-size: 11px;">
            // <p><strong>• In Person:</strong> Payment can be made in person with cash, cheque, Debit/Credit/Master Card at the Institute's office Monday to Friday – 9.30 AM to 5.30 PM (Except Public Holiday).</p>
            // <p><strong>• VIC Office:</strong> ${this.vicOffice}</p>
            // <p><strong>• NSW Office:</strong> ${this.nswOffice}</p>
          </div>
        </div>

        <!-- Footer -->
        <div style="padding: 15px; background: #f0f0f0; text-align: center; font-size: 9px;">
          <p style="margin: 3px 0;">Page 1 of 1</p>
          <p style="margin: 3px 0;">${this.companyLegalName} Trading as ${this.companyName}</p>
          <p style="margin: 3px 0;">ABN: ${this.abn} | RTO No: ${this.rtoCode} | CRICOS: ${this.cricos}</p>
          <p style="margin: 3px 0;">${this.companyAddress} | Telephone: ${this.companyPhone} | Email: ${this.companyEmail} | Website: ${this.companyWebsite}</p>
          <p style="margin: 3px 0;">Invoice generated on ${new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>
    `;
  }
}

module.exports = new InvoiceGenerator();