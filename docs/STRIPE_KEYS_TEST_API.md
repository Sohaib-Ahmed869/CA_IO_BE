# Stripe Keys Test API

## Overview

This API endpoint allows you to test Stripe keys validity without any actual money transactions. It validates secret keys, publishable keys, and webhook secrets.

## Endpoint

```
POST /api/stripe-config/test-keys
```

## Authentication

Requires authentication with admin, super_admin, or certified-admin role.

## Request Body

```json
{
  "secretKey": "sk_test_...",
  "publishableKey": "pk_test_...", 
  "webhookSecret": "whsec_..."
}
```

## Response

### Success Response (All Keys Valid)
```json
{
  "success": true,
  "message": "Stripe keys validation completed",
  "data": {
    "secretKey": {
      "status": "PASS",
      "valid": true,
      "accountId": "acct_1234567890",
      "country": "AU",
      "email": "test@example.com",
      "chargesEnabled": true,
      "payoutsEnabled": true,
      "detailsSubmitted": true
    },
    "publishableKey": {
      "status": "PASS",
      "valid": true,
      "environment": "test"
    },
    "webhookSecret": {
      "status": "PASS",
      "valid": true
    },
    "accountInfo": {
      "id": "acct_1234567890",
      "country": "AU",
      "email": "test@example.com",
      "chargesEnabled": true,
      "payoutsEnabled": true,
      "detailsSubmitted": true
    },
    "overallStatus": "PASS"
  }
}
```

### Partial Success Response (Some Keys Invalid)
```json
{
  "success": true,
  "message": "Stripe keys validation completed",
  "data": {
    "secretKey": {
      "status": "PASS",
      "valid": true,
      "accountId": "acct_1234567890",
      "country": "AU",
      "email": "test@example.com",
      "chargesEnabled": true,
      "payoutsEnabled": true,
      "detailsSubmitted": true
    },
    "publishableKey": {
      "status": "FAIL",
      "valid": false,
      "error": "Publishable key must start with \"pk_test_\" or \"pk_live_\""
    },
    "webhookSecret": {
      "status": "PASS",
      "valid": true
    },
    "accountInfo": {
      "id": "acct_1234567890",
      "country": "AU",
      "email": "test@example.com",
      "chargesEnabled": true,
      "payoutsEnabled": true,
      "detailsSubmitted": true
    },
    "overallStatus": "FAIL"
  }
}
```

## What It Tests

### 1. Secret Key Validation
- **Format Check**: Must start with `sk_`
- **API Call**: Tests by calling `stripe.accounts.retrieve()` (no transaction)
- **Account Info**: Returns account details if valid
- **Capabilities**: Shows if charges/payouts are enabled

### 2. Publishable Key Validation
- **Format Check**: Must start with `pk_test_` or `pk_live_`
- **Environment Detection**: Identifies test vs live environment
- **No API Call**: Only validates format (publishable keys don't need API calls)

### 3. Webhook Secret Validation
- **Format Check**: Must start with `whsec_`
- **No API Call**: Only validates format (webhook secrets are used for signature verification)

## Usage Examples

### cURL Example
```bash
curl -X POST http://localhost:5000/api/stripe-config/test-keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "secretKey": "sk_test_51ABC123...",
    "publishableKey": "pk_test_51ABC123...",
    "webhookSecret": "whsec_1234567890abcdef..."
  }'
```

### JavaScript Example
```javascript
const response = await fetch('/api/stripe-config/test-keys', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    secretKey: 'sk_test_51ABC123...',
    publishableKey: 'pk_test_51ABC123...',
    webhookSecret: 'whsec_1234567890abcdef...'
  })
});

const result = await response.json();
console.log('Overall Status:', result.data.overallStatus);
console.log('Secret Key Valid:', result.data.secretKey.valid);
console.log('Account Info:', result.data.accountInfo);
```

## Error Responses

### Missing Keys
```json
{
  "success": true,
  "message": "Stripe keys validation completed",
  "data": {
    "secretKey": {
      "status": "FAIL",
      "valid": false,
      "error": "Secret key is required"
    },
    "publishableKey": {
      "status": "FAIL", 
      "valid": false,
      "error": "Publishable key is required"
    },
    "webhookSecret": {
      "status": "FAIL",
      "valid": false,
      "error": "Webhook secret is required"
    },
    "overallStatus": "FAIL"
  }
}
```

### Invalid Secret Key
```json
{
  "success": true,
  "message": "Stripe keys validation completed",
  "data": {
    "secretKey": {
      "status": "FAIL",
      "valid": false,
      "error": "Invalid API Key provided"
    },
    "overallStatus": "FAIL"
  }
}
```

## Security Notes

1. **No Transactions**: This API never creates actual payments or charges
2. **Read-Only**: Only calls `stripe.accounts.retrieve()` which is read-only
3. **Logging**: All tests are logged for audit purposes
4. **Authentication**: Requires admin-level permissions
5. **No Storage**: Keys are not stored during testing

## Use Cases

- **Setup Validation**: Test keys before saving to database
- **Troubleshooting**: Verify if keys are working correctly
- **Environment Testing**: Ensure test vs live keys are properly configured
- **Capability Checking**: Verify if Stripe account has required permissions
- **Webhook Setup**: Validate webhook secret format before configuration
