// utils/llnScoringService.js
class LLNScoringService {
  /**
   * Initialize score fields for LLN test form submission
   * @param {Object} formTemplate - The form template with scoring config
   * @param {Object} formData - The submitted form data
   * @returns {Array} Array of score breakdown objects
   */
  initializeScoreFields(formTemplate, formData) {
    const hasScoringConfig = !!(formTemplate && formTemplate.scoringConfig);
    const enabled = !!(hasScoringConfig && formTemplate.scoringConfig.enableScoring);
    const isLLN = (formTemplate && (formTemplate.formType === 'lln_test'));

    // If explicit scoring is disabled but this is an LLN form, proceed with auto-detect
    if (!enabled && !isLLN) {
      return [];
    }

    const scoreBreakdown = [];
    
    // Extract score fields from form structure
    if (enabled && formTemplate.scoringConfig.scoreFields && formTemplate.scoringConfig.scoreFields.length > 0) {
      // Use predefined score fields from template
      formTemplate.scoringConfig.scoreFields.forEach(scoreField => {
        scoreBreakdown.push({
          fieldName: scoreField.fieldName,
          label: scoreField.label,
          studentAnswer: formData[scoreField.fieldName] || '',
          score: 0,
          maxScore: scoreField.maxScore,
          feedback: ''
        });
      });
    } else {
      // Auto-detect score fields from form structure
      this.extractScoreFieldsFromStructure(formTemplate.formStructure, formData, scoreBreakdown);
    }

    return scoreBreakdown;
  }

  /**
   * Extract score fields from form structure automatically
   * @param {Object} formStructure - The form structure
   * @param {Object} formData - The submitted form data
   * @param {Array} scoreBreakdown - Array to populate with score fields
   */
  extractScoreFieldsFromStructure(formStructure, formData, scoreBreakdown) {
    if (!formStructure) return;

    // Case 1: formStructure = { sections: [...] }
    if (Array.isArray(formStructure.sections)) {
      formStructure.sections.forEach(section => {
        if (Array.isArray(section.fields)) {
          section.fields.forEach(field => this.#maybePushScoreField(field, formData, scoreBreakdown));
        }
      });
      return;
    }

    // Case 2: formStructure = [ { section, fields: [...] }, ... ]
    if (Array.isArray(formStructure)) {
      formStructure.forEach(section => {
        if (Array.isArray(section?.fields)) {
          section.fields.forEach(field => this.#maybePushScoreField(field, formData, scoreBreakdown));
        } else {
          // Some schemas might be flat fields array at top-level
          this.#maybePushScoreField(section, formData, scoreBreakdown);
        }
      });
      return;
    }

    // Case 3: formStructure = { fields: [...] }
    if (Array.isArray(formStructure.fields)) {
      formStructure.fields.forEach(field => this.#maybePushScoreField(field, formData, scoreBreakdown));
      return;
    }
  }

  // Helper to process a field and push to scoreBreakdown if it is a score field
  #maybePushScoreField(field, formData, scoreBreakdown) {
    if (!field || typeof field !== 'object') return;
    if (this.isScoreField(field)) {
      const maxScore = this.extractMaxScore(field.label);
      scoreBreakdown.push({
        fieldName: field.fieldName,
        label: field.label,
        studentAnswer: formData ? (formData[field.fieldName] || '') : '',
        score: 0,
        maxScore: maxScore,
        feedback: ''
      });
    }
  }

  /**
   * Check if a field is a score field
   * @param {Object} field - The field object
   * @returns {Boolean} True if field is a score field
   */
  isScoreField(field) {
    return field.fieldType === 'number' && 
           field.label && 
           field.label.toLowerCase().includes('score') &&
           field.label.includes('(Out of');
  }

  /**
   * Extract maximum score from field label
   * @param {String} label - The field label
   * @returns {Number} Maximum score
   */
  extractMaxScore(label) {
    const match = label.match(/\(Out of (\d+)\)/i);
    return match ? parseInt(match[1]) : 1;
  }

  /**
   * Calculate total scores from score breakdown
   * @param {Array} scoreBreakdown - Array of score objects
   * @returns {Object} Calculated scores
   */
  calculateScores(scoreBreakdown) {
    if (!scoreBreakdown || scoreBreakdown.length === 0) {
      return {
        totalScore: 0,
        maxScore: 0,
        percentage: 0
      };
    }

    const totalScore = scoreBreakdown.reduce((sum, item) => sum + (item.score || 0), 0);
    const maxScore = scoreBreakdown.reduce((sum, item) => sum + (item.maxScore || 0), 0);
    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

    return {
      totalScore,
      maxScore,
      percentage
    };
  }

  /**
   * Update score for a specific field
   * @param {Array} scoreBreakdown - Array of score objects
   * @param {String} fieldName - Field name to update
   * @param {Number} score - New score value
   * @param {String} feedback - Optional feedback
   * @returns {Array} Updated score breakdown
   */
  updateScore(scoreBreakdown, fieldName, score, feedback = '') {
    return scoreBreakdown.map(item => {
      if (item.fieldName === fieldName) {
        return {
          ...item,
          score: Math.max(0, Math.min(score, item.maxScore)), // Clamp between 0 and maxScore
          feedback: feedback
        };
      }
      return item;
    });
  }

  /**
   * Validate score input
   * @param {Number} score - Score to validate
   * @param {Number} maxScore - Maximum allowed score
   * @returns {Object} Validation result
   */
  validateScore(score, maxScore) {
    if (isNaN(score) || score < 0) {
      return { valid: false, error: 'Score must be a positive number' };
    }
    if (score > maxScore) {
      return { valid: false, error: `Score cannot exceed ${maxScore}` };
    }
    return { valid: true };
  }

  /**
   * Generate score summary for display
   * @param {Object} scoringData - Complete scoring data
   * @returns {Object} Formatted score summary
   */
  generateScoreSummary(scoringData) {
    if (!scoringData || !scoringData.scoreBreakdown) {
      return {
        totalScore: 0,
        maxScore: 0,
        percentage: 0,
        isMarked: false,
        markedAt: null,
        scoreBreakdown: []
      };
    }

    const calculated = this.calculateScores(scoringData.scoreBreakdown);
    
    return {
      totalScore: calculated.totalScore,
      maxScore: calculated.maxScore,
      percentage: calculated.percentage,
      isMarked: scoringData.isMarked || false,
      markedAt: scoringData.markedAt,
      markedBy: scoringData.markedBy,
      scoreBreakdown: scoringData.scoreBreakdown.map(item => ({
        fieldName: item.fieldName,
        label: item.label,
        studentAnswer: item.studentAnswer,
        score: item.score,
        maxScore: item.maxScore,
        feedback: item.feedback
      }))
    };
  }

  /**
   * Check if user can edit scores based on role
   * @param {String} userRole - User role
   * @returns {Boolean} True if user can edit scores
   */
  canEditScores(userRole) {
    return userRole === 'assessor' || userRole === 'admin';
  }

  /**
   * Check if user can view scores based on role
   * @param {String} userRole - User role
   * @returns {Boolean} True if user can view scores
   */
  canViewScores(userRole) {
    return userRole === 'assessor' || userRole === 'admin';
  }

  /**
   * Format score for display
   * @param {Number} score - Score value
   * @param {Number} maxScore - Maximum score
   * @returns {String} Formatted score string
   */
  formatScore(score, maxScore) {
    return `${score}/${maxScore}`;
  }

  /**
   * Get score grade based on percentage
   * @param {Number} percentage - Score percentage
   * @returns {String} Grade description
   */
  getScoreGrade(percentage) {
    if (percentage >= 90) return 'Excellent';
    if (percentage >= 80) return 'Good';
    if (percentage >= 70) return 'Satisfactory';
    if (percentage >= 60) return 'Needs Improvement';
    return 'Unsatisfactory';
  }
}

module.exports = new LLNScoringService();