// scripts/backfill-missed-emails.js
//
// Backtrack + resend emails that failed silently during an SMTP outage.
// Every controller swallows email errors, so the DB operations succeeded and
// each missed email can be reconstructed from the records themselves.
//
// Usage (run from CA_IO_BE/):
//   node scripts/backfill-missed-emails.js                     # AUDIT ONLY (no emails) — last 2 days
//   node scripts/backfill-missed-emails.js --days 3            # audit a wider window
//   node scripts/backfill-missed-emails.js --since 2026-07-22  # explicit start date
//   node scripts/backfill-missed-emails.js --send              # actually send (verifies SMTP first)
//   node scripts/backfill-missed-emails.js --send --only thirdparty,tpr-verification
//   node scripts/backfill-missed-emails.js --send --admin-notices   # also send admin notification copies
//
// Categories: registrations, invoices, coe, forms-submitted, forms-assessed,
//             documents, thirdparty, tpr-verification, certificates, surveys, bookings
//
// Audit mode is read-only. Send mode re-uses the exact same emailService2
// methods the controllers call, so recipients get identical emails, and it
// respects/updates the same dedupe flags (invoiceEmailSent, coeSent,
// employerEmailSent, ...) so it is safe to re-run.

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const mongoose = require("mongoose");

const Application = require("../models/application");
const Payment = require("../models/payment");
const FormSubmission = require("../models/formSubmission");
const DocumentUpload = require("../models/documentUpload");
const ThirdPartyFormSubmission = require("../models/thirdPartyFormSubmission");
const SurveyFormRequest = require("../models/surveyFormRequest");
const Booking = require("../models/booking");
const User = require("../models/user");
require("../models/certification");
require("../models/formTemplate");

const emailService = require("../services/emailService2");
const EmailHelpers = require("../utils/emailHelpers");
const surveyFormService = require("../services/surveyFormService");

// ---------------------------------------------------------------- CLI args
const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const hasFlag = (name) => args.includes(`--${name}`);

const SEND = hasFlag("send");
const ADMIN_NOTICES = hasFlag("admin-notices");
const ONLY = getArg("only") ? getArg("only").split(",").map((s) => s.trim()) : null;

const days = Number(getArg("days") || 2);
const since = getArg("since") ? new Date(getArg("since")) : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const until = getArg("until") ? new Date(getArg("until")) : new Date();

if (isNaN(since.getTime()) || isNaN(until.getTime())) {
  console.error("Invalid --since/--until date");
  process.exit(1);
}

const inWindow = (field) => ({ [field]: { $gte: since, $lte: until } });
const wantCategory = (cat) => !ONLY || ONLY.includes(cat);

// ---------------------------------------------------------------- reporting
const report = []; // { category, id, event, recipient, when, auto, note }
const sendResults = { sent: 0, failed: 0, skipped: 0, errors: [], rows: [] };

function record(category, id, event, recipient, when, auto, note = "") {
  report.push({
    category,
    id: String(id),
    event,
    recipient,
    when: when ? new Date(when).toISOString() : null,
    auto,
    note,
  });
}

async function doSend(label, fn) {
  if (!SEND) return;
  // labels are "email type → recipient"
  const parts = label.split(" → ");
  const type = parts[0] || label;
  const recipient = parts[1] || "-";
  try {
    await fn();
    sendResults.sent++;
    sendResults.rows.push({ recipient, type, status: "SENT" });
    console.log(`   ✅ ${recipient}  |  ${type}  |  SENT`);
  } catch (err) {
    sendResults.failed++;
    sendResults.errors.push({ label, error: err.message });
    sendResults.rows.push({ recipient, type, status: `FAILED (${err.message})` });
    console.error(`   ❌ ${recipient}  |  ${type}  |  FAILED — ${err.message}`);
  }
}

const fullName = (u) => (u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email : "?");

// ---------------------------------------------------------------- categories

async function auditRegistrations() {
  const apps = await Application.find(inWindow("createdAt"))
    .populate("userId", "firstName lastName email")
    .populate("certificationId", "name price baseExpectedSalary");

  for (const app of apps) {
    if (!app.userId) continue;
    record("registrations", app._id, "Welcome email (new application)", app.userId.email, app.createdAt, true,
      `${fullName(app.userId)} — ${app.certificationId?.name || "?"} (${app.appCode || app._id})`);
    await doSend(`welcome → ${app.userId.email}`, () =>
      emailService.sendWelcomeEmail(app.userId, app.certificationId));

    if (ADMIN_NOTICES) {
      record("registrations", app._id, "New-application notice to admins", "(all active admins)", app.createdAt, true);
      await doSend(`admin new-application notice (${app.appCode || app._id})`, async () => {
        const adminEmails = await EmailHelpers.getAdminEmails();
        for (const adminEmail of adminEmails) {
          await emailService.sendNewApplicationNotificationToAdmin(adminEmail, app.userId, app, app.certificationId);
        }
      });
    }
  }
}

async function auditPayments() {
  // Any payment touched in the window (covers completions and plan installments)
  const payments = await Payment.find({
    $or: [inWindow("completedAt"), inWindow("updatedAt")],
  })
    .populate("userId", "firstName lastName email")
    .populate({ path: "applicationId", populate: { path: "certificationId", select: "name" } });

  for (const p of payments) {
    if (!p.userId || !p.applicationId) continue;
    const label = `${fullName(p.userId)} — $${p.totalAmount} (${p.applicationId.appCode || p.applicationId._id})`;

    if (wantCategory("invoices") && p.status === "completed" && !p.invoiceEmailSent) {
      const gated = !["true", "1", "yes"].includes(
        String(process.env.PAYMENT_RELATED_EMAILS_ENABLED ?? process.env.PAYMENT_INVOICE_EMAILS_ENABLED ?? "true").toLowerCase());
      record("invoices", p._id, "Payment confirmation + invoice", p.userId.email, p.completedAt || p.updatedAt, !gated,
        label + (gated ? " — SKIPPED: payment emails disabled via PAYMENT_INVOICE_EMAILS_ENABLED" : ""));
      if (!gated) {
        await doSend(`invoice → ${p.userId.email}`, () =>
          EmailHelpers.sendPaymentConfirmationEmailIfNeeded(p.userId, p.applicationId, p));
      }
    }

    if (wantCategory("coe") && !p.coeSent) {
      record("coe", p._id, "COE email (if payment+enrolment qualify)", p.userId.email, p.updatedAt, true, label);
      // checkAndSendCOEIfReady re-checks qualification + enrolment form itself
      // and only marks coeSent when it actually sends.
      await doSend(`COE check → ${p.userId.email}`, () =>
        EmailHelpers.checkAndSendCOEIfReady(p.userId, p.applicationId, p));
    }
  }
}

async function auditFormsSubmitted() {
  const subs = await FormSubmission.find({
    ...inWindow("submittedAt"),
    filledBy: "user",
    status: { $in: ["submitted", "assessed"] },
  })
    .populate("userId", "firstName lastName email")
    .populate("applicationId", "appCode assignedAssessor")
    .populate("formTemplateId", "name");

  for (const s of subs) {
    if (!s.userId || !s.applicationId) continue;
    const formName = s.formTemplateId?.name || "Form";
    record("forms-submitted", s._id, `Form submission confirmation (${formName})`, s.userId.email, s.submittedAt, true,
      fullName(s.userId));
    await doSend(`form-submitted → ${s.userId.email} (${formName})`, () =>
      emailService.sendFormSubmissionEmail(s.userId, s.applicationId, formName));

    if (ADMIN_NOTICES && s.applicationId.assignedAssessor) {
      const assessor = await User.findById(s.applicationId.assignedAssessor).select("firstName lastName email");
      if (assessor) {
        record("forms-submitted", s._id, `Assessor notice (${formName})`, assessor.email, s.submittedAt, true);
        await doSend(`assessor form notice → ${assessor.email}`, () =>
          emailService.sendAssessorFormSubmittedNotice(assessor, s.userId, s.applicationId, formName));
      }
    }
  }
}

async function auditFormsAssessed() {
  const approvalEnabled = ["true", "1", "yes"].includes(
    String(process.env.FORM_APPROVAL_EMAIL_ENABLED ?? "false").toLowerCase());

  const subs = await FormSubmission.find({
    ...inWindow("assessedAt"),
    assessed: { $in: ["approved", "requires_changes"] },
  })
    .populate("userId", "firstName lastName email")
    .populate("applicationId", "appCode")
    .populate("formTemplateId", "name")
    .populate("assessedBy", "firstName lastName email");

  for (const s of subs) {
    if (!s.userId || !s.applicationId) continue;
    const formName = s.formTemplateId?.name || "Form";

    if (s.assessed === "requires_changes") {
      if (s.filledBy === "third-party") {
        // Change request goes to the employer/reference, not the student
        const tpForm = await ThirdPartyFormSubmission.findOne({
          applicationId: s.applicationId._id,
          formTemplateId: s.formTemplateId?._id,
        });
        if (tpForm) {
          const buildUrl = (token) => `${process.env.FRONTEND_URL}/thirdpartyform/${token}`;
          if (tpForm.isSameEmail && tpForm.combinedToken) {
            record("forms-assessed", s._id, `TPR change request (${formName})`, tpForm.employerEmail, s.assessedAt, true);
            await doSend(`TPR change request → ${tpForm.employerEmail}`, () =>
              emailService.sendThirdPartyChangeRequestEmail(
                tpForm.employerEmail, tpForm.employerName || tpForm.referenceName,
                "Employer Reference & Professional Reference", s.userId, formName,
                buildUrl(tpForm.combinedToken), s.assessorFeedback || ""));
          } else {
            record("forms-assessed", s._id, `TPR change request (${formName})`,
              `${tpForm.referenceEmail}, ${tpForm.employerEmail}`, s.assessedAt, true);
            await doSend(`TPR change request → ${tpForm.referenceEmail}`, () =>
              emailService.sendThirdPartyChangeRequestEmail(
                tpForm.referenceEmail, tpForm.referenceName, "Professional Reference",
                s.userId, formName, buildUrl(tpForm.referenceToken), s.assessorFeedback || ""));
            await doSend(`TPR change request → ${tpForm.employerEmail}`, () =>
              emailService.sendThirdPartyChangeRequestEmail(
                tpForm.employerEmail, tpForm.employerName, "Employer Reference",
                s.userId, formName, buildUrl(tpForm.employerToken), s.assessorFeedback || ""));
          }
        }
      } else {
        record("forms-assessed", s._id, `Resubmission required (${formName})`, s.userId.email, s.assessedAt, true,
          `feedback: ${(s.assessorFeedback || "").slice(0, 80)}`);
        await doSend(`resubmission-required → ${s.userId.email}`, () =>
          emailService.sendFormResubmissionRequiredEmail(s.userId, s.applicationId, formName, s.assessorFeedback || ""));
      }
    } else if (s.assessed === "approved") {
      record("forms-assessed", s._id, `Form approved (${formName})`, s.userId.email, s.assessedAt, approvalEnabled,
        approvalEnabled ? "" : "SKIPPED: FORM_APPROVAL_EMAIL_ENABLED is not true");
      if (approvalEnabled && s.assessedBy) {
        await doSend(`form-approved → ${s.userId.email}`, () =>
          emailService.sendFormApprovalEmail(s.userId, s.applicationId, formName, s.assessedBy));
      }
    }
  }
}

async function auditDocuments() {
  const docs = await DocumentUpload.find({
    $or: [inWindow("createdAt"), inWindow("updatedAt")],
  })
    .populate("userId", "firstName lastName email")
    .populate("applicationId", "appCode")
    .populate("verifiedBy", "firstName lastName email");

  for (const d of docs) {
    if (!d.userId || !d.applicationId) continue;

    if (d.status === "pending" && d.createdAt >= since) {
      record("documents", d._id, "Documents submitted confirmation", d.userId.email, d.createdAt, true,
        "NOTE: original send was conditional on evidence completeness — review before sending");
      await doSend(`documents-submitted → ${d.userId.email}`, () =>
        emailService.sendDocumentSubmissionEmail(d.userId, d.applicationId, "Documents"));
    }

    if (d.verifiedAt && d.verifiedAt >= since && d.verifiedAt <= until && d.verifiedBy) {
      if (d.status === "verified") {
        record("documents", d._id, "Documents verified", d.userId.email, d.verifiedAt, true);
        await doSend(`documents-verified → ${d.userId.email}`, () =>
          emailService.sendDocumentVerificationEmail(d.userId, d.applicationId, d.verifiedBy, "verified"));
      } else if (["rejected", "requires_update", "flagged_for_resubmission"].includes(d.status)) {
        record("documents", d._id, "Documents resubmission required", d.userId.email, d.verifiedAt, true);
        await doSend(`documents-rejected → ${d.userId.email}`, () =>
          emailService.sendDocumentVerificationEmail(d.userId, d.applicationId, d.verifiedBy, "rejected",
            d.rejectionReason || d.notes || ""));
      }
    }
  }
}

async function auditThirdParty() {
  // Initial employer/reference form emails for TPR records created in the window,
  // plus any active record whose email flags never got set.
  const tprs = await ThirdPartyFormSubmission.find({
    isActive: true,
    expiresAt: { $gt: new Date() },
    $or: [
      inWindow("createdAt"),
      { employerEmailSent: false, combinedEmailSent: false },
    ],
  })
    .populate("userId", "firstName lastName email")
    .populate("formTemplateId", "name");

  for (const t of tprs) {
    if (!t.userId || !t.formTemplateId) continue;
    const buildUrl = (token) => `${process.env.FRONTEND_URL}/thirdpartyform/${token}`;
    const student = fullName(t.userId);

    if (t.isSameEmail) {
      if (t.combinedSubmission?.isSubmitted) continue; // already actioned
      record("thirdparty", t._id, `Third-party form (combined) — ${t.formTemplateId.name}`, t.employerEmail,
        t.createdAt, true, `student: ${student}${t.combinedEmailSent ? " (was sent before — resend)" : " (NEVER sent)"}`);
      await doSend(`thirdparty-combined → ${t.employerEmail}`, async () => {
        await emailService.sendThirdPartyCombinedEmail(
          t.employerEmail, t.employerName, t.referenceName, t.userId, t.formTemplateId, buildUrl(t.combinedToken));
        t.combinedEmailSent = true;
        await t.save();
      });
    } else {
      if (!t.employerSubmission?.isSubmitted) {
        record("thirdparty", t._id, `Third-party form (employer) — ${t.formTemplateId.name}`, t.employerEmail,
          t.createdAt, true, `student: ${student}${t.employerEmailSent ? " (was sent before — resend)" : " (NEVER sent)"}`);
        await doSend(`thirdparty-employer → ${t.employerEmail}`, async () => {
          await emailService.sendThirdPartyEmployerEmail(
            t.employerEmail, t.employerName, t.userId, t.formTemplateId, buildUrl(t.employerToken));
          t.employerEmailSent = true;
          await t.save();
        });
      }
      if (!t.referenceSubmission?.isSubmitted) {
        record("thirdparty", t._id, `Third-party form (reference) — ${t.formTemplateId.name}`, t.referenceEmail,
          t.createdAt, true, `student: ${student}${t.referenceEmailSent ? " (was sent before — resend)" : " (NEVER sent)"}`);
        await doSend(`thirdparty-reference → ${t.referenceEmail}`, async () => {
          await emailService.sendThirdPartyReferenceEmail(
            t.referenceEmail, t.referenceName, t.userId, t.formTemplateId, buildUrl(t.referenceToken));
          t.referenceEmailSent = true;
          await t.save();
        });
      }
    }
  }
}

async function auditTprVerification() {
  // Verification emails attempted in the window that never got a reply.
  // We resend the exact stored subject/content so the short code still matches
  // what the IMAP poller looks for.
  const targets = ["employer", "reference", "combined", "verifier"];
  const or = targets.map((t) => ({
    [`verification.${t}.sentAt`]: { $gte: since, $lte: until },
    [`verification.${t}.status`]: "pending",
    [`verification.${t}.verifiedAt`]: null,
  }));
  const tprs = await ThirdPartyFormSubmission.find({ $or: or })
    .populate("userId", "firstName lastName email");

  for (const t of tprs) {
    for (const target of targets) {
      const v = t.verification?.[target];
      if (!v || v.status !== "pending" || v.verifiedAt) continue;
      if (!v.sentAt || v.sentAt < since || v.sentAt > until) continue;

      const to = target === "reference" ? t.referenceEmail : t.employerEmail;
      const hasStored = !!(v.lastSentSubject && v.lastSentContent);

      if (target === "verifier" || !hasStored || !to) {
        record("tpr-verification", t._id, `TPR verification (${target})`, to || "?", v.sentAt, false,
          "MANUAL: resend from admin UI (POST /api/third-party-forms/:tprId/verification/send)");
        continue;
      }

      record("tpr-verification", t._id, `TPR verification (${target}) — code ${t.verification.shortCode || "?"}`,
        to, v.sentAt, true, `student: ${fullName(t.userId)}`);
      await doSend(`tpr-verification(${target}) → ${to}`, async () => {
        const result = await emailService.sendEmail(to, v.lastSentSubject, v.lastSentContent);
        if (result?.messageId) {
          t.verification[target].lastSentMessageId = result.messageId;
          t.verification[target].sentAt = new Date();
          await t.save();
        }
      });
    }
  }
}

async function auditCertificates() {
  const apps = await Application.find(inWindow("finalCertificate.uploadedAt"))
    .populate("userId", "firstName lastName email")
    .populate("certificationId", "name description");

  if (apps.length === 0) return;
  const { generatePresignedUrl } = require("../config/s3Config");

  for (const app of apps) {
    if (!app.userId || !app.finalCertificate?.s3Key) continue;
    record("certificates", app._id, "Certificate ready + download link", app.userId.email,
      app.finalCertificate.uploadedAt, true, `${fullName(app.userId)} — ${app.certificationId?.name || "?"}`);
    await doSend(`certificate → ${app.userId.email}`, async () => {
      const certificateDetails = {
        certificateId: app.finalCertificate.certificateNumber,
        certificationName: app.certificationId?.name,
        downloadUrl: await generatePresignedUrl(app.finalCertificate.s3Key),
        issueDate: app.finalCertificate.uploadedAt,
        expiryDate: app.finalCertificate.expiryDate,
        grade: app.finalCertificate.grade,
        _id: app._id,
      };
      await emailService.sendCertificateDownloadEmail(app.userId, app, certificateDetails);
    });
  }
}

async function auditSurveys() {
  const reqs = await SurveyFormRequest.find({
    ...inWindow("createdAt"),
    status: "pending",
  })
    .populate("userId", "firstName lastName email")
    .populate("applicationId");

  for (const r of reqs) {
    if (!r.userId || !r.applicationId) continue;
    record("surveys", r._id, "Survey form request", r.userId.email, r.createdAt, true,
      r.sentAt ? "" : "NEVER sent (sentAt empty)");
    // issueSurveyFormForApplication reuses the existing pending request/token
    await doSend(`survey → ${r.userId.email}`, () =>
      surveyFormService.issueSurveyFormForApplication(r.applicationId, r.userId));
  }
}

async function auditBookings() {
  const bookings = await Booking.find({
    $or: [inWindow("createdAt"), inWindow("updatedAt")],
  })
    .populate("studentId", "firstName lastName email")
    .populate("assessorId", "firstName lastName email")
    .populate("applicationId", "appCode");

  for (const b of bookings) {
    if (!b.studentId) continue;
    if (b.status === "scheduled" && b.createdAt >= since) {
      record("bookings", b._id, "Booking scheduled", `${b.studentId.email}, ${b.assessorId?.email || "?"}`,
        b.createdAt, true, `${new Date(b.scheduledStart).toLocaleString("en-AU")}`);
      await doSend(`booking-scheduled → ${b.studentId.email}`, () =>
        emailService.sendBookingScheduledEmail(b.studentId.email, b.studentId, b, b.applicationId));
      if (b.assessorId?.email) {
        await doSend(`booking-scheduled → ${b.assessorId.email}`, () =>
          emailService.sendBookingScheduledEmail(b.assessorId.email, b.assessorId, b, b.applicationId, { isAssessor: true }));
      }
    } else if (b.updatedAt >= since && ["reschedule_requested", "rescheduled", "rejected", "cancelled"].includes(b.status)) {
      record("bookings", b._id, `Booking ${b.status}`, `${b.studentId.email}, ${b.assessorId?.email || "?"}`,
        b.updatedAt, false, "MANUAL: re-trigger from the booking UI if still relevant");
    }
  }
}

async function auditPasswordResets() {
  const users = await User.find({ resetPasswordExpires: { $gte: since } })
    .select("firstName lastName email resetPasswordExpires");
  for (const u of users) {
    record("password-resets", u._id, "Password reset link", u.email, u.resetPasswordExpires, false,
      "NOT resendable — token expired (1h). User must request a new reset; that will work once SMTP is fixed.");
  }
}

// ---------------------------------------------------------------- main
(async () => {
  console.log(`\n=== Missed-email ${SEND ? "RESEND" : "AUDIT (dry-run)"} ===`);
  console.log(`Window: ${since.toISOString()} → ${until.toISOString()}`);
  if (ONLY) console.log(`Categories: ${ONLY.join(", ")}`);

  if (SEND) {
    console.log("\nVerifying SMTP before sending anything...");
    try {
      await emailService.transporter.verify();
      console.log("✅ SMTP login OK — proceeding.\n");
    } catch (err) {
      console.error(`❌ SMTP verify failed: ${err.message}`);
      console.error("Fix the credentials in .env first (run: node test-smtp-config.js). Nothing was sent.");
      process.exit(1);
    }
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB.\n");

  const categories = [
    ["registrations", auditRegistrations],
    ["invoices", auditPayments], // handles both invoices + coe internally
    ["forms-submitted", auditFormsSubmitted],
    ["forms-assessed", auditFormsAssessed],
    ["documents", auditDocuments],
    ["thirdparty", auditThirdParty],
    ["tpr-verification", auditTprVerification],
    ["certificates", auditCertificates],
    ["surveys", auditSurveys],
    ["bookings", auditBookings],
    ["password-resets", auditPasswordResets],
  ];

  for (const [name, fn] of categories) {
    // auditPayments covers "invoices" and "coe"
    const relevant = name === "invoices" ? (wantCategory("invoices") || wantCategory("coe")) : wantCategory(name);
    if (!relevant) continue;
    try {
      await fn();
    } catch (err) {
      console.error(`Error in category ${name}:`, err.message);
    }
  }

  // ------------------------------------------------------------- output
  const byCat = {};
  for (const r of report) (byCat[r.category] ||= []).push(r);

  console.log(`\n================ REPORT ================`);
  for (const [cat, items] of Object.entries(byCat)) {
    console.log(`\n--- ${cat} (${items.length}) ---`);
    for (const r of items) {
      const flag = r.auto ? "AUTO" : "MANUAL";
      console.log(`  [${flag}] ${r.event}`);
      console.log(`         to: ${r.recipient}   at: ${r.when}   id: ${r.id}`);
      if (r.note) console.log(`         ${r.note}`);
    }
  }
  console.log(`\nTotal missed-email candidates: ${report.length}`);
  console.log(`  auto-resendable: ${report.filter((r) => r.auto).length}`);
  console.log(`  manual/not-resendable: ${report.filter((r) => !r.auto).length}`);

  if (SEND) {
    console.log(`\n================ SEND RESULTS ================`);
    const w = Math.max(...sendResults.rows.map((r) => r.recipient.length), 10);
    for (const r of sendResults.rows) {
      console.log(`  ${r.recipient.padEnd(w)}  ${r.type.padEnd(32)}  ${r.status}`);
    }
    console.log(`\n${sendResults.sent} sent, ${sendResults.failed} failed`);
  } else {
    console.log(`\n(DRY RUN — nothing was sent. Re-run with --send once SMTP works.)`);
  }

  const fs = require("fs");
  const outPath = path.join(__dirname, "missed-emails-report.json");
  fs.writeFileSync(outPath, JSON.stringify({ since, until, generatedAt: new Date(), report, sendResults }, null, 2));
  console.log(`JSON report written to ${outPath}\n`);

  await mongoose.disconnect();
  process.exit(sendResults.failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
