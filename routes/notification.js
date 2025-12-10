// routes/notifications.js
import express from "express";
import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

/* -------------------------------------------------------------
   GET /api/notifications?page=1&limit=20
   Returns paginated notifications + unread count
-------------------------------------------------------------- */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Notification.countDocuments({ user: userId }),

      Notification.countDocuments({ user: userId, read: false }),
    ]);

    return res.json({
      success: true,
      notifications,
      page,
      totalPages: Math.ceil(total / limit),
      totalUnread: unreadCount,
    });
  } catch (err) {
    console.error("❌ Notifications GET error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* -------------------------------------------------------------
   POST /api/notifications  (Admin sends to target user)
-------------------------------------------------------------- */
router.post("/", authMiddleware, async (req, res) => {
  try {
    const io = req.app.get("io");

    const { user: targetUserId, message, type = "system", link = null } = req.body;

    if (!targetUserId || !mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ success: false, message: "Valid target user ID required" });
    }

    if (!message) {
      return res.status(400).json({ success: false, message: "Message is required" });
    }

    const notification = await Notification.create({
      user: targetUserId,
      userEmail: req.user.email,
      message,
      type,
      link,
      read: false,
    });

// Notify target user
io.to(String(targetUserId)).emit("notification:new", notification);

// Notify ALL admins
io.emit("admin:notification:new", {
  notification,
  to: targetUserId
});

    return res.json({ success: true, notification });
  } catch (err) {
    console.error("❌ Notification create error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* -------------------------------------------------------------
   GET /api/notifications/all   (Admin only)
-------------------------------------------------------------- */
router.get("/all", authMiddleware, async (req, res) => {
  try {
    if (!["admin", "superadmin"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Admins only" });
    }

    const notifications = await Notification.find().sort({ createdAt: -1 }).lean();

    return res.json({ success: true, notifications });
  } catch (err) {
    console.error("❌ Notifications /all error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* -------------------------------------------------------------
   PATCH /api/notifications/:id/read
-------------------------------------------------------------- */
router.patch("/:id/read", authMiddleware, async (req, res) => {
  try {
    const notif = await Notification.findById(req.params.id);
    if (!notif) return res.status(404).json({ success: false, message: "Not found" });

    if (String(notif.user) !== req.user.id) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    notif.read = true;
    await notif.save();

    const io = req.app.get("io");
    io.to(String(req.user.id)).emit("notification:read", notif);

    return res.json({ success: true, notification: notif });
  } catch (err) {
    console.error("❌ Notification read error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* -------------------------------------------------------------
   DELETE /api/notifications/:id   (Owner or ADMIN/SUPERADMIN)
-------------------------------------------------------------- */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const notif = await Notification.findById(req.params.id);
    if (!notif) return res.status(404).json({ success: false, message: "Not found" });

    const isOwner = String(notif.user) === req.user.id;
    const isAdmin = ["admin", "superadmin"].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    await notif.deleteOne();

    const io = req.app.get("io");
    io.to(String(notif.user)).emit("notification:deleted", { id: notif._id });

    return res.json({ success: true, message: "Deleted" });
  } catch (err) {
    console.error("❌ Notification delete error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
