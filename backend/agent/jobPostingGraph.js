const { StateGraph, Annotation, END, START } = require('@langchain/langgraph');
const { z } = require('zod');
const { get, run, query, logAuditAction } = require('../db');

// Multi-language question and confirmation templates
const TEMPLATES = {
  en: {
    ask_workType: 'What farm work is needed? (e.g. 🌾 Harvesting, 🌱 Weeding, 🚜 Plowing, 💧 Spraying)',
    ask_laborersRequired: 'How many workers do you need for this work? (e.g. 3 workers)',
    ask_wage: 'What is the daily wage per worker in Rupees? (e.g. ₹500 per day)',
    ask_location: 'What is the farm location / village name?',
    ask_workDate: 'When is the work scheduled? (Tomorrow Morning or Today?)',
    confirm_title: 'Please confirm your job posting:',
    confirm_prompt: 'Tap "Confirm & Broadcast" or reply "Yes" to post to all workers.',
    success: '🎉 Job posted successfully! Available workers in your area have been notified.'
  },
  ta: {
    ask_workType: 'என்ன பண்ணை வேலை தேவை? (எ.கா: 🌾 அறுவடை, 🌱 களையெடுத்தல், 🚜 உழுதல், 💧 மருந்து அடித்தல்)',
    ask_laborersRequired: 'எத்தனை தொழிலாளர்கள் தேவை? (எ.கா: 3 ஆட்கள்)',
    ask_wage: 'ஒரு தொழிலாளிக்கு ஒரு நாள் கூலி எவ்வளவு? (எ.கா: ₹500)',
    ask_location: 'பண்ணை அமைந்துள்ள ஊர் அல்லது இடம் எது?',
    ask_workDate: 'வேலை எப்போது? (நாளை காலை அல்லது இன்று?)',
    confirm_title: 'வேலை விவரங்களை உறுதிப்படுத்தவும்:',
    confirm_prompt: 'பதிவிட "உறுதி செய்" என்பதை அழுத்தவும் அல்லது "ஆம்" என்று கூறவும்.',
    success: '🎉 வேலை வெற்றிகரமாக பதிவிடப்பட்டது! தொழிலாளர்களுக்கு தகவல் அனுப்பப்பட்டது.'
  },
  hi: {
    ask_workType: 'क्या काम करवाना है? (उदा. 🌾 कटाई, 🌱 निराई, 🚜 जुताई, 💧 छिड़काव)',
    ask_laborersRequired: 'कितने मजदूर चाहिए? (उदा. 3 मजदूर)',
    ask_wage: 'प्रति मजदूर दैनिक मजदूरी कितनी है? (उदा. ₹500)',
    ask_location: 'खेत का स्थान या गाँव का नाम क्या है?',
    ask_workDate: 'काम कब का है? (कल सुबह या आज?)',
    confirm_title: 'कृपया कार्य विवरण की पुष्टि करें:',
    confirm_prompt: 'पोस्ट करने के लिए "पुष्टि करें" दबाएं या "हाँ" कहें।',
    success: '🎉 काम सफलतापूर्वक पोस्ट किया गया! उपलब्ध मजदूरों को सूचना भेज दी गई है।'
  },
  kn: {
    ask_workType: 'ಯಾವ ಕೆಲಸ ಮಾಡಬೇಕು? (ಉದಾ: 🌾 ಕಟಾವು, 🌱 ಕಳೆ ಕೀಳುವುದು, 🚜 ಉಳುಮೆ, 💧 ಸಿಂಪಡಣೆ)',
    ask_laborersRequired: 'ಎಷ್ಟು ಜನರು ಬೇಕು? (ಉದಾ: 3 ಕಾರ್ಮಿಕರು)',
    ask_wage: 'ಒಬ್ಬರಿಗೆ ದಿನದ ಕೂಲಿ ಎಷ್ಟು? (ಉದಾ: ₹500)',
    ask_location: 'ತೋಟದ ಸ್ಥಳ ಅಥವಾ ಊರಿನ ಹೆಸರು ಯಾವುದು?',
    ask_workDate: 'ಕೆಲಸ ಯಾವಾಗ? (ನಾಳೆ ಬೆಳಿಗ್ಗೆ ಅಥವಾ ಇಂದು?)',
    confirm_title: 'ಕೆಲಸದ ವಿವರಗಳನ್ನು ಖಚಿತಪಡಿಸಿ:',
    confirm_prompt: 'ಪೋಸ್ಟ್ ಮಾಡಲು "ಖಚಿತಪಡಿಸಿ" ಒತ್ತಿ ಅಥವಾ "ಹೌದು" ಎಂದು ಹೇಳಿ.',
    success: '🎉 ಕೆಲಸವನ್ನು ಯಶಸ್ವಿಯಾಗಿ ಪೋಸ್ಟ್ ಮಾಡಲಾಗಿದೆ! ಕಾರ್ಮಿಕರಿಗೆ ತಿಳಿಸಲಾಗಿದೆ.'
  },
  te: {
    ask_workType: 'ఏ పని కావాలి? (ఉదా: 🌾 కోత, 🌱 కలుపు తీత, 🚜 దున్నడం, 💧 పిచికారీ)',
    ask_laborersRequired: 'ఎంతమంది కూలీలు కావాలి? (ఉదా: 3 కూలీలు)',
    ask_wage: 'రోజు కూలీ ఎంత? (ఉదా: ₹500)',
    ask_location: 'పొలం ఉన్న ప్రదేశం లేదా ఊరి పేరు ఏమిటి?',
    ask_workDate: 'పని ఎప్పుడు? (రేపు ఉదయమా లేదా ఈ రోజా?)',
    confirm_title: 'పని వివరాలను ధృవీకరించండి:',
    confirm_prompt: 'పోస్ట్ చేయడానికి "ధృవీకరించు" నొక్కండి లేదా "అవును" అనండి.',
    success: '🎉 పని విజయవంతంగా పోస్ట్ చేయబడింది! కూలీలకు సమాచారం అందించబడింది.'
  }
};

// Zod Schema for Structured Job Details Extraction
const JobExtractionSchema = z.object({
  workType: z.enum(['Harvesting', 'Weeding', 'Plowing', 'Spraying', 'Sowing', 'General']).optional(),
  laborersRequired: z.number().int().positive().optional(),
  wage: z.number().positive().optional(),
  location: z.string().optional(),
  genderPreference: z.enum(['Any', 'Male', 'Female']).optional(),
  workDate: z.enum(['Tomorrow', 'Today']).optional()
});

// Rule-based and keyword extraction fallback
function extractStructuredJobFields(text, currentLang = 'en') {
  if (!text) return {};
  const t = text.toLowerCase();
  const extracted = {};

  // Work Type
  if (t.includes('harvest') || t.includes('அறுவடை') || t.includes('कटाई') || t.includes('ಕಟಾವು') || t.includes('కోత')) {
    extracted.workType = 'Harvesting';
  } else if (t.includes('weed') || t.includes('களை') || t.includes('निराई') || t.includes('ಕಳೆ') || t.includes('కలుపు')) {
    extracted.workType = 'Weeding';
  } else if (t.includes('plow') || t.includes('tractor') || t.includes('உழு') || t.includes('जुताई') || t.includes('ಉಳುಮೆ') || t.includes('దున్న')) {
    extracted.workType = 'Plowing';
  } else if (t.includes('spray') || t.includes('pesticide') || t.includes('மருந்து') || t.includes('छिड़काव') || t.includes('ಔಷಧ') || t.includes('పిచికారీ')) {
    extracted.workType = 'Spraying';
  } else if (t.includes('sow') || t.includes('plant') || t.includes('நாற்று') || t.includes('बुवाई') || t.includes('ನಾಟಿ') || t.includes('నాట్లు')) {
    extracted.workType = 'Sowing';
  } else if (t.includes('general') || t.includes('பொது') || t.includes('सामान्य') || t.includes('ಸಾಮಾನ್ಯ') || t.includes('సాధారణ')) {
    extracted.workType = 'General';
  }

  // Worker Count
  const countMatch = t.match(/(\d+)\s*(worker|workers|people|ஆள்|ஆட்கள்|मजदूर|ಕಾರ್ಮಿಕ|ಕೂಲೀలు|ಜನ)?/i);
  if (countMatch && parseInt(countMatch[1]) > 0 && parseInt(countMatch[1]) < 100) {
    extracted.laborersRequired = parseInt(countMatch[1]);
  } else {
    const wordNums = {
      one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
      ஒன்று: 1, இரண்டு: 2, மூன்று: 3, நான்கு: 4, ஐந்து: 5,
      एक: 1, दो: 2, तीन: 3, चार: 4, पांच: 5,
      ಒಂದು: 1, ಎರಡು: 2, ಮೂರು: 3, ನಾಲ್ಕು: 4, ಐದು: 5,
      ఒకటి: 1, రెండు: 2, మూడు: 3, నాలుగు: 4, ఐదు: 5
    };
    for (const [w, val] of Object.entries(wordNums)) {
      if (t.includes(w)) {
        extracted.laborersRequired = val;
        break;
      }
    }
  }

  // Wage (Rupees)
  const wageMatch = t.match(/(\d{3,4})\s*(rupee|rupees|rs|inr|ரூபாய்|ரூ|रुपये|रुपया|ರೂಪಾಯಿ|రూపాయలు)?/i);
  if (wageMatch) {
    const val = parseInt(wageMatch[1]);
    if (val >= 200 && val <= 5000) {
      extracted.wage = val;
    }
  }

  // Gender Preference
  if (t.includes('female') || t.includes('women') || t.includes('பெண்') || t.includes('महिला') || t.includes('ಮಹಿಳೆ') || t.includes('స్త్రీ')) {
    extracted.genderPreference = 'Female';
  } else if (t.includes('male') || t.includes('men') || t.includes('ஆண்') || t.includes('पुरुष') || t.includes('ಪುರುಷ') || t.includes('పురుషులు')) {
    extracted.genderPreference = 'Male';
  }

  // Date
  if (t.includes('today') || t.includes('urgent') || t.includes('இன்று') || t.includes('आज') || t.includes('ಇಂದು') || t.includes('ఈ రోజు')) {
    extracted.workDate = 'Today';
  } else if (t.includes('tomorrow') || t.includes('நாளை') || t.includes('कल') || t.includes('ನಾಳೆ') || t.includes('రేపు')) {
    extracted.workDate = 'Tomorrow';
  }

  // Location heuristic: if text has village/farm reference
  const locMatch = t.match(/(?:at|in|near|location|ஊர்|கிராமம்|गांव|ಹಳ್ಳಿ|గ్రామం)\s+([a-zA-Z\u0B80-\u0BFF\u0900-\u097F\u0C80-\u0CFF\u0C00-\u0C7F\s]+)/i);
  if (locMatch && locMatch[1]) {
    extracted.location = locMatch[1].trim().slice(0, 40);
  }

  return extracted;
}

// 1. Define LangGraph State Annotation
const JobStateAnnotation = Annotation.Root({
  workType: Annotation({ reducer: (prev, next) => next ?? prev, default: () => null }),
  laborersRequired: Annotation({ reducer: (prev, next) => next ?? prev, default: () => null }),
  wage: Annotation({ reducer: (prev, next) => next ?? prev, default: () => null }),
  location: Annotation({ reducer: (prev, next) => next ?? prev, default: () => null }),
  genderPreference: Annotation({ reducer: (prev, next) => next ?? prev, default: () => 'Any' }),
  workDate: Annotation({ reducer: (prev, next) => next ?? prev, default: () => 'Tomorrow' }),
  workTime: Annotation({ reducer: (prev, next) => next ?? prev, default: () => '6:00 AM - 2:00 PM' }),

  language: Annotation({ reducer: (prev, next) => next ?? prev, default: () => 'en' }),
  userMessage: Annotation({ reducer: (prev, next) => next ?? prev, default: () => '' }),
  farmerUid: Annotation({ reducer: (prev, next) => next ?? prev, default: () => '' }),
  farmerName: Annotation({ reducer: (prev, next) => next ?? prev, default: () => 'Farm Owner' }),
  farmerPhone: Annotation({ reducer: (prev, next) => next ?? prev, default: () => '' }),

  stage: Annotation({ reducer: (prev, next) => next ?? prev, default: () => 'collect_info' }),
  missingField: Annotation({ reducer: (prev, next) => next ?? prev, default: () => null }),
  botMessage: Annotation({ reducer: (prev, next) => next ?? prev, default: () => '' }),
  confirmationSummary: Annotation({ reducer: (prev, next) => next ?? prev, default: () => null }),
  isConfirmed: Annotation({ reducer: (prev, next) => next ?? prev, default: () => false }),
  isSubmitted: Annotation({ reducer: (prev, next) => next ?? prev, default: () => false }),
  createdJobId: Annotation({ reducer: (prev, next) => next ?? prev, default: () => null })
});

// NODE 1: collect_info
// Extracts structured fields from the user message and updates state
async function collectInfoNode(state) {
  const { userMessage, language } = state;
  const lang = language || 'en';

  // Check if user is confirming
  const lowerMsg = (userMessage || '').toLowerCase().trim();
  const isAffirmative =
    lowerMsg === 'yes' ||
    lowerMsg === 'confirm' ||
    lowerMsg === 'ok' ||
    lowerMsg === 'ஆம்' ||
    lowerMsg === 'சரி' ||
    lowerMsg === 'हाँ' ||
    lowerMsg === 'ಹೌದು' ||
    lowerMsg === 'ಸರಿ' ||
    lowerMsg === 'అవును' ||
    lowerMsg === 'సరే';

  if (state.stage === 'confirm' && isAffirmative) {
    return { isConfirmed: true, stage: 'submit' };
  }

  // Extract structured fields
  const extracted = extractStructuredJobFields(userMessage, lang);

  return {
    ...extracted,
    stage: 'validate'
  };
}

// NODE 2: validate
// Checks for missing/ambiguous fields, returns the next question or proceeds to confirm
async function validateNode(state) {
  const lang = state.language || 'en';
  const t = TEMPLATES[lang] || TEMPLATES.en;

  // Check required fields in priority sequence
  if (!state.workType) {
    return {
      stage: 'collect_info',
      missingField: 'workType',
      botMessage: t.ask_workType
    };
  }

  if (!state.laborersRequired || state.laborersRequired <= 0) {
    return {
      stage: 'collect_info',
      missingField: 'laborersRequired',
      botMessage: t.ask_laborersRequired
    };
  }

  if (!state.wage || state.wage <= 0) {
    return {
      stage: 'collect_info',
      missingField: 'wage',
      botMessage: t.ask_wage
    };
  }

  if (!state.location) {
    return {
      stage: 'collect_info',
      missingField: 'location',
      botMessage: t.ask_location
    };
  }

  if (!state.workDate) {
    return {
      stage: 'collect_info',
      missingField: 'workDate',
      botMessage: t.ask_workDate
    };
  }

  // All fields valid -> proceed to confirm
  return {
    stage: 'confirm',
    missingField: null
  };
}

// NODE 3: confirm
// Reads back the parsed job in plain language for the farmer
async function confirmNode(state) {
  const lang = state.language || 'en';
  const t = TEMPLATES[lang] || TEMPLATES.en;

  const summary = {
    workType: state.workType,
    laborersRequired: state.laborersRequired,
    genderPreference: state.genderPreference || 'Any',
    wage: state.wage,
    location: state.location,
    workDate: state.workDate || 'Tomorrow',
    workTime: state.workTime || '6:00 AM - 2:00 PM'
  };

  const plainSummary = `${summary.workType} • ${summary.laborersRequired} Workers (${summary.genderPreference}) • ₹${summary.wage}/day • ${summary.location} • ${summary.workDate}`;

  return {
    stage: 'confirm',
    confirmationSummary: summary,
    botMessage: `${t.confirm_title}\n🌾 ${plainSummary}\n\n${t.confirm_prompt}`
  };
}

// NODE 4: submit
// Writes to existing jobs table on confirmation & broadcasts alerts
async function submitNode(state, config) {
  const lang = state.language || 'en';
  const t = TEMPLATES[lang] || TEMPLATES.en;
  const io = config?.configurable?.io;
  const createNotificationHelper = config?.configurable?.createNotificationHelper;

  try {
    const ownerUser = await get('SELECT name, phone_number, location FROM users WHERE uid = ?', [state.farmerUid]);
    const hName = ownerUser?.name || state.farmerName || 'Farm Owner';
    const hPhone = ownerUser?.phone_number || state.farmerPhone || state.farmerUid;
    const finalLocation = state.location || ownerUser?.location || 'Local Farm';

    const result = await run(
      `INSERT INTO jobs (hirer_id, title, description, location, work_date, work_time, wage, laborers_required, hirer_name, hirer_phone, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
      [
        state.farmerUid,
        state.workType,
        `Auto-created via LangGraph Voice Agent: ${state.workType}`,
        finalLocation,
        state.workDate || 'Tomorrow',
        state.workTime || '6:00 AM - 2:00 PM',
        state.wage,
        parseInt(state.laborersRequired),
        hName,
        hPhone
      ]
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

    if (io) {
      io.emit('new-work-alert', jobPayload);
    }

    if (createNotificationHelper) {
      const { rows: laborers } = await query("SELECT uid FROM users WHERE role = 'laborer'");
      for (const l of laborers) {
        await createNotificationHelper(l.uid, 'new_job', 'New Work Alert', `${jobPayload.ownerName} posted: ${jobPayload.workTitle}`, createdJob.id);
      }
    }

    await logAuditAction(state.farmerUid, 'Create Job via LangGraph', `job:${createdJob.id}`, jobPayload);

    return {
      stage: 'completed',
      isSubmitted: true,
      createdJobId: createdJob.id,
      botMessage: `${t.success}\n📢 ID: #${createdJob.id} • ${state.workType} (${state.laborersRequired} workers @ ₹${state.wage}/day)`
    };
  } catch (err) {
    console.error('Submit Node Error:', err);
    return {
      stage: 'confirm',
      botMessage: `Failed to post job: ${err.message}. Please try again.`
    };
  }
}

// ROUTER: Conditional Edge after validate
function validateRouter(state) {
  if (state.stage === 'confirm') {
    return 'confirm';
  }
  return END;
}

// ROUTER: Conditional Edge after collect_info
function collectInfoRouter(state) {
  if (state.stage === 'submit' || state.isConfirmed) {
    return 'submit';
  }
  return 'validate';
}

// Build & Compile LangGraph StateGraph
function createJobPostingGraph() {
  const workflow = new StateGraph(JobStateAnnotation)
    .addNode('collect_info', collectInfoNode)
    .addNode('validate', validateNode)
    .addNode('confirm', confirmNode)
    .addNode('submit', submitNode)
    .addEdge(START, 'collect_info')
    .addConditionalEdges('collect_info', collectInfoRouter, {
      submit: 'submit',
      validate: 'validate'
    })
    .addConditionalEdges('validate', validateRouter, {
      confirm: 'confirm',
      [END]: END
    })
    .addEdge('confirm', END)
    .addEdge('submit', END);

  return workflow.compile();
}

// In-memory conversation state store across turns per farmer UID
const agentSessions = new Map();

async function runJobPostingAgentTurn({ uid, message, language = 'en', io, createNotificationHelper, reset = false }) {
  if (reset || !agentSessions.has(uid)) {
    const ownerUser = await get('SELECT name, phone_number, location FROM users WHERE uid = ?', [uid]);
    agentSessions.set(uid, {
      workType: null,
      laborersRequired: null,
      wage: null,
      location: ownerUser?.location || null,
      genderPreference: 'Any',
      workDate: 'Tomorrow',
      workTime: '6:00 AM - 2:00 PM',
      language: language || 'en',
      userMessage: '',
      farmerUid: uid,
      farmerName: ownerUser?.name || 'Farm Owner',
      farmerPhone: ownerUser?.phone_number || '',
      stage: 'collect_info',
      missingField: 'workType',
      botMessage: '',
      confirmationSummary: null,
      isConfirmed: false,
      isSubmitted: false,
      createdJobId: null
    });
  }

  const currentState = agentSessions.get(uid);
  currentState.userMessage = message || '';
  currentState.language = language || currentState.language;

  const app = createJobPostingGraph();
  const finalState = await app.invoke(currentState, {
    configurable: { io, createNotificationHelper }
  });

  // Persist updated state
  if (finalState.isSubmitted) {
    agentSessions.delete(uid); // Clean up on successful submission
  } else {
    agentSessions.set(uid, finalState);
  }

  return finalState;
}

module.exports = {
  createJobPostingGraph,
  runJobPostingAgentTurn,
  agentSessions
};
