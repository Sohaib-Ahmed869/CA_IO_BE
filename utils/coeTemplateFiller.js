// utils/coeTemplateFiller.js
const fs = require('fs');
const path = require('path');
const pdfLib = require('pdf-lib');

class COETemplateFiller {
  constructor() {
    this.templatePath = path.join(__dirname, '..', 'assets', 'Confirmation of Enrolment Template _RPL - Victor Ying_FixedV2.pdf');
  }

  /**
   * Fill the COE template with dynamic data
   * @param {Object} data - The data to fill in the template
   * @param {Object} data.user - User information
   * @param {Object} data.application - Application information
   * @param {Object} data.payment - Payment information
   * @param {Object} data.enrollmentFormData - Enrollment form data
   * @param {Object} options - Additional options
   * @param {boolean} options.returnBuffer - If true, return PDF buffer instead of saving to file
   * @returns {Promise<Buffer|string>} - PDF buffer or file path
   */
  async fillCOETemplate(data, options = {}) {
    try {
      // Load the PDF template
      const templateBuffer = fs.readFileSync(this.templatePath);
      const pdfDoc = await pdfLib.PDFDocument.load(templateBuffer);
      
      // Get the form
      const form = pdfDoc.getForm();
      
      // Prepare the data for filling
      const fillData = this.prepareFillData(data);
      
      // Fill the fields
      this.fillFields(form, fillData);
      
      // Flatten the form to make it non-editable
      form.flatten();
      
      // Save or return the PDF
      if (options.returnBuffer) {
        const pdfBytes = await pdfDoc.save();
        return Buffer.from(pdfBytes);
      } else {
        const outputPath = path.join(__dirname, '..', 'temp', `COE_${data.user.firstName}_${data.user.lastName}_${Date.now()}.pdf`);
        
        // Ensure temp directory exists
        const tempDir = path.dirname(outputPath);
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync(outputPath, pdfBytes);
        return outputPath;
      }
    } catch (error) {
      console.error('Error filling COE template:', error);
      throw error;
    }
  }

  /**
   * Prepare the data for filling the form
   */
  prepareFillData(data) {
    const { user, application, payment, enrollmentFormData } = data;
    
    // Format the date
    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString('en-AU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    // Format student address (you may need to adjust this based on your user model)
    const studentAddress = this.formatStudentAddress(user);

    // Format student name
    const studentName = `${user.firstName} ${user.lastName}`;

    // Get course name
    const courseName = application?.certificationId?.name || application?.certificationName || 'Course Name';

    // Generate student ID (you may want to use application ID or create a specific student ID)
    const studentId = application?.appCode || application?._id?.toString() || 'STU-' + Date.now();

    return {
      date: formattedDate,
      studentId: studentId,
      studentAddress: studentAddress,
      studentName: studentName,
      courseName: courseName
    };
  }

  /**
   * Format student address
   */
  formatStudentAddress(user) {
    const addressParts = [];
    
    if (user.address) {
      addressParts.push(user.address);
    }
    if (user.city) {
      addressParts.push(user.city);
    }
    if (user.state) {
      addressParts.push(user.state);
    }
    if (user.postalCode) {
      addressParts.push(user.postalCode);
    }
    if (user.country) {
      addressParts.push(user.country);
    }

    // If no address fields, use a default or email
    if (addressParts.length === 0) {
      return user.email || 'Address not provided';
    }

    return addressParts.join(', ');
  }

  /**
   * Fill the form fields with the prepared data
   */
  fillFields(form, fillData) {
    try {
      // Map the fields based on your mapping
      const fieldMapping = {
        'Text-9vtr2VWwTb': fillData.date,           // Date
        'Text-Fh2rh0QTMj': fillData.studentId,      // Student ID
        'Text-1heFDAV9R2': fillData.studentName, // To (address of student)
        'Text-RGfVKELzPD': fillData.studentName,    // Dear (student name)
        'Text-zTndbwCiYz': fillData.courseName      // Course (name of course)
      };

      // Fill each field
      Object.entries(fieldMapping).forEach(([fieldName, value]) => {
        try {
          const field = form.getField(fieldName);
          if (field && field.constructor.name === 'PDFTextField') {
            // Set text with font size
            field.setText(value || '');
            
            // Note: Font size is typically controlled by the PDF template
            // If you need to change font size, you may need to modify the PDF template
            // or use a different approach like embedding fonts
            console.log(`Filled field ${fieldName} with: ${value}`);
          } else {
            console.warn(`Field ${fieldName} not found or not a text field`);
          }
        } catch (error) {
          console.error(`Error filling field ${fieldName}:`, error.message);
        }
      });
    } catch (error) {
      console.error('Error filling form fields:', error);
      throw error;
    }
  }

  /**
   * Get field information for debugging
   */
  async getFieldInfo() {
    try {
      const templateBuffer = fs.readFileSync(this.templatePath);
      const pdfDoc = await pdfLib.PDFDocument.load(templateBuffer);
      const form = pdfDoc.getForm();
      const fields = form.getFields();

      return fields.map(field => ({
        name: field.getName(),
        type: field.constructor.name,
        value: field.constructor.name === 'PDFTextField' ? field.getText() : 'N/A'
      }));
    } catch (error) {
      console.error('Error getting field info:', error);
      return [];
    }
  }
}

module.exports = COETemplateFiller;