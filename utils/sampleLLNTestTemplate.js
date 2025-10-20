// Sample LLN Test Form Template
// This is an example of how to structure an LLN test form template
const sampleLLNTestTemplate = {
  name: "Language Literacy Numeracy Test",
  description: "Assessment of basic language, literacy and numeracy skills",
  stepNumber: 2,
  filledBy: "user",
  formType: "lln_test",
  formStructure: {
    sections: [
      {
        section: "instructions",
        sectionTitle: "Test Instructions",
        fields: [
          {
            fieldName: "instructions_read",
            label: "I have read and understood the test instructions",
            fieldType: "checkbox",
            required: true
          }
        ]
      },
      {
        section: "numeracy",
        sectionTitle: "Numeracy Assessment",
        fields: [
          {
            fieldName: "q1_answer",
            label: "Question 1: What is 15 + 27?",
            fieldType: "text",
            required: true
          },
          {
            fieldName: "q1_score",
            label: "Score (Out of 5)",
            fieldType: "number",
            required: false
          },
          {
            fieldName: "q2_answer",
            label: "Question 2: If a box contains 24 apples and you take away 8, how many are left?",
            fieldType: "text",
            required: true
          },
          {
            fieldName: "q2_score",
            label: "Score (Out of 5)",
            fieldType: "number",
            required: false
          },
          {
            fieldName: "q3_answer",
            label: "Question 3: Calculate 3/4 of 80",
            fieldType: "text",
            required: true
          },
          {
            fieldName: "q3_score",
            label: "Score (Out of 5)",
            fieldType: "number",
            required: false
          }
        ]
      },
      {
        section: "literacy",
        sectionTitle: "Literacy Assessment",
        fields: [
          {
            fieldName: "q4_answer",
            label: "Question 4: Write a sentence describing your favorite hobby",
            fieldType: "textarea",
            required: true
          },
          {
            fieldName: "q4_score",
            label: "Score (Out of 5)",
            fieldType: "number",
            required: false
          },
          {
            fieldName: "q5_answer",
            label: "Question 5: Explain the difference between 'there', 'their', and 'they're'",
            fieldType: "textarea",
            required: true
          },
          {
            fieldName: "q5_score",
            label: "Score (Out of 5)",
            fieldType: "number",
            required: false
          }
        ]
      },
      {
        section: "language",
        sectionTitle: "Language Assessment",
        fields: [
          {
            fieldName: "q6_answer",
            label: "Question 6: What does 'procrastinate' mean?",
            fieldType: "text",
            required: true
          },
          {
            fieldName: "q6_score",
            label: "Score (Out of 5)",
            fieldType: "number",
            required: false
          },
          {
            fieldName: "q7_answer",
            label: "Question 7: Use 'consequently' in a sentence",
            fieldType: "text",
            required: true
          },
          {
            fieldName: "q7_score",
            label: "Score (Out of 5)",
            fieldType: "number",
            required: false
          }
        ]
      }
    ]
  },
  scoringConfig: {
    enableScoring: true,
    scoreFields: [
      {
        fieldName: "q1_score",
        label: "Score (Out of 5)",
        maxScore: 5
      },
      {
        fieldName: "q2_score",
        label: "Score (Out of 5)",
        maxScore: 5
      },
      {
        fieldName: "q3_score",
        label: "Score (Out of 5)",
        maxScore: 5
      },
      {
        fieldName: "q4_score",
        label: "Score (Out of 5)",
        maxScore: 5
      },
      {
        fieldName: "q5_score",
        label: "Score (Out of 5)",
        maxScore: 5
      },
      {
        fieldName: "q6_score",
        label: "Score (Out of 5)",
        maxScore: 5
      },
      {
        fieldName: "q7_score",
        label: "Score (Out of 5)",
        maxScore: 5
      }
    ]
  },
  isActive: true,
  version: 1
};

// Usage example for creating LLN test form template in database:
/*
const FormTemplate = require('../models/formTemplate');

// Create the LLN test template
const llnTemplate = new FormTemplate(sampleLLNTestTemplate);
await llnTemplate.save();
console.log('LLN Test template created:', llnTemplate._id);
*/

module.exports = sampleLLNTestTemplate;
