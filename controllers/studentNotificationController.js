// controllers/studentNotificationController.js
const FormSubmission = require("../models/formSubmission");
const Application = require("../models/application");
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

      const recentUpdates = await FormSubmission.find({
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

      // Format the updates
      const updates = recentUpdates.map(update => {
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
          resubmissionDeadline: update.resubmissionDeadline || null
        };
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
          hasUpdates: updates.length > 0,
          updates: updates,
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
      const updates = await FormSubmission.find({
        applicationId,
        assessedBy: { $exists: true }
      })
      .populate("formTemplateId", "name")
      .populate("assessedBy", "firstName lastName")
      .sort({ assessedAt: -1 });

      const formattedUpdates = updates.map(update => ({
        id: update._id,
        formName: update.formTemplateId.name,
        assessorName: `${update.assessedBy.firstName} ${update.assessedBy.lastName}`,
        assessedAt: update.assessedAt,
        status: update.assessed,
        feedback: update.assessorFeedback || null,
        requiresChanges: update.assessed === "requires_changes",
        isApproved: update.assessed === "approved",
        resubmissionDeadline: update.resubmissionDeadline || null
      }));

      res.json({
        success: true,
        data: {
          applicationName: application.certificationId.name,
          applicationStatus: application.overallStatus,
          updates: formattedUpdates,
          hasUpdates: formattedUpdates.length > 0
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

      // Verify the notification belongs to the student
      const submission = await FormSubmission.findOne({
        _id: notificationId,
        applicationId: { $in: await Application.find({ userId }).distinct('_id') }
      });

      if (!submission) {
        return res.status(404).json({
          success: false,
          message: "Notification not found or access denied"
        });
      }

      // Mark as read (you can add a read field to the model if needed)
      // For now, we'll just return success
      res.json({
        success: true,
        message: "Notification marked as read",
        notificationId: notificationId
      });

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

      // Get all applications for this student
      const applications = await Application.find({ userId });
      const applicationIds = applications.map(app => app._id);

      // Get all form submissions with assessor updates for this student
      const submissions = await FormSubmission.find({
        applicationId: { $in: applicationIds },
        assessedBy: { $exists: true }
      });

      // Mark all as read (you can add a read field to the model if needed)
      // For now, we'll just return success
      res.json({
        success: true,
        message: "All notifications marked as read",
        markedCount: submissions.length
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
