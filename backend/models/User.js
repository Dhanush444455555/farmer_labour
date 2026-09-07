const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true, index: true },
  phone_number: { type: String, required: true, unique: true },
  role: { type: String, default: null },
  name: { type: String, default: '' },
  created_at: { type: Date, default: Date.now }
});

userSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);
