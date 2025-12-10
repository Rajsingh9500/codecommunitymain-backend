import express from "express";
import User from "../models/User.js";
import Project from "../models/Project.js";
import Notification from "../models/Notification.js";
import authMiddleware, { requireAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

/* ---------------- Super Admin Email ---------------- */
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || "")
  .trim()
  .toLowerCase();

/* ---------------- Helpers ---------------- */
const buildSearchQuery = (search, fields) => {
  if (!search) return {};
  return {
    $or: fields.map((f) => ({ [f]: { $regex: search, $options: "i" } })),
  };
};

const pushNotification = async (io, email, message) => {
  const userDoc = await User.findOne({ email });

  await Notification.create({
    user: userDoc?._id || null,
    userEmail: email,
    message,
  });

  io?.emit("notification:new", {
    userEmail: email,
    message,
    createdAt: new Date(),
  });
};
/* ============================================================================
   📌 ADMIN DASHBOARD STATS (ADD THIS)
============================================================================ */
/* router.get("/stats", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalProjects = await Project.countDocuments();
    const totalNotifications = await Notification.countDocuments();

    const developers = await User.countDocuments({ role: "developer" });
    const clients = await User.countDocuments({ role: "client" });
    const admins = await User.countDocuments({ role: "admin" });

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalProjects,
        totalNotifications,
        developers,
        clients,
        admins,
      },
    });
  } catch (err) {
    console.error("❌ Admin Stats Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}); */


/* ============================================================================
   📌 GET ALL USERS (Admin + SuperAdmin)
============================================================================ */
router.get("/users", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "" } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const query = buildSearchQuery(search, ["name", "email", "role"]);

    const users = await User.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await User.countDocuments(query);

    res.json({ success: true, users, total });
  } catch (err) {
    console.error("❌ Error fetching users:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ============================================================================
   📌 UPDATE USER ROLE (SuperAdmin Only)
============================================================================ */
router.put("/users/update-role", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id, role } = req.body;
    const io = req.app.get("io");

    if (!id || !role)
      return res.status(400).json({ success: false, message: "Missing fields" });

    const caller = req.user;
    const target = await User.findById(id);

    if (!target)
      return res.status(404).json({ success: false, message: "User not found" });

    /* ❌ Nobody can modify SuperAdmin */
    if (
      target.role === "superadmin" ||
      target.email.toLowerCase() === SUPER_ADMIN_EMAIL
    ) {
      return res.status(403).json({
        success: false,
        message: "Cannot modify Super Admin",
      });
    }

    /* ❌ Only superadmin can change roles */
    if (caller.role !== "superadmin")
      return res.status(403).json({
        success: false,
        message: "Only SuperAdmin can modify roles",
      });

    /* ❌ Cannot remove last admin */
    if (target.role === "admin" && role !== "admin") {
      const adminCount = await User.countDocuments({ role: "admin" });
      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          message: "Cannot remove last admin",
        });
      }
    }

    target.role = role;
    await target.save();

    await pushNotification(
      io,
      target.email,
      role === "admin"
        ? "You have been promoted to Admin 🎉"
        : "Your admin role was modified"
    );

    io?.emit("user:updated", {
      _id: target._id,
      name: target.name,
      email: target.email,
      role: target.role,
    });

    res.json({ success: true, message: "Role updated successfully" });
  } catch (err) {
    console.error("❌ Role update error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* DELETE USER */
router.delete("/users/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const io = req.app.get("io");

    const caller = req.user;
    const target = await User.findById(id);

    if (!target) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const targetEmail = target.email.toLowerCase();

    if (target.role === "superadmin" || targetEmail === SUPER_ADMIN_EMAIL) {
      return res.status(403).json({ success: false, message: "Cannot delete Super Admin" });
    }

    if (target.role === "admin" && caller.role !== "superadmin") {
      return res.status(403).json({ success: false, message: "Only SuperAdmin can delete admin users" });
    }

    await User.findByIdAndDelete(id);

    let deleteQuery = {};
    if (target.role === "client") deleteQuery = { "client.email": target.email };
    if (target.role === "developer") deleteQuery = { "developer.email": target.email };

    if (Object.keys(deleteQuery).length > 0) {
      const projects = await Project.find(deleteQuery);
      await Project.deleteMany(deleteQuery);

      projects.forEach((p) => io?.emit("project:deleted", p._id));
    }

    // ⭐ FIXED — prevent delete errors
    try {
      await pushNotification(io, target.email, "Your account was deleted");
    } catch (notifyErr) {
      console.error("⚠️ Notification failed:", notifyErr.message);
    }

    io?.emit("user:deleted", id);

    res.json({ success: true, message: "User deleted successfully" });

  } catch (err) {
    console.error("❌ Delete user error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


/* ============================================================================
   📌 GET PROJECTS (⭐ FIXED WITH POPULATE)
============================================================================ */
router.get("/projects", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "" } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const query = search
      ? {
          $or: [
            { title: { $regex: search, $options: "i" } },
            { "client.name": { $regex: search, $options: "i" } },
            { "developer.name": { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const projects = await Project.find(query)
      .populate("client", "name email")
      .populate("developer", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Project.countDocuments(query);

    res.json({ success: true, projects, total });
  } catch (err) {
    console.error("❌ Fetch projects error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ============================================================================
   📌 DELETE PROJECT
============================================================================ */
router.delete("/projects/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const io = req.app.get("io");

    const project = await Project.findById(id)
      .populate("client", "email")
      .populate("developer", "email");

    if (!project)
      return res.status(404).json({ success: false, message: "Project not found" });

    await Project.findByIdAndDelete(id);

    const msg = `Your project "${project.title}" was deleted by admin.`;

    const recipients = [
      project.client?.email,
      project.developer?.email,
    ].filter(Boolean);

    for (const email of recipients) {
      await pushNotification(io, email, msg);
    }

    io?.emit("project:deleted", id);

    res.json({ success: true, message: "Project deleted successfully" });
  } catch (err) {
    console.error("❌ Delete project error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ============================================================================
   📌 GET NOTIFICATIONS
============================================================================ */
router.get("/notifications", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "" } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const query = search
      ? {
          $or: [
            { userEmail: { $regex: search, $options: "i" } },
            { message: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Notification.countDocuments(query);

    res.json({ success: true, notifications, total });
  } catch (err) {
    console.error("❌ Fetch notifications error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ============================================================================
   📌 DELETE NOTIFICATION
============================================================================ */
router.delete(
  "/notifications/:id",
  authMiddleware,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const io = req.app.get("io");

      const note = await Notification.findByIdAndDelete(id);

      if (!note)
        return res
          .status(404)
          .json({ success: false, message: "Notification not found" });

      io?.emit("notification:deleted", id);

      res.json({ success: true, message: "Notification deleted" });
    } catch (err) {
      console.error("❌ Delete notification error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

export default router;
