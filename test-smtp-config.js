// Standalone SMTP credential check — mirrors the transport config built in
// services/emailService2.js so a passing verify() here means the app can send.
// Usage:
//   node test-smtp-config.js                  → verify login only
//   node test-smtp-config.js --send you@x.com → verify login and send a test email
require("dotenv").config({ override: true });
const nodemailer = require("nodemailer");

function buildConfig() {
  const provider = (process.env.EMAIL_PROVIDER || "").toLowerCase();
  let smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpAuthMethod;

  if (provider === "outlook" || provider === "office365" || provider === "microsoft") {
    smtpHost = process.env.SMTP_HOST || "smtp-mail.outlook.com";
    smtpPort = Number(process.env.SMTP_PORT || 587);
    smtpSecure = typeof process.env.SMTP_SECURE === "string"
      ? process.env.SMTP_SECURE.toLowerCase() === "true"
      : false;
    if (smtpPort !== 465) smtpSecure = false;
    smtpUser = process.env.OUTLOOK_USER || process.env.SMTP_USER;
    smtpPass = process.env.OUTLOOK_APP_PASSWORD || process.env.OUTLOOK_PASSWORD || process.env.SMTP_PASS;
    smtpAuthMethod = process.env.SMTP_AUTH_METHOD || "LOGIN";
  } else if (provider === "gmail") {
    smtpHost = "smtp.gmail.com";
    smtpPort = Number(process.env.SMTP_PORT || 465);
    smtpSecure = typeof process.env.SMTP_SECURE === "string"
      ? process.env.SMTP_SECURE.toLowerCase() === "true"
      : smtpPort === 465;
    smtpUser = process.env.GMAIL_USER || process.env.SMTP_USER;
    smtpPass = process.env.GMAIL_APP_PASSWORD || process.env.GOOGLE_APP_PASSWORD || process.env.SMTP_PASS;
    smtpAuthMethod = process.env.SMTP_AUTH_METHOD || "LOGIN";
  } else {
    smtpHost = process.env.SMTP_HOST || "smtp.zoho.com";
    smtpPort = Number(process.env.SMTP_PORT || 587);
    smtpSecure = typeof process.env.SMTP_SECURE === "string"
      ? process.env.SMTP_SECURE.toLowerCase() === "true"
      : smtpPort === 465;
    smtpUser = process.env.SMTP_USER || process.env.ZOHO_USER;
    smtpPass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || process.env.ZOHO_APP_PASSWORD || "";
    smtpAuthMethod = process.env.SMTP_AUTH_METHOD || "LOGIN";
  }

  return { provider: provider || "(default/zoho)", smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpAuthMethod };
}

function maskedSource() {
  if (process.env.OUTLOOK_APP_PASSWORD) return "OUTLOOK_APP_PASSWORD";
  if (process.env.OUTLOOK_PASSWORD) return "OUTLOOK_PASSWORD";
  if (process.env.GMAIL_APP_PASSWORD) return "GMAIL_APP_PASSWORD";
  if (process.env.SMTP_PASS) return "SMTP_PASS";
  return "(none found)";
}

async function main() {
  const cfg = buildConfig();
  console.log("SMTP configuration under test:");
  console.log(`  provider: ${cfg.provider}`);
  console.log(`  host:     ${cfg.smtpHost}:${cfg.smtpPort} (secure=${cfg.smtpSecure}, auth=${cfg.smtpAuthMethod})`);
  console.log(`  user:     ${cfg.smtpUser}`);
  console.log(`  password: ${cfg.smtpPass ? `${cfg.smtpPass.length} chars from ${maskedSource()}` : "MISSING"}`);

  if (!cfg.smtpUser || !cfg.smtpPass) {
    console.error("\n❌ Missing SMTP user or password in environment — check .env");
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpSecure,
    auth: { user: cfg.smtpUser, pass: cfg.smtpPass, method: cfg.smtpAuthMethod },
    requireTLS: !cfg.smtpSecure,
    tls: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });

  try {
    await transporter.verify();
    console.log("\n✅ SMTP login OK — the app should be able to send email.");
  } catch (err) {
    console.error("\n❌ SMTP verify FAILED:", err.message);
    if (err.code === "EAUTH") {
      console.error("\nAuth was rejected by the server. For Outlook/Office365 (535 5.7.139) check:");
      console.error("  1. M365 admin center → Users → " + cfg.smtpUser + " → Mail → Manage email apps → 'Authenticated SMTP' must be ticked");
      console.error("  2. If MFA is on, a valid app password must be used (not the account password)");
      console.error("  3. Security defaults / Conditional Access may be blocking legacy auth tenant-wide");
      console.error("  4. The password/app password may have been changed, expired, or revoked");
    }
    process.exit(1);
  }

  const sendIdx = process.argv.indexOf("--send");
  if (sendIdx !== -1 && process.argv[sendIdx + 1]) {
    const to = process.argv[sendIdx + 1];
    console.log(`\nSending test email to ${to}...`);
    const info = await transporter.sendMail({
      from: cfg.smtpUser,
      to,
      subject: "SMTP test — CA_IO_BE",
      text: "This is a test email from test-smtp-config.js. SMTP sending works.",
    });
    console.log(`✅ Sent: ${info.messageId}`);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
