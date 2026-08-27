/**
 * sceneNarrator.js - Intelligent Automatic Scene Narrator
 * Continuously analyzes live detected objects, detects new entities,
 * and automatically speaks natural, conversational narrations of the scene in real time.
 */

export class SceneNarrator {
  constructor(options = {}) {
    this.voiceAgent = options.voiceAgent || null;
    this.onNarration = options.onNarration || (() => {});
    this.isEnabled = false;
    this.minIntervalMs = options.minIntervalMs || 6500; // Natural pacing between narrations
    this.lastNarrationTime = 0;
    this.lastStatusTime = 0;
    this.hasNarratedFirstScene = false;
    this.previousObjectNames = new Set();
    this.isMuted = false;
    this.phraseIndex = 0;
  }

  /**
   * Start or toggle auto-narration
   * @param {Array} currentObjects - Optional current objects to narrate immediately
   */
  toggle(currentObjects = []) {
    this.isEnabled = !this.isEnabled;
    if (this.isEnabled) {
      this.lastNarrationTime = 0;
      this.lastStatusTime = 0;
      this.hasNarratedFirstScene = false;
      this.previousObjectNames.clear();

      if (this.voiceAgent) {
        this.voiceAgent.playChime('listen_start');
      }

      // If objects are already present on screen, narrate them immediately!
      if (currentObjects && currentObjects.length > 0) {
        this.evaluateScene(currentObjects);
      } else {
        const startMsg = 'Live narrator active. Scanning camera view for objects...';
        this.onNarration({ text: startMsg, isStatus: true });
      }
    } else {
      const stopMsg = 'Live scene narration paused.';
      this.onNarration({ text: stopMsg, isStatus: true });
      if (this.voiceAgent) {
        this.voiceAgent.stopSpeaking();
      }
    }
    return this.isEnabled;
  }

  /**
   * Called on every detection frame (e.g. from YOLO at 30 FPS or Gemini)
   * Evaluates whether a new narration should be spoken.
   * @param {Array} objects - Active detected objects in view
   * @param {string} [geminiSummary] - Optional Gemini multimodal scene description
   */
  evaluateScene(objects = [], geminiSummary = null) {
    if (!this.isEnabled) return;

    // Do not narrate while user is actively speaking or mic is listening
    if (this.voiceAgent && this.voiceAgent.isListening) {
      return;
    }

    // Chrome speech synthesis safety & resume check
    if (window.speechSynthesis) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      if (window.speechSynthesis.speaking) {
        return;
      }
    }
    if (this.voiceAgent && this.voiceAgent.isSpeaking) {
      return;
    }

    const now = Date.now();
    const currentNames = new Set(objects.map((o) => o.name.toLowerCase()));

    // Case A: No objects detected in view
    if (objects.length === 0) {
      if (this.hasNarratedFirstScene && this.previousObjectNames.size > 0 && (now - this.lastNarrationTime >= 5000)) {
        this.previousObjectNames.clear();
        this.speakNarration('The visual field is now clear of recognizable objects.');
        this.lastNarrationTime = now;
      } else if (!this.hasNarratedFirstScene && (now - this.lastStatusTime >= 3500)) {
        this.onNarration({
          text: 'Scanning camera feed... Point camera towards people, laptops, bottles, cups, or plants.',
          isStatus: true
        });
        this.lastStatusTime = now;
      }
      return;
    }

    // Case B: Objects are detected!
    // 1. If we haven't narrated the initial scene yet, DO IT IMMEDIATELY (0ms wait)!
    if (!this.hasNarratedFirstScene) {
      this.hasNarratedFirstScene = true;
      this.lastNarrationTime = now;
      this.previousObjectNames = currentNames;
      this.narrate(objects, [], geminiSummary);
      return;
    }

    // 2. Check for newly appeared items
    const newItems = [...currentNames].filter((name) => !this.previousObjectNames.has(name));
    const timeSinceLast = now - this.lastNarrationTime;

    if (newItems.length > 0 && timeSinceLast >= 3500) {
      this.lastNarrationTime = now;
      this.previousObjectNames = currentNames;
      this.narrate(objects, newItems, geminiSummary);
      return;
    }

    // 3. Periodic natural scene overview if cooldown elapsed
    if (timeSinceLast >= this.minIntervalMs) {
      this.lastNarrationTime = now;
      this.previousObjectNames = currentNames;
      this.narrate(objects, [], geminiSummary);
    }
  }

  /**
   * Synthesize natural conversational narration
   */
  narrate(objects, newItems = [], geminiSummary = null) {
    if (!objects || objects.length === 0) return;

    // If Gemini provided a deep natural scene summary, use it
    if (geminiSummary && geminiSummary.length > 10) {
      this.speakNarration(geminiSummary);
      return;
    }

    // If specific new items entered the frame
    if (newItems.length > 0) {
      const formattedNew = newItems.map((n) => this.formatItemName(n, objects)).join(' and ');
      const newIntros = [
        `I now spot a ${formattedNew} in view.`,
        `A ${formattedNew} has appeared on screen.`,
        `Notice: detecting a ${formattedNew}.`
      ];
      const speech = newIntros[this.phraseIndex % newIntros.length];
      this.phraseIndex++;
      this.speakNarration(speech);
      return;
    }

    // Generate comprehensive scene narration from detected objects
    const speech = this.generateSceneDescription(objects);
    if (speech) {
      this.speakNarration(speech);
    }
  }

  /**
   * Natural Language Description Generator from YOLO Object Detections
   */
  generateSceneDescription(objects) {
    const living = objects.filter((o) => o.category === 'living');
    const nonLiving = objects.filter((o) => o.category === 'non_living');

    // Group items by name and count
    const countItems = (list) => {
      const counts = {};
      for (const item of list) {
        counts[item.name] = (counts[item.name] || 0) + 1;
      }
      return Object.entries(counts).map(([name, count]) => {
        return count === 1 ? `a ${name}` : `${count} ${name}s`;
      });
    };

    const livingPhrases = countItems(living);
    const nonLivingPhrases = countItems(nonLiving);

    // Spatial breakdown
    const leftItems = objects.filter((o) => o.location && o.location.includes('left')).map((o) => o.name);
    const rightItems = objects.filter((o) => o.location && o.location.includes('right')).map((o) => o.name);
    const centerItems = objects.filter((o) => o.location && o.location.includes('center')).map((o) => o.name);

    const intros = [
      'In front of you, I see',
      'Observing the scene, there is',
      'Right now I can see',
      'In your camera view, I detect',
      'Taking a look around, I spot'
    ];
    const intro = intros[this.phraseIndex % intros.length];
    this.phraseIndex++;

    let narration = '';

    // If both living organisms and objects are present
    if (living.length > 0 && nonLiving.length > 0) {
      narration = `${intro} ${livingPhrases.join(' and ')}, along with ${nonLivingPhrases.join(' and ')}.`;
    } else if (living.length > 0) {
      narration = `${intro} ${livingPhrases.join(' and ')}.`;
    } else if (nonLiving.length > 0) {
      // Add spatial positioning detail if available
      if (centerItems.length > 0 && (leftItems.length > 0 || rightItems.length > 0)) {
        const centerStr = [...new Set(centerItems)].join(' and ');
        const sides = [];
        if (leftItems.length > 0) sides.push(`a ${[...new Set(leftItems)].join(' and ')} on your left`);
        if (rightItems.length > 0) sides.push(`a ${[...new Set(rightItems)].join(' and ')} on your right`);
        narration = `${intro} a ${centerStr} in the center, with ${sides.join(', and ')}.`;
      } else {
        narration = `${intro} ${nonLivingPhrases.join(' and ')}.`;
      }
    }

    return narration;
  }

  formatItemName(name, objects) {
    const matched = objects.find((o) => o.name.toLowerCase() === name);
    if (matched && matched.location) {
      return `${matched.name} in the ${matched.location}`;
    }
    return name;
  }

  speakNarration(text) {
    this.onNarration({ text, isStatus: false });
    if (this.voiceAgent && !this.isMuted) {
      this.voiceAgent.speak(text);
    }
  }
}
