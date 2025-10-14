# 🚀 CA IO Backend - Postman Collections Setup Guide

## 📁 Files Created

1. **`postman_collection.json`** - Complete API collection with all endpoints and tests
2. **`postman_sanity_tests.json`** - Sanity test collection for automated monitoring
3. **`postman_environment.json`** - Environment variables for both collections

---

## 🔧 Setup Instructions

### 1. Import Collections

1. **Open Postman**
2. **Click "Import"** (top left)
3. **Select "Upload Files"**
4. **Import all three files:**
   - `postman_collection.json`
   - `postman_sanity_tests.json`
   - `postman_environment.json`

### 2. Configure Environment

1. **Select "CA IO Backend Environment"** from environment dropdown
2. **Update variables as needed:**
   - `base_url`: Your API base URL (default: `http://localhost:5000/api`)
   - `auth_token`: **REQUIRED** - JWT token for authenticated endpoints (get from login)

### 3. Get Auth Token for Sanity Tests

**For sanity tests to work, you need a valid auth token:**

1. **Run "Login" from main collection first** to get auth token
2. **Copy the token** from login response
3. **Set `auth_token` environment variable** with the token value
4. **Now run sanity tests** - they will use the existing token

---

## 🎯 Collection Overview

### 📋 Main Collection: "CA IO Backend API Collection"

**Complete API collection with 30+ endpoints:**

#### **Authentication (4 endpoints)**
- ✅ Student Registration (with tests)
- ✅ Admin Registration
- ✅ Super Admin Registration  
- ✅ Login (with comprehensive tests)

#### **Admin Management (3 endpoints)**
- ✅ Create Sales Manager
- ✅ Create Sales Agent
- ✅ Create Assessor

#### **Certifications (5 endpoints)**
- ✅ Get All Certifications (with comprehensive tests)
- ✅ Get Certification by ID
- ✅ Create Certification
- ✅ Update Certification
- ✅ Delete Certification

#### **Applications (7 endpoints)**
- ✅ Get All Applications (with comprehensive tests)
- ✅ Get Archived Applications
- ✅ Get Application Details
- ✅ Archive Application
- ✅ Restore Application
- ✅ Assign Assessor
- ✅ Get Available Assessors

#### **Students (3 endpoints)**
- ✅ Get All Students
- ✅ Update Student Status
- ✅ Update Student Information

#### **Form Submissions (3 endpoints)**
- ✅ Get Application Forms
- ✅ Submit Form
- ✅ Get Form Submission Details

#### **Third Party Forms (2 endpoints)**
- ✅ Create Third Party Form Submission
- ✅ Submit Third Party Form

#### **Exports (3 endpoints)**
- ✅ Export Students CSV
- ✅ Export Students Excel
- ✅ Export Student PDF Report

#### **User Profile (3 endpoints)**
- ✅ Get User Profile
- ✅ Update User Profile
- ✅ Change Password

---

## 🏥 Sanity Tests Collection: "CA IO Backend - Sanity Tests"

**9 critical health check endpoints for automated monitoring (GET APIs only - no data creation):**

### **Test Flow:**
1. **Health Check - Get Certifications** ✅
2. **Authentication - Get User Profile** ✅ (requires pre-existing auth token)
3. **Applications - Get Applications List** ✅
4. **Students - Get Students List** ✅
5. **Form Submissions - Get Application Forms** ✅
6. **Available Certifications - Get Available Certifications** ✅
7. **Archived Applications - Get Archived Applications** ✅
8. **Database Connectivity Test** ✅
9. **System Health Summary** ✅

### **Each Test Validates:**
- ✅ **Status Code 200**
- ✅ **Response Structure**
- ✅ **Data Integrity**
- ✅ **Response Time** (< 3000ms)
- ✅ **Authentication**
- ✅ **Database Connectivity**

---

## 🤖 Airflow Integration

### **For Daily 12 PM Health Checks:**

1. **Export Sanity Tests Collection**
2. **Use Postman CLI or Newman**
3. **Schedule in Airflow**

### **Newman Command Example:**
```bash
newman run postman_sanity_tests.json \
  -e postman_environment.json \
  --reporters cli,json \
  --reporter-json-export health_check_results.json
```

### **Airflow DAG Example:**
```python
from airflow import DAG
from airflow.operators.bash_operator import BashOperator
from datetime import datetime, timedelta

default_args = {
    'owner': 'api-team',
    'depends_on_past': False,
    'start_date': datetime(2024, 1, 1),
    'email_on_failure': True,
    'email_on_retry': False,
    'retries': 1,
    'retry_delay': timedelta(minutes=5)
}

dag = DAG(
    'api_health_check',
    default_args=default_args,
    description='Daily API Health Check',
    schedule_interval='0 12 * * *',  # Every day at 12 PM
    catchup=False
)

health_check_task = BashOperator(
    task_id='run_api_health_check',
    bash_command='newman run /path/to/postman_sanity_tests.json -e /path/to/postman_environment.json --reporters cli,json --reporter-json-export /tmp/health_check_$(date +%Y%m%d_%H%M%S).json',
    dag=dag
)
```

---

## 🧪 Test Features

### **Automated Tests Include:**

#### **Response Validation:**
- Status code verification
- Response structure validation
- Data type checking
- Required field validation

#### **Performance Testing:**
- Response time monitoring
- Database query performance
- API endpoint speed validation

#### **Authentication Testing:**
- Token generation and validation
- User session management
- Permission verification

#### **Data Integrity:**
- Pagination structure validation
- Data consistency checks
- Relationship validation

#### **Environment Management:**
- Automatic token saving
- Variable propagation
- Cross-request data sharing

---

## 📊 Monitoring & Reporting

### **Health Check Results:**

The sanity tests generate comprehensive reports including:

- ✅ **API Status**: HEALTHY/UNHEALTHY
- ✅ **Response Times**: Per endpoint
- ✅ **Data Counts**: Certifications, applications, students
- ✅ **System Status**: Database, authentication, core APIs
- ✅ **Timestamp**: When health check was performed

### **Sample Health Summary:**
```
🎯 SYSTEM HEALTH SUMMARY - 2024-01-15T12:00:00.000Z
=====================================
✅ API Status: HEALTHY
✅ Response Time: 245ms
✅ Certifications Available: 15
✅ All Core APIs: OPERATIONAL
✅ Database: CONNECTED
✅ Authentication: WORKING
=====================================
```

---

## 🚨 Troubleshooting

### **Common Issues:**

1. **Authentication Failures:**
   - Check `auth_token` environment variable
   - Verify test user credentials
   - Ensure user account is active

2. **Connection Issues:**
   - Verify `base_url` is correct
   - Check server is running
   - Confirm network connectivity

3. **Test Failures:**
   - Review response structure changes
   - Check database connectivity
   - Verify API endpoint changes

### **Environment Variables:**
- `base_url`: API base URL
- `auth_token`: JWT authentication token
- `test_user_email`: Test user email
- `test_user_password`: Test user password
- `certification_id`: First available certification ID
- `application_id`: First available application ID

---

## 🎯 Usage Examples

### **Manual Testing:**
1. Select "CA IO Backend API Collection"
2. Run "Login" first to get auth token
3. Run any other endpoint tests

### **Automated Testing:**
1. Select "CA IO Backend - Sanity Tests"
2. Run entire collection
3. Review test results and health summary

### **CI/CD Integration:**
```bash
# Run full test suite
newman run postman_collection.json -e postman_environment.json

# Run only sanity tests
newman run postman_sanity_tests.json -e postman_environment.json
```

---

## 📈 Benefits

- ✅ **Complete API Coverage**: All endpoints tested
- ✅ **Automated Health Monitoring**: Daily 12 PM checks
- ✅ **Performance Monitoring**: Response time tracking
- ✅ **Data Validation**: Structure and integrity checks
- ✅ **Authentication Testing**: Token and session management
- ✅ **Database Health**: Connectivity and query validation
- ✅ **Easy Integration**: Airflow and CI/CD ready
- ✅ **Comprehensive Reporting**: Detailed health summaries

Ready for production monitoring! 🚀
