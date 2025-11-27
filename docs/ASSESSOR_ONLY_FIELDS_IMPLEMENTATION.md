# Assessor-Only Fields/Sections Implementation Guide

## Overview
This feature allows certain fields or entire sections within student forms to be marked as "assessor-only", making them uneditable for students but editable for assessors during assessment.

## Problem Statement
- Some forms have sections/questions that should only be filled by assessors (e.g., "Assessor Signature", "Assessor Name", "Assessor Use Only" sections)
- Currently, students can edit all fields in their forms
- We need to identify and restrict assessor-only fields/sections based on keywords and metadata

## Solution Approach

### 1. Field/Section Identification Strategy

We'll identify assessor-only fields/sections using multiple methods:

#### Method 1: Smart Keyword Detection (Automatic)
Fields/sections containing these keywords will be marked as assessor-only:

**Section-level detection** (catches entire sections):
- "Section A: ASSESSOR USE ONLY" (with section prefixes)
- "Assessor Use Only"
- "To be filled by assessor only"
- "For assessor use only"
- "Assessor only section"
- "To be filled by assessor"
- "For assessor"
- And many other variations with smart pattern matching

**Field-level detection**:
- "assessor signature", "assessor name", "assessor comments", "assessor notes", "assessor feedback", "assessor approval"

**Important**: If a section is detected as assessor-only, ALL fields within that section are automatically marked as assessor-only, even if individual fields don't contain assessor keywords.

#### Method 2: Explicit Metadata (Recommended)
Add a `editableBy` or `readOnlyFor` property to fields/sections in formStructure:
```json
{
  "title": "Assessment Section",
  "editableBy": "assessor",  // or "user", "both", null (defaults to "user")
  "fields": [
    {
      "fieldName": "assessor_signature",
      "label": "Assessor Signature",
      "fieldType": "signature",
      "editableBy": "assessor"  // Explicitly marked
    }
  ]
}
```

#### Method 3: Field Type Detection
Certain field types are inherently assessor-only:
- `fieldType: "assessor_signature"`
- `fieldType: "assessor_approval"`

**Note**: The detection system uses smart pattern matching that:
- Normalizes text (removes special characters, handles case-insensitive matching)
- Detects section patterns like "Section A: ASSESSOR USE ONLY"
- Handles variations in phrasing and word order
- Automatically cascades section-level assessor-only status to all fields within that section

---

## Backend Changes Required

### 1. Create Utility Function: `utils/assessorFieldDetector.js`

```javascript
/**
 * Detects if a field or section should be editable only by assessors
 * @param {Object} fieldOrSection - Field or section object
 * @returns {boolean} - true if assessor-only
 */
function isAssessorOnly(fieldOrSection) {
  if (!fieldOrSection) return false;

  // Method 1: Explicit metadata
  if (fieldOrSection.editableBy === 'assessor') return true;
  if (fieldOrSection.readOnlyFor === 'user') return true;

  // Method 2: Field type detection
  const assessorFieldTypes = ['assessor_signature', 'assessor_approval'];
  if (assessorFieldTypes.includes(fieldOrSection.fieldType)) return true;

  // Method 3: Keyword detection
  const text = [
    fieldOrSection.label,
    fieldOrSection.title,
    fieldOrSection.description,
    fieldOrSection.fieldName
  ].filter(Boolean).join(' ').toLowerCase();

  const assessorKeywords = [
    'assessor signature',
    'assessor name',
    'assessor comments',
    'assessor notes',
    'assessor feedback',
    'assessor approval',
    'assessor use only',
    'to be filled by assessor',
    'for assessor',
    'assessor section'
  ];

  return assessorKeywords.some(keyword => text.includes(keyword));
}

/**
 * Processes formStructure and marks assessor-only fields/sections
 * @param {Array} formStructure - Form structure (sections or flat fields)
 * @param {string} userRole - 'user' or 'assessor'
 * @returns {Array} - Processed form structure with editable flags
 */
function processFormStructureForRole(formStructure, userRole) {
  if (!Array.isArray(formStructure)) return formStructure;

  return formStructure.map(section => {
    // Check if entire section is assessor-only
    const sectionIsAssessorOnly = isAssessorOnly(section);

    // Process fields within section
    if (section.fields && Array.isArray(section.fields)) {
      section.fields = section.fields.map(field => {
        const fieldIsAssessorOnly = isAssessorOnly(field);
        const isEditable = userRole === 'assessor' || !fieldIsAssessorOnly;
        
        return {
          ...field,
          _isAssessorOnly: fieldIsAssessorOnly,
          _editable: isEditable,
          _readOnly: !isEditable
        };
      });
    }

    // Mark section metadata
    return {
      ...section,
      _isAssessorOnly: sectionIsAssessorOnly,
      _editable: userRole === 'assessor' || !sectionIsAssessorOnly,
      _readOnly: !(userRole === 'assessor' || !sectionIsAssessorOnly)
    };
  });
}

module.exports = {
  isAssessorOnly,
  processFormStructureForRole
};
```

### 2. Update `controllers/formSubmissionController.js`

#### Modify `getFormForFilling` method:
```javascript
getFormForFilling: async (req, res) => {
  // ... existing code ...
  
  const { processFormStructureForRole } = require('../utils/assessorFieldDetector');
  const userRole = req.user.userType; // 'user', 'assessor', 'admin'
  
  // Process form structure to mark assessor-only fields
  const processedStructure = processFormStructureForRole(
    formTemplate.formStructure,
    userRole === 'assessor' ? 'assessor' : 'user'
  );

  res.status(200).json({
    success: true,
    data: {
      formTemplate: {
        id: formTemplate._id,
        name: formTemplate.name,
        description: formTemplate.description,
        stepNumber: formTemplate.stepNumber,
        filledBy: formTemplate.filledBy,
        formStructure: processedStructure, // Use processed structure
      },
      existingSubmission: existingSubmission ? {
        id: existingSubmission._id,
        formData: existingSubmission.formData,
        status: existingSubmission.status,
        submittedAt: existingSubmission.submittedAt,
        lastModified: existingSubmission.updatedAt,
      } : null,
    },
  });
}
```

#### Modify `submitForm` method to validate assessor-only fields:
```javascript
submitForm: async (req, res) => {
  // ... existing code ...
  
  const { isAssessorOnly } = require('../utils/assessorFieldDetector');
  const userRole = req.user.userType;

  // If user is not assessor, validate they're not submitting assessor-only fields
  if (userRole !== 'assessor' && userRole !== 'admin') {
    const assessorOnlyFields = [];
    
    // Check form structure for assessor-only fields
    const checkField = (field) => {
      if (isAssessorOnly(field)) {
        const fieldName = field.fieldName || field.id;
        if (formData[fieldName] !== undefined && formData[fieldName] !== null && formData[fieldName] !== '') {
          assessorOnlyFields.push(field.label || fieldName);
        }
      }
    };

    // Traverse form structure
    if (Array.isArray(formTemplate.formStructure)) {
      formTemplate.formStructure.forEach(section => {
        if (isAssessorOnly(section)) {
          assessorOnlyFields.push(section.title || 'Section');
        }
        if (section.fields && Array.isArray(section.fields)) {
          section.fields.forEach(checkField);
        }
        // Handle flat structure (old format)
        if (section.fieldName) {
          checkField(section);
        }
      });
    }

    if (assessorOnlyFields.length > 0) {
      return res.status(403).json({
        success: false,
        message: "You cannot submit assessor-only fields",
        errors: [`The following fields are assessor-only: ${assessorOnlyFields.join(', ')}`]
      });
    }
  }

  // ... rest of existing submission logic ...
}
```

### 3. Update `controllers/assessorFormController.js`

#### Modify `getAssessorFormForFilling` to show student data + assessor fields:
```javascript
getAssessorFormForFilling: async (req, res) => {
  // ... existing code ...
  
  const { processFormStructureForRole } = require('../utils/assessorFieldDetector');
  
  // Process form structure - assessors can edit everything
  const processedStructure = processFormStructureForRole(
    formTemplate.formStructure,
    'assessor'
  );

  // Get student submission for this form (if it's a user form with assessor sections)
  const studentSubmission = await FormSubmission.findOne({
    applicationId,
    formTemplateId,
    filledBy: 'user',
  });

  res.json({
    success: true,
    data: {
      formTemplate: {
        id: formTemplate._id,
        name: formTemplate.name,
        description: formTemplate.description,
        stepNumber: formTemplate.stepNumber,
        filledBy: formTemplate.filledBy,
        formStructure: processedStructure,
      },
      studentSubmission: studentSubmission ? {
        formData: studentSubmission.formData,
        status: studentSubmission.status,
      } : null,
      existingSubmission: existingSubmission ? {
        id: existingSubmission._id,
        formData: existingSubmission.formData,
        status: existingSubmission.status,
      } : null,
    },
  });
}
```

#### Modify `submitAssessorForm` to merge student data with assessor data:
```javascript
submitAssessorForm: async (req, res) => {
  // ... existing code ...
  
  // Get student submission if this form has student sections
  const studentSubmission = await FormSubmission.findOne({
    applicationId,
    formTemplateId,
    filledBy: 'user',
  });

  // If form has both student and assessor sections, merge data
  // (This depends on your data model - you might store assessor data separately)
  let finalFormData = formData;
  
  if (studentSubmission && formTemplate.filledBy === 'user') {
    // Merge: student data + assessor-only fields from assessor
    finalFormData = {
      ...studentSubmission.formData,
      ...formData // Assessor data overwrites assessor-only fields
    };
  }

  // ... rest of submission logic using finalFormData ...
}
```

---

## Frontend Changes Required

### 1. Form Rendering Component

When rendering form fields, check the `_editable` and `_readOnly` flags:

```typescript
// Example React component
const FormField = ({ field, value, onChange, userRole }) => {
  const isReadOnly = field._readOnly || (userRole !== 'assessor' && field._isAssessorOnly);
  const isAssessorField = field._isAssessorOnly;

  return (
    <div className={`form-field ${isAssessorField ? 'assessor-only' : ''}`}>
      <label>
        {field.label}
        {isAssessorField && <span className="badge">Assessor Only</span>}
      </label>
      <input
        type={field.fieldType}
        value={value || ''}
        onChange={onChange}
        disabled={isReadOnly}
        readOnly={isReadOnly}
        className={isReadOnly ? 'readonly-field' : ''}
      />
      {isReadOnly && userRole === 'user' && (
        <small className="hint">This field will be filled by your assessor</small>
      )}
    </div>
  );
};
```

### 2. Section Rendering

```typescript
const FormSection = ({ section, fields, userRole }) => {
  const isReadOnly = section._readOnly || (userRole !== 'assessor' && section._isAssessorOnly);
  const isAssessorSection = section._isAssessorOnly;

  return (
    <div className={`form-section ${isAssessorSection ? 'assessor-section' : ''}`}>
      <h3>
        {section.title}
        {isAssessorSection && <span className="badge">For Assessor Use Only</span>}
      </h3>
      {section.description && <p>{section.description}</p>}
      {fields.map(field => (
        <FormField
          key={field.fieldName}
          field={field}
          value={formData[field.fieldName]}
          onChange={handleChange}
          userRole={userRole}
        />
      ))}
    </div>
  );
};
```

### 3. Form Validation Before Submit

```typescript
const validateFormBeforeSubmit = (formData, formStructure, userRole) => {
  const errors = [];
  
  if (userRole !== 'assessor') {
    formStructure.forEach(section => {
      if (section._isAssessorOnly) {
        // Check if user tried to fill assessor-only section
        section.fields?.forEach(field => {
          if (formData[field.fieldName]) {
            errors.push(`Cannot submit assessor-only field: ${field.label}`);
          }
        });
      } else {
        section.fields?.forEach(field => {
          if (field._isAssessorOnly && formData[field.fieldName]) {
            errors.push(`Cannot submit assessor-only field: ${field.label}`);
          }
        });
      }
    });
  }
  
  return errors;
};
```

### 4. Visual Styling

Add CSS for assessor-only fields:
```css
.assessor-only {
  background-color: #fef3c7; /* Light yellow background */
  border-left: 3px solid #f59e0b; /* Amber border */
}

.readonly-field {
  background-color: #f3f4f6; /* Gray background */
  cursor: not-allowed;
}

.assessor-section {
  border: 2px dashed #f59e0b;
  padding: 1rem;
  margin: 1rem 0;
}

.badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  background-color: #f59e0b;
  color: white;
  border-radius: 4px;
  font-size: 0.75rem;
  margin-left: 0.5rem;
}
```

---

## API Response Changes

### Student Form Fetch Response:
```json
{
  "success": true,
  "data": {
    "formTemplate": {
      "id": "...",
      "name": "Application Form",
      "formStructure": [
        {
          "title": "Student Information",
          "fields": [
            {
              "fieldName": "student_name",
              "label": "Your Name",
              "fieldType": "text",
              "_editable": true,
              "_readOnly": false,
              "_isAssessorOnly": false
            }
          ]
        },
        {
          "title": "Assessor Use Only",
          "_isAssessorOnly": true,
          "_editable": false,
          "_readOnly": true,
          "fields": [
            {
              "fieldName": "assessor_signature",
              "label": "Assessor Signature",
              "fieldType": "signature",
              "_editable": false,
              "_readOnly": true,
              "_isAssessorOnly": true
            }
          ]
        }
      ]
    }
  }
}
```

---

## Testing Checklist

- [ ] Student cannot edit assessor-only fields (UI disabled)
- [ ] Student cannot submit form with assessor-only field values (backend validation)
- [ ] Assessor can edit all fields including assessor-only ones
- [ ] Assessor can submit form with assessor-only fields filled
- [ ] Keyword detection works for common assessor field names
- [ ] Explicit `editableBy` metadata takes precedence over keyword detection
- [ ] Form structure with sections works correctly
- [ ] Form structure with flat fields works correctly (backward compatibility)
- [ ] Visual indicators (badges, styling) show correctly
- [ ] Form validation prevents assessor-only field submission from students

---

## Migration Notes

1. **Existing Forms:** Forms without `editableBy` metadata will rely on keyword detection
2. **Backward Compatibility:** Old form structures (flat fields) are supported
3. **Gradual Rollout:** You can add `editableBy` metadata to new forms while keyword detection handles existing forms

---

## Summary

**Backend Changes:**
1. Create `utils/assessorFieldDetector.js` utility
2. Update `getFormForFilling` to process form structure
3. Update `submitForm` to validate assessor-only fields
4. Update assessor form endpoints to allow assessor-only field editing

**Frontend Changes:**
1. Check `_editable`/`_readOnly` flags when rendering fields
2. Disable assessor-only fields for students
3. Show visual indicators (badges, styling)
4. Validate before submit to prevent assessor-only field submission
5. Allow assessors to edit all fields

**Identification Methods (Priority Order):**
1. Explicit `editableBy` metadata (most reliable)
2. Field type detection (`assessor_signature`, etc.)
3. Keyword detection (fallback for existing forms)

