import express from "express";
import path from "path";
import fs from "fs";
import Testimonial from "../models/Testimonial.js";
import User from "../models/User.js";
const router = express.Router();

const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5001}`;

/* ✅ GET Testimonials + Users */
router.get("/", async (req, res) => {
  try {
    // Fetch all testimonials and populate user
    const testimonials = await Testimonial.find().populate("user", "name role photo");
    const users = await User.find({ role: { $in: ["developer", "client"] } });

    // Map testimonials
    const testimonialData = testimonials.map((t) => ({
      id: t._id,
      name: t.user?.name || "Anonymous",
      role: t.user?.role || "User",
      feedback: t.feedback,
      image: t.user?.photo
        ? `${baseUrl}${t.user.photo.startsWith("/") ? t.user.photo : "/" + t.user.photo}`
        : `${baseUrl}/uploads/user.png`,
      from: "testimonial",
    }));

    // Map users (who didn’t write testimonials)
    const userData = users
      .filter((u) => !testimonials.some((t) => t.user?._id?.toString() === u._id.toString()))
      .map((u) => ({
        id: u._id,
        name: u.name,
        role: u.role,
        feedback:
          u.role === "developer"
            ? "Proud to be part of CodeCommunity as a developer!"
            : "Excited to connect with talented developers on CodeCommunity!",
        image: u.photo
          ? `${baseUrl}${u.photo.startsWith("/") ? u.photo : "/" + u.photo}`
          : `${baseUrl}/uploads/user.png`,
        from: "user",
      }));

    // Combine testimonials + user profiles
    const combined = [...testimonialData, ...userData];

    return res.json(combined);
  } catch (err) {
    console.error("❌ Fetch testimonials error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
