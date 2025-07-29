# RTO Multi-Tenancy Frontend Guide

## 🌐 Subdomain Architecture

Each RTO gets its own subdomain:
- **ATR Training:** `atrtraining.certified.io`
- **Skills Train:** `skillstrain.certified.io`
- **CertPro:** `certpro.certified.io`

## 🔧 Local Development Setup

### 1. Hosts File Configuration
Add to `C:\Windows\System32\drivers\etc\hosts`:
```
127.0.0.1    atrtraining.localhost
127.0.0.1    skillstrain.localhost
127.0.0.1    certpro.localhost
127.0.0.1    api.localhost
```

### 2. Frontend Environment Variables
```javascript
// .env.local
REACT_APP_API_BASE_URL=http://localhost:5000
REACT_APP_SUBDOMAIN=atrtraining.localhost  // Change per RTO
```

### 3. Dynamic API Base URL
```javascript
// utils/api.js
const getApiBaseUrl = () => {
  const hostname = window.location.hostname;
  const subdomain = hostname.split('.')[0];
  
  // Local development
  if (hostname.includes('localhost')) {
    return `http://${subdomain}.localhost:5000`;
  }
  
  // Production
  return `https://${subdomain}.certified.io`;
};

export const API_BASE_URL = getApiBaseUrl();
```

## 📡 API Endpoints

### Authentication
```javascript
// Login
POST /api/auth/login
{
  "email": "admin@atr.com",
  "password": "password123"
}

// Register (RTO-specific)
POST /api/auth/register
{
  "firstName": "John",
  "lastName": "Doe", 
  "email": "john@atr.com",
  "password": "password123",
  "phoneNumber": "1234567890",
  "phoneCode": "+1"
}
```

### User Management
```javascript
// Get RTO users
GET /api/auth/users?rtoId=68874f7aa2750b5983204a98

// Create RTO user
POST /api/rto/:rtoId/users
{
  "firstName": "New",
  "lastName": "User",
  "email": "newuser@atr.com",
  "password": "password123",
  "userType": "admin",
  "rtoRole": "admin",
  "phoneNumber": "1234567890",
  "phoneCode": "+1"
}

// Get RTO-specific users
GET /api/rto/:rtoId/users
```

### Form Templates (RTO-Specific)
```javascript
// Get RTO form templates
GET /api/form-templates

// Create RTO form template
POST /api/form-templates
{
  "name": "ATR Application Form",
  "description": "Application form for ATR Training",
  "stepNumber": 1,
  "filledBy": "user",
  "formStructure": [...],
  "rtoId": "68874f7aa2750b5983204a98"  // Optional - auto-detected
}

// Update RTO form template
PUT /api/form-templates/:id
{
  "name": "Updated Form Name",
  "rtoId": "68874f7aa2750b5983204a98"
}
```

### Certifications (RTO-Specific)
```javascript
// Get RTO certifications
GET /api/certifications

// Create RTO certification
POST /api/certifications
{
  "name": "ATR Certification Program",
  "price": 299.99,
  "description": "Certification for ATR Training",
  "formTemplateIds": [...],
  "rtoId": "68874f7aa2750b5983204a98"  // Optional - auto-detected
}
```

### Applications (RTO-Specific)
```javascript
// Get RTO applications
GET /api/admin/applications

// Get RTO application stats
GET /api/admin/applications/stats
```

### Students (RTO-Specific)
```javascript
// Get RTO students
GET /api/admin/students
```

### Payments (RTO-Specific)
```javascript
// Get RTO payments
GET /api/admin/payments

// Get RTO payment stats
GET /api/admin/payments/stats
```

### Certificates (RTO-Specific)
```javascript
// Get RTO issued certificates
GET /api/admin/certificates
```

## 🎯 Frontend Implementation

### 1. RTO Context Provider
```javascript
// contexts/RTOContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';

const RTOContext = createContext();

export const RTOProvider = ({ children }) => {
  const [rtoInfo, setRtoInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const detectRTO = () => {
      const hostname = window.location.hostname;
      const subdomain = hostname.split('.')[0];
      
      // Skip for api, www, certified subdomains
      if (['api', 'www', 'certified'].includes(subdomain)) {
        setRtoInfo(null);
        setLoading(false);
        return;
      }

      // Set RTO context
      setRtoInfo({
        subdomain,
        apiBaseUrl: getApiBaseUrl()
      });
      setLoading(false);
    };

    detectRTO();
  }, []);

  return (
    <RTOContext.Provider value={{ rtoInfo, loading }}>
      {children}
    </RTOContext.Provider>
  );
};

export const useRTO = () => useContext(RTOContext);
```

### 2. API Service with RTO Context
```javascript
// services/api.js
import { useRTO } from '../contexts/RTOContext';

export const useApi = () => {
  const { rtoInfo } = useRTO();
  
  const apiCall = async (endpoint, options = {}) => {
    const baseUrl = rtoInfo?.apiBaseUrl || process.env.REACT_APP_API_BASE_URL;
    const url = `${baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    return response.json();
  };

  return { apiCall };
};
```

### 3. Component Usage
```javascript
// components/UserList.js
import React, { useState, useEffect } from 'react';
import { useApi } from '../services/api';

const UserList = () => {
  const [users, setUsers] = useState([]);
  const { apiCall } = useApi();

  useEffect(() => {
    const fetchUsers = async () => {
      const response = await apiCall('/api/auth/users');
      if (response.success) {
        setUsers(response.data.users);
      }
    };

    fetchUsers();
  }, []);

  return (
    <div>
      <h2>RTO Users</h2>
      {users.map(user => (
        <div key={user._id}>
          {user.firstName} {user.lastName} - {user.email}
        </div>
      ))}
    </div>
  );
};
```

### 4. App Structure
```javascript
// App.js
import { RTOProvider } from './contexts/RTOContext';

function App() {
  return (
    <RTOProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/users" element={<UserList />} />
          <Route path="/form-templates" element={<FormTemplates />} />
          <Route path="/certifications" element={<Certifications />} />
        </Routes>
      </Router>
    </RTOProvider>
  );
}
```

## 🔐 Authentication Flow

### 1. Login with RTO Context
```javascript
// components/Login.js
const Login = () => {
  const { apiCall } = useApi();
  const [credentials, setCredentials] = useState({});

  const handleLogin = async (e) => {
    e.preventDefault();
    
    const response = await apiCall('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });

    if (response.success) {
      localStorage.setItem('token', response.token);
      // Redirect to dashboard
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <input 
        type="email" 
        placeholder="Email"
        onChange={(e) => setCredentials({...credentials, email: e.target.value})}
      />
      <input 
        type="password" 
        placeholder="Password"
        onChange={(e) => setCredentials({...credentials, password: e.target.value})}
      />
      <button type="submit">Login</button>
    </form>
  );
};
```

### 2. Protected Routes
```javascript
// components/ProtectedRoute.js
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  
  if (!token) {
    return <Navigate to="/login" />;
  }
  
  return children;
};
```

## 🎨 UI Considerations

### 1. RTO Branding
```javascript
// components/RTOLogo.js
const RTOLogo = () => {
  const { rtoInfo } = useRTO();
  
  return (
    <div className="rto-logo">
      <img src={`/api/rto/${rtoInfo?.subdomain}/logo`} alt="RTO Logo" />
      <h1>{rtoInfo?.subdomain} Dashboard</h1>
    </div>
  );
};
```

### 2. RTO-Specific Styling
```javascript
// styles/rto-themes.css
.atrtraining {
  --primary-color: #2563eb;
  --secondary-color: #1e40af;
}

.skillstrain {
  --primary-color: #059669;
  --secondary-color: #047857;
}

.certpro {
  --primary-color: #dc2626;
  --secondary-color: #b91c1c;
}
```

## 🧪 Testing Strategy

### 1. Local Testing URLs
- **ATR Training:** `http://atrtraining.localhost:3000`
- **Skills Train:** `http://skillstrain.localhost:3000`
- **CertPro:** `http://certpro.localhost:3000`

### 2. Test Credentials
```javascript
// Test users for each RTO
const testUsers = {
  atrtraining: {
    admin: { email: 'admin@atr.com', password: 'password123' },
    assessor: { email: 'assessor@atr.com', password: 'password123' },
    student: { email: 'student@atr.com', password: 'password123' }
  },
  skillstrain: {
    admin: { email: 'admin@skills.com', password: 'password123' },
    assessor: { email: 'assessor@skills.com', password: 'password123' },
    student: { email: 'student@skills.com', password: 'password123' }
  },
  certpro: {
    admin: { email: 'admin@certpro.com', password: 'password123' },
    assessor: { email: 'assessor@certpro.com', password: 'password123' },
    student: { email: 'student@certpro.com', password: 'password123' }
  }
};
```

## 🚀 Deployment Considerations

### 1. Environment Variables
```bash
# Production
REACT_APP_API_BASE_URL=https://api.certified.io
REACT_APP_SUBDOMAIN=atrtraining

# Staging
REACT_APP_API_BASE_URL=https://api-staging.certified.io
REACT_APP_SUBDOMAIN=skillstrain
```

### 2. Build Process
```javascript
// package.json
{
  "scripts": {
    "build:atr": "REACT_APP_SUBDOMAIN=atrtraining npm run build",
    "build:skills": "REACT_APP_SUBDOMAIN=skillstrain npm run build",
    "build:certpro": "REACT_APP_SUBDOMAIN=certpro npm run build"
  }
}
```

## 📝 Key Points for Frontend Team

1. **Automatic RTO Detection:** The system automatically detects RTO from subdomain
2. **API Isolation:** Each RTO's API calls are automatically filtered
3. **No Breaking Changes:** Existing APIs work the same way
4. **Backward Compatible:** Legacy data (without rtoId) is still accessible
5. **Query Parameters:** You can still use `?rtoId=...` for specific RTO access

## 🔧 Quick Start Checklist

- [ ] Add subdomain entries to hosts file
- [ ] Set up RTOContext provider
- [ ] Update API service to use dynamic base URL
- [ ] Test login with different RTO subdomains
- [ ] Verify user isolation per RTO
- [ ] Test form template and certification creation
- [ ] Implement RTO-specific branding
- [ ] Set up protected routes
- [ ] Test all CRUD operations per RTO 