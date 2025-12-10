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
const RESET_SECRET = process.env.RESET_SECRET;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

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
   REGISTER  (WITH PASSWORD VALIDATION)
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
   LOGIN — FIXED COOKIE CONFIG
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

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });

    const isProd = process.env.NODE_ENV === "production";

    res.cookie("token", token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "None" : "Lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    res.cookie("socketToken", token, {
      httpOnly: false,
      secure: isProd,
      sameSite: isProd ? "None" : "Lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    return res.json({
      success: true,
      user: formatUser(user),
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ---------------------------------------------------------
   /me — FIXED (NO MORE RANDOM 401)
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
    return res.status(400).json({ success: false, message: "Invalid or expired token" });
  }
});

/* ---------------------------------------------------------
   LOGOUT — FIXED
----------------------------------------------------------*/
router.post("/logout", (req, res) => {
  const isProd = process.env.NODE_ENV === "production";

  res.clearCookie("token", {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "None" : "Lax",
    path: "/",
  });

  res.clearCookie("socketToken", {
    httpOnly: false,
    secure: isProd,
    sameSite: isProd ? "None" : "Lax",
    path: "/",
  });

  return res.json({ success: true });
});

export default router;
