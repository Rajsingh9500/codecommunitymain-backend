import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGO = process.env.MONGODB_URI;

function extractId(value) {
  if (!value) return null;

  // If string and valid
  if (typeof value === "string" && mongoose.Types.ObjectId.isValid(value)) {
    return value;
  }

  // { _id: { $oid: "..." } }
  if (value._id?.$oid) return value._id.$oid;

  // { $oid: "..." }
  if (value.$oid) return value.$oid;

  // { _id: "..." }
  if (value._id && typeof value._id === "string") return value._id;

  return null;
}

async function fixRaw() {
  const conn = await mongoose.connect(MONGO);
  console.log("Connected to MongoDB (RAW MODE)");

  const db = conn.connection.db;
  const projects = db.collection("projects");

  const docs = await projects.find({}).toArray();
  console.log(`Found ${docs.length} projects`);

  for (const p of docs) {
    let update = {};

    // Fix client
    if (p.client && typeof p.client === "object") {
      const id = extractId(p.client);
      if (id) {
        update.client = new mongoose.Types.ObjectId(id);
      }
    }

    // Fix developer
    if (p.developer && typeof p.developer === "object") {
      const id = extractId(p.developer);
      if (id) {
        update.developer = new mongoose.Types.ObjectId(id);
      }
    }

    // Fix requirements
    if (Array.isArray(p.requirements)) {
      update.requirements = p.requirements.map((r) => {
        const id = extractId(r);
        return new mongoose.Types.ObjectId(id);
      });
    }

    if (Object.keys(update).length > 0) {
      await projects.updateOne(
        { _id: p._id },
        { $set: update }
      );
      console.log("✔ RAW fixed:", p._id.toString());
    } else {
      console.log("— No changes needed:", p._id.toString());
    }
  }

  console.log("✨ RAW migration complete.");
  process.exit();
}

fixRaw();
