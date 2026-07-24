import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uriFromEnv = process.env.MONGODB_URI;

async function testConnection(uri, label) {
  console.log(`\n🔍 Testing connection for: ${label}...`);
  try {
    // Mask password in logs
    const maskedUri = uri.replace(/:([^@:]+)@/, ':***@');
    console.log('URI (masked):', maskedUri);

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log('✅ Connected! Host:', mongoose.connection.host);
    console.log('✅ Database:', mongoose.connection.name);
    
    // List collections to verify data access
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('📁 Collections:', collections.map(c => c.name));
    
    await mongoose.disconnect();
    console.log('👋 Disconnected successfully');
    return true;
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    return false;
  }
}

async function run() {
  // 1. Test URI from .env
  if (uriFromEnv) {
    const ok = await testConnection(uriFromEnv, 'MONGODB_URI from .env');
    if (ok) process.exit(0);
  } else {
    console.log('⚠️ No MONGODB_URI found in .env');
  }

  // 2. Test password 'code@rajsingh2003'
  const pw1 = encodeURIComponent('code@rajsingh2003');
  const uri1 = `mongodb://Rajsingh:${pw1}@ac-czf35th-shard-00-00.zvklfco.mongodb.net:27017/CodeCommunity?ssl=true&authSource=admin`;
  await testConnection(uri1, "password 'code@rajsingh2003'");

  // 3. Test old password '2003'
  const uri2 = `mongodb://Rajsingh:2003@ac-czf35th-shard-00-00.zvklfco.mongodb.net:27017/CodeCommunity?ssl=true&authSource=admin`;
  await testConnection(uri2, "old password '2003'");

  // 4. Test password 'rajsinghcodecommunity2025' but URL-encoded in case it has special chars
  const pw3 = encodeURIComponent('rajsinghcodecommunity2025');
  const uri3 = `mongodb://Rajsingh:${pw3}@ac-czf35th-shard-00-00.zvklfco.mongodb.net:27017/CodeCommunity?ssl=true&authSource=admin`;
  await testConnection(uri3, "encoded password 'rajsinghcodecommunity2025'");

  // 5. Test standard SRV connection string (often used in Mongo Atlas)
  const uri4 = `mongodb+srv://Rajsingh:${pw1}@ac-czf35th-shard-00-00.zvklfco.mongodb.net/CodeCommunity?retryWrites=true&w=majority&appName=Cluster0`;
  await testConnection(uri4, "mongodb+srv SRV string with password 'code@rajsingh2003'");

  process.exit(0);
}

run();
