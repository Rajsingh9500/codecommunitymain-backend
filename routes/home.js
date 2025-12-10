import express from "express";
const router = express.Router();
import User from "../models/User.js";
import Project from "../models/Project.js";
import Testimonial from "../models/Testimonial.js";
/**
 * @route   GET /api/stats
 * @desc    Get live platform statistics from MongoDB
 */
router.get("/stats", async (req, res) => {
  try {
    const developers = await User.countDocuments({ role: "developer" });
    const clients = await User.countDocuments({ role: "client" });

    const totalProjects = await Project.countDocuments();
    const completedProjects = await Project.countDocuments({ status: "completed" });
    const activeProjects = await Project.countDocuments({
      status: { $in: ["pending", "in-progress"] },
    });

    const stats = [
      { number: developers, label: "Developers Joined" },
      { number: completedProjects, label: "Projects Completed" },
      { number: activeProjects, label: "Active Projects" },
      { number: clients, label: "Registered Clients" },
      { number: totalProjects, label: "Total Projects" },
    ];

    res.json(stats);
  } catch (error) {
    console.error("❌ Error in /api/stats:", error.message);
    res.status(500).json({ success: false, message: "Server error fetching stats" });
  }
});

/**
 * @route   GET /api/companies
 */
router.get("/companies", async (req, res) => {
  try {
    const companies = [
      { name: "Google", logo: "/logos/google.png" },
      { name: "Microsoft", logo: "/logos/microsoft.png" },
      { name: "Amazon", logo: "/logos/amazon.png" },
      { name: "IBM", logo: "/logos/ibm.png" },
      { name: "Infosys", logo: "/logos/infosys.png" },
      { name: "TCS", logo: "/logos/tcs.png" },
      { name: "Deloitte", logo: "/logos/deloitte.png" },
      { name: "Adobe", logo: "/logos/adobe.png" },
      { name: "Meta", logo: "/logos/meta.png" },
      { name: "Wipro", logo: "/logos/wipro.png" },
    ];
    res.json(companies);
  } catch (error) {
    console.error("❌ Error in /api/companies:", error.message);
    res.status(500).json({ success: false, message: "Server error fetching companies" });
  }
});

/**
 * @route   GET /api/testimonials
 * @desc    Get testimonials from MongoDB
 */
router.get("/testimonials", async (req, res) => {
  try {
    const testimonials = await Testimonial.find().sort({ createdAt: -1 });
    res.json(testimonials);
  } catch (error) {
    console.error("❌ Error in /api/testimonials:", error.message);
    res.status(500).json({ success: false, message: "Server error fetching testimonials" });
  }
});
export default router;
