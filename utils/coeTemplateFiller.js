// utils/coeTemplateFiller.js
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

async function generateCOEFromTemplate({ user, application, payment, enrollmentFormData, coordinateMap, debug = true, pageOffsets }) {
  const templatePath = path.join(process.cwd(), 'assets', 'coe_template.pdf');
  const existingPdfBytes = fs.readFileSync(templatePath);

  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const drawInBox = (page, item, text, offsetX = 0, offsetY = 0, drawOutline = false) => {
    const { height: pageH } = page.getSize();
    const x = (item.x + (offsetX || 0));
    const yTop = (item.y + (offsetY || 0));
    const width = item.width || 200;
    const height = item.height || 18;
    const y = pageH - yTop - height + 3;
    const size = item.size || 11;

    if (drawOutline) {
      page.drawRectangle({ x, y: pageH - yTop - height, width, height, borderColor: rgb(1, 0, 0), borderWidth: 0.5, color: undefined, opacity: 0.2 });
    }

    page.drawText(String(text), {
      x: x + 2,
      y,
      size,
      font: item.bold ? boldFont : font,
      color: rgb(0, 0, 0),
      maxWidth: width - 4,
      lineHeight: size + 2,
    });
  };

  // Coordinates map (top-left origin) — uses latest corrected values
  const map = coordinateMap || {
    1: [
      { key: 'date_of_issue', x: 58, y: 222, width: 145, height: 18, size: 11 },
      { key: 'reference_no', x: 58, y: 242, width: 145, height: 18, size: 11 },
      { key: 'dear_name', x: 58, y: 345, width: 250, height: 18, size: 11 },
      { key: 'applicant_title_fullname', x: 60, y: 468, width: 170, height: 18, size: 11, bold: true },
      { key: 'applicant_family_name', x: 232, y: 468, width: 570, height: 18, size: 11, bold: true },
      { key: 'applicant_given_name', x: 232, y: 490, width: 570, height: 18, size: 11, bold: true },
      { key: 'applicant_dob', x: 232, y: 510, width: 570, height: 18, size: 11 },
      { key: 'agency_company', x: 265, y: 590, width: 535, height: 18, size: 11 },
      { key: 'cricos_code', x: 60, y: 686, width: 105, height: 18, size: 11 },
      { key: 'course_details', x: 167, y: 686, width: 216, height: 18, size: 11, bold: true },
      { key: 'course_start_end', x: 385, y: 686, width: 158, height: 18, size: 11 },
      { key: 'course_duration_weeks', x: 545, y: 686, width: 135, height: 18, size: 11 },
      { key: 'work_placement', x: 682, y: 686, width: 119, height: 18, size: 11 },
      { key: 'special_conditions', x: 60, y: 726, width: 105, height: 50, size: 11 },
    ],
    2: [
      { key: 'i_understand_name', x: 58, y: 353, width: 265, height: 18, size: 11, bold: true },
    ],
    3: [
      { key: 'student_signature_name', x: 65, y: 765, width: 275, height: 20, size: 11 },
      { key: 'signature_date', x: 590, y: 765, width: 145, height: 20, size: 11 },
    ],
  };

  // Page-level offsets for quick calibration
  const offsets = pageOffsets || { 1: { dx: 0, dy: 0 }, 2: { dx: 0, dy: 0 }, 3: { dx: 0, dy: 0 } };

  // Values
  const enrolmentDate = new Date().toLocaleDateString('en-AU');
  const dob = enrollmentFormData?.personalDetails?.dateOfBirth || enrollmentFormData?.dob || '';
  const title = enrollmentFormData?.personalDetails?.title || enrollmentFormData?.title || '';
  const agencyCompany = enrollmentFormData?.agentDetails?.companyName || enrollmentFormData?.agencyCompanyName || '';
  const startDate = enrollmentFormData?.course?.startDate || '';
  const endDate = enrollmentFormData?.course?.endDate || '';
  const durationWeeks = enrollmentFormData?.course?.durationWeeks || '';
  const workPlacement = enrollmentFormData?.course?.workPlacement || 'N/A';
  const referenceNo = application?._id ? String(application._id) : '';

  const values = {
    date_of_issue: enrolmentDate,
    reference_no: referenceNo,
    dear_name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    applicant_title_fullname: `${title ? title + ' ' : ''}${user.firstName || ''} ${user.lastName || ''}`.trim(),
    applicant_family_name: user.lastName || '',
    applicant_given_name: user.firstName || '',
    applicant_dob: dob,
    agency_company: agencyCompany,
    cricos_code: process.env.CRICOS || '03981M',
    course_details: application?.certificationId?.name || '',
    course_start_end: startDate && endDate ? `${startDate} - ${endDate}` : '',
    course_duration_weeks: durationWeeks ? String(durationWeeks) : '',
    work_placement: workPlacement,
    special_conditions: '',
    i_understand_name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    student_signature_name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    signature_date: enrolmentDate,
  };

  Object.entries(map).forEach(([pageKey, items]) => {
    const pageIndex = Number(pageKey) - 1;
    if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) return;
    const page = pdfDoc.getPage(pageIndex);
    const { dx = 0, dy = 0 } = offsets[pageKey] || {};

    items.forEach((item) => {
      const text = values[item.key];
      if (!text) return;
      drawInBox(page, item, text, dx, dy, debug);
    });
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

module.exports = { generateCOEFromTemplate };
