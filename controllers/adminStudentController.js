const User = require("../models/user");
const Application = require("../models/application");
const { rtoFilter } = require("../middleware/tenant");

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

      // Build search query
      if (search && search.trim() !== "") {
        filter.$or = [
          { firstName: { $regex: search, $options: "i" } },
          { lastName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ];
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
      const students = await User.find({ ...rtoFilter(req.rtoId), ...filter })
        .select(
          "firstName lastName email phoneCode phoneNumber userType isActive createdAt"
        )
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort(sortObject);

      // Get applications for each student
      const studentsWithApplications = await Promise.all(
        students.map(async (student) => {
          const applications = await Application.find({
            userId: student._id,
            isArchived: { $ne: true },
          })
            .populate("certificationId", "name price category")
            .populate("paymentId", "status")
            .sort({ createdAt: -1 });

          return {
            ...student.toObject(),
            applications: applications || [],
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
      const total = await User.countDocuments({ ...rtoFilter(req.rtoId) });

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
};

module.exports = adminStudentController;
