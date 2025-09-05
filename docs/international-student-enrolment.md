# International Student Enrolment Form System

## Overview
This system handles different enrolment forms based on whether a student is international or local, specifically for the CPP20218 - Certificate II in Security Operations certification.

## Database Changes

### 1. User Model
Added `international_student` flag to user profile:
```javascript
international_student: {
  type: Boolean,
  default: false,
}
```

### 2. Initial Screening Form Model
Added `international_student` flag to capture during registration:
```javascript
international_student: {
  type: Boolean,
  required: true,
}
```

## Form IDs
- **International Student Form**: `68b7e1dc3a96b33ba5448baa`
- **Local Student Form**: `68baf3445d43ebde364e8893`
- **Certification ID**: `68b80373c716839c3e29e117` (CPP20218)

## API Endpoints

### 1. Submit Initial Screening Form
```
POST /api/initial-screening/submit
```

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Payload:**
```json
{
  "certificationId": "68b80373c716839c3e29e117",
  "workExperienceYears": "5",
  "workExperienceLocation": "Australia",
  "currentState": "NSW",
  "hasFormalQualifications": true,
  "formalQualificationsDetails": "Bachelor's Degree",
  "international_student": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Initial screening form submitted successfully",
  "data": {
    "screeningForm": {
      "id": "screening_form_id",
      "certificationId": "68b80373c716839c3e29e117",
      "international_student": true,
      "status": "submitted",
      "submittedAt": "2024-01-01T00:00:00.000Z"
    },
    "user": {
      "international_student": true
    }
  }
}
```

### 2. Update Initial Screening Form
```
PUT /api/initial-screening/:screeningFormId
```

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Payload:**
```json
{
  "workExperienceYears": "3",
  "workExperienceLocation": "Australia",
  "currentState": "VIC",
  "hasFormalQualifications": false,
  "formalQualificationsDetails": "",
  "international_student": false
}
```

### 3. Get User's Initial Screening Forms
```
GET /api/initial-screening/
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "screeningForms": [
      {
        "id": "screening_form_id",
        "certification": {
          "id": "68b80373c716839c3e29e117",
          "name": "CPP20218 - Certificate II in Security Operations",
          "price": 1500
        },
        "workExperienceYears": "5",
        "workExperienceLocation": "Australia",
        "currentState": "NSW",
        "hasFormalQualifications": true,
        "formalQualificationsDetails": "Bachelor's Degree",
        "international_student": true,
        "status": "submitted",
        "submittedAt": "2024-01-01T00:00:00.000Z",
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

### 4. Get Specific Initial Screening Form
```
GET /api/initial-screening/:screeningFormId
```

**Headers:**
```
Authorization: Bearer <token>
```

### 5. Get Correct Enrolment Form
```
GET /api/enrolment-forms/application/:applicationId/enrolment-form
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "applicationId": "application_id",
    "certificationName": "CPP20218 - Certificate II in Security Operations",
    "formDetails": {
      "formId": "68b7e1dc3a96b33ba5448baa",
      "formName": "International Enrolment Form",
      "isInternational": true,
      "studentType": "International"
    },
    "user": {
      "name": "John Doe",
      "international_student": true
    }
  }
}
```

### 2. Get All Application Forms
```
GET /api/enrolment-forms/application/:applicationId/forms
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "applicationId": "application_id",
    "certificationName": "CPP20218 - Certificate II in Security Operations",
    "forms": [
      {
        "stepNumber": 1,
        "formId": "68b7e1dc3a96b33ba5448baa",
        "formName": "International Enrolment Form",
        "title": "International Enrolment Form",
        "filledBy": "user",
        "isEnrolmentForm": true,
        "studentType": "International"
      }
    ],
    "user": {
      "name": "John Doe",
      "international_student": true
    },
    "enrolmentFormDetails": {
      "formId": "68b7e1dc3a96b33ba5448baa",
      "formName": "International Enrolment Form",
      "isInternational": true,
      "studentType": "International"
    }
  }
}
```

### 3. Update International Status
```
PUT /api/enrolment-forms/international-status
```

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Payload:**
```json
{
  "international_student": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "International student status updated",
  "data": {
    "international_student": true
  }
}
```

## Registration/Application Flow

### 1. User Registration
When a user registers, they now provide the `international_student` flag:

```javascript
// Registration payload
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "password": "password123",
  "phoneNumber": "1234567890",
  "certificationId": "68b80373c716839c3e29e117",
  "workExperienceYears": "5",
  "workExperienceLocation": "Australia",
  "currentState": "NSW",
  "hasFormalQualifications": true,
  "formalQualificationsDetails": "Bachelor's Degree",
  "international_student": true  // NEW FIELD
}
```

### 2. Form Selection Logic
The system automatically selects the correct enrolment form based on:
- User's `international_student` flag
- Certification ID (only applies to CPP20218)

### 3. Frontend Integration
```javascript
// Get the correct enrolment form for display
const getEnrolmentForm = async (applicationId) => {
  const response = await fetch(`/api/enrolment-forms/application/${applicationId}/enrolment-form`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return response.json();
};

// Display the correct form
const displayForm = (formData) => {
  if (formData.data.formDetails.isInternational) {
    // Show international enrolment form
    console.log('Showing International Enrolment Form');
  } else {
    // Show local enrolment form
    console.log('Showing Local Enrolment Form');
  }
};
```

## Key Features

1. **Automatic Form Selection**: System automatically selects the correct form based on student type
2. **Profile Integration**: International status is stored in user profile
3. **Screening Integration**: Status is captured during initial screening
4. **Flexible Design**: Only applies to CPP20218, other certifications use default forms
5. **Backward Compatibility**: Existing users default to local student status

## Testing

Use the test script to verify the functionality:
```bash
node scripts/test_student_notifications.js
```

## Notes

- The system only applies special logic to CPP20218 certification
- Other certifications will use their default enrolment forms
- The international_student flag is stored in both user profile and initial screening form
- Forms are dynamically selected based on the user's status at the time of application
