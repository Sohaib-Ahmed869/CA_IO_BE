// config/constants.js

// Domains and subdomains that should be skipped from RTO detection
const SKIPPED_SUBDOMAINS = [
  'api', 'www', 'certified', 'localhost', 'staging', 'backendstaging',
  'admin', 'dashboard', 'app', 'portal', 'system', 'global', 'main',
  'core', 'base', 'default', 'root', 'master', 'primary', 'central','staging'
];

// Helper function to check if a subdomain should be skipped
const shouldSkipSubdomain = (subdomain) => {
  return SKIPPED_SUBDOMAINS.includes(subdomain);
};

module.exports = {
  SKIPPED_SUBDOMAINS,
  shouldSkipSubdomain
}; 