// routes/connections.js
import express from "express";
import User from "../models/User.js";
import authenticate from "../middleware/authenticate.js";

const router = express.Router();

/* ======================================================
   POST /api/connections/add/:to
   (One-sided connect — user A adds user B)
====================================================== */
router.post("/add/:to", authenticate, async (req, res) => {
  try {
    const fromId = req.user._id;
    const toId = req.params.to;

    if (!toId)
      return res.status(400).json({ success: false, message: "Invalid target user" });

    if (String(fromId) === String(toId)) {
      return res.status(400).json({ success: false, message: "Cannot connect to yourself" });
    }

    const userExists = await User.findById(toId);
    if (!userExists)
      return res.status(404).json({ success: false, message: "User not found" });

    // Add only once
    await User.findByIdAndUpdate(fromId, {
      $addToSet: { connections: toId },
    });

    return res.json({ success: true, message: "Connected successfully" });
  } catch (err) {
    console.error("❌ connections.add error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ======================================================
   DELETE /api/connections/remove/:userId
====================================================== */
router.delete("/remove/:userId", authenticate, async (req, res) => {
  try {
    const me = req.user._id;
    const other = req.params.userId;

    await User.findByIdAndUpdate(me, {
      $pull: { connections: other },
    });

    return res.json({ success: true, message: "Connection removed" });
  } catch (err) {
    console.error("❌ connections.remove error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ======================================================
   GET /api/connections/list
   (Return all connected users)
====================================================== */
router.get("/list", authenticate, async (req, res) => {
  try {
    const me = await User.findById(req.user._id)
      .populate("connections", "name email role photo")
      .select("connections");

    return res.json({
      success: true,
      connections: me.connections || [],
    });
  } catch (err) {
    console.error("❌ connections.list error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ======================================================
   GET /api/connections/check/:userId
   (Check if user A is connected to user B)
====================================================== */
router.get("/check/:userId", authenticate, async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select("connections");
    const other = req.params.userId;

    const connected = (me.connections || []).some(
      (id) => String(id) === String(other)
    );

    return res.json({ success: true, connected });
  } catch (err) {
    console.error("❌ connections.check error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
