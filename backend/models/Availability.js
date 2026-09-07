const mongoose = require('mongoose');

const availabilitySchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  available_date: { type: String, required: true }, // Format: YYYY-MM-DD
  status: { type: String, enum: ['available', 'hired'], default: 'available' },
  hired_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  created_at: { type: Date, default: Date.now }
});

availabilitySchema.index({ user_id: 1, available_date: 1 }, { unique: true });

availabilitySchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    return ret;
  }
});

module.exports = mongoose.model('Availability', availabilitySchema);
