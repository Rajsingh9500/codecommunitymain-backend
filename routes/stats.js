import express from "express";
const router = express.Router();
import User from "../models/User.js";
import Project from "../models/Project.js";
import authMiddleware from "../middleware/authMiddleware.js";
import authenticate from "../middleware/authenticate.js";

/* ============================================================
   📌 GET /api/stats
   → Dashboard statistics (Admin + SuperAdmin only)
============================================================ */
router.get("/", authMiddleware, async (req, res) => {
  try {
    if (!["admin", "superadmin"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Only admin or superadmin can view stats",
      });
    }

    const totalUsers = await User.countDocuments();
    const totalAdmins = await User.countDocuments({ 
      role: { $in: ["admin", "superadmin"] }
    });
    const totalDevelopers = await User.countDocuments({ role: "developer" });
    const totalClients = await User.countDocuments({ role: "client" });

    const recentUsers = await User.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });

    return res.json({
      success: true,
      stats: {
        totalUsers,
        totalAdmins,
        totalDevelopers,
        totalClients,
        recentUsers,
      },
    });
  } catch (err) {
    console.error("❌ Stats Error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Error fetching platform statistics",
    });
  }
});

/* ============================================================
   📌 Helper: Inclusive Date Range Parsing
============================================================ */
function parseDateRange(queryFrom, queryTo) {
  const today = new Date();

  let from = queryFrom ? new Date(queryFrom) : new Date(today.getTime() - 30 * 86400000);
  let to = queryTo ? new Date(queryTo) : today;

  // force timezone-safe UTC ranges
  from = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 0, 0, 0));
  to = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate(), 23, 59, 59, 999));

  return { from, to };
}

/* ============================================================
   📌 GET /api/stats/analytics (FULLY FIXED)
   → Full analytics for Admin Dashboard (what your frontend wants)
============================================================ */
router.get("/analytics", authenticate, async (req, res) => {
  try {
    if (!["admin", "superadmin"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { from, to } = parseDateRange(req.query.from, req.query.to);

    /* Parallel Queries */
    const [
      totalUsers,
      newUsers,
      totalProjects,
      completedProjects,
      usersGrowth,
      completedGrowth,
      projectsByStatusAgg,
      techDistributionAgg,
      topDevelopersAgg,
      regionAgg,
      completedDurations
    ] = await Promise.all([
      User.countDocuments({}),                                      // total users
      User.countDocuments({ createdAt: { $gte: from, $lte: to } }), // new users
      Project.countDocuments({}),                                   // all projects
      Project.countDocuments({ status: "completed" }),              // completed
      /* Users growth */
      User.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      /* Completed project growth */
      Project.aggregate([
        { $match: { status: "completed", updatedAt: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$updatedAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      /* Project status distribution */
      Project.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
        { $project: { status: "$_id", count: 1, _id: 0 } },
      ]),
      /* Tech distribution */
      Project.aggregate([
        {
          $project: {
            technologies: {
              $cond: [
                { $isArray: "$technologies" },
                "$technologies",
                [{ $ifNull: ["$technology", null] }]
              ]
            }
          }
        },
        { $unwind: "$technologies" },
        { $match: { technologies: { $ne: null } } },
        {
          $group: {
            _id: "$technologies",
            count: { $sum: 1 },
          },
        },
        { $project: { technology: "$_id", count: 1, _id: 0 } },
        { $sort: { count: -1 } },
      ]),
      /* Top developers */
      Project.aggregate([
        { $match: { status: "completed", developer: { $ne: null } } },
        {
          $group: {
            _id: "$developer",
            completed: { $sum: 1 },
          },
        },
        { $sort: { completed: -1 } },
        { $limit: 5 },
      ]),
      /* Region distribution */
      User.aggregate([
        { $match: { region: { $exists: true, $ne: null } } },
        {
          $group: {
            _id: "$region",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 3 },
      ]),
      /* Completion durations */
      Project.aggregate([
        { $match: { status: "completed", createdAt: { $exists: true }, updatedAt: { $exists: true } } },
        {
          $project: {
            durationDays: {
              $divide: [
                { $subtract: ["$updatedAt", "$createdAt"] },
                1000 * 60 * 60 * 24,
              ],
            },
          },
        },
      ]),
    ]);

    /* Compute median completion days */
    const durations = completedDurations.map((d) => d.durationDays).sort((a, b) => a - b);
    let medianCompletionDays = null;
    if (durations.length > 0) {
      const mid = Math.floor(durations.length / 2);
      medianCompletionDays =
        durations.length % 2 === 0
          ? (durations[mid - 1] + durations[mid]) / 2
          : durations[mid];
      medianCompletionDays = Number(medianCompletionDays.toFixed(2));
    }

    /* Average projects per user */
    const avgProjectsPerUser =
      totalUsers > 0 ? Number((totalProjects / totalUsers).toFixed(2)) : 0;

    /* Top region */
    const topRegion = regionAgg.length ? regionAgg[0]._id : null;

    /* Final normalized structures */
    const analytics = {
      totalUsers,
      newUsers,
      totalProjects,
      completedProjects,
      liveConnections: 0, // replace with actual socket counter if needed
      lastUpdated: new Date().toISOString(),
      usersGrowth,
      completedGrowth,
      projectsByStatus: projectsByStatusAgg,
      techDistribution: techDistributionAgg,
      avgProjectsPerUser,
      medianCompletionDays,
      topRegion,
      topDevelopers: topDevelopersAgg,
    };

    return res.json({ success: true, analytics });

  } catch (err) {
    console.error("❌ Analytics error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
