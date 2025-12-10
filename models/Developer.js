import mongoose from "mongoose";
const router = express.Router();

const DeveloperSchema = new mongoose.Schema({
  name: { type: String, required: true },
  skills: { type: [String], default: [] },
  bio: { type: String },
  experience: { type: Number, default: 0 },
  portfolio: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Developer", DeveloperSchema);
