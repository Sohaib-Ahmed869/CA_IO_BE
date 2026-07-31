// Read-only inspection: why do assessor-verified docs show pending in admin?
// Checks for duplicate DocumentUpload records and documentUploadId ref mismatches.
require("dotenv").config({ override: true });
const mongoose = require("mongoose");
const connectDB = require("./config/database");

const User = require("./models/user");
const Application = require("./models/application");
const DocumentUpload = require("./models/documentUpload");

const STUDENTS = [
  { firstName: "Abbas", lastName: "Abdolahi" },
  { firstName: "Shichao", lastName: "GAO" },
];

async function inspect({ firstName, lastName }) {
  console.log(`\n════ ${firstName} ${lastName} ════`);
  const user = await User.findOne({
    firstName: new RegExp(`^${firstName}$`, "i"),
    lastName: new RegExp(`^${lastName}$`, "i"),
  });
  if (!user) return console.log("  User not found");
  console.log(`  User ${user._id} ${user.email}`);

  const apps = await Application.find({ userId: user._id })
    .populate("assignedAssessor", "firstName lastName")
    .sort({ createdAt: -1 });

  for (const app of apps) {
    console.log(`\n  Application ${app._id}`);
    console.log(`    overallStatus=${app.overallStatus}`);
    console.log(`    documentUploadId ref = ${app.documentUploadId}`);
    console.log(`    assessor = ${app.assignedAssessor ? app.assignedAssessor.firstName + " " + app.assignedAssessor.lastName : "NONE"}`);

    const records = await DocumentUpload.find({ applicationId: app._id });
    console.log(`    DocumentUpload records found by applicationId: ${records.length}`);

    for (const rec of records) {
      const isRef = app.documentUploadId && rec._id.toString() === app.documentUploadId.toString();
      console.log(`\n    ── Record ${rec._id}${isRef ? "  <== referenced by application.documentUploadId" : ""}`);
      console.log(`       userId=${rec.userId}  (matches student: ${rec.userId?.toString() === user._id.toString()})`);
      console.log(`       status=${rec.status}  verifiedBy=${rec.verifiedBy}  verifiedAt=${rec.verifiedAt}`);
      console.log(`       docs=${rec.documents.length}`);
      rec.documents.forEach((d, i) => {
        console.log(
          `         [${i}] ${d.documentType} | ${d.originalName} | vStatus=${d.verificationStatus} isVerified=${d.isVerified} verifiedBy=${d.verifiedBy || "-"} verifiedAt=${d.verifiedAt ? new Date(d.verifiedAt).toISOString() : "-"} uploadedAt=${d.uploadedAt ? new Date(d.uploadedAt).toISOString() : "-"}`
        );
      });
    }

    // which record does findOne (verify endpoint) actually pick?
    const first = await DocumentUpload.findOne({ applicationId: app._id });
    if (first) console.log(`\n    findOne({applicationId}) picks record: ${first._id}`);
  }
}

async function main() {
  await connectDB();
  for (const s of STUDENTS) await inspect(s);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
