import express from "express";
import mongoose from "mongoose";
import Project from "../models/Project.js";
import Notification from "../models/Notification.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

/* ----------------- helpers ----------------- */
const normalizeUser = (u) => {
  if (!u) return null;
  return {
    _id: String(u._id),
    name: u.name || "",
    email: u.email || "",
    role: u.role || "",
  };
};

const normalizeRequirement = (r) => {
  if (!r) return null;
  return {
    _id: String(r._id),
    title: r.title || "",
    description: r.description || "",
    charges: r.charges || 0,
    deadline: r.deadline || null,
    status: r.status || "pending",
  };
};

/* ---------------- GET /api/projects ---------------- */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let filter = {};
    if (userRole === "developer") filter.developer = new mongoose.Types.ObjectId(userId);
    else if (userRole === "client") filter.client = new mongoose.Types.ObjectId(userId);

    const raw = await Project.find(filter)
      .populate("client", "name email role")
      .populate("developer", "name email role")
      .populate("requirements")
      .lean();

    const projects = raw.map((p) => ({
      _id: String(p._id),
      title: p.title,
      status: p.status,
      deadline: p.deadline,
      client: normalizeUser(p.client),
      developer: normalizeUser(p.developer),
      requirements: (p.requirements || []).map(normalizeRequirement),
    }));

    return res.json({ success: true, projects });
  } catch (err) {
    console.error("❌ GET /projects error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ---------------- GET /api/projects/:id ---------------- */
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    const p = await Project.findById(req.params.id)
      .populate("client", "name email role")
      .populate("developer", "name email role")
      .populate("requirements")
      .lean();

    if (!p) return res.status(404).json({ success: false, message: "Project not found" });

    const project = {
      _id: String(p._id),
      title: p.title,
      status: p.status,
      deadline: p.deadline,
      client: normalizeUser(p.client),
      developer: normalizeUser(p.developer),
      requirements: (p.requirements || []).map(normalizeRequirement),
    };

    if (
      userRole !== "admin" &&
      userRole !== "superadmin" &&
      project.client?._id !== userId &&
      project.developer?._id !== userId
    ) {
      return res.status(403).json({ success: false, message: "Unauthorized access" });
    }

    return res.json({ success: true, project });
  } catch (err) {
    console.error("❌ GET /projects/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ---------------- PUT /api/projects/:id/complete ---------------- */
router.put("/:id/complete", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const p = await Project.findById(req.params.id)
      .populate("client", "name email")
      .populate("developer", "name email");

    if (!p) return res.status(404).json({ success: false, message: "Not found" });

    // Only assigned developer may complete
    if (!p.developer || String(p.developer._id) !== String(userId)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Update project
    p.status = "completed";
    await p.save();

    /* ---------------- CREATE NOTIFICATIONS ---------------- */

    // CLIENT notification
    const clientNotif = await Notification.create({
      user: p.client._id, 
      userEmail: p.client.email,
      message: `Your project "${p.title}" has been completed by ${p.developer.name}.`,
      type: "project",
      link: `/my-projects/${p._id}`,
      read: false,
    });

    // DEVELOPER notification (acknowledgement)
    const devNotif = await Notification.create({
      user: p.developer._id,
      userEmail: p.developer.email,
      message: `You have marked project "${p.title}" as completed.`,
      type: "project",
      link: `/my-projects/${p._id}`,
      read: false,
    });

    /* ---------------- SOCKET EMITS (FIXED) ---------------- */
    const io = req.app.get("io");

    if (io) {
      try {
        // 🔹 Send ONLY to client
        io.to(String(p.client._id)).emit("notification:new", clientNotif);
        io.to(p.client.email).emit("notification:new", clientNotif);

        // 🔹 Send ONLY to developer
        io.to(String(p.developer._id)).emit("notification:new", devNotif);
        io.to(p.developer.email).emit("notification:new", devNotif);

        // 🔹 Admin broadcast
        io.emit("admin:notification", clientNotif);
      } catch (err) {
        console.error("❌ Socket emit error:", err);
      }
    }

    return res.json({ success: true, message: "Project completed" });
  } catch (err) {
    console.error("❌ COMPLETE PROJECT ERROR:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ---------------- DELETE /api/projects/:id ---------------- */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    const p = await Project.findById(req.params.id);

    if (!p) return res.status(404).json({ success: false, message: "Not found" });

    if (
      userRole !== "admin" &&
      userRole !== "superadmin" &&
      String(p.client) !== userId
    ) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    await p.deleteOne();
    return res.json({ success: true, message: "Project deleted" });
  } catch (err) {
    console.error("❌ DELETE PROJECT ERROR:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
