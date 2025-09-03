// scripts/generate_sample_coe.js
const fs = require('fs');
const path = require('path');
const { generateCOEFromTemplate } = require('../utils/coeTemplateFiller');

(async () => {
  try {
    const user = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      phoneCode: '+61',
      phoneNumber: '412345678'
    };

    const application = {
      _id: 'APP-123456',
      certificationId: { name: 'CPC30220 Certificate III in Carpentry' }
    };

    const payment = {
      paymentType: 'one_time',
      status: 'completed',
      totalAmount: 3500,
      currency: 'AUD',
      completedAt: new Date()
    };

    const enrollmentFormData = {
      personalDetails: { dateOfBirth: '01/01/1990', title: 'Mr' },
      agentDetails: { companyName: 'StudyIn Pty Ltd.' },
      course: { startDate: '01/10/2025', endDate: '01/10/2026', durationWeeks: 52, workPlacement: 'N/A' }
    };

    // Calibrated per-page offsets (dx, dy)
    const pageOffsets = { 1: { dx: 0, dy: 6 }, 2: { dx: 0, dy: 6 }, 3: { dx: 0, dy: -8 } };

    const buffer = await generateCOEFromTemplate({
      user,
      application,
      payment,
      enrollmentFormData,
      coordinateMap: undefined,
      debug: false,
      pageOffsets
    });

    const outPath = path.join(process.cwd(), 'assets', 'coe_sample_out.pdf');
    fs.writeFileSync(outPath, buffer);
    console.log('Wrote', outPath, 'size:', buffer.length);
  } catch (err) {
    console.error('generate_sample_error', err);
    process.exit(1);
  }
})();
