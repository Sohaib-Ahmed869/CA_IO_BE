// scripts/test_student_notifications.js
// Test script to demonstrate the student notification API

const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:3000/api';
const STUDENT_EMAIL = 'student@example.com'; // Replace with actual student email
const STUDENT_PASSWORD = 'password123'; // Replace with actual password

async function testStudentNotifications() {
  try {
    console.log('🧪 Testing Student Notification API...\n');

    // Step 1: Login as student
    console.log('1. Logging in as student...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: STUDENT_EMAIL,
      password: STUDENT_PASSWORD
    });

    if (!loginResponse.data.success) {
      throw new Error('Login failed: ' + loginResponse.data.message);
    }

    const token = loginResponse.data.token;
    console.log('✅ Login successful\n');

    // Step 2: Get all assessor updates
    console.log('2. Getting all assessor updates...');
    const updatesResponse = await axios.get(`${BASE_URL}/student/notifications/updates`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('📋 All Updates Response:');
    console.log(JSON.stringify(updatesResponse.data, null, 2));
    console.log('\n');

    // Step 3: Get updates for a specific application (if any exist)
    if (updatesResponse.data.data.updates.length > 0) {
      const firstUpdate = updatesResponse.data.data.updates[0];
      console.log(`3. Getting updates for application: ${firstUpdate.applicationId}...`);
      
      const appUpdatesResponse = await axios.get(
        `${BASE_URL}/student/notifications/updates/application/${firstUpdate.applicationId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      console.log('📋 Application Updates Response:');
      console.log(JSON.stringify(appUpdatesResponse.data, null, 2));
      console.log('\n');
    }

    // Step 4: Mark updates as read (if any exist)
    if (updatesResponse.data.data.updates.length > 0) {
      const updateIds = updatesResponse.data.data.updates.map(update => update.id);
      console.log('4. Marking updates as read...');
      
      const markReadResponse = await axios.post(
        `${BASE_URL}/student/notifications/updates/mark-read`,
        { updateIds },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      console.log('📋 Mark Read Response:');
      console.log(JSON.stringify(markReadResponse.data, null, 2));
    }

    console.log('\n✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Example usage for frontend integration
function getFrontendIntegrationExample() {
  console.log('\n📱 Frontend Integration Example:');
  console.log(`
// 1. Get all updates when student logs in
const getStudentUpdates = async () => {
  const response = await fetch('/api/student/notifications/updates', {
    headers: {
      'Authorization': \`Bearer \${token}\`
    }
  });
  return response.json();
};

// 2. Display updates in UI
const displayUpdates = (updates) => {
  if (updates.hasUpdates) {
    updates.updates.forEach(update => {
      console.log(\`📝 \${update.formName} - \${update.status}\`);
      console.log(\`👨‍🏫 Assessor: \${update.assessorName}\`);
      console.log(\`📅 Date: \${new Date(update.assessedAt).toLocaleDateString()}\`);
      if (update.requiresChanges) {
        console.log(\`⚠️ Requires changes: \${update.feedback}\`);
      }
      console.log('---');
    });
  } else {
    console.log('✅ No new updates');
  }
};

// 3. Get updates for specific application
const getApplicationUpdates = async (applicationId) => {
  const response = await fetch(\`/api/student/notifications/updates/application/\${applicationId}\`, {
    headers: {
      'Authorization': \`Bearer \${token}\`
    }
  });
  return response.json();
};
  `);
}

// Run tests if this file is executed directly
if (require.main === module) {
  testStudentNotifications().then(() => {
    getFrontendIntegrationExample();
  });
}

module.exports = { testStudentNotifications, getFrontendIntegrationExample };
