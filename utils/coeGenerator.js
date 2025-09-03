// utils/coeGenerator.js
const PDFDocument = require('pdfkit');
const https = require('https');
const fs = require('fs');
const path = require('path');

class COEGenerator {
  constructor() {
    this.doc = null;
    this.logoUrl = process.env.LOGO_URL || "https://certified.io/images/ebclogo.png";
    
    // Company details from environment variables
    this.companyName = process.env.RTO_NAME || "Australian Leading Institute of Technology";
    this.companyAddress = process.env.COMPANY_ADDRESS || "500 Spencer Street, West Melbourne, VIC 3003";
    this.companyPhone = process.env.COMPANY_PHONE || "(03) 99175018";
    this.companyEmail = process.env.COMPANY_EMAIL || "info@alit.edu.au";
    this.companyWebsite = process.env.COMPANY_WEBSITE || "www.alit.edu.au";
    this.abn = process.env.ABN || "61 610 991 145";
    this.rtoCode = process.env.RTO_CODE || "45156";
    this.cricos = process.env.CRICOS || "03981M";
    this.ceoName = process.env.CEO_NAME || "Emily";
  }

  /**
   * Generate COE PDF with dynamic data
   */
  async generateCOEPDF(user, application, payment, enrollmentFormData) {
    return new Promise(async (resolve, reject) => {
      try {
        this.doc = new PDFDocument({
          size: 'A4',
          margins: {
            top: 50,
            bottom: 50,
            left: 50,
            right: 50
          }
        });

        const buffers = [];
        this.doc.on('data', buffers.push.bind(buffers));
        this.doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });

        // Generate all 13 pages
        await this.generatePage1(user, application, payment, enrollmentFormData);
        await this.generatePage2(user, application, payment, enrollmentFormData);
        await this.generatePage3(user, application, payment, enrollmentFormData);
        await this.generatePage4(user, application, payment, enrollmentFormData);
        await this.generatePage5(user, application, payment, enrollmentFormData);
        await this.generatePage6(user, application, payment, enrollmentFormData);
        await this.generatePage7(user, application, payment, enrollmentFormData);
        await this.generatePage8(user, application, payment, enrollmentFormData);
        await this.generatePage9(user, application, payment, enrollmentFormData);
        await this.generatePage10(user, application, payment, enrollmentFormData);
        await this.generatePage11(user, application, payment, enrollmentFormData);
        await this.generatePage12(user, application, payment, enrollmentFormData);
        await this.generatePage13(user, application, payment, enrollmentFormData);

        this.doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Page 1: Cover Page with Company Header and Student Details
   */
  async generatePage1(user, application, payment, enrollmentFormData) {
    // Add logo and header
    await this.addHeader();
    
    // Title
    this.doc.fontSize(24)
      .font('Helvetica-Bold')
      .fillColor('#1a365d')
      .text('CONFIRMATION OF ENROLMENT', 50, 150, { align: 'center' });

    // Student details box
    this.doc.rect(50, 200, 500, 200)
      .stroke('#1a365d')
      .fillColor('#f7fafc')
      .rect(50, 200, 500, 200)
      .fill();

    this.doc.fontSize(16)
      .font('Helvetica-Bold')
      .fillColor('#1a365d')
      .text('STUDENT DETAILS', 70, 220);

    // Student information
    const studentInfo = [
      `Name: ${user.firstName} ${user.lastName}`,
      `Email: ${user.email}`,
      `Phone: ${user.phoneCode} ${user.phoneNumber}`,
      `Application ID: ${application._id}`,
      `Certification: ${application.certificationId.name}`,
      `Enrollment Date: ${new Date().toLocaleDateString('en-AU')}`,
      `Payment Status: ${payment.status === 'completed' ? 'Paid in Full' : 'Payment Plan'}`,
      `Total Amount: $${payment.totalAmount} AUD`
    ];

    this.doc.fontSize(12)
      .font('Helvetica')
      .fillColor('#2d3748')
      .text(studentInfo.join('\n'), 70, 250);

    // Footer
    this.addFooter();
  }

  /**
   * Page 2: Course Information and Structure
   */
  async generatePage2(user, application, payment, enrollmentFormData) {
    this.doc.addPage();
    await this.addHeader();

    this.doc.fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#1a365d')
      .text('COURSE INFORMATION', 50, 150);

    // Course details
    const courseInfo = [
      `Course Name: ${application.certificationId.name}`,
      `RTO Code: ${this.rtoCode}`,
      `CRICOS Code: ${this.cricos}`,
      `Course Duration: As per individual learning plan`,
      `Delivery Mode: Online/Blended`,
      `Assessment Method: Competency-based assessment`
    ];

    this.doc.fontSize(12)
      .font('Helvetica')
      .fillColor('#2d3748')
      .text(courseInfo.join('\n'), 50, 200);

    // Competency units
    if (application.certificationId.competencyUnits && application.certificationId.competencyUnits.length > 0) {
      this.doc.fontSize(14)
        .font('Helvetica-Bold')
        .fillColor('#1a365d')
        .text('COMPETENCY UNITS', 50, 350);

      let yPos = 380;
      application.certificationId.competencyUnits.forEach((unit, index) => {
        this.doc.fontSize(11)
          .font('Helvetica-Bold')
          .fillColor('#2d3748')
          .text(`${index + 1}. ${unit.name}`, 50, yPos);
        
        this.doc.fontSize(10)
          .font('Helvetica')
          .fillColor('#4a5568')
          .text(unit.description, 70, yPos + 20, { width: 450 });
        
        yPos += 60;
      });
    }

    this.addFooter();
  }

  /**
   * Page 3: Payment Details and Schedule
   */
  async generatePage3(user, application, payment, enrollmentFormData) {
    this.doc.addPage();
    await this.addHeader();

    this.doc.fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#1a365d')
      .text('PAYMENT DETAILS', 50, 150);

    // Payment information box
    this.doc.rect(50, 180, 500, 150)
      .stroke('#1a365d')
      .fillColor('#f7fafc')
      .rect(50, 180, 500, 150)
      .fill();

    const paymentInfo = [
      `Payment Type: ${payment.paymentType === 'one_time' ? 'One-time Payment' : 'Payment Plan'}`,
      `Total Course Fee: $${payment.totalAmount} AUD`,
      `Currency: ${payment.currency}`,
      `Payment Status: ${payment.status}`,
      `Payment Date: ${payment.completedAt ? new Date(payment.completedAt).toLocaleDateString('en-AU') : 'Pending'}`
    ];

    this.doc.fontSize(12)
      .font('Helvetica')
      .fillColor('#2d3748')
      .text(paymentInfo.join('\n'), 70, 200);

    // Payment history if available
    if (payment.paymentHistory && payment.paymentHistory.length > 0) {
      this.doc.fontSize(14)
        .font('Helvetica-Bold')
        .fillColor('#1a365d')
        .text('PAYMENT HISTORY', 50, 360);

      let yPos = 390;
      payment.paymentHistory.forEach((paymentItem, index) => {
        this.doc.fontSize(10)
          .font('Helvetica')
          .fillColor('#2d3748')
          .text(`${index + 1}. Amount: $${paymentItem.amount} - Status: ${paymentItem.status} - Date: ${paymentItem.paidAt ? new Date(paymentItem.paidAt).toLocaleDateString('en-AU') : 'N/A'}`, 50, yPos);
        yPos += 20;
      });
    }

    this.addFooter();
  }

  /**
   * Page 4: Terms and Conditions
   */
  async generatePage4(user, application, payment, enrollmentFormData) {
    this.doc.addPage();
    await this.addHeader();

    this.doc.fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#1a365d')
      .text('TERMS AND CONDITIONS', 50, 150);

    const termsAndConditions = [
      "1. ENROLLMENT CONDITIONS",
      "   • Student must complete all required assessments",
      "   • Attendance and participation are mandatory",
      "   • All fees must be paid as per payment schedule",
      "",
      "2. ASSESSMENT REQUIREMENTS",
      "   • Competency-based assessment applies",
      "   • Evidence portfolio must be submitted",
      "   • Third-party verification may be required",
      "",
      "3. PAYMENT TERMS",
      "   • All fees are non-refundable after course commencement",
      "   • Payment plans must be maintained",
      "   • Late payment fees may apply",
      "",
      "4. CERTIFICATION",
      "   • Certificate issued upon successful completion",
      "   • Certificate valid for 3 years from issue date",
      "   • Re-certification available upon expiry"
    ];

    this.doc.fontSize(11)
      .font('Helvetica')
      .fillColor('#2d3748')
      .text(termsAndConditions.join('\n'), 50, 200, { width: 500 });

    this.addFooter();
  }

  /**
   * Page 5: Student Rights and Responsibilities
   */
  async generatePage5(user, application, payment, enrollmentFormData) {
    this.doc.addPage();
    await this.addHeader();

    this.doc.fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#1a365d')
      .text('STUDENT RIGHTS AND RESPONSIBILITIES', 50, 150);

    const rightsAndResponsibilities = [
      "STUDENT RIGHTS:",
      "• Access to quality training and assessment",
      "• Fair and transparent assessment processes",
      "• Access to support services and resources",
      "• Privacy and confidentiality protection",
      "• Grievance and appeal procedures",
      "",
      "STUDENT RESPONSIBILITIES:",
      "• Maintain academic integrity",
      "• Submit assessments by due dates",
      "• Participate actively in learning activities",
      "• Comply with institute policies",
      "• Maintain current contact information",
      "",
      "INSTITUTE RESPONSIBILITIES:",
      "• Provide quality training and assessment",
      "• Maintain qualified trainers and assessors",
      "• Ensure fair and valid assessment",
      "• Provide adequate learning resources",
      "• Maintain student records securely"
    ];

    this.doc.fontSize(11)
      .font('Helvetica')
      .fillColor('#2d3748')
      .text(rightsAndResponsibilities.join('\n'), 50, 200, { width: 500 });

    this.addFooter();
  }

  /**
   * Page 6: Assessment Information
   */
  async generatePage6(user, application, payment, enrollmentFormData) {
    this.doc.addPage();
    await this.addHeader();

    this.doc.fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#1a365d')
      .text('ASSESSMENT INFORMATION', 50, 150);

    const assessmentInfo = [
      "ASSESSMENT OVERVIEW:",
      "This course uses competency-based assessment to determine if you have achieved the required skills and knowledge.",
      "",
      "ASSESSMENT METHODS:",
      "• Written assessments and examinations",
      "• Practical demonstrations and observations",
      "• Portfolio of evidence",
      "• Third-party reports and references",
      "• Workplace assessments (where applicable)",
      "",
      "ASSESSMENT CRITERIA:",
      "• Competent (C) - Student has demonstrated competency",
      "• Not Yet Competent (NYC) - Additional evidence required",
      "",
      "RE-ASSESSMENT:",
      "Students who are assessed as 'Not Yet Competent' will be provided with feedback and opportunities for re-assessment.",
      "",
      "APPEALS PROCESS:",
      "Students have the right to appeal assessment decisions through the institute's formal appeals process."
    ];

    this.doc.fontSize(11)
      .font('Helvetica')
      .fillColor('#2d3748')
      .text(assessmentInfo.join('\n'), 50, 200, { width: 500 });

    this.addFooter();
  }

  /**
   * Page 7: Support Services
   */
  async generatePage7(user, application, payment, enrollmentFormData) {
    this.doc.addPage();
    await this.addHeader();

    this.doc.fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#1a365d')
      .text('SUPPORT SERVICES', 50, 150);

    const supportServices = [
      "LEARNING SUPPORT:",
      "• Academic support and tutoring",
      "• Study skills workshops",
      "• Online learning resources",
      "• Technical support for online platforms",
      "",
      "STUDENT SERVICES:",
      "• Career guidance and counseling",
      "• Disability support services",
      "• Language and literacy support",
      "• Financial assistance information",
      "",
      "CONTACT INFORMATION:",
      `• Phone: ${this.companyPhone}`,
      `• Email: ${this.companyEmail}`,
      `• Website: ${this.companyWebsite}`,
      `• Address: ${this.companyAddress}`,
      "",
      "OFFICE HOURS:",
      "• Monday to Friday: 9:30 AM - 5:30 PM",
      "• Saturday: 9:00 AM - 1:00 PM",
      "• Sunday: Closed",
      "• Public Holidays: Closed"
    ];

    this.doc.fontSize(11)
      .font('Helvetica')
      .fillColor('#2d3748')
      .text(supportServices.join('\n'), 50, 200, { width: 500 });

    this.addFooter();
  }

  /**
   * Page 8: Policies and Procedures
   */
  async generatePage8(user, application, payment, enrollmentFormData) {
    this.doc.addPage();
    await this.addHeader();

    this.doc.fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#1a365d')
      .text('POLICIES AND PROCEDURES', 50, 150);

    const policiesAndProcedures = [
      "ACADEMIC POLICIES:",
      "• Academic integrity and plagiarism policy",
      "• Assessment and grading policies",
      "• Attendance and participation requirements",
      "• Course completion requirements",
      "",
      "STUDENT CONDUCT:",
      "• Code of conduct and behavior expectations",
      "• Anti-discrimination and harassment policies",
      "• Use of technology and social media",
      "• Dress code and professional standards",
      "",
      "COMPLAINTS AND GRIEVANCES:",
      "• Formal complaint procedures",
      "• Grievance resolution process",
      "• External appeal options",
      "• Contact information for complaints",
      "",
      "PRIVACY AND CONFIDENTIALITY:",
      "• Student record management",
      "• Privacy policy compliance",
      "• Information sharing protocols",
      "• Data protection measures"
    ];

    this.doc.fontSize(11)
      .font('Helvetica')
      .fillColor('#2d3748')
      .text(policiesAndProcedures.join('\n'), 50, 200, { width: 500 });

    this.addFooter();
  }

  /**
   * Page 9: Course Schedule and Timeline
   */
  async generatePage9(user, application, payment, enrollmentFormData) {
    this.doc.addPage();
    await this.addHeader();

    this.doc.fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#1a365d')
      .text('COURSE SCHEDULE AND TIMELINE', 50, 150);

    const courseSchedule = [
      "COURSE TIMELINE:",
      "• Course Duration: Self-paced with maximum 12 months",
      "• Assessment Deadlines: As per individual learning plan",
      "• Certificate Issue: Within 30 days of completion",
      "",
      "KEY MILESTONES:",
      "1. Enrollment Confirmation (Current)",
      "2. Initial Assessment and Planning",
      "3. Learning and Development Phase",
      "4. Evidence Collection and Portfolio",
      "5. Assessment and Verification",
      "6. Certificate Issue",
      "",
      "IMPORTANT DATES:",
      `• Enrollment Date: ${new Date().toLocaleDateString('en-AU')}`,
      `• Expected Completion: ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString('en-AU')}`,
      "• Assessment Windows: Ongoing",
      "• Certificate Validity: 3 years from issue",
      "",
      "EXTENSION POLICY:",
      "• Extensions available upon request",
      "• Maximum extension: 6 months",
      "• Extension fees may apply"
    ];

    this.doc.fontSize(11)
      .font('Helvetica')
      .fillColor('#2d3748')
      .text(courseSchedule.join('\n'), 50, 200, { width: 500 });

    this.addFooter();
  }

  /**
   * Page 10: Quality Assurance
   */
  async generatePage10(user, application, payment, enrollmentFormData) {
    this.doc.addPage();
    await this.addHeader();

    this.doc.fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#1a365d')
      .text('QUALITY ASSURANCE', 50, 150);

    const qualityAssurance = [
      "QUALITY MANAGEMENT:",
      "Our institute maintains high standards through comprehensive quality assurance processes.",
      "",
      "TRAINER QUALIFICATIONS:",
      "• All trainers hold relevant industry qualifications",
      "• Continuous professional development required",
      "• Regular performance reviews conducted",
      "• Industry experience and expertise verified",
      "",
      "ASSESSMENT VALIDATION:",
      "• Assessment tools regularly reviewed and updated",
      "• External validation of assessment processes",
      "• Moderation of assessment decisions",
      "• Quality checks on all assessments",
      "",
      "STUDENT FEEDBACK:",
      "• Regular student satisfaction surveys",
      "• Feedback collection and analysis",
      "• Continuous improvement based on feedback",
      "• Student representation in quality processes",
      "",
      "COMPLIANCE:",
      "• ASQA compliance and reporting",
      "• RTO standards adherence",
      "• Industry standards compliance",
      "• Regular audits and reviews"
    ];

    this.doc.fontSize(11)
      .font('Helvetica')
      .fillColor('#2d3748')
      .text(qualityAssurance.join('\n'), 50, 200, { width: 500 });

    this.addFooter();
  }

  /**
   * Page 11: Contact Information and Resources
   */
  async generatePage11(user, application, payment, enrollmentFormData) {
    this.doc.addPage();
    await this.addHeader();

    this.doc.fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#1a365d')
      .text('CONTACT INFORMATION AND RESOURCES', 50, 150);

    const contactInfo = [
      "INSTITUTE CONTACT DETAILS:",
      `• Institute Name: ${this.companyName}`,
      `• Address: ${this.companyAddress}`,
      `• Phone: ${this.companyPhone}`,
      `• Email: ${this.companyEmail}`,
      `• Website: ${this.companyWebsite}`,
      "",
      "KEY PERSONNEL:",
      `• CEO: ${this.ceoName}`,
      "• Academic Director: Available on request",
      "• Student Services: Available on request",
      "• Technical Support: Available on request",
      "",
      "ONLINE RESOURCES:",
      "• Student portal and learning management system",
      "• Online library and resources",
      "• Assessment submission portal",
      "• Progress tracking and reporting",
      "",
      "EMERGENCY CONTACTS:",
      "• After-hours support: Available on request",
      "• Technical issues: Available on request",
      "• Academic concerns: Available on request",
      "• Administrative queries: Available on request"
    ];

    this.doc.fontSize(11)
      .font('Helvetica')
      .fillColor('#2d3748')
      .text(contactInfo.join('\n'), 50, 200, { width: 500 });

    this.addFooter();
  }

  /**
   * Page 12: Legal and Regulatory Information
   */
  async generatePage12(user, application, payment, enrollmentFormData) {
    this.doc.addPage();
    await this.addHeader();

    this.doc.fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#1a365d')
      .text('LEGAL AND REGULATORY INFORMATION', 50, 150);

    const legalInfo = [
      "REGISTRATION DETAILS:",
      `• RTO Code: ${this.rtoCode}`,
      `• CRICOS Code: ${this.cricos}`,
      `• ABN: ${this.abn}`,
      "• Registered Training Organisation",
      "• Registered with ASQA (Australian Skills Quality Authority)",
      "",
      "LEGAL COMPLIANCE:",
      "• Australian Consumer Law compliance",
      "• Privacy Act 1988 compliance",
      "• Equal Opportunity Act compliance",
      "• Workplace Health and Safety compliance",
      "",
      "STUDENT PROTECTION:",
      "• Tuition Protection Service (TPS) coverage",
      "• Refund policy and procedures",
      "• Dispute resolution processes",
      "• External complaint mechanisms",
      "",
      "COPYRIGHT AND INTELLECTUAL PROPERTY:",
      "• Course materials are proprietary",
      "• Unauthorized reproduction prohibited",
      "• Student work remains student property",
      "• Appropriate use of institute resources"
    ];

    this.doc.fontSize(11)
      .font('Helvetica')
      .fillColor('#2d3748')
      .text(legalInfo.join('\n'), 50, 200, { width: 500 });

    this.addFooter();
  }

  /**
   * Page 13: Signature and Acceptance
   */
  async generatePage13(user, application, payment, enrollmentFormData) {
    this.doc.addPage();
    await this.addHeader();

    this.doc.fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#1a365d')
      .text('SIGNATURE AND ACCEPTANCE', 50, 150);

    const acceptanceText = [
      "ENROLLMENT ACCEPTANCE:",
      "",
      "By enrolling in this course, I acknowledge that I have read, understood, and agree to:",
      "",
      "• All terms and conditions outlined in this document",
      "• Payment obligations and schedules",
      "• Assessment requirements and procedures",
      "• Institute policies and procedures",
      "• Privacy and confidentiality requirements",
      "",
      "I understand that:",
      "",
      "• This enrollment is subject to successful payment",
      "• Course completion requires meeting all assessment criteria",
      "• Certificate will be issued upon successful completion",
      "• All information provided is accurate and complete",
      "",
      "STUDENT SIGNATURE:",
      "",
      "Name: " + user.firstName + " " + user.lastName,
      "Date: " + new Date().toLocaleDateString('en-AU'),
      "Application ID: " + application._id,
      "",
      "INSTITUTE SIGNATURE:",
      "",
      "Name: " + this.ceoName + " (CEO)",
      "Date: " + new Date().toLocaleDateString('en-AU'),
      "Institute: " + this.companyName
    ];

    this.doc.fontSize(11)
      .font('Helvetica')
      .fillColor('#2d3748')
      .text(acceptanceText.join('\n'), 50, 200, { width: 500 });

    // Add signature lines
    this.doc.moveTo(50, 650)
      .lineTo(250, 650)
      .stroke();
    
    this.doc.fontSize(10)
      .font('Helvetica')
      .fillColor('#4a5568')
      .text('Student Signature', 50, 660);

    this.doc.moveTo(300, 650)
      .lineTo(500, 650)
      .stroke();
    
    this.doc.fontSize(10)
      .font('Helvetica')
      .fillColor('#4a5568')
      .text('Institute Signature', 300, 660);

    this.addFooter();
  }

  /**
   * Add header with logo and company information
   */
  async addHeader() {
    try {
      // Add logo
      if (this.logoUrl) {
        const logoBuffer = await this.fetchImage(this.logoUrl);
        if (logoBuffer) {
          this.doc.image(logoBuffer, 50, 50, { width: 80, height: 80 });
        }
      }

      // Company name and details
      this.doc.fontSize(16)
        .font('Helvetica-Bold')
        .fillColor('#1a365d')
        .text(this.companyName, 150, 60);

      this.doc.fontSize(10)
        .font('Helvetica')
        .fillColor('#4a5568')
        .text(`RTO Code: ${this.rtoCode} | CRICOS: ${this.cricos} | ABN: ${this.abn}`, 150, 85);

      this.doc.fontSize(9)
        .font('Helvetica')
        .fillColor('#718096')
        .text(`${this.companyAddress} | Phone: ${this.companyPhone} | Email: ${this.companyEmail}`, 150, 105);

      // Add line separator
      this.doc.moveTo(50, 130)
        .lineTo(550, 130)
        .stroke('#e2e8f0');
    } catch (error) {
      console.error('Error adding header:', error);
    }
  }

  /**
   * Add footer with page number and company info
   */
  addFooter() {
    const pageNumber = this.doc.page;
    const totalPages = 13; // Total pages in COE

    this.doc.fontSize(8)
      .font('Helvetica')
      .fillColor('#718096')
      .text(`Page ${pageNumber} of ${totalPages}`, 50, 750, { align: 'left' });

    this.doc.fontSize(8)
      .font('Helvetica')
      .fillColor('#718096')
      .text(`${this.companyName} | ${this.companyWebsite}`, 50, 750, { align: 'right' });
  }

  /**
   * Fetch image from URL
   */
  async fetchImage(url) {
    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        if (response.statusCode === 200) {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => resolve(Buffer.concat(chunks)));
        } else {
          resolve(null);
        }
      }).on('error', (error) => {
        console.error('Error fetching image:', error);
        resolve(null);
      });
    });
  }
}

module.exports = COEGenerator;
