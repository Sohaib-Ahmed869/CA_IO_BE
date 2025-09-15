// controllers/applicationExportController.js
const Application = require("../models/application");
const FormSubmission = require("../models/formSubmission");
const DocumentUpload = require("../models/documentUpload");
const Payment = require("../models/payment");

const applicationExportController = {
  // Export applications in CSV format
  exportApplicationsCSV: async (req, res) => {
    try {
      const {
        status,
        certification,
        assessor,
        dateFrom,
        dateTo,
        includeFields = 'basic',
        search,
      } = req.query;

      // Build filter based on user role
      const userId = req.user.id;
      const userRole = req.user.userType;

      const filter = { isArchived: { $ne: true } };

      if (userRole === 'assessor') {
        filter.assignedAssessor = userId;
      }

      if (status && status !== 'all' && status !== 'undefined') {
        filter.overallStatus = status;
      }
      if (certification && certification !== 'all') {
        filter.certificationId = certification;
      }
      if (assessor && assessor !== 'all' && userRole !== 'assessor') {
        filter.assignedAssessor = assessor;
      }
      if (dateFrom || dateTo) {
        filter.createdAt = {};
        if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
        if (dateTo) filter.createdAt.$lte = new Date(dateTo);
      }

      // Optional search by student name/email
      let searchFilter = {};
      if (search && search.trim() !== '' && search !== 'undefined') {
        const User = require("../models/user");
        const users = await User.find({
          $or: [
            { firstName: { $regex: search, $options: 'i' } },
            { lastName: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            {
              $expr: {
                $regexMatch: {
                  input: { $concat: ["$firstName", " ", "$lastName"] },
                  regex: search,
                  options: 'i',
                },
              },
            },
          ],
        }).select('_id');
        const userIds = users.map((u) => u._id);
        searchFilter.userId = { $in: userIds };
      }

      const finalFilter = { ...filter, ...searchFilter };

      const applications = await Application.find(finalFilter)
        .populate('userId', 'firstName lastName email phoneNumber')
        .populate('certificationId', 'name price')
        .populate('assignedAssessor', 'firstName lastName email')
        .populate('paymentId')
        .sort({ createdAt: -1 });

      const fieldSets = {
        basic: [
          'applicationId', 'studentName', 'email', 'phoneNumber',
          'certification', 'status', 'createdAt',
        ],
        detailed: [
          'applicationId', 'studentName', 'email', 'phoneNumber',
          'certification', 'status', 'assignedAssessor', 'currentStep',
          'createdAt', 'updatedAt',
        ],
        full: [
          'applicationId', 'studentName', 'email', 'phoneNumber',
          'certification', 'status', 'assignedAssessor', 'currentStep',
          'paymentStatus', 'paymentAmount', 'documentsCount', 'formsCount',
          'createdAt', 'updatedAt',
        ],
      };

      const selectedFields = fieldSets[includeFields] || fieldSets.basic;

      const csvData = await Promise.all(
        applications.map(async (app) => {
          const row = {};
          const student = app.userId || {};

          let paymentAmount = 0;
          let paymentStatus = app.paymentId?.status || 'pending';
          if (includeFields === 'full' && app.paymentId) {
            try {
              const payment = await Payment.findById(app.paymentId);
              if (payment) {
                paymentAmount = payment.totalAmount || 0;
                paymentStatus = payment.status || paymentStatus;
              }
            } catch (_) {}
          }

          let documentsCount = 0;
          let formsCount = 0;
          if (includeFields === 'full') {
            try {
              const [documentUpload, formsNum] = await Promise.all([
                DocumentUpload.findOne({ applicationId: app._id }),
                FormSubmission.countDocuments({ applicationId: app._id }),
              ]);
              documentsCount = documentUpload ? (documentUpload.documents?.length || 0) : 0;
              formsCount = formsNum;
            } catch (_) {}
          }

          if (selectedFields.includes('applicationId')) row.applicationId = app._id.toString();
          if (selectedFields.includes('studentName')) row.studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'N/A';
          if (selectedFields.includes('email')) row.email = student.email || '';
          if (selectedFields.includes('phoneNumber')) row.phoneNumber = student.phoneNumber || '';
          if (selectedFields.includes('certification')) row.certification = app.certificationId?.name || 'N/A';
          if (selectedFields.includes('status')) row.status = app.overallStatus || 'pending';
          if (selectedFields.includes('assignedAssessor')) row.assignedAssessor = app.assignedAssessor ? `${app.assignedAssessor.firstName || ''} ${app.assignedAssessor.lastName || ''}`.trim() || 'Unassigned' : 'Unassigned';
          if (selectedFields.includes('currentStep')) row.currentStep = app.currentStep || 1;
          if (selectedFields.includes('paymentStatus')) row.paymentStatus = paymentStatus;
          if (selectedFields.includes('paymentAmount')) row.paymentAmount = paymentAmount;
          if (selectedFields.includes('documentsCount')) row.documentsCount = documentsCount;
          if (selectedFields.includes('formsCount')) row.formsCount = formsCount;
          if (selectedFields.includes('createdAt')) row.createdAt = app.createdAt ? new Date(app.createdAt).toLocaleDateString() : '';
          if (selectedFields.includes('updatedAt')) row.updatedAt = app.updatedAt ? new Date(app.updatedAt).toLocaleDateString() : '';

          return row;
        })
      );

      const headerMap = {
        applicationId: 'Application ID',
        studentName: 'Student Name',
        email: 'Email',
        phoneNumber: 'Phone Number',
        certification: 'Certification',
        status: 'Status',
        assignedAssessor: 'Assigned Assessor',
        currentStep: 'Current Step',
        paymentStatus: 'Payment Status',
        paymentAmount: 'Payment Amount',
        documentsCount: 'Documents Count',
        formsCount: 'Forms Count',
        createdAt: 'Created Date',
        updatedAt: 'Updated Date',
      };

      const csvHeader = selectedFields.map((f) => headerMap[f] || f).join(',');
      const csvRows = csvData.map((row) =>
        selectedFields
          .map((f) => {
            const value = row[f] ?? '';
            return typeof value === 'string' && value.includes(',')
              ? `"${value.replace(/"/g, '""')}"`
              : value;
          })
          .join(',')
      );

      const csvContent = [csvHeader, ...csvRows].join('\n');

      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `applications_export_${timestamp}.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);
    } catch (error) {
      console.error('Export applications CSV error:', error);
      res.status(500).json({ success: false, message: 'Error exporting application data' });
    }
  },
};

module.exports = applicationExportController;
