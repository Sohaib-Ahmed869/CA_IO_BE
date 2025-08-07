// utils/logger.js
const logme = {
  info: (message, data = null) => {
    console.log(`[INFO] ${message}`, data ? data : '');
  },
  
  error: (message, error = null) => {
    console.error(`[ERROR] ${message}`, error ? error : '');
  },
  
  warn: (message, data = null) => {
    console.warn(`[WARN] ${message}`, data ? data : '');
  },
  
  debug: (message, data = null) => {
    console.log(`[DEBUG] ${message}`, data ? data : '');
  }
};

module.exports = logme; 