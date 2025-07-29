// utils/logger.js
const logme = {
  info: (message, data = null) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[INFO] ${message}`, data ? data : '');
    }
  },
  
  error: (message, error = null) => {
    console.error(`[ERROR] ${message}`, error ? error : '');
  },
  
  warn: (message, data = null) => {
    console.warn(`[WARN] ${message}`, data ? data : '');
  },
  
  debug: (message, data = null) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEBUG] ${message}`, data ? data : '');
    }
  }
};

module.exports = logme; 