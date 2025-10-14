# 🌐 CA IO Backend - Multi-Environment Health Check Setup

## 📁 Files Created

1. **`postman_environments.json`** - All three environment configurations
2. **`postman_sanity_tests.json`** - Updated with environment-specific logging
3. **`airflow_health_check_dag.py`** - Complex Airflow DAG with individual tasks
4. **`simple_health_check_dag.py`** - Simple Airflow DAG using Python script
5. **`run_health_checks.py`** - Python script for running all health checks
6. **`MULTI_ENVIRONMENT_SETUP.md`** - This setup guide

---

## 🌍 Environment Configurations

### **Three Backend Environments:**

#### **1. EBC Backend Environment**
- **Name**: `EBC Backend Environment`
- **URL**: `https://ebcbackend.certified.io/api`
- **Purpose**: Production EBC backend

#### **2. Demo Backend Environment**
- **Name**: `Demo Backend Environment`
- **URL**: `https://demobackend.certified.io/api`
- **Purpose**: Demo/testing environment

#### **3. ETraining Backend Environment**
- **Name**: `ETraining Backend Environment`
- **URL**: `https://etrainingbackend.certified.io/api`
- **Purpose**: ETraining backend

---

## 🚀 Setup Instructions

### **1. Import Collections and Environments**

1. **Open Postman**
2. **Import Files:**
   - `postman_sanity_tests.json` (collection)
   - `postman_environments.json` (environments)
3. **Select Environment** from dropdown to test each backend

### **2. Configure Admin Credentials**

**Update the credentials in `environment_credentials.json`:**

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

### **3. Automatic Token Management**

**✅ No Manual Token Setup Required!**

The system automatically:
1. **Logs into each backend** using admin credentials
2. **Retrieves JWT tokens** from login responses
3. **Sets tokens** in environment files
4. **Runs health checks** with valid authentication

### **4. Manual Token Setup (Alternative)**

**If you prefer manual token management:**

1. **Login to each backend** using the main collection
2. **Copy the JWT token** from login response
3. **Set `auth_token`** in the respective environment
4. **Test sanity tests** for each environment

---

## 🤖 Airflow Integration

### **Option 1: Simple Airflow DAG (Recommended)**

**File**: `simple_health_check_dag.py`

**Features:**
- ✅ Single Python task
- ✅ Runs all environments sequentially
- ✅ Comprehensive email notifications
- ✅ Detailed logging
- ✅ Easy to maintain

**Setup:**
```bash
# Copy files to Airflow DAGs directory
cp simple_health_check_dag.py /opt/airflow/dags/
cp run_health_checks.py /opt/airflow/dags/
cp postman_sanity_tests.json /opt/airflow/dags/

# Install Newman if not already installed
npm install -g newman
```

**Schedule**: Every day at 12 PM

### **Option 2: Complex Airflow DAG**

**File**: `airflow_health_check_dag.py`

**Features:**
- ✅ Individual tasks for each environment
- ✅ Parallel execution possible
- ✅ Detailed task monitoring
- ✅ Environment-specific error handling

---

## 🧪 Health Check Process

### **For Each Environment:**

1. **✅ Health Check - Get Certifications**
   - Tests API availability
   - Validates data structure
   - Checks response time

2. **✅ Authentication - Get User Profile**
   - Tests auth token validity
   - Validates user data
   - Checks auth system health

3. **✅ Applications - Get Applications List**
   - Tests applications API
   - Validates pagination
   - Checks data integrity

4. **✅ Students - Get Students List**
   - Tests students API
   - Validates pagination
   - Checks user management

5. **✅ Form Submissions - Get Application Forms**
   - Tests form submission API
   - Validates form data
   - Checks application integration

6. **✅ Available Certifications - Get Available Certifications**
   - Tests available certifications API
   - Validates certification data
   - Checks application flow

7. **✅ Archived Applications - Get Archived Applications**
   - Tests archived applications API
   - Validates pagination
   - Checks archive functionality

8. **✅ Database Connectivity Test**
   - Tests database connectivity
   - Validates query performance
   - Checks data availability

9. **✅ System Health Summary**
   - Final health check
   - Generates comprehensive report
   - Provides system overview

---

## 📊 Sample Output

### **Console Output:**
```
🚀 CA IO Backend Health Check Runner
==================================================

🔍 Running health check for EBC Backend...
   URL: https://ebcbackend.certified.io/api
✅ [EBC Backend] Certifications API is healthy - 15 certifications found
✅ [EBC Backend] Authentication system is healthy - User: admin@ebc.com
✅ [EBC Backend] Applications API is healthy - 47 total applications
✅ [EBC Backend] Students API is healthy - 23 total students
✅ [EBC Backend] Form Submissions API is healthy - 8 forms available
✅ [EBC Backend] Available Certifications API is healthy - 15 certifications available
✅ [EBC Backend] Archived Applications API is healthy - 5 archived applications
✅ [EBC Backend] Database connectivity is healthy - Response time: 245ms

🎯 SYSTEM HEALTH SUMMARY [EBC Backend] - 2024-01-15T12:00:00.000Z
=====================================
✅ Environment: EBC Backend
✅ API Status: HEALTHY
✅ Response Time: 245ms
✅ Certifications Available: 15
✅ All Core APIs: OPERATIONAL
✅ Database: CONNECTED
✅ Authentication: WORKING
=====================================

✅ EBC Backend health check PASSED
   📊 Tests: 27 total, 0 failed
   ⏱️  Duration: 1250ms

🔍 Running health check for Demo Backend...
   URL: https://demobackend.certified.io/api
[... similar output for Demo Backend ...]

🔍 Running health check for ETraining Backend...
   URL: https://etrainingbackend.certified.io/api
[... similar output for ETraining Backend ...]

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

### **Email Notification (Success):**
```
Subject: ✅ CA IO Backend Health Check PASSED - 2024-01-15 12:00

✅ All Backend Environments Healthy
Health check completed successfully at 2024-01-15T12:00:00.000Z

Environment Status:
• ✅ EBC Backend: PASS
• ✅ Demo Backend: PASS  
• ✅ ETraining Backend: PASS

🎉 All systems are operational!
```

### **Email Notification (Failure):**
```
Subject: ❌ CA IO Backend Health Check FAILED - 2024-01-15 12:00

❌ Backend Health Check Failed
Health check completed at 2024-01-15T12:00:00.000Z

Summary:
• Total Environments: 3
• Passed: 2
• Failed: 1

Environment Status:
• ✅ EBC Backend: PASS
• ✅ Demo Backend: PASS
• ❌ ETraining Backend: FAIL

🚨 Please check the Airflow logs for detailed error information.
```

---

## 📈 Monitoring Benefits

### **Multi-Environment Coverage:**
- ✅ **Production Monitoring** - EBC Backend
- ✅ **Demo Environment** - Demo Backend
- ✅ **Training System** - ETraining Backend

### **Comprehensive Health Checks:**
- ✅ **API Availability** - All endpoints tested
- ✅ **Authentication** - Token validation
- ✅ **Data Integrity** - Structure validation
- ✅ **Performance** - Response time monitoring
- ✅ **Database Health** - Connectivity tests

### **Automated Reporting:**
- ✅ **Daily 12 PM Checks** - Automated scheduling
- ✅ **Email Notifications** - Success/failure alerts
- ✅ **Detailed Logging** - Environment-specific logs
- ✅ **JSON Reports** - Machine-readable results

---

## 🔧 Troubleshooting

### **Common Issues:**

1. **Auth Token Expired:**
   - Login to each backend to get new token
   - Update `auth_token` in environment

2. **Network Connectivity:**
   - Check if backend URLs are accessible
   - Verify firewall settings

3. **Newman Not Found:**
   - Install Newman: `npm install -g newman`
   - Verify PATH includes npm global binaries

4. **Permission Issues:**
   - Ensure Airflow has read access to files
   - Check file permissions in DAGs directory

### **Environment Variables:**
- `base_url`: Backend API URL
- `environment_name`: Environment display name
- `auth_token`: JWT authentication token (REQUIRED)

---

## 🎯 Usage Examples

### **Manual Testing:**
```bash
# Run health checks manually
python3 run_health_checks.py
```

### **Airflow Integration:**
```python
# DAG runs automatically at 12 PM daily
# Check Airflow UI for task status and logs
```

### **CI/CD Integration:**
```bash
# Run in CI/CD pipeline
newman run postman_sanity_tests.json -e ebc-backend-env.json
```

---

## 📋 Summary

✅ **Three Environment Support** - EBC, Demo, ETraining backends
✅ **Comprehensive Health Checks** - 9 tests per environment  
✅ **Automated Monitoring** - Daily 12 PM checks
✅ **Email Notifications** - Success/failure alerts
✅ **Environment-Specific Logging** - Clear identification
✅ **Airflow Integration** - Production-ready DAGs
✅ **Easy Setup** - Simple configuration
✅ **No Data Creation** - Read-only monitoring

Perfect for production monitoring across all your backend environments! 🚀
