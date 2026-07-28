// scripts/get-tpr-links.js
//
// Print the secure third-party (TPR) form links for a student so they can be
// copied and sent manually — e.g. when the automated change-request email
// never reached the employer/referee. Read-only by default; pass --extend to
// also bump expiry to 30 days out and reactivate the record so old links work.
//
// Usage (run from CA_IO_BE/):
//   node scripts/get-tpr-links.js --email student@example.com
//   node scripts/get-tpr-links.js --email student@example.com --extend
//   node scripts/get-tpr-links.js --all-pending          # every TPR awaiting (re)submission
//   node scripts/get-tpr-links.js --all-pending --extend

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const mongoose = require("mongoose");

const ThirdPartyFormSubmission = require("../models/thirdPartyFormSubmission");
const FormSubmission = require("../models/formSubmission");
const User = require("../models/user");
require("../models/formTemplate");
require("../models/application");

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const hasFlag = (name) => args.includes(`--${name}`);

const EMAIL = getArg("email");
const ALL_PENDING = hasFlag("all-pending");
const EXTEND = hasFlag("extend");

const FRONTEND_URL = process.env.FRONTEND_URL || "";
const buildUrl = (token) => `${FRONTEND_URL}/thirdpartyform/${token}`;

async function main() {
  if (!EMAIL && !ALL_PENDING) {
    console.error("Usage: node scripts/get-tpr-links.js --email <student email> [--extend]");
    console.error("       node scripts/get-tpr-links.js --all-pending [--extend]");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const query = {};
  if (EMAIL) {
    const user = await User.findOne({
      email: new RegExp(`^${EMAIL.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    });
    if (!user) {
      console.error(`No user found with email ${EMAIL}`);
      process.exit(1);
    }
    query.userId = user._id;
    console.log(`Student: ${user.firstName} ${user.lastName} <${user.email}>\n`);
  } else {
    query.status = { $ne: "completed" };
  }

  const forms = await ThirdPartyFormSubmission.find(query)
    .populate("formTemplateId", "name")
    .populate("userId", "firstName lastName email")
    .sort({ createdAt: -1 });

  if (forms.length === 0) {
    console.log("No third-party form records found.");
    process.exit(0);
  }

  for (const tp of forms) {
    const linkedSubmission = await FormSubmission.findOne({
      applicationId: tp.applicationId,
      formTemplateId: tp.formTemplateId?._id || tp.formTemplateId,
      filledBy: "third-party",
    }).select("resubmissionRequired resubmissionDeadline resubmissionFields assessorFeedback");

    if (EXTEND) {
      const minExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      let changed = false;
      if (!tp.expiresAt || tp.expiresAt < minExpiry) {
        tp.expiresAt = minExpiry;
        changed = true;
      }
      if (tp.isActive === false) {
        tp.isActive = true;
        changed = true;
      }
      if (changed) await tp.save();
    }

    const expired = tp.expiresAt && tp.expiresAt < new Date();
    console.log("=".repeat(70));
    console.log(`Form:      ${tp.formTemplateId?.name || tp.formTemplateId}`);
    console.log(`Student:   ${tp.userId?.firstName || ""} ${tp.userId?.lastName || ""} <${tp.userId?.email || ""}>`);
    console.log(`Status:    ${tp.status}${expired ? "  (LINK EXPIRED — rerun with --extend)" : ""}`);
    console.log(`Expires:   ${tp.expiresAt ? tp.expiresAt.toISOString() : "-"}`);
    if (linkedSubmission?.resubmissionRequired) {
      console.log(`Resubmission required: YES (deadline ${linkedSubmission.resubmissionDeadline ? linkedSubmission.resubmissionDeadline.toISOString().slice(0, 10) : "-"})`);
      if (linkedSubmission.assessorFeedback) {
        console.log(`Assessor feedback: ${linkedSubmission.assessorFeedback}`);
      }
      for (const f of linkedSubmission.resubmissionFields || []) {
        console.log(`  - Flagged: ${f.label || f.fieldName}${f.note ? ` — ${f.note}` : ""}`);
      }
    }
    if (tp.isSameEmail && tp.combinedToken) {
      console.log(`\n  Combined (employer + reference): ${tp.employerName || tp.referenceName} <${tp.employerEmail}>`);
      console.log(`  ${buildUrl(tp.combinedToken)}`);
    } else {
      console.log(`\n  Employer:  ${tp.employerName} <${tp.employerEmail}>  submitted: ${tp.employerSubmission?.isSubmitted === true}`);
      console.log(`  ${buildUrl(tp.employerToken)}`);
      console.log(`\n  Reference: ${tp.referenceName} <${tp.referenceEmail}>  submitted: ${tp.referenceSubmission?.isSubmitted === true}`);
      console.log(`  ${buildUrl(tp.referenceToken)}`);
    }
    console.log("");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
