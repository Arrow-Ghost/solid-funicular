/**
 * aiPromptProcessor.js - Semantic AI Prompt & Intent Parser
 * Converts arbitrary, natural spoken phrasing into structured vision detection targets.
 * Supports varied phrasings (e.g. "I'm thirsty, where's my drink?", "Is anyone sitting here?", "Where can I rest?")
 */

// 80 COCO Dataset Classes mapped with rich contextual synonyms & semantic associations
const COCO_SEMANTIC_MAP = {
  // Living - People
  person: [
    'person', 'human', 'someone', 'somebody', 'anyone', 'anybody', 'guy', 'girl',
    'dude', 'man', 'woman', 'people', 'individual', 'friend', 'colleague', 'myself',
    'who is there', 'any people', 'anyone around', 'standing here', 'sitting here'
  ],

  // Living - Pets & Animals
  dog: ['dog', 'puppy', 'hound', 'pooch', 'canine', 'pup', 'barking pet'],
  cat: ['cat', 'kitten', 'kitty', 'feline', 'pussycat'],
  bird: ['bird', 'parrot', 'avian', 'sparrow', 'pigeon'],
  horse: ['horse', 'pony', 'stallion', 'mare'],
  sheep: ['sheep', 'lamb'],
  cow: ['cow', 'cattle', 'calf', 'bull'],
  elephant: ['elephant'],
  bear: ['bear', 'teddy bear'],
  zebra: ['zebra'],
  giraffe: ['giraffe'],

  // Living - Plants
  'potted plant': [
    'plant', 'houseplant', 'potted plant', 'flower', 'flora', 'greenery',
    'succulent', 'cactus', 'foliage', 'botanical', 'shrub', 'leaf', 'leaves',
    'nature', 'indoor plant'
  ],

  // Non-Living - Hydration & Drinks
  bottle: [
    'bottle', 'water bottle', 'beverage container', 'hydration flask', 'flask',
    'thermos', 'tumbler', 'drink', 'water', 'mineral water', 'soda bottle',
    'something to drink', 'liquid container', 'beverage bottle', 'sipper'
  ],
  cup: [
    'cup', 'mug', 'coffee mug', 'teacup', 'glass', 'coffee cup', 'tea cup',
    'drinkware', 'coffee', 'tea', 'espresso'
  ],
  'wine glass': ['wine glass', 'goblet', 'champagne flute', 'stemware'],

  // Non-Living - Electronics & Gadgets
  'cell phone': [
    'phone', 'cell phone', 'smartphone', 'mobile', 'iphone', 'android',
    'cellular', 'handset', 'screen device', 'telephone', 'mobile phone',
    'calling device', 'text messages'
  ],
  laptop: [
    'laptop', 'computer', 'notebook', 'macbook', 'pc', 'workstation',
    'chromebook', 'portable computer', 'machine', 'coding device'
  ],
  tv: ['tv', 'television', 'monitor', 'screen', 'display', 'flat screen'],
  mouse: ['mouse', 'computer mouse', 'trackpad', 'pointer', 'optical mouse'],
  keyboard: ['keyboard', 'typing keys', 'keypad', 'mechanical keyboard'],
  remote: ['remote', 'remote control', 'controller', 'clicker'],
  microwave: ['microwave', 'micro oven'],
  oven: ['oven', 'stove', 'baking oven'],
  toaster: ['toaster'],
  refrigerator: ['fridge', 'refrigerator', 'cooler', 'freezer'],

  // Non-Living - Seating & Furniture
  chair: [
    'chair', 'seat', 'stool', 'office chair', 'armchair', 'desk chair',
    'somewhere to sit', 'where can i sit', 'place to sit', 'seating'
  ],
  couch: ['couch', 'sofa', 'lounge', 'settee', 'divan', 'davenport', 'sitting area'],
  bed: ['bed', 'mattress', 'sleeping place', 'bunk'],
  'dining table': ['table', 'desk', 'dining table', 'workbench', 'countertop', 'surface'],
  toilet: ['toilet', 'commode', 'restroom', 'washroom'],

  // Non-Living - Bags & Travel
  backpack: ['backpack', 'bag', 'knapsack', 'rucksack', 'schoolbag', 'bookbag'],
  handbag: ['handbag', 'purse', 'tote', 'shoulder bag', 'clutch'],
  suitcase: ['suitcase', 'luggage', 'baggage', 'travel bag', 'briefcase'],

  // Non-Living - Stationery & Everyday Items
  book: ['book', 'textbook', 'novel', 'manual', 'reading material', 'notebook', 'paper'],
  clock: ['clock', 'watch', 'timekeeper', 'wall clock', 'timepiece', 'what time'],
  scissors: ['scissors', 'shears', 'cutter'],
  umbrella: ['umbrella', 'parasol', 'rain shelter'],
  tie: ['tie', 'necktie', 'bowtie'],

  // Non-Living - Dining & Food
  fork: ['fork', 'cutlery', 'silverware'],
  knife: ['knife', 'butter knife', 'cutting tool'],
  spoon: ['spoon', 'teaspoon', 'soup spoon'],
  bowl: ['bowl', 'dish', 'cereal bowl', 'soup bowl'],
  banana: ['banana', 'bananas', 'fruit'],
  apple: ['apple', 'apples', 'fruit'],
  sandwich: ['sandwich', 'burger', 'sub'],
  orange: ['orange', 'citrus'],
  pizza: ['pizza', 'slice'],
  donut: ['donut', 'doughnut', 'pastry'],
  cake: ['cake', 'dessert', 'slice of cake']
};

export class AiPromptProcessor {
  constructor(options = {}) {
    this.geminiClient = options.geminiClient || null;
  }

  /**
   * Process arbitrary natural speech into structured AI vision intent
   * @param {string} transcript - Spoken phrase from user
   * @returns {Promise<{type: string, targetClasses: string[], targetName: string, prompt: string, spokenAck: string}>}
   */
  async process(transcript) {
    if (!transcript) {
      return { type: 'UNKNOWN', raw: '' };
    }

    const raw = transcript.trim();
    const lower = raw.toLowerCase();

    // 1. Scene description intents
    if (
      lower.includes('what do you see') ||
      lower.includes('what is in front of me') ||
      lower.includes("what's in front of me") ||
      lower.includes('describe what you see') ||
      lower.includes('describe the scene') ||
      lower.includes('describe scene') ||
      lower.includes('tell me what you see') ||
      lower.includes('look around') ||
      lower.includes('what is around') ||
      lower.includes('scan my surroundings')
    ) {
      return {
        type: 'DESCRIBE_SCENE',
        raw,
        spokenAck: 'Analyzing the visual environment around you.'
      };
    }

    // 2. Filter toggles
    if (
      lower.includes('living only') ||
      lower.includes('living things only') ||
      lower.includes('show living') ||
      lower.includes('show me living') ||
      lower.includes('any living beings') ||
      lower.includes('filter living')
    ) {
      return {
        type: 'FILTER_LIVING',
        raw,
        spokenAck: 'Focusing on living organisms only.'
      };
    }

    if (
      lower.includes('non living only') ||
      lower.includes('inanimate only') ||
      lower.includes('show non living') ||
      lower.includes('objects only') ||
      lower.includes('items only')
    ) {
      return {
        type: 'FILTER_NON_LIVING',
        raw,
        spokenAck: 'Focusing on non-living objects only.'
      };
    }

    if (
      lower.includes('show everything') ||
      lower.includes('show all') ||
      lower.includes('all objects') ||
      lower.includes('clear filter') ||
      lower.includes('reset filter')
    ) {
      return {
        type: 'FILTER_ALL',
        raw,
        spokenAck: 'Showing all detected objects.'
      };
    }

    // 3. Scan triggers
    if (
      lower === 'scan' ||
      lower === 'scan now' ||
      lower === 'refresh' ||
      lower === 'detect now' ||
      lower === 'scan again'
    ) {
      return {
        type: 'TRIGGER_SCAN',
        raw,
        spokenAck: 'Executing quick scan.'
      };
    }

    // 4. Semantic Entity Extraction (On-Device Natural Language Understanding)
    const semanticMatch = this.semanticExtract(lower);
    if (semanticMatch) {
      return {
        type: 'IDENTIFY_TARGET',
        targetClasses: semanticMatch.targetClasses,
        targetName: semanticMatch.targetName,
        category: semanticMatch.category,
        spokenAck: semanticMatch.spokenAck,
        raw
      };
    }

    // 5. Intelligent NLP Sentence Stripping Fallback
    // Strip common prompt prefixes to extract user's intended subject
    const cleanedTarget = this.cleanSubjectPhrase(raw);

    return {
      type: 'IDENTIFY_TARGET',
      targetClasses: [cleanedTarget.toLowerCase()],
      targetName: cleanedTarget,
      spokenAck: `Searching for "${cleanedTarget}"...`,
      raw
    };
  }

  /**
   * On-Device Semantic Entity Matching
   * Matches arbitrary phrasing to COCO classes using semantic synonym clusters
   */
  semanticExtract(lowerText) {
    // Check specific high-priority intent scenarios:

    // Thirst / Drink queries
    if (
      lowerText.includes('thirsty') ||
      lowerText.includes('something to drink') ||
      lowerText.includes('need a drink') ||
      lowerText.includes('hydrate') ||
      lowerText.includes('my water')
    ) {
      return {
        targetClasses: ['bottle', 'cup'],
        targetName: 'bottle or cup',
        category: 'non_living',
        spokenAck: 'Locating beverages and water bottles around you.'
      };
    }

    // Seating / Tired / Rest queries
    if (
      lowerText.includes('tired') ||
      lowerText.includes('sit down') ||
      lowerText.includes('take a seat') ||
      lowerText.includes('somewhere to sit') ||
      lowerText.includes('place to rest')
    ) {
      return {
        targetClasses: ['chair', 'couch'],
        targetName: 'chair or couch',
        category: 'non_living',
        spokenAck: 'Looking for seating furniture nearby.'
      };
    }

    // Work / Typing / Coding queries
    if (
      lowerText.includes('work') ||
      lowerText.includes('type something') ||
      lowerText.includes('my computer') ||
      lowerText.includes('coding')
    ) {
      return {
        targetClasses: ['laptop', 'keyboard', 'mouse'],
        targetName: 'laptop or workstation',
        category: 'non_living',
        spokenAck: 'Searching for your laptop and workstation.'
      };
    }

    // Checking for other humans / companions
    if (
      lowerText.includes('anyone around') ||
      lowerText.includes('any people') ||
      lowerText.includes('is someone there') ||
      lowerText.includes('someone here') ||
      lowerText.includes('anybody near me')
    ) {
      return {
        targetClasses: ['person'],
        targetName: 'person',
        category: 'living',
        spokenAck: 'Scanning for any people in your visual field.'
      };
    }

    // Check all synonyms in COCO_SEMANTIC_MAP
    let bestMatch = null;
    let maxMatchLen = 0;

    for (const [className, synonyms] of Object.entries(COCO_SEMANTIC_MAP)) {
      for (const syn of synonyms) {
        // Look for whole word or phrase matches including plurals (e.g. plant vs plants)
        const regex = new RegExp(`\\b${escapeRegExp(syn)}(s|es)?\\b`, 'i');
        if (regex.test(lowerText)) {
          if (syn.length > maxMatchLen) {
            maxMatchLen = syn.length;
            bestMatch = {
              targetClasses: [className],
              targetName: className,
              matchedSynonym: syn,
              category: this.getCategoryForClass(className),
              spokenAck: `Searching visual field for ${className}...`
            };
          }
        }
      }
    }

    return bestMatch;
  }

  /**
   * Cleans conversational filler words from sentences
   * e.g. "Could you please help me locate the red bottle on the desk?" -> "red bottle on the desk"
   */
  cleanSubjectPhrase(text) {
    let s = text.trim();

    // Strip greeting & courtesy phrases
    s = s.replace(/^(hey|hi|hello|agentx|please|could you|can you|would you|help me)\s+/i, '');
    s = s.replace(/^(tell me|let me know|find|locate|spot|identify|search for|look for)\s+/i, '');
    s = s.replace(/^(where is|where are|where's|is there a|are there any|do you see a|do you see any)\s+/i, '');
    s = s.replace(/^(the|my|a|an|any|some)\s+/i, '');
    s = s.replace(/[?.!]+$/, '').trim();

    return s || text;
  }

  /**
   * Determine whether a class is Living or Non-Living
   */
  getCategoryForClass(className) {
    const living = [
      'person', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
      'elephant', 'bear', 'zebra', 'giraffe', 'potted plant'
    ];
    return living.includes(className) ? 'living' : 'non_living';
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
