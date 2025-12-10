// server.js — Production-ready Express + Socket.IO server (FULLY FIXED)

import express from "express";
import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";
import xss from "xss-clean";
import cookie from "cookie";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

import { Server as SocketIOServer } from "socket.io";

import User from "./models/User.js";
import Message from "./models/Message.js";

/* -------------------- paths & env -------------------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 5001);
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

/* Allowed Origins (fixed) */
let allowedOrigins = (process.env.ALLOWED_ORIGINS || CLIENT_URL)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Ensure localhost always allowed
["http://localhost:3000", "http://127.0.0.1:3000"].forEach((o) => {
  if (!allowedOrigins.includes(o)) allowedOrigins.push(o);
});

/* -------------------- express setup -------------------- */
const app = express();
app.set("trust proxy", 1);

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
  })
);

/* -------------------- FIXED CORS -------------------- */
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);

      console.log("❌ BLOCKED ORIGIN:", origin);
      return callback(new Error("CORS Not Allowed"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

app.use(compression());
app.use(
  morgan(process.env.NODE_ENV === "production" ? "combined" : "dev", {
    skip: (req) => req.url === "/favicon.ico",
  })
);
app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(xss());

/* -------------------- rate limiting -------------------- */
const apiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", apiLimiter);

/* -------------------- static uploads -------------------- */
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use("/uploads", express.static(uploadDir, { maxAge: "1d" }));

/* -------------------- DB connect -------------------- */
if (!MONGO_URI) {
  console.error("❌ MONGO_URI not configured. Aborting.");
  process.exit(1);
}
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message || err);
    process.exit(1);
  });

/* -------------------- ensure superadmin -------------------- */
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || "").toLowerCase();
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "";

async function ensureSuperAdmin() {
  if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) return;
  try {
    const existing = await User.findOne({ email: SUPER_ADMIN_EMAIL });
    if (!existing) {
      const hashed = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);
      await User.create({
        name: "Super Admin",
        email: SUPER_ADMIN_EMAIL,
        password: hashed,
        role: "superadmin",
      });
      console.log("🦸 SuperAdmin created");
    } else if (existing.role !== "superadmin") {
      existing.role = "superadmin";
      await existing.save();
      console.log("🦸 SuperAdmin upgraded");
    }
  } catch (e) {
    console.warn("ensureSuperAdmin error:", e.message || e);
  }
}

/* -------------------- routes -------------------- */
import authRoute from "./routes/auth.js";
import projectsRoute from "./routes/projects.js";
import hireRoute from "./routes/hire.js";
import notificationRoute from "./routes/notification.js";
import developersRoute from "./routes/developers.js";
import adminRoute from "./routes/admin.js";
import reviewsRoute from "./routes/reviews.js";
import chatRoute from "./routes/chat.js";
import requirementsRoute from "./routes/requirements.js";
import statsRoute from "./routes/stats.js";
import testimonialsRoute from "./routes/testimonials.js";
import usersRoute from "./routes/users.js";
import connectionsRoute from "./routes/connections.js";

app.use("/api/auth", authRoute);
app.use("/api/projects", projectsRoute);
app.use("/api/hire", hireRoute);
app.use("/api/notifications", notificationRoute);
app.use("/api/developers", developersRoute);
app.use("/api/admin", adminRoute);
app.use("/api/reviews", reviewsRoute);
app.use("/api/chat", chatRoute);
app.use("/api/requirements", requirementsRoute);
app.use("/api/stats", statsRoute);
app.use("/api/testimonials", testimonialsRoute);
app.use("/api/users", usersRoute);
app.use("/api/connections", connectionsRoute);

/* health check */
app.get("/", (req, res) => res.json({ success: true, message: "API running" }));

/* -------------------- HTTP(S) server -------------------- */
let server;
if (process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH) {
  const key = fs.readFileSync(process.env.SSL_KEY_PATH, "utf8");
  const cert = fs.readFileSync(process.env.SSL_CERT_PATH, "utf8");
  server = https.createServer({ key, cert }, app);
  console.log("🔐 HTTPS enabled");
} else {
  server = http.createServer(app);
}

/* -------------------- Socket.IO FIX -------------------- */
const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
  transports: ["websocket", "polling"],
  path: "/socket.io",
  allowUpgrades: true,
  pingInterval: 25000,
  pingTimeout: 60000,
});

app.set("io", io);

/* Track Online Users */
const onlineUsers = new Map();

/* Socket authentication */
io.use(async (socket, next) => {
  try {
    let token = socket.handshake.auth?.token;

    if (!token) {
      const cookieHeader = socket.handshake.headers?.cookie;
      if (cookieHeader) {
        const parsed = cookie.parse(cookieHeader);
        token = parsed.socketToken || parsed.token;
      }
    }

    if (!token) return next(new Error("No socket token"));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (!user) return next(new Error("User not found"));

    socket.user = user;
    socket.join(user._id.toString());

    next();
  } catch (err) {
    next(new Error("Invalid socket token"));
  }
});

/* Socket events */
io.on("connection", (socket) => {
  const user = socket.user;
  if (!user) return socket.disconnect(true);

  const userId = user._id.toString();

  onlineUsers.set(userId, socket.id);
  io.emit("userOnline", userId);

  console.log(`⚡ ${user.name} connected (${socket.id})`);

  /* Send Message */
  socket.on("sendMessage", async ({ to, message, tempId }) => {
    try {
      const newMsg = await Message.create({
        sender: userId,
        receiver: to,
        message,
      });

      const saved = await Message.findById(newMsg._id)
        .populate("sender", "name _id")
        .populate("receiver", "name _id")
        .lean();

      io.to(to).emit("receiveMessage", saved);
      io.to(userId).emit("receiveMessage", { ...saved, tempId });
    } catch (err) {
      console.error("sendMessage error:", err);
    }
  });

  socket.on("disconnect", () => {
    onlineUsers.delete(userId);
    io.emit("userOffline", userId);
    console.log(`❌ ${user.name} disconnected`);
  });
});

/* -------------------- error handlers -------------------- */
app.use((req, res) => {
  res.status(404).json({ success: false, message: "API route not found" });
});

app.use((err, req, res, next) => {
  console.error("Internal error:", err.message || err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
});

/* -------------------- graceful shutdown -------------------- */
const shutdown = async (signal) => {
  console.log(`\n⏹ Received ${signal}. Shutting down gracefully...`);

  try {
    if (io) io.close();
    await new Promise((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
    await mongoose.connection.close(false);
    process.exit(0);
  } catch (err) {
    console.error("Shutdown error:", err);
    process.exit(1);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

/* -------------------- start server -------------------- */
(async () => {
  await ensureSuperAdmin();
  server.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
    console.log("🌐 Allowed origins:", allowedOrigins.join(", "));
  });
})();
