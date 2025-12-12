import express from "express";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import multer from "multer";
import { Resend } from "resend";
import authMiddleware from "../middleware/authMiddleware.js";

dotenv.config();

const router = express.Router();
const upload = multer({ dest: "uploads/" });

const JWT_SECRET = process.env.JWT_SECRET;
const SOCKET_SECRET = process.env.SOCKET_SECRET || JWT_SECRET;
const RESET_SECRET = process.env.RESET_SECRET;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

// Optional cookie domain for production (e.g. ".vercel.app" or ".yourdomain.com")
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || null;

const resend = new Resend(process.env.RESEND_API_KEY);
const SENDER_EMAIL = process.env.RESEND_SENDER_EMAIL;

/* ---------------------------------------------------------
   FORMAT USER
----------------------------------------------------------*/
const formatUser = (user) => {
  if (!user) return null;

  const base =
    process.env.BASE_URL ||
    `http://localhost:${process.env.PORT || 5001}`;

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    developerType: user.developerType || "",
    technologies: user.technologies || [],
    experience: user.experience || 0,
    charges: user.charges || 0,
    photo: user.photo ? `${base}${user.photo}` : null,
  };
};

/* ---------------------------------------------------------
   READ COOKIE TOKEN SAFELY
----------------------------------------------------------*/
const getToken = (req) => {
  if (!req.cookies) return null;
  return req.cookies.token || null;
};

/* ---------------------------------------------------------
   REGISTER
----------------------------------------------------------*/
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: "All fields required" });

    // Password validation
    const passRules = /^(?=.*[A-Z])(?=.*\W).{8,}$/;
    if (!passRules.test(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 8 characters, include one uppercase letter and one special character.",
      });
    }

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists)
      return res.status(400).json({ success: false, message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);

    await User.create({
      name,
      email: email.toLowerCase(),
      password: hashed,
      role: role || "client",
    });

    return res.json({ success: true, message: "Registration successful" });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ---------------------------------------------------------
   LOGIN — fixed cookie config + socket token
----------------------------------------------------------*/
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user)
      return res.status(401).json({ success: false, message: "Invalid email or password" });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ success: false, message: "Invalid email or password" });

    // Create auth token
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });

    // Create socket token (separate secret is recommended)
    const socketToken = jwt.sign({ id: user._id }, SOCKET_SECRET, { expiresIn: "7d" });

    const isProd = process.env.NODE_ENV === "production";

    // Common cookie options
    const commonOpts = {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    };

    // Build options with environment-specific values
    const authCookieOpts = {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "None" : "Lax",
      ...commonOpts,
    };
    const socketCookieOpts = {
      httpOnly: false, // client needs to read this if you rely on js-cookie
      secure: isProd,
      sameSite: isProd ? "None" : "Lax",
      ...commonOpts,
    };

    if (COOKIE_DOMAIN && isProd) {
      authCookieOpts.domain = COOKIE_DOMAIN;
      socketCookieOpts.domain = COOKIE_DOMAIN;
    }

    // Set cookies
    res.cookie("token", token, authCookieOpts);
    // socketToken cookie is intentionally not httpOnly so frontend JS can access it if needed.
    res.cookie("socketToken", socketToken, socketCookieOpts);

    // Respond with user object AND socketToken (frontend can read from body or cookie)
    const formatted = formatUser(user);
    return res.json({
      success: true,
      user: {
        ...formatted,
        socketToken, // optional, convenient for client-side socket connect (but duplicate of cookie)
      },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ---------------------------------------------------------
   /me
----------------------------------------------------------*/
router.get("/me", async (req, res) => {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ success: false });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (!user) return res.status(401).json({ success: false });

    return res.json({ success: true, user: formatUser(user) });
  } catch (err) {
    console.error("ME ERROR:", err);
    return res.status(401).json({ success: false });
  }
});

/* ---------------------------------------------------------
   UPDATE PROFILE
----------------------------------------------------------*/
router.put(
  "/update-profile",
  authMiddleware,
  upload.single("photo"),
  async (req, res) => {
    try {
      const userId = req.user._id;
      let updateData = { ...req.body };

      if (req.file) {
        updateData.photo = `/uploads/${req.file.filename}`;
      }

      if (updateData.password) {
        updateData.password = await bcrypt.hash(updateData.password, 10);
      } else {
        delete updateData.password;
      }

      if (updateData.technologies) {
        try {
          updateData.technologies = JSON.parse(updateData.technologies);
        } catch {
          updateData.technologies = updateData.technologies.split(",").map((x) => x.trim());
        }
      }

      const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
        new: true,
      }).select("-password");

      return res.json({ success: true, user: formatUser(updatedUser) });
    } catch (err) {
      console.error("UPDATE PROFILE ERROR:", err);
      return res.status(500).json({ success: false, message: "Profile update failed" });
    }
  }
);

/* ---------------------------------------------------------
   FORGOT PASSWORD
----------------------------------------------------------*/
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ success: false, message: "User not found" });

    const resetToken = jwt.sign({ id: user._id }, RESET_SECRET, { expiresIn: "15m" });

    const resetLink = `${CLIENT_URL}/reset-password?token=${resetToken}&email=${email}`;

    await resend.emails.send({
      from: `CodeCommunity <${SENDER_EMAIL}>`,
      to: email,
      subject: "Reset Password",
      html: `<p>Hello ${user.name}, click below to reset your password:</p>
             <a href="${resetLink}">Reset Password</a>`,
    });

    return res.json({ success: true, message: "Reset link sent" });
  } catch (err) {
    console.error("FORGOT ERROR:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ---------------------------------------------------------
   RESET PASSWORD
----------------------------------------------------------*/
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    const decoded = jwt.verify(token, RESET_SECRET);
    const hashed = await bcrypt.hash(password, 10);

    await User.findByIdAndUpdate(decoded.id, { password: hashed });

    return res.json({ success: true, message: "Password reset successful" });
  } catch (err) {
    console.error("RESET ERROR:", err);
    return res.status(400).json({ success: false, message: "Invalid or expired token" });
  }
});

/* ---------------------------------------------------------
   LOGOUT
----------------------------------------------------------*/
router.post("/logout", (req, res) => {
  const isProd = process.env.NODE_ENV === "production";

  const common = { path: "/" };

  const authCookieOpts = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "None" : "Lax",
    ...common,
  };

  const socketCookieOpts = {
    httpOnly: false,
    secure: isProd,
    sameSite: isProd ? "None" : "Lax",
    ...common,
  };

  if (COOKIE_DOMAIN && isProd) {
    authCookieOpts.domain = COOKIE_DOMAIN;
    socketCookieOpts.domain = COOKIE_DOMAIN;
  }

  res.clearCookie("token", authCookieOpts);
  res.clearCookie("socketToken", socketCookieOpts);

  return res.json({ success: true });
});

export default router;
