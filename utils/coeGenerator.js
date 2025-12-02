// utils/coeGenerator.js
const PDFDocument = require('pdfkit');
const https = require('https');
const fs = require('fs');
const path = require('path');

class COEGenerator {
  constructor() {
    this.logoUrl = process.env.LOGO_URL || "https://certified.io/images/alitlogo.png";
    
    // Company details from environment variables - updated for Culinary Institute Australia
    this.companyName = process.env.RTO_NAME || "Culinary Institute Australia";
    this.companyAddress = process.env.COMPANY_ADDRESS || "500 Spencer St, West Melbourne, VIC, 3003";
    this.companyPhone = process.env.COMPANY_PHONE || "(03) 99175018";
    this.companyEmail = process.env.COMPANY_EMAIL || "admissions@culinaryaustralia.edu.au";
    this.companyWebsite = process.env.COMPANY_WEBSITE || "www.culinaryaustralia.edu.au";
    this.abn = process.env.ABN || "61 610 991 145";
    this.rtoCode = process.env.RTO_CODE || "45775";
    this.cricos = process.env.CRICOS || "03964A";
  }

  /**
   * Generate single-page COE PDF matching the template
   */
  async generateCOEPDF(user, application, payment, enrollmentFormData) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: {
            top: 50,
            bottom: 50,
            left: 50,
            right: 50
          }
        });

        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });

        // Add logo at top-left
        await this.addLogo(doc);

        // Add title
        this.addTitle(doc);

        // Add introductory paragraph
        this.addIntroParagraph(doc);

        // Add student and course details
        this.addStudentDetails(doc, user, application, enrollmentFormData);

        // Add Provider Declaration
        this.addProviderDeclaration(doc);

        // Add Date Issued and Contact Info
        this.addDateAndContact(doc);

        // Add footer
        this.addFooter(doc);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Add logo at top-left
   */
  async addLogo(doc) {
    try {
      const logoResponse = await new Promise((resolve, reject) => {
        https.get(this.logoUrl, (res) => {
          const data = [];
          res.on('data', (chunk) => data.push(chunk));
          res.on('end', () => resolve(Buffer.concat(data)));
          res.on('error', reject);
        });
      });
      
      doc.image(logoResponse, 50, 50, { width: 120, height: 50, fit: [120, 50] });
    } catch (error) {
      console.warn("Could not add logo to COE:", error.message);
      // Fallback: text logo
      doc.fontSize(14)
         .font('Times-Bold')
         .fillColor('#000000')
         .text(this.companyName.toUpperCase(), 50, 60);
    }
  }

  /**
   * Add centered title "Confirmation of Enrolment"
   */
  addTitle(doc) {
    doc.fontSize(20)
       .font('Times-Bold')
       .fillColor('#000080') // Dark blue
       .text('Confirmation of Enrolment', 0, 120, { align: 'center', width: 595 });
  }

  /**
   * Add introductory paragraph
   */
  addIntroParagraph(doc) {
    doc.fontSize(11)
       .font('Times-Roman')
       .fillColor('#000000')
       .text('This document certifies that the following student has been ', 50, 160, { width: 495 })
       .font('Times-Bold')
       .text('officially enrolled', { continued: true })
       .font('Times-Roman')
       .text(' at the ', { continued: true })
       .font('Times-Bold')
       .text('Culinary Institute of Australia', { continued: true })
       .font('Times-Roman')
       .text('.', { continued: true });
  }

  /**
   * Add student and course details with underlined fields
   */
  addStudentDetails(doc, user, application, enrollmentFormData) {
    let yPos = 200;
    const lineHeight = 25;
    const underlineLength = 300;
    const labelX = 50;
    const underlineX = labelX + 120;

    // Helper to add a field with label and underlined answer
    const addField = (label, value) => {
      // Label (bold)
      doc.fontSize(11)
         .font('Times-Bold')
         .fillColor('#000000')
         .text(label + ':', labelX, yPos);
      
      // Underlined answer (unbolded)
      if (value) {
        doc.font('Times-Roman')
           .text(value, underlineX, yPos);
      }
      
      // Draw underline
      doc.moveTo(underlineX, yPos + 12)
         .lineTo(underlineX + underlineLength, yPos + 12)
         .stroke();
      
      yPos += lineHeight;
    };

    // Student Name - format with proper capitalization
    const formatName = (name) => {
      if (!name) return '';
      return name.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
    };
    const studentName = `${formatName(user.firstName || '')} ${formatName(user.lastName || '')}`.trim();
    addField('Student Name', studentName);

    // Student ID
    addField('Student ID', application.appCode || application._id.toString());

    // Date of Birth
    const dob = user.dateOfBirth || user.dob;
    const dobFormatted = dob ? new Date(dob).toLocaleDateString('en-AU', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    }) : '';
    addField('Date of Birth', dobFormatted);

    // Course Name
    addField('Course Name', application?.certificationId?.name || '');

    // Course Code
    addField('Course Code', application?.certificationId?.code || application?.certificationId?.shortCode || '');

    // Study Mode with checkboxes
    doc.fontSize(11)
       .font('Times-Bold')
       .fillColor('#000000')
       .text('Study Mode:', labelX, yPos);
    
    const studyMode = enrollmentFormData?.studyMode || 'Online';
    const checkboxY = yPos + 2;
    const checkboxX = underlineX;
    const checkboxSize = 8;
    const checkboxSpacing = 100;

    // On-campus checkbox
    doc.rect(checkboxX, checkboxY, checkboxSize, checkboxSize)
       .stroke();
    if (studyMode === 'On-campus' || studyMode === 'On-campus') {
      doc.fontSize(8)
         .text('✓', checkboxX + 1, checkboxY - 1);
    }
    doc.fontSize(11)
       .font('Times-Roman')
       .text('On-campus', checkboxX + 15, yPos);

    // Online checkbox
    doc.rect(checkboxX + checkboxSpacing, checkboxY, checkboxSize, checkboxSize)
       .stroke();
    if (studyMode === 'Online' || studyMode === 'online') {
      doc.fontSize(8)
         .text('✓', checkboxX + checkboxSpacing + 1, checkboxY - 1);
    }
    doc.fontSize(11)
       .font('Times-Roman')
       .text('Online', checkboxX + checkboxSpacing + 15, yPos);

    // Blended checkbox
    doc.rect(checkboxX + checkboxSpacing * 2, checkboxY, checkboxSize, checkboxSize)
       .stroke();
    if (studyMode === 'Blended' || studyMode === 'blended') {
      doc.fontSize(8)
         .text('✓', checkboxX + checkboxSpacing * 2 + 1, checkboxY - 1);
    }
    doc.fontSize(11)
       .font('Times-Roman')
       .text('Blended', checkboxX + checkboxSpacing * 2 + 15, yPos);

    yPos += lineHeight;

    // Course Start Date
    const startDate = enrollmentFormData?.courseStartDate 
      ? new Date(enrollmentFormData.courseStartDate).toLocaleDateString('en-AU', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit' 
        })
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-AU', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit' 
        });
    addField('Course Start Date', startDate);

    // Course End Date
    const endDate = enrollmentFormData?.courseEndDate 
      ? new Date(enrollmentFormData.courseEndDate).toLocaleDateString('en-AU', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit' 
        })
      : new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toLocaleDateString('en-AU', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit' 
        });
    addField('Course End Date', endDate);
  }

  /**
   * Add Provider Declaration section
   */
  addProviderDeclaration(doc) {
    let yPos = 450;

    // Subtitle (bold, underlined, dark blue)
    doc.fontSize(11)
       .font('Times-Bold')
       .fillColor('#000080')
       .text('Provider Declaration', 50, yPos)
       .moveTo(50, yPos + 12)
       .lineTo(200, yPos + 12)
      .stroke();
    
    yPos += 30;

    // First paragraph
    doc.fontSize(11)
       .font('Times-Roman')
       .fillColor('#000000')
       .text('This letter serves as formal confirmation that the above-named student has accepted an offer and is enrolled in the specified course of study at the Culinary Institute of Australia.', 50, yPos, { width: 495 });

    yPos += 30;

    // Second paragraph
    doc.text('The institution confirms that the student has met all entry requirements and is eligible to commence studies on the indicated start date.', 50, yPos, { width: 495 });
  }

  /**
   * Add Date Issued and Contact Information
   */
  addDateAndContact(doc) {
    let yPos = 550;

    // Date Issued field
    doc.fontSize(11)
       .font('Times-Bold')
       .fillColor('#000000')
       .text('Date Issued:', 50, yPos);
    
    const dateIssued = new Date().toLocaleDateString('en-AU', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    });
    doc.font('Times-Roman')
       .text(dateIssued, 130, yPos);
    
    // Draw underline
    doc.moveTo(130, yPos + 12)
       .lineTo(430, yPos + 12)
       .stroke();

    yPos += 40;

    // Contact information
    doc.fontSize(11)
       .font('Times-Roman')
       .fillColor('#000000')
       .text('If you require further information, please contact the Admissions Office at ', 50, yPos, { width: 495 })
       .text(this.companyEmail, { continued: true, underline: true });
  }

  /**
   * Add footer at bottom
   */
  addFooter(doc) {
    const footerY = 750;
    
    doc.fontSize(9)
       .font('Times-Roman')
       .fillColor('#000000')
       .text(`${this.companyName} Pty Ltd | RTO Code ${this.rtoCode} | CRICOS Code ${this.cricos}`, 50, footerY)
       .text('Confirmation of Enrolment - Version 1.0', 50, footerY + 15);
  }
}

module.exports = COEGenerator;
