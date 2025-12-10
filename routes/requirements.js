import express from "express";
const router = express.Router();
import Requirement from "../models/Requirement.js";
import Project from "../models/Project.js";
import authMiddleware from "../middleware/authMiddleware.js";

/* ======================================================
   GET /developer/:developerId
====================================================== */
router.get("/developer/:developerId", authMiddleware, async (req, res) => {
  try {
    const { developerId } = req.params;

    const requirements = await Requirement.find({
      developer: developerId,
      status: "accepted",
    })
      .populate("client", "name email")
      .populate("developer", "name email")
      .sort({ updatedAt: -1 })
      .lean();

    res.json({ success: true, requirements });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* ======================================================
   GET /my-projects
====================================================== */
router.get("/my-projects", authMiddleware, async (req, res) => {
  try {
    let filter = {};

    if (req.user.role === "developer") {
      filter = { developer: req.user._id, status: "accepted" };
    } else if (req.user.role === "client") {
      filter = { client: req.user._id, status: "accepted" };
    } else {
      return res.status(403).json({ success: false });
    }

    const requirements = await Requirement.find(filter)
      .populate("client", "name email")
      .populate("developer", "name email")
      .sort({ updatedAt: -1 });

    res.json({ success: true, requirements });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* ======================================================
   POST / (client posts requirement)
====================================================== */
router.post("/", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "client")
      return res.status(403).json({ success: false, message: "Clients only" });

    const { title, description, charges, deadline } = req.body;

    const requirement = await Requirement.create({
      client: req.user._id,
      title,
      description,
      charges,
      deadline: deadline || null,
      status: "pending",
    });

    const populated = await Requirement.findById(requirement._id).populate(
      "client",
      "name email"
    );

    const io = req.app.get("io");
    if (io) io.emit("requirement:posted", populated);

    res.json({ success: true, requirement: populated });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* ======================================================
   GET /all (Admin only)
====================================================== */
router.get("/all", authMiddleware, async (req, res) => {
  try {
    if (!["admin", "superadmin"].includes(req.user.role))
      return res.status(403).json({ success: false });

    const requirements = await Requirement.find({})
      .populate("client", "name email")
      .populate("developer", "name email")
      .sort({ createdAt: -1 });

    res.json({ success: true, requirements });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* ======================================================
   GET / (role-based fetch)
====================================================== */
router.get("/", authMiddleware, async (req, res) => {
  try {
    let filter = {};

    if (req.user.role === "developer") {
      filter = {
        $or: [
          { status: "pending", developer: null },
          { developer: req.user._id },
        ],
      };
    } else if (req.user.role === "client") {
      filter = { client: req.user._id };
    }

    const requirements = await Requirement.find(filter)
      .populate("client", "name email")
      .populate("developer", "name email")
      .sort({ createdAt: -1 });

    res.json({ success: true, requirements });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* ======================================================
   GET /:id (IMPORTANT: must be before PUT)
====================================================== */
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const requirement = await Requirement.findById(req.params.id)
      .populate("client", "name email role")
      .populate("developer", "name email role");

    if (!requirement)
      return res.status(404).json({ success: false, message: "Not found" });

    let project = await Project.findOne({
      requirements: requirement._id,
    })
      .populate("client", "name email")
      .populate("developer", "name email")
      .populate(
        "requirements",
        "title description charges deadline status"
      );

    res.json({
      success: true,
      requirement,
      project: project || null,
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* ======================================================
   PUT /:id/:action (developer accept/reject)
====================================================== */
router.put("/:id/:action", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "developer")
      return res.status(403).json({ success: false });

    const { id, action } = req.params;
    const status = action === "accept" ? "accepted" : "rejected";

    const updated = await Requirement.findOneAndUpdate(
      { _id: id, status: "pending" },
      { status, developer: req.user._id },
      { new: true }
    )
      .populate("client", "name email")
      .populate("developer", "name email");

    let project = null;

    if (status === "accepted") {
      project = await Project.create({
        title: updated.title,
        client: updated.client._id,
        developer: updated.developer._id,
        deadline: updated.deadline,
        requirements: [updated._id],
        status: "in-progress",
      });
    }

    res.json({ success: true, requirement: updated, project });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* ======================================================
   PUT /:id (client edits pending)
====================================================== */
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "client")
      return res.status(403).json({ success: false });

    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
});

/* ======================================================
   DELETE /:id (client)
====================================================== */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "client")
      return res.status(403).json({ success: false });

    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
});

export default router;
