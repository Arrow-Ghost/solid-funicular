/**
 * sceneNarrator.js - Intelligent Automatic Scene Narrator
 * Continuously analyzes live detected objects, detects new entities,
 * and automatically speaks natural, conversational narrations of the scene.
 */

export class SceneNarrator {
  constructor(options = {}) {
    this.voiceAgent = options.voiceAgent || null;
    this.onNarration = options.onNarration || (() => {});
    this.isEnabled = false;
    this.minIntervalMs = options.minIntervalMs || 7000; // Cooldown between periodic narrations
    this.lastNarrationTime = 0;
    this.previousObjectNames = new Set();
    this.narrationTimer = null;
    this.isMuted = false;
    this.phraseIndex = 0;
  }

  /**
   * Start or toggle auto-narration
   */
  toggle() {
    this.isEnabled = !this.isEnabled;
    if (this.isEnabled) {
      this.lastNarrationTime = 0;
      this.previousObjectNames.clear();
      const startMsg = 'Live scene narration active. Observing your environment...';
      this.onNarration({ text: startMsg, isStatus: true });
      if (this.voiceAgent) {
        this.voiceAgent.speak('Live scene narration enabled.');
      }
    } else {
      const stopMsg = 'Live scene narration paused.';
      this.onNarration({ text: stopMsg, isStatus: true });
      if (this.voiceAgent && this.voiceAgent.speechSynthesis) {
        this.voiceAgent.speechSynthesis.cancel();
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

    // Do not narrate if voice agent is currently listening or speaking
    if (this.voiceAgent && (this.voiceAgent.isListening || this.voiceAgent.isSpeaking)) {
      return;
    }
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
      return;
    }

    const now = Date.now();
    const currentNames = new Set(objects.map((o) => o.name.toLowerCase()));

    // Check for newly appeared or disappeared objects
    const newItems = [...currentNames].filter((name) => !this.previousObjectNames.has(name));
    const isFirstNarration = this.lastNarrationTime === 0;
    const timeSinceLast = now - this.lastNarrationTime;

    // Trigger conditions:
    // 1. First narration upon activation
    // 2. Significant new object entered the frame AND at least 4s passed
    // 3. Periodic cooldown elapsed (7s) AND objects exist
    const shouldTriggerNewItem = newItems.length > 0 && timeSinceLast >= 4500;
    const shouldTriggerPeriodic = timeSinceLast >= this.minIntervalMs;

    if (isFirstNarration || shouldTriggerNewItem || shouldTriggerPeriodic) {
      this.narrate(objects, newItems, geminiSummary);
      this.lastNarrationTime = now;
      this.previousObjectNames = currentNames;
    }
  }

  /**
   * Synthesize natural conversational narration
   */
  narrate(objects, newItems = [], geminiSummary = null) {
    if (objects.length === 0) {
      if (this.previousObjectNames.size > 0) {
        const clearMsg = 'Your visual field is currently clear of recognizable objects.';
        this.speakNarration(clearMsg);
      }
      return;
    }

    // If Gemini provided a deep natural scene summary, use it
    if (geminiSummary && geminiSummary.length > 10) {
      this.speakNarration(geminiSummary);
      return;
    }

    // If specific new items entered the frame
    if (newItems.length > 0 && this.lastNarrationTime > 0) {
      const formattedNew = newItems.map((n) => this.formatItemName(n, objects)).join(' and ');
      const newIntros = [
        `I now see a ${formattedNew} in view.`,
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
