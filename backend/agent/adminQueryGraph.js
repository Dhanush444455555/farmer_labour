const { StateGraph, Annotation, END, START } = require('@langchain/langgraph');
const { query, get } = require('../db');

// 1. Define LangGraph State Annotation for Admin Query Agent
const AdminQueryStateAnnotation = Annotation.Root({
  queryText: Annotation({ reducer: (x, y) => y ?? x, default: () => '' }),
  adminUid: Annotation({ reducer: (x, y) => y ?? x, default: () => '' }),

  // Classification & Routing
  category: Annotation({ reducer: (x, y) => y ?? x, default: () => 'analytics' }), // 'analytics' | 'moderation' | 'report'
  extractedEntities: Annotation({ reducer: (x, y) => ({ ...x, ...y }), default: () => ({}) }),

  // DB Execution Results
  dbResult: Annotation({ reducer: (x, y) => y ?? x, default: () => null }),
  dataSummary: Annotation({ reducer: (x, y) => y ?? x, default: () => null }),

  // Plain-Language Markdown Response
  finalAnswer: Annotation({ reducer: (x, y) => y ?? x, default: () => '' })
});

// NODE 1: parse_query
// Classifies query type (analytics vs moderation vs report) and extracts entities
async function parseQueryNode(state) {
  const text = (state.queryText || '').toLowerCase();
  let category = 'analytics';
  const entities = {};

  // Check category
  if (
    text.includes('suspicious') ||
    text.includes('flag') ||
    text.includes('ban') ||
    text.includes('banned') ||
    text.includes('fraud') ||
    text.includes('unverified') ||
    text.includes('fake') ||
    text.includes('security')
  ) {
    category = 'moderation';
  } else if (
    text.includes('report') ||
    text.includes('summary') ||
    text.includes('audit') ||
    text.includes('log') ||
    text.includes('overview') ||
    text.includes('export')
  ) {
    category = 'report';
  } else {
    category = 'analytics';
  }

  // Extract location
  const locations = ['tamil nadu', 'karnataka', 'andhra', 'telangana', 'salem', 'madurai', 'coimbatore', 'chennai', 'mysore', 'bangalore'];
  for (const loc of locations) {
    if (text.includes(loc)) {
      entities.location = loc;
      break;
    }
  }

  // Extract timeframe
  if (text.includes('this week') || text.includes('past week') || text.includes('7 days')) {
    entities.timeframe = '7_days';
  } else if (text.includes('today') || text.includes('24 hours')) {
    entities.timeframe = 'today';
  } else if (text.includes('this month') || text.includes('30 days')) {
    entities.timeframe = '30_days';
  }

  // Extract role
  if (text.includes('farmer') || text.includes('owner')) {
    entities.role = 'farmowner';
  } else if (text.includes('laborer') || text.includes('worker')) {
    entities.role = 'laborer';
  }

  return {
    category,
    extractedEntities: entities
  };
}

// NODE 2: route
// Dispatches to the appropriate SQL query based on classification
async function routeNode(state) {
  const { category, extractedEntities } = state;
  let dbResult = null;

  try {
    if (category === 'moderation') {
      // 1. Check for banned or suspicious accounts (missing names, unverified emails, or banned status)
      const { rows: suspiciousUsers } = await query(
        `SELECT uid, name, phone_number, role, is_banned, is_email_verified, created_at 
         FROM users 
         WHERE is_banned = 1 OR is_email_verified = 0 OR name IS NULL OR name = '' OR length(phone_number) < 10
         ORDER BY id DESC LIMIT 15`
      );

      // 2. Check for recent security audit actions
      const { rows: recentAudits } = await query(
        `SELECT user_id, action, target, timestamp FROM audit_logs 
         WHERE action LIKE '%Ban%' OR action LIKE '%Delete%' OR action LIKE '%Admin%' 
         ORDER BY id DESC LIMIT 5`
      );

      dbResult = {
        suspiciousUsers: suspiciousUsers || [],
        recentAudits: recentAudits || []
      };
    } else if (category === 'report') {
      // Comprehensive platform summary
      const totalUsers = await get(`SELECT COUNT(*) as count FROM users`);
      const totalJobs = await get(`SELECT COUNT(*) as count FROM jobs`);
      const totalBookings = await get(`SELECT COUNT(*) as count FROM bookings`);
      const bookingsByStatus = await query(`SELECT status, COUNT(*) as count FROM bookings GROUP BY status`);
      const recentAudits = await query(`SELECT action, COUNT(*) as count FROM audit_logs GROUP BY action ORDER BY count DESC LIMIT 5`);

      dbResult = {
        totalUsers: totalUsers?.count || 0,
        totalJobs: totalJobs?.count || 0,
        totalBookings: totalBookings?.count || 0,
        bookingsByStatus: bookingsByStatus.rows || [],
        topAuditActions: recentAudits.rows || []
      };
    } else {
      // Analytics Category
      let jobQuery = `SELECT COUNT(*) as total_jobs, AVG(wage) as avg_wage, MIN(wage) as min_wage, MAX(wage) as max_wage FROM jobs WHERE 1=1`;
      const params = [];

      if (extractedEntities.location) {
        jobQuery += ` AND (location LIKE ? OR hirer_name LIKE ?)`;
        params.push(`%${extractedEntities.location}%`, `%${extractedEntities.location}%`);
      }

      if (extractedEntities.timeframe === '7_days') {
        jobQuery += ` AND datetime(created_at) >= datetime('now', '-7 days')`;
      } else if (extractedEntities.timeframe === 'today') {
        jobQuery += ` AND datetime(created_at) >= datetime('now', '-1 days')`;
      }

      const jobStats = await get(jobQuery, params);

      // User breakdown
      const userBreakdown = await query(`SELECT role, COUNT(*) as count FROM users GROUP BY role`);

      // Top work types
      const topWorkTypes = await query(`SELECT title, COUNT(*) as count FROM jobs GROUP BY title ORDER BY count DESC LIMIT 5`);

      dbResult = {
        jobStats: jobStats || {},
        userBreakdown: userBreakdown.rows || [],
        topWorkTypes: topWorkTypes.rows || []
      };
    }
  } catch (err) {
    console.error('Route DB Query Error:', err);
    dbResult = { error: err.message };
  }

  return { dbResult };
}

// NODE 3: summarize
// Returns a plain-language answer formatted from the query results
async function summarizeNode(state) {
  const { category, dbResult, queryText, extractedEntities } = state;
  let finalAnswer = '';

  if (!dbResult || dbResult.error) {
    return {
      finalAnswer: `⚠️ Error executing query for "${queryText}": ${dbResult?.error || 'No data found.'}`
    };
  }

  if (category === 'moderation') {
    const users = dbResult.suspiciousUsers || [];
    const audits = dbResult.recentAudits || [];

    finalAnswer = `### 🛡️ Moderation & Account Security Report\n\n`;
    finalAnswer += `Found **${users.length}** account(s) flagged for review (banned, unverified, or incomplete profile):\n\n`;

    if (users.length > 0) {
      finalAnswer += `| Name | Role | Phone | Status |\n`;
      finalAnswer += `| :--- | :--- | :--- | :--- |\n`;
      users.forEach((u) => {
        const statusPill = u.is_banned ? '🔴 Banned' : !u.is_email_verified ? '🟡 Unverified Email' : '🟢 Active';
        finalAnswer += `| ${u.name || 'Unnamed'} | ${u.role || 'User'} | ${u.phone_number || 'N/A'} | ${statusPill} |\n`;
      });
    } else {
      finalAnswer += `✅ No suspicious or banned accounts detected on the platform.\n`;
    }

    if (audits.length > 0) {
      finalAnswer += `\n**Recent Security Audit Events:**\n`;
      audits.forEach((a) => {
        finalAnswer += `- **${a.action}** on \`${a.target || 'System'}\` at ${a.timestamp || 'Recent'}\n`;
      });
    }
  } else if (category === 'report') {
    finalAnswer = `### 📊 Platform Activity Overview Report\n\n`;
    finalAnswer += `- **Total Registered Users**: ${dbResult.totalUsers}\n`;
    finalAnswer += `- **Total Jobs Created**: ${dbResult.totalJobs}\n`;
    finalAnswer += `- **Total Direct Bookings**: ${dbResult.totalBookings}\n\n`;

    if (dbResult.bookingsByStatus && dbResult.bookingsByStatus.length > 0) {
      finalAnswer += `**Booking Status Breakdown:**\n`;
      dbResult.bookingsByStatus.forEach((b) => {
        finalAnswer += `- **${b.status}**: ${b.count}\n`;
      });
    }
  } else {
    // Analytics
    const stats = dbResult.jobStats || {};
    const locNote = extractedEntities.location ? ` in **${extractedEntities.location}**` : '';
    const timeNote = extractedEntities.timeframe === '7_days' ? ' in the past 7 days' : '';

    finalAnswer = `### 📈 Platform Analytics Insight\n\n`;
    finalAnswer += `For query: *"${queryText}"*\n\n`;
    finalAnswer += `- **Total Jobs Posted${locNote}${timeNote}**: **${stats.total_jobs || 0}**\n`;
    if (stats.avg_wage) {
      finalAnswer += `- **Average Daily Wage**: ₹${Math.round(stats.avg_wage)}/day (Range: ₹${stats.min_wage || 0} - ₹${stats.max_wage || 0})\n`;
    }

    if (dbResult.userBreakdown && dbResult.userBreakdown.length > 0) {
      finalAnswer += `\n**User Distribution:**\n`;
      dbResult.userBreakdown.forEach((u) => {
        finalAnswer += `- **${u.role === 'farmowner' ? 'Farm Owners' : 'Laborers'}**: ${u.count}\n`;
      });
    }

    if (dbResult.topWorkTypes && dbResult.topWorkTypes.length > 0) {
      finalAnswer += `\n**Top Demanded Work Types:**\n`;
      dbResult.topWorkTypes.forEach((w) => {
        finalAnswer += `- ${w.title || 'General'}: ${w.count} posts\n`;
      });
    }
  }

  return { finalAnswer };
}

// Build & Compile 3-Node LangGraph StateGraph
function createAdminQueryGraph() {
  const workflow = new StateGraph(AdminQueryStateAnnotation)
    .addNode('parse_query', parseQueryNode)
    .addNode('route', routeNode)
    .addNode('summarize', summarizeNode)
    .addEdge(START, 'parse_query')
    .addEdge('parse_query', 'route')
    .addEdge('route', 'summarize')
    .addEdge('summarize', END);

  return workflow.compile();
}

async function runAdminQueryAgent({ queryText, adminUid }) {
  const app = createAdminQueryGraph();
  const finalState = await app.invoke({
    queryText,
    adminUid: adminUid || ''
  });

  return {
    category: finalState.category,
    extractedEntities: finalState.extractedEntities,
    answer: finalState.finalAnswer,
    dbResult: finalState.dbResult
  };
}

module.exports = {
  createAdminQueryGraph,
  runAdminQueryAgent
};
