// utils/coeHtmlGenerator.js
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

function resolveChromeExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe')
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch (_) {}
  }
  return undefined;
}

function buildHtml({ user, application, payment, enrollmentFormData }) {
  const company = {
    name: process.env.RTO_NAME || 'Australian Leading Institute of Technology',
    rto: process.env.RTO_CODE || '45156',
    cricos: process.env.CRICOS || '03981M',
    address: process.env.COMPANY_ADDRESS || '500 Spencer Street, West Melbourne, VIC 3003',
    website: process.env.COMPANY_WEBSITE || 'www.alit.edu.au',
    email: process.env.COMPANY_EMAIL || 'info@alit.edu.au',
    phone: process.env.COMPANY_PHONE || '(03) 99175018',
    logo: process.env.LOGO_URL || 'https://certified.io/images/ebclogo.png',
  };
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  const enrollDate = new Date().toLocaleDateString('en-AU');
  const course = application?.certificationId?.name || '';
  const paymentStatus = payment?.status === 'completed' ? 'Paid in Full' : 'Payment Plan Active';
  const amount = payment?.totalAmount != null ? `$${payment.totalAmount} ${payment?.currency || 'AUD'}` : '';

  const pageHeader = `
    <div class="header">
      <img src="${company.logo}" />
      <div class="title-block">
        <h1>${company.name}</h1>
        <small>RTO Code: ${company.rto} | CRICOS Code: ${company.cricos}</small>
      </div>
    </div>`;

  const pageFooter = `
    <div class="footer">
      ${company.name} | ${company.address} | ${company.phone} | ${company.email} | ${company.website}
    </div>`;

  const page1 = `
  <section class="page">
    ${pageHeader}
    <div class="section row">
      <div class="pill"><span class="label">Date of Issue:</span> ${enrollDate}</div>
      <div class="pill"><span class="label">Reference #:</span> ${application?._id || ''}</div>
    </div>

    <div class="section">
      <div class="label">Letter of Offer for Admission</div>
      <div class="muted" style="margin-top:6px">International Student</div>
    </div>

    <div class="section">Dear ${fullName},</div>

    <div class="section">
      <table class="grid">
        <thead><tr><th colspan="2">1. Applicant Details</th></tr></thead>
        <tbody>
          <tr><td class="label">Title</td><td>${enrollmentFormData?.personalDetails?.title || ''} ${fullName}</td></tr>
          <tr><td class="label">Family Name</td><td>${user.lastName || ''}</td></tr>
          <tr><td class="label">Given Name</td><td>${user.firstName || ''}</td></tr>
          <tr><td class="label">Date of Birth</td><td>${enrollmentFormData?.personalDetails?.dateOfBirth || ''}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="section">
      <table class="grid">
        <thead><tr>
          <th>CRICOS Course Code</th>
          <th>Course Details</th>
          <th>Start - End Date</th>
          <th>Duration (weeks)</th>
          <th>Work placement</th>
        </tr></thead>
        <tbody>
          <tr>
            <td>${company.cricos}</td>
            <td>${course}</td>
            <td>${enrollmentFormData?.course?.startDate || ''} - ${enrollmentFormData?.course?.endDate || ''}</td>
            <td>${enrollmentFormData?.course?.durationWeeks || ''}</td>
            <td>${enrollmentFormData?.course?.workPlacement || 'N/A'}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="section row">
      <div class="pill"><span class="label">Payment Status:</span> ${paymentStatus}</div>
      <div class="pill"><span class="label">Amount:</span> ${amount}</div>
    </div>

    ${pageFooter}
  </section>`;

  // Generic page builder for remaining policy/conditions pages
  const policyBlock = (n) => `
  <section class="page">
    ${pageHeader}
    <div class="section">
      <div class="label">Acceptance Agreement Declaration (Page ${n})</div>
      <div style="margin-top:10px; font-size:12px; line-height:1.5">
        <p>I, <strong>${fullName}</strong>, understand that:</p>
        <ol style="padding-left:18px;">
          <li>This agreement confirms the program(s) and terms & conditions of my enrolment.</li>
          <li>I must meet conditions specified in the agreement to commence.</li>
          <li>My enrolment may be cancelled for false or fraudulent information.</li>
          <li>I will abide by institute rules, policies and procedures.</li>
          <li>Changes in my enrolment status may be reported to authorities.</li>
          <li>Assessment and satisfactory progress information may be shared with authorities.</li>
          <li>I must pay tuition fees in advance for each study period as applicable.</li>
          <li>I am responsible for refunds/cancellations as per policies.</li>
        </ol>
      </div>
    </div>
    ${pageFooter}
  </section>`;

  // Build pages 2..12 as policy pages, page 13 signatures
  let middlePages = '';
  for (let i = 2; i <= 12; i++) middlePages += policyBlock(i);

  const page13 = `
  <section class="page">
    ${pageHeader}
    <div class="section">
      <div class="label">Signature and Acceptance</div>
      <div style="margin-top:40mm; display:flex; justify-content:space-between;">
        <div>
          <div style="border-top:1px solid #333; width:80mm; height:0"></div>
          <div class="muted">Student's Signature</div>
          <div style="margin-top:8px">${fullName}</div>
          <div class="muted">${enrollDate}</div>
        </div>
        <div>
          <div style="border-top:1px solid #333; width:60mm; height:0"></div>
          <div class="muted">Date</div>
          <div style="margin-top:8px">${enrollDate}</div>
        </div>
      </div>
    </div>
    ${pageFooter}
  </section>`;

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 15mm 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; }
    .page { page-break-after: always; }
    .page:last-of-type { page-break-after: auto; }
    .header { display:flex; align-items:center; gap:16px; border:1px solid #ccc; padding:12px 16px; }
    .header img { height:64px; }
    .title-block { flex:1; text-align:center; }
    .title-block h1 { margin:0; font-size:18px; }
    .title-block small { color:#333; }
    .section { margin-top:18px; }
    .label { font-weight:700; color:#0c2d62; }
    .grid { width:100%; border-collapse:collapse; margin-top:8px; }
    .grid th, .grid td { border:1px solid #243b5c; padding:8px; font-size:12px; }
    .grid th { background:#0c2d62; color:#fff; text-align:left; }
    .muted { color:#4a4a4a; }
    .row { display:flex; justify-content:space-between; gap:12px; }
    .pill { background:#eef5ff; padding:8px 10px; border-radius:6px; border:1px solid #cfe2ff; }
    .footer { margin-top:24px; font-size:11px; text-align:center; color:#444; }
  </style>
</head>
<body>
  ${page1}
  ${middlePages}
  ${page13}
</body>
</html>`;
}

async function generateCOEHtmlPDF(user, application, payment, enrollmentFormData) {
  const html = buildHtml({ user, application, payment, enrollmentFormData });
  const executablePath = resolveChromeExecutable();
  const launchOpts = { headless: 'new', args: ['--no-sandbox', '--disable-gpu'] };
  if (executablePath) launchOpts.executablePath = executablePath;
  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '15mm', bottom: '12mm', left: '12mm', right: '12mm' } });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

module.exports = { generateCOEHtmlPDF };
