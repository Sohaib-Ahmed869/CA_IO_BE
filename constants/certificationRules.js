// constants/certificationRules.js
//
// Per-certification business rules that don't (yet) live on the Certification
// model. Mirrors the OPTIONAL_VIDEO_CERTIFICATION_IDS approach already used in
// utils/stepCalculator.js.
//
// Keep this in sync with the frontend copy:
//   CA_IO_FE/src/utils/certificationRules.js

// Evidence Upload "Work Documents" limit per certification. Anything not listed
// here falls back to the default (10, or the MAX_DOCS env override).
const WORK_DOCS_MAX_BY_CERTIFICATION = {
  "68dfaa01d064738cd4726d2b": 30, // CPC30220 Certificate III in Carpentry
  "6926a8ddf9bffaa49144c71e": 30, // CPC32120 Certificate III in Wall and Floor Tiling
  "6926b4f7f9bffaa49144c71f": 30, // CPC31220 Certificate III in Wall and Ceiling Lining
  "68de76d31e143221d8537bfe": 50, // CPC40120 Certificate IV in Building and Construction
};

// Retained for callers that only need "does this certification override the
// default?" rather than the limit itself.
const EXTENDED_WORK_DOCS_CERTIFICATION_IDS = new Set(
  Object.keys(WORK_DOCS_MAX_BY_CERTIFICATION)
);

// Kept for backwards compatibility with earlier call sites that referenced the
// single shared "extended" figure. Prefer getMaxWorkDocs, which is per-cert.
const EXTENDED_WORK_DOCS_MAX = 30;

const isExtendedWorkDocsCertification = (certificationId) =>
  EXTENDED_WORK_DOCS_CERTIFICATION_IDS.has(String(certificationId || ""));

/**
 * Resolve the maximum number of "Work Documents" evidence files allowed for a
 * certification. Falls back to the supplied default (e.g. env-configured
 * MAX_DOCS) for every certification without an explicit override.
 */
const getMaxWorkDocs = (certificationId, defaultMax = 10) => {
  const override = WORK_DOCS_MAX_BY_CERTIFICATION[String(certificationId || "")];
  return typeof override === "number" ? override : defaultMax;
};

module.exports = {
  WORK_DOCS_MAX_BY_CERTIFICATION,
  EXTENDED_WORK_DOCS_CERTIFICATION_IDS,
  EXTENDED_WORK_DOCS_MAX,
  isExtendedWorkDocsCertification,
  getMaxWorkDocs,
};
