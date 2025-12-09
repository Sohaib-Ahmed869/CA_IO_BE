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
  // Check for explicit assessorOnly flag first
  if (fieldOrSection.assessorOnly === true) return true;
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
    'assessor-led interview',
    'assessor led interview',
    'assessor: ask the following questions verbally',
    'assessor ask the following questions verbally',

    // Office / delegate only sections (e.g. \"To be completed by an authorised delegate of CIA (Office Use Only)\")
    'office use only',
    'to be completed by an authorised delegate',
    'to be completed by an authorized delegate',
    'authorised delegate of cia',
    'authorized delegate of cia'
  ];

  // Check exact keyword matches
  const hasExactMatch = assessorPatterns.some(pattern => {
    if (pattern instanceof RegExp) {
      return pattern.test(normalizedText) || pattern.test(text);
    }
    return normalizedText.includes(pattern) || text.includes(pattern);
  });

  if (hasExactMatch) return true;

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
      
      // Helper function to recursively process nested fields (e.g., in tables)
      const processNestedField = (field, parentIsAssessorOnly) => {
        const fieldIsAssessorOnly = parentIsAssessorOnly || isAssessorOnly(field);
        const isEditable = isAssessor || !fieldIsAssessorOnly;
        
        const processedField = {
          ...field,
          _isAssessorOnly: fieldIsAssessorOnly,
          _editable: isEditable,
          _readOnly: !isEditable,
          _parentSectionIsAssessorOnly: parentIsAssessorOnly
        };
        
        // Handle nested fields in table rows (content array)
        if (field.table && field.table.rows && Array.isArray(field.table.rows)) {
          processedField.table = {
            ...field.table,
            rows: field.table.rows.map(row => {
              if (row.content && Array.isArray(row.content)) {
                return {
                  ...row,
                  content: row.content.map(nestedField => 
                    processNestedField(nestedField, fieldIsAssessorOnly)
                  )
                };
              }
              return row;
            })
          };
        }
        
        // Handle nested fields in other structures
        if (field.fields && Array.isArray(field.fields)) {
          processedField.fields = field.fields.map(nestedField => 
            processNestedField(nestedField, fieldIsAssessorOnly)
          );
        }
        
        return processedField;
      };
      
      // If the entire section is assessor-only, ALL fields within it are also assessor-only
      const processedFields = item.fields.map(field => 
        processNestedField(field, sectionIsAssessorOnly)
      );

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

  // Helper function to recursively check nested fields (e.g., in tables)
  const checkField = (field, sectionTitle = null, parentIsAssessorOnly = false) => {
    const fieldIsAssessorOnly = parentIsAssessorOnly || isAssessorOnly(field);
    
    if (fieldIsAssessorOnly) {
      const fieldName = field.fieldName || field.id;
      const fieldType = field.fieldType || 'text';
      if (hasMeaningfulValue(formData[fieldName], fieldType)) {
        const fieldLabel = field.label || fieldName;
        const context = sectionTitle ? ` (in section: ${sectionTitle})` : '';
        errors.push(`Cannot submit assessor-only field: ${fieldLabel}${context}`);
      }
    }
    
    // Handle nested fields in table rows (content array)
    if (field.table && field.table.rows && Array.isArray(field.table.rows)) {
      field.table.rows.forEach((row) => {
        if (row.content && Array.isArray(row.content)) {
          row.content.forEach((nestedField) => {
            checkField(nestedField, sectionTitle, fieldIsAssessorOnly);
          });
        }
      });
    }
    
    // Handle nested fields in other structures
    if (field.fields && Array.isArray(field.fields)) {
      field.fields.forEach((nestedField) => {
        checkField(nestedField, sectionTitle, fieldIsAssessorOnly);
      });
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
          checkField(field, sectionTitle, true); // Pass true for parentIsAssessorOnly
        });
      }
    } else {
      // Check individual fields in section (section itself is not assessor-only)
      if (section.fields && Array.isArray(section.fields)) {
        section.fields.forEach(field => checkField(field, sectionTitle, false));
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

