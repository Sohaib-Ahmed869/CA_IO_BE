# RTO Context Implementation

## Overview
This document describes the implementation of RTO (Registered Training Organization) context for forms and certifications. This allows the system to support multiple RTOs with isolated data while maintaining backward compatibility.

## Key Features

### ✅ **Backward Compatibility**
- Existing forms and certifications without RTO context continue to work
- No data migration required for existing installations
- Gradual migration path available

### ✅ **Multi-Tenant Support**
- Each RTO has its own forms and certifications
- Data isolation between RTOs
- Shared default templates for new RTOs

### ✅ **Automatic Default Creation**
- New RTOs automatically get default forms and certifications
- Customizable default templates
- Easy setup for new RTOs

## Database Schema Changes

### FormTemplate Model
```javascript
{
  // ... existing fields ...
  rtoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RTO",
    required: false, // Optional for backward compatibility
    index: true,
  },
  templateType: {
    type: String,
    enum: ["default", "custom"],
    default: "custom",
  }
}
```

### Certification Model
```javascript
{
  // ... existing fields ...
  rtoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RTO",
    required: false, // Optional for backward compatibility
    index: true,
  },
  certificationType: {
    type: String,
    enum: ["default", "custom"],
    default: "custom",
  }
}

// Compound index for unique names per RTO
certificationSchema.index({ name: 1, rtoId: 1 }, { unique: true, sparse: true });
```

## API Changes

### Form Template Endpoints

#### GET `/api/form-templates`
- **Before**: Returns all form templates
- **After**: Returns form templates filtered by RTO context (if provided)
- **Headers**: `X-RTO: <rtoCode>` or query parameter `?rto=<rtoCode>`
- **Response**: Includes `rtoContext` field indicating current context

#### POST `/api/form-templates`
- **Before**: Creates form template without RTO context
- **After**: Creates form template with RTO context (if provided)
- **Authorization**: Now includes `certified-admin` role

### Certification Endpoints

#### GET `/api/certifications`
- **Before**: Returns all certifications
- **After**: Returns certifications filtered by RTO context (if provided)
- **Headers**: `X-RTO: <rtoCode>` or query parameter `?rto=<rtoCode>`
- **Response**: Includes `rtoContext` field indicating current context

#### POST `/api/certifications`
- **Before**: Creates certification without RTO context
- **After**: Creates certification with RTO context (if provided)
- **Authorization**: Now includes `certified-admin` role

## RTO Creation Workflow

### 1. RTO Creation
When a new RTO is created via `POST /api/rtos`:

```javascript
{
  "name": "New RTO",
  "shortName": "NEW",
  "rtoCode": "NEW001",
  "ceoName": "CEO Name",
  "createDefaults": true // Optional, defaults to true
}
```

### 2. Automatic Default Creation
The system automatically creates:

#### Default Form Templates (3 forms):
1. **Student Enrolment Form** - User-filled enrolment form
2. **Assessment Form** - Assessor-filled assessment form  
3. **LLND Assessment Form** - Language, Literacy, Numeracy, Digital skills assessment

#### Default Certifications (3 certifications):
1. **Certificate III in Business** - $2,500
2. **Certificate IV in Leadership and Management** - $3,500
3. **Diploma of Business** - $4,500

### 3. Form-Certification Associations
Each certification is automatically linked to the default form templates in sequence:
- Step 1: Student Enrolment Form (filled by user)
- Step 2: Assessment Form (filled by assessor)
- Step 3: LLND Assessment Form (filled by assessor)

## Usage Examples

### Frontend Integration

#### Setting RTO Context
```javascript
// Set RTO context for all API calls
const setRTOContext = (rtoCode) => {
  // Add header to all requests
  axios.defaults.headers.common['X-RTO'] = rtoCode;
};

// Or use query parameter
const getFormsForRTO = async (rtoCode) => {
  const response = await axios.get(`/api/form-templates?rto=${rtoCode}`);
  return response.data;
};
```

#### Creating Forms with RTO Context
```javascript
const createFormTemplate = async (formData, rtoCode) => {
  const response = await axios.post('/api/form-templates', {
    ...formData,
    rtoId: rtoId // Optional, will use header context if not provided
  }, {
    headers: { 'X-RTO': rtoCode }
  });
  return response.data;
};
```

#### Creating Certifications with RTO Context
```javascript
const createCertification = async (certData, rtoCode) => {
  const response = await axios.post('/api/certifications', {
    ...certData,
    rtoId: rtoId // Optional, will use header context if not provided
  }, {
    headers: { 'X-RTO': rtoCode }
  });
  return response.data;
};
```

### Backend Integration

#### Using RTO Context Middleware
```javascript
const { rtoContext, optionalRtoContext } = require('../middleware/rtoContext');

// Require RTO context
router.get('/forms', rtoContext, formController.getForms);

// Optional RTO context (for backward compatibility)
router.get('/forms', optionalRtoContext, formController.getForms);
```

#### Controller Implementation
```javascript
const formController = {
  getForms: async (req, res) => {
    // RTO context is available in req.rtoConfig
    const rtoId = req.rtoConfig?._id;
    
    const query = { isActive: true };
    if (rtoId) {
      query.rtoId = rtoId;
    }
    
    const forms = await FormTemplate.find(query);
    res.json({ success: true, data: forms });
  }
};
```

## Migration Guide

### For Existing Installations

#### Option 1: Gradual Migration (Recommended)
1. Deploy the new code (no immediate changes to data)
2. Existing forms/certifications continue to work without RTO context
3. Gradually migrate data as needed:
   ```javascript
   // Add RTO context to existing forms
   await FormTemplate.updateMany(
     { rtoId: { $exists: false } },
     { 
       rtoId: defaultRTOId,
       templateType: "custom"
     }
   );
   ```

#### Option 2: Bulk Migration
```javascript
// Get default RTO
const defaultRTO = await RTO.findOne({ isDefault: true });

// Migrate all forms to default RTO
await FormTemplate.updateMany(
  { rtoId: { $exists: false } },
  { 
    rtoId: defaultRTO._id,
    templateType: "custom"
  }
);

// Migrate all certifications to default RTO
await Certification.updateMany(
  { rtoId: { $exists: false } },
  { 
    rtoId: defaultRTO._id,
    certificationType: "custom"
  }
);
```

### For New Installations
- No migration needed
- All new forms/certifications will have RTO context
- Default RTO will be created with default forms/certifications

## Testing

### Run Test Suite
```bash
node scripts/testRTOContext.js
```

The test suite covers:
- ✅ Backward compatibility with existing data
- ✅ RTO context functionality
- ✅ Default form/certification creation
- ✅ Data migration scenarios
- ✅ Query filtering by RTO context

### Manual Testing

#### Test RTO Creation
```bash
# Create new RTO
curl -X POST http://localhost:5000/api/rtos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Test RTO",
    "shortName": "TEST",
    "rtoCode": "TEST001",
    "ceoName": "Test CEO"
  }'
```

#### Test Form Creation with RTO Context
```bash
# Create form for specific RTO
curl -X POST http://localhost:5000/api/form-templates \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-RTO: TEST001" \
  -d '{
    "name": "Custom Form",
    "description": "Test form",
    "stepNumber": 1,
    "filledBy": "user",
    "formStructure": {...}
  }'
```

## Security Considerations

### Authorization
- `certified-admin` role added to form/certification management
- RTO context validation prevents cross-RTO access
- Users can only access forms/certifications for their RTO

### Data Isolation
- Forms and certifications are isolated by RTO
- No cross-RTO data leakage
- Proper validation of RTO ownership

### Backward Compatibility
- Existing installations continue to work
- No breaking changes to existing APIs
- Gradual migration path available

## Performance Considerations

### Indexing
- `rtoId` field is indexed for fast queries
- Compound index on certification name + RTO for uniqueness
- Efficient filtering by RTO context

### Query Optimization
- RTO context filtering is applied at database level
- Minimal overhead for existing queries
- Optional context middleware for flexibility

## Troubleshooting

### Common Issues

#### 1. Forms/Certifications Not Showing
- **Cause**: Missing RTO context
- **Solution**: Add `X-RTO` header or query parameter

#### 2. Permission Denied
- **Cause**: User doesn't have `certified-admin` role
- **Solution**: Update user role or use appropriate authorization

#### 3. Default Creation Failed
- **Cause**: RTO creation succeeded but defaults failed
- **Solution**: Check logs, defaults are created asynchronously

#### 4. Duplicate Names
- **Cause**: Certification names must be unique per RTO
- **Solution**: Use different names or include RTO context

### Debugging

#### Check RTO Context
```javascript
// In controller
console.log('RTO Context:', req.rtoConfig);
console.log('RTO ID:', req.rtoConfig?._id);
```

#### Verify Data
```javascript
// Check forms with RTO context
const formsWithRTO = await FormTemplate.find({ rtoId: { $exists: true } });
console.log('Forms with RTO:', formsWithRTO.length);

// Check forms without RTO context
const formsWithoutRTO = await FormTemplate.find({ rtoId: { $exists: false } });
console.log('Forms without RTO:', formsWithoutRTO.length);
```

## Future Enhancements

### Planned Features
- [ ] RTO-specific email templates
- [ ] Custom form field types per RTO
- [ ] RTO-specific assessment criteria
- [ ] Multi-RTO user management
- [ ] RTO-specific reporting

### API Versioning
- Current implementation is backward compatible
- Future versions may require RTO context
- Migration tools will be provided

## Support

For issues or questions:
1. Check the test suite: `node scripts/testRTOContext.js`
2. Review logs for RTO context operations
3. Verify RTO configuration and permissions
4. Test with different RTO contexts
