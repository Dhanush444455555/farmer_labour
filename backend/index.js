const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
const { connectDb } = require('./db');
const User = require('./models/User');
const Availability = require('./models/Availability');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// OTP store: expires after 5 minutes
const otpCache = new NodeCache({ stdTTL: 300 });

// Connect to MongoDB Atlas
connectDb();

// Auth middleware - uses phone number as uid
const requireAuth = (req, res, next) => {
  const uid = req.headers['x-user-uid'];
  if (!uid) {
    return res.status(401).json({ error: 'Unauthorized: Missing UID header' });
  }
  req.uid = uid;
  next();
};

// Helper: Generate 6-digit OTP
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

// Helper: Send OTP via Fast2SMS
const sendOtpSms = async (phone, otp) => {
  const FAST2SMS_KEY = process.env.FAST2SMS_API_KEY;
  if (!FAST2SMS_KEY) {
    // Dev mode: just log the OTP
    console.log(`[DEV MODE] OTP for ${phone}: ${otp}`);
    return true;
  }
  try {
    const response = await axios.post(
      'https://www.fast2sms.com/dev/bulkV2',
      {
        route: 'otp',
        variables_values: otp,
        numbers: phone,
      },
      {
        headers: {
          authorization: FAST2SMS_KEY,
          'Content-Type': 'application/json',
        }
      }
    );
    return response.data.return === true;
  } catch (err) {
    console.error('Fast2SMS error:', err.response?.data || err.message);
    return false;
  }
};

// --- OTP ENDPOINTS ---

// Send OTP
app.post('/api/auth/send-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.length < 10) {
    return res.status(400).json({ error: 'Valid phone number required' });
  }
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  const otp = generateOtp();
  otpCache.set(cleanPhone, otp);

  const sent = await sendOtpSms(cleanPhone, otp);
  if (!sent && process.env.FAST2SMS_API_KEY) {
    return res.status(500).json({ error: 'Failed to send OTP. Try again.' });
  }

  res.json({ success: true, message: 'OTP sent successfully' });
});

// Verify OTP
app.post('/api/auth/verify-otp', async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) {
    return res.status(400).json({ error: 'Phone and OTP required' });
  }
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  const storedOtp = otpCache.get(cleanPhone);

  if (!storedOtp || storedOtp !== otp) {
    return res.status(401).json({ error: 'Invalid or expired OTP' });
  }

  // OTP valid — delete it so it can't be reused
  otpCache.del(cleanPhone);

  try {
    let user = await User.findOne({ uid: cleanPhone });
    if (!user) {
      user = await User.create({ uid: cleanPhone, phone_number: cleanPhone });
    }
    res.json(user);
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check if phone number exists in database
app.post('/api/auth/check-number', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  try {
    const user = await User.findOne({
      $or: [{ uid: cleanPhone }, { phone_number: cleanPhone }]
    });
    res.json({ exists: !!user, name: user?.name || null, role: user?.role || null });
  } catch (err) {
    console.error('Check number error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login: Only succeeds if the phone number already exists
app.post('/api/auth/login', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  try {
    const user = await User.findOne({
      $or: [{ uid: cleanPhone }, { phone_number: cleanPhone }]
    });
    if (!user) {
      return res.status(404).json({ 
        error: 'Phone number not registered. Please create an account first.',
        notRegistered: true 
      });
    }
    res.json(user);
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register: Create new user account
app.post('/api/auth/register', async (req, res) => {
  const { phone, name, role } = req.body;
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'Valid 10-digit phone number required' });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Full name is required' });
  }
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  try {
    const existing = await User.findOne({
      $or: [{ uid: cleanPhone }, { phone_number: cleanPhone }]
    });
    if (existing) {
      return res.status(409).json({ error: 'This phone number is already registered. Please log in.' });
    }
    const newUser = await User.create({
      uid: cleanPhone,
      phone_number: cleanPhone,
      name: name.trim(),
      role: role || 'laborer'
    });
    res.json(newUser);
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Set User Role and Name
app.put('/api/users/profile', requireAuth, async (req, res) => {
  const { role, name } = req.body;
  try {
    const user = await User.findOneAndUpdate(
      { uid: req.uid },
      { role, name },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper: Local date strings YYYY-MM-DD
const getLocalDateStr = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 3. Laborer: Set Availability for Tomorrow
app.post('/api/availability', requireAuth, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.uid });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const dateStr = getLocalDateStr(1);

    const avail = await Availability.findOneAndUpdate(
      { user_id: user._id, available_date: dateStr },
      { status: 'available', hired_by: null },
      { upsert: true, new: true }
    );
    res.json(avail);
  } catch (err) {
    console.error('Set availability error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3a. Laborer: Get Availability Status for Tomorrow
app.get('/api/availability', requireAuth, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.uid });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Check for any active availability
    const record = await Availability.findOne({ 
      user_id: user._id, 
      status: { $in: ['available', 'hired'] } 
    }).sort({ created_at: -1 });

    if (record) {
      res.json(record);
    } else {
      res.json({ status: 'none' });
    }
  } catch (err) {
    console.error('Get availability error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3b. Laborer: Cancel Availability for Tomorrow
app.delete('/api/availability', requireAuth, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.uid });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await Availability.deleteMany({ user_id: user._id });
    res.json({ success: true });
  } catch (err) {
    console.error('Cancel availability error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. Farm Owner: Get Available Laborers for Tomorrow
app.get('/api/laborers', requireAuth, async (req, res) => {
  try {
    const owner = await User.findOne({ uid: req.uid });

    // Fetch all currently available laborers
    const availabilities = await Availability.find({
      status: 'available'
    }).populate({
      path: 'user_id',
      select: 'name phone_number role'
    });

    const result = availabilities
      .filter(a => {
        if (!a.user_id) return false;
        // Exclude the currently logged in owner from seeing themselves
        if (owner && a.user_id._id.toString() === owner._id.toString()) return false;
        return true;
      })
      .map(a => ({
        id: a.user_id._id.toString(),
        name: a.user_id.name || 'Available Laborer',
        phone_number: a.user_id.phone_number,
        available_date: a.available_date
      }));

    res.json(result);
  } catch (err) {
    console.error('Get available laborers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 5. Farm Owner: Hire a Laborer
app.post('/api/laborers/:id/hire', requireAuth, async (req, res) => {
  const laborerId = req.params.id;
  try {
    const owner = await User.findOne({ uid: req.uid });
    if (!owner) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updated = await Availability.findOneAndUpdate(
      { user_id: laborerId, status: 'available' },
      { status: 'hired', hired_by: owner._id },
      { new: true }
    );

    if (!updated) {
      return res.status(400).json({ error: 'Laborer no longer available or not found' });
    }

    res.json(updated);
  } catch (err) {
    console.error('Hire laborer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 6. Farm Owner: Get Hired Laborers for Tomorrow
app.get('/api/laborers/hired', requireAuth, async (req, res) => {
  try {
    const owner = await User.findOne({ uid: req.uid });
    if (!owner) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hiredAvailabilities = await Availability.find({
      hired_by: owner._id,
      status: 'hired'
    }).populate('user_id', 'name phone_number');

    const result = hiredAvailabilities
      .filter(a => a.user_id)
      .map(a => ({
        id: a.user_id._id.toString(),
        name: a.user_id.name || 'Laborer',
        phone_number: a.user_id.phone_number,
        available_date: a.available_date
      }));

    res.json(result);
  } catch (err) {
    console.error('Get hired laborers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
