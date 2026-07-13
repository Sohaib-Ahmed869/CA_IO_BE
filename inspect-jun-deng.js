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

  if (!user) {
    console.log("User not found");
    return process.exit(0);
  }
  console.log(`User: ${user.firstName} ${user.lastName} (${user._id}) email=${user.email}`);

  const apps = await Application.find({ userId: user._id })
    .populate("assignedAssessor", "firstName lastName")
    .sort({ createdAt: -1 });

  for (const app of apps) {
    console.log(`\nApplication ${app._id} overallStatus=${app.overallStatus} assessor=${app.assignedAssessor ? app.assignedAssessor.firstName + " " + app.assignedAssessor.lastName : "NONE"}`);
    const du = await DocumentUpload.find({ applicationId: app._id });
    for (const d of du) {
      console.log(`  DocumentUpload ${d._id} status=${d.status} docs=${d.documents.length}`);
      const counts = {};
      d.documents.forEach((doc) => {
        counts[doc.verificationStatus] = (counts[doc.verificationStatus] || 0) + 1;
      });
      console.log(`    verificationStatus breakdown:`, JSON.stringify(counts));
      // show any non-verified docs
      d.documents
        .filter((doc) => doc.verificationStatus !== "verified")
        .slice(0, 20)
        .forEach((doc) =>
          console.log(`      [${doc.verificationStatus}] ${doc.documentType} ${doc.originalName} isVerified=${doc.isVerified}`)
        );
    }
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
