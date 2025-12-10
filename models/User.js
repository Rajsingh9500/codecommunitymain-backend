import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },

    email: { type: String, unique: true, required: true },

    role: {
      type: String,
      enum: ["developer", "client", "admin", "superadmin"],
      default: "client",
    },

    technologies: [String],
    experience: Number,
    charges: Number,

    photo: { type: String, default: "" },

    password: { type: String, required: true },

    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },

    // ⭐ NEW FIELD ⭐ — One-sided connect-based chat
    connections: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;
