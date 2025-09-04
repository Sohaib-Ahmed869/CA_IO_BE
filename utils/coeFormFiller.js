// utils/coeFormFiller.js
const { PDFDocument, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

class COEFormFiller {
  constructor() {
    this.templatePath = path.join(__dirname, '../assets/Template_OFFER LETTER (1) - ALIT __ CEO Emily (1).pdf');
  }

  async fillCOEForm(user, application, payment, enrollmentFormData) {
    try {
      // Load the PDF template
      const templateBytes = fs.readFileSync(this.templatePath);
      const pdfDoc = await PDFDocument.load(templateBytes);
      const form = pdfDoc.getForm();
      // Ensure all fields render with a consistent 12pt font size
      try {
        const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
        form.updateFieldAppearances(helvetica);
      } catch (_) {
        // If font embedding fails, continue with default appearances
      }

      // Get all field names for debugging
      const fields = form.getFields();
      console.log('Available form fields:', fields.map(f => f.getName()));

      // Map dynamic data to form fields
      const fieldMappings = this.createFieldMappings(user, application, payment, enrollmentFormData);
      
      // Fill the form fields
      for (const [fieldName, value] of Object.entries(fieldMappings)) {
        try {
          const field = form.getField(fieldName);
          if (field && value) {
            field.setText(value);
            console.log(`Filled field ${fieldName}: ${value}`);
          }
        } catch (error) {
          console.warn(`Could not fill field ${fieldName}:`, error.message);
        }
      }

      // Flatten the form to make it non-editable
      form.flatten();

      // Generate the PDF buffer
      const pdfBytes = await pdfDoc.save();
      return pdfBytes;

    } catch (error) {
      console.error('Error filling COE form:', error);
      throw error;
    }
  }

  createFieldMappings(user, application, payment, enrollmentFormData) {
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    const now = new Date();
    const currentDate = now.toLocaleDateString('en-AU');
    const dayStr = String(now.getDate()).padStart(2, '0');
    const monthStr = String(now.getMonth() + 1).padStart(2, '0');
    const yearStr = String(now.getFullYear());
    const courseName = application?.certificationId?.name || '';
    const paymentAmount = payment?.totalAmount ? `$${payment.totalAmount} ${payment?.currency || 'AUD'}` : '';
    const paymentStatus = payment?.status === 'completed' ? 'Paid in Full' : 'Payment Plan Active';

    // Since we don't know the exact field names yet, let's create a mapping
    // that we can adjust based on the actual field names found
    const mappings = {
      // Common field patterns - we'll need to map these to actual field names
      'student_name': fullName,
      'first_name': user.firstName || '',
      'last_name': user.lastName || '',
      'date_of_birth': enrollmentFormData?.personalDetails?.dateOfBirth || '',
      'course_name': courseName,
      'enrollment_date': currentDate,
      'payment_amount': paymentAmount,
      'payment_status': paymentStatus,
      'reference_number': application?._id || '',
      'email': user.email || '',
      'phone': user.phone || '',
      'address': enrollmentFormData?.personalDetails?.address || '',
      'signature_date': currentDate,
      'student_signature': fullName,
    };

    // For now, let's try to fill the first few fields with basic data
    // We'll need to inspect the PDF to see what each field actually represents
    const fieldNames = [
      'Text-cn2VAtzk7t', 'Text-j3RVeIoPLM', 'Text-2peu82pH69', 'Text-ViGlMIsTLB',
      'Text-AXh9CDzCwA', 'Text-Jcyai6Rb9o', 'Text-SCoeNeXuyr', 'Text-XL9k8d7HES',
      'Text-Q8oVdZniPw', 'Text-tK56PmZo-D', 'Text-XA7urVfjc5', 'Text-QVOTH8qGJr',
      'Text-H8NdFrkzBV', 'Text-2ITRr_cMg_', 'Text-pnhfcrE6Kc', 'Text-88lguME7Q6',
      'Text-6KCIWoaWr8', 'Text-m7R1-bc4x0', 'Text-PlXqCeyoQq', 'Text-e1QjDQKtM5',
      'Text-VZPgAFcUBw', 'Text-y440oen0KX', 'Text-MM5Tmz8aDZ', 'Text--lAvLnPUir',
      'Text-hPK5wRyKEz', 'Text-LuZRKUJ8p-', 'Text-cSV4Myk-vc', 'Text-Cd22aK5acV',
      'Text-SPy32JyDAn', 'Text-M35HPqU33R', 'Text-6o0T20BOb_', 'Text-Pf090ej871',
      'Text-mFRvDHKevA', 'Text-5fkb5aKysO', 'Text-5cgxfqshDu', 'Text-JpIgtSHqAL',
      'Text-I8jLymtlQc', 'Text-EI-MrmQ7WN', 'Text-Rg_dsoL08k', 'Text-EfpObURhlB',
      'Text-eWSwqVdfiN', 'Text-A34-1wZUyC'
    ];

    // Create comprehensive mapping for all 42 fields
    const result = {};
    
    // Define data for all fields with accurate data types
    const orientationDate = new Date();
    orientationDate.setDate(orientationDate.getDate() + 7); // 1 week from now
    const orientationTime = '10:00 AM';
    const orientationLocation = 'ALIT Campus, 500 Spencer Street, West Melbourne VIC 3003';
    
    // Calculate course start date (1 month from now)
    const courseStartDate = new Date();
    courseStartDate.setMonth(courseStartDate.getMonth() + 1);
    const courseStartDateStr = courseStartDate.toLocaleDateString('en-AU');
    
    // Calculate course end date (6 months from start)
    const courseEndDate = new Date(courseStartDate);
    courseEndDate.setMonth(courseEndDate.getMonth() + 6);
    const courseEndDateStr = courseEndDate.toLocaleDateString('en-AU');
    
    // Financial calculations
    const enrollmentFee = 200;
    const materialFee = 300;
    const tuitionFee = payment?.totalAmount ? payment.totalAmount - enrollmentFee - materialFee : 2000;
    const totalFee = enrollmentFee + materialFee + tuitionFee;
    
    // Create accurate field mapping based on user's specifications
    const allDataValues = [
      // Page 1 - Basic Info
      fullName, // 1. Text-cn2VAtzk7t - Student's full name (Dear [Student Name])
      currentDate, // 2. Text-j3RVeIoPLM - Date of Issue
      application?._id || '', // 3. Text-2peu82pH69 - Reference #
      enrollmentFormData?.personalDetails?.title || 'Mr.', // 4. Text-ViGlMIsTLB - Title (Mr., Ms., etc.)
      user.lastName || '', // 5. Text-AXh9CDzCwA - Family Name
      user.firstName || '', // 6. Text-Jcyai6Rb9o - Given Name
      enrollmentFormData?.personalDetails?.dateOfBirth || '', // 7. Text-SCoeNeXuyr - Date of Birth
      process.env.CRICOS || '', // 8. Text-XL9k8d7HES - CRICOS Code
      application?.certificationId?.code || '', // 9. Text-Q8oVdZniPw - Course Code
      courseName || '', // 10. Text-tK56PmZo-D - Course Details
      (enrollmentFormData?.course?.startDate && enrollmentFormData?.course?.endDate)
        ? `${enrollmentFormData.course.startDate} - ${enrollmentFormData.course.endDate}`
        : '', // 11. Text-XA7urVfjc5 - Start - End Date
      enrollmentFormData?.course?.durationWeeks || '', // 12. Text-QVOTH8qGJr - Duration (weeks)
      
      // Financial Details (Future Payment Schedule) - Fields 13-34
      '', // 13. Text-H8NdFrkzBV - Instalment 1 name
      '', // 14. Text-2ITRr_cMg_ - Instalment 1 amount
      '', // 15. Text-pnhfcrE6Kc - Instalment 2 name
      '', // 16. Text-88lguME7Q6 - Instalment 3 name
      '', // 17. Text-6KCIWoaWr8 - Instalment 4 name
      '', // 18. Text-m7R1-bc4x0 - Instalment 5 name
      '', // 19. Text-PlXqCeyoQq - Instalment 6 name
      '', // 20. Text-e1QjDQKtM5 - Instalment 1 due date
      '', // 21. Text-VZPgAFcUBw - Instalment 2 due date
      '', // 22. Text-y440oen0KX - Instalment 3 due date
      '', // 23. Text-MM5Tmz8aDZ - Instalment 4 due date
      '', // 24. Text--lAvLnPUir - Instalment 5 due date
      '', // 25. Text-hPK5wRyKEz - Instalment 6 due date
      '', // 26. Text-LuZRKUJ8p- - Instalment 2 amount
      '', // 27. Text-cSV4Myk-vc - Instalment 3 amount
      '', // 28. Text-Cd22aK5acV - Instalment 4 amount
      '', // 29. Text-SPy32JyDAn - Total due date
      '', // 30. Text-M35HPqU33R - Total due date
      '', // 31. Text-6o0T20BOb_ - Total due date
      '', // 32. Text-Pf090ej871 - Total due date
      '', // 33. Text-mFRvDHKevA - Total due date
      '', // 34. Text-5fkb5aKysO - Total amount
      
      // Orientation Details
      orientationDate.toLocaleDateString('en-AU'), // 35. Text-5cgxfqshDu - Orientation Date
      orientationTime, // 36. Text-JpIgtSHqAL - Orientation Time
      orientationLocation, // 37. Text-I8jLymtlQc - Orientation Location
      
      // Understanding Declaration
      fullName, // 38. Text-EI-MrmQ7WN - Student name for "I understand that"
      
      // Signatures
      fullName, // 39. Text-Rg_dsoL08k - Student's Signature
      dayStr, // 40. Text-EfpObURhlB - Signature Day
      monthStr, // 41. Text-eWSwqVdfiN - Signature Month
      yearStr, // 42. Text-A34-1wZUyC - Signature Year
    ];

    // Map data to all available fields
    fieldNames.forEach((fieldName, index) => {
      if (allDataValues[index]) {
        result[fieldName] = allDataValues[index];
      }
    });

    return result;
  }

  async fillSpecificFields(fieldMappings) {
    try {
      // Load the PDF template
      const templateBytes = fs.readFileSync(this.templatePath);
      const pdfDoc = await PDFDocument.load(templateBytes);
      const form = pdfDoc.getForm();

      // Fill the specified form fields
      for (const [fieldName, value] of Object.entries(fieldMappings)) {
        try {
          const field = form.getField(fieldName);
          if (field && value) {
            field.setText(value);
            console.log(`Filled field ${fieldName}: ${value}`);
          }
        } catch (error) {
          console.warn(`Could not fill field ${fieldName}:`, error.message);
        }
      }

      // Flatten the form to make it non-editable
      form.flatten();

      // Generate the PDF buffer
      const pdfBytes = await pdfDoc.save();
      return pdfBytes;

    } catch (error) {
      console.error('Error filling specific fields:', error);
      throw error;
    }
  }
}

module.exports = COEFormFiller;
