// controllers/studentNotificationController.js
const FormSubmission = require("../models/formSubmission");
const Application = require("../models/application");
const DocumentUpload = require("../models/documentUpload");
const User = require("../models/user");

const studentNotificationController = {
  // Get assessor updates for a student
  getAssessorUpdates: async (req, res) => {
    try {
      const userId = req.user._id;
      
      // Get all applications for this student
      const applications = await Application.find({ userId })
        .populate("certificationId", "name")
        .select("_id certificationId overallStatus");

      if (!applications || applications.length === 0) {
        return res.json({
          success: true,
          data: {
            hasUpdates: false,
            updates: [],
            message: "No applications found"
          }
        });
      }

      const applicationIds = applications.map(app => app._id);

      // Get recent assessor updates (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Form updates
      const recentFormUpdates = await FormSubmission.find({
        applicationId: { $in: applicationIds },
        assessedAt: { $gte: sevenDaysAgo },
        assessedBy: { $exists: true }
      })
      .populate("formTemplateId", "name")
      .populate("assessedBy", "firstName lastName")
      .populate({
        path: "applicationId",
        populate: {
          path: "certificationId",
          select: "name"
        }
      })
      .sort({ assessedAt: -1 });

      const formUpdates = recentFormUpdates.filter(u => !u.studentRead).map(update => {
        const application = applications.find(app => 
          app._id.toString() === update.applicationId._id.toString()
        );

        return {
          id: update._id,
          applicationId: update.applicationId._id,
          applicationName: update.applicationId.certificationId.name,
          formName: update.formTemplateId.name,
          assessorName: `${update.assessedBy.firstName} ${update.assessedBy.lastName}`,
          assessedAt: update.assessedAt,
          status: update.assessed,
          feedback: update.assessorFeedback || null,
          requiresChanges: update.assessed === "requires_changes",
          isApproved: update.assessed === "approved",
          resubmissionDeadline: update.resubmissionDeadline || null,
          type: "form"
        };
      });

      // Document/Evidence updates (verification/resubmission activity)
      const recentDocUpdates = await DocumentUpload.find({
        applicationId: { $in: applicationIds },
        updatedAt: { $gte: sevenDaysAgo }
      })
        .select("applicationId status rejectionReason updatedAt submittedAt verifiedAt documents")
        .populate({
          path: "applicationId",
          populate: { path: "certificationId", select: "name" }
        })
        .sort({ updatedAt: -1 });

      const docUpdates = recentDocUpdates.filter(d => !d.studentRead).flatMap(docUpload => {
        const base = {
          id: docUpload._id,
          applicationId: docUpload.applicationId._id,
          applicationName: docUpload.applicationId.certificationId.name,
          status: docUpload.status,
          rejectionReason: docUpload.rejectionReason || null,
          updatedAt: docUpload.updatedAt,
          submittedAt: docUpload.submittedAt || null,
          verifiedAt: docUpload.verifiedAt || null,
          type: "documents"
        };

        // If the upload contains any rejected items, surface those as separate actionable updates
        const rejectedItems = (docUpload.documents || []).filter(d => ["rejected", "requires_update"].includes(d.verificationStatus));
        if (rejectedItems.length === 0) {
          return [base];
        }

        return [
          base,
          ...rejectedItems.map(item => ({
            ...base,
            id: `${docUpload._id}:${item._id}`,
            documentId: item._id,
            documentType: item.documentType,
            verificationStatus: item.verificationStatus,
            itemRejectionReason: item.rejectionReason || null,
            type: ["photo_evidence", "video_demonstration"].includes(item.documentType)
              ? "evidence"
              : "documents"
          }))
        ];
      });

      // Merge and sort all updates by newest first
      const allUpdates = [...formUpdates, ...docUpdates].sort((a, b) => {
        const aDate = a.assessedAt || a.updatedAt || a.submittedAt || 0;
        const bDate = b.assessedAt || b.updatedAt || b.submittedAt || 0;
        return new Date(bDate) - new Date(aDate);
      });

      // Get pending assessments count
      const pendingAssessments = await FormSubmission.countDocuments({
        applicationId: { $in: applicationIds },
        status: "submitted",
        assessed: { $exists: false }
      });

      res.json({
        success: true,
        data: {
          hasUpdates: allUpdates.length > 0,
          updates: allUpdates,
          pendingCount: pendingAssessments,
          totalApplications: applications.length
        }
      });

    } catch (error) {
      console.error("Get assessor updates error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching assessor updates",
        error: error.message
      });
    }
  },

  // Get specific application updates
  getApplicationUpdates: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const userId = req.user._id;

      // Verify the application belongs to the student
      const application = await Application.findOne({
        _id: applicationId,
        userId
      }).populate("certificationId", "name");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found or access denied"
        });
      }

      // Get all form submissions for this application with assessor updates
      const formUpdates = await FormSubmission.find({
        applicationId,
        assessedBy: { $exists: true }
      })
      .populate("formTemplateId", "name")
      .populate("assessedBy", "firstName lastName")
      .sort({ assessedAt: -1 });

      const formattedFormUpdates = formUpdates.filter(u => !u.studentRead).map(update => ({
        id: update._id,
        formName: update.formTemplateId.name,
        assessorName: `${update.assessedBy.firstName} ${update.assessedBy.lastName}`,
        assessedAt: update.assessedAt,
        status: update.assessed,
        feedback: update.assessorFeedback || null,
        requiresChanges: update.assessed === "requires_changes",
        isApproved: update.assessed === "approved",
        resubmissionDeadline: update.resubmissionDeadline || null,
        type: "form"
      }));

      // Document updates for this application
      const docUpload = await DocumentUpload.findOne({ applicationId })
        .select("status rejectionReason updatedAt submittedAt verifiedAt documents")
        .sort({ updatedAt: -1 });

      let formattedDocUpdates = [];
      if (docUpload && !docUpload.studentRead) {
        const base = {
          id: docUpload._id,
          status: docUpload.status,
          rejectionReason: docUpload.rejectionReason || null,
          updatedAt: docUpload.updatedAt,
          submittedAt: docUpload.submittedAt || null,
          verifiedAt: docUpload.verifiedAt || null,
          type: "documents"
        };

        const rejectedItems = (docUpload.documents || []).filter(d => ["rejected", "requires_update"].includes(d.verificationStatus));
        formattedDocUpdates = [base].concat(rejectedItems.map(item => ({
          ...base,
          id: `${docUpload._id}:${item._id}`,
          documentId: item._id,
          documentType: item.documentType,
          verificationStatus: item.verificationStatus,
          itemRejectionReason: item.rejectionReason || null,
          type: ["photo_evidence", "video_demonstration"].includes(item.documentType)
            ? "evidence"
            : "documents"
        })));
      }

      const allUpdates = [...formattedFormUpdates, ...formattedDocUpdates].sort((a, b) => {
        const aDate = a.assessedAt || a.updatedAt || a.submittedAt || 0;
        const bDate = b.assessedAt || b.updatedAt || b.submittedAt || 0;
        return new Date(bDate) - new Date(aDate);
      });

      res.json({
        success: true,
        data: {
          applicationName: application.certificationId.name,
          applicationStatus: application.overallStatus,
          updates: allUpdates,
          hasUpdates: allUpdates.length > 0
        }
      });

    } catch (error) {
      console.error("Get application updates error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching application updates",
        error: error.message
      });
    }
  },

  // Mark a specific notification as read
  markAsRead: async (req, res) => {
    try {
      const { notificationId } = req.params;
      const userId = req.user._id;

      const appIds = await Application.find({ userId }).distinct('_id');

      let updated = 0;

      // Try form submission first
      const form = await FormSubmission.findOne({ _id: notificationId, applicationId: { $in: appIds } });
      if (form) {
        form.studentRead = true;
        await form.save();
        updated = 1;
      } else {
        // Try document upload or document item
        const [docId, itemId] = String(notificationId).split(":");
        const doc = await DocumentUpload.findOne({ _id: docId, applicationId: { $in: appIds } });
        if (doc) {
          if (itemId) {
            const item = doc.documents.id(itemId);
            if (item) {
              item.studentRead = true;
              updated = 1;
            }
          } else {
            doc.studentRead = true;
            updated = 1;
          }
          await doc.save();
        }
      }

      if (!updated) {
        return res.status(404).json({ success: false, message: "Notification not found or access denied" });
      }

      res.json({ success: true, message: "Notification marked as read", notificationId });

    } catch (error) {
      console.error("Mark notification as read error:", error);
      res.status(500).json({
        success: false,
        message: "Error marking notification as read",
        error: error.message
      });
    }
  },

  // Mark all notifications as read
  markAllAsRead: async (req, res) => {
    try {
      const userId = req.user._id;

      const appIds = await Application.find({ userId }).distinct('_id');

      const formResult = await FormSubmission.updateMany(
        { applicationId: { $in: appIds } },
        { $set: { studentRead: true } }
      );

      const docResult = await DocumentUpload.updateMany(
        { applicationId: { $in: appIds } },
        { $set: { studentRead: true, 'documents.$[].studentRead': true } }
      );

      res.json({
        success: true,
        message: "All notifications marked as read",
        markedCount: (formResult.modifiedCount || 0) + (docResult.modifiedCount || 0)
      });

    } catch (error) {
      console.error("Mark all notifications as read error:", error);
      res.status(500).json({
        success: false,
        message: "Error marking all notifications as read",
        error: error.message
      });
    }
  }
};

module.exports = studentNotificationController;
