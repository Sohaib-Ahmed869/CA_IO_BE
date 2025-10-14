# 🔐 Automatic Token Management Setup

## 🎯 **What's New**

The health check system now **automatically manages auth tokens** for all environments! No more manual token setup required.

---

## 🔧 **How It Works**

### **1. Automatic Login Process**
```python
# For each environment, the system:
1. Logs into backend using admin credentials
2. Retrieves JWT token from login response  
3. Sets token in environment file
4. Runs health checks with valid authentication
```

### **2. Credential Configuration**
**Update `environment_credentials.json`:**
```json
{
  "environments": [
    {
      "name": "EBC Backend",
      "base_url": "https://ebcbackend.certified.io/api",
      "admin_email": "YOUR_EBC_ADMIN_EMAIL",
      "admin_password": "YOUR_EBC_ADMIN_PASSWORD"
    },
    {
      "name": "Demo Backend", 
      "base_url": "https://backendstaging.certified.io/api",
      "admin_email": "YOUR_DEMO_ADMIN_EMAIL",
      "admin_password": "YOUR_DEMO_ADMIN_PASSWORD"
    },
    {
      "name": "ETraining Backend",
      "base_url": "https://etrainingbackend.certified.io/api", 
      "admin_email": "YOUR_ETRAINING_ADMIN_EMAIL",
      "admin_password": "YOUR_ETRAINING_ADMIN_PASSWORD"
    }
  ]
}
```

---

## 🚀 **Updated Files**

### **1. `airflow_health_check_dag.py`**
- ✅ Added `get_auth_tokens()` function
- ✅ Automatic login for all environments
- ✅ Token retrieval and environment file creation
- ✅ Error handling for failed logins

### **2. `run_health_checks.py`**
- ✅ Added `get_auth_token()` function  
- ✅ Automatic token management
- ✅ Enhanced logging with token status

### **3. `environment_credentials.json`**
- ✅ Centralized credential configuration
- ✅ Easy to update admin credentials
- ✅ Security notes and best practices

---

## 📊 **Sample Output with Token Management**

```
🚀 CA IO Backend Health Check Runner
==================================================

🔐 Getting auth token for EBC Backend...
✅ EBC Backend auth token obtained successfully
✅ Created environment file: ebc-backend-env.json with auth token

🔐 Getting auth token for Demo Backend...
✅ Demo Backend auth token obtained successfully
✅ Created environment file: demo-backend-env.json with auth token

🔐 Getting auth token for ETraining Backend...
✅ ETraining Backend auth token obtained successfully
✅ Created environment file: etraining-backend-env.json with auth token

🔍 Running health check for EBC Backend...
   URL: https://ebcbackend.certified.io/api
✅ [EBC Backend] Certifications API is healthy - 15 certifications found
✅ [EBC Backend] Authentication system is healthy - User: admin@ebc.com
✅ [EBC Backend] Applications API is healthy - 47 total applications
✅ EBC Backend health check PASSED
   📊 Tests: 27 total, 0 failed
   ⏱️  Duration: 1250ms

🔍 Running health check for Demo Backend...
   URL: https://backendstaging.certified.io/api
✅ [Demo Backend] Certifications API is healthy - 12 certifications found
✅ Demo Backend health check PASSED

🔍 Running health check for ETraining Backend...
   URL: https://etrainingbackend.certified.io/api
✅ [ETraining Backend] Certifications API is healthy - 8 certifications found
✅ ETraining Backend health check PASSED

============================================================
🎯 HEALTH CHECK SUMMARY - 2024-01-15T12:00:00.000Z
============================================================
📊 Overall Status: PASS
📈 Passed: 3/3
📉 Failed: 0/3

Environment Details:
  ✅ EBC Backend: PASS
  ✅ Demo Backend: PASS
  ✅ ETraining Backend: PASS
============================================================

🎉 All health checks passed!
```

---

## ⚠️ **Error Handling**

### **Failed Login Scenarios:**
```
🔐 Getting auth token for EBC Backend...
❌ EBC Backend login failed: Invalid credentials
⚠️  Created environment file: ebc-backend-env.json without auth token

🔍 Running health check for EBC Backend...
❌ EBC Backend health check FAILED
   Error: Authentication required
```

### **Network Issues:**
```
🔐 Getting auth token for Demo Backend...
💥 Demo Backend login error: Connection timeout
⚠️  Created environment file: demo-backend-env.json without auth token
```

---

## 🔒 **Security Best Practices**

### **1. Credential Management**
- ✅ **Keep credentials secure** - Don't commit to version control
- ✅ **Use environment variables** in production
- ✅ **Rotate passwords regularly**
- ✅ **Limit admin account permissions**

### **2. File Security**
```bash
# Set proper permissions
chmod 600 environment_credentials.json

# Add to .gitignore
echo "environment_credentials.json" >> .gitignore
```

### **3. Airflow Security**
```python
# Use Airflow Variables for credentials
from airflow.models import Variable

admin_email = Variable.get("ebc_admin_email")
admin_password = Variable.get("ebc_admin_password")
```

---

## 🛠️ **Setup Instructions**

### **1. Update Credentials**
```bash
# Edit the credentials file
nano environment_credentials.json

# Update with your actual admin credentials
```

### **2. Test Token Retrieval**
```bash
# Test the Python script
python3 run_health_checks.py

# Check if tokens are retrieved successfully
```

### **3. Deploy to Airflow**
```bash
# Copy files to Airflow DAGs directory
cp airflow_health_check_dag.py /opt/airflow/dags/
cp run_health_checks.py /opt/airflow/dags/
cp postman_sanity_tests.json /opt/airflow/dags/
cp environment_credentials.json /opt/airflow/dags/

# Set secure permissions
chmod 600 /opt/airflow/dags/environment_credentials.json
```

---

## 🎯 **Benefits**

### **✅ Fully Automated**
- No manual token setup required
- Automatic login and token refresh
- Seamless health check execution

### **✅ Secure**
- Centralized credential management
- No hardcoded tokens in code
- Easy credential rotation

### **✅ Reliable**
- Error handling for failed logins
- Graceful degradation without tokens
- Detailed logging and monitoring

### **✅ Maintainable**
- Single configuration file
- Easy to add new environments
- Clear separation of concerns

---

## 🚀 **Ready to Use!**

Your health check system now automatically handles authentication for all three environments. Just update the credentials and run - everything else is handled automatically! 🎉
