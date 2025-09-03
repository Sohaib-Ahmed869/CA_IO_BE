// utils/invoiceGenerator.js
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const https = require('https');

class InvoiceGenerator {
  constructor() {
    this.companyName = "Australian Leading Institute of Technology";
    this.companyLegalName = "ALIT EDUCATION GROUP PTY. LTD.";
    this.rtoCode = "45156";
    this.abn = "61 610 991 145";
    this.cricos = "03981M";
    this.companyAddress = "500 Spencer Street, West Melbourne, VIC 3003";
    this.companyPhone = "(03) 99175018";
    this.companyEmail = "info@alit.edu.au";
    this.companyWebsite = "www.alit.edu.au";
    this.nswOffice = "Level-6, 16-18 Wentworth Street, Parramatta, NSW 2150";
    this.vicOffice = "500 Spencer St, West Melbourne, VIC 3003";
    this.logoUrl = process.env.LOGO_URL || "https://certified.io/images/ebclogo.png";
    this.primaryColor = "#0F4C81";
    this.paymentLink = "https://alit.edu.au/payment/";
    
    // Bank details
    this.bankAccountName = "ALIT EDUCATION GROUP PTY. LTD.";
    this.bankName = "Commonwealth";
    this.bsb = "063-074";
    this.accountNumber = "1018 0987";
    this.swiftCode = "CTBAAU2S";
  }

  async generateInvoicePDF(payment, user, application) {
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
        this.addInvoiceTable(doc, payment, application);

        // Add totals section
        this.addTotalsSection(doc, payment);

        // Add payment methods
        this.addPaymentMethods(doc);

        // Add footer
        this.addFooter(doc);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  async addHeader(doc, payment, user, application) {
    // Light blue banner background (matching image)
    doc.rect(0, 0, 595, 70)
       .fill('#E6F3FF'); // Light blue background

    // Add logo
    try {
      const logoResponse = await new Promise((resolve, reject) => {
        https.get(this.logoUrl, (res) => {
          const data = [];
          res.on('data', (chunk) => data.push(chunk));
          res.on('end', () => resolve(Buffer.concat(data)));
          res.on('error', reject);
        });
      });
      
      doc.image(logoResponse, 30, 10, { width: 50, height: 50 });
    } catch (error) {
      console.warn("Could not add logo to invoice:", error.message);
    }

    // Company name in light blue banner (dark blue text)
    doc.fontSize(12)
       .fillColor(this.primaryColor)
       .text('AUSTRALIAN', 100, 15)
       .text('LEADING', 100, 28)
       .text('INSTITUTE OF', 100, 41)
       .text('TECHNOLOGY', 100, 54);

    // Decorative wavy lines below banner
    doc.rect(0, 70, 595, 2)
       .fill('#B3D9FF'); // Lighter blue line
    doc.rect(0, 72, 595, 2)
       .fill(this.primaryColor); // Darker blue line

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
       .text(`Application ID: ${application._id}`, 35, startY + 50, { width: 270 })
       .text(`Qualification: ${application.certificationId?.name || 'N/A'}`, 35, startY + 65, { width: 270 });

    // Invoice details on the right with proper spacing
    const rightX = 330;
    doc.fontSize(9)
       .fillColor('#000000')
       .text('Invoice/Receipt Number:', rightX, startY)
       .text(payment._id, rightX + 100, startY, { width: 200 })
       .text('Invoice Date:', rightX, startY + 15)
       .text(new Date(payment.completedAt || payment.createdAt).toLocaleDateString('en-AU'), rightX + 100, startY + 15)
       .text('Order no.:', rightX, startY + 30)
       .text(application._id, rightX + 100, startY + 30, { width: 200 })
       .text('Date Paid:', rightX, startY + 45)
       .text(new Date(payment.completedAt || payment.createdAt).toLocaleDateString('en-AU'), rightX + 100, startY + 45);
  }

  addInvoiceTable(doc, payment, application) {
    const startY = 230;
    
    // Table header
    doc.rect(30, startY, 535, 20)
       .fillAndStroke('#f0f0f0', this.primaryColor);

    doc.fontSize(8)
       .fillColor('#000000')
       .text('Invoice Item', 35, startY + 6)
       .text('Description', 80, startY + 6)
       .text('Amount* (Ex. GST)', 350, startY + 6)
       .text('GST', 450, startY + 6)
       .text('Total Amount*', 500, startY + 6);

    // Invoice item row
    const itemY = startY + 20;
    doc.rect(30, itemY, 535, 25)
       .stroke(this.primaryColor);

    const qualificationName = application.certificationId?.name || 'Qualification Fee';
    const amount = payment.totalAmount;
    const gst = amount * 0.1; // 10% GST
    const exGstAmount = amount - gst;

    doc.fontSize(8)
       .fillColor('#000000')
       .text('1', 35, itemY + 8)
       .text(qualificationName, 80, itemY + 8, { width: 260 })
       .text(`$${exGstAmount.toFixed(2)}`, 350, itemY + 8)
       .text(`$${gst.toFixed(2)}`, 450, itemY + 8)
       .text(`$${amount.toFixed(2)}`, 500, itemY + 8);

    // Payment plan details if applicable
    if (payment.paymentType === 'payment_plan') {
      const installmentY = itemY + 25;
      doc.rect(30, installmentY, 535, 25)
         .stroke(this.primaryColor);

      const installmentNumber = payment.paymentPlan?.recurringPayments?.completedPayments || 1;
      const totalInstallments = payment.paymentPlan?.recurringPayments?.totalPayments || 1;
      const installmentAmount = payment.amount || payment.totalAmount;
      const installmentGst = installmentAmount * 0.1;
      const installmentExGst = installmentAmount - installmentGst;

      doc.fontSize(8)
         .fillColor('#000000')
         .text('2', 35, installmentY + 8)
         .text(`Installment ${installmentNumber} of ${totalInstallments}`, 80, installmentY + 8, { width: 260 })
         .text(`$${installmentExGst.toFixed(2)}`, 350, installmentY + 8)
         .text(`$${installmentGst.toFixed(2)}`, 450, installmentY + 8)
         .text(`$${installmentAmount.toFixed(2)}`, 500, installmentY + 8);
    }

    // AUD note
    doc.fontSize(7)
       .fillColor('#666666')
       .text('*All figures are in Australian Dollar (AUD)', 30, startY + 80);
  }

  addTotalsSection(doc, payment) {
    const totalsY = 340;
    const rightX = 400;

    // Totals box
    doc.rect(rightX, totalsY, 165, 50)
       .stroke(this.primaryColor);

    doc.fontSize(8)
       .fillColor('#000000')
       .text('Total Due', rightX + 5, totalsY + 8)
       .text('Total Paid', rightX + 5, totalsY + 23)
       .text('Balance Due', rightX + 5, totalsY + 38);

    // Values
    const totalPaid = payment.totalAmount;
    const balanceDue = payment.remainingAmount || 0;
    const totalDue = totalPaid + balanceDue;

    doc.text(`$${totalDue.toFixed(2)}`, rightX + 100, totalsY + 8)
       .text(`$${totalPaid.toFixed(2)}`, rightX + 100, totalsY + 23)
       .text(`$${balanceDue.toFixed(2)}`, rightX + 100, totalsY + 38);
  }

  addPaymentMethods(doc) {
    const startY = 410;

    doc.fontSize(8)
       .fillColor('#000000')
       .text('Payment can be made using any of the following method. No obligation is created on ALIT until', 30, startY, { width: 535 })
       .text('funds are cleared and an official receipt is issued.', 30, startY + 10, { width: 535 });

    let currentY = startY + 25;

    // Online payment
    doc.text('• Use the online payment link below. Always input your invoice number (if any) or your offer', 30, currentY, { width: 535 })
       .text('letter reference number or your name as reference. (2% surcharge applicable); Online', 30, currentY + 8, { width: 535 })
       .text(`payment link: ${this.paymentLink}`, 30, currentY + 16, { width: 535 });

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

    // In Person Payment
    doc.text('• In Person: Payment can be made in person with cash, cheque, Debit/Credit/Master Card at', 30, currentY, { width: 535 })
       .text('the Institute\'s office Monday to Friday – 9.30 AM to 5.30 PM (Except Public Holiday).', 30, currentY + 8, { width: 535 })
       .text(`• VIC Office: ${this.vicOffice}`, 30, currentY + 20)
       .text(`• NSW Office: ${this.nswOffice}.`, 30, currentY + 30);
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

    // Version
    doc.text('Invoice-V0.2-Aug 2025', 30, footerY + 38, { align: 'center', width: 535 });
  }

  generateInvoiceHTML(payment, user, application) {
    const qualificationName = application.certificationId?.name || 'Qualification Fee';
    const amount = payment.totalAmount;
    const gst = amount * 0.1; // 10% GST
    const exGstAmount = amount - gst;
    const balanceDue = payment.remainingAmount || 0;
    const totalDue = amount + balanceDue;

    return `
      <div style="max-width: 800px; margin: 0 auto; background: #ffffff; border: 1px solid #e0e0e0; font-family: Arial, sans-serif;">
        <!-- Header with light blue banner -->
        <div style="background: #E6F3FF; color: ${this.primaryColor}; padding: 15px; position: relative;">
          <div style="display: flex; align-items: center;">
            <img src="${this.logoUrl}" alt="${this.companyName}" style="height: 50px; margin-right: 20px;">
            <div style="font-size: 12px; line-height: 1.2;">
              <div>AUSTRALIAN</div>
              <div>LEADING</div>
              <div>INSTITUTE OF</div>
              <div>TECHNOLOGY</div>
            </div>
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
              <p style="margin: 5px 0;">Application ID: ${application._id}</p>
              <p style="margin: 5px 0;">Qualification: ${qualificationName}</p>
            </div>
          </div>
          <div style="flex: 1; margin-left: 20px;">
            <div style="font-size: 12px;">
              <p style="margin: 5px 0;"><strong>Invoice/Receipt Number:</strong> ${payment._id}</p>
              <p style="margin: 5px 0;"><strong>Invoice Date:</strong> ${new Date(payment.completedAt || payment.createdAt).toLocaleDateString('en-AU')}</p>
              <p style="margin: 5px 0;"><strong>Order no.:</strong> ${application._id}</p>
              <p style="margin: 5px 0;"><strong>Date Paid:</strong> ${new Date(payment.completedAt || payment.createdAt).toLocaleDateString('en-AU')}</p>
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
                <th style="padding: 8px; text-align: right; border: 1px solid ${this.primaryColor};">Amount* (Ex. GST)</th>
                <th style="padding: 8px; text-align: right; border: 1px solid ${this.primaryColor};">GST</th>
                <th style="padding: 8px; text-align: right; border: 1px solid ${this.primaryColor};">Total Amount*</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border: 1px solid ${this.primaryColor};">
                <td style="padding: 8px; border: 1px solid ${this.primaryColor};">1</td>
                <td style="padding: 8px; border: 1px solid ${this.primaryColor};">${qualificationName}</td>
                <td style="padding: 8px; border: 1px solid ${this.primaryColor}; text-align: right;">$${exGstAmount.toFixed(2)}</td>
                <td style="padding: 8px; border: 1px solid ${this.primaryColor}; text-align: right;">$${gst.toFixed(2)}</td>
                <td style="padding: 8px; border: 1px solid ${this.primaryColor}; text-align: right;">$${amount.toFixed(2)}</td>
              </tr>
              ${payment.paymentType === 'payment_plan' ? `
                <tr style="border: 1px solid ${this.primaryColor};">
                  <td style="padding: 8px; border: 1px solid ${this.primaryColor};">2</td>
                  <td style="padding: 8px; border: 1px solid ${this.primaryColor};">Installment ${payment.paymentPlan?.recurringPayments?.completedPayments || 1} of ${payment.paymentPlan?.recurringPayments?.totalPayments || 1}</td>
                  <td style="padding: 8px; border: 1px solid ${this.primaryColor}; text-align: right;">$${((payment.amount || payment.totalAmount) * 0.909).toFixed(2)}</td>
                  <td style="padding: 8px; border: 1px solid ${this.primaryColor}; text-align: right;">$${((payment.amount || payment.totalAmount) * 0.091).toFixed(2)}</td>
                  <td style="padding: 8px; border: 1px solid ${this.primaryColor}; text-align: right;">$${(payment.amount || payment.totalAmount).toFixed(2)}</td>
                </tr>
              ` : ''}
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
              <span>$${amount.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>Balance Due:</span>
              <span>$${balanceDue.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <!-- Payment Methods -->
        <div style="padding: 20px; background: #f9f9f9; margin-top: 20px;">
          <p style="margin-bottom: 15px; font-size: 11px;">Payment can be made using any of the following method. No obligation is created on ALIT until funds are cleared and an official receipt is issued.</p>
          
          <div style="margin-bottom: 15px; font-size: 11px;">
            <p><strong>• Online Payment:</strong></p>
            <p>Use the online payment link below. Always input your invoice number (if any) or your offer letter reference number or your name as reference. (2% surcharge applicable)</p>
            <p>Online payment link: <a href="${this.paymentLink}" style="color: ${this.primaryColor};">${this.paymentLink}</a></p>
          </div>

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
          <p style="margin: 3px 0;">Invoice-V0.2-Aug 2025</p>
        </div>
      </div>
    `;
  }
}

module.exports = new InvoiceGenerator();