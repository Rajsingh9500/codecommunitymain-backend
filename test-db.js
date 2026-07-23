import mongoose from 'mongoose';

// Test 1: Direct connection to single node (simplest)
const password = encodeURIComponent('code@rajsingh2003');
const uri = `mongodb://Rajsingh:${password}@ac-czf35th-shard-00-00.zvklfco.mongodb.net:27017/CodeCommunity?ssl=true&authSource=admin`;

console.log('🔍 Testing MongoDB connection...');
console.log('URI (masked):', uri.replace(password, '***'));

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log('✅ Connected! Host:', mongoose.connection.host);
  console.log('✅ Database:', mongoose.connection.name);
  
  // List collections to verify data
  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log('📁 Collections:', collections.map(c => c.name));
  
  await mongoose.disconnect();
  console.log('👋 Disconnected');
} catch (err) {
  console.error('❌ Error:', err.message);
  
  // Try with password "2003" (old password from Render)
  console.log('\n🔍 Trying with old password "2003"...');
  try {
    const uri2 = `mongodb://Rajsingh:2003@ac-czf35th-shard-00-00.zvklfco.mongodb.net:27017/CodeCommunity?ssl=true&authSource=admin`;
    await mongoose.connect(uri2, { serverSelectionTimeoutMS: 15000 });
    console.log('✅ Connected with old password! Host:', mongoose.connection.host);
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('📁 Collections:', collections.map(c => c.name));
    await mongoose.disconnect();
  } catch (err2) {
    console.error('❌ Old password also failed:', err2.message);
  }
}

process.exit(0);
