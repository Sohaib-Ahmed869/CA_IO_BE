#!/usr/bin/env node
// scripts/test-coe-email.js
//
// Hits POST /api/dev/test-coe-email so you can test that the CoE PDF renders
// long qualification names without cutting them off.
//
// Usage:
//   node scripts/test-coe-email.js you@example.com
//   node scripts/test-coe-email.js you@example.com "CPC30220 Some really long qualification name"
//
// Env overrides:
//   BASE_URL   API base, default http://localhost:5000
//   APP_CODE   default TEST-000001
//   COURSE     default CPC30220
//   PRICE      default 2500
//   FIRST_NAME default Test
//   LAST_NAME  default Student

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const URL = `${BASE_URL.replace(/\/+$/, "")}/api/dev/test-coe-email`;

const [, , emailArg, qualificationArg] = process.argv;

if (!emailArg) {
  console.error("Usage: node scripts/test-coe-email.js <email> [qualificationName]");
  process.exit(1);
}

const body = {
  email: emailArg,
  firstName: process.env.FIRST_NAME || "Test",
  lastName: process.env.LAST_NAME || "Student",
  appCode: process.env.APP_CODE || "TEST-000001",
  courseCode: process.env.COURSE || "CPC30220",
  price: Number(process.env.PRICE || 2500),
};
if (qualificationArg) body.qualificationName = qualificationArg;

(async () => {
  console.log(`POST ${URL}`);
  console.log("Body:", JSON.stringify(body, null, 2));

  let res;
  try {
    res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("\nRequest failed (is the server running on", BASE_URL + "?):");
    console.error(err.message);
    process.exit(1);
  }

  let payload;
  try {
    payload = await res.json();
  } catch {
    payload = await res.text();
  }

  console.log(`\nStatus: ${res.status} ${res.statusText}`);
  console.log("Response:", typeof payload === "string" ? payload : JSON.stringify(payload, null, 2));

  if (!res.ok) process.exit(1);

  console.log(`\n✓ Check the inbox: ${emailArg}`);
  console.log("  Open the PDF attachment and confirm the qualification line is not cut off.");
})();
