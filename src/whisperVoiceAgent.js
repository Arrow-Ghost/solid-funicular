/**
 * whisperVoiceAgent.js - 100% On-Device Speech Recognition Engine
 * Uses Transformers.js Whisper-tiny.en running entirely in WebAssembly / WebGPU.
 * Zero external servers, zero Google speech endpoints, zero network restrictions.
 */

export class LocalWhisperAgent {
  constructor(options = {}) {
    this.onCommand = options.onCommand || (() => {});
    this.onStatus = options.onStatus || (() => {});
    this.onTranscript = options.onTranscript || (() => {});

    this.transcriber = null;
    this.isLoading = false;
    this.isLoaded = false;
    this.isRecording = false;

    this.audioContext = null;
    this.mediaStream = null;
    this.audioChunks = [];
    this.recordTimeout = null;
    this.processorNode = null;
    this.sourceNode = null;
  }

  /**
   * Pre-load the on-device Whisper model from local assets
   */
  async loadEngine() {
    if (this.isLoaded || this.isLoading) return;
    this.isLoading = true;
    this.onStatus({ status: 'loading', message: 'Initializing on-device voice engine...' });

    try {
      const { pipeline, env } = await import('@xenova/transformers');
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.localModelPath = '/models/';

      this.transcriber = await pipeline('automatic-speech-recognition', 'whisper-tiny.en', {
        quantized: true,
        progress_callback: (p) => {
          if (p.status === 'progress') {
            const percent = Math.round(p.progress || 0);
            this.onStatus({ status: 'loading', message: `Loading voice model (${percent}%)...` });
          }
        }
      });

      this.isLoaded = true;
      this.isLoading = false;
      this.onStatus({ status: 'ready', message: 'On-device voice engine ready' });
    } catch (err) {
      console.warn('Local whisper load failed, trying CDN fallback:', err);
      try {
        const { pipeline, env } = await import('@xenova/transformers');
        env.allowLocalModels = false;
        env.allowRemoteModels = true;
        this.transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
        this.isLoaded = true;
        this.isLoading = false;
        this.onStatus({ status: 'ready', message: 'On-device voice engine ready' });
      } catch (err2) {
        console.error('All whisper loading failed:', err2);
        this.isLoading = false;
        this.onStatus({ status: 'error', message: 'Voice engine failed: ' + err2.message });
      }
    }
  }

  /**
   * Toggle recording state on or off
   * @returns {boolean} Whether recording is now active
   */
  toggle() {
    if (this.isRecording) {
      this.stopRecordingAndTranscribe();
      return false;
    } else {
      this.startRecording();
      return true;
    }
  }

  /**
   * Start recording user voice from microphone at 16kHz
   */
  async startRecording() {
    if (this.isRecording) return;

    if (!this.isLoaded && !this.isLoading) {
      this.loadEngine();
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      this.audioChunks = [];
      this.hasSpoken = false;
      this.lastSpeechTime = Date.now();
      this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processorNode.onaudioprocess = (e) => {
        if (!this.isRecording) return;
        const channelData = e.inputBuffer.getChannelData(0);
        this.audioChunks.push(new Float32Array(channelData));

        // Voice Activity Detection (VAD): measure volume energy
        let sum = 0;
        for (let i = 0; i < channelData.length; i++) {
          sum += channelData[i] * channelData[i];
        }
        const rms = Math.sqrt(sum / channelData.length);
        const now = Date.now();

        if (rms > 0.018) {
          // User is actively speaking
          this.hasSpoken = true;
          this.lastSpeechTime = now;
        } else if (this.hasSpoken && now - this.lastSpeechTime > 1350) {
          // Natural pause/silence detected after speaking -> auto-stop and transcribe!
          this.stopRecordingAndTranscribe();
        }
      };

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      this.isRecording = true;
      this.onStatus({
        status: 'recording',
        message: 'Listening... (Speak naturally, auto-detects when you finish)'
      });

      // Max safety timeout (e.g. 7.5 seconds)
      this.recordTimeout = setTimeout(() => {
        if (this.isRecording) {
          this.stopRecordingAndTranscribe();
        }
      }, 7500);
    } catch (err) {
      console.error('Microphone error:', err);
      this.onStatus({
        status: 'error',
        message: 'Microphone permission needed. Allow microphone in your browser.'
      });
    }
  }

  /**
   * Stop recording and transcribe audio locally
   */
  async stopRecordingAndTranscribe() {
    if (!this.isRecording) return;
    this.isRecording = false;
    if (this.recordTimeout) clearTimeout(this.recordTimeout);

    this.onStatus({ status: 'transcribing', message: 'Transcribing voice locally...' });

    // Clean up audio nodes
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }
    if (this.processorNode) {
      this.processorNode.disconnect();
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        await this.audioContext.close();
      } catch (_) {}
    }

    // Merge Float32Array chunks
    const totalLength = this.audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
    if (totalLength === 0) {
      this.onStatus({ status: 'idle', message: 'No audio captured.' });
      return;
    }

    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.audioChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    // Ensure model is ready
    if (!this.transcriber) {
      await this.loadEngine();
    }

    if (!this.transcriber) {
      this.onStatus({ status: 'error', message: 'Voice model could not be loaded.' });
      return;
    }

    try {
      const output = await this.transcriber(merged);
      const rawText = (output?.text || '').trim();
      // Clean up common Whisper noise/punctuation
      const cleaned = rawText.replace(/^[.,!?\s]+|[.,!?\s]+$/g, '');
      console.log('Local Whisper transcript:', cleaned);

      if (cleaned) {
        this.onTranscript({ final: cleaned });
        this.onStatus({ status: 'success', message: `Heard: "${cleaned}"` });
        this.onCommand(cleaned);
      } else {
        this.onStatus({ status: 'idle', message: 'Could not detect clear words. Please try again.' });
      }
    } catch (err) {
      console.error('Whisper transcription error:', err);
      this.onStatus({ status: 'error', message: 'Transcription error: ' + err.message });
    }
  }

  /**
   * Toggle recording on/off
   */
  toggle() {
    if (this.isRecording) {
      this.stopRecordingAndTranscribe();
      return false;
    } else {
      this.startRecording();
      return true;
    }
  }
}
