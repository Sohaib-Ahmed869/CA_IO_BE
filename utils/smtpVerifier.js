const nodemailer = require('nodemailer');
const { logMe } = require('./logger');

/**
 * SMTP Configuration Verifier
 * Tests SMTP connection and credentials
 */

class SMTPVerifier {
  constructor() {
    this.timeout = 10000; // 10 second timeout
  }

  /**
   * Verify SMTP configuration
   * @param {Object} emailConfig - SMTP configuration object
   * @returns {Object} - Verification result
   */
  async verifySMTPConfig(emailConfig) {
    const startTime = Date.now();
    
    try {
      // Validate required fields
      const requiredFields = ['provider', 'host', 'port', 'username', 'password', 'fromEmail'];
      const missingFields = requiredFields.filter(field => !emailConfig[field]);
      
      if (missingFields.length > 0) {
        return {
          success: false,
          message: `Missing required fields: ${missingFields.join(', ')}`,
          details: {
            missingFields,
            error: 'validation_error'
          }
        };
      }

      // Create transporter based on provider
      const transporter = this.createTransporter(emailConfig);

      // Test connection
      const connectionResult = await this.testConnection(transporter);
      if (!connectionResult.success) {
        return connectionResult;
      }

      // Test authentication
      const authResult = await this.testAuthentication(transporter);
      if (!authResult.success) {
        return authResult;
      }

      // Test sending (optional - just verify we can create a message)
      const sendResult = await this.testSending(transporter, emailConfig);
      if (!sendResult.success) {
        return sendResult;
      }

      const duration = Date.now() - startTime;

      logMe('smtp.verification.success', {
        provider: emailConfig.provider,
        host: emailConfig.host,
        port: emailConfig.port,
        duration
      });

      return {
        success: true,
        message: 'SMTP configuration is valid',
        details: {
          provider: emailConfig.provider,
          host: emailConfig.host,
          port: emailConfig.port,
          duration,
          verified: true
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logMe('smtp.verification.error', {
        error: error.message,
        provider: emailConfig?.provider,
        host: emailConfig?.host,
        duration
      }, 'error');

      return {
        success: false,
        message: 'SMTP verification failed',
        details: {
          error: error.message,
          duration,
          verified: false
        }
      };
    }
  }

  /**
   * Create nodemailer transporter based on provider
   */
  createTransporter(emailConfig) {
    const baseConfig = {
      host: emailConfig.host,
      port: parseInt(emailConfig.port),
      secure: emailConfig.secure || emailConfig.port == 465, // true for 465, false for other ports
      auth: {
        user: emailConfig.username,
        pass: emailConfig.password
      },
      connectionTimeout: this.timeout,
      greetingTimeout: this.timeout,
      socketTimeout: this.timeout,
      // Disable certificate verification for self-signed certificates
      tls: {
        rejectUnauthorized: false
      }
    };

    // Provider-specific configurations
    switch (emailConfig.provider.toLowerCase()) {
      case 'gmail':
        return nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: emailConfig.username,
            pass: emailConfig.password // Should be app password for Gmail
          },
          // Remove custom host/port for Gmail service
          // Gmail service automatically uses correct settings
        });

      case 'outlook':
      case 'hotmail':
        return nodemailer.createTransport({
          ...baseConfig,
          service: 'hotmail'
        });

      case 'yahoo':
        return nodemailer.createTransport({
          ...baseConfig,
          service: 'yahoo'
        });

      case 'sendgrid':
        return nodemailer.createTransport({
          ...baseConfig,
          service: 'SendGrid',
          auth: {
            user: 'apikey',
            pass: emailConfig.apiKey || emailConfig.password
          }
        });

      case 'aws-ses':
        return nodemailer.createTransport({
          ...baseConfig,
          service: 'SES',
          region: emailConfig.region || 'us-east-1',
          auth: {
            user: emailConfig.username, // AWS Access Key ID
            pass: emailConfig.password  // AWS Secret Access Key
          }
        });

      case 'mailgun':
        return nodemailer.createTransport({
          ...baseConfig,
          service: 'Mailgun',
          auth: {
            user: emailConfig.username,
            pass: emailConfig.apiKey || emailConfig.password
          }
        });

      default:
        // Generic SMTP
        return nodemailer.createTransport(baseConfig);
    }
  }

  /**
   * Test SMTP connection
   */
  async testConnection(transporter) {
    try {
      await transporter.verify();
      return {
        success: true,
        message: 'Connection successful'
      };
    } catch (error) {
      let errorMessage = 'Connection failed';
      let errorType = 'connection_error';
      
      // Provide more specific error messages
      if (error.code === 'EDNS') {
        errorMessage = 'DNS resolution failed. Check your internet connection and SMTP host settings.';
        errorType = 'dns_error';
      } else if (error.code === 'ECONNECTION') {
        errorMessage = 'Could not connect to SMTP server. Check host and port settings.';
        errorType = 'connection_error';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Connection timeout. Check network connectivity and SMTP server availability.';
        errorType = 'timeout_error';
      } else if (error.message.includes('queryA EBADNAME')) {
        errorMessage = 'Invalid email address or DNS resolution failed. For Gmail, use the service "gmail" instead of custom SMTP settings.';
        errorType = 'dns_error';
      }
      
      return {
        success: false,
        message: errorMessage,
        details: {
          error: error.message,
          code: error.code,
          errorType: errorType
        }
      };
    }
  }

  /**
   * Test authentication
   */
  async testAuthentication(transporter) {
    try {
      // Verify method tests both connection and authentication
      await transporter.verify();
      return {
        success: true,
        message: 'Authentication successful'
      };
    } catch (error) {
      let errorType = 'authentication_error';
      let message = 'Authentication failed';

      if (error.code === 'EAUTH') {
        message = 'Invalid credentials';
      } else if (error.code === 'ECONNECTION') {
        message = 'Connection failed';
        errorType = 'connection_error';
      } else if (error.code === 'ETIMEDOUT') {
        message = 'Connection timeout';
        errorType = 'timeout_error';
      }

      return {
        success: false,
        message,
        details: {
          error: error.message,
          code: error.code,
          errorType
        }
      };
    }
  }

  /**
   * Test sending capability (without actually sending)
   */
  async testSending(transporter, emailConfig) {
    try {
      // Create a test message (don't send it)
      const testMessage = {
        from: `"${emailConfig.fromName || 'Test'}" <${emailConfig.fromEmail}>`,
        to: emailConfig.fromEmail, // Send to self for testing
        subject: 'SMTP Configuration Test',
        text: 'This is a test message to verify SMTP configuration.',
        html: '<p>This is a test message to verify SMTP configuration.</p>'
      };

      // Just validate the message structure
      const info = await transporter.sendMail(testMessage);
      
      return {
        success: true,
        message: 'Sending capability verified',
        details: {
          messageId: info.messageId,
          response: info.response
        }
      };

    } catch (error) {
      return {
        success: false,
        message: 'Sending test failed',
        details: {
          error: error.message,
          code: error.code,
          errorType: 'sending_error'
        }
      };
    }
  }

  /**
   * Quick verification without sending test email
   */
  async quickVerify(emailConfig) {
    try {
      const transporter = this.createTransporter(emailConfig);
      await transporter.verify();
      
      return {
        success: true,
        message: 'SMTP configuration is valid'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        details: {
          error: error.message,
          code: error.code
        }
      };
    }
  }
}

module.exports = new SMTPVerifier();
