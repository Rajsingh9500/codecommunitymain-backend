import express from "express";
import User from "../models/User.js";

const router = express.Router();

/**
 * @route   GET /api/search
 * @desc    Search developers only (excludes admins & clients)
 * @access  Public
 */
router.get("/", async (req, res) => {
  try {
    const query = req.query.query?.trim() || "";

    if (!query) {
      return res.json({ success: false, results: [] });
    }

    const regex = new RegExp(query, "i");

    // ✅ Search developers only
    const developers = await User.find({
      role: "developer",
      $or: [
        { name: regex },
        { email: regex },
        { technologies: regex },
      ],
    })
      .select("_id name email technologies experience charges avgRating role")
      .limit(20)
      .lean();

    // ✅ Format search results
    const results = developers.map((dev) => ({
      id: dev._id,
      title: dev.name,
      description: `Expert in ${dev.technologies?.join(", ") || "various technologies"}`,
      experience: dev.experience || 0,
      charges: dev.charges || 0,
      avgRating: dev.avgRating || 0,
    }));

    res.json({ success: true, results });
  } catch (err) {
    console.error("❌ Search error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
