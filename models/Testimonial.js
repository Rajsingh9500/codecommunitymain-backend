import mongoose from "mongoose";

const TestimonialSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    feedback: { type: String, required: true },
    image: { type: String, default: "/uploads/user.png" },
  },
  { timestamps: true }
);

export default mongoose.model("Testimonial", TestimonialSchema);
