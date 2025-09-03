// scripts/generate_sample_coe_html.js
const fs = require('fs');
const path = require('path');
const { generateCOEHtmlPDF } = require('../utils/coeHtmlGenerator');

(async () => {
  try {
    const user = { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' };
    const application = { _id: 'APP-123456', certificationId: { name: 'CPC30220 Certificate III in Carpentry' } };
    const payment = { status: 'completed', totalAmount: 3500, currency: 'AUD' };
    const enrollmentFormData = {
      personalDetails: { title: 'Mr', dateOfBirth: '01/01/1990' },
      course: { startDate: '01/10/2025', endDate: '01/10/2026', durationWeeks: 52, workPlacement: 'N/A' }
    };

    const pdf = await generateCOEHtmlPDF(user, application, payment, enrollmentFormData);
    const out = path.join(process.cwd(), 'assets', 'coe_sample_html.pdf');
    fs.writeFileSync(out, pdf);
    console.log('Wrote', out, 'size:', pdf.length);
  } catch (e) {
    console.error('html_sample_error', e);
    process.exit(1);
  }
})();
