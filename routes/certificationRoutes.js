// routes/certificationRoutes.js
const express = require("express");
const router = express.Router();
const certificationController = require("../controllers/certificateController");

// Create a new certification
router.post("/", certificationController.createCertification);

// Get all certifications
router.get("/", certificationController.getAllCertifications);

// Get certification by ID
router.get("/:id", certificationController.getCertificationById);

router.put("/:id/expense", certificationController.updateCertificationExpense);
// Update certification
router.put("/:id", certificationController.updateCertification);

// Delete certification
router.delete("/:id", certificationController.deleteCertification);


module.exports = router;
