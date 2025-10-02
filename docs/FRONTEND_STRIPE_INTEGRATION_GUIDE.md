# 🎨 Frontend Stripe Configuration Integration Guide

## Overview

Complete guide for integrating RTO-specific Stripe configuration management in your frontend application.

## 📋 API Endpoints Summary

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/api/stripe-config/:rtoId/validate` | **Validate Stripe keys** | ✅ Admin |
| `POST` | `/api/stripe-config/:rtoId` | Create Stripe configuration | ✅ Admin |
| `GET` | `/api/stripe-config/:rtoId` | Get Stripe configuration | ✅ Admin |
| `PUT` | `/api/stripe-config/:rtoId` | Update Stripe configuration | ✅ Admin |
| `DELETE` | `/api/stripe-config/:rtoId` | Delete Stripe configuration | ✅ Admin |
| `POST` | `/api/stripe-config/:rtoId/test` | Test Stripe connection | ✅ Admin |
| `GET` | `/api/stripe-config` | List all configurations | ✅ Super Admin |

## 🔧 Frontend Implementation

### **1. React Component Example**

```jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const StripeConfigForm = ({ rtoId, onSuccess }) => {
  const [formData, setFormData] = useState({
    stripeAccountId: '',
    secretKey: '',
    publishableKey: '',
    webhookSecret: '',
    paymentSettings: {
      currency: 'AUD',
      statementDescriptor: 'CERTIFIED',
      statementDescriptorSuffix: '',
      receiptEmail: ''
    }
  });

  const [loading, setLoading] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [errors, setErrors] = useState({});

  // Validate keys before saving
  const validateKeys = async () => {
    setLoading(true);
    setErrors({});
    
    try {
      const response = await axios.post(
        `/api/stripe-config/${rtoId}/validate`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success) {
        setValidationResult(response.data.data);
        return true;
      } else {
        setErrors(response.data.data?.validationResults || {});
        return false;
      }
    } catch (error) {
      if (error.response?.data?.data?.validationResults) {
        setErrors(error.response.data.data.validationResults);
      } else {
        setErrors({ general: error.response?.data?.message || 'Validation failed' });
      }
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Create configuration
  const createConfig = async () => {
    setLoading(true);
    
    try {
      const response = await axios.post(
        `/api/stripe-config/${rtoId}`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success) {
        onSuccess(response.data.data);
        alert('Stripe configuration created successfully!');
      }
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to create configuration');
    } finally {
      setLoading(false);
    }
  };

  // Test connection
  const testConnection = async () => {
    setLoading(true);
    
    try {
      const response = await axios.post(
        `/api/stripe-config/${rtoId}/test`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success) {
        alert('Stripe connection test successful!');
        console.log('Connection details:', response.data.data);
      }
    } catch (error) {
      alert(error.response?.data?.message || 'Connection test failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // First validate keys
    const isValid = await validateKeys();
    if (isValid) {
      // Then create configuration
      await createConfig();
    }
  };

  return (
    <div className="stripe-config-form">
      <h2>Stripe Configuration</h2>
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Stripe Account ID</label>
          <input
            type="text"
            value={formData.stripeAccountId}
            onChange={(e) => setFormData({
              ...formData,
              stripeAccountId: e.target.value
            })}
            placeholder="acct_1234567890123456"
            className={errors.stripeAccountId ? 'error' : ''}
          />
          {errors.stripeAccountId && (
            <span className="error-text">{errors.stripeAccountId}</span>
          )}
        </div>

        <div className="form-group">
          <label>Secret Key</label>
          <input
            type="password"
            value={formData.secretKey}
            onChange={(e) => setFormData({
              ...formData,
              secretKey: e.target.value
            })}
            placeholder="sk_live_..."
            className={errors.secretKey ? 'error' : ''}
          />
          {errors.secretKey && (
            <span className="error-text">{errors.secretKey}</span>
          )}
        </div>

        <div className="form-group">
          <label>Publishable Key</label>
          <input
            type="text"
            value={formData.publishableKey}
            onChange={(e) => setFormData({
              ...formData,
              publishableKey: e.target.value
            })}
            placeholder="pk_live_..."
            className={errors.publishableKey ? 'error' : ''}
          />
          {errors.publishableKey && (
            <span className="error-text">{errors.publishableKey}</span>
          )}
        </div>

        <div className="form-group">
          <label>Webhook Secret</label>
          <input
            type="password"
            value={formData.webhookSecret}
            onChange={(e) => setFormData({
              ...formData,
              webhookSecret: e.target.value
            })}
            placeholder="whsec_..."
            className={errors.webhookSecret ? 'error' : ''}
          />
          {errors.webhookSecret && (
            <span className="error-text">{errors.webhookSecret}</span>
          )}
        </div>

        <div className="form-group">
          <label>Currency</label>
          <select
            value={formData.paymentSettings.currency}
            onChange={(e) => setFormData({
              ...formData,
              paymentSettings: {
                ...formData.paymentSettings,
                currency: e.target.value
              }
            })}
          >
            <option value="AUD">AUD</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>

        <div className="form-group">
          <label>Statement Descriptor Suffix</label>
          <input
            type="text"
            value={formData.paymentSettings.statementDescriptorSuffix}
            onChange={(e) => setFormData({
              ...formData,
              paymentSettings: {
                ...formData.paymentSettings,
                statementDescriptorSuffix: e.target.value
              }
            })}
            placeholder="RTO_CODE"
            maxLength="20"
          />
        </div>

        <div className="form-group">
          <label>Receipt Email</label>
          <input
            type="email"
            value={formData.paymentSettings.receiptEmail}
            onChange={(e) => setFormData({
              ...formData,
              paymentSettings: {
                ...formData.paymentSettings,
                receiptEmail: e.target.value
              }
            })}
            placeholder="admin@rto.com"
          />
        </div>

        {validationResult && (
          <div className="validation-result success">
            <h3>✅ Validation Successful!</h3>
            <p>Account: {validationResult.accountId}</p>
            <p>Type: {validationResult.accountType}</p>
            <p>Country: {validationResult.country}</p>
            <p>Charges Enabled: {validationResult.chargesEnabled ? 'Yes' : 'No'}</p>
            <p>Payouts Enabled: {validationResult.payoutsEnabled ? 'Yes' : 'No'}</p>
          </div>
        )}

        <div className="form-actions">
          <button
            type="button"
            onClick={validateKeys}
            disabled={loading}
            className="btn btn-secondary"
          >
            {loading ? 'Validating...' : 'Validate Keys'}
          </button>
          
          <button
            type="button"
            onClick={testConnection}
            disabled={loading}
            className="btn btn-info"
          >
            {loading ? 'Testing...' : 'Test Connection'}
          </button>
          
          <button
            type="submit"
            disabled={loading || !validationResult?.valid}
            className="btn btn-primary"
          >
            {loading ? 'Creating...' : 'Create Configuration'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default StripeConfigForm;
```

### **2. Vue.js Composition API Example**

```vue
<template>
  <div class="stripe-config-form">
    <h2>Stripe Configuration</h2>
    
    <form @submit.prevent="handleSubmit">
      <div class="form-group">
        <label>Stripe Account ID</label>
        <input
          v-model="formData.stripeAccountId"
          type="text"
          placeholder="acct_1234567890123456"
          :class="{ error: errors.stripeAccountId }"
        />
        <span v-if="errors.stripeAccountId" class="error-text">
          {{ errors.stripeAccountId }}
        </span>
      </div>

      <div class="form-group">
        <label>Secret Key</label>
        <input
          v-model="formData.secretKey"
          type="password"
          placeholder="sk_live_..."
          :class="{ error: errors.secretKey }"
        />
        <span v-if="errors.secretKey" class="error-text">
          {{ errors.secretKey }}
        </span>
      </div>

      <div class="form-group">
        <label>Publishable Key</label>
        <input
          v-model="formData.publishableKey"
          type="text"
          placeholder="pk_live_..."
          :class="{ error: errors.publishableKey }"
        />
        <span v-if="errors.publishableKey" class="error-text">
          {{ errors.publishableKey }}
        </span>
      </div>

      <div class="form-group">
        <label>Webhook Secret</label>
        <input
          v-model="formData.webhookSecret"
          type="password"
          placeholder="whsec_..."
          :class="{ error: errors.webhookSecret }"
        />
        <span v-if="errors.webhookSecret" class="error-text">
          {{ errors.webhookSecret }}
        </span>
      </div>

      <div v-if="validationResult" class="validation-result success">
        <h3>✅ Validation Successful!</h3>
        <p>Account: {{ validationResult.accountId }}</p>
        <p>Type: {{ validationResult.accountType }}</p>
        <p>Country: {{ validationResult.country }}</p>
        <p>Charges Enabled: {{ validationResult.chargesEnabled ? 'Yes' : 'No' }}</p>
        <p>Payouts Enabled: {{ validationResult.payoutsEnabled ? 'Yes' : 'No' }}</p>
      </div>

      <div class="form-actions">
        <button
          type="button"
          @click="validateKeys"
          :disabled="loading"
          class="btn btn-secondary"
        >
          {{ loading ? 'Validating...' : 'Validate Keys' }}
        </button>
        
        <button
          type="button"
          @click="testConnection"
          :disabled="loading"
          class="btn btn-info"
        >
          {{ loading ? 'Testing...' : 'Test Connection' }}
        </button>
        
        <button
          type="submit"
          :disabled="loading || !validationResult?.valid"
          class="btn btn-primary"
        >
          {{ loading ? 'Creating...' : 'Create Configuration' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';
import axios from 'axios';

const props = defineProps(['rtoId']);
const emit = defineEmits(['success']);

const loading = ref(false);
const validationResult = ref(null);
const errors = ref({});

const formData = reactive({
  stripeAccountId: '',
  secretKey: '',
  publishableKey: '',
  webhookSecret: '',
  paymentSettings: {
    currency: 'AUD',
    statementDescriptor: 'CERTIFIED',
    statementDescriptorSuffix: '',
    receiptEmail: ''
  }
});

const validateKeys = async () => {
  loading.value = true;
  errors.value = {};
  
  try {
    const response = await axios.post(
      `/api/stripe-config/${props.rtoId}/validate`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.success) {
      validationResult.value = response.data.data;
      return true;
    } else {
      errors.value = response.data.data?.validationResults || {};
      return false;
    }
  } catch (error) {
    if (error.response?.data?.data?.validationResults) {
      errors.value = error.response.data.data.validationResults;
    } else {
      errors.value = { general: error.response?.data?.message || 'Validation failed' };
    }
    return false;
  } finally {
    loading.value = false;
  }
};

const createConfig = async () => {
  loading.value = true;
  
  try {
    const response = await axios.post(
      `/api/stripe-config/${props.rtoId}`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.success) {
      emit('success', response.data.data);
      alert('Stripe configuration created successfully!');
    }
  } catch (error) {
    alert(error.response?.data?.message || 'Failed to create configuration');
  } finally {
    loading.value = false;
  }
};

const testConnection = async () => {
  loading.value = true;
  
  try {
    const response = await axios.post(
      `/api/stripe-config/${props.rtoId}/test`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.success) {
      alert('Stripe connection test successful!');
      console.log('Connection details:', response.data.data);
    }
  } catch (error) {
    alert(error.response?.data?.message || 'Connection test failed');
  } finally {
    loading.value = false;
  }
};

const handleSubmit = async () => {
  const isValid = await validateKeys();
  if (isValid) {
    await createConfig();
  }
};
</script>

<style scoped>
.stripe-config-form {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.form-group input.error {
  border-color: #dc3545;
}

.error-text {
  color: #dc3545;
  font-size: 14px;
  margin-top: 5px;
}

.validation-result {
  padding: 15px;
  border-radius: 4px;
  margin-bottom: 20px;
}

.validation-result.success {
  background-color: #d4edda;
  border: 1px solid #c3e6cb;
  color: #155724;
}

.form-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background-color: #007bff;
  color: white;
}

.btn-secondary {
  background-color: #6c757d;
  color: white;
}

.btn-info {
  background-color: #17a2b8;
  color: white;
}
</style>
```

### **3. Angular Service Example**

```typescript
// stripe-config.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface StripeConfig {
  stripeAccountId: string;
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  paymentSettings: {
    currency: string;
    statementDescriptor: string;
    statementDescriptorSuffix: string;
    receiptEmail: string;
  };
}

export interface ValidationResult {
  valid: boolean;
  accountId: string;
  accountType: string;
  country: string;
  currency: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  validationResults: {
    stripeAccountId: string;
    secretKey: string;
    publishableKey: string;
    webhookSecret: string;
    accountMatch: boolean;
  };
}

@Injectable({
  providedIn: 'root'
})
export class StripeConfigService {
  private apiUrl = '/api/stripe-config';

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  validateKeys(rtoId: string, config: StripeConfig): Observable<{success: boolean, data: ValidationResult}> {
    return this.http.post<{success: boolean, data: ValidationResult}>(
      `${this.apiUrl}/${rtoId}/validate`,
      config,
      { headers: this.getHeaders() }
    );
  }

  createConfig(rtoId: string, config: StripeConfig): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/${rtoId}`,
      config,
      { headers: this.getHeaders() }
    );
  }

  getConfig(rtoId: string): Observable<any> {
    return this.http.get(
      `${this.apiUrl}/${rtoId}`,
      { headers: this.getHeaders() }
    );
  }

  updateConfig(rtoId: string, config: Partial<StripeConfig>): Observable<any> {
    return this.http.put(
      `${this.apiUrl}/${rtoId}`,
      config,
      { headers: this.getHeaders() }
    );
  }

  deleteConfig(rtoId: string): Observable<any> {
    return this.http.delete(
      `${this.apiUrl}/${rtoId}`,
      { headers: this.getHeaders() }
    );
  }

  testConnection(rtoId: string): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/${rtoId}/test`,
      {},
      { headers: this.getHeaders() }
    );
  }

  getAllConfigs(): Observable<any> {
    return this.http.get(
      `${this.apiUrl}`,
      { headers: this.getHeaders() }
    );
  }
}
```

```typescript
// stripe-config.component.ts
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { StripeConfigService, StripeConfig, ValidationResult } from './stripe-config.service';

@Component({
  selector: 'app-stripe-config',
  templateUrl: './stripe-config.component.html',
  styleUrls: ['./stripe-config.component.css']
})
export class StripeConfigComponent {
  @Input() rtoId!: string;
  @Output() success = new EventEmitter<any>();

  loading = false;
  validationResult: ValidationResult | null = null;
  errors: any = {};

  formData: StripeConfig = {
    stripeAccountId: '',
    secretKey: '',
    publishableKey: '',
    webhookSecret: '',
    paymentSettings: {
      currency: 'AUD',
      statementDescriptor: 'CERTIFIED',
      statementDescriptorSuffix: '',
      receiptEmail: ''
    }
  };

  constructor(private stripeConfigService: StripeConfigService) {}

  async validateKeys() {
    this.loading = true;
    this.errors = {};

    try {
      const response = await this.stripeConfigService.validateKeys(this.rtoId, this.formData).toPromise();
      
      if (response?.success) {
        this.validationResult = response.data;
        return true;
      } else {
        this.errors = response?.data?.validationResults || {};
        return false;
      }
    } catch (error: any) {
      if (error.error?.data?.validationResults) {
        this.errors = error.error.data.validationResults;
      } else {
        this.errors = { general: error.error?.message || 'Validation failed' };
      }
      return false;
    } finally {
      this.loading = false;
    }
  }

  async createConfig() {
    this.loading = true;

    try {
      const response = await this.stripeConfigService.createConfig(this.rtoId, this.formData).toPromise();
      
      if (response?.success) {
        this.success.emit(response.data);
        alert('Stripe configuration created successfully!');
      }
    } catch (error: any) {
      alert(error.error?.message || 'Failed to create configuration');
    } finally {
      this.loading = false;
    }
  }

  async testConnection() {
    this.loading = true;

    try {
      const response = await this.stripeConfigService.testConnection(this.rtoId).toPromise();
      
      if (response?.success) {
        alert('Stripe connection test successful!');
        console.log('Connection details:', response.data);
      }
    } catch (error: any) {
      alert(error.error?.message || 'Connection test failed');
    } finally {
      this.loading = false;
    }
  }

  async onSubmit() {
    const isValid = await this.validateKeys();
    if (isValid) {
      await this.createConfig();
    }
  }
}
```

## 🔍 Error Handling

### **Common Error Scenarios**

```javascript
// Handle validation errors
const handleValidationError = (error) => {
  if (error.response?.data?.data?.validationResults) {
    const results = error.response.data.data.validationResults;
    
    if (results.stripeAccountId === 'invalid') {
      showError('Invalid Stripe account ID format');
    }
    if (results.secretKey === 'invalid') {
      showError('Invalid secret key format or key is not working');
    }
    if (results.publishableKey === 'invalid') {
      showError('Invalid publishable key format');
    }
    if (results.webhookSecret === 'invalid') {
      showError('Invalid webhook secret format');
    }
    if (!results.accountMatch) {
      showError('Account ID does not match the provided secret key');
    }
  }
};

// Handle API errors
const handleApiError = (error) => {
  switch (error.response?.status) {
    case 400:
      showError('Invalid data provided');
      break;
    case 401:
      redirectToLogin();
      break;
    case 403:
      showError('Insufficient permissions');
      break;
    case 404:
      showError('RTO not found');
      break;
    case 409:
      showError('Configuration already exists');
      break;
    case 500:
      showError('Server error. Please try again.');
      break;
    default:
      showError('An unexpected error occurred');
  }
};
```

## 📱 Mobile Integration

### **React Native Example**

```javascript
// stripe-config.service.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = 'https://your-api-domain.com/api';

export const StripeConfigService = {
  async getAuthHeaders() {
    const token = await AsyncStorage.getItem('token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  },

  async validateKeys(rtoId, config) {
    try {
      const response = await fetch(`${API_BASE}/stripe-config/${rtoId}/validate`, {
        method: 'POST',
        headers: await this.getAuthHeaders(),
        body: JSON.stringify(config)
      });

      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error('Network error');
    }
  },

  async createConfig(rtoId, config) {
    try {
      const response = await fetch(`${API_BASE}/stripe-config/${rtoId}`, {
        method: 'POST',
        headers: await this.getAuthHeaders(),
        body: JSON.stringify(config)
      });

      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error('Network error');
    }
  }
};
```

## 🎯 Best Practices

### **1. Always Validate Before Saving**
```javascript
// Good practice: Validate first
const setupStripeConfig = async (rtoId, config) => {
  try {
    // Step 1: Validate keys
    const validation = await validateKeys(rtoId, config);
    
    if (!validation.success || !validation.data.valid) {
      throw new Error('Invalid Stripe keys');
    }
    
    // Step 2: Create configuration
    const result = await createConfig(rtoId, config);
    
    // Step 3: Test connection
    await testConnection(rtoId);
    
    return result;
  } catch (error) {
    console.error('Stripe setup failed:', error);
    throw error;
  }
};
```

### **2. Handle Loading States**
```javascript
const [loading, setLoading] = useState(false);
const [validationLoading, setValidationLoading] = useState(false);
const [testLoading, setTestLoading] = useState(false);

// Separate loading states for different actions
```

### **3. Secure Token Management**
```javascript
// Store token securely
const getToken = () => {
  // Use secure storage in production
  return localStorage.getItem('token');
};

// Refresh token if expired
const refreshToken = async () => {
  // Implement token refresh logic
};
```

This comprehensive guide provides everything needed for frontend integration of the RTO-specific Stripe configuration system!
