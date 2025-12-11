const User = require("../models/user");
const Application = require("../models/application");

const adminStudentController = {
  // Get all students with filtering and pagination
  getAllStudents: async (req, res) => {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        status,
        sortBy = "newest",
      } = req.query;

      // Build filter object for students only
      const filter = { userType: "user" };

      if (status && status !== "all") {
        if (status === "active") {
          filter.isActive = true;
        } else if (status === "inactive") {
          filter.isActive = false;
        }
      }

      // Build search query - search by name, email, and phone number
      if (search && search.trim() !== "") {
        const searchTerm = search.trim();
        
        // Escape special regex characters
        const escapedSearch = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Build search conditions
        const searchConditions = [
          { firstName: { $regex: escapedSearch, $options: "i" } },
          { lastName: { $regex: escapedSearch, $options: "i" } },
          { email: { $regex: escapedSearch, $options: "i" } },
          { phoneNumber: { $regex: escapedSearch, $options: "i" } },
        ];
        
        // Search for full name (firstName + " " + lastName) - handles "John Doe" searches
        searchConditions.push({
          $expr: {
            $regexMatch: {
              input: { $concat: ["$firstName", " ", "$lastName"] },
              regex: escapedSearch,
              options: "i"
            }
          }
        });
        
        // Search for reversed full name (lastName + " " + firstName) - handles "Doe John" searches
        searchConditions.push({
          $expr: {
            $regexMatch: {
              input: { $concat: ["$lastName", " ", "$firstName"] },
              regex: escapedSearch,
              options: "i"
            }
          }
        });
        
        // Search for full phone number (phoneCode + phoneNumber)
        // Remove common phone formatting characters for better matching
        const phoneSearchTerm = searchTerm.replace(/[\s\-\(\)\+]/g, '');
        if (phoneSearchTerm.length > 0) {
          searchConditions.push({
            $expr: {
              $regexMatch: {
                input: { 
                  $concat: [
                    { $ifNull: ["$phoneCode", ""] },
                    { $ifNull: ["$phoneNumber", ""] }
                  ]
                },
                regex: phoneSearchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                options: "i"
              }
            }
          });
          
          // Also search phoneNumber without phoneCode (in case user searches without country code)
          searchConditions.push({
            phoneNumber: { 
              $regex: phoneSearchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 
              $options: "i" 
            }
          });
        }
        
        filter.$or = searchConditions;
      }

      // Build sort object
      let sortObject = {};
      switch (sortBy) {
        case "oldest":
          sortObject = { createdAt: 1 };
          break;
        case "name":
          sortObject = { firstName: 1, lastName: 1 };
          break;
        default: // newest
          sortObject = { createdAt: -1 };
      }

      // Get students
      const students = await User.find(filter)
        .select(
          "firstName lastName email phoneCode phoneNumber userType isActive createdAt"
        )
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort(sortObject);

      // Get applications for each student with step tracking
      const { calculateApplicationSteps } = require("../utils/stepCalculator");
      const studentsWithApplications = await Promise.all(
        students.map(async (student) => {
          const applications = await Application.find({
            userId: student._id,
            isArchived: { $ne: true },
          })
            .populate("certificationId", "name price category")
            .populate("paymentId", "status")
            .sort({ createdAt: -1 });

          // Calculate steps for each application (same as applications endpoint)
          const applicationsWithSteps = await Promise.all(
            applications.map(async (app) => {
              let stepsSummary = null;
              try {
                const stepData = await calculateApplicationSteps(app._id);
                const studentSteps = (stepData.steps || []).filter(
                  (s) => s.isUserVisible === true || s.actor === "student" || s.actor === "third_party"
                );
                const totalSteps = studentSteps.length;
                const completedSteps = studentSteps.filter((s) => s.isCompleted).length;
                const firstIncomplete = studentSteps.find((s) => !s.isCompleted);
                const currentStep = firstIncomplete
                  ? firstIncomplete.stepNumber
                  : (studentSteps[studentSteps.length - 1]?.stepNumber || 0);
                const progressPercentage = totalSteps > 0
                  ? Math.round((completedSteps / totalSteps) * 100)
                  : 0;
                stepsSummary = {
                  currentStep,
                  totalSteps,
                  completedSteps,
                  progressPercentage,
                  steps: studentSteps,
                };
              } catch (e) {
                stepsSummary = { currentStep: 0, totalSteps: 0, completedSteps: 0, progressPercentage: 0, steps: [] };
              }
              return { ...app.toObject(), steps: stepsSummary };
            })
          );

          return {
            ...student.toObject(),
            applications: applicationsWithSteps || [],
          };
        })
      );

      // Apply additional filters based on applications
      let filteredStudents = studentsWithApplications;
      if (status === "with_applications") {
        filteredStudents = studentsWithApplications.filter(
          (s) => s.applications.length > 0
        );
      } else if (status === "no_applications") {
        filteredStudents = studentsWithApplications.filter(
          (s) => s.applications.length === 0
        );
      }

      // Get total count
      const total = await User.countDocuments(filter);

      res.json({
        success: true,
        data: {
          students: filteredStudents,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
          },
        },
      });
    } catch (error) {
      console.error("Get all students error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching students",
      });
    }
  },

  // Get student statistics
  getStudentStats: async (req, res) => {
    try {
      const totalStudents = await User.countDocuments({ userType: "user" });
      const activeStudents = await User.countDocuments({
        userType: "user",
        isActive: true,
      });

      // Get students with applications
      const studentsWithApps = await User.aggregate([
        { $match: { userType: "user" } },
        {
          $lookup: {
            from: "applications",
            localField: "_id",
            foreignField: "userId",
            as: "applications",
            pipeline: [{ $match: { isArchived: { $ne: true } } }],
          },
        },
        {
          $addFields: {
            applicationCount: { $size: "$applications" },
          },
        },
        {
          $group: {
            _id: null,
            studentsWithApplications: {
              $sum: { $cond: [{ $gt: ["$applicationCount", 0] }, 1, 0] },
            },
            totalApplications: { $sum: "$applicationCount" },
          },
        },
      ]);

      const stats = {
        totalStudents,
        activeStudents,
        studentsWithApplications:
          studentsWithApps[0]?.studentsWithApplications || 0,
        totalApplications: studentsWithApps[0]?.totalApplications || 0,
      };

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("Get student stats error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching student statistics",
      });
    }
  },

  // Update student status
  updateStudentStatus: async (req, res) => {
    try {
      const { studentId } = req.params;
      const { isActive } = req.body;

      const student = await User.findOneAndUpdate(
        { _id: studentId, userType: "user" },
        { isActive },
        { new: true }
      ).select("firstName lastName email isActive");

      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student not found",
        });
      }

      res.json({
        success: true,
        message: `Student ${
          isActive ? "activated" : "deactivated"
        } successfully`,
        data: student,
      });
    } catch (error) {
      console.error("Update student status error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating student status",
      });
    }
  },

  // Update student information
  updateStudentInfo: async (req, res) => {
    try {
      const { studentId } = req.params;
      const { firstName, lastName, phoneNumber, phoneCode, email } = req.body;

      // Validate required fields
      if (!firstName || !lastName || !phoneNumber) {
        return res.status(400).json({
          success: false,
          message: "firstName, lastName, and phoneNumber are required",
        });
      }

      // Check if student exists
      const student = await User.findOne({ _id: studentId, userType: "user" });
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student not found",
        });
      }

      // Check if email is being changed and if it already exists
      if (email && email !== student.email) {
        const existingUser = await User.findOne({ email, _id: { $ne: studentId } });
        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: "Email already exists with another user",
          });
        }
      }

      // Update student information
      student.firstName = firstName.trim();
      student.lastName = lastName.trim();
      student.phoneNumber = phoneNumber.trim();
      
      // Update phone code if provided
      if (phoneCode) {
        student.phoneCode = phoneCode.trim();
      }

      // Update email if provided
      if (email) {
        student.email = email.toLowerCase().trim();
      }

      await student.save();

      res.json({
        success: true,
        message: "Student information updated successfully",
        data: {
          id: student._id,
          firstName: student.firstName,
          lastName: student.lastName,
          email: student.email,
          phoneNumber: student.phoneNumber,
          phoneCode: student.phoneCode,
          userType: student.userType,
          isActive: student.isActive,
        },
      });
    } catch (error) {
      console.error("Update student info error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating student information",
      });
    }
  },

  // Bulk applications summary for a student
  getStudentApplicationsSummary: async (req, res) => {
    try {
      const { studentId } = req.params;

      // Verify student exists
      const student = await User.findOne({ _id: studentId, userType: "user" }).select('_id');
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }

      // Fetch applications lightly with payment populated
      const applications = await Application.find({ userId: studentId, isArchived: { $ne: true } })
        .select('createdAt overallStatus paymentId')
        .populate('paymentId', 'status');

      // Compute steps per application
      const summaries = [];
      for (const app of applications) {
        let completed = 0;
        let total = 0;
        try {
          const { StepCalculator } = require('../utils/stepCalculator');
          const calc = new StepCalculator(app);
          await calc.calculateSteps();
          const steps = calc.steps || [];
          const userSteps = steps.filter((s) => s.isUserVisible);
          total = userSteps.length;
          completed = userSteps.filter((s) => s.isCompleted).length;

          // Adjust payment step to 0/total until a real payment happens
          try {
            const Payment = require('../models/payment');
            const fullPayment = app.paymentId ? await Payment.findById(app.paymentId) : null;
            const hasRealPayment = !!(fullPayment && (
              (fullPayment.paymentType === 'one_time' && fullPayment.status === 'completed') ||
              (fullPayment.paymentType === 'payment_plan' && (
                (fullPayment.paymentPlan?.initialPayment?.status === 'completed') ||
                ((fullPayment.paymentPlan?.recurringPayments?.completedPayments || 0) > 0)
              ))
            ));

            if (!hasRealPayment) {
              const paymentStep = userSteps.find((s) => s.type === 'payment');
              if (paymentStep && paymentStep.isCompleted) {
                completed = Math.max(0, completed - 1);
              }
            }
          } catch (_) {
            // ignore adjustment errors
          }
        } catch (_) {
          completed = 0;
          total = 0;
        }

        summaries.push({
          applicationId: String(app._id),
          createdAt: app.createdAt,
          overallStatus: app.overallStatus,
          paymentStatus: app.paymentId ? app.paymentId.status : undefined,
          steps: { completed, total },
        });
      }

      return res.json({ success: true, data: summaries });
    } catch (error) {
      console.error('Get student applications summary error:', error);
      res.status(500).json({ success: false, message: 'Error fetching applications summary' });
    }
  },
};

module.exports = adminStudentController;
