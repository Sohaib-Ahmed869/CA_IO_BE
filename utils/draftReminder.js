// utils/draftReminder.js
//
// Nudges third parties who started a form, saved their progress, and never
// came back to submit it.
//
// Deliberately not a cron framework: one query a day, and an email only to
// people who have actually saved something and not finished. A party is
// reminded at most once every 24 hours, and never again once they submit.

const ThirdPartyFormSubmission = require("../models/thirdPartyFormSubmission");
const emailService = require("../services/emailService2");

const DAY_MS = 24 * 60 * 60 * 1000;

const isEnabled = () =>
  String(process.env.DRAFT_REMINDERS_ENABLED ?? "true").toLowerCase() !== "false";

// Each party the form can be waiting on, and where their details live.
const PARTIES = [
  { key: "combinedSubmission", tokenField: "combinedToken", nameField: "employerName", emailField: "employerEmail" },
  { key: "employerSubmission", tokenField: "employerToken", nameField: "employerName", emailField: "employerEmail" },
  { key: "referenceSubmission", tokenField: "referenceToken", nameField: "referenceName", emailField: "referenceEmail" },
];

const reminderHtml = ({ recipientName, studentName, qualification, link, savedAt }) => `
  <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.55">
    <h2 style="margin:0 0 14px">Your form is saved and waiting</h2>
    <p style="margin:0 0 12px">Hi ${recipientName || "there"},</p>
    <p style="margin:0 0 12px">
      Thank you for starting the third-party evidence form${
        studentName ? ` for <strong>${studentName}</strong>` : ""
      }${qualification ? ` (${qualification})` : ""}.
    </p>
    <p style="margin:0 0 12px">
      Your answers were saved on ${savedAt}, but the form hasn't been submitted yet.
      Everything you entered is still there — open the same link and carry on from
      where you left off.
    </p>
    <p style="margin:22px 0">
      <a href="${link}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">
        Continue the form
      </a>
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:13px">
      The student's application can't move forward until this is submitted. If you
      have already finished it, please ignore this message.
    </p>
  </div>`;

/**
 * One sweep. Returns a small summary so the caller can log it.
 */
async function runDraftReminderSweep() {
  if (!isEnabled()) return { skipped: true };

  const now = new Date();
  const cutoff = new Date(now.getTime() - DAY_MS);

  // Only forms still open, and only those where somebody has saved something.
  const candidates = await ThirdPartyFormSubmission.find({
    status: { $ne: "completed" },
    $and: [
      { $or: [{ isActive: true }, { isActive: { $exists: false } }] },
      { $or: [{ expiresAt: { $gt: now } }, { expiresAt: { $exists: false } }] },
    ],
    $or: [
      { "employerSubmission.lastSavedAt": { $lte: cutoff } },
      { "referenceSubmission.lastSavedAt": { $lte: cutoff } },
      { "combinedSubmission.lastSavedAt": { $lte: cutoff } },
    ],
  })
    .populate("userId", "firstName lastName")
    .populate("applicationId", "certificationId")
    .lean();

  let sent = 0;
  let skipped = 0;

  for (const form of candidates) {
    const studentName = form.userId
      ? `${form.userId.firstName || ""} ${form.userId.lastName || ""}`.trim()
      : "";

    for (const party of PARTIES) {
      const sub = form[party.key];
      if (!sub || !sub.lastSavedAt || sub.isSubmitted) continue;

      // A draft that is still fresh, or someone reminded within the day.
      if (new Date(sub.lastSavedAt) > cutoff) { skipped += 1; continue; }
      if (sub.lastReminderAt && new Date(sub.lastReminderAt) > cutoff) { skipped += 1; continue; }

      const to = form[party.emailField];
      const token = form[party.tokenField];
      if (!to || !token) { skipped += 1; continue; }

      const link = `${String(process.env.FRONTEND_URL || "").replace(/\/+$/, "")}/thirdpartyform/${token}`;

      try {
        await emailService.sendEmail(
          to,
          "Your saved form is waiting to be completed",
          reminderHtml({
            recipientName: form[party.nameField],
            studentName,
            qualification: form.applicationId?.certificationId?.name,
            link,
            savedAt: new Date(sub.lastSavedAt).toLocaleDateString("en-AU", {
              day: "numeric", month: "long", year: "numeric",
            }),
          })
        );

        // Stamp only after a successful send, so a failure retries tomorrow
        // rather than silently skipping this party for good.
        await ThirdPartyFormSubmission.updateOne(
          { _id: form._id },
          { $set: { [`${party.key}.lastReminderAt`]: new Date() } }
        );
        sent += 1;
      } catch (error) {
        console.error(
          `[draft-reminder] send failed for ${to} on ${form._id}:`,
          error.message
        );
      }
    }
  }

  return { candidates: candidates.length, sent, skipped };
}

/**
 * Schedule one sweep a day. The first runs a few minutes after boot so a
 * restart never fires a burst of email, and so a crash-looping process cannot
 * spam anyone.
 */
function startDraftReminders() {
  if (!isEnabled()) {
    console.log("[draft-reminder] disabled (DRAFT_REMINDERS_ENABLED=false)");
    return null;
  }

  const run = async () => {
    try {
      const result = await runDraftReminderSweep();
      console.log("[draft-reminder] sweep:", JSON.stringify(result));
    } catch (error) {
      console.error("[draft-reminder] sweep failed:", error.message);
    }
  };

  setTimeout(run, 5 * 60 * 1000);
  const timer = setInterval(run, DAY_MS);
  if (timer.unref) timer.unref();
  console.log("[draft-reminder] scheduled: one sweep every 24h");
  return timer;
}

module.exports = { startDraftReminders, runDraftReminderSweep };
