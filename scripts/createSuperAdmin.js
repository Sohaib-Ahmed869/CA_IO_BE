// scripts/createSuperAdmin.js
const mongoose = require("mongoose");
const User = require("../models/user");
require("dotenv").config();

const createSuperAdmin = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to database");

    // Check if super admin already exists
    const existingSuperAdmin = await User.findOne({ userType: "super_admin" });
    if (existingSuperAdmin) {
      console.log("Super admin already exists:", existingSuperAdmin.email);
      process.exit(0);
    }

    // Create super admin user
    const superAdminData = {
      firstName: "Super",
      lastName: "Admin",
      email: "superadmin@certified.io",
      password: "SuperAdmin123!",
      phoneNumber: "1234567890",
      phoneCode: "+61",
      userType: "super_admin",
      permissions: [
        { module: "users", actions: ["read", "write", "update", "delete"] },
        { module: "certifications", actions: ["read", "write", "update", "delete"] },
        { module: "applications", actions: ["read", "write", "update", "delete"] },
        { module: "payments", actions: ["read", "write", "update", "delete"] },
        { module: "certificates", actions: ["read", "write", "update", "delete"] },
        { module: "reports", actions: ["read", "write", "update", "delete"] },
        { module: "admin_management", actions: ["read", "write", "update", "delete"] },
        { module: "system_settings", actions: ["read", "write", "update", "delete"] },
        { module: "super_admin", actions: ["read", "write", "update", "delete"] },
      ],
    };

    const superAdmin = await User.create(superAdminData);
    console.log("Super admin created successfully:");
    console.log("Email:", superAdmin.email);
    console.log("Password: SuperAdmin123!");
    console.log("Please change the password after first login!");

    process.exit(0);
  } catch (error) {
    console.error("Error creating super admin:", error);
    process.exit(1);
  }
};

createSuperAdmin(); 