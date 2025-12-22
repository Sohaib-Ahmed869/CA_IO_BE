// utils/invoiceGenerator.js
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const https = require('https');

class InvoiceGenerator {
  constructor() {
    this.companyName = process.env.RTO_NAME || "Certified Australia";
    this.companyLegalName = process.env.COMPANY_LEGAL || "Advanced Institute of Australia";
    this.rtoCode = process.env.RTO_CODE || "45156";
    this.abn = process.env.ABN || "61 610 991 145";
    this.cricos = process.env.CRICOS || "03981M";
    this.companyAddress = process.env.COMPANY_ADDRESS || "2A, 35 Woods St, Beaconsfield 807, Victoria, Australia";
    this.companyPhone = process.env.COMPANY_PHONE || "(03) 9917 5018";
    this.companyEmail =
      process.env.COMPANY_EMAIL ||
      process.env.SUPPORT_EMAIL ||
      "support@certified.io";
    this.companyWebsite = process.env.COMPANY_WEBSITE || "www.etraining.edu.au";
    this.nswOffice = process.env.NSW_OFFICE || "Level-6, 16-18 Wentworth Street, Parramatta, NSW 2150";
    this.vicOffice = process.env.VIC_OFFICE || "2A, 35 Woods St, Beaconsfield 807, Victoria, Australia";
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
    // Header layout like CIA sample:
    // Top border line
    doc.lineWidth(1).strokeColor('#000000');
    doc.moveTo(30, 30).lineTo(565, 30).stroke();

    // Left section: Logo (25mm width approx 230 points)
    try {
      const logoResponse = await new Promise((resolve, reject) => {
        https.get(this.logoUrl, (res) => {
          const data = [];
          res.on('data', (chunk) => data.push(chunk));
          res.on('end', () => resolve(Buffer.concat(data)));
          res.on('error', reject);
        });
      });
      doc.image(logoResponse, 35, 35, { width: 110, height: 70 });
    } catch (error) {
      console.warn("Could not add logo to invoice:", error.message);
      doc.fontSize(12).fillColor('#000000').text(this.companyName, 35, 55);
    }

    // Vertical divider line at 230px (between logo and company details)
    doc.lineWidth(0.5).strokeColor('#000000');
    doc.moveTo(230, 30).lineTo(230, 105).stroke();

    // Right section: Company details (right aligned)
    const rightX = 565;
    doc.fontSize(8).fillColor('#000000');
    doc.text(this.companyName, 235, 35, { align: 'right', width: rightX - 235 });
    doc.text(this.companyAddress, 235, 46, { align: 'right', width: rightX - 235 });
    doc.text(`Ph: ${this.companyPhone}`, 235, 57, { align: 'right', width: rightX - 235 });
    doc.text(`Email: ${this.companyEmail}`, 235, 68, { align: 'right', width: rightX - 235 });
    doc.text(`RTO No: ${this.rtoCode}`, 235, 79, { align: 'right', width: rightX - 235 });
    doc.text(`CRICOS No: ${this.cricos}`, 235, 90, { align: 'right', width: rightX - 235 });

    // Bottom border line of header
    doc.lineWidth(1).strokeColor('#000000');
    doc.moveTo(30, 105).lineTo(565, 105).stroke();
  }

  addBillToSection(doc, payment, user, application) {
    const startY = 115;

    // Left section: Tax Invoice and Recipient
    doc.fontSize(11).fillColor('#000000').text('Tax Invoice', 35, startY);

    const recipientY = startY + 20;
    doc.fontSize(9).fillColor('#000000').text('Recipient', 35, recipientY);

    const nameLine = `${user.firstName || ''} ${user.lastName || ''}`.trim() || (user.email || '');
    doc.fontSize(8).text(nameLine, 35, recipientY + 12, { width: 180 });
    if (user.email) {
      doc.text((user.email || '').toUpperCase(), 35, recipientY + 25, { width: 180 });
    }

    // Right section: Invoice details in bordered box
    const boxX = 310;
    const boxY = startY;
    const boxWidth = 255;
    const boxHeight = 70;

    doc.rect(boxX, boxY, boxWidth, boxHeight).stroke();

    const paymentDate = this.getMostRecentPaymentDate(payment);
    const invoiceDateStr = paymentDate.toLocaleDateString('en-AU');
    const dueDate = new Date(paymentDate.getTime() + 14 * 24 * 60 * 60 * 1000);
    const dueDateStr = dueDate.toLocaleDateString('en-AU');
    const hasPayments = this.getPaidToDate(payment) > 0;
    const datePaidStr = hasPayments ? paymentDate.toLocaleDateString('en-AU') : 'No Payments';

    // Grid layout: 2 columns
    const col1X = boxX + 8;
    const col2X = boxX + 125;
    let lineY = boxY + 8;

    doc.fontSize(7).fillColor('#000000');
    // Row 1: Due Date | Invoice No
    doc.text('Due Date:', col1X, lineY);
    doc.text('Invoice No:', col2X, lineY);
    lineY += 10;
    doc.text(dueDateStr, col1X, lineY);
    const invoiceNo = application.invoiceNumber || application.appCode || payment._id.toString().slice(-7).toUpperCase();
    doc.text(invoiceNo, col2X, lineY);
    lineY += 10;

    // Row 2: Invoice Date | Order No
    doc.text('Invoice Date:', col1X, lineY);
    doc.text('Order No:', col2X, lineY);
    lineY += 10;
    doc.text(invoiceDateStr, col1X, lineY);
    const orderNo = application.appCode || application._id.toString().slice(-7).toUpperCase();
    doc.text(orderNo, col2X, lineY);
    lineY += 10;

    // Row 3: Date Paid
    doc.text('Date Paid:', col1X, lineY);
    lineY += 10;
    doc.text(datePaidStr, col1X, lineY);
  }

  addInvoiceTable(doc, payment, application, { overrideInstallmentAmount } = {}) {
    const startY = 200;
    let currentY = startY;

    // Table header with light gray background
    doc.rect(35, currentY, 530, 18)
      .fillAndStroke('#e8e8e8', '#000000');

    doc.fontSize(7).fillColor('#000000');
    doc.text('Description', 40, currentY + 4);
    doc.text('Amount (Ex GST)', 310, currentY + 4);
    doc.text('Total Amount', 480, currentY + 4);

    currentY += 18;

    const items = this.buildInvoiceItems(payment, application);
    for (const item of items) {
      const amount = item.amount || 0;
      doc.rect(35, currentY, 530, 20).stroke();
      doc.fontSize(7).fillColor('#000000');
      doc.text(item.label, 40, currentY + 6, { width: 260 });
      doc.text(`$${amount.toFixed(2)}`, 310, currentY + 6, { align: 'right', width: 150 });
      doc.text(`$${amount.toFixed(2)}`, 480, currentY + 6, { align: 'right', width: 80 });
      currentY += 20;
    }

    doc.fontSize(6).fillColor('#666666');
    doc.text('GST $0.00', 40, currentY + 5);
    doc.text('Total $' + (payment.totalAmount || 0).toFixed(2), 40, currentY + 12);

    return currentY + 30;
  }

  addTotalsSection(doc, payment, { overrideInstallmentAmount, yStart } = {}) {
    const minY = (typeof yStart === 'number' && yStart > 0) ? yStart : 340;
    const totalsY = Math.max(minY, 340);
    const rightX = 390;

    // Totals box
    doc.rect(rightX, totalsY, 175, 50).stroke();

    doc.fontSize(7).fillColor('#000000');
    doc.text('GST', rightX + 8, totalsY + 6);
    doc.text('Total', rightX + 8, totalsY + 18);
    doc.text('Amount Paid', rightX + 8, totalsY + 30);
    doc.text('Balance Due', rightX + 8, totalsY + 42);

    // Values
    const totalDue = this.round2(payment.totalAmount || 0);
    const fallbackPaid = this.round2(this.getPaidToDate(payment));
    const rawBalance = (payment.remainingAmount != null) ? Number(payment.remainingAmount) : Math.max(0, totalDue - fallbackPaid);
    const balanceDue = this.clampMoney(rawBalance);
    const totalPaid = this.clampMoney(totalDue - balanceDue);

    doc.text(`$${(0).toFixed(2)}`, rightX + 120, totalsY + 6, { align: 'right' });
    doc.text(`$${totalDue.toFixed(2)}`, rightX + 120, totalsY + 18, { align: 'right' });
    doc.text(`$${totalPaid.toFixed(2)}`, rightX + 120, totalsY + 30, { align: 'right' });
    doc.text(`$${balanceDue.toFixed(2)}`, rightX + 120, totalsY + 42, { align: 'right' });

    // Return the y-position after the totals box for next section positioning
    return totalsY + 60;
  }

  addPaymentMethods(doc, startYParam) {
    const startY = startYParam && startYParam > 0 ? startYParam : 420;

    doc.fontSize(8).fillColor('#000000');
    doc.text('Payment can be made by:', 35, startY);

    // Direct Debit section title
    doc.fontSize(7);
    doc.text('Direct Debit to the following Account', 35, startY + 15);

    const tableY = startY + 28;
    const col1Width = 115;
    const col2Width = 415;
    const rowHeight = 12;

    doc.fontSize(6).fillColor('#000000');
    doc.lineWidth(0.5).strokeColor('#000000');

    // Table rows with bank details
    const rows = [
      ['Bank Name', 'Commonwealth Bank'],
      ['Account Name', 'Culinary Institute Australia'],
      ['BSB', '065 000'],
      ['Account No.', '1288 6161']
    ];

    rows.forEach((row, index) => {
      const rowY = tableY + (rowHeight * index);
      
      // Draw cell borders
      doc.rect(35, rowY, col1Width, rowHeight).stroke();
      doc.rect(35 + col1Width, rowY, col2Width, rowHeight).stroke();
      
      // Add text
      doc.text(row[0], 40, rowY + 2);
      doc.text(row[1], 40 + col1Width + 5, rowY + 2);
    });

    // Add note below table
    const noteY = tableY + (rowHeight * rows.length) + 8;
    doc.fontSize(7).fillColor('#666666');
    doc.text('This invoice is also a receipt when paid in full. Payment terms are strictly 14 days from the invoice date and in the case of a', 35, noteY, { width: 530 });
    doc.text('course, prior to the commencement, whichever is the sooner.', 35, noteY + 8, { width: 530 });
  }

  addFooter(doc) {
    const footerY = 560;

    // Page number and footer line
    doc.lineWidth(0.5).strokeColor('#000000');
    doc.moveTo(30, footerY).lineTo(565, footerY).stroke();

    doc.fontSize(6).fillColor('#000000');
    doc.text('Page 1 of 1', 30, footerY + 8);

    // Company legal info
    const infoY = footerY + 20;
    doc.text(`${this.companyLegalName} Trading as ${this.companyName}`, 30, infoY);
    doc.text(`ABN: ${this.abn} | RTO No: ${this.rtoCode} | CRICOS: ${this.cricos}`, 30, infoY + 7);
    doc.text(`${this.companyAddress} | Phone: ${this.companyPhone} | Email: ${this.companyEmail}`, 30, infoY + 14);
  }

  generateInvoiceTableRows(payment, qualificationName, contractTotal, installmentAmount) {
    let rows = '';
    const items = this.buildInvoiceItems(payment, { certificationId: { name: qualificationName } });
    let idx = 1;
    for (const item of items) {
      const amount = item.amount || 0;
      rows += '<tr style="border: 1px solid ' + this.primaryColor + ';">' +
        '<td style="padding: 8px; border: 1px solid ' + this.primaryColor + ';">' + idx + '</td>' +
        '<td style="padding: 8px; border: 1px solid ' + this.primaryColor + ';">' + item.label + '</td>' +
        '<td style="padding: 8px; border: 1px solid ' + this.primaryColor + '; text-align: right;">$' + amount.toFixed(2) + '</td>' +
        '<td style="padding: 8px; border: 1px solid ' + this.primaryColor + '; text-align: right;">$0.00</td>' +
        '<td style="padding: 8px; border: 1px solid ' + this.primaryColor + '; text-align: right;">$' + amount.toFixed(2) + '</td>' +
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

    // If one-time payment and have history, list those entries; fall back to single fee
    if (payment.paymentType === 'one_time') {
      if (history.length > 0) {
        for (const h of history) {
          if (h.status !== 'completed') continue;
          let label = 'Payment';
          if (h.type === 'one_time') label = 'One-time Payment';
          else if (h.type === 'remaining_balance') label = 'Remaining Balance';
          else if (h.type === 'manual_full_payment') label = 'Manual Full Payment';
          items.push({ label, amount: h.amount });
        }
      } else {
        const qualificationName = application?.certificationId?.name || 'Qualification Fee';
        items.push({ label: qualificationName, amount: payment.totalAmount || 0 });
      }
      return items;
    }

    // Payment plan: include initial payment if completed
    if (payment.paymentType === 'payment_plan') {
      // ONLY use history for initial payment to avoid double counting
      const initialHist = history.find(h => h.type === 'initial' && h.status === 'completed');
      if (initialHist && initialHist.amount > 0) {
        items.push({ label: 'Initial Payment', amount: initialHist.amount });
      }

      // Add installments from history (excluding initial which we already added)
      for (const h of history) {
        if (h.status !== 'completed') continue;
        // Skip initial payment as it's already added above
        if (h.type === 'initial') continue;
        if (h.type === 'early_installment' || h.type === 'manual_installment' || h.type === 'recurring') {
          installmentCounter += 1;
          const label = totalInstallments > 0
            ? `Installment ${installmentCounter} of ${totalInstallments}`
            : `Installment ${installmentCounter}`;
          items.push({ label, amount: h.amount });
        }
      }

      // Remaining balance or manual full payment should also appear if present
      for (const h of history) {
        if (h.status !== 'completed') continue;
        if (h.type === 'remaining_balance') {
          items.push({ label: 'Remaining Balance', amount: h.amount });
        }
        if (h.type === 'manual_full_payment') {
          items.push({ label: 'Manual Full Payment', amount: h.amount });
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

    // Totals box values
    const totalDue = contractTotal;
    const balanceDue = (payment.remainingAmount != null)
      ? Number(payment.remainingAmount)
      : Math.max(0, totalDue - (this.getPaidToDate(payment) || 0));
    const totalPaid = Math.max(0, totalDue - balanceDue);

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
             <p><strong>• In Person:</strong> Payment can be made in person with cash, cheque, Debit/Credit/Master Card at the Institute's office Monday to Friday – 9.30 AM to 5.30 PM (Except Public Holiday).</p>
             <p><strong>• VIC Office:</strong> ${this.vicOffice}</p>
             <p><strong>• NSW Office:</strong> ${this.nswOffice}</p>
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