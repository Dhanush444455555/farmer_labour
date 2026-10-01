const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const { initDb, query, run, get, logAuditAction } = require('./db');
require('dotenv').config();
const nodemailer = require('nodemailer');
const { runJobPostingAgentTurn } = require('./agent/jobPostingGraph');
const { runJobSearchAgent } = require('./agent/jobSearchGraph');
const { initChromaCollection } = require('./agent/chromaLabourRights');
const { runAdminQueryAgent } = require('./agent/adminQueryGraph');
const agentRouter = require('./routes/agent');

const app = express();

// Security Middlewares
app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// Python agent-service proxy (must come before the apiLimiter so it gets its own timeout)
app.use('/api/agent', agentRouter);

// Basic Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Initialize Database & Knowledge Collections
initDb();
initChromaCollection().catch(() => {});

// Auth Middleware
const requireAuth = async (req, res, next) => {
  const uid = req.headers['x-user-uid'];
  if (!uid) {
    return res.status(401).json({ error: 'Unauthorized: Missing UID header' });
  }
  
  try {
    const user = await get('SELECT * FROM users WHERE uid = ?', [uid]);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }
    if (user.status === 'BLOCKED' || user.status === 'SUSPENDED') {
      return res.status(403).json({ error: `Account is ${user.status.toLowerCase()}` });
    }
    req.uid = uid;
    req.user = user;
    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Admin Middleware
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'owner') {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
};

// Socket.IO Room Management
const activeUsers = new Map();

io.on('connection', (socket) => {
  console.log('[Socket.IO] Client connected:', socket.id);

  socket.on('join-room', (uid) => {
    if (uid) {
      const cleanUid = String(uid);
      socket.join(`user_${cleanUid}`);
      socket.join(`hirer_${cleanUid}`);
      activeUsers.set(socket.id, cleanUid);
      console.log(`[Socket.IO] Socket ${socket.id} joined user_${cleanUid} & hirer_${cleanUid}`);
    }
  });

  socket.on('disconnect', () => {
    activeUsers.delete(socket.id);
    console.log('[Socket.IO] Client disconnected:', socket.id);
  });
});

// --- Helper Functions ---
const createNotificationHelper = async (userId, type, title, message, relatedJobId = null, relatedBookingId = null) => {
  try {
    const res = await run(
      `INSERT INTO notifications (user_id, type, title, message, related_job_id, related_booking_id, is_read)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [String(userId), type, title, message, relatedJobId, relatedBookingId]
    );
    const notif = await get('SELECT * FROM notifications WHERE id = ?', [res.lastID]);
    io.to(`user_${userId}`).emit('notification-created', notif);
    return notif;
  } catch (err) {
    console.error('Error creating notification:', err);
  }
};

// ==========================================
// 1. AUTHENTICATION & USER PROFILE APIS
// ==========================================

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ error: 'Please enter a valid 10-digit Indian phone number' });
    }

    let userRecord = await get('SELECT * FROM users WHERE uid = ? OR phone_number = ?', [cleanPhone, cleanPhone]);
    if (!userRecord) {
      await run('INSERT INTO users (uid, phone_number) VALUES (?, ?)', [cleanPhone, cleanPhone]);
      userRecord = await get('SELECT * FROM users WHERE uid = ?', [cleanPhone]);
    }

    if (userRecord.status === 'BLOCKED' || userRecord.status === 'SUSPENDED') {
      return res.status(403).json({ error: `Account is ${userRecord.status.toLowerCase()}` });
    }

    await run('INSERT INTO login_activity (user_id, success) VALUES (?, ?)', [userRecord.uid, 1]);

    res.json(userRecord);
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper for verifying password
const verifyPassword = (password, hash, salt) => {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(hash === derivedKey.toString('hex'));
    });
  });
};

// POST /api/auth/admin-login
app.post('/api/auth/admin-login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone number and password are required' });
    }

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ error: 'Please enter a valid 10-digit phone number' });
    }

    const userRecord = await get('SELECT * FROM users WHERE phone_number = ?', [cleanPhone]);
    if (!userRecord) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (userRecord.role !== 'owner') {
      return res.status(403).json({ error: 'Unauthorized: Admin access only' });
    }

    if (userRecord.status === 'BLOCKED' || userRecord.status === 'SUSPENDED') {
      return res.status(403).json({ error: `Account is ${userRecord.status.toLowerCase()}` });
    }

    if (!userRecord.password_hash || !userRecord.password_salt) {
      return res.status(401).json({ error: 'Account not set up for admin login' });
    }

    const isValid = await verifyPassword(password, userRecord.password_hash, userRecord.password_salt);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Record login activity
    await run('INSERT INTO login_activity (user_id, success) VALUES (?, ?)', [userRecord.uid, 1]);

    // Omit sensitive data before returning
    delete userRecord.password_hash;
    delete userRecord.password_salt;

    res.json(userRecord);
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/users/profile
app.put('/api/users/profile', requireAuth, async (req, res) => {
  try {
    const { name, role, location, experience, expected_wage, skills, gender, email } = req.body;
    
    let skillsJson = skills;
    if (Array.isArray(skills)) {
      skillsJson = JSON.stringify(skills);
    }

    await run(
      `UPDATE users 
       SET name = COALESCE(?, name), 
           role = COALESCE(?, role), 
           location = COALESCE(?, location), 
           experience = COALESCE(?, experience), 
           expected_wage = COALESCE(?, expected_wage), 
           skills = COALESCE(?, skills),
           gender = COALESCE(?, gender),
           email = COALESCE(?, email),
           updated_at = CURRENT_TIMESTAMP
       WHERE uid = ?`,
      [name, role, location, experience, expected_wage, skillsJson, gender, email, req.uid]
    );

    const updatedUser = await get('SELECT * FROM users WHERE uid = ?', [req.uid]);
    res.json(updatedUser);
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/send-verification
app.post('/api/auth/send-verification', requireAuth, async (req, res) => {
  try {
    const user = await get('SELECT * FROM users WHERE uid = ?', [req.uid]);
    if (!user || !user.email) {
      return res.status(400).json({ error: 'User not found or no email associated' });
    }
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await run('UPDATE users SET email_verification_token = ? WHERE uid = ?', [otp, req.uid]);
    
    // For development, log to console
    console.log('\\n--- EMAIL VERIFICATION ---');
    console.log(`To verify ${user.email}, your OTP is: ${otp}`);
    console.log('--------------------------\\n');
    
    // Attempt to send if SMTP is configured
    if (process.env.SMTP_HOST) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      await transporter.sendMail({
        from: '"FarmConnect Support" <support@farmconnect.com>',
        to: user.email,
        subject: 'Verify your FarmConnect Email',
        text: `Please verify your email using this OTP: ${otp}`
      });
    }
    
    res.json({ message: 'Verification email sent' });
  } catch (err) {
    console.error('Send verification error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/verify-email
app.post('/api/auth/verify-email', requireAuth, async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ error: 'OTP is required' });
    
    const user = await get('SELECT * FROM users WHERE uid = ?', [req.uid]);
    if (!user || user.email_verification_token !== otp) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }
    
    await run('UPDATE users SET email_verified = 1, email_verification_token = NULL WHERE uid = ?', [req.uid]);
    res.json({ message: 'Email verified successfully' });
  } catch (err) {
    console.error('Verify email error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/me
app.get('/api/users/me', requireAuth, async (req, res) => {
  try {
    const user = await get('SELECT * FROM users WHERE uid = ?', [req.uid]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==========================================
// 2. LABORER AVAILABILITY APIS
// ==========================================

// PUT /api/laborers/availability
app.put('/api/laborers/availability', requireAuth, async (req, res) => {
  try {
    const { date, status } = req.body; // status: 'AVAILABLE' or 'NOT_AVAILABLE'
    const targetDate = date || 'Tomorrow';
    const statusVal = status || 'AVAILABLE';

    await run(
      `INSERT INTO laborer_availability (laborer_id, available_date, status)
       VALUES (?, ?, ?)
       ON CONFLICT(laborer_id, available_date) 
       DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP`,
      [req.uid, targetDate, statusVal]
    );

    await run('UPDATE users SET availability = ? WHERE uid = ?', [statusVal, req.uid]);

    res.json({ success: true, date: targetDate, status: statusVal });
  } catch (err) {
    console.error('Availability update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/laborers/availability
app.get('/api/laborers/availability', requireAuth, async (req, res) => {
  try {
    const record = await get(
      'SELECT status FROM laborer_availability WHERE laborer_id = ? ORDER BY id DESC LIMIT 1',
      [req.uid]
    );
    res.json({ status: record ? record.status : 'AVAILABLE' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==========================================
// 3. REGISTERED LABORERS DIRECTORY APIS
// ==========================================

// GET /api/laborers
app.get('/api/laborers', async (req, res) => {
  try {
    const { search, location, availability, gender } = req.query;
    let sql = `SELECT id, uid, name, phone_number as phone, location, skills, experience, expected_wage as dailyWage, availability, gender FROM users WHERE role = 'laborer'`;
    const params = [];

    if (availability) {
      sql += ` AND availability = ?`;
      params.push(availability);
    }
    if (location) {
      sql += ` AND location LIKE ?`;
      params.push(`%${location}%`);
    }
    if (gender && gender !== 'all') {
      sql += ` AND gender = ?`;
      params.push(gender);
    }
    sql += ` ORDER BY id DESC`;

    const { rows: laborers } = await query(sql, params);

    const formatted = laborers.map(l => {
      let parsedSkills = [];
      try {
        if (l.skills) {
          parsedSkills = typeof l.skills === 'string' && l.skills.startsWith('[') ? JSON.parse(l.skills) : l.skills.split(',').map(s => s.trim());
        }
      } catch (e) {}

      return {
        id: l.uid || String(l.id),
        uid: l.uid,
        name: l.name || 'Laborer',
        phone: l.phone || l.uid,
        location: l.location || '',
        skills: parsedSkills,
        experience: l.experience || '',
        dailyWage: l.dailyWage || '',
        availability: l.availability || 'Available',
        gender: l.gender || 'Unspecified',
        profileImage: 'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=150&auto=format&fit=crop&q=80'
      };
    });

    if (search) {
      const q = search.toLowerCase();
      const filtered = formatted.filter(l =>
        l.name.toLowerCase().includes(q) ||
        l.location.toLowerCase().includes(q) ||
        l.skills.some(s => s.toLowerCase().includes(q))
      );
      return res.json(filtered);
    }

    res.json(formatted);
  } catch (err) {
    console.error('Error fetching laborers:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- USER NOTIFICATIONS & CMS ---

// GET /api/notifications - returns formatted list with unread flag
app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const { rows: notifications } = await query(
      'SELECT id, type, title, message, is_read, created_at as time FROM notifications WHERE user_id = ? ORDER BY id DESC',
      [req.uid]
    );
    const formatted = notifications.map(n => ({
      id: String(n.id),
      type: n.type,
      title: n.title,
      message: n.message,
      time: n.time || 'Today',
      unread: n.is_read === 0
    }));
    res.json(formatted);
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/notifications/:id/read - Mark single notification as read
app.put('/api/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    await run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.uid]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/notifications/read-all - Mark all notifications as read
app.put('/api/notifications/read-all', requireAuth, async (req, res) => {
  try {
    await run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.uid]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/cms
app.get('/api/cms', async (req, res) => {
  try {
    const content = await query('SELECT * FROM cms_content WHERE is_active = 1 ORDER BY created_at DESC');
    res.json(content.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});



// GET /api/laborers/:uid
app.get('/api/laborers/:uid', async (req, res) => {
  try {
    const l = await get('SELECT id, uid, name, phone_number as phone, location, skills, experience, expected_wage as dailyWage, availability, gender FROM users WHERE uid = ? OR id = ?', [req.params.uid, req.params.uid]);
    if (!l) return res.status(404).json({ error: 'Laborer not found' });

    let parsedSkills = [];
    try {
      if (l.skills) {
        parsedSkills = typeof l.skills === 'string' && l.skills.startsWith('[') ? JSON.parse(l.skills) : l.skills.split(',').map(s => s.trim());
      }
    } catch (e) {}

    res.json({
      id: l.uid || String(l.id),
      uid: l.uid,
      name: l.name || 'Laborer',
      phone: l.phone || l.uid,
      location: l.location || '',
      skills: parsedSkills,
      experience: l.experience || '',
      dailyWage: l.dailyWage || '',
      availability: l.availability || 'Available',
      gender: l.gender || 'Unspecified',
      profileImage: 'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=150&auto=format&fit=crop&q=80'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==========================================
// 4. JOBS & WORK ALERTS APIS
// ==========================================

// POST /api/jobs - Create work alert (Owner)
app.post('/api/jobs', requireAuth, async (req, res) => {
  try {
    const { title, description, location, workDate, workTime, wage, laborersRequired, hirerName, hirerPhone } = req.body;

    if (!title || !location || !workDate || !workTime || !wage || !laborersRequired) {
      return res.status(400).json({ error: 'Missing required work alert fields' });
    }

    let hName = hirerName;
    let hPhone = hirerPhone;
    const ownerUser = await get('SELECT name, phone_number FROM users WHERE uid = ?', [req.uid]);
    if (ownerUser) {
      if (!hName) hName = ownerUser.name || 'Farm Owner';
      if (!hPhone) hPhone = ownerUser.phone_number || req.uid;
    }

    const result = await run(
      `INSERT INTO jobs (hirer_id, title, description, location, work_date, work_time, wage, laborers_required, hirer_name, hirer_phone, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
      [req.uid, title, description || '', location, workDate, workTime, wage, parseInt(laborersRequired), hName || 'Farm Owner', hPhone || req.uid]
    );

    const createdJob = await get('SELECT * FROM jobs WHERE id = ?', [result.lastID]);

    const jobPayload = {
      id: createdJob.id,
      hirerId: createdJob.hirer_id,
      ownerName: createdJob.hirer_name,
      workTitle: createdJob.title,
      workerWage: createdJob.wage,
      workDate: createdJob.work_date,
      workTime: createdJob.work_time,
      location: createdJob.location,
      laborersRequired: createdJob.laborers_required,
      status: createdJob.status,
      acceptedCount: 0
    };

    // Emit Socket.IO event for real-time update
    io.emit('new-work-alert', jobPayload);

    // Notify available laborers
    const { rows: availableLaborers } = await query("SELECT uid FROM users WHERE role = 'laborer'");
    for (const l of availableLaborers) {
      await createNotificationHelper(l.uid, 'new_job', 'New Work Alert', `${jobPayload.ownerName} posted: ${jobPayload.workTitle}`, createdJob.id);
    }

    res.status(201).json(jobPayload);
  } catch (err) {
    console.error('Error creating job:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/agent/job-post - LangGraph Conversational Job Posting Agent Turn
app.post('/api/agent/job-post', requireAuth, async (req, res) => {
  try {
    const { message, language, reset, confirm } = req.body;
    let inputMessage = message;
    if (confirm) {
      inputMessage = 'confirm';
    }

    const result = await runJobPostingAgentTurn({
      uid: req.uid,
      message: inputMessage,
      language: language || 'en',
      io,
      createNotificationHelper,
      reset: !!reset
    });

    res.json({
      stage: result.stage,
      botMessage: result.botMessage,
      missingField: result.missingField,
      confirmationSummary: result.confirmationSummary,
      isSubmitted: result.isSubmitted,
      createdJobId: result.createdJobId,
      jobState: {
        workType: result.workType,
        laborersRequired: result.laborersRequired,
        wage: result.wage,
        location: result.location,
        genderPreference: result.genderPreference,
        workDate: result.workDate,
        workTime: result.workTime
      }
    });
  } catch (err) {
    console.error('LangGraph Agent Error:', err);
    res.status(500).json({ error: err.message || 'Agent failed to process turn' });
  }
});

// POST /api/agent/job-search - LangGraph Job Search & ChromaDB RAG Agent
app.post('/api/agent/job-search', requireAuth, async (req, res) => {
  try {
    const { query: queryText, language } = req.body;
    const result = await runJobSearchAgent({
      queryText: queryText || '',
      uid: req.uid,
      language: language || 'en'
    });

    res.json(result);
  } catch (err) {
    console.error('Job Search Agent Error:', err);
    res.status(500).json({ error: err.message || 'Job search agent failed' });
  }
});

// GET /api/jobs/tomorrow - Retrieve open jobs for tomorrow for Laborer feed
app.get('/api/jobs/tomorrow', requireAuth, async (req, res) => {
  try {
    const laborerUid = req.uid;

    // Get jobs that are OPEN, not rejected by this laborer, and capacity not full
    const { rows: jobs } = await query(
      `SELECT * FROM jobs 
       WHERE status = 'OPEN' 
         AND id NOT IN (SELECT job_id FROM job_rejections WHERE laborer_id = ?)
       ORDER BY id DESC`,
      [laborerUid]
    );

    const formattedJobs = await Promise.all(
      jobs.map(async (job) => {
        const countRes = await get('SELECT COUNT(*) as cnt FROM job_acceptances WHERE job_id = ?', [job.id]);
        const acceptedCount = countRes ? countRes.cnt : 0;

        const isAcceptedRes = await get('SELECT id FROM job_acceptances WHERE job_id = ? AND laborer_id = ?', [job.id, laborerUid]);
        const isAcceptedByMe = !!isAcceptedRes;

        return {
          id: job.id,
          ownerName: job.hirer_name || 'Farm Owner',
          ownerPhone: job.hirer_phone,
          workTitle: job.title,
          workerWage: job.wage,
          workDate: job.work_date,
          status: acceptedCount >= job.laborers_required ? 'FULL' : job.status,
          acceptedCount,
          laborersRequired: job.laborers_required,
          isAcceptedByMe
        };
      })
    );

    res.json(formattedJobs);
  } catch (err) {
    console.error('Error fetching tomorrow jobs:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/jobs/:jobId/accept - Laborer accepts job (Atomic Capacity Check & Race Condition Protection)
app.post('/api/jobs/:jobId/accept', requireAuth, async (req, res) => {
  try {
    const { jobId } = req.params;
    const laborerUid = req.uid;

    const job = await get('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.status !== 'OPEN') return res.status(400).json({ error: 'Job is no longer open' });

    // Prevent duplicate acceptance
    const existing = await get('SELECT id FROM job_acceptances WHERE job_id = ? AND laborer_id = ?', [jobId, laborerUid]);
    if (existing) return res.status(400).json({ error: 'You have already accepted this job' });

    // Check capacity atomically
    const countRes = await get('SELECT COUNT(*) as cnt FROM job_acceptances WHERE job_id = ?', [jobId]);
    const currentCount = countRes ? countRes.cnt : 0;

    if (currentCount >= job.laborers_required) {
      await run("UPDATE jobs SET status = 'FULL' WHERE id = ?", [jobId]);
      return res.status(400).json({ error: 'All laborers have been selected' });
    }

    // Get laborer info
    let lName = req.body.laborerName;
    let lPhone = req.body.laborerPhone;
    const lUser = await get('SELECT name, phone_number FROM users WHERE uid = ?', [laborerUid]);
    if (lUser) {
      if (!lName) lName = lUser.name || 'Laborer';
      if (!lPhone) lPhone = lUser.phone_number || laborerUid;
    }

    // Insert acceptance
    await run(
      `INSERT INTO job_acceptances (job_id, laborer_id, laborer_name, laborer_phone, status)
       VALUES (?, ?, ?, ?, 'ACCEPTED')`,
      [jobId, laborerUid, lName || 'Laborer', lPhone || laborerUid]
    );

    const newCount = currentCount + 1;
    const isFull = newCount >= job.laborers_required;

    if (isFull) {
      await run("UPDATE jobs SET status = 'FULL' WHERE id = ?", [jobId]);
      io.emit('job-full', { jobId: parseInt(jobId) });
    }

    // Real-Time Notification & Socket Event to Hirer
    const notifMsg = `${lName || 'A laborer'} accepted your work alert!`;
    await createNotificationHelper(job.hirer_id, 'laborer_accepted', 'Work Alert Accepted', notifMsg, parseInt(jobId));

    const acceptPayload = {
      jobId: parseInt(jobId),
      laborerId: laborerUid,
      laborerName: lName || 'Laborer',
      laborerPhone: lPhone || laborerUid,
      name: lName || 'Laborer',
      phone: lPhone || laborerUid,
      hirerId: job.hirer_id,
      acceptedCount: newCount,
      laborersRequired: job.laborers_required,
      isFull
    };

    io.to(`user_${job.hirer_id}`).emit('laborer-accepted', acceptPayload);
    io.to(`hirer_${job.hirer_id}`).emit('laborer-accepted', acceptPayload);

    res.json({ success: true, message: 'Work accepted successfully', acceptedCount: newCount, isFull });
  } catch (err) {
    console.error('Error accepting job:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/jobs/:jobId/reject - Laborer rejects job
app.post('/api/jobs/:jobId/reject', requireAuth, async (req, res) => {
  try {
    const { jobId } = req.params;
    const laborerUid = req.uid;

    await run(
      `INSERT INTO job_rejections (job_id, laborer_id) VALUES (?, ?)
       ON CONFLICT(job_id, laborer_id) DO NOTHING`,
      [jobId, laborerUid]
    );

    res.json({ success: true, message: 'Job rejected' });
  } catch (err) {
    console.error('Error rejecting job:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/hirer/me/jobs - Return owner's jobs with accepted laborers
app.get('/api/hirer/me/jobs', requireAuth, async (req, res) => {
  try {
    const { rows: jobs } = await query('SELECT * FROM jobs WHERE hirer_id = ? ORDER BY id DESC', [req.uid]);

    const result = await Promise.all(
      jobs.map(async (job) => {
        const { rows: acceptedLaborers } = await query(
          `SELECT id, laborer_id as laborerId, laborer_name as laborerName, laborer_phone as laborerPhone, accepted_at as acceptedAt 
           FROM job_acceptances WHERE job_id = ? ORDER BY id ASC`,
          [job.id]
        );

        const acceptedCount = acceptedLaborers.length;
        const remainingPositions = Math.max(0, job.laborers_required - acceptedCount);
        const status = acceptedCount >= job.laborers_required ? 'FULL' : job.status;

        return {
          id: job.id,
          hirerId: job.hirer_id,
          title: job.title,
          description: job.description,
          location: job.location,
          workDate: job.work_date,
          workTime: job.work_time,
          wage: job.wage,
          laborersRequired: job.laborers_required,
          hirerName: job.hirer_name,
          hirerPhone: job.hirer_phone,
          status,
          acceptedCount,
          remainingPositions,
          acceptedLaborers
        };
      })
    );

    res.json(result);
  } catch (err) {
    console.error('Error fetching hirer jobs:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==========================================
// 5. DIRECT LABORER BOOKINGS APIS
// ==========================================

// POST /api/bookings - Owner sends direct booking request to a laborer
app.post('/api/bookings', requireAuth, async (req, res) => {
  try {
    const { laborerId, workTitle, wage } = req.body;
    if (!laborerId || !workTitle || !wage) {
      return res.status(400).json({ error: 'Laborer ID, Work Title, and Wage are required' });
    }

    const owner = await get('SELECT name, phone_number FROM users WHERE uid = ?', [req.uid]);
    const ownerName = owner ? (owner.name || 'Farm Owner') : 'Farm Owner';

    const result = await run(
      `INSERT INTO bookings (owner_id, laborer_id, work_title, wage, status)
       VALUES (?, ?, ?, ?, 'PENDING')`,
      [req.uid, String(laborerId), workTitle, wage]
    );

    const booking = await get('SELECT * FROM bookings WHERE id = ?', [result.lastID]);

    // Create Notification & Socket event for laborer
    const notifMsg = `${ownerName} sent you a direct booking request for ${workTitle} (${wage})`;
    await createNotificationHelper(laborerId, 'booking_request', 'New Booking Request', notifMsg, null, booking.id);

    io.to(`user_${laborerId}`).emit('booking-request', {
      bookingId: booking.id,
      ownerId: req.uid,
      ownerName,
      workTitle,
      wage,
      status: 'PENDING'
    });

    res.status(201).json(booking);
  } catch (err) {
    console.error('Error creating booking:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/bookings/received - Laborer retrieves direct booking requests
app.get('/api/bookings/received', requireAuth, async (req, res) => {
  try {
    const { rows: bookings } = await query(
      `SELECT b.*, u.name as ownerName, u.phone_number as ownerPhone 
       FROM bookings b 
       LEFT JOIN users u ON b.owner_id = u.uid 
       WHERE b.laborer_id = ? 
       ORDER BY b.id DESC`,
      [req.uid]
    );
    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/bookings/my-bookings - Owner retrieves sent bookings
app.get('/api/bookings/my-bookings', requireAuth, async (req, res) => {
  try {
    const { rows: bookings } = await query(
      `SELECT b.*, u.name as laborerName, u.phone_number as laborerPhone, u.location 
       FROM bookings b 
       LEFT JOIN users u ON b.laborer_id = u.uid 
       WHERE b.owner_id = ? 
       ORDER BY b.id DESC`,
      [req.uid]
    );

    const formatted = bookings.map(b => ({
      id: String(b.id),
      laborerId: b.laborer_id,
      laborerName: b.laborerName || 'Laborer',
      laborerPhone: b.laborerPhone || b.laborer_id,
      workType: b.work_title,
      workDate: '',
      location: b.location || '',
      wage: b.wage,
      status: b.status === 'ACCEPTED' ? 'Accepted' : b.status === 'REJECTED' ? 'Rejected' : b.status === 'COMPLETED' ? 'Completed' : 'Pending'
    }));

    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/bookings/:id/accept - Laborer accepts direct booking
app.post('/api/bookings/:id/accept', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await run("UPDATE bookings SET status = 'ACCEPTED', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND laborer_id = ?", [id, req.uid]);

    const booking = await get('SELECT * FROM bookings WHERE id = ?', [id]);
    if (booking) {
      const laborer = await get('SELECT name FROM users WHERE uid = ?', [req.uid]);
      const laborerName = laborer ? (laborer.name || 'Laborer') : 'Laborer';

      await createNotificationHelper(booking.owner_id, 'booking_accepted', 'Booking Accepted', `${laborerName} accepted your direct booking request!`, null, booking.id);
      io.to(`user_${booking.owner_id}`).emit('booking-accepted', { bookingId: booking.id, laborerName });
    }

    res.json({ success: true, status: 'ACCEPTED' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/bookings/:id/reject - Laborer rejects direct booking
app.post('/api/bookings/:id/reject', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await run("UPDATE bookings SET status = 'REJECTED', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND laborer_id = ?", [id, req.uid]);

    const booking = await get('SELECT * FROM bookings WHERE id = ?', [id]);
    if (booking) {
      const laborer = await get('SELECT name FROM users WHERE uid = ?', [req.uid]);
      const laborerName = laborer ? (laborer.name || 'Laborer') : 'Laborer';

      await createNotificationHelper(booking.owner_id, 'booking_rejected', 'Booking Declined', `${laborerName} declined your direct booking request.`, null, booking.id);
      io.to(`user_${booking.owner_id}`).emit('booking-rejected', { bookingId: booking.id, laborerName });
    }

    res.json({ success: true, status: 'REJECTED' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==========================================
// 6. NOTIFICATIONS APIS
// ==========================================

// GET /api/notifications - Get notifications for logged in user
// (notification routes consolidated above near line 422)

// ==========================================
// 7. ADMIN & OWNER PANEL APIS
// ==========================================

// POST /api/admin/setup-owner - Secret endpoint to set the first owner
app.post('/api/admin/setup-owner', requireAuth, async (req, res) => {
  try {
    const { secret } = req.body;
    const adminSecret = process.env.ADMIN_SECRET_KEY;
    
    if (!adminSecret || secret !== adminSecret) {
      return res.status(403).json({ error: 'Invalid or missing admin secret' });
    }

    await run("UPDATE users SET role = 'owner' WHERE uid = ?", [req.uid]);
    await logAuditAction(req.uid, 'Setup Owner', req.uid, { message: 'First owner account initialized' });
    
    res.json({ success: true, message: 'You are now an Owner!' });
  } catch (err) {
    console.error('Setup owner error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/dashboard - Aggregated stats
app.get('/api/admin/dashboard', requireAuth, requireAdmin, async (req, res) => {
  try {
    const totalUsers = (await get("SELECT COUNT(*) as c FROM users")).c;
    const totalLaborers = (await get("SELECT COUNT(*) as c FROM users WHERE role = 'laborer'")).c;
    const totalHirers = (await get("SELECT COUNT(*) as c FROM users WHERE role = 'farmowner'")).c;
    const totalJobs = (await get("SELECT COUNT(*) as c FROM jobs")).c;
    const activeJobs = (await get("SELECT COUNT(*) as c FROM jobs WHERE status = 'OPEN'")).c;
    
    // Direct Booking Stats
    const totalBookings = (await get("SELECT COUNT(*) as c FROM bookings")).c;
    const pendingBookings = (await get("SELECT COUNT(*) as c FROM bookings WHERE status = 'PENDING'")).c;
    const acceptedBookings = (await get("SELECT COUNT(*) as c FROM bookings WHERE status = 'ACCEPTED'")).c;
    const completedBookings = (await get("SELECT COUNT(*) as c FROM bookings WHERE status = 'COMPLETED'")).c;
    
    const pendingReports = (await get("SELECT COUNT(*) as c FROM reports WHERE status = 'OPEN'")).c;
    
    const { rows: recentUsers } = await query("SELECT uid, name, role, created_at FROM users ORDER BY created_at DESC LIMIT 5");
    const { rows: recentJobs } = await query("SELECT id, title, hirer_name, status, created_at FROM jobs ORDER BY created_at DESC LIMIT 5");

    res.json({
      stats: { 
        totalUsers, totalLaborers, totalHirers, totalJobs, activeJobs, 
        totalBookings, pendingBookings, acceptedBookings, completedBookings, 
        pendingReports 
      },
      recentUsers,
      recentJobs
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/users - List all users
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { role } = req.query;
    let sql = "SELECT id, uid, name, phone_number, role, location, status, created_at FROM users";
    const params = [];
    if (role) {
      sql += " WHERE role = ?";
      params.push(role);
    }
    sql += " ORDER BY id DESC";
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/users/:uid/status
app.patch('/api/admin/users/:uid/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body; // 'ACTIVE', 'SUSPENDED', 'BLOCKED'
    if (!['ACTIVE', 'SUSPENDED', 'BLOCKED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    await run("UPDATE users SET status = ? WHERE uid = ?", [status, req.params.uid]);
    await logAuditAction(req.uid, 'Change User Status', req.params.uid, { newStatus: status });
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/jobs
app.get('/api/admin/jobs', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query("SELECT * FROM jobs ORDER BY created_at DESC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/bookings
app.get('/api/admin/bookings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query("SELECT * FROM bookings ORDER BY created_at DESC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/reports
app.get('/api/admin/reports', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query("SELECT * FROM reports ORDER BY created_at DESC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/reports/:id/resolve
app.patch('/api/admin/reports/:id/resolve', requireAuth, requireAdmin, async (req, res) => {
  try {
    await run("UPDATE reports SET status = 'RESOLVED', resolved_at = CURRENT_TIMESTAMP WHERE id = ?", [req.params.id]);
    await logAuditAction(req.uid, 'Resolve Report', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/audit-logs
app.get('/api/admin/audit-logs', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/active-users
app.get('/api/admin/active-users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const uniqueUids = [...new Set(activeUsers.values())];
    if (uniqueUids.length === 0) {
      return res.json([]);
    }
    const placeholders = uniqueUids.map(() => '?').join(',');
    const { rows } = await query(`SELECT uid, name, phone_number, role, status FROM users WHERE uid IN (${placeholders})`, uniqueUids);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/login-activity
app.get('/api/admin/login-activity', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT l.*, u.name, u.phone_number 
      FROM login_activity l 
      LEFT JOIN users u ON l.user_id = u.uid 
      ORDER BY l.created_at DESC 
      LIMIT 100
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/jobs/:jobId - Update a job post
app.patch('/api/admin/jobs/:jobId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, location, wage, laborers_required, description } = req.body;
    await run(
      "UPDATE jobs SET title = ?, location = ?, wage = ?, laborers_required = ?, description = ? WHERE id = ?",
      [title, location, wage, laborers_required, description, req.params.jobId]
    );
    await logAuditAction(req.uid, 'Update Job', req.params.jobId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/users/:uid - Permanently delete a user
app.delete('/api/admin/users/:uid', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { uid } = req.params;
    if (uid === req.uid) return res.status(400).json({ error: 'Cannot delete your own account' });
    await run('DELETE FROM notifications WHERE user_id = ?', [uid]);
    await run('DELETE FROM bookings WHERE owner_id = ? OR laborer_id = ?', [uid, uid]);
    await run('DELETE FROM job_acceptances WHERE laborer_id = ?', [uid]);
    await run('DELETE FROM jobs WHERE hirer_id = ?', [uid]);
    await run('DELETE FROM login_activity WHERE user_id = ?', [uid]);
    await run('DELETE FROM users WHERE uid = ?', [uid]);
    await logAuditAction(req.uid, 'Delete User', uid);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/jobs/:jobId - Delete a job post
app.delete('/api/admin/jobs/:jobId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { jobId } = req.params;
    await run('DELETE FROM job_acceptances WHERE job_id = ?', [jobId]);
    await run('DELETE FROM job_rejections WHERE job_id = ?', [jobId]);
    await run('DELETE FROM jobs WHERE id = ?', [jobId]);
    await logAuditAction(req.uid, 'Delete Job', jobId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete job error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/bookings/:id - Delete a booking
app.delete('/api/admin/bookings/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await run('DELETE FROM bookings WHERE id = ?', [id]);
    await logAuditAction(req.uid, 'Delete Booking', id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete booking error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/settings - Get settings
app.get('/api/admin/settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query("SELECT * FROM settings");
    const settingsMap = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
    res.json(settingsMap);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/settings - Update settings
app.patch('/api/admin/settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await run("UPDATE settings SET value = ? WHERE key = ?", [value, key]);
    }
    await logAuditAction(req.uid, 'Update Settings', 'global');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/cms - Get all CMS content (including inactive)
app.get('/api/admin/cms', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query("SELECT * FROM cms_content ORDER BY created_at DESC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/cms - Create CMS content
app.post('/api/admin/cms', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { type, title, content, is_active } = req.body;
    await run(
      "INSERT INTO cms_content (type, title, content, is_active) VALUES (?, ?, ?, ?)",
      [type, title, content, is_active]
    );
    await logAuditAction(req.uid, 'Create CMS Content', title);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/cms/:id - Update CMS content
app.patch('/api/admin/cms/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { type, title, content, is_active } = req.body;
    await run(
      "UPDATE cms_content SET type = ?, title = ?, content = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [type, title, content, is_active, req.params.id]
    );
    await logAuditAction(req.uid, 'Update CMS Content', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/cms/:id - Delete CMS content
app.delete('/api/admin/cms/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await run("DELETE FROM cms_content WHERE id = ?", [req.params.id]);
    await logAuditAction(req.uid, 'Delete CMS Content', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/users/search - Search users by name or phone (for notification targeting)
app.get('/api/admin/users/search', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    const { rows } = await query(
      "SELECT uid, name, phone_number, role FROM users WHERE name LIKE ? OR phone_number LIKE ? LIMIT 10",
      [`%${q}%`, `%${q}%`]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/notifications - Send push notification
app.post('/api/admin/notifications', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { target_users, type, title, message, target_uid } = req.body;
    
    let users = [];

    if (target_users === 'SPECIFIC' && target_uid) {
      // Send to a specific user
      const targetUser = await get("SELECT uid FROM users WHERE uid = ?", [target_uid]);
      if (!targetUser) return res.status(404).json({ error: 'Target user not found' });
      users = [targetUser];
    } else {
      let targetRole = null;
      if (target_users === 'LABORERS') targetRole = 'laborer';
      if (target_users === 'HIRERS') targetRole = 'farmowner';
      
      let sql = "SELECT uid FROM users";
      const params = [];
      if (targetRole) {
        sql += " WHERE role = ?";
        params.push(targetRole);
      }
      const result = await query(sql, params);
      users = result.rows;
    }
    
    for (const u of users) {
      await run(
        "INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)",
        [u.uid, type, title, message]
      );
    }

    // Emit via Socket.io
    if (target_users === 'SPECIFIC' && target_uid) {
      io.to(`user_${target_uid}`).emit('notification-created', { title, message, type });
    } else {
      io.emit('notification-created', { title, message, type });
    }

    await logAuditAction(req.uid, 'Send Push Notification', target_users === 'SPECIFIC' ? `user:${target_uid}` : target_users, { title, count: users.length });
    res.json({ success: true, count: users.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==========================================
// ADMIN LANGGRAPH AGENT QUERY ENDPOINT
// ==========================================

// POST /api/admin/agent/query
// Accepts a natural language question from an admin and runs it through
// the 3-node LangGraph chain: parse_query → route → summarize
app.post('/api/admin/agent/query', requireAuth, requireAdmin, async (req, res) => {
  const { queryText } = req.body;

  if (!queryText || typeof queryText !== 'string' || queryText.trim().length < 3) {
    return res.status(400).json({ error: 'Please provide a valid query (at least 3 characters).' });
  }

  try {
    const result = await runAdminQueryAgent({
      queryText: queryText.trim(),
      adminUid: req.uid
    });

    // Audit log every agent query so admins have a trail
    await logAuditAction(
      req.uid,
      'Admin Agent Query',
      `[${result.category}] ${queryText.trim().slice(0, 80)}`,
      { category: result.category, entities: result.extractedEntities }
    );

    res.json({
      success: true,
      category: result.category,
      entities: result.extractedEntities,
      answer: result.answer
    });
  } catch (err) {
    console.error('[Admin Agent] Error:', err);
    res.status(500).json({ error: 'Agent query failed. Please try again.' });
  }
});

// Emit a refresh event to all clients every 24 hours (24 * 60 * 60 * 1000 ms)
setInterval(() => {
  io.emit('force-refresh');
  console.log('[Socket.IO] Emitted force-refresh to all clients');
}, 24 * 60 * 60 * 1000);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Backend server running securely on port ${PORT} with Socket.IO & SQLite database`);
});
