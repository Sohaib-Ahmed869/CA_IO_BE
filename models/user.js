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
      // unique: true, // Removed - now unique per RTO only
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
    // Multi-tenant support
    rtoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RTO",
      // required: true, // Removed required constraint for super admins
    },
    // RTO-specific fields
    rtoRole: {
      type: String,
      enum: ["ceo", "admin", "assessor", "user","sales_agent","sales_manager"],
      default: "user",
    },
    assignedRtoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RTO",
      default: null, // For assessors who can work with multiple RTOs
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

// Compound index for email uniqueness per RTO
userSchema.index({ email: 1, rtoId: 1 }, { unique: true });
userSchema.index({ rtoId: 1 });
userSchema.index({ userType: 1 });
userSchema.index({ isActive: 1 });

module.exports = mongoose.model("User", userSchema);
