#!/usr/bin/env node
// scripts/repair-invalid-submission-dates.js
//
// One-time cleanup for FormSubmission documents whose strictly-typed paths were
// written as a value of the wrong type (e.g. assessedAt / assessedBy stored as
// `{}`). Mongoose throws a CastError wrapped in "FormSubmission validation
// failed" when it tries to hydrate such a document, which broke the assessor
// "fill / assess form" flows with a generic 500.
//
// Cleans Date paths (assessedAt, submittedAt, ...) and ObjectId paths
// (assessedBy, assessorFilledBy). Mixed paths like assessorFormData ({} is a
// valid default) and String paths like assessorFeedback ("") are left alone.
//
// The running app self-heals these on demand (utils/formSubmissionDateRepair),
// but this script clears every corrupt value across the whole collection in one
// pass so the bad data is gone for good.
//
// Usage (from CA_IO_BE/):
//   node scripts/repair-invalid-submission-dates.js          # apply the fix
//   node scripts/repair-invalid-submission-dates.js --dry    # report only, no writes
//
// Reads MONGODB_URI from .env (same as the server).

const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, "..", ".env"), override: true });

const mongoose = require("mongoose");

const DRY_RUN = process.argv.includes("--dry") || process.argv.includes("--dry-run");

// Strictly-typed paths on the FormSubmission schema, grouped by expected BSON
// type. A document is corrupt for a field if the field exists but is not of the
// expected type (e.g. an empty object `{}`).
const TYPED_FIELDS = [
  { field: "assessedAt", bsonType: "date" },
  { field: "submittedAt", bsonType: "date" },
  { field: "assessorFilledAt", bsonType: "date" },
  { field: "resubmissionDeadline", bsonType: "date" },
  { field: "createdAt", bsonType: "date" },
  { field: "updatedAt", bsonType: "date" },
  { field: "assessedBy", bsonType: "objectId" },
  { field: "assessorFilledBy", bsonType: "objectId" },
];

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Check CA_IO_BE/.env.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log(`Connected: ${mongoose.connection.host}`);
  console.log(DRY_RUN ? "Mode: DRY RUN (no writes)\n" : "Mode: APPLY\n");

  // Use the native collection so corrupt values don't trip Mongoose casting.
  const collection = mongoose.connection.collection("formsubmissions");

  let totalAffected = 0;
  for (const { field, bsonType } of TYPED_FIELDS) {
    // Matches docs where the field exists but is not of the expected BSON type
    // (objects like {}, strings, etc.).
    const query = { [field]: { $exists: true, $not: { $type: bsonType } } };
    const count = await collection.countDocuments(query);

    if (count === 0) {
      console.log(`  ${field}: clean`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`  ${field}: ${count} document(s) would be cleared`);
      const sample = await collection.findOne(query, {
        projection: { [field]: 1 },
      });
      if (sample) {
        console.log(
          `    e.g. _id=${sample._id} ${field}=${JSON.stringify(sample[field])}`
        );
      }
    } else {
      const res = await collection.updateMany(query, { $unset: { [field]: "" } });
      console.log(`  ${field}: cleared on ${res.modifiedCount} document(s)`);
      totalAffected += res.modifiedCount || 0;
    }
  }

  console.log(
    DRY_RUN
      ? "\nDry run complete. Re-run without --dry to apply."
      : `\nDone. Cleared invalid values across ${totalAffected} field-instance(s).`
  );

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("Repair failed:", err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
