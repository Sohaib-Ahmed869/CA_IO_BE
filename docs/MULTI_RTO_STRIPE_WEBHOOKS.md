# Multi-RTO Stripe Webhook Configuration

## Overview

This document explains how the unified backend handles Stripe webhooks for multiple RTOs (Registered Training Organizations) with separate Stripe accounts.

## Architecture

### Single Endpoint, Multiple RTOs
- **Webhook Endpoint**: `/api/webhooks/stripe` (unchanged)
- **Multiple Stripe Accounts**: Each RTO has its own Stripe account
- **Dynamic Secret Resolution**: Webhook secret determined by RTO context in payload

### How It Works

1. **Webhook Reception**: All Stripe webhooks hit the same endpoint
2. **RTO Detection**: Extract `rtoId` from webhook payload metadata
3. **Secret Resolution**: Look up RTO-specific webhook secret from `StripeConfig`
4. **Signature Verification**: Verify webhook signature using correct secret
5. **Processing**: Process webhook with RTO context

## Data Flow

```
Stripe Webhook → /api/webhooks/stripe
    ↓
Extract rtoId from payload.metadata
    ↓
Query StripeConfig.findOne({ rtoId })
    ↓
Get webhookSecret from StripeConfig
    ↓
Verify signature with RTO-specific secret
    ↓
Process webhook with RTO context
```

## Configuration Requirements

### 1. StripeConfig Model
Each RTO needs a `StripeConfig` document:
```javascript
{
  rtoId: ObjectId,           // Links to RTO
  stripeAccountId: String,   // acct_xxxxx
  secretKey: String,         // Encrypted
  publishableKey: String,    // Encrypted
  webhookSecret: String,     // Encrypted - CRITICAL for webhooks
  isActive: Boolean,         // Must be true
  // ... other config
}
```

### 2. Payment Intent Metadata
When creating payment intents, include RTO context:
```javascript
const paymentIntent = await stripe.paymentIntents.create({
  amount: amount,
  currency: 'aud',
  customer: customerId,
  metadata: {
    rtoId: rtoId.toString(),  // REQUIRED for webhook routing
    applicationId: applicationId,
    userId: userId
  }
});
```

### 3. Environment Variables
Global fallback (for backward compatibility):
```env
STRIPE_SECRET_KEY=sk_test_...      # Fallback only
STRIPE_WEBHOOK_SECRET=whsec_...    # Fallback only
```

## Webhook Handler Logic

### Signature Verification Process
```javascript
// 1. Parse raw body to extract RTO context
const eventData = JSON.parse(rawBody);
const rtoId = eventData.data?.object?.metadata?.rtoId;

// 2. Get RTO-specific Stripe config
if (rtoId) {
  stripeConfig = await StripeConfig.findOne({ rtoId });
  webhookSecret = stripeConfig.getDecryptedWebhookSecret();
  event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
} else {
  // Fallback to global secret
  event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
}
```

### RTO Context Propagation
```javascript
const rtoContext = {
  rtoId: stripeConfig.rtoId,
  stripeConfig: stripeConfig,
  stripeInstance: stripe(stripeConfig.getDecryptedSecretKey())
};

// Pass to all handlers
await handlePaymentIntentSucceeded(event.data.object, rtoContext);
```

## Setup Instructions

### 1. Configure Each RTO's Stripe Account
For each RTO, create a `StripeConfig` document with:
- Valid Stripe account credentials
- Webhook endpoint: `https://yourdomain.com/api/webhooks/stripe`
- Webhook secret from Stripe dashboard

### 2. Update Payment Creation
Ensure all payment intents include `rtoId` in metadata:
```javascript
metadata: {
  rtoId: rtoId.toString(),  // REQUIRED
  // ... other metadata
}
```

### 3. Test Webhook Delivery
- Use Stripe CLI: `stripe listen --forward-to localhost:5000/api/webhooks/stripe`
- Check logs for RTO context resolution
- Verify signature verification works for each RTO

## Error Handling

### Common Issues
1. **No RTO Metadata**: Falls back to global webhook secret
2. **Invalid RTO ID**: Returns 400 error with specific message
3. **Inactive Config**: Returns 400 error if `isActive: false`
4. **Missing Webhook Secret**: Returns 400 error

### Logging
All webhook events are logged with RTO context:
```javascript
logMe('webhook.payment_completed', {
  paymentId: payment._id,
  rtoId: rtoContext?.rtoId || 'unknown',
  eventType: event.type
}, 'info');
```

## Security Considerations

1. **Webhook Secrets**: Stored encrypted in database
2. **Signature Verification**: Uses correct secret per RTO
3. **RTO Isolation**: Each RTO's payments are processed with its context
4. **Fallback Security**: Global secret only used when RTO context unavailable

## Migration from Single RTO

1. Create `StripeConfig` documents for existing RTOs
2. Update payment creation to include `rtoId` metadata
3. Configure webhook endpoints in Stripe dashboards
4. Test webhook delivery for each RTO
5. Monitor logs for proper RTO context resolution

## Troubleshooting

### Webhook Signature Verification Failed
- Check if `rtoId` exists in payment intent metadata
- Verify `StripeConfig` exists and is active
- Confirm webhook secret is correct in Stripe dashboard

### No RTO Context in Logs
- Ensure payment intents include `rtoId` in metadata
- Check `StripeConfig` document exists for the RTO
- Verify RTO is active (`isActive: true`)

### Webhook Processing Errors
- Check RTO-specific Stripe instance initialization
- Verify all payment handlers accept `rtoContext` parameter
- Review logs for specific error messages with RTO context
