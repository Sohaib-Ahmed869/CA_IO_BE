// utils/llnScoringService.js
class LLNScoringService {
  /**
   * Initialize score fields for LLN test form submission
   * @param {Object} formTemplate - The form template with scoring config
   * @param {Object} formData - The submitted form data
   * @returns {Object} Initialized scoring data
   */
  initializeScoreFields(formTemplate, formData) {
    const scoringData = {
      isMarked: false,
      totalScore: 0,
      maxScore: 0,
      percentage: 0,
      scoreBreakdown: []
    };

    // If template has scoring config, use it
    if (formTemplate.scoringConfig && formTemplate.scoringConfig.enableScoring) {
      formTemplate.scoringConfig.scoreFields.forEach(scoreField => {
        scoringData.scoreBreakdown.push({
          fieldName: scoreField.fieldName,
          label: scoreField.label,
          studentAnswer: formData[scoreField.fieldName] || '',
          score: 0,
          maxScore: scoreField.maxScore,
          feedback: ''
        });
        scoringData.maxScore += scoreField.maxScore;
      });
    } else {
      // Auto-detect score fields from form structure
      this.extractScoreFieldsFromStructure(formTemplate.formStructure, formData, scoringData);
    }

    return scoringData;
  }

  /**
   * Extract score fields from form structure automatically
   * @param {Array} formStructure - The form structure array
   * @param {Object} formData - The submitted form data
   * @param {Object} scoringData - The scoring data object to populate
   */
  extractScoreFieldsFromStructure(formStructure, formData, scoringData) {
    if (!formStructure || !Array.isArray(formStructure)) return;

    formStructure.forEach(section => {
      if (section.fields && Array.isArray(section.fields)) {
        section.fields.forEach(field => {
          if (this.isScoreField(field)) {
            const maxScore = this.extractMaxScore(field.label);
            scoringData.scoreBreakdown.push({
              fieldName: field.fieldName,
              label: field.label,
              studentAnswer: formData[field.fieldName] || '',
              score: 0,
              maxScore: maxScore,
              feedback: ''
            });
            scoringData.maxScore += maxScore;
          }
        });
      }
    });
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
           field.label.includes('(') && 
           field.label.includes(')');
  }

  /**
   * Extract maximum score from field label
   * @param {String} label - The field label (e.g., "Score (Out of 5)")
   * @returns {Number} The maximum score
   */
  extractMaxScore(label) {
    const match = label.match(/\(Out of (\d+)\)/i);
    return match ? parseInt(match[1]) : 1;
  }

  /**
   * Calculate scores from score breakdown
   * @param {Array} scoreBreakdown - Array of score breakdown objects
   * @returns {Object} Calculated scores
   */
  calculateScores(scoreBreakdown) {
    let totalScore = 0;
    let maxScore = 0;

    scoreBreakdown.forEach(item => {
      totalScore += item.score || 0;
      maxScore += item.maxScore || 0;
    });

    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

    return {
      totalScore,
      maxScore,
      percentage
    };
  }

  /**
   * Update scoring data with new scores
   * @param {Object} scoringData - Current scoring data
   * @param {Object} scoreUpdates - Updates for scores
   * @param {String} markedBy - User ID who marked the scores
   * @returns {Object} Updated scoring data
   */
  updateScores(scoringData, scoreUpdates, markedBy) {
    const updatedScoringData = { ...scoringData };
    
    // Update individual scores
    if (scoreUpdates.scoreBreakdown) {
      updatedScoringData.scoreBreakdown = updatedScoringData.scoreBreakdown.map(item => {
        const update = scoreUpdates.scoreBreakdown.find(u => u.fieldName === item.fieldName);
        if (update) {
          return {
            ...item,
            score: update.score || 0,
            feedback: update.feedback || ''
          };
        }
        return item;
      });
    }

    // Calculate totals
    const calculatedScores = this.calculateScores(updatedScoringData.scoreBreakdown);
    updatedScoringData.totalScore = calculatedScores.totalScore;
    updatedScoringData.maxScore = calculatedScores.maxScore;
    updatedScoringData.percentage = calculatedScores.percentage;

    // Mark as completed
    updatedScoringData.isMarked = true;
    updatedScoringData.markedBy = markedBy;
    updatedScoringData.markedAt = new Date();

    return updatedScoringData;
  }

  /**
   * Get score summary for display
   * @param {Object} scoringData - The scoring data
   * @returns {Object} Score summary
   */
  getScoreSummary(scoringData) {
    if (!scoringData || !scoringData.isMarked) {
      return {
        isMarked: false,
        message: 'Not yet marked'
      };
    }

    return {
      isMarked: true,
      totalScore: scoringData.totalScore,
      maxScore: scoringData.maxScore,
      percentage: scoringData.percentage,
      grade: this.getGrade(scoringData.percentage),
      markedAt: scoringData.markedAt,
      scoreBreakdown: scoringData.scoreBreakdown
    };
  }

  /**
   * Get grade based on percentage
   * @param {Number} percentage - The percentage score
   * @returns {String} The grade
   */
  getGrade(percentage) {
    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B';
    if (percentage >= 60) return 'C';
    if (percentage >= 50) return 'D';
    return 'F';
  }

  /**
   * Validate score input
   * @param {Number} score - The score to validate
   * @param {Number} maxScore - The maximum possible score
   * @returns {Object} Validation result
   */
  validateScore(score, maxScore) {
    if (isNaN(score) || score < 0) {
      return { valid: false, message: 'Score must be a positive number' };
    }
    if (score > maxScore) {
      return { valid: false, message: `Score cannot exceed ${maxScore}` };
    }
    return { valid: true };
  }

  /**
   * Generate score report for PDF
   * @param {Object} scoringData - The scoring data
   * @returns {Object} Score report for PDF generation
   */
  generateScoreReport(scoringData) {
    if (!scoringData || !scoringData.isMarked) {
      return null;
    }

    return {
      totalScore: scoringData.totalScore,
      maxScore: scoringData.maxScore,
      percentage: scoringData.percentage,
      grade: this.getGrade(scoringData.percentage),
      scoreBreakdown: scoringData.scoreBreakdown.map(item => ({
        label: item.label,
        studentAnswer: item.studentAnswer,
        score: item.score,
        maxScore: item.maxScore,
        feedback: item.feedback
      })),
      markedAt: scoringData.markedAt
    };
  }
}

module.exports = new LLNScoringService();
