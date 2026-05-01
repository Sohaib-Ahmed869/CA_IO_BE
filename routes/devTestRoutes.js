// routes/devTestRoutes.js
//
// Unauthenticated test endpoints. Only mounted when NODE_ENV !== "production"
// (server.js refuses to load this router in production).
//
// Add new test endpoints here. Keep them clearly labelled — anything in this
// file is hittable without a token.

const express = require("express");
const router = express.Router();
const emailService = require("../services/emailService2");

const isValidEmail = (v) => /^\S+@\S+\.\S+$/.test(String(v || "").trim());

// POST /api/dev/test-coe-email
// Body: {
//   email:              required — recipient
//   qualificationName?: optional — defaults to a deliberately long name to
//                                  exercise the AcroForm auto-fit fix
//   firstName?, lastName?, appCode?, price?, courseCode?
// }
router.post("/test-coe-email", async (req, res) => {
  try {
    const {
      email,
      qualificationName,
      firstName = "Test",
      lastName = "Student",
      appCode = "TEST-000001",
      price = 2500,
      courseCode = "CPC30220",
    } = req.body || {};

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "A valid `email` is required in the request body.",
      });
    }

    // Default to a name long enough to overflow the CoE form field at 11pt,
    // so the auto-fit shrinking logic in caioOfferFiller.js gets exercised.
    const longName =
      qualificationName ||
      `${courseCode} Certificate III in Carpentry, Joinery, Construction Site Management and Advanced Building Practice`;

    // Stub objects shaped like what sendCOEEmail expects (no DB writes).
    const stubUser = {
      firstName,
      lastName,
      email,
      title: "Mr",
      dateOfBirth: "1990-01-01",
    };

    const stubApplication = {
      _id: appCode,
      appCode,
      certificationId: {
        name: longName,
        code: courseCode,
        price,
        cricos: `CRICOS 099180J (${courseCode})`,
      },
    };

    const stubPayment = {
      _id: `payment_${Date.now()}`,
      paymentType: "one_time",
      totalAmount: price,
    };

    const stubEnrollmentFormData = {
      // Leave course/orientation dates undefined so sendCOEEmail uses its
      // own sensible defaults — keeps this endpoint focused on the
      // qualification-name test.
    };

    await emailService.sendCOEEmail(
      stubUser,
      stubApplication,
      stubPayment,
      stubEnrollmentFormData
    );

    return res.json({
      success: true,
      message: `Test CoE email sent to ${email}`,
      data: {
        recipient: email,
        qualificationName: longName,
        qualificationLength: longName.length,
        appCode,
      },
    });
  } catch (error) {
    console.error("[dev/test-coe-email] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send test CoE email",
      error: error?.message,
    });
  }
});

module.exports = router;
