const ModalAnswers = require("../models/modalAnswers");
const Certification = require("../models/certification");

const modalAnswersController = {
  // Create or replace modal answers for a certification
  createOrReplace: async (req, res) => {
    try {
      const { certificationId, answers, version } = req.body;
      const user = req.user;
      if (!certificationId || !answers) return res.status(400).json({ success: false, message: "certificationId and answers are required" });

      const cert = await Certification.findById(certificationId).select("name");
      if (!cert) return res.status(404).json({ success: false, message: "Certification not found" });

      const existing = await ModalAnswers.findOne({ certificationId });
      if (existing) {
        existing.answers = answers;
        if (version) existing.version = version;
        existing.updatedBy = user && user._id;
        await existing.save();
        return res.status(200).json({ success: true, message: "Modal answers updated", data: existing });
      }

      const ma = new ModalAnswers({ certificationId, answers, version: version || 1, createdBy: user && user._id, updatedBy: user && user._id });
      await ma.save();
      res.status(201).json({ success: true, message: "Modal answers created", data: ma });
    } catch (error) {
      console.error("Create/Replace modal answers error:", error);
      res.status(500).json({ success: false, message: "Error creating modal answers", error: error.message });
    }
  },

  // Get modal answers by certification id
  getByCertification: async (req, res) => {
    try {
      const { certId } = req.params;
      const ma = await ModalAnswers.findOne({ certificationId: certId, isActive: true });
      if (!ma) return res.status(404).json({ success: false, message: "Modal answers not found" });
      res.json({ success: true, data: ma });
    } catch (error) {
      console.error("Get modal answers error:", error);
      res.status(500).json({ success: false, message: "Error fetching modal answers" });
    }
  },

  // List modal answers (filter by active / certification)
  list: async (req, res) => {
    try {
      const { certificationId, isActive } = req.query;
      const q = {};
      if (certificationId) q.certificationId = certificationId;
      if (typeof isActive !== 'undefined') q.isActive = isActive === 'true' || isActive === '1';
      const list = await ModalAnswers.find(q).populate('certificationId', 'name');
      res.json({ success: true, data: list });
    } catch (error) {
      console.error("List modal answers error:", error);
      res.status(500).json({ success: false, message: "Error listing modal answers" });
    }
  },

  // Soft delete (deactivate)
  deactivate: async (req, res) => {
    try {
      const { id } = req.params;
      const ma = await ModalAnswers.findByIdAndUpdate(id, { isActive: false }, { new: true });
      if (!ma) return res.status(404).json({ success: false, message: "Modal answers not found" });
      res.json({ success: true, message: "Modal answers deactivated", data: ma });
    } catch (error) {
      console.error("Deactivate modal answers error:", error);
      res.status(500).json({ success: false, message: "Error deactivating modal answers" });
    }
  }
};

module.exports = modalAnswersController;
