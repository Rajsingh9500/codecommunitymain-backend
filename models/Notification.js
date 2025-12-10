import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    // 👤 The user who receives the notification
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // 📧 (Optional fallback) Store the user's email if needed for quick reference
    userEmail: {
      type: String,
      required: false,
    },

    // 📝 The main message content
    message: {
      type: String,
      required: true,
      trim: true,
    },

    // 📂 Category or type of notification (helps filtering)
    type: {
      type: String,
      enum: [
        "project",       // project updates
        "requirement",   // requirement updates
        "review",        // new reviews
        "system",        // system notifications
        "message",       // chat or direct message
      ],
      default: "system",
    },

    // 🔗 Optional link (for frontend redirection)
    link: {
      type: String,
      default: null,
    },

    // ✅ Read status
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// 🧠 Optional: index for faster user-based query
notificationSchema.index({ user: 1, read: 1 });

export default mongoose.model("Notification", notificationSchema);
  