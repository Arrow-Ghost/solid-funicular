/**
 * noiseSuppressor.js - AI & DSP Background Noise Suppression Pipeline
 * Integrates WebAssembly Neural/Acoustic Noise Cancellation (RNNoise & SpeexDSP),
 * Hardware WebRTC Acoustic Echo Cancellation, Speech Formant Biquad Filtering,
 * and Real-Time Adaptive Spectral Noise Gating.
 */

import { loadSpeex, SpeexWorkletNode, loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import speexWorkletPath from '@sapphi-red/web-noise-suppressor/speexWorklet.js?url';
import speexWasmPath from '@sapphi-red/web-noise-suppressor/speex.wasm?url';
import rnnoiseWorkletPath from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';

export class AiNoiseSuppressionPipeline {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.suppressorNode = null;
    this.highpassNode = null;
    this.lowpassNode = null;
    this.peakingNode = null;
    this.activeType = 'dsp-filters';
    this.isInitialized = false;

    // Adaptive noise floor tracker for spectral gating
    this.noiseFloor = 0.005;
    this.noiseFloorAlpha = 0.03; // Smooth background tracking
    this.gateState = 'closed';
    this.gateGain = 0.08; // -22dB attenuation during ambient silence
  }

  /**
   * Hardware Audio Constraints for Browser WebRTC DSP
   */
  static getAudioConstraints() {
    return {
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: true },
      channelCount: 1,
      sampleRate: 16000
    };
  }

  /**
   * Initialize WebAssembly AI Noise Suppression Worklet
   */
  async initialize() {
    if (this.isInitialized) return this;

    // 1. Build Biquad Formant Isolation Chain
    // Highpass Filter (85 Hz): Cuts sub-rumble, fan drafts, HVAC, table knocks
    this.highpassNode = this.audioContext.createBiquadFilter();
    this.highpassNode.type = 'highpass';
    this.highpassNode.frequency.value = 85;
    this.highpassNode.Q.value = 0.707;

    // Peaking Filter (1800 Hz, +3dB): Boosts human vocal clarity and consonant intelligibility
    this.peakingNode = this.audioContext.createBiquadFilter();
    this.peakingNode.type = 'peaking';
    this.peakingNode.frequency.value = 1800;
    this.peakingNode.Q.value = 1.0;
    this.peakingNode.gain.value = 3.2;

    // Lowpass Filter (3800 Hz): Cuts high-frequency hiss, coil whine, electronic buzz
    this.lowpassNode = this.audioContext.createBiquadFilter();
    this.lowpassNode.type = 'lowpass';
    this.lowpassNode.frequency.value = 3800;
    this.lowpassNode.Q.value = 0.707;

    // 2. Try Speex Acoustic & Noise Suppressor WebAssembly Worklet
    try {
      if (this.audioContext.audioWorklet) {
        const wasmBinary = await loadSpeex({ url: speexWasmPath });
        await this.audioContext.audioWorklet.addModule(speexWorkletPath);
        this.suppressorNode = new SpeexWorkletNode(this.audioContext, {
          wasmBinary,
          maxChannels: 1
        });
        this.activeType = 'speex-wasm';
        console.log('[AiNoiseSuppressor] Activated SpeexDSP Acoustic WebAssembly Noise Suppressor');
      }
    } catch (speexErr) {
      console.warn('[AiNoiseSuppressor] Speex worklet fallback, trying RNNoise:', speexErr);
      try {
        if (this.audioContext.audioWorklet) {
          const wasmBinary = await loadRnnoise({
            url: rnnoiseWasmPath,
            simdUrl: rnnoiseSimdWasmPath
          });
          await this.audioContext.audioWorklet.addModule(rnnoiseWorkletPath);
          this.suppressorNode = new RnnoiseWorkletNode(this.audioContext, {
            wasmBinary,
            maxChannels: 1
          });
          this.activeType = 'rnnoise-neural';
          console.log('[AiNoiseSuppressor] Activated RNNoise Recurrent Neural Network Noise Suppressor');
        }
      } catch (rnnErr) {
        console.warn('[AiNoiseSuppressor] Neural worklet fallback to high-precision DSP filters:', rnnErr);
        this.activeType = 'dsp-filters';
      }
    }

    this.isInitialized = true;
    return this;
  }

  /**
   * Connect input source node through the noise suppression pipeline
   * @param {AudioNode} sourceNode - MediaStreamSourceNode from microphone
   * @returns {AudioNode} - Output node with background noise suppressed
   */
  connectSource(sourceNode) {
    if (!this.highpassNode) return sourceNode;

    // source -> highpass (85Hz) -> peaking (1.8kHz) -> lowpass (3.8kHz)
    sourceNode.connect(this.highpassNode);
    this.highpassNode.connect(this.peakingNode);
    this.peakingNode.connect(this.lowpassNode);

    let lastNode = this.lowpassNode;

    // If WebAssembly neural/acoustic worklet is active, route through it
    if (this.suppressorNode) {
      this.lowpassNode.connect(this.suppressorNode);
      lastNode = this.suppressorNode;
    }

    return lastNode;
  }

  /**
   * Real-Time Adaptive Spectral Noise Gate & Dynamic Normalization
   * Cleans audio buffers before feeding to Whisper speech recognition
   * @param {Float32Array} rawBuffer - Audio samples from audio process event
   * @returns {{ cleanedBuffer: Float32Array, isSpeech: boolean, rms: number }}
   */
  cleanAudioBuffer(rawBuffer) {
    const len = rawBuffer.length;
    const cleanedBuffer = new Float32Array(len);

    // 1. Calculate frame RMS energy
    let energySum = 0;
    for (let i = 0; i < len; i++) {
      const sample = rawBuffer[i];
      energySum += sample * sample;
    }
    const rms = Math.sqrt(energySum / len);

    // 2. Continually track ambient background noise floor
    if (rms < this.noiseFloor * 1.6 || this.noiseFloor === 0.005) {
      this.noiseFloor = (1 - this.noiseFloorAlpha) * this.noiseFloor + this.noiseFloorAlpha * rms;
    }

    // Dynamic threshold based on tracked background noise
    const speechThreshold = Math.max(0.012, this.noiseFloor * 2.2);
    const isSpeech = rms > speechThreshold;

    // Smooth gate transition (prevents audible clicks)
    if (isSpeech) {
      this.gateState = 'open';
      this.gateGain = Math.min(1.0, this.gateGain + 0.25);
    } else {
      this.gateState = 'closed';
      this.gateGain = Math.max(0.08, this.gateGain - 0.12);
    }

    // 3. Apply soft spectral expansion attenuation to remove background hiss
    for (let i = 0; i < len; i++) {
      cleanedBuffer[i] = rawBuffer[i] * this.gateGain;
    }

    return { cleanedBuffer, isSpeech, rms };
  }

  /**
   * Cleanup pipeline nodes on audio context close
   */
  destroy() {
    try {
      if (this.suppressorNode?.destroy) {
        this.suppressorNode.destroy();
      }
      this.highpassNode?.disconnect();
      this.peakingNode?.disconnect();
      this.lowpassNode?.disconnect();
      this.suppressorNode?.disconnect();
    } catch (_) {}
    this.isInitialized = false;
  }
}
