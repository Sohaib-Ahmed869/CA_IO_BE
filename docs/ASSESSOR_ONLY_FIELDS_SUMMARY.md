# Assessor-Only Fields Implementation Summary

## ✅ Backend Changes Completed

### 1. Created Utility: `utils/assessorFieldDetector.js`
- **`isAssessorOnly(fieldOrSection)`**: Detects if a field/section is assessor-only using:
  1. Explicit `editableBy: "assessor"` metadata (highest priority)
  2. Field type detection (`assessor_signature`, `assessor_approval`)
  3. Keyword detection (fallback): "assessor signature", "assessor name", "assessor use only", "to be filled by assessor", etc.

- **`processFormStructureForRole(formStructure, userRole)`**: Processes form structure and adds metadata flags:
  - `_isAssessorOnly`: boolean - whether field/section is assessor-only
  - `_editable`: boolean - whether current user can edit
  - `_readOnly`: boolean - whether field should be read-only

- **`validateAssessorOnlyFields(formData, formStructure, userRole)`**: Validates that non-assessor users aren't submitting assessor-only fields

### 2. Updated `controllers/formSubmissionController.js`
- **`getFormForFilling`**: Now processes form structure and returns fields with `_editable`, `_readOnly`, `_isAssessorOnly` flags
- **`submitForm`**: Added validation to prevent students from submitting assessor-only fields (returns 403 error)

### 3. Updated `controllers/assessorFormController.js`
- **`getAssessorFormForFilling`**: Now processes form structure so assessors can see and edit all fields including assessor-only ones

---

## 📋 Frontend Changes Required

### 1. Form Field Rendering
When rendering form fields, check the metadata flags returned from backend:

```typescript
// Example field rendering
const isReadOnly = field._readOnly || (userRole !== 'assessor' && field._isAssessorOnly);
const isAssessorField = field._isAssessorOnly;

<input
  disabled={isReadOnly}
  readOnly={isReadOnly}
  className={isReadOnly ? 'readonly-field' : ''}
/>
{isAssessorField && <span className="badge">Assessor Only</span>}
```

### 2. Section Rendering
For sections marked as assessor-only (entire section becomes uneditable):

```typescript
const isAssessorSection = section._isAssessorOnly;
const isReadOnly = section._readOnly || (userRole !== 'assessor' && isAssessorSection);

<div className={isAssessorSection ? 'assessor-section' : ''}>
  <h3>
    {section.title}
    {isAssessorSection && <span className="badge">For Assessor Use Only</span>}
  </h3>
  {isAssessorSection && userRole === 'user' && (
    <p className="section-hint">
      This entire section will be filled by your assessor
    </p>
  )}
  {/* Render fields - all fields in assessor-only section are automatically readonly */}
  {section.fields?.map(field => (
    <FormField
      key={field.fieldName}
      field={field}
      // field._readOnly will be true if section is assessor-only
    />
  ))}
</div>
```

**Note**: When a section is assessor-only, all fields within it are automatically marked as `_readOnly: true` for students, even if individual fields don't have assessor keywords.

### 3. Form Validation (Before Submit)
Validate on frontend before submitting:

```typescript
const validateBeforeSubmit = (formData, formStructure, userRole) => {
  if (userRole === 'assessor' || userRole === 'admin') return true;
  
  // Check if any assessor-only fields have values
  const hasAssessorOnlyValues = formStructure.some(section => {
    return section.fields?.some(field => {
      if (field._isAssessorOnly && formData[field.fieldName]) {
        return true;
      }
    });
  });
  
  if (hasAssessorOnlyValues) {
    alert('You cannot submit assessor-only fields');
    return false;
  }
  
  return true;
};
```

### 4. Visual Styling
Add CSS for visual indicators:

```css
.assessor-only {
  background-color: #fef3c7; /* Light yellow */
  border-left: 3px solid #f59e0b;
}

.readonly-field {
  background-color: #f3f4f6; /* Gray */
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

## 🔍 How Fields/Sections Are Identified

### Priority Order:
1. **Explicit Metadata** (Recommended for new forms):
   ```json
   {
     "title": "Section A: Assessment",
     "editableBy": "assessor"  // Explicitly marked
   }
   ```

2. **Field Type**:
   ```json
   {
     "fieldType": "assessor_signature"  // Automatically detected
   }
   ```

3. **Smart Keyword Detection** (Works for existing forms):
   - **Section-level detection** catches variations like:
     - "Section A: ASSESSOR USE ONLY"
     - "Assessor Use Only"
     - "To be filled by assessor only"
     - "For assessor use only"
     - "Assessor only section"
     - And many other variations
   
   - **Field-level detection** for:
     - "assessor signature", "assessor name", "assessor comments", etc.
   
   - **Important**: If a section is marked as assessor-only, ALL fields within that section are automatically marked as assessor-only, even if individual fields don't have assessor keywords.

---

## 📡 API Response Format

### Student Fetching Form:
```json
{
  "success": true,
  "data": {
    "formTemplate": {
      "formStructure": [
        {
          "title": "Student Information",
          "fields": [
            {
              "fieldName": "student_name",
              "label": "Your Name",
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

### Error Response (Student trying to submit assessor-only field):
```json
{
  "success": false,
  "message": "You cannot submit assessor-only fields",
  "errors": [
    "Cannot submit assessor-only field: Assessor Signature (in section: Assessor Use Only)"
  ]
}
```

---

## ✅ Testing Checklist

- [ ] Student cannot edit assessor-only fields (UI shows disabled/readonly)
- [ ] Student cannot submit form with assessor-only field values (backend returns 403)
- [ ] Assessor can edit all fields including assessor-only ones
- [ ] Assessor can submit form with assessor-only fields filled
- [ ] Visual indicators (badges, styling) show correctly
- [ ] Keyword detection works for existing forms
- [ ] Explicit `editableBy` metadata works for new forms
- [ ] Form structure with sections works correctly
- [ ] Form structure with flat fields works correctly (backward compatibility)

---

## 🎯 Next Steps

1. **Frontend Implementation**: Update form rendering components to use `_editable`, `_readOnly`, `_isAssessorOnly` flags
2. **Form Template Updates**: For new forms, add `editableBy: "assessor"` metadata to assessor-only fields/sections
3. **Testing**: Test with existing forms (keyword detection) and new forms (explicit metadata)
4. **User Communication**: Consider adding tooltips/hints explaining why certain fields are disabled

---

## 📝 Notes

- **Backward Compatibility**: Existing forms without metadata will work via keyword detection
- **Gradual Rollout**: You can add `editableBy` metadata to new forms while keyword detection handles existing forms
- **Admin Access**: Admins are treated as assessors and can edit all fields

