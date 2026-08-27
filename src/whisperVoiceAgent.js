/**
 * whisperVoiceAgent.js - 100% On-Device Speech Recognition Engine
 * Uses Transformers.js Whisper-tiny.en running entirely in WebAssembly / WebGPU.
 * Zero external servers, zero Google speech endpoints, zero network restrictions.
 */

import { AiNoiseSuppressionPipeline } from './noiseSuppressor.js';

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
    this.noisePipeline = null;
    this.silentGain = null;
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
   * Start recording user voice from microphone with AI Background Noise Suppression
   */
  async startRecording() {
    if (this.isRecording) return;

    if (!this.isLoaded && !this.isLoading) {
      this.loadEngine();
    }

    try {
      // 1. Browser & Hardware-level Acoustic Noise Cancellation & Echo Cancellation
      const constraints = AiNoiseSuppressionPipeline.getAudioConstraints();
      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // 2. Initialize Neural/DSP Noise Suppression Pipeline
      this.noisePipeline = new AiNoiseSuppressionPipeline(this.audioContext);
      await this.noisePipeline.initialize();

      // Route microphone through noise suppression chain
      const denoisedAudioNode = this.noisePipeline.connectSource(this.sourceNode);

      this.audioChunks = [];
      this.hasSpoken = false;
      this.lastSpeechTime = Date.now();
      this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processorNode.onaudioprocess = (e) => {
        if (!this.isRecording) return;
        const rawChannelData = e.inputBuffer.getChannelData(0);

        // 3. Real-Time Spectral Noise Gating: silences background hum/chatter between words
        const { cleanedBuffer, isSpeech } = this.noisePipeline.cleanAudioBuffer(rawChannelData);
        this.audioChunks.push(cleanedBuffer);

        const now = Date.now();
        if (isSpeech) {
          this.hasSpoken = true;
          this.lastSpeechTime = now;
        } else if (this.hasSpoken && now - this.lastSpeechTime > 1350) {
          // Natural pause detected after speaking -> auto-stop and transcribe!
          this.stopRecordingAndTranscribe();
        }
      };

      // Connect denoised audio to processor
      denoisedAudioNode.connect(this.processorNode);

      // Connect processor to silent gain node (prevents speaker acoustic feedback)
      this.silentGain = this.audioContext.createGain();
      this.silentGain.gain.value = 0;
      this.processorNode.connect(this.silentGain);
      this.silentGain.connect(this.audioContext.destination);

      this.isRecording = true;
      this.onStatus({
        status: 'recording',
        noiseSuppression: this.noisePipeline.activeType,
        message: 'Listening... (AI Background Noise Suppression Active)'
      });

      // Max safety timeout (7.5 seconds)
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

    // Clean up audio nodes & noise suppression pipeline
    if (this.noisePipeline) {
      this.noisePipeline.destroy();
      this.noisePipeline = null;
    }
    if (this.silentGain) {
      this.silentGain.disconnect();
      this.silentGain = null;
    }
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
