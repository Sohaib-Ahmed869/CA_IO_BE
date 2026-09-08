// controllers/assistantController.js
const assistantService = require("../services/assistantService");

// Suggested openers shown when the chat is first opened, matching the
// "Quick actions" in the support features specification.
const QUICK_ACTIONS = [
  "What documents do I need?",
  "What are my next steps?",
  "How do I make a payment?",
  "Check my application status",
  "Help with reference letters",
];

const assistantController = {
  // Lets the widget decide whether to render at all, and what to offer.
  getConfig: async (req, res) => {
    res.json({
      success: true,
      data: {
        enabled: assistantService.isEnabled(),
        quickActions: QUICK_ACTIONS,
        greeting: `Hi ${req.user.firstName || "there"} — I'm the CA Assistant. I can see your application, so ask me anything about your documents, payments or next steps.`,
      },
    });
  },

  chat: async (req, res) => {
    try {
      const { message, history } = req.body;

      if (!message || !String(message).trim()) {
        return res
          .status(400)
          .json({ success: false, message: "A message is required" });
      }

      if (!assistantService.isEnabled()) {
        return res.status(503).json({
          success: false,
          code: "ASSISTANT_DISABLED",
          message:
            "The assistant is unavailable at the moment. You can raise a support ticket and a person will help.",
        });
      }

      const result = await assistantService.ask({
        user: req.user,
        message: String(message),
        history: Array.isArray(history) ? history : [],
      });

      res.json({
        success: true,
        data: {
          reply: result.reply,
          // Lets the widget pre-tag a ticket if the student escalates.
          handover: assistantService.classifyForHandover([
            ...(Array.isArray(history) ? history : []),
            { role: "user", content: message },
            { role: "assistant", content: result.reply },
          ]),
        },
      });
    } catch (error) {
      console.error("Assistant chat error:", error.message);

      // Upstream problems (rate limit, billing, outage) must not look like a
      // portal bug — the student is offered the human path instead.
      const status = error.status || error.response?.status;
      const upstream = status === 429 || status === 401 || status >= 500;

      res.status(upstream ? 503 : 500).json({
        success: false,
        code: upstream ? "ASSISTANT_UNAVAILABLE" : "ASSISTANT_ERROR",
        message:
          "I couldn't answer that just now. You can raise a support ticket and a person will pick it up.",
      });
    }
  },

  // Exposed for debugging: shows exactly what the assistant can see about the
  // caller. Scoped to req.user, so a student can only ever see their own.
  getContext: async (req, res) => {
    try {
      const context = await assistantService.buildStudentContext(req.user);
      res.json({ success: true, data: context });
    } catch (error) {
      console.error("Assistant context error:", error);
      res
        .status(500)
        .json({ success: false, message: "Error building assistant context" });
    }
  },
};

module.exports = assistantController;
module.exports.QUICK_ACTIONS = QUICK_ACTIONS;
