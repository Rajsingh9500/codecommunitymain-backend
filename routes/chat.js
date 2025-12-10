import express from "express";
import User from "../models/User.js";
import Message from "../models/Message.js";
import authMiddleware from "../middleware/authMiddleware.js";
const router = express.Router();

/**
 * ✅ Get all chat users for the sidebar
 * - Developers ↔ Clients ↔ Developers (everyone except self & admin)
 * - Admin can see all
 *//**
 * ✅ Get chat users (ONLY connected users)
 * - User sees ONLY people they connected with
 * - Admin sees all users except self
 */
router.get("/users", authMiddleware, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id)
      .select("connections role");

    const userRole = (currentUser.role || "").toLowerCase();

    let allowedUserIds = [];

    if (userRole === "admin") {
      // Admin → see all except self
      const all = await User.find({ _id: { $ne: currentUser._id } })
        .select("_id");
      allowedUserIds = all.map((u) => u._id);
    } else {
      // Normal user → only connected users
      allowedUserIds = currentUser.connections || [];
    }

    if (!allowedUserIds.length) {
      return res.status(200).json([]); // return empty chat list
    }

    const users = await User.aggregate([
      {
        $match: {
          _id: { $in: allowedUserIds },
        },
      },

      // Last message
      {
        $lookup: {
          from: "messages",
          let: { uid: "$_id", me: req.user._id },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $and: [{ $eq: ["$sender", "$$me"] }, { $eq: ["$receiver", "$$uid"] }] },
                    { $and: [{ $eq: ["$sender", "$$uid"] }, { $eq: ["$receiver", "$$me"] }] },
                  ],
                },
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
          ],
          as: "lastMessage",
        },
      },

      // Unread count
      {
        $lookup: {
          from: "messages",
          let: { uid: "$_id", me: req.user._id },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$sender", "$$uid"] },
                    { $eq: ["$receiver", "$$me"] },
                    { $eq: ["$read", false] },
                  ],
                },
              },
            },
            { $count: "count" },
          ],
          as: "unread",
        },
      },

      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          role: 1,
          lastMessage: { $arrayElemAt: ["$lastMessage.message", 0] },
          lastMessageTime: { $arrayElemAt: ["$lastMessage.createdAt", 0] },
          unreadCount: { $ifNull: [{ $arrayElemAt: ["$unread.count", 0] }, 0] },
        },
      },

      { $sort: { lastMessageTime: -1 } },
    ]);

    res.status(200).json(users);
  } catch (err) {
    console.error("❌ Chat users fetch error:", err);
    res.status(500).json({ error: "Server error while fetching users" });
  }
});

router.get("/messages/:receiverId", authMiddleware, async (req, res) => {
  
  try {
    const currentUser = req.user._id.toString();
    const receiverId = req.params.receiverId;

    const messages = await Message.find({
      $or: [
        { sender: currentUser, receiver: receiverId },
        { sender: receiverId, receiver: currentUser },
      ],
    })
      .sort({ createdAt: 1 })
      .populate("sender", "name _id")
      .populate("receiver", "name _id")
      .lean();


    const formatted = messages.map((msg) => ({
      _id: msg._id,
      sender: msg.sender,
      receiver: msg.receiver,
      message: msg.message,
      createdAt: msg.createdAt, // <<< FIX
      read: msg.read || false,
      delivered: msg.delivered || false,
    }));

    res.status(200).json(formatted);
  } catch (err) {
    console.error("❌ Fetch messages error:", err.message);
    res.status(500).json({ error: "Error fetching messages" });
  }
});



export default router;
