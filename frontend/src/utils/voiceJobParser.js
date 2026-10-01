// Parse spoken voice inputs into structured job form fields across languages
export function parseVoiceJobDetails(speechText) {
  if (!speechText) return {};

  const text = speechText.toLowerCase();
  const result = {};

  // 1. Parse Work Type
  if (
    text.includes('harvest') ||
    text.includes('அறுவடை') ||
    text.includes('வெட்டு') ||
    text.includes('कटाई') ||
    text.includes('कटाव') ||
    text.includes('ಕಟಾವು') ||
    text.includes('ಕೋತ') ||
    text.includes('కోత')
  ) {
    result.workType = 'Harvesting';
  } else if (
    text.includes('weed') ||
    text.includes('களை') ||
    text.includes('புல்') ||
    text.includes('निराई') ||
    text.includes('कचरा') ||
    text.includes('ಕಳೆ') ||
    text.includes('కలుపు')
  ) {
    result.workType = 'Weeding';
  } else if (
    text.includes('plow') ||
    text.includes('plough') ||
    text.includes('tractor') ||
    text.includes('உழு') ||
    text.includes('ஏர்') ||
    text.includes('जुताई') ||
    text.includes('ಉಳುಮೆ') ||
    text.includes('దున్న')
  ) {
    result.workType = 'Plowing';
  } else if (
    text.includes('spray') ||
    text.includes('pesticide') ||
    text.includes('மருந்து') ||
    text.includes('தெளி') ||
    text.includes('छिड़काव') ||
    text.includes('ಸ್ಪ್ರೇ') ||
    text.includes('ಔಷಧ') ||
    text.includes('పిచికారీ')
  ) {
    result.workType = 'Spraying';
  } else if (
    text.includes('sow') ||
    text.includes('plant') ||
    text.includes('நாற்று') ||
    text.includes('நடு') ||
    text.includes('बुवाई') ||
    text.includes('रोपाई') ||
    text.includes('ನಾಟಿ') ||
    text.includes('బిత్తనె') ||
    text.includes('నాట్లు')
  ) {
    result.workType = 'Sowing';
  }

  // 2. Parse Worker Count (Digits or number words)
  const numberWordMap = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    ஒன்று: 1, இரண்டு: 2, மூன்று: 3, நான்கு: 4, ஐந்து: 5, ஆறு: 6, ஏழு: 7, எட்டு: 8, ஒன்பது: 9, பத்து: 10,
    एक: 1, दो: 2, तीन: 3, चार: 4, पांच: 5, छह: 6, सात: 7, आठ: 8, नौ: 9, दस: 10,
    ಒಂದು: 1, ಎರಡು: 2, ಮೂರು: 3, ನಾಲ್ಕು: 4, ಐದು: 5, ಆರು: 6, ಏಳು: 7, ಎಂಟು: 8, ಒಂಬತ್ತು: 9, ಹತ್ತು: 10,
    ఒకటి: 1, రెండు: 2, మూడు: 3, నాలుగు: 4, ఐదు: 5, ఆరు: 6, ఏడు: 7, ఎనిమిది: 8, తొమ్మిది: 9, పది: 10
  };

  // Check for digits followed by workers / ஆட்கள் / मजदूर
  const digitWorkerMatch = text.match(/(\d+)\s*(worker|workers|people|ஆள்|ஆட்கள்|மஜ்தூர்|मजदूर|ಕಾರ್ಮಿಕ|ಕೂಲೀలు|ಜನ)/i);
  if (digitWorkerMatch) {
    result.workerCount = parseInt(digitWorkerMatch[1], 10);
  } else {
    // Check words
    for (const [word, val] of Object.entries(numberWordMap)) {
      if (text.includes(word)) {
        result.workerCount = val;
        break;
      }
    }
  }

  // 3. Parse Wage (e.g. 500 rupees, 600 rs, ₹700, 500 ரூபாய், 500 रुपये, 500 ರೂಪಾಯಿ)
  const wageMatch = text.match(/(\d{3,4})\s*(rupee|rupees|rs|inr|ரூபாய்|ரூ|रुपये|रुपया|ರೂಪಾಯಿ|ರೂ|రూపాయలు|రూ)?/i);
  if (wageMatch) {
    const parsedWage = parseInt(wageMatch[1], 10);
    if (parsedWage >= 200 && parsedWage <= 3000) {
      result.dailyWage = parsedWage;
    }
  }

  // 4. Parse Date Option
  if (
    text.includes('today') ||
    text.includes('urgent') ||
    text.includes('இன்று') ||
    text.includes('இன்னைக்கு') ||
    text.includes('आज') ||
    text.includes('ಇಂದು') ||
    text.includes('ఈ రోజు')
  ) {
    result.dateOption = 'Today';
  } else if (
    text.includes('tomorrow') ||
    text.includes('நாளை') ||
    text.includes('நாளைக்கு') ||
    text.includes('कल') ||
    text.includes('ನಾಳೆ') ||
    text.includes('రేపు')
  ) {
    result.dateOption = 'Tomorrow Morning';
  }

  return result;
}
