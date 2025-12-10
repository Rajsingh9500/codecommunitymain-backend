import mongoose from "mongoose";

const hireSchema = new mongoose.Schema({
  clientEmail: { type: String, required: true },
  developerEmail: { type: String, required: true },
  projectTitle: { type: String, required: true },
  description: { type: String, required: true },
  requirements: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
}, { timestamps: true });

export default mongoose.model("Hire", hireSchema);
