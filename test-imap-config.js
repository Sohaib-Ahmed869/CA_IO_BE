const { ImapFlow } = require('imapflow');

// Test configurations for Outlook IMAP
const testConfigs = [
  // Configuration 1: Standard Office365
  {
    name: 'Office365 Standard',
    host: 'outlook.office365.com',
    port: 993,
    secure: true,
    auth: { user: 'admission@et.edu.au', pass: 'dpcxqyjmhrxdrjnc' }
  },
  
  // Configuration 2: Outlook IMAP
  {
    name: 'Outlook IMAP',
    host: 'imap-mail.outlook.com',
    port: 993,
    secure: true,
    auth: { user: 'admission@et.edu.au', pass: 'dpcxqyjmhrxdrjnc' }
  },
  
  // Configuration 3: Outlook IMAP Alt
  {
    name: 'Outlook IMAP Alt',
    host: 'imap.outlook.com',
    port: 993,
    secure: true,
    auth: { user: 'admission@et.edu.au', pass: 'dpcxqyjmhrxdrjnc' }
  },
  
  // Configuration 4: Office365 with port 143
  {
    name: 'Office365 Port 143',
    host: 'outlook.office365.com',
    port: 143,
    secure: false,
    auth: { user: 'admission@et.edu.au', pass: 'dpcxqyjmhrxdrjnc' }
  },
  
  // Configuration 5: Outlook with port 143
  {
    name: 'Outlook Port 143',
    host: 'imap-mail.outlook.com',
    port: 143,
    secure: false,
    auth: { user: 'admission@et.edu.au', pass: 'dpcxqyjmhrxdrjnc' }
  },
  
  // Configuration 6: Different authentication method
  {
    name: 'Office365 with LOGIN',
    host: 'outlook.office365.com',
    port: 993,
    secure: true,
    auth: { user: 'admission@et.edu.au', pass: 'dpcxqyjmhrxdrjnc', method: 'LOGIN' }
  },
  
  // Configuration 7: With TLS options
  {
    name: 'Office365 with TLS',
    host: 'outlook.office365.com',
    port: 993,
    secure: true,
    tls: { rejectUnauthorized: false },
    auth: { user: 'admission@et.edu.au', pass: 'dpcxqyjmhrxdrjnc' }
  },
  
  // Configuration 8: Alternative port 587
  {
    name: 'Office365 Port 587',
    host: 'outlook.office365.com',
    port: 587,
    secure: false,
    auth: { user: 'admission@et.edu.au', pass: 'dpcxqyjmhrxdrjnc' }
  },
  
  // Configuration 9: Different host format
  {
    name: 'Office365 Mail',
    host: 'mail.outlook.com',
    port: 993,
    secure: true,
    auth: { user: 'admission@et.edu.au', pass: 'dpcxqyjmhrxdrjnc' }
  },
  
  // Configuration 10: With connection timeout
  {
    name: 'Office365 with Timeouts',
    host: 'outlook.office365.com',
    port: 993,
    secure: true,
    socketTimeout: 30000,
    greetingTimeout: 10000,
    connectionTimeout: 10000,
    auth: { user: 'admission@et.edu.au', pass: 'dpcxqyjmhrxdrjnc' }
  }
];

async function testImapConfig(config) {
  console.log(`\n🔍 Testing: ${config.name}`);
  console.log(`   Host: ${config.host}`);
  console.log(`   Port: ${config.port}`);
  console.log(`   Secure: ${config.secure}`);
  console.log(`   User: ${config.auth.user}`);
  console.log(`   Pass: ${config.auth.pass}`);
  
  let client = null;
  try {
    // Create client with this configuration
    client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
      logger: false,
      socketTimeout: config.socketTimeout || 15000,
      greetingTimeout: config.greetingTimeout || 10000,
      connectionTimeout: config.connectionTimeout || 10000,
      tls: config.tls || {}
    });

    // Add error handler
    client.on('error', (err) => {
      console.log(`   ❌ Client error: ${err.message}`);
    });

    // Test connection with timeout
    console.log(`   🔌 Connecting...`);
    await Promise.race([
      client.connect(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 15000)
      )
    ]);
    
    console.log(`   ✅ Connected successfully!`);
    
    // Test mailbox access
    console.log(`   📁 Opening INBOX...`);
    await client.mailboxOpen('INBOX');
    console.log(`   ✅ INBOX opened successfully!`);
    
    // Get message count
    const allUids = await client.search({});
    console.log(`   📧 Found ${allUids.length} messages`);
    
    await client.logout();
    console.log(`   🎉 SUCCESS! ${config.name} works!`);
    
    return {
      success: true,
      config: config,
      messageCount: allUids.length
    };
    
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    if (error.authenticationFailed) {
      console.log(`   🔐 Authentication failed`);
    }
    if (error.response) {
      console.log(`   📝 Response: ${error.response}`);
    }
    
    return {
      success: false,
      config: config,
      error: error.message,
      response: error.response
    };
  } finally {
    if (client) {
      try {
        await client.logout();
      } catch (e) {
        // Ignore logout errors
      }
    }
  }
}

async function runAllTests() {
  console.log('🚀 Starting comprehensive IMAP configuration tests...');
  console.log('📧 Testing account: admission@et.edu.au');
  console.log('🔑 Using app password: dpcxqyjmhrxdrjnc');
  console.log('=' .repeat(80));
  
  const results = [];
  
  for (const config of testConfigs) {
    const result = await testImapConfig(config);
    results.push(result);
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n' + '=' .repeat(80));
  console.log('📊 TEST RESULTS SUMMARY:');
  console.log('=' .repeat(80));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  if (successful.length > 0) {
    console.log(`\n✅ SUCCESSFUL CONFIGURATIONS (${successful.length}):`);
    successful.forEach(result => {
      console.log(`   🎉 ${result.config.name}`);
      console.log(`      Host: ${result.config.host}:${result.config.port}`);
      console.log(`      Secure: ${result.config.secure}`);
      console.log(`      Messages: ${result.messageCount}`);
    });
  } else {
    console.log('\n❌ NO SUCCESSFUL CONFIGURATIONS FOUND');
  }
  
  if (failed.length > 0) {
    console.log(`\n❌ FAILED CONFIGURATIONS (${failed.length}):`);
    failed.forEach(result => {
      console.log(`   💥 ${result.config.name}: ${result.error}`);
    });
  }
  
  console.log('\n' + '=' .repeat(80));
  
  if (successful.length > 0) {
    console.log('🎯 RECOMMENDED CONFIGURATION:');
    const best = successful[0];
    console.log(`   EMAIL_PROVIDER=outlook`);
    console.log(`   IMAP_HOST=${best.config.host}`);
    console.log(`   IMAP_PORT=${best.config.port}`);
    console.log(`   OUTLOOK_USER=${best.config.auth.user}`);
    console.log(`   OUTLOOK_APP_PASSWORD=${best.config.auth.pass}`);
    if (best.config.port === 143) {
      console.log(`   IMAP_TLS=false`);
    }
  } else {
    console.log('🚨 ALL CONFIGURATIONS FAILED');
    console.log('   This suggests:');
    console.log('   - IMAP is disabled for this account');
    console.log('   - App password is not valid for IMAP');
    console.log('   - Account has institutional restrictions');
    console.log('   - Contact your IT administrator');
  }
  
  console.log('=' .repeat(80));
}

// Run the tests
runAllTests().catch(console.error);
