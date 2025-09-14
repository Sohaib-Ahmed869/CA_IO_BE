// models/user.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    phoneCode: {
      type: String,
      default:'+61'
    },
    phoneNumber: {
      type: String,
      required: true,
    },
    userType: {
      type: String,
      enum: ["super_admin", "admin", "sales_agent", "sales_manager", "assessor", "user"],
      default: "user",
    },
    permissions: [
      {
        module: String,
        actions: [String], // ['read', 'write', 'delete', 'update']
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    international_student: {
      type: Boolean,
      default: false,
    },
    questions: {
      type: String,
      default: "",
    },
    resetPasswordToken: {
      type: String,
      default: null,
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
    },
    ceo: {
      type: Boolean,
      default: false,
    },
    lastLoggedIn: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
