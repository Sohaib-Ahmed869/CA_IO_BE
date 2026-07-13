require("dotenv").config({ override: true });
const mongoose = require("mongoose");
const connectDB = require("./config/database");

const User = require("./models/user");
const Application = require("./models/application");
const DocumentUpload = require("./models/documentUpload");

async function main() {
  await connectDB();

  const user = await User.findOne({
    firstName: new RegExp("^Jun$", "i"),
    lastName: new RegExp("^DENG$", "i"),
  });
  if (!user) { console.log("User not found"); return process.exit(1); }
  console.log(`User: ${user.firstName} ${user.lastName} (${user._id})`);

  const app = await Application.findOne({ userId: user._id })
    .populate("assignedAssessor", "firstName lastName")
    .sort({ createdAt: -1 });
  if (!app) { console.log("No application"); return process.exit(1); }
  if (!app.assignedAssessor) { console.log("No assessor assigned"); return process.exit(1); }

  const assessorId = app.assignedAssessor._id;
  console.log(`Application ${app._id}  overallStatus=${app.overallStatus}  assessor=${app.assignedAssessor.firstName} ${app.assignedAssessor.lastName}`);

  const du = await DocumentUpload.findOne({ applicationId: app._id });
  if (!du) { console.log("No DocumentUpload"); return process.exit(1); }

  const before = du.documents.filter((d) => d.verificationStatus !== "verified").length;
  const now = new Date();
  du.documents.forEach((doc) => {
    doc.verificationStatus = "verified";
    doc.isVerified = true;
    doc.verifiedBy = assessorId;
    doc.verifiedAt = now;
    doc.rejectionReason = null;
  });
  du.status = "verified";
  du.verifiedBy = assessorId;
  du.verifiedAt = now;
  du.rejectionReason = null;
  await du.save();
  console.log(`  ✓ Verified ${before} previously-pending doc(s); DocumentUpload → verified (total ${du.documents.length})`);

  await Application.findByIdAndUpdate(app._id, { overallStatus: "assessment_completed" });
  console.log(`  ✓ Application overallStatus → assessment_completed`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
