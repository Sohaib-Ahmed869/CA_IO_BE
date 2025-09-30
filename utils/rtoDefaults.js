/**
 * RTO Default Templates and Certifications
 * 
 * This utility creates default forms and certifications when a new RTO is created
 */

const FormTemplate = require("../models/formTemplate");
const Certification = require("../models/certification");
const { logMe } = require("./logger");

/**
 * Default form templates that will be created for each new RTO
 */
const defaultFormTemplates = [
  {
    name: "Student Enrolment Form",
    description: "Initial student enrolment and personal information form",
    stepNumber: 1,
    filledBy: "user",
    templateType: "default",
    formStructure: {
      title: "Student Enrolment Form",
      fields: [
        {
          type: "text",
          name: "firstName",
          label: "First Name",
          required: true,
          placeholder: "Enter your first name"
        },
        {
          type: "text",
          name: "lastName",
          label: "Last Name",
          required: true,
          placeholder: "Enter your last name"
        },
        {
          type: "email",
          name: "email",
          label: "Email Address",
          required: true,
          placeholder: "Enter your email address"
        },
        {
          type: "tel",
          name: "phoneNumber",
          label: "Phone Number",
          required: true,
          placeholder: "Enter your phone number"
        },
        {
          type: "date",
          name: "dateOfBirth",
          label: "Date of Birth",
          required: true
        },
        {
          type: "select",
          name: "gender",
          label: "Gender",
          required: true,
          options: [
            { value: "male", label: "Male" },
            { value: "female", label: "Female" },
            { value: "other", label: "Other" },
            { value: "prefer-not-to-say", label: "Prefer not to say" }
          ]
        },
        {
          type: "textarea",
          name: "address",
          label: "Address",
          required: true,
          placeholder: "Enter your full address"
        }
      ]
    }
  },
  {
    name: "Assessment Form",
    description: "Student assessment and competency evaluation form",
    stepNumber: 2,
    filledBy: "assessor",
    templateType: "default",
    formStructure: {
      title: "Assessment Form",
      fields: [
        {
          type: "text",
          name: "studentName",
          label: "Student Name",
          required: true,
          readonly: true
        },
        {
          type: "text",
          name: "courseName",
          label: "Course Name",
          required: true,
          readonly: true
        },
        {
          type: "select",
          name: "assessmentType",
          label: "Assessment Type",
          required: true,
          options: [
            { value: "written", label: "Written Assessment" },
            { value: "practical", label: "Practical Assessment" },
            { value: "oral", label: "Oral Assessment" },
            { value: "portfolio", label: "Portfolio Assessment" }
          ]
        },
        {
          type: "number",
          name: "score",
          label: "Assessment Score",
          required: true,
          min: 0,
          max: 100
        },
        {
          type: "select",
          name: "result",
          label: "Assessment Result",
          required: true,
          options: [
            { value: "competent", label: "Competent" },
            { value: "not-yet-competent", label: "Not Yet Competent" }
          ]
        },
        {
          type: "textarea",
          name: "feedback",
          label: "Assessor Feedback",
          required: true,
          placeholder: "Provide detailed feedback on the assessment"
        }
      ]
    }
  },
  {
    name: "LLND Assessment Form",
    description: "Language, Literacy, Numeracy and Digital skills assessment",
    stepNumber: 3,
    filledBy: "assessor",
    templateType: "default",
    formStructure: {
      title: "LLND Assessment Form",
      fields: [
        {
          type: "text",
          name: "studentName",
          label: "Student Name",
          required: true,
          readonly: true
        },
        {
          type: "select",
          name: "languageLevel",
          label: "Language Proficiency Level",
          required: true,
          options: [
            { value: "beginner", label: "Beginner" },
            { value: "intermediate", label: "Intermediate" },
            { value: "advanced", label: "Advanced" }
          ]
        },
        {
          type: "select",
          name: "literacyLevel",
          label: "Literacy Level",
          required: true,
          options: [
            { value: "level-1", label: "Level 1" },
            { value: "level-2", label: "Level 2" },
            { value: "level-3", label: "Level 3" },
            { value: "level-4", label: "Level 4" }
          ]
        },
        {
          type: "select",
          name: "numeracyLevel",
          label: "Numeracy Level",
          required: true,
          options: [
            { value: "level-1", label: "Level 1" },
            { value: "level-2", label: "Level 2" },
            { value: "level-3", label: "Level 3" },
            { value: "level-4", label: "Level 4" }
          ]
        },
        {
          type: "select",
          name: "digitalSkillsLevel",
          label: "Digital Skills Level",
          required: true,
          options: [
            { value: "basic", label: "Basic" },
            { value: "intermediate", label: "Intermediate" },
            { value: "advanced", label: "Advanced" }
          ]
        },
        {
          type: "textarea",
          name: "recommendations",
          label: "Support Recommendations",
          required: true,
          placeholder: "Provide recommendations for additional support if needed"
        }
      ]
    }
  }
];

/**
 * Default certifications that will be created for each new RTO
 */
const defaultCertifications = [
  {
    name: "Certificate III in Business",
    price: 2500,
    description: "Foundation level business qualification covering essential business skills and knowledge",
    certificationType: "default",
    competencyUnits: [
      {
        code: "BSBWHS311",
        title: "Maintain workplace safety",
        type: "core",
        sequence: 1,
        nominalHours: 20,
        cluster: "Safety and Compliance"
      },
      {
        code: "BSBTEC301",
        title: "Design and produce business documents",
        type: "core",
        sequence: 2,
        nominalHours: 40,
        cluster: "Business Operations"
      },
      {
        code: "BSBTEC302",
        title: "Design and produce spreadsheets",
        type: "elective",
        sequence: 3,
        nominalHours: 30,
        cluster: "Technology"
      }
    ],
    baseExpense: 800
  },
  {
    name: "Certificate IV in Leadership and Management",
    price: 3500,
    description: "Intermediate level qualification for developing leadership and management skills",
    certificationType: "default",
    competencyUnits: [
      {
        code: "BSBLDR411",
        title: "Demonstrate leadership in the workplace",
        type: "core",
        sequence: 1,
        nominalHours: 40,
        cluster: "Leadership"
      },
      {
        code: "BSBLDR412",
        title: "Communicate effectively as a workplace leader",
        type: "core",
        sequence: 2,
        nominalHours: 40,
        cluster: "Communication"
      },
      {
        code: "BSBLDR413",
        title: "Lead effective workplace relationships",
        type: "core",
        sequence: 3,
        nominalHours: 50,
        cluster: "Relationships"
      }
    ],
    baseExpense: 1200
  },
  {
    name: "Diploma of Business",
    price: 4500,
    description: "Advanced qualification for comprehensive business management and operations",
    certificationType: "default",
    competencyUnits: [
      {
        code: "BSBFIN501",
        title: "Manage budgets and financial plans",
        type: "core",
        sequence: 1,
        nominalHours: 60,
        cluster: "Finance"
      },
      {
        code: "BSBHRM513",
        title: "Manage workforce planning",
        type: "core",
        sequence: 2,
        nominalHours: 60,
        cluster: "Human Resources"
      },
      {
        code: "BSBOPS501",
        title: "Manage business resources",
        type: "core",
        sequence: 3,
        nominalHours: 50,
        cluster: "Operations"
      }
    ],
    baseExpense: 1500
  }
];

/**
 * Create default form templates for an RTO
 * @param {ObjectId} rtoId - The RTO ID to associate forms with
 * @returns {Array} Array of created form template IDs
 */
async function createDefaultFormTemplates(rtoId) {
  try {
    const createdForms = [];
    
    for (const templateData of defaultFormTemplates) {
      const formTemplate = new FormTemplate({
        ...templateData,
        rtoId: rtoId
      });
      
      await formTemplate.save();
      createdForms.push(formTemplate._id);
      
      logMe("rto.default_form_created", {
        formTemplateId: formTemplate._id,
        name: formTemplate.name,
        rtoId: rtoId
      });
    }
    
    logMe("rto.default_forms_created", {
      rtoId: rtoId,
      formCount: createdForms.length,
      formIds: createdForms
    });
    
    return createdForms;
  } catch (error) {
    logMe("rto.default_forms_creation.error", {
      rtoId: rtoId,
      error: error.message
    }, "error");
    throw error;
  }
}

/**
 * Create default certifications for an RTO
 * @param {ObjectId} rtoId - The RTO ID to associate certifications with
 * @param {Array} formTemplateIds - Array of form template IDs to link to certifications
 * @returns {Array} Array of created certification IDs
 */
async function createDefaultCertifications(rtoId, formTemplateIds = []) {
  try {
    const createdCertifications = [];
    
    for (const certData of defaultCertifications) {
      // Create form template associations for each certification
      const formTemplateAssociations = formTemplateIds.map((formId, index) => ({
        stepNumber: index + 1,
        formTemplateId: formId,
        filledBy: index === 0 ? "user" : "assessor",
        title: index === 0 ? "Enrolment" : index === 1 ? "Assessment" : "LLND Assessment"
      }));
      
      const certification = new Certification({
        ...certData,
        rtoId: rtoId,
        formTemplateIds: formTemplateAssociations
      });
      
      await certification.save();
      createdCertifications.push(certification._id);
      
      logMe("rto.default_certification_created", {
        certificationId: certification._id,
        name: certification.name,
        rtoId: rtoId
      });
    }
    
    logMe("rto.default_certifications_created", {
      rtoId: rtoId,
      certificationCount: createdCertifications.length,
      certificationIds: createdCertifications
    });
    
    return createdCertifications;
  } catch (error) {
    logMe("rto.default_certifications_creation.error", {
      rtoId: rtoId,
      error: error.message
    }, "error");
    throw error;
  }
}

/**
 * Create all default templates and certifications for a new RTO
 * @param {ObjectId} rtoId - The RTO ID
 * @returns {Object} Summary of created items
 */
async function createRTODefaults(rtoId) {
  try {
    logMe("rto.defaults_creation.start", { rtoId });
    
    // Create default form templates first
    const formTemplateIds = await createDefaultFormTemplates(rtoId);
    
    // Create default certifications with form template associations
    const certificationIds = await createDefaultCertifications(rtoId, formTemplateIds);
    
    const result = {
      rtoId: rtoId,
      formTemplates: {
        count: formTemplateIds.length,
        ids: formTemplateIds
      },
      certifications: {
        count: certificationIds.length,
        ids: certificationIds
      }
    };
    
    logMe("rto.defaults_creation.complete", result);
    
    return result;
  } catch (error) {
    logMe("rto.defaults_creation.error", {
      rtoId: rtoId,
      error: error.message
    }, "error");
    throw error;
  }
}

/**
 * Get default form templates structure (for reference)
 * @returns {Array} Default form templates structure
 */
function getDefaultFormTemplatesStructure() {
  return defaultFormTemplates;
}

/**
 * Get default certifications structure (for reference)
 * @returns {Array} Default certifications structure
 */
function getDefaultCertificationsStructure() {
  return defaultCertifications;
}

module.exports = {
  createRTODefaults,
  createDefaultFormTemplates,
  createDefaultCertifications,
  getDefaultFormTemplatesStructure,
  getDefaultCertificationsStructure,
  defaultFormTemplates,
  defaultCertifications
};
