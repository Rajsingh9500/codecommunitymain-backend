// middleware/auth.js  (replace your current file with this)
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || "").toLowerCase();

const authMiddleware = async (req, res, next) => {
  try {
    // ---- Token extraction (robust) ----
    let token = null;

    // 1) cookie (cookie-parser required)
    if (req.cookies && typeof req.cookies.token === "string") {
      token = req.cookies.token;
    }

    // 2) Authorization header "Bearer <token>"
    if (!token && req.headers?.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    // 3) query param fallback (optional but helpful for testing)
    if (!token && req.query?.token) {
      token = req.query.token;
    }

    // Defensive cleanup: sometimes token becomes the string "undefined" or "null"
    if (token === "undefined" || token === "null") token = null;

    if (!token) {
      return res.status(401).json({ success: false, message: "No valid token provided" });
    }

    // ---- Verify token ----
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Auth verify failed:", err.message);
      }
      return res.status(401).json({ success: false, message: "Invalid or expired token" });
    }

    // Accept either decoded.id or decoded._id for compatibility
    const userId = decoded.id || decoded._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Token missing user id" });
    }

    const dbUser = await User.findById(userId).select("-password");
    if (!dbUser) {
      return res.status(401).json({ success: false, message: "User no longer exists" });
    }

    // ---- Role normalization ----
    let finalRole = dbUser.role;
    if (dbUser.role === "superadmin") finalRole = "superadmin";
    if (SUPER_ADMIN_EMAIL && dbUser.email.toLowerCase() === SUPER_ADMIN_EMAIL) finalRole = "superadmin";

    req.user = {
      _id: dbUser._id.toString(),
      id: dbUser._id.toString(),
      name: dbUser.name,
      email: dbUser.email,
      role: finalRole,
    };

    req.token = token;
    next();
  } catch (err) {
    console.error("❌ Auth middleware error:", err);
    return res.status(401).json({ success: false, message: "Authentication failed" });
  }
};

export const requireAdmin = (req, res, next) => {
  try {
    const role = req.user?.role;
    if (role === "admin" || role === "superadmin") return next();
    return res.status(403).json({ success: false, message: "Admins only" });
  } catch (err) {
    console.error("❌ requireAdmin error:", err.message);
    return res.status(500).json({ success: false, message: "Permission check failed" });
  }
};

export default authMiddleware;
