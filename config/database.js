// config/database.js
const mongoose = require("mongoose");
const logme = require("../utils/logger");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);

    logme.info(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    logme.error("Database connection error", error);
    process.exit(1);
  }
};

module.exports = connectDB;
