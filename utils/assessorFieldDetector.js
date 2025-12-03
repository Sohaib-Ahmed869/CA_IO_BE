/**
 * Utility functions to detect and process assessor-only fields/sections in forms
 */

/**
 * Detects if a field or section should be editable only by assessors
 * Uses smart detection with multiple methods and keyword variations
 * @param {Object} fieldOrSection - Field or section object
 * @returns {boolean} - true if assessor-only
 */
function isAssessorOnly(fieldOrSection) {
  if (!fieldOrSection) return false;

  // Method 1: Explicit metadata (highest priority)
  if (fieldOrSection.editableBy === 'assessor') return true;
  if (fieldOrSection.readOnlyFor === 'user') return true;

  // Method 2: Field type detection
  const assessorFieldTypes = ['assessor_signature', 'assessor_approval'];
  if (assessorFieldTypes.includes(fieldOrSection.fieldType)) return true;

  // Method 3: Smart keyword detection (fallback for existing forms)
  const text = [
    fieldOrSection.label,
    fieldOrSection.title,
    fieldOrSection.description,
    fieldOrSection.fieldName,
    fieldOrSection.name,
    fieldOrSection.sectionTitle, // Additional field name variations
    fieldOrSection.heading
  ].filter(Boolean).join(' ').toLowerCase();

  // Normalize text: remove special characters, extra spaces, and common prefixes
  const normalizedText = text
    .replace(/[^\w\s]/g, ' ') // Replace special chars with spaces
    .replace(/\s+/g, ' ') // Normalize multiple spaces
    .trim();

  // Comprehensive keyword patterns for assessor-only detection
  const assessorPatterns = [
    // Direct assessor references
    'assessor signature',
    'assessor name',
    'assessor comments',
    'assessor notes',
    'assessor feedback',
    'assessor approval',
    'assessor section',
    'assessor only',
    
    // "Use only" variations
    'assessor use only',
    'for assessor use only',
    'assessor use',
    'use only assessor',
    
    // "To be filled" variations
    'to be filled by assessor',
    'to be filled by assessor only',
    'filled by assessor',
    'filled by assessor only',
    'to fill by assessor',
    
    // "For assessor" variations
    'for assessor',
    'for assessor only',
    'for assessor use',
    'assessor only section',
    
    // Section title patterns (e.g., "Section A: ASSESSOR USE ONLY")
    /section\s+[a-z]:\s*assessor/i, // "Section A: ASSESSOR..."
    /assessor\s+use\s+only/i,
    /assessor\s+only/i,
    
    // Common abbreviations and variations
    'assessor fill',
    'assessor complete',
    'assessor input',
    'assessor data',
    'assessor information',
    
    // Assessment-specific terms
    'assessor assessment',
    'assessor evaluation',
    'assessor review',
    'assessor decision',

    // Totals / summary blocks that should be assessor-only
    // e.g. "TOTALS: Summary of responses (Never, Sometimes, Regularly)"
    'totals summary of responses',
    'summary of responses (never sometimes regularly)',
    'summary of responses',
    'totals summary',
    'totals responses'
  ];

  // Check exact keyword matches
  const hasExactMatch = assessorPatterns.some(pattern => {
    if (pattern instanceof RegExp) {
      return pattern.test(normalizedText) || pattern.test(text);
    }
    return normalizedText.includes(pattern) || text.includes(pattern);
  });

  if (hasExactMatch) return true;

  // Additional rule for TOTALS-style assessor summaries:
  // Mark as assessor-only if the text mentions "totals" AND any of the
  // scale words (never / sometimes / regularly), regardless of exact phrasing.
  if (
    normalizedText.includes('totals') &&
    (normalizedText.includes('never') ||
      normalizedText.includes('sometimes') ||
      normalizedText.includes('regularly'))
  ) {
    return true;
  }

  // Additional smart detection: Check if text starts with assessor-related terms
  // This catches patterns like "Section A: ASSESSOR USE ONLY"
  const assessorStartPatterns = [
    /^section\s+[a-z0-9]+:?\s*assessor/i,
    /^assessor\s+use/i,
    /^for\s+assessor/i,
    /^to\s+be\s+filled\s+by\s+assessor/i
  ];

  return assessorStartPatterns.some(pattern => pattern.test(text));
}

/**
 * Recursively processes formStructure and marks assessor-only fields/sections
 * Handles both section-based structure and flat field structure
 * @param {Array} formStructure - Form structure (sections or flat fields)
 * @param {string} userRole - 'user' or 'assessor' or 'admin'
 * @returns {Array} - Processed form structure with editable flags
 */
function processFormStructureForRole(formStructure, userRole) {
  if (!Array.isArray(formStructure)) {
    // If not an array, return as-is (shouldn't happen, but safety check)
    return formStructure;
  }

  const isAssessor = userRole === 'assessor' || userRole === 'admin';

  return formStructure.map(item => {
    // Check if this item has fields (it's a section)
    if (item.fields && Array.isArray(item.fields)) {
      // This is a section with fields
      const sectionIsAssessorOnly = isAssessorOnly(item);

      // If the entire section is assessor-only, ALL fields within it are also assessor-only
      const processedFields = item.fields.map(field => {
        // Field is assessor-only if:
        // 1. The section itself is assessor-only, OR
        // 2. The field itself is marked as assessor-only
        const fieldIsAssessorOnly = sectionIsAssessorOnly || isAssessorOnly(field);
        const isEditable = isAssessor || !fieldIsAssessorOnly;

        // Special rule: some assessor-only prompts come from DB as "label" fields
        // (e.g. "TOTALS: Summary of responses (Never, Sometimes, Regularly)").
        // For students they should remain labels (read-only), but for assessors
        // they should behave as text questions so they can enter totals.
        let normalizedFieldType = field.fieldType;
        if (isAssessor && fieldIsAssessorOnly && field.fieldType === 'label') {
          normalizedFieldType = 'text';
        }

        return {
          ...field,
          fieldType: normalizedFieldType,
          _isAssessorOnly: fieldIsAssessorOnly,
          _editable: isEditable,
          _readOnly: !isEditable,
          _parentSectionIsAssessorOnly: sectionIsAssessorOnly // Track if parent section is assessor-only
        };
      });

      return {
        ...item,
        fields: processedFields,
        _isAssessorOnly: sectionIsAssessorOnly,
        _editable: isAssessor || !sectionIsAssessorOnly,
        _readOnly: !(isAssessor || !sectionIsAssessorOnly)
      };
    } else if (item.fieldName || item.id) {
      // This is a flat field (old structure format)
      const fieldIsAssessorOnly = isAssessorOnly(item);
      const isEditable = isAssessor || !fieldIsAssessorOnly;
      
      return {
        ...item,
        _isAssessorOnly: fieldIsAssessorOnly,
        _editable: isEditable,
        _readOnly: !isEditable
      };
    } else {
      // Unknown structure, return as-is but mark metadata
      const itemIsAssessorOnly = isAssessorOnly(item);
      return {
        ...item,
        _isAssessorOnly: itemIsAssessorOnly,
        _editable: isAssessor || !itemIsAssessorOnly,
        _readOnly: !(isAssessor || !itemIsAssessorOnly)
      };
    }
  });
}

/**
 * Validates that a user is not submitting assessor-only fields
 * @param {Object} formData - Submitted form data
 * @param {Array} formStructure - Form structure
 * @param {string} userRole - User role
 * @returns {Object} - { isValid: boolean, errors: string[] }
 */
function validateAssessorOnlyFields(formData, formStructure, userRole) {
  const errors = [];
  
  // Only validate for non-assessor users
  if (userRole === 'assessor' || userRole === 'admin') {
    return { isValid: true, errors: [] };
  }

  if (!Array.isArray(formStructure)) {
    return { isValid: true, errors: [] };
  }

  // Helper function to check if a value is "meaningful" (not empty/default)
  const hasMeaningfulValue = (value, fieldType) => {
    if (value === undefined || value === null) return false;
    if (value === '') return false; // Empty string
    if (value === false) return false; // false is default/empty for booleans
    if (Array.isArray(value) && value.length === 0) return false; // Empty array
    if (typeof value === 'string' && value.trim() === '') return false; // Whitespace-only string
    return true;
  };

  const checkField = (field, sectionTitle = null) => {
    if (isAssessorOnly(field)) {
      const fieldName = field.fieldName || field.id;
      const fieldType = field.fieldType || 'text';
      if (hasMeaningfulValue(formData[fieldName], fieldType)) {
        const fieldLabel = field.label || fieldName;
        const context = sectionTitle ? ` (in section: ${sectionTitle})` : '';
        errors.push(`Cannot submit assessor-only field: ${fieldLabel}${context}`);
      }
    }
  };

  formStructure.forEach(section => {
    // Check if entire section is assessor-only
    const sectionIsAssessorOnly = isAssessorOnly(section);
    const sectionTitle = section.title || 'Unknown Section';
    
    if (sectionIsAssessorOnly) {
      // If entire section is assessor-only, ALL fields in it are assessor-only
      if (section.fields && Array.isArray(section.fields)) {
        section.fields.forEach(field => {
          const fieldName = field.fieldName || field.id;
          const fieldType = field.fieldType || 'text';
          if (hasMeaningfulValue(formData[fieldName], fieldType)) {
            const fieldLabel = field.label || fieldName;
            errors.push(`Cannot submit assessor-only field: ${fieldLabel} (in assessor-only section: ${sectionTitle})`);
          }
        });
      }
    } else {
      // Check individual fields in section (section itself is not assessor-only)
      if (section.fields && Array.isArray(section.fields)) {
        section.fields.forEach(field => checkField(field, section.title));
      }
    }
    
    // Handle flat structure (old format)
    if (section.fieldName || section.id) {
      checkField(section);
    }
  });

  return {
    isValid: errors.length === 0,
    errors
  };
}

module.exports = {
  isAssessorOnly,
  processFormStructureForRole,
  validateAssessorOnlyFields
};

