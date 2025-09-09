// utils/offerHtmlGenerator.js
// Build a 13-page Offer/COE HTML and export to PDF (Puppeteer),
// similar in approach to invoice generator – clean, printable, and data-driven.

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

function resolveChromeExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch (_) {}
  }
  return undefined;
}

function text(v, d = '') { return (v == null ? d : String(v)); }

function headerHTML({ company }) {
  return `
  <div class="header">
    <div class="logo">${company.logoEmoji || '🏛️'}</div>
    <div class="header-text">
      <h1>${text(company.name, 'Australian Leading Institute of Technology')}</h1>
      <div class="codes">RTO Code: ${text(company.rto, '45156')} | CRICOS Code: ${text(company.cricos, '03981M')}</div>
    </div>
  </div>`;
}

function footerHTML({ company, pageNo }) {
  return `
  <div class="footer">
    <strong>${text(company.name, 'Australian Leading Institute of Technology')}</strong><br>
    RTO No: ${text(company.rto, '45156')} | CRICOS NO:${text(company.cricos, '03981M')}<br>
    ${text(company.address, '500, Spencer Street, West Melbourne, Victoria-3003, Australia,')}<br>
    ${text(company.website, 'www.alit.edu.au')}<br>
    Page ${pageNo}
  </div>`;
}

function buildPageStyles() {
  return `
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; position: relative; page-break-after: always; }
  .page:last-of-type { page-break-after: auto; }
  .container { padding: 10mm; }
  .header { display:flex; align-items:center; border: 1px solid #000; padding: 8px 10px; margin-bottom: 12px; }
  .logo { width: 60px; height: 60px; display:flex; align-items:center; justify-content:center; background:#1e3a8a; color:#fff; border-radius:6px; font-weight:700; }
  .header-text { flex: 1; padding-left: 12px; }
  .header-text h1 { margin:0; font-size: 18px; }
  .header-text .codes { margin-top: 4px; font-weight: 700; font-size: 12px; }
  .section { margin-top: 12px; }
  .section-title { background: #1e3a8a; color:#fff; padding: 8px; font-weight: 700; font-size: 12px; }
  .table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .table th, .table td { border:1px solid #000; padding:8px; text-align:left; vertical-align: top; }
  .table th { background:#1e3a8a; color:#fff; font-weight:700; font-size:11px; }
  .label { font-weight:700; width: 160px; }
  .muted { color:#444; }
  .row { display:flex; gap:12px; justify-content:space-between; }
  .pill { border:1px solid #000; padding:6px 8px; border-radius:6px; }
  .footer { position:absolute; bottom: 12mm; left: 10mm; right: 10mm; text-align:center; font-size:10px; border-top:1px solid #ccc; padding-top:8px; }
  .title-center { text-align:center; margin-top: 8px; margin-bottom: 8px; }
  `;
}

function page1({ company, data }) {
  return `
  <section class="page"><div class="container">
    ${headerHTML({ company })}
    <div class="section">
      <div><strong>Date of Issue:</strong> ${text(data.dateOfIssue)}</div>
      <div><strong>Reference #:</strong> ${text(data.referenceNumber)}</div>
    </div>
    <div class="title-center">
      <h2>Letter of Offer for Admission</h2>
      <div><strong>International Student</strong></div>
    </div>
    <div class="section">Dear <strong>${text(data.studentName)}</strong>,</div>
    <div class="section">It is with great pleasure to offer you admission to ${text(company.name)} at the ${text(company.campusAddress || company.address)} campus for the following course(s):</div>

    <div class="section">
      <div class="section-title">1. Applicant Details</div>
      <table class="table">
        <tr><td class="label">Title</td><td>${text(data.title)}</td></tr>
        <tr><td class="label">Family Name</td><td>${text(data.familyName)}</td></tr>
        <tr><td class="label">Given Name</td><td>${text(data.givenName)}</td></tr>
        <tr><td class="label">Date of Birth</td><td>${text(data.dateOfBirth)}</td></tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">2. Agent Details (if applicable)</div>
      <table class="table">
        <tr><td class="label">Agency Company Name</td><td>${text(data.agencyName || '')}</td></tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">3. Course(s) Details</div>
      <table class="table">
        <thead>
          <tr>
            <th>CRICOS Course Code</th>
            <th>Course Details</th>
            <th>Start - End Date</th>
            <th>Duration (weeks)</th>
            <th>Work placement</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${text(data.cricosCode)}</td>
            <td>${text(data.courseDetails)}</td>
            <td>${text(data.startEndDate)}</td>
            <td>${text(data.duration)}</td>
            <td>${text(data.workPlacement || 'N/A')}</td>
          </tr>
        </tbody>
      </table>
      <div class="section"><strong>Special Conditions:</strong> ${text(data.specialConditions || '-')}</div>
    </div>
    ${footerHTML({ company, pageNo: 1 })}
  </div></section>`;
}

function page2({ company, data }) {
  return `
  <section class="page"><div class="container">
    ${headerHTML({ company })}
    <div class="section">
      <div class="section-title">Course Requirements</div>
      <div class="section">
        ${text(data.requirementsText || 'Refer to course handbook for detailed requirements.')}
      </div>
    </div>
    <div class="section">
      <div class="section-title">4. Total Course Fee Details*</div>
      <div class="section"><strong>${text(data.courseName)}</strong></div>
      <table class="table">
        <tr><td class="label">Enrolment Fee</td><td>${text(data.enrolmentFee || '$0')}</td></tr>
        <tr><td class="label">Material Fee</td><td>${text(data.materialFee || '$0')}</td></tr>
        <tr><td class="label">Tuition fee</td><td>${text(data.tuitionFee || '$0')}</td></tr>
        <tr><td class="label">Total</td><td>${text(data.totalFee || '$0')}</td></tr>
      </table>
    </div>
    ${footerHTML({ company, pageNo: 2 })}
  </div></section>`;
}

function policyPage({ company, data }, n) {
  return `
  <section class="page"><div class="container">
    ${headerHTML({ company })}
    <div class="section">
      <div class="section-title">Acceptance Agreement Declaration (Page ${n})</div>
      <div class="section muted">${text(data[`policyPage${n}`] || 'Standard terms, conditions, refund policy, complaints & appeals, student responsibilities, and institute policies continue on this page.')}</div>
    </div>
    ${footerHTML({ company, pageNo: n })}
  </div></section>`;
}

function page13({ company, data }) {
  return `
  <section class="page"><div class="container">
    ${headerHTML({ company })}
    <div class="section">
      <div class="section-title">Signature and Acceptance</div>
      <div class="section">I, <strong>${text(data.studentName)}</strong>, accept the offer and agree to the terms and conditions set forth.</div>
      <div class="section" style="margin-top:24mm; display:flex; justify-content:space-between;">
        <div>
          <div style="border-top:1px solid #333; width:80mm; height:0"></div>
          <div class="muted">Student's Signature</div>
          <div style="margin-top:6px">${text(data.studentName)}</div>
          <div class="muted">${text(data.dateOfIssue)}</div>
        </div>
        <div>
          <div style="border-top:1px solid #333; width:60mm; height:0"></div>
          <div class="muted">Date</div>
          <div style="margin-top:6px">${text(data.dateOfIssue)}</div>
        </div>
      </div>
    </div>
    ${footerHTML({ company, pageNo: 13 })}
  </div></section>`;
}

function buildOfferHtml(input = {}) {
  const company = {
    name: input.companyName || process.env.RTO_NAME || 'Australian Leading Institute of Technology',
    rto: input.rtoCode || process.env.RTO_CODE || '45156',
    cricos: input.cricos || process.env.CRICOS || '03981M',
    address: input.companyAddress || process.env.COMPANY_ADDRESS || '500 Spencer St, West Melbourne, VIC, 3003',
    website: input.companyWebsite || process.env.COMPANY_WEBSITE || 'www.alit.edu.au',
    logoEmoji: input.logoEmoji || '🏛️',
    campusAddress: input.campusAddress,
  };
  const data = input.data || {};

  const middlePages = Array.from({ length: 10 }, (_, i) => policyPage({ company, data }, i + 3)).join('');

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>${buildPageStyles()}</style>
  <title>Offer / COE</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  ${page1({ company, data })}
  ${page2({ company, data })}
  ${middlePages}
  ${page13({ company, data })}
</body>
</html>`;
}

async function generateOfferPDF(input = {}) {
  const html = buildOfferHtml(input);
  const executablePath = resolveChromeExecutable();
  const launchOpts = { headless: 'new', args: ['--no-sandbox', '--disable-gpu'] };
  if (executablePath) launchOpts.executablePath = executablePath;

  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' } });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

module.exports = { buildOfferHtml, generateOfferPDF };


