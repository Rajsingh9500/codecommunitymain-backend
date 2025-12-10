// routes/developers.js
import express from "express";
import User from "../models/User.js";
import Project from "../models/Project.js";
import Review from "../models/Review.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

/* ----------------------------------------------------------
   0) PREVENT EXPRESS FROM CATCHING /socket.io AS :id
---------------------------------------------------------- */
router.use((req, res, next) => {
  if (req.path.startsWith("/socket.io")) return next("route");
  next();
});

/* ----------------------------------------------------------
   1) GET ONLY DEVELOPERS (used on developers listing page)
---------------------------------------------------------- */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const loggedInId = req.user?._id || null;

    const developers = await User.find({
      role: "developer",
      ...(loggedInId && { _id: { $ne: loggedInId } }), // SAFE EXCLUDE
    }).select("-password");

    if (req.user.role === "admin") {
      const enhanced = await Promise.all(
        developers.map(async (dev) => {
          const projects = await Project.find({ developer: dev._id }).select("title status");
          return { ...dev.toObject(), projects };
        })
      );
      return res.json({ success: true, developers: enhanced });
    }

    res.json({ success: true, developers });
  } catch (err) {
    console.error("❌ Developers GET error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


/* ----------------------------------------------------------
   2) GET DEVELOPER PROJECTS
---------------------------------------------------------- */
router.get("/:id/projects", authMiddleware, async (req, res) => {
  try {
    const projects = await Project.find({ developer: req.params.id })
      .populate("client", "name email")
      .populate("developer", "name email");

    res.json({ success: true, projects });
  } catch (err) {
    console.error("❌ Developer projects GET error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ----------------------------------------------------------
   3) GET USER/DEVELOPER PROFILE (used by /developers/[id])
---------------------------------------------------------- */
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password")
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    let avgRating = 0;
    let projects = [];

    // If this is developer → include rating + projects
    if (user.role === "developer") {
      const reviews = await Review.find({ developer: user._id }).lean();

      if (reviews.length > 0) {
        avgRating =
          reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      }

      projects = await Project.find({ developer: user._id })
        .select("title status")
        .populate("client", "name email");
    }

    res.json({
      success: true,
      developer: {
        ...user,
        technologies: user.technologies || [],
        charges: user.charges || 0,
        experience: user.experience || 0,
        avgRating: Number(avgRating.toFixed(1)),
        projects,
      },
    });
  } catch (err) {
    console.error("❌ Developer GET error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
