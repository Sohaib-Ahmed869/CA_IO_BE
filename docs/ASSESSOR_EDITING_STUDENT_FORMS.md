# Assessor Editing Student Forms with Assessor-Only Sections

## Overview
This document explains how assessors can edit assessor-only sections in student forms, while keeping student sections read-only for assessors.

## Scenario
- Student forms (`filledBy: "user"`) can contain assessor-only sections
- Students can only edit their own sections (assessor sections are disabled)
- Assessors need to:
  - View the entire form (student sections + assessor sections)
  - Edit ONLY assessor-only sections (student sections are read-only)
  - Submit assessor data that gets merged with student data

---

## Backend Changes Required

### 1. Update `controllers/assessorFormController.js`

#### Modify `getAssessorFormForFilling` to allow assessors to access student forms:

```javascript
getAssessorFormForFilling: async (req, res) => {
  try {
    const { applicationId, formTemplateId } = req.params;
    const assessorId = req.user.id;

    // Verify application assignment
    const application = await Application.findOne({
      _id: applicationId,
      assignedAssessor: assessorId,
    })
      .populate("userId", "firstName lastName email")
      .populate("certificationId", "name");

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found or not assigned to you",
      });
    }

    // Get form template
    const formTemplate = await FormTemplate.findById(formTemplateId);
    if (!formTemplate) {
      return res.status(404).json({
        success: false,
        message: "Form template not found",
      });
    }

    // Allow assessors to access BOTH assessor forms AND student forms with assessor sections
    // Previously: if (formTemplate.filledBy !== "assessor") { return 403; }
    // Now: Allow assessors to access any form assigned to the application

    // Get student submission for this form (if it's a user form)
    const studentSubmission = await FormSubmission.findOne({
      applicationId,
      formTemplateId,
      filledBy: 'user',
    });

    // Get existing assessor submission (if assessor has already filled assessor sections)
    const existingAssessorSubmission = await FormSubmission.findOne({
      applicationId,
      formTemplateId,
      filledBy: 'assessor',
    });

    // Process form structure - assessors can edit assessor-only fields, but student fields are read-only
    const { processFormStructureForRole } = require('../utils/assessorFieldDetector');
    const userRole = req.user.userType || 'assessor';
    
    // Process structure to mark assessor-only fields as editable, student fields as read-only
    const processedStructure = processFormStructureForRole(
      formTemplate.formStructure,
      userRole
    );

    // For assessors viewing student forms, mark non-assessor fields as read-only
    if (formTemplate.filledBy === 'user') {
      processedStructure.forEach(section => {
        if (!section._isAssessorOnly) {
          // This is a student section - make it read-only for assessors
          section._editable = false;
          section._readOnly = true;
          if (section.fields && Array.isArray(section.fields)) {
            section.fields.forEach(field => {
              if (!field._isAssessorOnly) {
                field._editable = false;
                field._readOnly = true;
              }
            });
          }
        }
      });
    }

    res.json({
      success: true,
      data: {
        application: {
          id: application._id,
          student: application.userId,
          certification: application.certificationId,
          overallStatus: application.overallStatus,
        },
        formTemplate: {
          id: formTemplate._id,
          name: formTemplate.name,
          description: formTemplate.description,
          stepNumber: formTemplate.stepNumber,
          filledBy: formTemplate.filledBy, // 'user' or 'assessor'
          formStructure: processedStructure, // Processed with editability flags
        },
        // Student's submission data (for reference, read-only)
        studentSubmission: studentSubmission ? {
          id: studentSubmission._id,
          formData: studentSubmission.formData,
          status: studentSubmission.status,
          submittedAt: studentSubmission.submittedAt,
        } : null,
        // Assessor's submission (if exists)
        existingSubmission: existingAssessorSubmission ? {
          id: existingAssessorSubmission._id,
          formData: existingAssessorSubmission.formData,
          status: existingAssessorSubmission.status,
          submittedAt: existingAssessorSubmission.submittedAt,
        } : null,
        // ... rest of existing code (studentSubmissions, referenceSubmissions, etc.)
      },
    });
  } catch (error) {
    // ... error handling
  }
}
```

#### Modify `submitAssessorForm` to handle student forms with assessor sections:

```javascript
submitAssessorForm: async (req, res) => {
  try {
    const { applicationId, formTemplateId } = req.params;
    const { formData, status = "submitted" } = req.body;
    const assessorId = req.user.id;

    // Verify application assignment
    const application = await Application.findOne({
      _id: applicationId,
      assignedAssessor: assessorId,
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found or not assigned to you",
      });
    }

    // Get form template
    const formTemplate = await FormTemplate.findById(formTemplateId);
    if (!formTemplate) {
      return res.status(404).json({
        success: false,
        message: "Form template not found",
      });
    }

    // Allow assessors to submit for both assessor forms AND student forms with assessor sections
    // Remove the restriction: if (formTemplate.filledBy !== "assessor") { return 403; }

    // Get student submission if this is a student form
    const studentSubmission = await FormSubmission.findOne({
      applicationId,
      formTemplateId,
      filledBy: 'user',
    });

    // Validate that assessor is only submitting assessor-only fields
    const { validateAssessorOnlyFields, isAssessorOnly } = require('../utils/assessorFieldDetector');
    
    // Extract only assessor-only fields from submitted formData
    const assessorOnlyFields = {};
    const studentFields = {};
    
    if (Array.isArray(formTemplate.formStructure)) {
      formTemplate.formStructure.forEach(section => {
        const sectionIsAssessorOnly = isAssessorOnly(section);
        
        if (section.fields && Array.isArray(section.fields)) {
          section.fields.forEach(field => {
            const fieldName = field.fieldName || field.id;
            const fieldIsAssessorOnly = sectionIsAssessorOnly || isAssessorOnly(field);
            
            if (formData[fieldName] !== undefined) {
              if (fieldIsAssessorOnly) {
                assessorOnlyFields[fieldName] = formData[fieldName];
              } else {
                // Assessor tried to submit a student field - this should be prevented by frontend
                // But we validate here too for security
                studentFields[fieldName] = formData[fieldName];
              }
            }
          });
        }
      });
    }

    // If assessor tried to submit student fields, reject
    if (Object.keys(studentFields).length > 0) {
      return res.status(403).json({
        success: false,
        message: "You can only submit assessor-only fields",
        errors: [`Cannot submit student fields: ${Object.keys(studentFields).join(', ')}`]
      });
    }

    // If this is a student form, merge assessor data with student data
    let finalFormData = formData;
    if (formTemplate.filledBy === 'user' && studentSubmission) {
      // Merge: student data (base) + assessor-only fields (overwrite)
      finalFormData = {
        ...studentSubmission.formData, // Student's data
        ...assessorOnlyFields // Assessor's data (only assessor-only fields)
      };
    }

    // Validate form data
    const validationResult = validateFormData(
      finalFormData,
      formTemplate.formStructure
    );
    if (!validationResult.isValid) {
      return res.status(400).json({
        success: false,
        message: "Form data validation failed",
        errors: validationResult.errors,
      });
    }

    // Check if assessor submission already exists
    let formSubmission = await FormSubmission.findOne({
      applicationId,
      formTemplateId,
      filledBy: 'assessor',
    });

    if (formSubmission) {
      // Update existing assessor submission
      formSubmission.formData = finalFormData;
      formSubmission.status = status;
      if (status === "submitted") {
        formSubmission.submittedAt = new Date();
      }
      await formSubmission.save();
    } else {
      // Create new assessor submission
      formSubmission = await FormSubmission.create({
        applicationId,
        formTemplateId,
        userId: assessorId,
        stepNumber: formTemplate.stepNumber,
        filledBy: 'assessor',
        formData: finalFormData,
        status,
        submittedAt: status === "submitted" ? new Date() : null,
      });
    }

    // Update application progress if form was submitted
    if (status === "submitted") {
      await updateApplicationProgress(applicationId);
    }

    res.json({
      success: true,
      message: status === "submitted" 
        ? "Assessor form submitted successfully" 
        : "Form saved as draft",
      data: {
        submission: {
          id: formSubmission._id,
          status: formSubmission.status,
          submittedAt: formSubmission.submittedAt,
          lastModified: formSubmission.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error("Submit assessor form error:", error);
    res.status(500).json({
      success: false,
      message: "Error submitting assessor form",
      error: error.message,
    });
  }
}
```

### 2. Update `utils/assessorFieldDetector.js`

The existing `processFormStructureForRole` function already handles this correctly:
- For assessors: All fields are editable by default
- We need to add logic to mark student fields as read-only when assessor views student forms

Add a new function:

```javascript
/**
 * Processes form structure for assessors viewing student forms
 * Assessors can only edit assessor-only fields, student fields are read-only
 * @param {Array} formStructure - Form structure
 * @returns {Array} - Processed form structure
 */
function processFormStructureForAssessorViewingStudentForm(formStructure) {
  if (!Array.isArray(formStructure)) return formStructure;

  return formStructure.map(section => {
    const sectionIsAssessorOnly = isAssessorOnly(section);
    
    // If section is not assessor-only, make it read-only
    const sectionEditable = sectionIsAssessorOnly;
    
    if (section.fields && Array.isArray(section.fields)) {
      section.fields = section.fields.map(field => {
        const fieldIsAssessorOnly = sectionIsAssessorOnly || isAssessorOnly(field);
        return {
          ...field,
          _isAssessorOnly: fieldIsAssessorOnly,
          _editable: fieldIsAssessorOnly, // Only assessor-only fields are editable
          _readOnly: !fieldIsAssessorOnly // Student fields are read-only
        };
      });
    }

    return {
      ...section,
      _isAssessorOnly: sectionIsAssessorOnly,
      _editable: sectionEditable,
      _readOnly: !sectionEditable
    };
  });
}

module.exports = {
  isAssessorOnly,
  processFormStructureForRole,
  processFormStructureForAssessorViewingStudentForm, // Add this
  validateAssessorOnlyFields
};
```

---

## Frontend Changes Required

### 1. Form Rendering for Assessors

When an assessor opens a student form, render fields based on `_editable` and `_readOnly` flags:

```typescript
// FormField component for assessors
const FormField = ({ field, value, onChange, userRole, formType }) => {
  // For assessors viewing student forms:
  // - Assessor-only fields: editable
  // - Student fields: read-only (can view but not edit)
  const isReadOnly = field._readOnly || 
    (userRole === 'assessor' && formType === 'user' && !field._isAssessorOnly);
  const isAssessorField = field._isAssessorOnly;

  return (
    <div className={`form-field ${isAssessorField ? 'assessor-only' : ''} ${isReadOnly ? 'readonly' : ''}`}>
      <label>
        {field.label}
        {isAssessorField && <span className="badge">Assessor Only</span>}
        {isReadOnly && userRole === 'assessor' && (
          <span className="badge readonly-badge">Read Only (Student Field)</span>
        )}
      </label>
      <input
        type={field.fieldType}
        value={value || ''}
        onChange={onChange}
        disabled={isReadOnly}
        readOnly={isReadOnly}
        className={isReadOnly ? 'readonly-field' : ''}
      />
      {isReadOnly && userRole === 'assessor' && !isAssessorField && (
        <small className="hint">This field was filled by the student and cannot be edited</small>
      )}
    </div>
  );
};
```

### 2. Section Rendering

```typescript
const FormSection = ({ section, fields, formData, onChange, userRole, formType }) => {
  const isAssessorSection = section._isAssessorOnly;
  const isReadOnly = section._readOnly || 
    (userRole === 'assessor' && formType === 'user' && !isAssessorSection);

  return (
    <div className={`form-section ${isAssessorSection ? 'assessor-section' : ''} ${isReadOnly ? 'readonly-section' : ''}`}>
      <h3>
        {section.title}
        {isAssessorSection && <span className="badge">For Assessor Use Only</span>}
        {isReadOnly && userRole === 'assessor' && (
          <span className="badge readonly-badge">Student Section (Read Only)</span>
        )}
      </h3>
      {section.description && <p>{section.description}</p>}
      {fields.map(field => (
        <FormField
          key={field.fieldName}
          field={field}
          value={formData[field.fieldName]}
          onChange={(e) => onChange(field.fieldName, e.target.value)}
          userRole={userRole}
          formType={formType}
        />
      ))}
    </div>
  );
};
```

### 3. Form Submission Logic

When assessor submits, only send assessor-only fields:

```typescript
const handleAssessorSubmit = async (formData, formStructure) => {
  // Extract only assessor-only fields
  const assessorOnlyData = {};
  
  formStructure.forEach(section => {
    if (section._isAssessorOnly || section.fields) {
      section.fields?.forEach(field => {
        if (field._isAssessorOnly) {
          const fieldName = field.fieldName || field.id;
          if (formData[fieldName] !== undefined) {
            assessorOnlyData[fieldName] = formData[fieldName];
          }
        }
      });
    }
  });

  // Submit only assessor-only fields
  const response = await fetch(`/api/assessor-forms/application/${applicationId}/form/${formTemplateId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      formData: assessorOnlyData, // Only assessor-only fields
      status: 'submitted'
    })
  });
};
```

### 4. Form Validation Before Submit

```typescript
const validateAssessorSubmission = (formData, formStructure) => {
  const errors = [];
  
  // Check if assessor tried to submit student fields
  formStructure.forEach(section => {
    if (!section._isAssessorOnly) {
      section.fields?.forEach(field => {
        if (!field._isAssessorOnly) {
          const fieldName = field.fieldName || field.id;
          if (formData[fieldName] !== undefined && formData[fieldName] !== null && formData[fieldName] !== '') {
            errors.push(`Cannot submit student field: ${field.label || fieldName}`);
          }
        }
      });
    }
  });
  
  return errors;
};
```

### 5. Visual Styling

```css
/* Assessor-only fields - editable for assessors */
.assessor-only {
  background-color: #fef3c7; /* Light yellow */
  border-left: 3px solid #f59e0b;
}

/* Read-only student fields for assessors */
.readonly-field {
  background-color: #f3f4f6; /* Gray */
  cursor: not-allowed;
  opacity: 0.7;
}

.readonly-section {
  border: 2px dashed #9ca3af; /* Gray dashed border */
  padding: 1rem;
  margin: 1rem 0;
  background-color: #f9fafb;
}

.readonly-badge {
  background-color: #6b7280; /* Gray */
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  margin-left: 0.5rem;
}

.assessor-section {
  border: 2px solid #f59e0b; /* Amber solid border */
  padding: 1rem;
  margin: 1rem 0;
  background-color: #fffbeb;
}
```

---

## API Response Format

### Assessor Fetching Student Form:

```json
{
  "success": true,
  "data": {
    "formTemplate": {
      "id": "...",
      "name": "Student Application Form",
      "filledBy": "user",
      "formStructure": [
        {
          "title": "Student Information",
          "_isAssessorOnly": false,
          "_editable": false,
          "_readOnly": true,
          "fields": [
            {
              "fieldName": "studentName",
              "label": "Student Name",
              "_isAssessorOnly": false,
              "_editable": false,
              "_readOnly": true
            }
          ]
        },
        {
          "title": "Section A: ASSESSOR USE ONLY",
          "_isAssessorOnly": true,
          "_editable": true,
          "_readOnly": false,
          "fields": [
            {
              "fieldName": "assessor_signature",
              "label": "Assessor Signature",
              "_isAssessorOnly": true,
              "_editable": true,
              "_readOnly": false
            }
          ]
        }
      ]
    },
    "studentSubmission": {
      "id": "...",
      "formData": {
        "studentName": "John Doe",
        "assessor_signature": ""
      },
      "status": "submitted"
    },
    "existingSubmission": null
  }
}
```

### Assessor Submitting Form:

**Request:**
```json
{
  "formData": {
    "assessor_signature": "data:image/png;base64,...",
    "assessment_marked": true,
    "assessment_date": "2025-11-27"
  },
  "status": "submitted"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Assessor form submitted successfully",
  "data": {
    "submission": {
      "id": "...",
      "status": "submitted",
      "submittedAt": "2025-11-27T10:00:00Z"
    }
  }
}
```

---

## Summary

### Backend Changes:
1. ✅ Allow assessors to access student forms (`filledBy: "user"`)
2. ✅ Process form structure to mark student fields as read-only for assessors
3. ✅ Validate that assessors only submit assessor-only fields
4. ✅ Merge assessor data with student data when saving
5. ✅ Store assessor submission separately (with `filledBy: "assessor"`)

### Frontend Changes:
1. ✅ Check `_editable` and `_readOnly` flags when rendering fields
2. ✅ Disable student fields for assessors (read-only)
3. ✅ Enable assessor-only fields for assessors (editable)
4. ✅ Show visual indicators (badges, styling)
5. ✅ Only submit assessor-only fields when assessor submits
6. ✅ Validate before submit to prevent student field submission

### Key Points:
- **Assessors can view entire form** (student sections + assessor sections)
- **Assessors can only edit assessor-only sections** (student sections are read-only)
- **Data is merged**: Student data (base) + Assessor data (assessor-only fields)
- **Separate submissions**: Student submission (`filledBy: "user"`) and Assessor submission (`filledBy: "assessor"`)

