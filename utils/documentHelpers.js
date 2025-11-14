// utils/documentHelpers.js
const stripExtension = (name) => {
  if (typeof name !== "string") return null;
  return name.replace(/\.[^/.]+$/, "");
};

const toTitleCase = (value) => {
  if (!value || typeof value !== "string") return "";
  return value
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) =>
      word.length > 0
        ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        : ""
    )
    .join(" ");
};

const normaliseDocumentObject = (document) => {
  if (!document) return {};
  if (typeof document.toObject === "function") {
    try {
      return document.toObject();
    } catch (_) {
      // fall through to shallow copy
    }
  }
  return { ...document };
};

const getDocumentDisplayName = (document) => {
  const doc = normaliseDocumentObject(document);

  const candidates = [
    doc.displayName,
    doc.documentLabel,
    doc.documentName,
    doc.category,
    doc.documentType,
    stripExtension(doc.originalName),
    stripExtension(doc.fileName),
  ].filter((value) => typeof value === "string" && value.trim().length > 0);

  const raw = candidates.length > 0 ? candidates[0] : null;

  const formatted = toTitleCase(raw);
  return formatted || "Document";
};

module.exports = {
  getDocumentDisplayName,
};

