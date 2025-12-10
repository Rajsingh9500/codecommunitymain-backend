import express from "express";
import User from "../models/User.js";
import authenticate from "../middleware/authenticate.js";

const router = express.Router();

/* -----------------------------------------------------
   Helpers
----------------------------------------------------- */
const isSuperAdmin = (user) => user?.role === "superadmin";
const isAdmin = (user) => user?.role === "admin";
const allowAdmin = (req) => isAdmin(req.user) || isSuperAdmin(req.user);

/* =====================================================
   ✅ PUBLIC ROUTE — Get a user's public profile
   GET /api/users/profile/:id
===================================================== */
router.get("/profile/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, user });
  } catch (err) {
    console.error("❌ PUBLIC PROFILE ERROR:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =====================================================
   ✅ PUBLIC ROUTE — Get ALL users (not admin restricted)
   GET /api/users/all
===================================================== */
router.get("/all", authenticate, async (req, res) => {
  try {
    const me = req.user._id;

    const users = await User.find({
      _id: { $ne: me }   // ❗ EXCLUDE self
    }).select("-password");

    res.json({ success: true, users });
  } catch (err) {
    console.error("❌ USERS ALL ERROR:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/public/all", async (req, res) => {
  try {
    const users = await User.find({
      role: { $in: ["developer", "client"] }
    }).select("-password");

    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =====================================================
   ADMIN PANEL — Only Admin + SuperAdmin
===================================================== */
router.get("/", authenticate, async (req, res) => {
  try {
    if (!allowAdmin(req)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { search = "" } = req.query;

    let query = search
      ? {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
            { role: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    if (isAdmin(req.user)) {
      query.role = { $ne: "superadmin" };
    }

    const users = await User.find(query).select("-password");

    res.json({ success: true, users });
  } catch (err) {
    console.error("❌ ADMIN USERS ERROR:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =====================================================
   Update Role (Admin/SuperAdmin)
===================================================== */
router.patch("/:id/role", authenticate, async (req, res) => {
  try {
    if (!allowAdmin(req))
      return res.status(403).json({ message: "Access denied" });

    const { role } = req.body;
    if (!["admin", "developer", "client"].includes(role))
      return res.status(400).json({ message: "Invalid role" });

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: "User not found" });

    if (isSuperAdmin(target) && !isSuperAdmin(req.user))
      return res.status(403).json({ message: "Cannot modify SuperAdmin" });

    if (isAdmin(target) && !isSuperAdmin(req.user))
      return res.status(403).json({ message: "Cannot modify Admin" });

    if (role === "admin" && !isSuperAdmin(req.user))
      return res.status(403).json({ message: "Only SuperAdmin can assign admin" });

    target.role = role;
    await target.save();

    req.app.get("io")?.emit("user:updated", target);
    res.json({ success: true, user: target });
  } catch (err) {
    console.error("❌ ROLE UPDATE ERROR:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   Delete User
===================================================== */
router.delete("/:id", authenticate, async (req, res) => {
  try {
    if (!allowAdmin(req))
      return res.status(403).json({ message: "Access denied" });

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: "User not found" });

    if (isSuperAdmin(target) && !isSuperAdmin(req.user))
      return res.status(403).json({ message: "Cannot delete SuperAdmin" });

    if (isAdmin(target) && !isSuperAdmin(req.user))
      return res.status(403).json({ message: "Cannot delete Admin" });

    await target.deleteOne();

    req.app.get("io")?.emit("user:deleted", { id: target._id });
    res.json({ success: true, message: "User deleted" });
  } catch (err) {
    console.error("❌ DELETE ERROR:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
