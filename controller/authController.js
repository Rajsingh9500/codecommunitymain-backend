import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendEmail } from "../utils/sendEmail.js";

/* ============================================================
   ONLY PASSWORD RESET CONTROLLERS SHOULD BE HERE
============================================================ */

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ success: false, message: "User not found" });

    const resetToken = jwt.sign(
      { _id: user._id, email: user.email },
      process.env.RESET_SECRET,
      { expiresIn: "15m" }
    );

    const resetLink = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}&email=${user.email}`;

    await sendEmail(
      user.email,
      "Reset Your Password - CodeCommunity",
      `<p>Click to reset: <a href="${resetLink}">Reset Password</a></p>`
    );

    return res.json({
      success: true,
      message: "Password reset link sent to your email.",
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token, password, email } = req.body;

    if (!token || !password || !email)
      return res.status(400).json({ success: false, message: "Missing fields" });

    const decoded = jwt.verify(token, process.env.RESET_SECRET);

    if (decoded.email !== email)
      return res.status(400).json({ success: false, message: "Email mismatch" });

    const hashed = await bcrypt.hash(password, 10);

    await User.findOneAndUpdate(
      { _id: decoded._id, email: decoded.email },
      { password: hashed }
    );

    return res.json({ success: true, message: "Password reset successful" });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(400).json({ success: false, message: "Invalid or expired token" });
  }
};
