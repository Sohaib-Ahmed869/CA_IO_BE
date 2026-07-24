const User = require("../models/user");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const emailService = require("../services/emailService2");

// Central ACL catalog
const ACL_CATALOG = Object.freeze({
  finance_dashboard: ["read"],
  applications: ["read", "update", "export"],
  applications_archived: ["read", "export"],
  tasks: ["read", "write", "update", "delete"],
  users: ["read", "update"],
  students: ["read"],
});

// Role templates
const ROLE_TEMPLATES = Object.freeze({
  manager: [
    { module: "finance_dashboard", action: "read" },
    { module: "applications", action: "read" },
    { module: "applications_archived", action: "read" },
    { module: "tasks", action: "read" },
    { module: "tasks", action: "update" },
    { module: "users", action: "read" },
    { module: "students", action: "read" },
  ],
  sales_manager: [
    { module: "finance_dashboard", action: "read" },
    { module: "applications", action: "read" },
    { module: "applications_archived", action: "read" },
    { module: "tasks", action: "read" },
    { module: "tasks", action: "update" },
    { module: "users", action: "read" },
    { module: "students", action: "read" },
  ],
  sales_agent: [
    { module: "applications", action: "read" },
    { module: "applications_archived", action: "read" },
    { module: "tasks", action: "read" },
    { module: "students", action: "read" },
  ],
});

// Helper function to get allowed user types based on current user role
const getAllowedUserTypes = (isCEO) => {
  if (isCEO) {
    return ["super_admin", "admin", "sales_agent", "sales_manager", "assessor", "user"];
  } else {
    return ["user"]; // Non-CEO admins can only create regular users
  }
};

// Non-CEO admins may only manage regular student accounts.
// CEO (admin with ceo=true) and super_admin can manage anyone.
const canManageTarget = (actor, target) =>
  actor.userType === "super_admin" || actor.ceo === true || target.userType === "user";

// Create a new user (admin/CEO only)
const createUser = async (req, res) => {
  try {
    const { firstName, lastName, email, password, userType, phoneCode, phoneNumber } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !password || !userType) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: firstName, lastName, email, password, userType"
      });
    }

    // Get allowed user types based on current user's role
    const allowedUserTypes = getAllowedUserTypes(req.user.ceo);
    
    // Validate userType
    if (!allowedUserTypes.includes(userType)) {
      const message = req.user.ceo 
        ? `Invalid userType. Must be one of: ${allowedUserTypes.join(", ")}`
        : `Only CEO can create privileged roles. You can only create: ${allowedUserTypes.join(", ")}`;
      
      return res.status(403).json({
        success: false,
        message
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User with this email already exists"
      });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long"
      });
    }

    // Create new user
    const newUser = new User({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      password,
      userType,
      phoneCode: phoneCode || '+61',
      phoneNumber: phoneNumber || '',
      isActive: true,
      // Set CEO flag if userType is super_admin
      ceo: userType === 'super_admin'
    });

    await newUser.save();

    // Return user without password
    const userResponse = {
      _id: newUser._id,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      email: newUser.email,
      userType: newUser.userType,
      phoneCode: newUser.phoneCode,
      phoneNumber: newUser.phoneNumber,
      isActive: newUser.isActive,
      ceo: newUser.ceo,
      createdAt: newUser.createdAt,
      updatedAt: newUser.updatedAt
    };

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: userResponse
    });

  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

const normalizeQueryParam = (v) => {
  if (v === undefined || v === null) return '';
  const s = Array.isArray(v) ? String(v[v.length - 1] ?? '') : String(v);
  return s.trim();
};

// Get all users with filtering and pagination (admin/CEO only)
const getUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      userType,
      roles,
      search,
      isActive,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      includeCounts
    } = req.query;

    const userTypeNorm = normalizeQueryParam(userType);
    const rolesNorm = normalizeQueryParam(roles);
    const searchNorm = normalizeQueryParam(search);
    const isActiveNorm = normalizeQueryParam(isActive);

    // Build filter object
    const filter = {};

    if (userTypeNorm) {
      filter.userType = userTypeNorm;
    } else {
      // Support roles filter (comma-separated). Default: sales staff and assessors when no explicit filter.
      const rolesList = rolesNorm
        ? rolesNorm.split(',').map((r) => r.trim()).filter(Boolean)
        : [];
      if (rolesList.length > 0) {
        filter.userType = { $in: rolesList };
      } else {
        filter.userType = { $in: ['sales_agent', 'sales_manager', 'assessor'] };
      }
    }

    if (isActiveNorm === 'true') {
      filter.isActive = true;
    } else if (isActiveNorm === 'false') {
      filter.isActive = false;
    }

    if (searchNorm) {
      filter.$or = [
        { firstName: { $regex: searchNorm, $options: 'i' } },
        { lastName: { $regex: searchNorm, $options: 'i' } },
        { email: { $regex: searchNorm, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get users with pagination
    const users = await User.find(filter)
      .select('-password -resetPasswordToken -resetPasswordExpires')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalUsers = await User.countDocuments(filter);
    const totalPages = Math.ceil(totalUsers / parseInt(limit));

    // Get user type distribution
    const userTypeStats = await User.aggregate([
      { $group: { _id: '$userType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Optional: counts for current filter (for pagination widgets, tabs, etc.)
    let counts = undefined;
    if ((includeCounts || '').toString().toLowerCase() === 'true') {
      const [roleCountsAgg, activeCountsAgg] = await Promise.all([
        User.aggregate([
          { $match: filter },
          { $group: { _id: '$userType', count: { $sum: 1 } } }
        ]),
        User.aggregate([
          { $match: filter },
          { $group: { _id: '$isActive', count: { $sum: 1 } } }
        ])
      ]);

      const byRole = {
        super_admin: 0,
        admin: 0,
        assessor: 0,
        sales_manager: 0,
        sales_agent: 0,
        user: 0
      };
      roleCountsAgg.forEach(rc => {
        if (byRole.hasOwnProperty(rc._id)) byRole[rc._id] = rc.count;
      });

      let activeCount = 0;
      let inactiveCount = 0;
      activeCountsAgg.forEach(ac => {
        if (ac._id === true) activeCount = ac.count; else inactiveCount = ac.count;
      });

      counts = {
        total: totalUsers,
        byRole,
        active: activeCount,
        inactive: inactiveCount
      };
    }

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalUsers,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        },
        stats: {
          userTypeDistribution: userTypeStats
        },
        counts
      }
    });

  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Get user by ID (admin/CEO only)
const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select('-password -resetPasswordToken -resetPasswordExpires');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error("Get user by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Update user (admin/CEO only)
const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, email, userType, phoneCode, phoneNumber, isActive } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (!canManageTarget(req.user, user)) {
      return res.status(403).json({
        success: false,
        message: "CEO privileges required to modify privileged accounts"
      });
    }

    // Check if non-CEO admin is trying to update to privileged roles
    if (userType) {
      const allowedUserTypes = getAllowedUserTypes(req.user.ceo);
      if (!allowedUserTypes.includes(userType)) {
        const message = req.user.ceo 
          ? `Invalid userType. Must be one of: ${allowedUserTypes.join(", ")}`
          : `Only CEO can assign privileged roles. You can only assign: ${allowedUserTypes.join(", ")}`;
        
        return res.status(403).json({
          success: false,
          message
        });
      }
    }

    // Check if email is being changed and if it already exists
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ 
        email: email.toLowerCase(),
        _id: { $ne: userId }
      });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "Email already exists for another user"
        });
      }
    }

    // Update fields
    if (firstName) user.firstName = firstName.trim();
    if (lastName) user.lastName = lastName.trim();
    if (email) user.email = email.toLowerCase().trim();
    if (userType) {
      user.userType = userType;
      user.ceo = userType === 'super_admin';
    }
    if (phoneCode !== undefined) user.phoneCode = phoneCode;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (isActive !== undefined) user.isActive = isActive;

    await user.save();

    // Return updated user without password
    const userResponse = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      userType: user.userType,
      phoneCode: user.phoneCode,
      phoneNumber: user.phoneNumber,
      isActive: user.isActive,
      ceo: user.ceo,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    res.json({
      success: true,
      message: "User updated successfully",
      data: userResponse
    });

  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Deactivate user (admin/CEO only)
const deactivateUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (!canManageTarget(req.user, user)) {
      return res.status(403).json({
        success: false,
        message: "CEO privileges required to deactivate privileged accounts"
      });
    }

    user.isActive = false;
    await user.save();

    res.json({
      success: true,
      message: "User deactivated successfully"
    });

  } catch (error) {
    console.error("Deactivate user error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Reset user password (admin/CEO only)
const resetUserPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (!canManageTarget(req.user, user)) {
      return res.status(403).json({
        success: false,
        message: "CEO privileges required to reset passwords for privileged accounts"
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: "User password reset successfully"
    });

  } catch (error) {
    console.error("Reset user password error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Get allowed user types for current user (admin/CEO only)
const getAllowedUserTypesEndpoint = async (req, res) => {
  try {
    const allowedUserTypes = getAllowedUserTypes(req.user.ceo);
    
    res.json({
      success: true,
      data: {
        allowedUserTypes,
        isCEO: req.user.ceo,
        currentUserType: req.user.userType
      }
    });

  } catch (error) {
    console.error("Get allowed user types error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Get user statistics for dashboard (admin/CEO only)
const getUserStats = async (req, res) => {
  try {
    // Get total users count
    const totalUsers = await User.countDocuments();

    // Get active users count
    const activeUsers = await User.countDocuments({ isActive: true });

    // Get admins count (admin + super_admin)
    const admins = await User.countDocuments({ 
      userType: { $in: ['admin', 'super_admin'] } 
    });

    // Get assessors count
    const assessors = await User.countDocuments({ userType: 'assessor' });

    // Get sales agents count
    const salesAgents = await User.countDocuments({ userType: 'sales_agent' });

    // Get sales managers count
    const salesManagers = await User.countDocuments({ userType: 'sales_manager' });

    // Get regular users count
    const regularUsers = await User.countDocuments({ userType: 'user' });

    // Get inactive users count
    const inactiveUsers = await User.countDocuments({ isActive: false });

    // Get recent users (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentUsers = await User.countDocuments({ 
      createdAt: { $gte: thirtyDaysAgo } 
    });

    // Get user type distribution
    const userTypeDistribution = await User.aggregate([
      {
        $group: {
          _id: '$userType',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Get monthly user creation trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const monthlyTrend = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        inactiveUsers,
        admins,
        assessors,
        salesAgents,
        salesManagers,
        regularUsers,
        recentUsers,
        userTypeDistribution,
        monthlyTrend
      }
    });

  } catch (error) {
    console.error("Get user stats error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Activate user (re-enable a soft-deleted account)
const activateUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (!canManageTarget(req.user, user)) {
      return res.status(403).json({
        success: false,
        message: "CEO privileges required to activate privileged accounts"
      });
    }

    user.isActive = true;
    await user.save();

    res.json({
      success: true,
      message: "User activated successfully"
    });

  } catch (error) {
    console.error("Activate user error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// ===== Assessor (trainer) workload overview — CEO only =====

const APP_STATUS_BUCKETS = {
  completed: ["certificate_issued", "completed"],
  assessmentCompleted: ["assessment_completed"],
  inProgress: ["in_progress", "under_review", "assessment_pending", "payment_completed"],
  earlyStage: ["initial_screening", "payment_pending"],
  rejected: ["rejected"],
};

const bucketForStatus = (status) => {
  for (const [bucket, statuses] of Object.entries(APP_STATUS_BUCKETS)) {
    if (statuses.includes(status)) return bucket;
  }
  return "inProgress";
};

// Per-assessor workload stats (applications assigned/done/pending, reviews, bookings)
const getAssessorStats = async (req, res) => {
  try {
    const Application = require("../models/application");
    const FormSubmission = require("../models/formSubmission");
    const Booking = require("../models/booking");

    const assessors = await User.find({ userType: "assessor" })
      .select("firstName lastName email phoneCode phoneNumber isActive createdAt")
      .sort({ firstName: 1 });

    const [appAgg, pendingReviewAgg, assessedAgg, bookingAgg] = await Promise.all([
      // Applications per assessor per status
      Application.aggregate([
        { $match: { assignedAssessor: { $ne: null } } },
        { $group: { _id: { assessor: "$assignedAssessor", status: "$overallStatus" }, count: { $sum: 1 } } },
      ]),
      // Form submissions awaiting review, attributed via the application's assigned assessor
      FormSubmission.aggregate([
        { $match: { status: "submitted", assessed: "pending" } },
        { $lookup: { from: "applications", localField: "applicationId", foreignField: "_id", as: "app" } },
        { $unwind: "$app" },
        { $match: { "app.assignedAssessor": { $ne: null } } },
        { $group: { _id: "$app.assignedAssessor", count: { $sum: 1 } } },
      ]),
      // Total forms each assessor has assessed + when they last assessed
      FormSubmission.aggregate([
        { $match: { assessedBy: { $ne: null } } },
        { $group: { _id: "$assessedBy", count: { $sum: 1 }, lastAssessedAt: { $max: "$assessedAt" } } },
      ]),
      // Upcoming competency-conversation bookings
      Booking.aggregate([
        { $match: { status: { $in: ["scheduled", "rescheduled"] }, scheduledStart: { $gte: new Date() } } },
        { $group: { _id: "$assessorId", count: { $sum: 1 } } },
      ]),
    ]);

    const byAssessor = {};
    const ensure = (id) => {
      const key = String(id);
      if (!byAssessor[key]) {
        byAssessor[key] = {
          totalAssigned: 0,
          completed: 0,
          assessmentCompleted: 0,
          inProgress: 0,
          earlyStage: 0,
          rejected: 0,
          byStatus: {},
          pendingReviews: 0,
          formsAssessed: 0,
          lastAssessedAt: null,
          upcomingBookings: 0,
        };
      }
      return byAssessor[key];
    };

    appAgg.forEach((row) => {
      const s = ensure(row._id.assessor);
      s.totalAssigned += row.count;
      s[bucketForStatus(row._id.status)] += row.count;
      s.byStatus[row._id.status] = (s.byStatus[row._id.status] || 0) + row.count;
    });
    pendingReviewAgg.forEach((row) => { ensure(row._id).pendingReviews = row.count; });
    assessedAgg.forEach((row) => {
      const s = ensure(row._id);
      s.formsAssessed = row.count;
      s.lastAssessedAt = row.lastAssessedAt;
    });
    bookingAgg.forEach((row) => { ensure(row._id).upcomingBookings = row.count; });

    const data = assessors.map((a) => ({
      _id: a._id,
      firstName: a.firstName,
      lastName: a.lastName,
      email: a.email,
      phoneCode: a.phoneCode,
      phoneNumber: a.phoneNumber,
      isActive: a.isActive,
      createdAt: a.createdAt,
      userType: "assessor",
      stats: byAssessor[String(a._id)] || ensure(`missing-${a._id}`),
    }));

    const totals = data.reduce(
      (acc, a) => {
        acc.totalAssigned += a.stats.totalAssigned;
        acc.completed += a.stats.completed;
        acc.pendingReviews += a.stats.pendingReviews;
        acc.inProgress += a.stats.inProgress + a.stats.earlyStage;
        return acc;
      },
      { totalAssessors: data.length, totalAssigned: 0, completed: 0, pendingReviews: 0, inProgress: 0 }
    );

    res.json({ success: true, data: { assessors: data, totals } });
  } catch (error) {
    console.error("Get assessor stats error:", error);
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

// Assessor activity log — merged timeline of what each assessor did and when.
// Sources: form assessments, document verifications, booking audit entries.
const getAssessorActivity = async (req, res) => {
  try {
    const FormSubmission = require("../models/formSubmission");
    const DocumentUpload = require("../models/documentUpload");
    const Booking = require("../models/booking");

    const days = Math.min(Number(req.query.days) || 30, 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const { assessorId } = req.query;

    const assessorFilter = { userType: "assessor" };
    if (assessorId) assessorFilter._id = assessorId;
    const assessors = await User.find(assessorFilter).select("firstName lastName email");
    if (assessors.length === 0) {
      return res.json({ success: true, data: { events: [], since, days } });
    }
    const assessorIds = assessors.map((a) => a._id);
    const assessorMap = new Map(assessors.map((a) => [String(a._id), a]));

    const [assessedForms, verifiedDocs, bookings] = await Promise.all([
      FormSubmission.find({ assessedBy: { $in: assessorIds }, assessedAt: { $gte: since } })
        .select("assessedBy assessedAt assessed formTemplateId userId applicationId")
        .populate("formTemplateId", "name")
        .populate("userId", "firstName lastName")
        .populate("applicationId", "appCode")
        .sort({ assessedAt: -1 })
        .limit(300),
      DocumentUpload.find({ verifiedBy: { $in: assessorIds }, verifiedAt: { $gte: since } })
        .select("verifiedBy verifiedAt status userId applicationId")
        .populate("userId", "firstName lastName")
        .populate("applicationId", "appCode")
        .sort({ verifiedAt: -1 })
        .limit(300),
      Booking.find({ assessorId: { $in: assessorIds }, "audit.at": { $gte: since } })
        .select("assessorId studentId applicationId audit")
        .populate("studentId", "firstName lastName")
        .populate("applicationId", "appCode")
        .limit(300),
    ]);

    const studentName = (u) => (u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : "Unknown student");
    const events = [];

    assessedForms.forEach((s) => {
      const a = assessorMap.get(String(s.assessedBy));
      if (!a) return;
      const outcome = s.assessed === "approved" ? "approved" : s.assessed === "requires_changes" ? "requested changes to" : "assessed";
      events.push({
        at: s.assessedAt,
        assessorId: s.assessedBy,
        assessorName: `${a.firstName} ${a.lastName}`,
        type: "form_assessed",
        outcome: s.assessed,
        description: `${outcome[0].toUpperCase()}${outcome.slice(1)} "${s.formTemplateId?.name || "form"}" for ${studentName(s.userId)}`,
        appCode: s.applicationId?.appCode || null,
      });
    });

    verifiedDocs.forEach((d) => {
      const a = assessorMap.get(String(d.verifiedBy));
      if (!a) return;
      const verdict = d.status === "verified" ? "Verified documents" : "Flagged documents for resubmission";
      events.push({
        at: d.verifiedAt,
        assessorId: d.verifiedBy,
        assessorName: `${a.firstName} ${a.lastName}`,
        type: "documents_reviewed",
        outcome: d.status,
        description: `${verdict} for ${studentName(d.userId)}`,
        appCode: d.applicationId?.appCode || null,
      });
    });

    const bookingActionLabels = {
      created: "Scheduled a competency conversation",
      reschedule_requested: "Received a reschedule request",
      reschedule_approved: "Approved a reschedule",
      reschedule_rejected: "Rejected a reschedule",
      cancelled: "Cancelled a booking",
    };
    bookings.forEach((b) => {
      (b.audit || []).forEach((entry) => {
        if (!entry.at || entry.at < since) return;
        const a = assessorMap.get(String(entry.by));
        if (!a) return; // only actions performed by the assessor themselves
        events.push({
          at: entry.at,
          assessorId: entry.by,
          assessorName: `${a.firstName} ${a.lastName}`,
          type: "booking",
          outcome: entry.action,
          description: `${bookingActionLabels[entry.action] || entry.action} with ${studentName(b.studentId)}`,
          appCode: b.applicationId?.appCode || null,
        });
      });
    });

    events.sort((x, y) => new Date(y.at) - new Date(x.at));

    res.json({ success: true, data: { events: events.slice(0, 200), since, days } });
  } catch (error) {
    console.error("Get assessor activity error:", error);
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

// List one assessor's assigned applications (for the detail view)
const getAssessorApplications = async (req, res) => {
  try {
    const Application = require("../models/application");
    const { assessorId } = req.params;

    const assessor = await User.findById(assessorId).select("firstName lastName email userType");
    if (!assessor || assessor.userType !== "assessor") {
      return res.status(404).json({ success: false, message: "Assessor not found" });
    }

    const applications = await Application.find({ assignedAssessor: assessorId })
      .select("appCode overallStatus createdAt updatedAt userId certificationId")
      .populate("userId", "firstName lastName email")
      .populate("certificationId", "name")
      .sort({ updatedAt: -1 })
      .limit(500);

    res.json({ success: true, data: { assessor, applications } });
  } catch (error) {
    console.error("Get assessor applications error:", error);
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

module.exports = {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deactivateUser,
  activateUser,
  resetUserPassword,
  getUserStats,
  getAllowedUserTypesEndpoint,
  getAssessorStats,
  getAssessorActivity,
  getAssessorApplications
};

// Admin/CEO creates a student user with random 16-byte password and sends email
const createStudentByAdmin = async (req, res) => {
  try {
    const { firstName, lastName, email, phoneCode, phoneNumber } = req.body;

    if (!firstName || !lastName || !email) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: firstName, lastName, email"
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(409).json({ success: false, message: "User with this email already exists" });
    }

    // Generate 16-byte random password (base64url ~ 22 chars, URL-safe)
    const tempPassword = crypto.randomBytes(16).toString("base64url");

    // Create user as regular student
    const newUser = new User({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      password: tempPassword,
      userType: "user",
      phoneCode: phoneCode || "+61",
      phoneNumber: phoneNumber || "",
      isActive: true,
      ceo: false
    });
    await newUser.save();

    // Send credentials email (async, but await here to surface errors)
    await emailService.sendAdminCreatedAccountEmail(newUser, tempPassword);

    // Prepare response without password hash
    const userResponse = {
      _id: newUser._id,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      email: newUser.email,
      userType: newUser.userType,
      phoneCode: newUser.phoneCode,
      phoneNumber: newUser.phoneNumber,
      isActive: newUser.isActive,
      ceo: newUser.ceo,
      createdAt: newUser.createdAt,
      updatedAt: newUser.updatedAt
    };

    return res.status(201).json({
      success: true,
      message: "Student user created and credentials emailed",
      data: userResponse,
      meta: { temporaryPassword: tempPassword, redirectUrl: process.env.FRONTEND_URL || "http://localhost:5173" }
    });
  } catch (error) {
    console.error("Admin create student error:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

module.exports.createStudentByAdmin = createStudentByAdmin;

// ===== Permissions & Roles (Admin only) =====

// List ACL modules/actions available on backend
module.exports.getAclModules = async (req, res) => {
  try {
    res.json({ success: true, data: ACL_CATALOG });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

// Get a user's effective permissions
module.exports.getUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select("permissions userType");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, data: user.permissions || [], meta: { permissionsEnabled: ['sales_agent','sales_manager'].includes(user.userType) } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

// List ACL subjects by role filter
module.exports.getPermissionSubjects = async (req, res) => {
  try {
    const rolesParam = (req.query.roles || '').toString();
    const roles = rolesParam ? rolesParam.split(',').map(r => r.trim()).filter(Boolean) : ['sales_agent','sales_manager','assessor'];
    const users = await User.find({ userType: { $in: roles } })
      .select('_id firstName lastName email userType permissions isActive')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

// Grant a permission { userId, module, action }
module.exports.grantPermission = async (req, res) => {
  try {
    const { userId, module, action } = req.body || {};
    if (!userId || !module || !action) {
      return res.status(400).json({ success: false, message: "userId, module, action are required" });
    }
    if (!ACL_CATALOG[module] || !ACL_CATALOG[module].includes(action)) {
      return res.status(400).json({ success: false, message: "Invalid module/action" });
    }
    const user = await User.findById(userId).select("permissions userType");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (!['sales_agent','sales_manager'].includes(user.userType)) {
      return res.status(403).json({ success: false, message: "ACL not applicable to this role" });
    }
    const perms = Array.isArray(user.permissions) ? user.permissions : [];
    const exists = perms.some(p => p.module === module && p.actions && p.actions.includes(action));
    if (!exists) {
      const existing = perms.find(p => p.module === module);
      if (existing) existing.actions.push(action); else perms.push({ module, actions: [action] });
      user.permissions = perms;
      await user.save();
    }
    res.json({ success: true, message: "Permission granted", data: user.permissions });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

// Revoke a permission { userId, module, action }
module.exports.revokePermission = async (req, res) => {
  try {
    const { userId, module, action } = req.body || {};
    if (!userId || !module || !action) {
      return res.status(400).json({ success: false, message: "userId, module, action are required" });
    }
    const user = await User.findById(userId).select("permissions userType");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (!['sales_agent','sales_manager'].includes(user.userType)) {
      return res.status(403).json({ success: false, message: "ACL not applicable to this role" });
    }
    const perms = Array.isArray(user.permissions) ? user.permissions : [];
    const existing = perms.find(p => p.module === module);
    if (existing && Array.isArray(existing.actions)) {
      existing.actions = existing.actions.filter(a => a !== action);
      if (existing.actions.length === 0) {
        user.permissions = perms.filter(p => p !== existing);
      }
      await user.save();
    }
    res.json({ success: true, message: "Permission revoked", data: user.permissions || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

// Assign a role template (e.g., manager) { userId, role }
module.exports.assignRole = async (req, res) => {
  try {
    const { userId, role } = req.body || {};
    if (!userId || !role) return res.status(400).json({ success: false, message: "userId and role are required" });
    const template = ROLE_TEMPLATES[role];
    if (!template) return res.status(400).json({ success: false, message: "Unknown role" });

    const user = await User.findById(userId).select("permissions userType");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    // Validate the template matches the user's userType scope
    if (role === 'sales_manager' && user.userType !== 'sales_manager') {
      return res.status(400).json({ success: false, message: "Role template does not match userType" });
    }
    if (role === 'sales_agent' && user.userType !== 'sales_agent') {
      return res.status(400).json({ success: false, message: "Role template does not match userType" });
    }
    if (role === 'manager' && !['sales_manager'].includes(user.userType)) {
      return res.status(400).json({ success: false, message: "Manager template intended for sales_manager" });
    }
    const perms = Array.isArray(user.permissions) ? user.permissions : [];

    // Merge template
    for (const { module, action } of template) {
      let mod = perms.find(p => p.module === module);
      if (!mod) {
        perms.push({ module, actions: [action] });
      } else if (!mod.actions.includes(action)) {
        mod.actions.push(action);
      }
    }
    user.permissions = perms;
    await user.save();
    res.json({ success: true, message: `Role '${role}' applied`, data: user.permissions });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};
