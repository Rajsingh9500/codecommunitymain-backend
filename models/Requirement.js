import mongoose from "mongoose";


const requirementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    charges: {
      type: Number,
      required: true,
      min: 0,
    },
    deadline: {
      type: Date,
      default: null, // ✅ Optional deadline
    },

    // 🔗 Relations
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    developer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // ✅ Default null when not yet assigned
    },

    // 🔖 Status
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);
export default mongoose.model("Requirement", requirementSchema);
