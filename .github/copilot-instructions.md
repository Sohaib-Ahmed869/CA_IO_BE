# Copilot Instructions for CA_IO_BE

## Project Overview
This is a Node.js backend for a multi-institute education platform. It uses Express.js, MongoDB (via Mongoose), and integrates with external services (AWS S3, Stripe, Zoho, Gmail/Outlook SMTP, IMAP). The codebase supports multiple brands/institutes via environment configuration.

## Architecture & Major Components
- **Entry Point:** `server.js` initializes Express, middleware, and routes.
- **Controllers:** Business logic for each domain (see `controllers/`).
- **Models:** Mongoose schemas for MongoDB collections (see `models/`).
- **Routes:** Express route definitions, grouped by domain (see `routes/`).
- **Config:** External service credentials and settings (see `config/`).
- **Middleware:** Auth, validation, and payment logic (see `middleware/`).
- **Constants:** Static values (see `constants/`).
- **Assets/Utils/Services:** Supporting files and helpers.

## Developer Workflows
- **Start Server:**
  ```bash
  node server.js
  # or use nodemon for auto-reload
  nodemon server.js
  ```
- **Environment:**
  - Set up `.env` for the target institute. Many values are commented for different brands; uncomment as needed.
- **Testing:**
  - No standard test runner detected. Ad-hoc tests may be in files like `test-imap-config.js`.
- **Debugging:**
  - Use console logging. Debug sensitive flows in controllers and middleware.

## Project-Specific Patterns
- **Institute Switching:**
  - Environment variables in `.env` control branding, credentials, and data sources. Only one block should be active at a time.
- **Route/Controller Structure:**
  - Each domain (e.g., admin, student, application) has a dedicated controller and route file. Example: `controllers/adminController.js` and `routes/adminRoutes.js`.
- **External Integrations:**
  - AWS S3: `config/s3Config.js`
  - Stripe: Keys in `.env`, logic in payment controllers/middleware
  - Email: SMTP/IMAP config in `.env` and `config/`
- **Data Flow:**
  - Request → Route → Controller → Model/Service → Response

## Conventions & Patterns
- **File Naming:**
  - Singular for models, plural for controllers/routes.
- **Error Handling:**
  - Custom error responses in controllers; middleware for auth/validation.
- **Authentication:**
  - JWT-based, see `middleware/auth.js` and `config/jwt.js`.
- **Validation:**
  - Centralized in `middleware/validation.js`.

## Key Files & Directories
- `server.js`: App entry point
- `controllers/`: Domain logic
- `models/`: Data schemas
- `routes/`: API endpoints
- `config/`: Service configs
- `.env`: Institute-specific settings

## Examples
- To add a new institute, copy an existing `.env` block and update credentials/branding.
- To add a new domain, create corresponding controller, model, and route files.

---

**For questions or unclear patterns, ask for clarification or examples from the user.**
