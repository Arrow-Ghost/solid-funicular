/**
 * voiceAgent.js - Speech Recognition, Text-to-Speech & Audio Effects
 * Integrates Web Speech API for hands-free or push-to-talk voice commands,
 * SpeechSynthesis for spoken responses, and Web Audio API for procedural sound effects.
 */

import { AiPromptProcessor } from './aiPromptProcessor.js';

export class VoiceAgent {
  constructor(options = {}) {
    this.onCommand = options.onCommand || (() => {});
    this.onTranscript = options.onTranscript || (() => {});
    this.onStateChange = options.onStateChange || (() => {});
    this.promptProcessor = new AiPromptProcessor();

    this.recognition = null;
    this.isListening = false;
    this.isSpeaking = false;
    this.ttsEnabled = true;
    this.speechSynthesis = window.speechSynthesis || null;
    this.audioCtx = null;

    this.initRecognition();
  }

  /**
   * Initialize Web Speech Recognition API if available.
   */
  initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('Web Speech Recognition API is not supported in this browser.');
      return false;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false; // Single utterance for clean on-device parsing
    this.recognition.interimResults = false; // Avoids continuous streaming WebSocket drops
    this.recognition.maxAlternatives = 1;
    this.recognition.lang = navigator.language || 'en-US';

    this.recognition.onstart = () => {
      this.isListening = true;
      this.playChime('listen_start');
      this.onStateChange({ isListening: true });
    };

    this.recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          finalTranscript += event.results[i][0].transcript;
        }
      }

      const trimmed = finalTranscript.trim();
      this.onTranscript({ interim: '', final: trimmed });

      if (trimmed) {
        this.processSpokenCommand(trimmed);
      }
    };

    this.recognition.onerror = (event) => {
      console.warn('Speech recognition event/error:', event.error);
      this.isListening = false;
      this.onStateChange({ isListening: false, error: event.error });
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.onStateChange({ isListening: false });
    };

    return true;
  }

  /**
   * Start listening for a voice command.
   */
  startListening() {
    if (!this.recognition) {
      this.initRecognition();
      if (!this.recognition) {
        throw new Error('Speech Recognition is not supported by your browser (try Chrome/Edge).');
      }
    }

    if (this.isListening) {
      this.stopListening();
      return;
    }

    try {
      this.recognition.start();
    } catch (err) {
      console.warn('Error starting speech recognition:', err);
    }
  }

  /**
   * Stop listening.
   */
  stopListening() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (err) {
        console.warn('Error stopping speech recognition:', err);
      }
      this.isListening = false;
      this.onStateChange({ isListening: false });
    }
  }

  /**
   * Toggle listening on/off.
   */
  toggleListening() {
    if (this.isListening) {
      this.stopListening();
      return false;
    } else {
      this.startListening();
      return true;
    }
  }

  /**
   * Interpret and parse spoken command into intent action using Semantic AI Prompt Processing.
   */
  async processSpokenCommand(transcript) {
    this.playChime('command_received');
    try {
      const intent = await this.promptProcessor.process(transcript);
      this.onCommand(intent);
    } catch (err) {
      console.warn('AI Prompt processing error:', err);
      // Fallback
      this.onCommand({
        type: 'IDENTIFY_TARGET',
        targetClasses: [transcript.trim().toLowerCase()],
        targetName: transcript.trim(),
        raw: transcript
      });
    }
  }

  /**
   * Speak a message aloud using Web SpeechSynthesis.
   */
  speak(text) {
    if (!this.ttsEnabled || !this.speechSynthesis) return;

    // Cancel any previous speaking
    this.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05; // Slightly brisk, modern assistant speed
    utterance.pitch = 1.0;

    // Choose preferred voice if available
    const voices = this.speechSynthesis.getVoices();
    const preferredVoice = voices.find(
      (v) =>
        (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha')) &&
        v.lang.startsWith('en')
    );
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => {
      this.isSpeaking = true;
    };
    utterance.onend = () => {
      this.isSpeaking = false;
    };
    utterance.onerror = () => {
      this.isSpeaking = false;
    };

    this.speechSynthesis.speak(utterance);
  }

  /**
   * Stop any active speech synthesis immediately.
   */
  stopSpeaking() {
    if (this.speechSynthesis) {
      this.speechSynthesis.cancel();
      this.isSpeaking = false;
    }
  }

  toggleTTS() {
    this.ttsEnabled = !this.ttsEnabled;
    if (!this.ttsEnabled) {
      this.stopSpeaking();
    }
    return this.ttsEnabled;
  }

  /**
   * Procedural sound effects using Web Audio API.
   * Zero audio assets needed, instantaneous playback.
   */
  playChime(type) {
    try {
      if (!this.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this.audioCtx = new AudioContext();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;

      if (type === 'listen_start') {
        // High-tech rising double tone
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'command_received') {
        // Crisp acknowledgment click
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.exponentialRampToValueAtTime(990, now + 0.08);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'target_locked') {
        // Futuristic lock-on double beep (880Hz & 1175Hz)
        [880, 1175].forEach((freq, idx) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          const start = now + idx * 0.08;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, start);
          gain.gain.setValueAtTime(0.15, start);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start(start);
          osc.stop(start + 0.12);
        });
      } else if (type === 'detection_success') {
        // Harmonious chord
        [523.25, 659.25, 783.99].forEach((freq) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now);
          gain.gain.setValueAtTime(0.06, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start(now);
          osc.stop(now + 0.25);
        });
      } else if (type === 'radar_sweep') {
        // Low sci-fi sweep
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.15);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      }
    } catch (e) {
      console.warn('Audio effect playback error:', e);
    }
  }
}
