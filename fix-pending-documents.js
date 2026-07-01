/**
 * fix-pending-documents.js
 *
 * One-shot script to repair DocumentUpload records that were accidentally
 * reset to "pending" status due to the assessor using the wrong GET endpoint
 * (which returned empty docs + "pending" and then overwrote the real data
 * on every "Submit Assessment" click).
 *
 * What it does per student:
 *   1. Looks up the student's application and the assigned assessor
 *   2. Sets every document's verificationStatus → "verified", isVerified → true,
 *      verifiedBy → assignedAssessor, verifiedAt → now
 *   3. Sets DocumentUpload.status → "verified"
 *   4. Sets Application.overallStatus → "assessment_completed"
 *
 * Usage:
 *   node fix-pending-documents.js
 *
 * To target different students, edit STUDENTS_TO_FIX below.
 * To do a dry run without saving, set DRY_RUN = true.
 */

require("dotenv").config({ override: true });
const mongoose = require("mongoose");
const connectDB = require("./config/database");

// ── CONFIG ─────────────────────────────────────────────────────────────────────

const DRY_RUN = false; // set true to preview changes without writing to DB

// Students to fix — match by first + last name (case-insensitive).
// Add or remove entries as needed.
const STUDENTS_TO_FIX = [
  { firstName: "Xi",       lastName: "YANG" },
  { firstName: "Kefeng",   lastName: "ZHAN" },
  { firstName: "Zhouyang", lastName: "WU" },
  { firstName: "Jun",      lastName: "DENG" },
  { firstName: "Gang",     lastName: "LUO" },
  { firstName: "Jiajie",   lastName: "LIANG" },
  { firstName: "Shichao",  lastName: "GAO" },
  { firstName: "Rugang",   lastName: "YAO" },
  { firstName: "Abbas",    lastName: "Abdolahi" },
  { firstName: "Jianhong", lastName: "GUO" },
];

// ── MODELS ─────────────────────────────────────────────────────────────────────

const User           = require("./models/user");
const Application    = require("./models/application");
const DocumentUpload = require("./models/documentUpload");

// ── MAIN ───────────────────────────────────────────────────────────────────────

async function fixStudent({ firstName, lastName }) {
  console.log(`\n── ${firstName} ${lastName} ─────────────────────────`);

  // 1. Find the user
  const user = await User.findOne({
    firstName: new RegExp(`^${firstName}$`, "i"),
    lastName:  new RegExp(`^${lastName}$`,  "i"),
  });

  if (!user) {
    console.log(`  ✗ User not found — skipping`);
    return;
  }
  console.log(`  ✓ User found: ${user._id}`);

  // 2. Find their application(s) — take the most recent if there are multiple
  const applications = await Application.find({ userId: user._id })
    .populate("assignedAssessor", "firstName lastName")
    .sort({ createdAt: -1 });

  if (!applications.length) {
    console.log(`  ✗ No applications found — skipping`);
    return;
  }

  for (const app of applications) {
    console.log(`\n  Application: ${app._id}  status=${app.overallStatus}`);

    if (!app.assignedAssessor) {
      console.log(`    ✗ No assessor assigned — skipping this application`);
      continue;
    }

    const assessorId = app.assignedAssessor._id;
    console.log(`    Assessor: ${app.assignedAssessor.firstName} ${app.assignedAssessor.lastName} (${assessorId})`);

    // 3. Find the DocumentUpload record
    const docUpload = await DocumentUpload.findOne({ applicationId: app._id });

    if (!docUpload) {
      console.log(`    ✗ No DocumentUpload record found — skipping`);
      continue;
    }

    console.log(`    DocumentUpload: ${docUpload._id}  status=${docUpload.status}  docs=${docUpload.documents.length}`);

    // Show current individual doc statuses
    docUpload.documents.forEach((d, i) => {
      console.log(`      doc[${i}] ${d.originalName}  verificationStatus=${d.verificationStatus}  isVerified=${d.isVerified}`);
    });

    if (DRY_RUN) {
      console.log(`    [DRY RUN] Would update DocumentUpload → status=verified and all docs → verified`);
      console.log(`    [DRY RUN] Would update Application → overallStatus=assessment_completed`);
      continue;
    }

    // 4. Update all individual documents
    const now = new Date();
    docUpload.documents.forEach((doc) => {
      doc.verificationStatus = "verified";
      doc.isVerified         = true;
      doc.verifiedBy         = assessorId;
      doc.verifiedAt         = now;
      doc.rejectionReason    = null;
    });

    // 5. Update overall DocumentUpload status
    docUpload.status     = "verified";
    docUpload.verifiedBy = assessorId;
    docUpload.verifiedAt = now;
    docUpload.rejectionReason = null;

    await docUpload.save();
    console.log(`    ✓ DocumentUpload saved`);

    // 6. Update Application overallStatus
    await Application.findByIdAndUpdate(app._id, {
      overallStatus: "assessment_completed",
    });
    console.log(`    ✓ Application overallStatus → assessment_completed`);
  }
}

async function main() {
  await connectDB();

  console.log(`DRY_RUN = ${DRY_RUN}`);
  console.log(`Fixing ${STUDENTS_TO_FIX.length} student(s)...\n`);

  for (const student of STUDENTS_TO_FIX) {
    await fixStudent(student);
  }

  console.log("\n\nDone.");
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
