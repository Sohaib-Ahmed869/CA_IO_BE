// scripts/create-super-admin.js
// Creates (or resets) the Super Admin portal account. Run from CA_IO_BE/:
//   node scripts/create-super-admin.js
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });
const mongoose = require("mongoose");
const User = require("../models/user");

const EMAIL = "superadmin@et.edu.au";
const PASSWORD = "ETrain!Super2026#Admin";

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  let user = await User.findOne({ email: EMAIL });
  if (user) {
    user.userType = "super_admin";
    user.ceo = true;
    user.isActive = true;
    user.password = PASSWORD; // re-hashed by the pre-save hook
    await user.save();
    console.log("Existing account updated to super_admin:");
  } else {
    user = new User({
      firstName: "Super",
      lastName: "Admin",
      email: EMAIL,
      password: PASSWORD, // hashed by the pre-save hook
      userType: "super_admin",
      ceo: true,
      isActive: true,
      phoneCode: "+61",
      phoneNumber: "400000000",
    });
    await user.save();
    console.log("Super admin account created:");
  }

  console.log(`  Email:    ${EMAIL}`);
  console.log(`  Password: ${PASSWORD}`);
  console.log(`  Role:     ${user.userType} (ceo=${user.ceo})`);
  console.log(`  Login at the app root and you'll be redirected to /super-admin/dashboard`);

  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
