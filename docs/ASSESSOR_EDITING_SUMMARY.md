# Assessor Editing Student Forms - Implementation Summary

## ✅ Backend Changes Completed

### 1. Updated `controllers/assessorFormController.js`

#### `getAssessorFormForFilling`:
- ✅ **Removed restriction**: Previously only allowed `filledBy: "assessor"` forms, now allows assessors to access **any form** assigned to the application (including student forms)
- ✅ **Added student submission retrieval**: Fetches student's submission data for reference
- ✅ **Processed form structure**: Marks student fields as `_readOnly: true` and assessor-only fields as `_editable: true` when assessor views student forms
- ✅ **Returns both submissions**: Returns both `studentSubmission` (read-only reference) and `existingSubmission` (assessor's submission)

#### `submitAssessorForm`:
- ✅ **Removed restriction**: Allows assessors to submit for both assessor forms AND student forms
- ✅ **Field validation**: Validates that assessors only submit assessor-only fields (rejects student fields)
- ✅ **Data merging**: When submitting to student forms, merges student data (base) + assessor-only fields
- ✅ **Separate storage**: Stores assessor submission separately with `filledBy: "assessor"`

---

## 📋 Frontend Changes Required

### 1. **Form Access**
- Allow assessors to open student forms (not just assessor forms)
- Check `formTemplate.filledBy` to determine form type

### 2. **Field Rendering Logic**
```typescript
// For each field, check:
const isReadOnly = field._readOnly || 
  (userRole === 'assessor' && formType === 'user' && !field._isAssessorOnly);

// Render accordingly:
<input 
  disabled={isReadOnly}
  readOnly={isReadOnly}
  className={isReadOnly ? 'readonly-field' : ''}
/>
```

### 3. **Section Rendering**
- Show badges: "For Assessor Use Only" for assessor sections
- Show badges: "Student Section (Read Only)" for student sections when assessor views
- Apply different styling (assessor sections: editable, student sections: grayed out)

### 4. **Form Submission**
- **Only submit assessor-only fields** when assessor submits
- Filter formData to include only fields where `field._isAssessorOnly === true`
- Do NOT include student fields in the submission payload

### 5. **Visual Indicators**
- **Assessor-only fields**: Yellow background, amber border, "Assessor Only" badge
- **Student fields (for assessors)**: Gray background, disabled cursor, "Read Only" badge
- **Assessor sections**: Solid amber border, editable
- **Student sections (for assessors)**: Dashed gray border, read-only

---

## 🔄 Data Flow

### When Assessor Opens Student Form:
1. **Backend**: Returns form structure with `_editable` and `_readOnly` flags
2. **Frontend**: Renders form with:
   - Student sections: Read-only (grayed out, disabled)
   - Assessor sections: Editable (yellow highlight, enabled)

### When Assessor Submits:
1. **Frontend**: Filters formData to only include assessor-only fields
2. **Backend**: 
   - Validates only assessor-only fields are submitted
   - Merges with student data: `{...studentData, ...assessorOnlyFields}`
   - Saves as separate submission with `filledBy: "assessor"`

### Data Storage:
- **Student submission**: `filledBy: "user"` - Student answers + assessor-only sections stored via `assessorFormData`
- **Third-party submission**: `filledBy: "third-party"` - Third-party answers + assessor-only sections stored via `assessorFormData`
- **Assessor-only templates**: `filledBy: "assessor"` - Still stored as separate assessor submissions

---

## 📡 API Endpoints

### Get Form (Assessor):
```
GET /api/assessor-forms/application/:applicationId/form/:formTemplateId
```

**Response includes:**
- `formTemplate.formStructure` - With `_editable` and `_readOnly` flags
- `studentSubmission` - Present when `filledBy: "user"`, includes student data + assessor section
- `thirdPartySubmission` - Present when `filledBy: "third-party"`, includes third-party data + assessor section
- `existingSubmission` - Assessor-side metadata (status, timestamps, assessor answers)

### Submit Form (Assessor):
```
POST /api/assessor-forms/application/:applicationId/form/:formTemplateId
```

**Request body:**
```json
{
  "formData": {
    "assessor_signature": "...",
    "assessment_marked": true,
    "assessment_date": "2025-11-27"
    // Only assessor-only fields!
  },
  "status": "submitted"
}
```

**Backend will:**
- Validate only assessor-only fields are present
- Merge assessor sections into the base submission (student or third-party) using `assessorFormData`
- Save separate `filledBy: "assessor"` submissions only for assessor-owned templates

---

## ✅ Testing Checklist

- [ ] Assessor can open student forms (not just assessor forms)
- [ ] Student sections are read-only for assessors (disabled/grayed out)
- [ ] Assessor-only sections are editable for assessors
- [ ] Visual indicators (badges, styling) show correctly
- [ ] Assessor can only submit assessor-only fields
- [ ] Backend rejects if assessor tries to submit student fields
- [ ] Data is merged correctly (student data + assessor-only fields)
- [ ] Assessor submission is stored separately with `filledBy: "assessor"`

---

## 🎯 Key Points

1. **Assessors can view entire form** (student or third-party answers + assessor sections)
2. **Assessors can only edit assessor-only sections** (base sections are read-only)
3. **Data is merged**: Base submission (student/third-party) + assessor-only fields (overwrite)
4. **Assessor-only templates** still create `filledBy: "assessor"` submissions
5. **Backend validates**: Prevents assessors from submitting base fields
6. **Frontend filters**: Only sends assessor-only fields in submission

---

## 📝 Example

**Student Form Structure:**
- Section 1: Student Information (student fields)
- Section 2: ASSESSOR USE ONLY (assessor fields)

**When Assessor Opens:**
- Section 1: Read-only (can view, cannot edit)
- Section 2: Editable (can fill assessor-only fields)

**When Assessor Submits:**
- Only Section 2 fields are sent to backend
- Backend merges with student's Section 1 data
- Final data: `{studentSection1Data, assessorSection2Data}`

