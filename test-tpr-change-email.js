// Quick manual test for the third-party "changes requested" email.
// Sends ONE real email via the configured SMTP provider. No DB writes.
//
// Usage:
//   node test-tpr-change-email.js you@example.com
//
require("dotenv").config({ override: true });
const emailService = require("./services/emailService2");

const to = process.argv[2];
if (!to) {
  console.error("Usage: node test-tpr-change-email.js <recipient-email>");
  process.exit(1);
}

(async () => {
  try {
    const info = await emailService.sendThirdPartyChangeRequestEmail(
      to,                                   // recipientEmail
      "Test Referee",                       // recipientName
      "Referee",                            // roleLabel
      { firstName: "Lei", lastName: "Huang" }, // student
      "Third Party Report",                 // formName
      "https://example.com/third-party-form?token=TEST_TOKEN", // formUrl (real token in prod)
      "Please clarify the employment dates in section 2 and resubmit." // feedback
    );
    console.log("Sent OK:", info && info.messageId ? info.messageId : info);
    process.exit(0);
  } catch (err) {
    console.error("Send FAILED:", err);
    process.exit(1);
  }
})();
