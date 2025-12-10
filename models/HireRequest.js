import mongoose from "mongoose";

const hireRequestSchema = new mongoose.Schema(
  {
    clientEmail: { type: String, required: true },
    developerEmail: { type: String, required: true },
    projectTitle: String,
    requirements: String,
    status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
  },
  { timestamps: true }
);

export default mongoose.model("HireRequest", hireRequestSchema);
