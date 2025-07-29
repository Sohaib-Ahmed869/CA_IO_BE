# 🚀 Frontend Quick Start - RTO Multi-Tenancy

## 📋 What Changed

- **Subdomain-based RTO system** - Each RTO gets its own subdomain
- **Automatic data isolation** - APIs automatically filter data per RTO
- **No breaking changes** - Existing APIs work the same way

## 🔧 Setup (5 minutes)

### 1. Add to hosts file (`C:\Windows\System32\drivers\etc\hosts`):
```
127.0.0.1    atrtraining.localhost
127.0.0.1    skillstrain.localhost
127.0.0.1    certpro.localhost
```

### 2. Update your API service:
```javascript
// utils/api.js
const getApiBaseUrl = () => {
  const hostname = window.location.hostname;
  const subdomain = hostname.split('.')[0];
  
  if (hostname.includes('localhost')) {
    return `http://${subdomain}.localhost:5000`;
  }
  return `https://${subdomain}.certified.io`;
};

export const API_BASE_URL = getApiBaseUrl();
```

### 3. Test URLs:
- **ATR Training:** `http://atrtraining.localhost:3000`
- **Skills Train:** `http://skillstrain.localhost:3000`
- **CertPro:** `http://certpro.localhost:3000`

## 🔑 Test Credentials

| RTO | Email | Password |
|-----|-------|----------|
| ATR Training | `admin@atr.com` | `password123` |
| Skills Train | `admin@skills.com` | `password123` |
| CertPro | `admin@certpro.com` | `password123` |

## 📡 API Endpoints (Same as before, but RTO-specific)

```javascript
// All these endpoints now return RTO-specific data automatically:

// Users
GET /api/auth/users                    // RTO users only
POST /api/auth/register               // Creates RTO user

// Form Templates
GET /api/form-templates               // RTO templates only
POST /api/form-templates              // Creates RTO template

// Certifications
GET /api/certifications               // RTO certifications only
POST /api/certifications              // Creates RTO certification

// Applications
GET /api/admin/applications           // RTO applications only

// Students
GET /api/admin/students               // RTO students only

// Payments
GET /api/admin/payments               // RTO payments only

// Certificates
GET /api/admin/certificates           // RTO certificates only
```

## 🎯 Key Points

1. **No changes needed** - Existing API calls work the same
2. **Automatic filtering** - Data is automatically filtered per RTO
3. **Subdomain detection** - System detects RTO from URL
4. **Backward compatible** - Legacy data still accessible

## 🧪 Testing

1. **Start your frontend:** `npm start`
2. **Visit:** `http://atrtraining.localhost:3000`
3. **Login with:** `admin@atr.com` / `password123`
4. **Verify:** You only see ATR Training data
5. **Test other RTOs:** `http://skillstrain.localhost:3000`

## ❓ Questions?

- **Q:** Do I need to change existing API calls?
- **A:** No, they work exactly the same

- **Q:** How does the system know which RTO?
- **A:** Automatically from subdomain (atrtraining.localhost → ATR Training)

- **Q:** What if I need global data?
- **A:** Use `api.localhost:3000` for global access

## 🚨 Important Notes

- **Always test with different subdomains** to verify isolation
- **Use the test credentials** provided above
- **Check browser console** for any API errors
- **Verify data isolation** - each RTO should only see their own data 