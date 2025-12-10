import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    developer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // ✅ null = general (CodeCommunity) review
    },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    comment: {
      type: String,
      trim: true,
      required: true,
    },
  },
  { timestamps: true }
);

// Optional: add indexes for faster lookups
reviewSchema.index({ developer: 1 });
reviewSchema.index({ rating: -1 });

export default mongoose.model("Review", reviewSchema);
