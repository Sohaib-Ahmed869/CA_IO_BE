// constants/certificationRules.js
//
// Per-certification business rules that don't (yet) live on the Certification
// model. Mirrors the OPTIONAL_VIDEO_CERTIFICATION_IDS approach already used in
// utils/stepCalculator.js.
//
// Keep this in sync with the frontend copy:
//   CA_IO_FE/src/utils/certificationRules.js

// Certifications whose Evidence Upload "Work Documents" limit is raised from the
// default (10) to 30.
const EXTENDED_WORK_DOCS_CERTIFICATION_IDS = new Set([
  "68dfaa01d064738cd4726d2b", // CPC30220 Certificate III in Carpentry
  "6926a8ddf9bffaa49144c71e", // CPC32120 Certificate III in Wall and Floor Tiling
  "6926b4f7f9bffaa49144c71f", // CPC31220 Certificate III in Wall and Ceiling Lining
]);

// Work-document evidence limit for the certifications listed above.
const EXTENDED_WORK_DOCS_MAX = 30;

const isExtendedWorkDocsCertification = (certificationId) =>
  EXTENDED_WORK_DOCS_CERTIFICATION_IDS.has(String(certificationId || ""));

/**
 * Resolve the maximum number of "Work Documents" evidence files allowed for a
 * certification. Falls back to the supplied default (e.g. env-configured
 * MAX_DOCS) for every other certification.
 */
const getMaxWorkDocs = (certificationId, defaultMax = 10) =>
  isExtendedWorkDocsCertification(certificationId) ? EXTENDED_WORK_DOCS_MAX : defaultMax;

module.exports = {
  EXTENDED_WORK_DOCS_CERTIFICATION_IDS,
  EXTENDED_WORK_DOCS_MAX,
  isExtendedWorkDocsCertification,
  getMaxWorkDocs,
};
