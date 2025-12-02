const PDFDocument = require("pdfkit");
const https = require("https");

function formatDateAU(dateLike) {
  if (!dateLike) return "";
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Australia/Sydney",
  });
}

async function fetchLogoBuffer(logoUrl) {
  if (!logoUrl) return null;
  return new Promise((resolve, reject) => {
    https
      .get(logoUrl, (res) => {
        const data = [];
        res.on("data", (chunk) => data.push(chunk));
        res.on("end", () => resolve(Buffer.concat(data)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

async function generateCOEPDF(user, application, enrollmentFormData = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 72 }); // 1 inch margins on all sides
      const buffers = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));

      const pageWidth = doc.page.width;
      const marginX = doc.page.margins.left || 72;
      const marginY = doc.page.margins.top || 72;
      // Slight inner padding for body text so it matches your template
      const bodyX = marginX + 20;
      const contentWidth = pageWidth - bodyX - marginX;

      const logoUrl =
        process.env.LOGO_URL ||
        "https://certified.io/images/culinary_institute_logo.png";

      // Use Times New Roman (core PDF fonts)
      const FONT_REGULAR = "Times-Roman";
      const FONT_BOLD = "Times-Bold";

      // Header with logo and title
      try {
        const logoBuffer = await fetchLogoBuffer(logoUrl);
        if (logoBuffer) {
          // Logo snug in the top-left margin area
          doc.image(logoBuffer, marginX, marginY - 20, { width: 110 });
        }
      } catch (e) {
        // Fallback to text if logo fails
        doc
          .font(FONT_BOLD)
          .fontSize(14)
          .fillColor("#111827")
          .text(
            process.env.RTO_NAME || "Culinary Institute of Australia",
            marginX,
            marginY
          );
      }

      // Title
      doc
        .font(FONT_BOLD)
        .fontSize(18)
        .fillColor("#111827")
        .text("Confirmation of Enrolment", 0, marginY + 25, {
          align: "center",
        });

      // Move down to create space before body
      doc.moveDown(2);

      // Intro paragraph
      doc
        .font(FONT_REGULAR)
        .fontSize(11)
        .fillColor("#111827")
        .text(
          "This document certifies that the following student has been officially enrolled at the Culinary Institute of Australia.",
          bodyX,
          doc.y,
          {
            align: "left",
            width: contentWidth,
            lineGap: 4,
          }
        );

      doc.moveDown(1.2);

      const studentName = `${user.firstName || ""} ${
        user.lastName || ""
      }`.trim();
      const studentId = application.appCode || application._id;
      const dob = formatDateAU(user.dateOfBirth || user.dob);
      const courseName =
        application?.certificationId?.name ||
        application?.certificationName ||
        "";
      const courseCode =
        application?.certificationId?.code ||
        application?.certificationId?.shortCode ||
        "";
      const startDate =
        formatDateAU(enrollmentFormData.courseStartDate) ||
        formatDateAU(enrollmentFormData.startDate);
      const endDate =
        formatDateAU(enrollmentFormData.courseEndDate) ||
        formatDateAU(enrollmentFormData.endDate);
      const dateIssued = formatDateAU(new Date());

      const studyModeRaw =
        enrollmentFormData.studyMode ||
        enrollmentFormData.mode ||
        enrollmentFormData.study_mode;
      const studyMode =
        typeof studyModeRaw === "string" ? studyModeRaw.toLowerCase() : "";

      const modes = {
        onCampus: studyMode.includes("campus"),
        online: studyMode.includes("online"),
        blended: studyMode.includes("blend"),
      };

      const checkbox = (checked, label) => `${checked ? "☑" : "☐"} ${label}`;

      const addField = (label, value) => {
        // move to bodyX to respect left inner padding
        doc.moveTo(bodyX, doc.y);
        doc
          .font(FONT_BOLD)
          .fontSize(11)
          .fillColor("#111827")
          .text(`${label}: `, bodyX, doc.y, { continued: true });
        doc
          .font(FONT_REGULAR)
          .fontSize(11)
          .fillColor("#4B5563")
          .text(value || "");
        doc.moveDown(0.4);
      };

      addField("Student Name", studentName);
      addField("Student ID", String(studentId || ""));
      addField("Date of Birth", dob);
      addField("Course Name", courseName);
      addField("Course Code", courseCode);

      // Study mode line
      doc.moveTo(bodyX, doc.y);
      doc
        .font(FONT_BOLD)
        .fontSize(11)
        .fillColor("#111827")
        .text("Study Mode: ", bodyX, doc.y, { continued: true });
      doc
        .font(FONT_REGULAR)
        .fontSize(11)
        .fillColor("#4B5563")
        .text(
          [
            checkbox(modes.onCampus, "On-campus"),
            checkbox(modes.online, "Online"),
            checkbox(modes.blended, "Blended"),
          ].join("   ")
        );
      doc.moveDown(0.4);

      addField("Course Start Date", startDate);
      addField("Course End Date", endDate);

      doc.moveDown(1.5);

      // Provider declaration
      doc.moveTo(bodyX, doc.y);
      doc
        .font(FONT_BOLD)
        .fontSize(11)
        .fillColor("#111827")
        .text("Provider Declaration", bodyX, doc.y, { underline: true });

      doc.moveDown(0.6);

      const para1 =
        "This letter serves as formal confirmation that the above-named student has accepted an offer and is enrolled in the specified course of study at the Culinary Institute of Australia.";
      const para2 =
        "The institution confirms that the student has met all entry requirements and is eligible to commence studies on the indicated start date.";

      doc
        .font(FONT_REGULAR)
        .fontSize(11)
        .fillColor("#111827")
        .text(para1, bodyX, doc.y, { lineGap: 4, width: contentWidth });
      doc.moveDown(0.4);
      doc.text(para2, bodyX, doc.y, { lineGap: 4, width: contentWidth });

      doc.moveDown(1.2);

      addField("Date Issued", dateIssued);

      doc.moveDown(1.2);

      const contactLine =
        "If you require further information, please contact the Admissions Office at admissions@culinaryaustralia.edu.au.";
      doc
        .font(FONT_REGULAR)
        .fontSize(11)
        .fillColor("#4B5563")
        .text(contactLine, bodyX, doc.y, { lineGap: 4, width: contentWidth });

      // Footer
      const footerLine1 =
        process.env.COE_FOOTER_LINE1 ||
        "Culinary Institute Australia Pty Ltd | RTO Code 45775 | CRICOS Code 03964A";
      const footerLine2 =
        process.env.COE_FOOTER_LINE2 ||
        "Confirmation of Enrolment - Version 1.0";

      // Compute safe footer position within current page margins
      const bottomMargin = doc.page.margins.bottom || 72;
      const bottomLimit = doc.page.height - bottomMargin; // max Y before pdfkit adds new page
      let footerY = bottomLimit - 30; // leave some space above bottom margin

      // Ensure footer is below the body content
      const minFooterY = doc.y + 24; // at least some space after last line
      if (minFooterY > footerY) {
        footerY = minFooterY;
      }
      doc
        .fontSize(9)
        .fillColor("#6B7280")
        .text(footerLine1, marginX, footerY, {
          align: "center",
          width: pageWidth - marginX * 2,
        });
      doc
        .fontSize(9)
        .fillColor("#6B7280")
        .text(footerLine2, marginX, footerY + 12, {
          align: "center",
          width: pageWidth - marginX * 2,
        });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateCOEPDF,
};

// CLI preview helper: generate a sample COE PDF for visual review
if (require.main === module) {
  (async () => {
    const fs = require("fs");
    const path = require("path");

    const sampleUser = {
      firstName: "Sample",
      lastName: "Student",
      dateOfBirth: "1995-01-15",
    };

    const sampleApplication = {
      _id: "APP-SAMPLE-0001",
      appCode: "CULINARY-000001",
      certificationId: {
        name: "Certificate IV in Ageing Support",
        code: "CHC43015",
      },
    };

    const sampleEnrolment = {
      studyMode: "On-campus & Online & Blended",
      courseStartDate: new Date(),
      courseEndDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000),
    };

    const buffer = await generateCOEPDF(
      sampleUser,
      sampleApplication,
      sampleEnrolment
    );
    const outPath = path.join(
      __dirname,
      "..",
      "assets",
      "COE-preview.pdf"
    );
    fs.writeFileSync(outPath, buffer);
    console.log("Preview COE generated at:", outPath);
  })().catch((err) => {
    console.error("Error generating preview COE:", err);
    process.exit(1);
  });
}
