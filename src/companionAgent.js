/**
 * companionAgent.js - Intelligent AI Visual Companion for Blind & Low-Vision Users
 * Provides empathetic, continuous spoken conversations grounded in real-time camera vision.
 * Supports clock-face spatial direction, proximity estimation, obstacle alerts, and conversational turn memory.
 */

export class VisualCompanionAgent {
  constructor(options = {}) {
    this.voiceAgent = options.voiceAgent || null;
    this.whisperAgent = options.whisperAgent || null;
    this.cameraManager = options.cameraManager || null;
    this.geminiClient = options.geminiClient || null;
    this.onStateChange = options.onStateChange || (() => {});
    this.onDialogue = options.onDialogue || (() => {});
    this.onTargetFound = options.onTargetFound || (() => {});

    this.isActive = false;
    this.history = []; // Conversational history: { role: 'user'|'assistant', text: string }
    this.lastDiscussedTarget = null;
    this.isProcessing = false;
  }

  /**
   * Start or stop Companion Mode
   */
  toggle(currentObjects = []) {
    this.isActive = !this.isActive;

    if (this.isActive) {
      this.history = [];
      this.lastDiscussedTarget = null;
      this.onStateChange({ active: true, state: 'speaking' });

      const welcome =
        'Hello! I am your visual companion. I can see your surroundings in real time and guide you. What would you like to know?';
      this.speakAndListen(welcome);
    } else {
      this.onStateChange({ active: false, state: 'idle' });
      if (this.voiceAgent) {
        this.voiceAgent.stopSpeaking();
      }
      if (this.whisperAgent && this.whisperAgent.isRecording) {
        this.whisperAgent.stopRecordingAndTranscribe();
      }
    }
    return this.isActive;
  }

  /**
   * Handle user utterance from on-device Whisper speech recognition
   */
  async handleUserUtterance(userText, currentObjects = []) {
    if (!this.isActive || !userText || userText.trim().length === 0) return;

    this.onDialogue({ role: 'user', text: userText });
    this.history.push({ role: 'user', text: userText });
    if (this.history.length > 8) this.history.shift();

    this.onStateChange({ active: true, state: 'thinking' });

    // Generate grounded contextual response
    const reply = await this.generateResponse(userText.trim(), currentObjects);

    this.history.push({ role: 'assistant', text: reply });
    if (this.history.length > 8) this.history.shift();

    this.speakAndListen(reply);
  }

  /**
   * Speak reply aloud and seamlessly re-open the microphone for hands-free conversation
   */
  speakAndListen(text) {
    this.onDialogue({ role: 'assistant', text });
    this.onStateChange({ active: true, state: 'speaking' });

    if (!this.voiceAgent) return;

    // Speak using speech synthesis, automatically engaging listening turn upon completion
    this.voiceAgent.speak(text, () => {
      if (this.isActive) {
        this.promptForNextTurn();
      }
    });
  }

  /**
   * Automatically start listening for user's next spoken question (Hands-Free turn taking)
   */
  promptForNextTurn() {
    if (!this.isActive) return;

    this.onStateChange({ active: true, state: 'listening' });
    if (this.voiceAgent) {
      this.voiceAgent.playChime('listen_start');
    }

    if (this.whisperAgent) {
      setTimeout(() => {
        if (this.isActive && !this.whisperAgent.isRecording) {
          this.whisperAgent.startRecording();
        }
      }, 350);
    }
  }

  /**
   * Generate Spatially Grounded Conversational Response
   */
  async generateResponse(query, objects = []) {
    const q = query.toLowerCase();

    // 1. Exit / Stop Commands
    if (
      q === 'stop' ||
      q === 'exit' ||
      q === 'goodbye' ||
      q === 'bye' ||
      q.includes('stop companion') ||
      q.includes('turn off companion') ||
      q.includes('pause companion')
    ) {
      this.isActive = false;
      this.onStateChange({ active: false, state: 'idle' });
      return 'Companion mode paused. Call me anytime you need assistance.';
    }

    // 2. Obstacle / Path Clearance Check ("Can I walk?", "Is path clear?")
    if (
      q.includes('walk') ||
      q.includes('path') ||
      q.includes('step forward') ||
      q.includes('clear') ||
      q.includes('safe to move') ||
      q.includes('in my way') ||
      q.includes('obstacle')
    ) {
      return this.evaluateWalkingPath(objects);
    }

    // 3. People / Presence Queries ("Is anyone there?", "Who is around me?")
    if (
      q.includes('anyone') ||
      q.includes('someone') ||
      q.includes('person') ||
      q.includes('people') ||
      q.includes('who is') ||
      q.includes('standing near me')
    ) {
      return this.evaluatePeoplePresence(objects);
    }

    // 4. Object Search / Locating ("Where is my bottle/phone/laptop/keys?")
    const searchTarget = this.extractTargetFromQuery(q);
    if (searchTarget) {
      const match = this.findMatchingObject(searchTarget, objects);
      if (match) {
        this.lastDiscussedTarget = match;
        this.onTargetFound(match);
        const spatialDesc = this.getSpatialClockDescription(match);
        return `Yes, I see your ${match.name}. It is ${spatialDesc}.`;
      } else {
        return `I do not spot a ${searchTarget} in your current camera view. Try turning slowly to scan the rest of the room.`;
      }
    }

    // 5. Follow-up Proximity Queries ("Is it close?", "Can I reach it?")
    if (
      (q.includes('close') || q.includes('reach') || q.includes('near') || q.includes('far')) &&
      this.lastDiscussedTarget
    ) {
      const target = objects.find((o) => o.name === this.lastDiscussedTarget.name) || this.lastDiscussedTarget;
      const prox = this.estimateProximity(target);
      return `The ${target.name} is ${prox.distanceStr}, located ${this.getClockPosition(target)}.`;
    }

    // 6. General Scene Overview ("What's around me?", "Describe what you see")
    if (
      q.includes('around me') ||
      q.includes('describe') ||
      q.includes('what do you see') ||
      q.includes('what is in front') ||
      q.includes('what is here') ||
      q.includes('where am i') ||
      q.includes('surroundings')
    ) {
      return this.generateComprehensiveSceneSummary(objects);
    }

    // 7. Seating / Rest Queries ("Where can I sit?")
    if (q.includes('sit') || q.includes('seat') || q.includes('chair') || q.includes('couch')) {
      const seat = objects.find((o) => o.name === 'chair' || o.name === 'couch');
      if (seat) {
        this.lastDiscussedTarget = seat;
        this.onTargetFound(seat);
        return `There is a ${seat.name} ${this.getSpatialClockDescription(seat)}.`;
      }
      return 'I do not spot any chairs or couches in this view. Try panning your camera around.';
    }

    // 8. Polite Conversational Fallbacks
    if (q.includes('thank') || q.includes('thanks')) {
      return "You're very welcome! I'm right here with you. What else would you like to check?";
    }
    if (q.includes('hello') || q.includes('hi ') || q === 'hi' || q.includes('hey')) {
      return 'Hello! I am watching your camera feed. Ask me to find an object, check your path, or describe the room.';
    }

    // 9. Default Grounded Response
    if (objects.length > 0) {
      const count = objects.length;
      const names = [...new Set(objects.map((o) => o.name))].slice(0, 3).join(', ');
      return `I can see ${count} objects around you, including ${names}. Would you like me to guide you to one of them?`;
    }

    return 'I do not see any recognizable items in your current camera view. Try pointing your camera across your desk or around the room.';
  }

  /**
   * Spatial Clock-Face Positioning
   * Maps normalized bounding box [ymin, xmin, ymax, xmax] (0..1000 scale) to clock directions
   */
  getClockPosition(obj) {
    if (!obj.box_2d) return 'in front of you';
    const [ymin, xmin, ymax, xmax] = obj.box_2d;
    const cx = (xmin + xmax) / 2;

    if (cx < 200) return 'to your far left, at 9 o\'clock';
    if (cx >= 200 && cx < 360) return 'to your left, at 10 o\'clock';
    if (cx >= 360 && cx < 440) return 'slightly to your left, at 11 o\'clock';
    if (cx >= 440 && cx <= 560) return 'straight ahead, directly at your 12 o\'clock';
    if (cx > 560 && cx <= 640) return 'slightly to your right, at 1 o\'clock';
    if (cx > 640 && cx <= 800) return 'to your right, at 2 o\'clock';
    return 'to your far right, at 3 o\'clock';
  }

  /**
   * Proximity & Distance Estimation from 2D Bounding Box
   */
  estimateProximity(obj) {
    if (!obj.box_2d) {
      return { distanceStr: 'within sight', isArmReach: false };
    }
    const [ymin, xmin, ymax, xmax] = obj.box_2d;
    const height = ymax - ymin;
    const width = xmax - xmin;
    const area = height * width;

    if (area > 200000 || height > 550 || ymax > 850) {
      return { distanceStr: 'very close, within arm\'s reach', isArmReach: true };
    }
    if (area > 60000 || height > 320) {
      return { distanceStr: 'about 3 to 4 feet away', isArmReach: false };
    }
    return { distanceStr: 'roughly 6 to 8 feet away', isArmReach: false };
  }

  getSpatialClockDescription(obj) {
    const clock = this.getClockPosition(obj);
    const prox = this.estimateProximity(obj);
    return `${clock}, ${prox.distanceStr}`;
  }

  /**
   * Path Clearance and Obstacle Safety Analysis
   */
  evaluateWalkingPath(objects) {
    if (objects.length === 0) {
      return 'The visible path straight ahead appears open and clear of recognizable obstacles.';
    }

    // Corridor: center corridor between x=300 and x=700, and lower half of view (ymin > 350)
    const obstacles = objects.filter((o) => {
      if (!o.box_2d) return false;
      const [ymin, xmin, ymax, xmax] = o.box_2d;
      const cx = (xmin + xmax) / 2;
      return cx >= 300 && cx <= 700 && ymax >= 450;
    });

    if (obstacles.length > 0) {
      const obstacleNames = obstacles.map((o) => `a ${o.name} ${this.getClockPosition(o)}`).join(', and ');
      return `Caution: I detect ${obstacleNames}. Please proceed carefully or step slightly to the side.`;
    }

    return 'Your central walking path immediately ahead appears clear for several feet.';
  }

  /**
   * Detect People and Human Presence
   */
  evaluatePeoplePresence(objects) {
    const people = objects.filter((o) => o.name.toLowerCase() === 'person' || o.category === 'living');
    const humans = people.filter((p) => p.name.toLowerCase() === 'person');

    if (humans.length === 0) {
      return 'I do not see anyone in your camera view right now.';
    }

    if (humans.length === 1) {
      const desc = this.getSpatialClockDescription(humans[0]);
      return `There is one person ${desc}.`;
    }

    return `I can see ${humans.length} people in view. The closest person is ${this.getSpatialClockDescription(humans[0])}.`;
  }

  /**
   * Generate Comprehensive Scene Overview
   */
  generateComprehensiveSceneSummary(objects) {
    if (objects.length === 0) {
      return 'Your visual field is clear. I do not spot any recognizable objects right now.';
    }

    const living = objects.filter((o) => o.category === 'living');
    const nonLiving = objects.filter((o) => o.category === 'non_living');

    const descriptions = objects.slice(0, 4).map((obj) => {
      return `a ${obj.name} ${this.getClockPosition(obj)}`;
    });

    return `In your surroundings, I observe ${descriptions.join(', and ')}.`;
  }

  /**
   * Search Target Extraction
   */
  extractTargetFromQuery(query) {
    const triggers = [
      'where is my',
      'where is the',
      'where is a',
      'find my',
      'find the',
      'find a',
      'look for my',
      'look for the',
      'can you see my',
      'can you see the',
      'locate my',
      'locate the',
      'spot my',
      'spot the'
    ];

    for (const trig of triggers) {
      if (query.includes(trig)) {
        let after = query.split(trig)[1].trim();
        after = after.replace(/[?.!]+$/, '').trim();
        return after;
      }
    }
    return null;
  }

  findMatchingObject(targetQuery, objects) {
    const lowerQuery = targetQuery.toLowerCase();
    return objects.find((o) => {
      const name = o.name.toLowerCase();
      return name.includes(lowerQuery) || lowerQuery.includes(name);
    });
  }
}
