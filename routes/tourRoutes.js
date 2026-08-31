// routes/tourRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const User = require("../models/user");

router.use(authenticate);

// Which tours this user has already seen. The client uses this to decide
// whether a tour auto-starts on arrival.
router.get("/progress", async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("toursCompleted").lean();
    res.json({
      success: true,
      data: { completed: (user && user.toursCompleted) || [] },
    });
  } catch (error) {
    console.error("Get tour progress error:", error);
    res.status(500).json({ success: false, message: "Error fetching tour progress" });
  }
});

// Mark a tour finished or skipped. $addToSet keeps this idempotent, so a
// double-click or a retried request cannot create duplicates.
router.post("/progress/:tourId/complete", async (req, res) => {
  try {
    const tourId = String(req.params.tourId || "").trim();
    if (!tourId) {
      return res.status(400).json({ success: false, message: "Tour id required" });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $addToSet: { toursCompleted: tourId } },
      { new: true }
    )
      .select("toursCompleted")
      .lean();

    res.json({
      success: true,
      data: { completed: (user && user.toursCompleted) || [] },
    });
  } catch (error) {
    console.error("Complete tour error:", error);
    res.status(500).json({ success: false, message: "Error saving tour progress" });
  }
});

// "Show me the tours again" - clears one tour, or all of them when no id is given.
router.post("/progress/reset", async (req, res) => {
  try {
    const { tourId } = req.body || {};
    const update = tourId
      ? { $pull: { toursCompleted: String(tourId) } }
      : { $set: { toursCompleted: [] } };

    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true })
      .select("toursCompleted")
      .lean();

    res.json({
      success: true,
      data: { completed: (user && user.toursCompleted) || [] },
    });
  } catch (error) {
    console.error("Reset tour progress error:", error);
    res.status(500).json({ success: false, message: "Error resetting tour progress" });
  }
});

module.exports = router;
