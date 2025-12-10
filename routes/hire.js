import express from "express";
import Hire from "../models/Hire.js";
import Project from "../models/Project.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

/* ============================================================
   📌 POST /api/hire
   → Client sends a hire request to a developer
============================================================ */
router.post("/", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "client") {
      return res.status(403).json({
        success: false,
        message: "Only clients can send hire requests",
      });
    }

    const { developerEmail, projectTitle, description, requirements, amount, deadline } =
      req.body;

    if (!developerEmail || !projectTitle || !description || !requirements || !amount) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const hireRequest = await Hire.create({
      clientEmail: req.user.email,
      developerEmail,
      projectTitle,
      description,
      requirements,
      amount,
      deadline,
      status: "pending",
    });

    res.json({
      success: true,
      message: "Hire request sent successfully",
      request: hireRequest,
    });
  } catch (err) {
    console.error("❌ Hire POST error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ============================================================
   📌 GET /api/hire
   → Get hire requests based on user role
============================================================ */
router.get("/", authMiddleware, async (req, res) => {
  try {
    let filter = {};

    if (req.user.role === "developer") {
      filter.developerEmail = req.user.email;
    } else if (req.user.role === "client") {
      filter.clientEmail = req.user.email;
    } else if (req.user.role === "admin" || req.user.role === "superadmin") {
      filter = {}; // FULL ACCESS
    }

    const requests = await Hire.find(filter).sort({ createdAt: -1 });

    res.json({ success: true, requests });
  } catch (err) {
    console.error("❌ Hire GET error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ============================================================
   📌 DELETE /api/hire/:id
   → Client deletes their own request
   → Admin + SuperAdmin can delete any request
============================================================ */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const request = await Hire.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ success: false, message: "Hire request not found" });
    }

    if (
      req.user.role !== "admin" &&
      req.user.role !== "superadmin" &&
      request.clientEmail !== req.user.email
    ) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    await request.deleteOne();
    res.json({ success: true, message: "Hire request deleted successfully" });
  } catch (err) {
    console.error("❌ Hire DELETE error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ============================================================
   📌 PATCH /api/hire
   → Developer/Admin/SuperAdmin accepts or rejects a hire request
============================================================ */
router.patch("/", authMiddleware, async (req, res) => {
  try {
    const { requestId, action } = req.body;

    if (!requestId || !["accept", "reject"].includes(action)) {
      return res.status(400).json({ success: false, message: "Invalid data" });
    }

    const request = await Hire.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: "Hire request not found" });
    }

    // Authorize developer, admin or superadmin
    if (
      req.user.role !== "admin" &&
      req.user.role !== "superadmin" &&
      request.developerEmail !== req.user.email
    ) {
      return res.status(403).json({ success: false, message: "Unauthorized action" });
    }

    // Update hire status
    request.status = action === "accept" ? "accepted" : "rejected";
    await request.save();

    let project = null;

    /* -------------------------------------------------------
       📌 If accepted → create/update project
    ------------------------------------------------------- */
    if (action === "accept") {
      const clientUser = await User.findOne({ email: request.clientEmail });
      const developerUser = await User.findOne({ email: request.developerEmail });

      if (!clientUser || !developerUser) {
        return res.status(400).json({
          success: false,
          message: "Client or Developer not found",
        });
      }

      project = await Project.findOne({ hireRequestId: request._id });

      if (!project) {
        project = new Project({
          title: request.projectTitle,
          client: clientUser._id,
          developer: developerUser._id,
          requirements: request.requirements,
          status: "ongoing",
          deadline: request.deadline || null,
          hireRequestId: request._id,
        });
      } else {
        project.status = "ongoing";
      }

      await project.save();
    }

    /* -------------------------------------------------------
       📌 Always send client notification
    ------------------------------------------------------- */
    await Notification.create({
      userEmail: request.clientEmail,
      message:
        action === "accept"
          ? `✅ Your hire request for "${request.projectTitle}" was accepted by ${request.developerEmail}`
          : `❌ Your hire request for "${request.projectTitle}" was rejected by ${request.developerEmail}`,
    });

    res.json({
      success: true,
      message: `Request ${action}ed successfully`,
      request,
      project,
    });
  } catch (err) {
    console.error("❌ Hire PATCH error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
