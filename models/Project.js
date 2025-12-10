import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    // 🏷️ Project title
    title: { type: String, required: true },

    // 📊 Project status lifecycle
    status: {
      type: String,
      enum: ["pending", "in-progress", "completed", "cancelled"],
      default: "in-progress",
    },

    // 👥 Relations
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // 🛠 FIX: Developer is optional (assigned after accepting requirement)
    developer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // 📅 Optional project deadline
    deadline: { type: Date },

    // Multiple requirements supported
    requirements: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Requirement",
      },
    ],

    // Link to hire request (optional)
    hireRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hire",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Project", projectSchema);
