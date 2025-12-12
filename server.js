// server.js — COMPLETE production-ready Express + Socket.IO server (FINAL)
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

/* -------------------- helper: detect vercel origin -------------------- */
function isVercelOrigin(origin) {
  return !!origin && origin.endsWith(".vercel.app");
}

/* -------------------- allowed local origins -------------------- */
const allowedLocalOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];

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

// CORS: allow localhost and any .vercel.app origin
app.use(
  cors({
    origin(origin, callback) {
      // allow non-browser requests (no origin)
      if (!origin) return callback(null, true);
      if (isVercelOrigin(origin)) return callback(null, true);
      if (allowedLocalOrigins.includes(origin)) return callback(null, true);

      console.warn("❌ BLOCKED ORIGIN:", origin);
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

/* -------------------- uploads folder -------------------- */
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use("/uploads", express.static(uploadDir, { maxAge: "1d" }));

/* -------------------- db connect -------------------- */
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

/* -------------------- routes (import your route modules) -------------------- */
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

/* -------------------- create HTTP(S) server -------------------- */
let server;
if (process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH) {
  const key = fs.readFileSync(process.env.SSL_KEY_PATH, "utf8");
  const cert = fs.readFileSync(process.env.SSL_CERT_PATH, "utf8");
  server = https.createServer({ key, cert }, app);
  console.log("🔐 HTTPS enabled");
} else {
  server = http.createServer(app);
}

/* -------------------- Socket.IO setup -------------------- */
const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (isVercelOrigin(origin)) return callback(null, true);
      if (allowedLocalOrigins.includes(origin)) return callback(null, true);
      console.warn("❌ SOCKET BLOCKED ORIGIN:", origin);
      return callback(new Error("Socket CORS Not Allowed"));
    },
    credentials: true,
  },
  transports: ["websocket", "polling"],
  path: "/socket.io",
  pingInterval: 25000,
  pingTimeout: 60000,
});
app.set("io", io);

/* -------------------- online user tracking -------------------- */
const onlineUsers = new Map();

/* -------------------- socket auth middleware -------------------- */
const SOCKET_SECRET = process.env.SOCKET_SECRET || process.env.JWT_SECRET;

io.use(async (socket, next) => {
  try {
    // token via handshake.auth or cookie header
    let token = socket.handshake.auth?.token;
    if (!token) {
      const cookieHeader = socket.handshake.headers?.cookie;
      if (cookieHeader) {
        const parsed = cookie.parse(cookieHeader || "");
        token = parsed.socketToken || parsed.token || null;
      }
    }

    if (!token) return next(new Error("No socket token"));

    // try verify with SOCKET_SECRET then fallback to JWT_SECRET
    let decoded;
    try {
      decoded = jwt.verify(token, SOCKET_SECRET);
    } catch (err) {
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (e) {
        return next(new Error("Invalid socket token"));
      }
    }

    const user = await User.findById(decoded.id).select("-password");
    if (!user) return next(new Error("User not found"));

    socket.user = user;
    socket.join(user._id.toString());
    next();
  } catch (err) {
    console.error("Socket auth error:", err.message || err);
    next(new Error("Socket auth failed"));
  }
});

/* -------------------- socket event handlers -------------------- */
io.on("connection", (socket) => {
  const user = socket.user;
  if (!user) {
    socket.disconnect(true);
    return;
  }

  const userId = user._id.toString();
  onlineUsers.set(userId, socket.id);
  io.emit("userOnline", userId);
  console.log(`⚡ ${user.name} connected (${socket.id})`);

  /* sendMessage handler (example) */
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

      // send to receiver and sender
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

/* -------------------- error handlers & 404 -------------------- */
app.use((req, res) => {
  res.status(404).json({ success: false, message: "API route not found" });
});

app.use((err, req, res, next) => {
  console.error("Internal error:", err.message || err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
  });
});

/* -------------------- graceful shutdown -------------------- */
const shutdown = async (signal) => {
  console.log(`\n⏹ Received ${signal}. Shutting down gracefully...`);

  try {
    if (io) {
      console.log("Closing socket.io...");
      io.close();
    }

    await new Promise((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );

    await mongoose.connection.close(false);
    console.log("Shutdown complete.");
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
    console.log("🌐 Allowed origins: localhost + any *.vercel.app");
    console.log("🔒 COOKIE_DOMAIN (recommended): .vercel.app");
  });
})();
