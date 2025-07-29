# Multi-Tenant Architecture (with Backward Compatibility)

- All new RTO-aware features are additive and backward compatible.
- Existing APIs and data (including previously registered RTOs and users) continue to work.
- If a record does not have an `rtoId`, it is treated as “global” or “default” and is still accessible.

## Middleware
- `identifyRTO`: attaches `req.rto` and `req.rtoId` if subdomain matches, else leaves undefined.
- `rtoFilter(rtoId)`: returns `{ $or: [ { rtoId }, { rtoId: { $exists: false } } ] }` for queries, so legacy data is always included.

## Models
- All new records should include `rtoId`.
- Legacy records (no `rtoId`) are always included in queries using `rtoFilter`.

## RTO Management
- New endpoints for RTO CRUD, features, and email templates (super admin only).
- Does not affect existing APIs.

## Email
- RTO email service is opt-in and does not affect existing email logic.

## Usage
- To filter by RTO in controllers: `Model.find({ ...rtoFilter(req.rtoId), ...otherFilters })`
- If `req.rtoId` is undefined, all legacy/global data is included.

## Migration
- No migration required for legacy data. New data will include `rtoId`.

## Example
```js
const { rtoFilter } = require("../middleware/tenant");
const templates = await FormTemplate.find({ ...rtoFilter(req.rtoId), isActive: true });
``` 