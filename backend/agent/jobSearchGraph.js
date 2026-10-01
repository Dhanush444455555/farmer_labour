const { StateGraph, Annotation, END, START } = require('@langchain/langgraph');
const { query, get } = require('../db');
const { evaluateWageFairness, searchLabourRights } = require('./chromaLabourRights');

// 1. Define LangGraph State Annotation for Job Search & RAG
const JobSearchStateAnnotation = Annotation.Root({
  userQuery: Annotation({ reducer: (x, y) => y ?? x, default: () => '' }),
  laborerUid: Annotation({ reducer: (x, y) => y ?? x, default: () => '' }),
  laborerGender: Annotation({ reducer: (x, y) => y ?? x, default: () => 'Any' }),
  laborerLocation: Annotation({ reducer: (x, y) => y ?? x, default: () => '' }),
  language: Annotation({ reducer: (x, y) => y ?? x, default: () => 'en' }),

  // Extracted Intent Filters
  filters: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({
      workType: null,
      minWage: null,
      location: null,
      date: 'Tomorrow',
      gender: 'Any',
      isRagQuestion: false
    })
  }),

  // Retrieved & Ranked Jobs
  retrievedJobs: Annotation({ reducer: (x, y) => y ?? x, default: () => [] }),
  rankedJobs: Annotation({ reducer: (x, y) => y ?? x, default: () => [] }),

  // Final Output
  voiceSummary: Annotation({ reducer: (x, y) => y ?? x, default: () => '' }),
  ragAnswer: Annotation({ reducer: (x, y) => y ?? x, default: () => null }),
  resultsCount: Annotation({ reducer: (x, y) => y ?? x, default: () => 0 })
});

// NODE 1: parse_intent
// Extracts filters (location, date, min wage, gender, work type, rag intent)
async function parseIntentNode(state) {
  const text = (state.userQuery || '').toLowerCase();
  const filters = {
    workType: null,
    minWage: null,
    location: state.laborerLocation || null,
    date: 'Tomorrow',
    gender: state.laborerGender || 'Any',
    isRagQuestion: false
  };

  // Check for RAG / Wage Fairness Questions
  const ragKeywords = [
    'fair', 'minimum wage', 'is this wage', 'legal', 'rights', 'enough',
    'நியாயமானதா', 'குறைந்தபட்ச கூலி', 'சட்டப்பூர்வ',
    'उचित', 'न्यूनतम मजदूरी', 'सही है क्या',
    'ನ್ಯಾಯಯುತ', 'ಕನಿಷ್ಠ ಕೂಲಿ',
    'న్యాయమైన', 'కనీస వేతనం'
  ];

  if (ragKeywords.some((kw) => text.includes(kw))) {
    filters.isRagQuestion = true;
  }

  // Work Type Extraction
  if (text.includes('harvest') || text.includes('அறுவடை') || text.includes('कटाई') || text.includes('ಕಟಾವು') || text.includes('కోత')) {
    filters.workType = 'Harvesting';
  } else if (text.includes('weed') || text.includes('களை') || text.includes('निराई') || text.includes('ಕಳೆ') || text.includes('కలుపు')) {
    filters.workType = 'Weeding';
  } else if (text.includes('plow') || text.includes('tractor') || text.includes('உழு') || text.includes('जुताई') || text.includes('ಉಳುಮೆ')) {
    filters.workType = 'Plowing';
  } else if (text.includes('spray') || text.includes('மருந்து') || text.includes('छिड़काव') || text.includes('ಪಿಚಿಕారీ')) {
    filters.workType = 'Spraying';
  } else if (text.includes('sow') || text.includes('plant') || text.includes('நாற்று') || text.includes('बुवाई') || text.includes('ನಾಟಿ')) {
    filters.workType = 'Sowing';
  }

  // Minimum Wage extraction
  const wageMatch = text.match(/(\d{3,4})\s*(rupee|rupees|rs|inr|ரூபாய்|रुपये|ರೂಪಾಯಿ)?/i);
  if (wageMatch) {
    filters.minWage = parseInt(wageMatch[1]);
  } else if (
    text.includes('good pay') ||
    text.includes('high pay') ||
    text.includes('best wage') ||
    text.includes('அதிக கூலி') ||
    text.includes('अच्छी मजदूरी') ||
    text.includes('ಹೆಚ್ಚು ಕೂಲಿ')
  ) {
    filters.minWage = 500; // Baseline for "good pay"
  }

  // Date
  if (text.includes('today') || text.includes('urgent') || text.includes('இன்று') || text.includes('आज') || text.includes('ಇಂದು')) {
    filters.date = 'Today';
  } else if (text.includes('tomorrow') || text.includes('நாளை') || text.includes('कल') || text.includes('ನಾಳೆ')) {
    filters.date = 'Tomorrow';
  }

  // Location
  if (!text.includes('near me') && !text.includes('அருகில்') && !text.includes('पास')) {
    const locMatch = text.match(/(?:in|at|near|ஊர்|கிராமம்|गांव)\s+([a-zA-Z\u0B80-\u0BFF\u0900-\u097F\u0C80-\u0CFF]+)/i);
    if (locMatch && locMatch[1]) {
      filters.location = locMatch[1].trim();
    }
  }

  return { filters };
}

// NODE: rag_check (calls ChromaDB for grounded labour rights & minimum wage info)
async function ragCheckNode(state) {
  const lang = state.language || 'en';
  const queryText = state.userQuery || 'minimum wage agricultural labour';

  const evaluation = await evaluateWageFairness({
    wage: state.filters.minWage || 500,
    workType: state.filters.workType || 'Farm Work',
    userState: state.laborerLocation || 'Tamil Nadu',
    language: lang
  });

  return {
    ragAnswer: evaluation,
    voiceSummary: evaluation.explanation
  };
}

// NODE 2: retrieve (Queries SQLite Jobs Database)
async function retrieveNode(state) {
  const { filters } = state;
  try {
    let sql = `SELECT * FROM jobs WHERE status = 'OPEN'`;
    const params = [];

    if (filters.date) {
      sql += ` AND (work_date = ? OR work_date LIKE ?)`;
      params.push(filters.date, `%${filters.date}%`);
    }

    if (filters.workType) {
      sql += ` AND (title LIKE ? OR description LIKE ?)`;
      params.push(`%${filters.workType}%`, `%${filters.workType}%`);
    }

    if (filters.minWage) {
      sql += ` AND wage >= ?`;
      params.push(filters.minWage);
    }

    const { rows: jobs } = await query(sql, params);
    return { retrievedJobs: jobs || [] };
  } catch (err) {
    console.error('Retrieve node error:', err);
    return { retrievedJobs: [] };
  }
}

// NODE 3: rank (Ranks by proximity, highest wage, and gender match)
async function rankNode(state) {
  const jobs = state.retrievedJobs || [];
  const userLoc = (state.laborerLocation || '').toLowerCase();
  const userGender = state.laborerGender || 'Any';

  const scored = jobs.map((job) => {
    let score = 0;

    // Wage score (higher wage = higher score)
    score += (Number(job.wage) || 0) / 50;

    // Location proximity score
    if (userLoc && job.location && job.location.toLowerCase().includes(userLoc)) {
      score += 10;
    }

    // Gender match score
    const jobGender = job.gender_preference || 'Any';
    if (jobGender === 'Any' || jobGender === userGender) {
      score += 5;
    } else {
      score -= 5;
    }

    return { job, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const ranked = scored.map((s) => s.job);

  return { rankedJobs: ranked };
}

// NODE 4: present (Formats top 3 short voice-readable summaries in laborer's language)
async function presentNode(state) {
  const top3 = (state.rankedJobs || []).slice(0, 3);
  const lang = state.language || 'en';

  if (top3.length === 0) {
    const noJobsMsg = {
      en: 'No matching jobs found right now. You will be alerted when a nearby farmer posts work.',
      ta: 'தற்போது பொருத்தமான வேலைகள் இல்லை. அருகில் வேலை பதிவிட்டதும் தகவல் வரும்.',
      hi: 'अभी कोई काम उपलब्ध नहीं है। नया काम पोस्ट होने पर सूचना मिलेगी।',
      kn: 'ಯಾವುದೇ ಕೆಲಸ ಲಭ್ಯವಿಲ್ಲ. ಹೊಸ ಕೆಲಸ ಬಂದಾಗ ತಿಳಿಸಲಾಗುವುದು.',
      te: 'ప్రస్తుతం పనులు అందుబాటులో లేవు. పని వచ్చినప్పుడు తెలియజేస్తాము.'
    };
    return {
      voiceSummary: noJobsMsg[lang] || noJobsMsg.en,
      resultsCount: 0
    };
  }

  // Build voice-readable summaries
  let summary = '';
  if (lang === 'ta') {
    summary = `உங்களுக்காக ${top3.length} சிறந்த வேலைகள் உள்ளன:\n` +
      top3.map((j, i) => `${i + 1}. ${j.title} • ₹${j.wage}/நாள் • ${j.location || 'பண்ணை'} (${j.work_date})`).join('\n');
  } else if (lang === 'hi') {
    summary = `आपके लिए ${top3.length} काम मिले हैं:\n` +
      top3.map((j, i) => `${i + 1}. ${j.title} • ₹${j.wage}/दिन • ${j.location || 'खेत'} (${j.work_date})`).join('\n');
  } else if (lang === 'kn') {
    summary = `ನಿಮಗಾಗಿ ${top3.length} ಕೆಲಸಗಳು ಸಿಕ್ಕಿವೆ:\n` +
      top3.map((j, i) => `${i + 1}. ${j.title} • ₹${j.wage}/ದಿನ • ${j.location || 'ತೋಟ'}`).join('\n');
  } else if (lang === 'te') {
    summary = `మీ కోసం ${top3.length} పనులు దొరికాయి:\n` +
      top3.map((j, i) => `${i + 1}. ${j.title} • ₹${j.wage}/రోజు • ${j.location || 'పొలం'}`).join('\n');
  } else {
    summary = `Found ${top3.length} matching jobs:\n` +
      top3.map((j, i) => `${i + 1}. ${j.title} • ₹${j.wage}/day at ${j.location || 'Farm'} (${j.work_date})`).join('\n');
  }

  return {
    voiceSummary: summary,
    resultsCount: top3.length
  };
}

// Router after parse_intent
function intentRouter(state) {
  if (state.filters && state.filters.isRagQuestion) {
    return 'rag_check';
  }
  return 'retrieve';
}

// Build & Compile LangGraph Job Search Graph
function createJobSearchGraph() {
  const workflow = new StateGraph(JobSearchStateAnnotation)
    .addNode('parse_intent', parseIntentNode)
    .addNode('rag_check', ragCheckNode)
    .addNode('retrieve', retrieveNode)
    .addNode('rank', rankNode)
    .addNode('present', presentNode)
    .addEdge(START, 'parse_intent')
    .addConditionalEdges('parse_intent', intentRouter, {
      rag_check: 'rag_check',
      retrieve: 'retrieve'
    })
    .addEdge('rag_check', END)
    .addEdge('retrieve', 'rank')
    .addEdge('rank', 'present')
    .addEdge('present', END);

  return workflow.compile();
}

async function runJobSearchAgent({ queryText, uid, language = 'en' }) {
  let laborerLocation = '';
  let laborerGender = 'Any';

  if (uid) {
    const user = await get('SELECT location, gender FROM users WHERE uid = ?', [uid]);
    if (user) {
      laborerLocation = user.location || '';
      laborerGender = user.gender || 'Any';
    }
  }

  const app = createJobSearchGraph();
  const finalState = await app.invoke({
    userQuery: queryText,
    laborerUid: uid || '',
    laborerGender,
    laborerLocation,
    language
  });

  return {
    voiceSummary: finalState.voiceSummary,
    rankedJobs: (finalState.rankedJobs || []).slice(0, 3),
    ragAnswer: finalState.ragAnswer,
    filters: finalState.filters,
    resultsCount: finalState.resultsCount
  };
}

module.exports = {
  createJobSearchGraph,
  runJobSearchAgent
};
