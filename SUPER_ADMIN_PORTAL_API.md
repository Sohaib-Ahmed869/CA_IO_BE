# Super Admin Portal API Documentation

This document provides the complete API endpoints for the Super Admin Portal frontend.

## Authentication

### Login
- **Endpoint**: `POST /api/auth/login`
- **Description**: Login for super admin users
- **Body**:
  ```json
  {
    "email": "superadmin@certified.io",
    "password": "SuperAdmin123!"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "user_id",
        "firstName": "Super",
        "lastName": "Admin",
        "email": "superadmin@certified.io",
        "userType": "super_admin"
      },
      "token": "jwt_token"
    }
  }
  ```

## Super Admin Portal APIs

### Dashboard Statistics
- **Endpoint**: `GET /api/super-admin-portal/dashboard/stats`
- **Headers**: `Authorization: Bearer <token>`
- **Description**: Get comprehensive system statistics
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "users": {
        "total": 150,
        "active": 120,
        "superAdmins": 2,
        "admins": 5,
        "assessors": 10,
        "regularUsers": 133
      },
      "formTemplates": {
        "total": 25,
        "active": 20
      },
      "certifications": {
        "total": 15,
        "active": 12
      },
      "applications": {
        "total": 300,
        "pending": 50,
        "processing": 100,
        "completed": 150
      },
      "payments": {
        "total": 250,
        "successful": 200,
        "pending": 50
      },
      "certificates": {
        "total": 120,
        "issued": 100
      }
    }
  }
  ```

### Form Templates Management

#### Get All Form Templates
- **Endpoint**: `GET /api/super-admin-portal/form-templates`
- **Headers**: `Authorization: Bearer <token>`
- **Query Parameters**:
  - `page` (optional): Page number (default: 1)
  - `limit` (optional): Items per page (default: 20)
  - `search` (optional): Search by name or description
  - `filledBy` (optional): Filter by filledBy type
  - `isActive` (optional): Filter by active status
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "formTemplates": [
        {
          "_id": "template_id",
          "name": "Enrollment Form",
          "description": "Initial enrollment form",
          "stepNumber": 1,
          "filledBy": "user",
          "formStructure": {...},
          "isActive": true,
          "createdAt": "2024-01-01T00:00:00.000Z",
          "updatedAt": "2024-01-01T00:00:00.000Z"
        }
      ],
      "pagination": {
        "currentPage": 1,
        "totalPages": 5,
        "totalFormTemplates": 100,
        "hasNextPage": true,
        "hasPrevPage": false
      },
      "filters": {
        "filledByCounts": [
          {"_id": "user", "count": 50},
          {"_id": "assessor", "count": 30},
          {"_id": "third-party", "count": 20}
        ]
      }
    }
  }
  ```

#### Get Form Template by ID
- **Endpoint**: `GET /api/super-admin-portal/form-templates/:id`
- **Headers**: `Authorization: Bearer <token>`
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "_id": "template_id",
      "name": "Enrollment Form",
      "description": "Initial enrollment form",
      "stepNumber": 1,
      "filledBy": "user",
      "formStructure": {...},
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
  ```

#### Get Form Templates for Dropdown
- **Endpoint**: `GET /api/super-admin-portal/form-templates/dropdown`
- **Headers**: `Authorization: Bearer <token>`
- **Description**: Get simplified form templates for dropdown selection
- **Response**:
  ```json
  {
    "success": true,
    "data": [
      {
        "_id": "template_id",
        "name": "Enrollment Form",
        "description": "Initial enrollment form",
        "stepNumber": 1,
        "filledBy": "user"
      }
    ]
  }
  ```

#### Create Form Template
- **Endpoint**: `POST /api/form-templates`
- **Headers**: `Authorization: Bearer <token>`
- **Body**:
  ```json
  {
    "name": "New Form Template",
    "description": "Description of the form",
    "stepNumber": 1,
    "filledBy": "user",
    "formStructure": {
      "fields": [
        {
          "type": "text",
          "label": "Full Name",
          "required": true,
          "name": "fullName"
        }
      ]
    }
  }
  ```

#### Update Form Template
- **Endpoint**: `PUT /api/form-templates/:id`
- **Headers**: `Authorization: Bearer <token>`
- **Body**: Same as create, but all fields optional

#### Delete Form Template
- **Endpoint**: `DELETE /api/form-templates/:id`
- **Headers**: `Authorization: Bearer <token>`

### Certifications Management

#### Get All Certifications
- **Endpoint**: `GET /api/super-admin-portal/certifications`
- **Headers**: `Authorization: Bearer <token>`
- **Query Parameters**:
  - `page` (optional): Page number (default: 1)
  - `limit` (optional): Items per page (default: 20)
  - `search` (optional): Search by name or description
  - `isActive` (optional): Filter by active status
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "certifications": [
        {
          "_id": "certification_id",
          "name": "Advanced Certification",
          "description": "Advanced level certification",
          "price": 500,
          "formTemplateIds": [
            {
              "stepNumber": 1,
              "formTemplateId": {
                "_id": "template_id",
                "name": "Enrollment Form",
                "description": "Initial enrollment form"
              },
              "filledBy": "user",
              "title": "Step 1: Enrollment"
            }
          ],
          "isActive": true,
          "baseExpense": 100,
          "createdAt": "2024-01-01T00:00:00.000Z",
          "updatedAt": "2024-01-01T00:00:00.000Z"
        }
      ],
      "pagination": {
        "currentPage": 1,
        "totalPages": 3,
        "totalCertifications": 50,
        "hasNextPage": true,
        "hasPrevPage": false
      }
    }
  }
  ```

#### Get Certification by ID
- **Endpoint**: `GET /api/super-admin-portal/certifications/:id`
- **Headers**: `Authorization: Bearer <token>`
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "_id": "certification_id",
      "name": "Advanced Certification",
      "description": "Advanced level certification",
      "price": 500,
      "formTemplateIds": [
        {
          "stepNumber": 1,
          "formTemplateId": {
            "_id": "template_id",
            "name": "Enrollment Form",
            "description": "Initial enrollment form",
            "stepNumber": 1,
            "filledBy": "user"
          },
          "filledBy": "user",
          "title": "Step 1: Enrollment"
        }
      ],
      "isActive": true,
      "baseExpense": 100
    }
  }
  ```

#### Create Certification
- **Endpoint**: `POST /api/certifications`
- **Headers**: `Authorization: Bearer <token>`
- **Body**:
  ```json
  {
    "name": "New Certification",
    "description": "Description of the certification",
    "price": 500,
    "formTemplateIds": [
      {
        "stepNumber": 1,
        "formTemplateId": "template_id",
        "filledBy": "user",
        "title": "Step 1: Enrollment"
      }
    ],
    "baseExpense": 100
  }
  ```

#### Update Certification
- **Endpoint**: `PUT /api/certifications/:id`
- **Headers**: `Authorization: Bearer <token>`
- **Body**: Same as create, but all fields optional

#### Update Certification Expense
- **Endpoint**: `PUT /api/certifications/:id/expense`
- **Headers**: `Authorization: Bearer <token>`
- **Body**:
  ```json
  {
    "baseExpense": 150
  }
  ```

#### Delete Certification
- **Endpoint**: `DELETE /api/certifications/:id`
- **Headers**: `Authorization: Bearer <token>`

## User Management (Super Admin Only)

### Get All Users
- **Endpoint**: `GET /api/auth/users`
- **Headers**: `Authorization: Bearer <token>`
- **Query Parameters**:
  - `page` (optional): Page number (default: 1)
  - `limit` (optional): Items per page (default: 10)
  - `userType` (optional): Filter by user type
  - `search` (optional): Search by name or email

### Update User Status
- **Endpoint**: `PUT /api/auth/users/:userId/status`
- **Headers**: `Authorization: Bearer <token>`
- **Body**:
  ```json
  {
    "isActive": false
  }
  ```

## System Management (Super Admin Only)

### Get System Statistics
- **Endpoint**: `GET /api/super-admin/stats`
- **Headers**: `Authorization: Bearer <token>`

### Get User Management Data
- **Endpoint**: `GET /api/super-admin/users`
- **Headers**: `Authorization: Bearer <token>`

### Update User Permissions
- **Endpoint**: `PUT /api/super-admin/users/:userId/permissions`
- **Headers**: `Authorization: Bearer <token>`
- **Body**:
  ```json
  {
    "permissions": [
      {
        "module": "users",
        "actions": ["read", "write", "update", "delete"]
      }
    ]
  }
  ```

### Delete User
- **Endpoint**: `DELETE /api/super-admin/users/:userId`
- **Headers**: `Authorization: Bearer <token>`

## Error Responses

All endpoints return error responses in this format:
```json
{
  "success": false,
  "message": "Error description"
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized (invalid token)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found
- `500`: Internal Server Error

## Frontend Implementation Notes

1. **Authentication**: Store the JWT token in localStorage or secure storage
2. **Token Refresh**: Implement token refresh logic if needed
3. **Error Handling**: Handle all error responses gracefully
4. **Loading States**: Show loading indicators for API calls
5. **Pagination**: Implement pagination for list endpoints
6. **Search & Filters**: Implement search and filter functionality
7. **Form Validation**: Validate forms before submission
8. **Confirmation Dialogs**: Add confirmation for destructive actions

## Example Frontend Usage

```javascript
// Login
const login = async (email, password) => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password })
  });
  const data = await response.json();
  if (data.success) {
    localStorage.setItem('token', data.data.token);
    localStorage.setItem('user', JSON.stringify(data.data.user));
  }
  return data;
};

// Get dashboard stats
const getDashboardStats = async () => {
  const token = localStorage.getItem('token');
  const response = await fetch('/api/super-admin-portal/dashboard/stats', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  return await response.json();
};

// Create form template
const createFormTemplate = async (formData) => {
  const token = localStorage.getItem('token');
  const response = await fetch('/api/form-templates', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(formData)
  });
  return await response.json();
};
``` 