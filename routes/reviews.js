import express from "express";
import Review from "../models/Review.js";
import authMiddleware from "../middleware/authMiddleware.js";
const router = express.Router();

/* ---------------------------------------------
   📍 GET /api/reviews
   → Fetch all general (CodeCommunity) reviews
--------------------------------------------- */
router.get("/", async (req, res) => {
  try {
    const reviews = await Review.find({ developer: null })
      .populate("client", "name email");

    const avgRating =
      reviews.length > 0
        ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
        : 0;

    res.json({ success: true, reviews, averageRating: Number(avgRating) });
  } catch (err) {
    console.error("❌ Get general reviews error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ---------------------------------------------
   📍 GET /api/reviews/:developerId
   → Fetch reviews for a specific developer
--------------------------------------------- */
router.get("/:developerId", async (req, res) => {
  try {
    const reviews = await Review.find({ developer: req.params.developerId })
      .populate("client", "name email");

    const avgRating =
      reviews.length > 0
        ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
        : 0;

    res.json({ success: true, reviews, avgRating });
  } catch (err) {
    console.error("❌ Get developer reviews error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ---------------------------------------------
   📍 POST /api/reviews
   → Add new review (for developer or general)
--------------------------------------------- */
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { developerId, rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    const reviewData = {
      developer: developerId || null, // null = CodeCommunity review
      client: req.user._id,
      rating,
      comment,
    };

    const review = await Review.create(reviewData);
    await review.populate("client", "name email");

    // ✅ Real-time event: notify developer or global admin dashboard
    if (req.io) {
      if (developerId) {
        req.io.to(`developer:${developerId}`).emit("review:new", review);
      } else {
        req.io.emit("review:new:global", review); // global reviews
      }
    }

    res.status(201).json({ success: true, review });
  } catch (err) {
    console.error("❌ Create review error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ---------------------------------------------
   📍 DELETE /api/reviews/:id
   → Delete review (admin only)
--------------------------------------------- */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can delete reviews",
      });
    }

    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) {
      return res
        .status(404)
        .json({ success: false, message: "Review not found" });
    }

    // ✅ Emit delete event (developer-specific or global)
    if (req.io) {
      if (review.developer) {
        req.io.to(`developer:${review.developer}`).emit("review:delete", review._id);
      } else {
        req.io.emit("review:delete:global", review._id);
      }
    }

    res.json({ success: true, message: "Review deleted successfully" });
  } catch (err) {
    console.error("❌ Delete review error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
