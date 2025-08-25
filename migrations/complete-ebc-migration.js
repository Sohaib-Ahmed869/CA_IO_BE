// Complete EBC Migration Script
// Migrates all data from EBC database to current RTO
const mongoose = require('mongoose');
require('dotenv').config();

// Source database connection (EBC)
const SOURCE_MONGODB_URI = 'mongodb+srv://sohaibsipra869:nvidia940MX@cluster0.jm4lunv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

// Target RTO ID in current database
const TARGET_RTO_ID = '689b1d7af2b74ec81c46bdee';

// We'll create models using the target connection
let User, RTO, FormTemplate, Certification, Application, FormSubmission, Certificate, Payment, Ticket, DocumentUpload, InitialScreeningForm;

async function migrateEBCData() {
  let sourceConnection, targetConnection;
  
  try {
    console.log('🚀 Starting complete EBC migration...');
    
    // Connect to source database (EBC)
    sourceConnection = await mongoose.createConnection(SOURCE_MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      bufferCommands: false
    });
    console.log('✅ Connected to source EBC database');
    
    // Wait for source connection to be ready
    await sourceConnection.asPromise();
    console.log('✅ Source connection ready');
    
    // Connect to target database (current)
    targetConnection = await mongoose.createConnection(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      bufferCommands: false
    });
    console.log('✅ Connected to target database');
    
    // Wait for connection to be ready
    await targetConnection.asPromise();
    console.log('✅ Target connection ready');
    
    // Create models using the target connection
    User = targetConnection.model('User', require('../models/user').schema);
    RTO = targetConnection.model('RTO', require('../models/rto').schema);
    FormTemplate = targetConnection.model('FormTemplate', require('../models/formTemplate').schema);
    Certification = targetConnection.model('Certification', require('../models/certification').schema);
    Application = targetConnection.model('Application', require('../models/application').schema);
    FormSubmission = targetConnection.model('FormSubmission', require('../models/formSubmission').schema);
    Certificate = targetConnection.model('Certificate', require('../models/certificate').schema);
    Payment = targetConnection.model('Payment', require('../models/payment').schema);
    Ticket = targetConnection.model('Ticket', require('../models/ticket').schema);
    DocumentUpload = targetConnection.model('DocumentUpload', require('../models/documentUpload').schema);
    InitialScreeningForm = targetConnection.model('InitialScreeningForm', require('../models/initialScreeningForm').schema);
    
    console.log('✅ Models created using target connection');
    
    // Verify target RTO exists
    const targetRTO = await RTO.findById(TARGET_RTO_ID);
    if (!targetRTO) {
      throw new Error(`Target RTO with ID ${TARGET_RTO_ID} not found`);
    }
    console.log(`✅ Target RTO found: ${targetRTO.companyName} (${targetRTO.subdomain})`);
    
    // Get source collections
    const sourceDb = sourceConnection.db;
    
    // 1. Migrate Users
    console.log('\n👥 Migrating users...');
    const usersCollection = sourceDb.collection('users');
    const sourceUsers = await usersCollection.find({}).toArray();
    console.log(`📊 Found ${sourceUsers.length} users to migrate`);
    
    const userMigrationMap = new Map(); // oldId -> newId
    let migratedUsers = 0;
    
    for (const sourceUser of sourceUsers) {
      try {
        // Check if user already exists (by email + RTO)
        const existingUser = await User.findOne({
          email: sourceUser.email,
          rtoId: TARGET_RTO_ID
        });
        
        if (existingUser) {
          console.log(`⏭️  User ${sourceUser.email} already exists, mapping to existing...`);
          userMigrationMap.set(sourceUser._id.toString(), existingUser._id.toString());
          continue;
        }
        
        // Create new user
        const newUser = new User({
          firstName: sourceUser.firstName || sourceUser.first_name || 'Unknown',
          lastName: sourceUser.lastName || sourceUser.last_name || 'Unknown',
          email: sourceUser.email,
          password: sourceUser.password || 'tempPassword123!', // Will need reset
          phoneCode: sourceUser.phoneCode || '+61',
          phoneNumber: sourceUser.phoneNumber || sourceUser.phone || '000000000',
          userType: sourceUser.userType || 'user',
          rtoId: TARGET_RTO_ID,
          rtoRole: sourceUser.rtoRole || 'user',
          isActive: sourceUser.isActive !== false,
          ceo: sourceUser.ceo || false,
          permissions: sourceUser.permissions || [],
          questions: sourceUser.questions || '',
          resetPasswordToken: null,
          resetPasswordExpires: null
        });
        
        const savedUser = await newUser.save();
        userMigrationMap.set(sourceUser._id.toString(), savedUser._id.toString());
        migratedUsers++;
        console.log(`✅ Migrated user: ${sourceUser.email}`);
        
      } catch (error) {
        console.error(`❌ Error migrating user ${sourceUser.email}:`, error.message);
      }
    }
    
    console.log(`✅ Successfully migrated ${migratedUsers} users`);
    
    // 2. Migrate Form Templates
    console.log('\n📝 Migrating form templates...');
    const formTemplatesCollection = sourceDb.collection('formtemplates');
    const sourceFormTemplates = await formTemplatesCollection.find({}).toArray();
    console.log(`📊 Found ${sourceFormTemplates.length} form templates to migrate`);
    
    const formTemplateMigrationMap = new Map();
    let migratedFormTemplates = 0;
    
    for (const sourceTemplate of sourceFormTemplates) {
      try {
        // Check if template already exists
        const existingTemplate = await FormTemplate.findOne({
          name: sourceTemplate.name,
          rtoId: TARGET_RTO_ID
        });
        
        if (existingTemplate) {
          console.log(`⏭️  Form template "${sourceTemplate.name}" already exists, mapping to existing...`);
          formTemplateMigrationMap.set(sourceTemplate._id.toString(), existingTemplate._id.toString());
          continue;
        }
        
        // Create new form template
        const newTemplate = new FormTemplate({
          name: sourceTemplate.name,
          description: sourceTemplate.description || sourceTemplate.name,
          stepNumber: sourceTemplate.stepNumber || 1,
          filledBy: sourceTemplate.filledBy || 'user',
          formStructure: sourceTemplate.formStructure || [],
          version: sourceTemplate.version || 1,
          isActive: sourceTemplate.isActive !== false,
          rtoId: TARGET_RTO_ID,
          createdBy: userMigrationMap.get(sourceTemplate.createdBy?.toString()) || targetRTO.createdBy,
          category: sourceTemplate.category || 'general',
          tags: sourceTemplate.tags || []
        });
        
        const savedTemplate = await newTemplate.save();
        formTemplateMigrationMap.set(sourceTemplate._id.toString(), savedTemplate._id.toString());
        migratedFormTemplates++;
        console.log(`✅ Migrated form template: ${sourceTemplate.name}`);
        
      } catch (error) {
        console.error(`❌ Error migrating form template "${sourceTemplate.name}":`, error.message);
      }
    }
    
    console.log(`✅ Successfully migrated ${migratedFormTemplates} form templates`);
    
    // 3. Migrate Certifications
    console.log('\n📚 Migrating certifications...');
    const certificationsCollection = sourceDb.collection('certifications');
    const sourceCertifications = await certificationsCollection.find({}).toArray();
    console.log(`📊 Found ${sourceCertifications.length} certifications to migrate`);
    
    const certificationMigrationMap = new Map();
    let migratedCertifications = 0;
    
    for (const sourceCert of sourceCertifications) {
      try {
        // Check if certification already exists
        const existingCert = await Certification.findOne({
          name: sourceCert.name,
          rtoId: TARGET_RTO_ID
        });
        
        if (existingCert) {
          console.log(`⏭️  Certification "${sourceCert.name}" already exists, mapping to existing...`);
          certificationMigrationMap.set(sourceCert._id.toString(), existingCert._id.toString());
          continue;
        }
        
        // Create new certification
        const newCert = new Certification({
          name: sourceCert.name,
          price: sourceCert.price || 0,
          description: sourceCert.description || sourceCert.name,
          formTemplateIds: sourceCert.formTemplateIds?.map(ft => ({
            stepNumber: ft.stepNumber || 1,
            formTemplateId: formTemplateMigrationMap.get(ft.formTemplateId?.toString()),
            filledBy: ft.filledBy || 'user',
            title: ft.title || ''
          })) || [],
          isActive: sourceCert.isActive !== false,
          rtoId: TARGET_RTO_ID,
          createdBy: userMigrationMap.get(sourceCert.createdBy?.toString()) || targetRTO.createdBy,
          category: sourceCert.category || 'general',
          tags: sourceCert.tags || [],
          code: sourceCert.code || '',
          duration: sourceCert.duration || '12 months',
          prerequisites: sourceCert.prerequisites || '',
          competencyUnits: sourceCert.competencyUnits || []
        });
        
        const savedCert = await newCert.save();
        certificationMigrationMap.set(sourceCert._id.toString(), savedCert._id.toString());
        migratedCertifications++;
        console.log(`✅ Migrated certification: ${sourceCert.name}`);
        
      } catch (error) {
        console.error(`❌ Error migrating certification "${sourceCert.name}":`, error.message);
      }
    }
    
    console.log(`✅ Successfully migrated ${migratedCertifications} certifications`);
    
    // 4. Migrate Applications
    console.log('\n📋 Migrating applications...');
    const applicationsCollection = sourceDb.collection('applications');
    const sourceApplications = await applicationsCollection.find({}).toArray();
    console.log(`📊 Found ${sourceApplications.length} applications to migrate`);
    
    const applicationMigrationMap = new Map();
    let migratedApplications = 0;
    
    for (const sourceApp of sourceApplications) {
      try {
        // Check if application already exists
        const existingApp = await Application.findOne({
          userId: userMigrationMap.get(sourceApp.userId?.toString()),
          certificationId: certificationMigrationMap.get(sourceApp.certificationId?.toString()),
          rtoId: TARGET_RTO_ID
        });
        
        if (existingApp) {
          console.log(`⏭️  Application already exists, mapping to existing...`);
          applicationMigrationMap.set(sourceApp._id.toString(), existingApp._id.toString());
          continue;
        }
        
        // Create new application
        const newApp = new Application({
          userId: userMigrationMap.get(sourceApp.userId?.toString()),
          certificationId: certificationMigrationMap.get(sourceApp.certificationId?.toString()),
          rtoId: TARGET_RTO_ID,
          overallStatus: sourceApp.overallStatus || 'pending',
          currentStep: sourceApp.currentStep || 1,
          totalSteps: sourceApp.totalSteps || 1,
          isActive: sourceApp.isActive !== false,
          createdBy: userMigrationMap.get(sourceApp.createdBy?.toString()) || targetRTO.createdBy,
          // Additional fields from EBC
          initialScreeningFormId: sourceApp.initialScreeningFormId,
          finalCertificate: sourceApp.finalCertificate,
          callAttempts: sourceApp.callAttempts || 0,
          contactStatus: sourceApp.contactStatus || 'pending',
          leadStatus: sourceApp.leadStatus || 'new',
          internalNotes: sourceApp.internalNotes || '',
          isArchived: sourceApp.isArchived || false,
          formSubmissions: sourceApp.formSubmissions || [],
          paymentId: sourceApp.paymentId,
          documentUploadId: sourceApp.documentUploadId,
          assignedAssessor: userMigrationMap.get(sourceApp.assignedAssessor?.toString()),
          archivedAt: sourceApp.archivedAt,
          archivedBy: userMigrationMap.get(sourceApp.archivedBy?.toString()),
          restoredAt: sourceApp.restoredAt,
          restoredBy: userMigrationMap.get(sourceApp.restoredBy?.toString())
        });
        
        // Remove fields that shouldn't be copied
        delete newApp._id;
        delete newApp.createdAt;
        delete newApp.updatedAt;
        delete newApp.__v;
        
        const savedApp = await newApp.save();
        applicationMigrationMap.set(sourceApp._id.toString(), savedApp._id.toString());
        migratedApplications++;
        console.log(`✅ Migrated application ID: ${sourceApp._id}`);
        
      } catch (error) {
        console.error(`❌ Error migrating application ${sourceApp._id}:`, error.message);
      }
    }
    
    console.log(`✅ Successfully migrated ${migratedApplications} applications`);
    
    // 5. Migrate Form Submissions
    console.log('\n📝 Migrating form submissions...');
    const formSubmissionsCollection = sourceDb.collection('formsubmissions');
    const sourceFormSubmissions = await formSubmissionsCollection.find({}).toArray();
    console.log(`📊 Found ${sourceFormSubmissions.length} form submissions to migrate`);
    
    let migratedFormSubmissions = 0;
    
    for (const sourceSubmission of sourceFormSubmissions) {
      try {
        // Check if submission already exists
        const existingSubmission = await FormSubmission.findOne({
          applicationId: applicationMigrationMap.get(sourceSubmission.applicationId?.toString()),
          formTemplateId: formTemplateMigrationMap.get(sourceSubmission.formTemplateId?.toString()),
          rtoId: TARGET_RTO_ID
        });
        
        if (existingSubmission) {
          console.log(`⏭️  Form submission already exists, skipping...`);
          continue;
        }
        
        // Create new form submission
        const newSubmission = new FormSubmission({
          applicationId: applicationMigrationMap.get(sourceSubmission.applicationId?.toString()),
          formTemplateId: formTemplateMigrationMap.get(sourceSubmission.formTemplateId?.toString()),
          rtoId: TARGET_RTO_ID,
          formData: sourceSubmission.formData || {},
          stepNumber: sourceSubmission.stepNumber || 1,
          filledBy: sourceSubmission.filledBy || 'user',
          isActive: sourceSubmission.isActive !== false,
          createdBy: userMigrationMap.get(sourceSubmission.createdBy?.toString()) || targetRTO.createdBy,
          // Additional fields from EBC
          userId: userMigrationMap.get(sourceSubmission.userId?.toString()),
          status: sourceSubmission.status || 'submitted',
          submittedAt: sourceSubmission.submittedAt || new Date(),
          resubmissionRequired: sourceSubmission.resubmissionRequired || false,
          version: sourceSubmission.version || 1,
          previousVersions: sourceSubmission.previousVersions || [],
          resubmissionDeadline: sourceSubmission.resubmissionDeadline,
          assessedAt: sourceSubmission.assessedAt,
          assessedBy: userMigrationMap.get(sourceSubmission.assessedBy?.toString()),
          assessorFeedback: sourceSubmission.assessorFeedback || ''
        });
        
        // Remove fields that shouldn't be copied
        delete newSubmission._id;
        delete newSubmission.createdAt;
        delete newSubmission.updatedAt;
        delete newSubmission.__v;
        
        await newSubmission.save();
        migratedFormSubmissions++;
        console.log(`✅ Migrated form submission for application: ${sourceSubmission.applicationId}`);
        
      } catch (error) {
        console.error(`❌ Error migrating form submission:`, error.message);
      }
    }
    
    console.log(`✅ Successfully migrated ${migratedFormSubmissions} form submissions`);
    
    // 6. Migrate Certificates
    console.log('\n🏆 Migrating certificates...');
    const certificatesCollection = sourceDb.collection('certificates');
    const sourceCertificates = await certificatesCollection.find({}).toArray();
    console.log(`📊 Found ${sourceCertificates.length} certificates to migrate`);
    
    let migratedCertificates = 0;
    
    for (const sourceCert of sourceCertificates) {
      try {
        // Check if certificate already exists
        const existingCert = await Certificate.findOne({
          applicationId: applicationMigrationMap.get(sourceCert.applicationId?.toString()),
          rtoId: TARGET_RTO_ID
        });
        
        if (existingCert) {
          console.log(`⏭️  Certificate already exists, skipping...`);
          continue;
        }
        
        // Create new certificate
        const newCert = new Certificate({
          applicationId: applicationMigrationMap.get(sourceCert.applicationId?.toString()),
          rtoId: TARGET_RTO_ID,
          status: sourceCert.status || 'issued',
          issuedDate: sourceCert.issuedDate || new Date(),
          expiryDate: sourceCert.expiryDate,
          certificateNumber: sourceCert.certificateNumber || `CERT-${Date.now()}`,
          isActive: sourceCert.isActive !== false,
          createdBy: userMigrationMap.get(sourceCert.createdBy?.toString()) || targetRTO.createdBy
        });
        
        // Remove fields that shouldn't be copied
        delete newCert._id;
        delete newCert.createdAt;
        delete newCert.updatedAt;
        delete newCert.__v;
        
        await newCert.save();
        migratedCertificates++;
        console.log(`✅ Migrated certificate: ${sourceCert.certificateNumber || sourceCert._id}`);
        
      } catch (error) {
        console.error(`❌ Error migrating certificate:`, error.message);
      }
    }
    
    console.log(`✅ Successfully migrated ${migratedCertificates} certificates`);
    
    // 7. Migrate Payments
    console.log('\n💰 Migrating payments...');
    const paymentsCollection = sourceDb.collection('payments');
    const sourcePayments = await paymentsCollection.find({}).toArray();
    console.log(`📊 Found ${sourcePayments.length} payments to migrate`);
    
    let migratedPayments = 0;
    
    for (const sourcePayment of sourcePayments) {
      try {
        // Check if payment already exists
        const existingPayment = await Payment.findOne({
          applicationId: applicationMigrationMap.get(sourcePayment.applicationId?.toString()),
          rtoId: TARGET_RTO_ID
        });
        
        if (existingPayment) {
          console.log(`⏭️  Payment already exists, skipping...`);
          continue;
        }
        
        // Get migration maps for required fields
        let mappedUserId = userMigrationMap.get(sourcePayment.userId?.toString());
        let mappedApplicationId = applicationMigrationMap.get(sourcePayment.applicationId?.toString());
        let mappedCertificationId = certificationMigrationMap.get(sourcePayment.certificationId?.toString());
        
        // If we don't have mapped IDs, skip this payment
        if (!mappedUserId || !mappedApplicationId || !mappedCertificationId) {
          console.log(`⏭️  Skipping payment ${sourcePayment._id} - missing mapped IDs (userId: ${mappedUserId}, applicationId: ${mappedApplicationId}, certificationId: ${mappedCertificationId})`);
          continue;
        }
        
        // Create new payment
        const newPayment = new Payment({
          userId: mappedUserId,
          applicationId: mappedApplicationId,
          certificationId: mappedCertificationId,
          rtoId: TARGET_RTO_ID,
          paymentType: sourcePayment.paymentType || 'one_time',
          totalAmount: sourcePayment.totalAmount || 0,
          currency: sourcePayment.currency || 'AUD',
          status: sourcePayment.status || 'pending',
          stripeCustomerId: sourcePayment.stripeCustomerId,
          paymentPlan: sourcePayment.paymentPlan,
          metadata: sourcePayment.metadata,
          paymentHistory: sourcePayment.paymentHistory || [],
          isActive: sourcePayment.isActive !== false,
          createdBy: userMigrationMap.get(sourcePayment.createdBy?.toString()) || targetRTO.createdBy
        });
        
        // Remove fields that shouldn't be copied
        delete newPayment._id;
        delete newPayment.createdAt;
        delete newPayment.updatedAt;
        delete newPayment.__v;
        
        await newPayment.save();
        migratedPayments++;
        console.log(`✅ Migrated payment: ${sourcePayment.transactionId || sourcePayment._id}`);
        
      } catch (error) {
        console.error(`❌ Error migrating payment:`, error.message);
      }
    }
    
    console.log(`✅ Successfully migrated ${migratedPayments} payments`);
    
    // 8. Migrate Tickets
    console.log('\n🎫 Migrating tickets...');
    const ticketsCollection = sourceDb.collection('tickets');
    const sourceTickets = await ticketsCollection.find({}).toArray();
    console.log(`📊 Found ${sourceTickets.length} tickets to migrate`);
    
    let migratedTickets = 0;
    
    for (const sourceTicket of sourceTickets) {
      try {
        // Check if ticket already exists
        const existingTicket = await Ticket.findOne({
          userId: userMigrationMap.get(sourceTicket.userId?.toString()),
          subject: sourceTicket.subject,
          rtoId: TARGET_RTO_ID
        });
        
        if (existingTicket) {
          console.log(`⏭️  Ticket already exists, skipping...`);
          continue;
        }
        
        // Create new ticket
        const newTicket = new Ticket({
          userId: userMigrationMap.get(sourceTicket.userId?.toString()),
          rtoId: TARGET_RTO_ID,
          subject: sourceTicket.subject || 'Support Request',
          description: sourceTicket.description || '',
          priority: sourceTicket.priority || 'medium',
          status: sourceTicket.status || 'open',
          category: sourceTicket.category || 'general',
          isActive: sourceTicket.isActive !== false,
          createdBy: userMigrationMap.get(sourceTicket.createdBy?.toString()) || targetRTO.createdBy
        });
        
        // Remove fields that shouldn't be copied
        delete newTicket._id;
        delete newTicket.createdAt;
        delete newTicket.updatedAt;
        delete newTicket.__v;
        
        await newTicket.save();
        migratedTickets++;
        console.log(`✅ Migrated ticket: ${sourceTicket.subject}`);
        
      } catch (error) {
        console.error(`❌ Error migrating ticket:`, error.message);
      }
    }
    
    console.log(`✅ Successfully migrated ${migratedTickets} tickets`);
    
    // 9. Migrate Document Uploads
    console.log('\n📁 Migrating document uploads...');
    const documentUploadsCollection = sourceDb.collection('documentuploads');
    const sourceDocumentUploads = await documentUploadsCollection.find({}).toArray();
    console.log(`📊 Found ${sourceDocumentUploads.length} document uploads to migrate`);
    
    let migratedDocumentUploads = 0;
    
    for (const sourceUpload of sourceDocumentUploads) {
      try {
        // Check if document upload already exists
        const existingUpload = await DocumentUpload.findOne({
          userId: userMigrationMap.get(sourceUpload.userId?.toString()),
          fileName: sourceUpload.fileName,
          rtoId: TARGET_RTO_ID
        });
        
        if (existingUpload) {
          console.log(`⏭️  Document upload already exists, skipping...`);
          continue;
        }
        
        // Get migration maps for required fields
        let mappedApplicationId = applicationMigrationMap.get(sourceUpload.applicationId?.toString());
        let mappedUserId = userMigrationMap.get(sourceUpload.userId?.toString());
        
        // If we don't have mapped IDs, skip this document upload
        if (!mappedApplicationId || !mappedUserId) {
          console.log(`⏭️  Skipping document upload ${sourceUpload._id} - missing mapped IDs (applicationId: ${mappedApplicationId}, userId: ${mappedUserId})`);
          continue;
        }
        
        // Additional validation: check if the referenced records actually exist in source database
        const sourceDb = sourceConnection.db;
        const sourceApplicationsCollection = sourceDb.collection('applications');
        const sourceUsersCollection = sourceDb.collection('users');
        
        const sourceAppExists = await sourceApplicationsCollection.findOne({ _id: sourceUpload.applicationId });
        const sourceUserExists = await sourceUsersCollection.findOne({ _id: sourceUpload.userId });
        
        if (!sourceAppExists || !sourceUserExists) {
          console.log(`⏭️  Skipping document upload ${sourceUpload._id} - referenced records don't exist in source (app: ${!!sourceAppExists}, user: ${!!sourceUserExists})`);
          continue;
        }
        
        // Create new document upload
        const newUpload = new DocumentUpload({
          applicationId: mappedApplicationId,
          userId: mappedUserId,
          rtoId: TARGET_RTO_ID,
          documents: sourceUpload.documents || [],
          status: sourceUpload.status || 'pending',
          version: sourceUpload.version || 1,
          submittedAt: sourceUpload.submittedAt,
          rejectionReason: sourceUpload.rejectionReason,
          verifiedAt: sourceUpload.verifiedAt,
          verifiedBy: userMigrationMap.get(sourceUpload.verifiedBy?.toString()),
          isActive: sourceUpload.isActive !== false,
          createdBy: userMigrationMap.get(sourceUpload.createdBy?.toString()) || targetRTO.createdBy
        });
        
        // Remove fields that shouldn't be copied
        delete newUpload._id;
        delete newUpload.createdAt;
        delete newUpload.updatedAt;
        delete newUpload.__v;
        
        await newUpload.save();
        migratedDocumentUploads++;
        console.log(`✅ Migrated document upload: ${sourceUpload.fileName}`);
        
      } catch (error) {
        console.error(`❌ Error migrating document upload:`, error.message);
      }
    }
    
    console.log(`✅ Successfully migrated ${migratedDocumentUploads} document uploads`);
    
    // 10. Migrate Initial Screening Forms
    console.log('\n📋 Migrating initial screening forms...');
    const initialScreeningFormsCollection = sourceDb.collection('initialscreeningforms');
    const sourceInitialScreeningForms = await initialScreeningFormsCollection.find({}).toArray();
    console.log(`📊 Found ${sourceInitialScreeningForms.length} initial screening forms to migrate`);
    
    let migratedInitialScreeningForms = 0;
    
    for (const sourceForm of sourceInitialScreeningForms) {
      try {
        // Check if form already exists
        const existingForm = await InitialScreeningForm.findOne({
          userId: userMigrationMap.get(sourceForm.userId?.toString()),
          rtoId: TARGET_RTO_ID
        });
        
        if (existingForm) {
          console.log(`⏭️  Initial screening form already exists, skipping...`);
          continue;
        }
        
        // Create new initial screening form
        const newForm = new InitialScreeningForm({
          userId: userMigrationMap.get(sourceForm.userId?.toString()),
          certificationId: certificationMigrationMap.get(sourceForm.certificationId?.toString()),
          rtoId: TARGET_RTO_ID,
          workExperienceYears: sourceForm.workExperienceYears || '0-1',
          workExperienceLocation: sourceForm.workExperienceLocation || 'Unknown',
          currentState: sourceForm.currentState || 'NSW',
          hasFormalQualifications: sourceForm.hasFormalQualifications || false,
          formalQualificationsDetails: sourceForm.formalQualificationsDetails || '',
          status: sourceForm.status || 'draft',
          submittedAt: sourceForm.submittedAt,
          reviewedAt: sourceForm.reviewedAt,
          reviewedBy: userMigrationMap.get(sourceForm.reviewedBy?.toString()),
          isActive: sourceForm.isActive !== false,
          createdBy: userMigrationMap.get(sourceForm.createdBy?.toString()) || targetRTO.createdBy
        });
        
        // Remove fields that shouldn't be copied
        delete newForm._id;
        delete newForm.createdAt;
        delete newForm.updatedAt;
        delete newForm.__v;
        
        await newForm.save();
        migratedInitialScreeningForms++;
        console.log(`✅ Migrated initial screening form for user: ${sourceForm.userId}`);
        
      } catch (error) {
        console.error(`❌ Error migrating initial screening form:`, error.message);
      }
    }
    
    console.log(`✅ Successfully migrated ${migratedInitialScreeningForms} initial screening forms`);
    
    // Summary
    console.log('\n🎉 Migration completed successfully!');
    console.log('\n📊 Migration Summary:');
    console.log(`   - RTO: ${targetRTO.companyName} (${targetRTO.subdomain})`);
    console.log(`   - Users migrated: ${migratedUsers}`);
    console.log(`   - Form templates migrated: ${migratedFormTemplates}`);
    console.log(`   - Certifications migrated: ${migratedCertifications}`);
    console.log(`   - Applications migrated: ${migratedApplications}`);
    console.log(`   - Form submissions migrated: ${migratedFormSubmissions}`);
    console.log(`   - Certificates migrated: ${migratedCertificates}`);
    console.log(`   - Payments migrated: ${migratedPayments}`);
    console.log(`   - Tickets migrated: ${migratedTickets}`);
    console.log(`   - Document uploads migrated: ${migratedDocumentUploads}`);
    console.log(`   - Initial screening forms migrated: ${migratedInitialScreeningForms}`);
    console.log(`   - Total items: ${migratedUsers + migratedFormTemplates + migratedCertifications + migratedApplications + migratedFormSubmissions + migratedCertificates + migratedPayments + migratedTickets + migratedDocumentUploads + migratedInitialScreeningForms}`);
    
    console.log('\n⚠️  Important Notes:');
    console.log('   1. All migrated users have temporary passwords and need to reset them');
    console.log('   2. Check and update any hardcoded references or IDs in the migrated data');
    console.log('   3. Verify that all relationships between entities are correctly mapped');
    console.log('   4. Test the system thoroughly after migration');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    // Close connections
    if (sourceConnection) {
      await sourceConnection.close();
      console.log('\n🔌 Closed source database connection');
    }
    if (targetConnection) {
      await targetConnection.close();
      console.log('🔌 Closed target database connection');
    }
  }
}

// Run migration
if (require.main === module) {
  migrateEBCData();
}

module.exports = migrateEBCData;
