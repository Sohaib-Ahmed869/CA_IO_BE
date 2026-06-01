// utils/formSubmissionDateRepair.js
//
// Self-heal for corrupted typed fields on FormSubmission documents.
//
// Some legacy FormSubmission documents have typed paths stored as an empty
// object `{}` instead of a real value:
//   - Date paths      (assessedAt, assessorFilledAt, ...)  ← "{}" is not a date
//   - ObjectId paths  (assessedBy, assessorFilledBy)       ← "{}" is not an id
// When Mongoose hydrates such a document during a query it throws a CastError
// wrapped in a "FormSubmission validation failed" ValidationError *at $init
// time* — before any controller code runs. In the assessor flows that read
// these documents (loading a form to fill, submitting assessor fields,
// recording an assessment) this surfaces only as a generic 500, which is why
// assessing a form was failing.
//
// NOTE: Mixed paths such as `assessorFormData` legitimately default to `{}`,
// and String paths such as `assessorFeedback` can be `""` — those are valid
// and must NOT be touched. Only strictly-typed Date/ObjectId paths are cleaned.
//
// Rather than require a manual DB migration before the app works again, the
// helpers below detect that error, strip the invalid values via the native
// driver (which does not cast), and let the caller retry the query.
const mongoose = require("mongoose");

// Date-typed paths on the FormSubmission schema that can carry corrupt values.
// `createdAt` / `updatedAt` are managed by Mongoose timestamps but are included
// defensively in case they were ever written directly.
const DATE_FIELDS = [
  "assessedAt",
  "submittedAt",
  "assessorFilledAt",
  "resubmissionDeadline",
  "createdAt",
  "updatedAt",
];

// ObjectId-typed paths on the FormSubmission schema.
const OBJECTID_FIELDS = ["assessedBy", "assessorFilledBy"];

// True when `err` is (or wraps) a cast failure on a typed path during
// query hydration or save validation.
function isCastError(err) {
  if (!err) return false;
  if (err.name === "CastError") return true;
  if (err.name === "ValidationError" && err.errors) {
    return Object.values(err.errors).some(
      (e) => e && (e.kind === "cast" || e.name === "CastError")
    );
  }
  return false;
}

// Unset any strictly-typed field holding a value of the wrong BSON type on the
// FormSubmission documents matched by `matchFilter` (e.g. { applicationId } or
// { _id }). Uses the native collection so corrupt values don't trip Mongoose
// casting. Returns the number of field-clears performed.
async function repairInvalidSubmissionFields(matchFilter) {
  const FormSubmission = require("../models/formSubmission");

  // Normalise common ObjectId-valued match keys coming from req.params (strings).
  const filter = { ...matchFilter };
  for (const key of ["_id", "applicationId", "formTemplateId", "userId"]) {
    if (filter[key] != null && !(filter[key] instanceof mongoose.Types.ObjectId)) {
      try {
        filter[key] = new mongoose.Types.ObjectId(String(filter[key]));
      } catch (_) {
        // Leave as-is if it isn't a valid ObjectId; the match simply won't hit.
      }
    }
  }

  let cleared = 0;

  // Date paths: match docs where the field exists but is not a BSON date
  // (objects like {}, strings, etc.) and unset only that field.
  for (const field of DATE_FIELDS) {
    const result = await FormSubmission.collection.updateMany(
      { ...filter, [field]: { $exists: true, $not: { $type: "date" } } },
      { $unset: { [field]: "" } }
    );
    cleared += result.modifiedCount || 0;
  }

  // ObjectId paths: match docs where the field exists but is not a BSON
  // objectId (e.g. {}) and unset it.
  for (const field of OBJECTID_FIELDS) {
    const result = await FormSubmission.collection.updateMany(
      { ...filter, [field]: { $exists: true, $not: { $type: "objectId" } } },
      { $unset: { [field]: "" } }
    );
    cleared += result.modifiedCount || 0;
  }

  return cleared;
}

// Run `fn` (a function returning a query promise). If it fails because a
// FormSubmission with a corrupt typed field could not be hydrated, repair the
// documents scoped by `matchFilter` and retry once.
async function withDateRepair(matchFilter, fn) {
  try {
    return await fn();
  } catch (err) {
    if (!isCastError(err)) throw err;
    const cleared = await repairInvalidSubmissionFields(matchFilter);
    console.warn(
      `[formSubmissionDateRepair] Repaired ${cleared} invalid field(s) for`,
      matchFilter,
      "after cast error; retrying."
    );
    return await fn();
  }
}

module.exports = {
  DATE_FIELDS,
  OBJECTID_FIELDS,
  isCastError,
  // Back-compat alias (older name referenced the date-only behaviour).
  isInvalidDateError: isCastError,
  repairInvalidSubmissionFields,
  // Back-compat alias.
  repairInvalidSubmissionDates: repairInvalidSubmissionFields,
  withDateRepair,
};
