const mongoose = require('mongoose');
require('dotenv').config();

let isConnected = false;

const connectDb = async () => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    console.warn('\n⚠️  [MongoDB Atlas] WARNING: MONGODB_URI is not defined in your .env file!');
    console.warn('👉 Please set MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<dbname> in backend/.env\n');
    return;
  }

  const tryConnect = async () => {
    try {
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 5000,
      });
      isConnected = true;
      console.log('✅ Connected to MongoDB Atlas successfully!');
    } catch (err) {
      console.error('⏳ Waiting for MongoDB Atlas connection (Check Network Access / IP Whitelist):', err.message);
      // Auto-retry after 5 seconds
      setTimeout(tryConnect, 5000);
    }
  };

  tryConnect();
};

module.exports = {
  connectDb,
  mongoose
};
