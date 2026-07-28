// scripts/setup-tpr-resubmission-test.js
//
// TEST HELPER: put an existing third-party form into the "assessor requested
// changes" state so the resubmission flow can be exercised end-to-end without
// clicking through the assessor UI. Mirrors exactly what
// assessmentController.assessFormSubmission does for requires_changes
// (no emails are sent). Prints the third-party link at the end.
//
// Usage (from CA_IO_BE/):
//   node scripts/setup-tpr-resubmission-test.js --tpr <tprId> [--third-party-email x@y.com] [--feedback "..."]

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const mongoose = require("mongoose");
const ThirdPartyFormSubmission = require("../models/thirdPartyFormSubmission");
const FormSubmission = require("../models/formSubmission");
require("../models/formTemplate");
const { isAssessorOnly } = require("../utils/assessorFieldDetector");

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};

const TPR_ID = getArg("tpr");
const THIRD_PARTY_EMAIL = getArg("third-party-email");
const FEEDBACK =
  getArg("feedback") ||
  "Thanks for your reference. A couple of answers need more detail before we can accept it — please update the flagged questions below and resubmit.";

async function main() {
  if (!TPR_ID) {
    console.error("Usage: node scripts/setup-tpr-resubmission-test.js --tpr <tprId> [--third-party-email x@y.com]");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const tpr = await ThirdPartyFormSubmission.findById(TPR_ID).populate("formTemplateId");
  if (!tpr) {
    console.error("TPR record not found:", TPR_ID);
    process.exit(1);
  }

  const submission = await FormSubmission.findOne({
    applicationId: tpr.applicationId,
    formTemplateId: tpr.formTemplateId._id,
    filledBy: "third-party",
  });
  if (!submission) {
    console.error("No third-party FormSubmission found for this TPR (the form must have been submitted once first).");
    process.exit(1);
  }

  const answersSource = tpr.isSameEmail
    ? tpr.combinedSubmission?.formData
    : tpr.employerSubmission?.formData;
  const answerCount =
    answersSource instanceof Map
      ? answersSource.size
      : Object.keys(answersSource || {}).length;
  console.log(`TPR ${tpr._id} | form: ${tpr.formTemplateId.name.trim()}`);
  console.log(`Stored third-party answers: ${answerCount}`);
  if (answerCount === 0) {
    console.error("This TPR has no stored answers — pick one that was actually submitted.");
    process.exit(1);
  }

  // Pick the first two flaggable questions (skip assessor-only and display-only)
  const flagged = [];
  for (const section of tpr.formTemplateId.formStructure || []) {
    if (isAssessorOnly(section)) continue;
    for (const field of section.fields || []) {
      if (flagged.length >= 2) break;
      if (isAssessorOnly(field)) continue;
      if (["label", "info", "table"].includes(field.fieldType)) continue;
      if (!field.fieldName) continue;
      flagged.push({
        fieldName: field.fieldName,
        label: field.label || field.fieldName,
        note:
          flagged.length === 0
            ? "Please provide more specific detail here."
            : "This answer looks incomplete — please redo it.",
      });
    }
    if (flagged.length >= 2) break;
  }
  console.log("Flagging questions:");
  flagged.forEach((f) => console.log(`  - ${f.label} (${f.fieldName})`));

  // Update third-party contact email if requested (keeps same-email/combined mode)
  if (THIRD_PARTY_EMAIL) {
    tpr.employerEmail = THIRD_PARTY_EMAIL.toLowerCase();
    tpr.referenceEmail = THIRD_PARTY_EMAIL.toLowerCase();
    console.log(`Third-party email set to ${THIRD_PARTY_EMAIL}`);
  }

  // --- Mirror assessmentController.assessFormSubmission (requires_changes) ---
  submission.assessed = "requires_changes";
  submission.status = "assessed";
  submission.assessedAt = new Date();
  submission.assessorFeedback = FEEDBACK;
  submission.resubmissionRequired = true;
  submission.resubmissionDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  submission.resubmissionFields = flagged;
  submission.previousVersions.push({
    formData: submission.formData,
    submittedAt: submission.submittedAt,
    version: submission.version,
  });
  await submission.save();

  // Re-open the TPR keeping the answers, exactly like the controller does
  tpr.status = "pending";
  const minExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  if (!tpr.expiresAt || tpr.expiresAt < minExpiry) tpr.expiresAt = minExpiry;
  tpr.isActive = true;
  if (tpr.employerSubmission) tpr.employerSubmission.isSubmitted = false;
  if (tpr.referenceSubmission) tpr.referenceSubmission.isSubmitted = false;
  if (tpr.combinedSubmission) tpr.combinedSubmission.isSubmitted = false;
  await tpr.save();

  const token = tpr.isSameEmail && tpr.combinedToken ? tpr.combinedToken : tpr.employerToken;
  console.log("\n=== TEST READY ===");
  console.log(`FormSubmission ${submission._id}: requires_changes, ${flagged.length} question(s) flagged, deadline ${submission.resubmissionDeadline.toISOString().slice(0, 10)}`);
  console.log(`\nThird-party link:\n${process.env.FRONTEND_URL}/thirdpartyform/${token}\n`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
