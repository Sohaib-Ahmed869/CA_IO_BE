# SMTP Verification API Documentation

## Overview
The SMTP Verification API allows certified administrators to test and validate SMTP configurations before saving them to RTO profiles. This ensures that email functionality will work correctly.

## Endpoints

### 1. Full SMTP Verification
**POST** `/api/rtos/verify-smtp`

**Description:** Performs comprehensive SMTP verification including connection, authentication, and sending capability tests.

**Authorization:** Certified Admin only

**Request Body:**
```json
{
  "emailConfig": {
    "provider": "smtp|gmail|outlook|yahoo|sendgrid|aws-ses|mailgun",
    "host": "smtp.gmail.com",
    "port": 587,
    "secure": false,
    "username": "your-email@gmail.com",
    "password": "your-app-password",
    "fromEmail": "noreply@yourcompany.com",
    "fromName": "Your Company Name",
    "replyTo": "support@yourcompany.com",
    "region": "us-east-1", // For AWS SES only
    "apiKey": "your-api-key" // For SendGrid/Mailgun only
  }
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "SMTP configuration is valid",
  "data": {
    "provider": "gmail",
    "host": "smtp.gmail.com",
    "port": 587,
    "duration": 1250,
    "verified": true
  }
}
```

**Response (Failure):**
```json
{
  "success": false,
  "message": "Authentication failed",
  "data": {
    "error": "Invalid credentials",
    "code": "EAUTH",
    "errorType": "authentication_error"
  }
}
```

### 2. Quick SMTP Verification
**POST** `/api/rtos/verify-smtp/quick`

**Description:** Performs quick SMTP verification (connection and authentication only, no test email sent).

**Authorization:** Certified Admin only

**Request Body:**
```json
{
  "emailConfig": {
    "provider": "smtp",
    "host": "smtp.gmail.com",
    "port": 587,
    "secure": false,
    "username": "your-email@gmail.com",
    "password": "your-app-password",
    "fromEmail": "noreply@yourcompany.com"
  }
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "SMTP configuration is valid",
  "data": {}
}
```

**Response (Failure):**
```json
{
  "success": false,
  "message": "Connection failed",
  "data": {
    "error": "ECONNECTION",
    "code": "ETIMEDOUT"
  }
}
```

## Supported Providers

### 1. Generic SMTP
```json
{
  "provider": "smtp",
  "host": "mail.yourcompany.com",
  "port": 587,
  "secure": false,
  "username": "noreply@yourcompany.com",
  "password": "your-password"
}
```

### 2. Gmail
```json
{
  "provider": "gmail",
  "username": "your-email@gmail.com",
  "password": "your-app-password" // Use App Password, not regular password
}
```

### 3. Outlook/Hotmail
```json
{
  "provider": "outlook",
  "username": "your-email@outlook.com",
  "password": "your-password"
}
```

### 4. Yahoo
```json
{
  "provider": "yahoo",
  "username": "your-email@yahoo.com",
  "password": "your-app-password"
}
```

### 5. SendGrid
```json
{
  "provider": "sendgrid",
  "username": "apikey",
  "apiKey": "SG.your-sendgrid-api-key"
}
```

### 6. AWS SES
```json
{
  "provider": "aws-ses",
  "username": "AKIAIOSFODNN7EXAMPLE", // AWS Access Key ID
  "password": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", // AWS Secret Access Key
  "region": "us-east-1"
}
```

### 7. Mailgun
```json
{
  "provider": "mailgun",
  "username": "postmaster@your-domain.mailgun.org",
  "apiKey": "key-your-mailgun-api-key"
}
```

## Error Types

### Connection Errors
- **ECONNECTION**: Unable to connect to SMTP server
- **ETIMEDOUT**: Connection timeout
- **ENOTFOUND**: SMTP host not found

### Authentication Errors
- **EAUTH**: Invalid credentials
- **535**: Authentication failed (generic)

### Validation Errors
- **validation_error**: Missing required fields
- **sending_error**: Unable to send test email

## Usage Examples

### JavaScript/Frontend
```javascript
// Full verification
const verifySMTP = async (emailConfig) => {
  try {
    const response = await fetch('/api/rtos/verify-smtp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ emailConfig })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('SMTP configuration is valid');
    } else {
      console.error('SMTP verification failed:', result.message);
    }
    
    return result;
  } catch (error) {
    console.error('Error verifying SMTP:', error);
  }
};

// Quick verification
const quickVerifySMTP = async (emailConfig) => {
  try {
    const response = await fetch('/api/rtos/verify-smtp/quick', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ emailConfig })
    });
    
    return await response.json();
  } catch (error) {
    console.error('Error:', error);
  }
};
```

### cURL Examples
```bash
# Full verification
curl -X POST http://localhost:5000/api/rtos/verify-smtp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "emailConfig": {
      "provider": "gmail",
      "username": "your-email@gmail.com",
      "password": "your-app-password",
      "fromEmail": "noreply@yourcompany.com",
      "fromName": "Your Company"
    }
  }'

# Quick verification
curl -X POST http://localhost:5000/api/rtos/verify-smtp/quick \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "emailConfig": {
      "provider": "smtp",
      "host": "smtp.gmail.com",
      "port": 587,
      "username": "your-email@gmail.com",
      "password": "your-app-password"
    }
  }'
```

## Integration with RTO Creation/Update

When creating or updating an RTO with email configuration, SMTP verification is automatically performed unless explicitly disabled:

```json
{
  "name": "My RTO",
  "emailConfig": {
    "provider": "gmail",
    "username": "admin@myrto.com",
    "password": "app-password"
  },
  "verifyEmailConfig": false // Disable automatic verification
}
```

## Security Notes

1. **App Passwords**: Use app passwords for Gmail/Yahoo instead of regular passwords
2. **API Keys**: Store API keys securely, never in client-side code
3. **Credentials**: SMTP credentials are encrypted in the database
4. **Timeout**: 10-second timeout prevents hanging connections
5. **TLS**: Supports self-signed certificates with `rejectUnauthorized: false`

## Troubleshooting

### Common Issues

1. **Gmail Authentication Failed**
   - Enable 2-factor authentication
   - Generate an app password
   - Use app password instead of regular password

2. **Connection Timeout**
   - Check firewall settings
   - Verify port numbers (587 for TLS, 465 for SSL)
   - Check if SMTP server is accessible

3. **Invalid Credentials**
   - Verify username/password
   - Check if account is locked
   - Ensure proper permissions for sending emails

4. **Host Not Found**
   - Verify SMTP host address
   - Check DNS resolution
   - Ensure correct domain spelling
