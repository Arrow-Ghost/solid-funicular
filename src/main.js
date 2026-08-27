/**
 * main.js - AgentX Vision Core Orchestrator
 * Integrates Camera feed, In-Browser YOLO Real-Time Detection (30 FPS),
 * Gemini Multimodal Cloud Vision, Voice Agent & TTS, AR HUD, and UI controls.
 */

import { CameraManager } from './camera.js';
import { GeminiVisionClient } from './geminiVision.js';
import { YoloVisionDetector } from './yoloVision.js';
import { VoiceAgent } from './voiceAgent.js';
import { LocalWhisperAgent } from './whisperVoiceAgent.js';
import { VisualCompanionAgent } from './companionAgent.js';
import { HudRenderer } from './hudRenderer.js';

// DOM Elements
const videoEl = document.getElementById('cameraFeed');
const canvasEl = document.getElementById('hudCanvas');
const liveStatusDot = document.getElementById('liveStatusDot');
const liveStatusText = document.getElementById('liveStatusText');
const latencyValueEl = document.getElementById('latencyValue');
const totalDetectedCountEl = document.getElementById('totalDetectedCount');
const cameraStatusBadge = document.getElementById('cameraStatusBadge');
const cameraStatusLabel = document.getElementById('cameraStatusLabel');
const engineToggleBtn = document.getElementById('engineToggleBtn');
const engineIcon = document.getElementById('engineIcon');
const engineLabel = document.getElementById('engineLabel');

// Companion Elements (For Blind & Low-Vision Users)
const companionToggleBtn = document.getElementById('companionToggleBtn');
const companionIcon = document.getElementById('companionIcon');
const companionLabel = document.getElementById('companionLabel');
const companionHud = document.getElementById('companionHud');
const companionStateBadge = document.getElementById('companionStateBadge');
const companionUserBubble = document.getElementById('companionUserBubble');
const companionUserText = document.getElementById('companionUserText');
const companionAiBubble = document.getElementById('companionAiBubble');
const companionAiText = document.getElementById('companionAiText');

// Floating Dock Controls
const micBtn = document.getElementById('micBtn');
const scanBtn = document.getElementById('scanBtn');
const scanBtnLabel = document.getElementById('scanBtnLabel');
const autoScanToggleBtn = document.getElementById('autoScanToggleBtn');
const switchCamBtn = document.getElementById('switchCamBtn');
const filterChips = document.querySelectorAll('.filter-chip');

// Inventory Drawer Elements
const inventoryDrawer = document.getElementById('inventoryDrawer');
const toggleDrawerBtn = document.getElementById('toggleDrawerBtn');
const closeDrawerBtn = document.getElementById('closeDrawerBtn');
const statTotalVal = document.getElementById('statTotalVal');
const statLivingVal = document.getElementById('statLivingVal');
const statNonLivingVal = document.getElementById('statNonLivingVal');
const objectsListContainer = document.getElementById('objectsListContainer');
const emptyObjectsMsg = document.getElementById('emptyObjectsMsg');
const voiceSampleChips = document.querySelectorAll('.voice-sample-chip');

// Settings Modal Elements
const openSettingsBtn = document.getElementById('openSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const settingsModal = document.getElementById('settingsModal');
const engineSelect = document.getElementById('engineSelect');
const apiKeyInput = document.getElementById('apiKeyInput');
const modelSelect = document.getElementById('modelSelect');
const scanIntervalRange = document.getElementById('scanIntervalRange');
const intervalDisplay = document.getElementById('intervalDisplay');
const ttsCheckbox = document.getElementById('ttsCheckbox');

// Application State
const state = {
  engine: localStorage.getItem('vision_engine') || 'yolo', // 'yolo' (default 30 FPS) or 'gemini'
  isYoloRunning: false,
  autoScan: false, // For Gemini periodic scan
  autoScanInterval: 4000,
  autoScanTimer: null,
  isScanning: false,
  activeFilter: 'all',
  lastScanTime: 0,
  detectedObjects: [],
  lastInventoryUpdate: 0
};

// Initialize Subsystems
const yoloDetector = new YoloVisionDetector({
  onStatusChange: handleYoloStatusChange
});

const geminiClient = new GeminiVisionClient();

const cameraManager = new CameraManager(videoEl, {
  facingMode: 'environment',
  onStatusChange: handleCameraStatusChange
});

const voiceAgent = new VoiceAgent({
  onCommand: handleVoiceCommand,
  onTranscript: handleVoiceTranscript,
  onStateChange: handleVoiceStateChange
});

// 100% On-Device Whisper Voice Agent (Runs in WebAssembly / WebGPU - Zero Cloud Speech Servers)
const localWhisper = new LocalWhisperAgent({
  onCommand: (cmdText) => {
    companionAgent.handleUserUtterance(cmdText, state.detectedObjects);
  },
  onStatus: (status) => {
    if (status.status === 'recording') {
      micBtn.classList.add('listening');
      updateCompanionUI(companionAgent.isActive, 'listening');
    } else if (status.status === 'transcribing') {
      micBtn.classList.remove('listening');
      updateCompanionUI(companionAgent.isActive, 'thinking');
    } else {
      micBtn.classList.remove('listening');
    }
  },
  onTranscript: ({ final }) => {
    // Utterances routed to companionAgent
  }
});

const hudRenderer = new HudRenderer(canvasEl, videoEl, {
  onSelect: handleObjectSelected
});

// Visual Companion Agent (Conversational Assistant for Blind & Low-Vision)
const companionAgent = new VisualCompanionAgent({
  voiceAgent,
  whisperAgent: localWhisper,
  cameraManager,
  geminiClient,
  onStateChange: ({ active, state }) => {
    updateCompanionUI(active, state);
  },
  onDialogue: ({ role, text }) => {
    if (role === 'user') {
      if (companionUserBubble) {
        companionUserBubble.style.display = 'flex';
        companionUserText.textContent = text;
      }
    } else {
      if (companionAiBubble) {
        companionAiText.textContent = text;
      }
    }
  },
  onTargetFound: (match) => {
    hudRenderer.setTargetLock(match);
    highlightTargetInDrawer(match);
  }
});

function updateCompanionUI(active, state) {
  if (!companionToggleBtn || !companionLabel || !companionIcon) return;
  if (active) {
    companionToggleBtn.classList.add('active');
    companionLabel.textContent = 'COMPANION: LIVE';
    companionIcon.textContent = '🤝';
    if (companionHud) companionHud.classList.remove('hidden');

    if (companionStateBadge) {
      companionStateBadge.className = 'companion-hud-state ' + (state || 'listening');
      companionStateBadge.textContent = (state || 'listening').toUpperCase();
    }
  } else {
    companionToggleBtn.classList.remove('active');
    companionLabel.textContent = 'COMPANION: OFF';
    companionIcon.textContent = '🤝';
    if (companionHud) companionHud.classList.add('hidden');
  }
}

// Setup Settings Initial Values
if (engineSelect) engineSelect.value = state.engine;
apiKeyInput.value = geminiClient.getApiKey();
modelSelect.value = geminiClient.getModel();
ttsCheckbox.checked = voiceAgent.ttsEnabled;

updateEngineBadgeUI();

/**
 * Update Engine Badge UI (Header Pill)
 */
function updateEngineBadgeUI() {
  if (!engineIcon || !engineLabel) return;
  if (state.engine === 'yolo') {
    engineIcon.textContent = '⚡';
    engineLabel.textContent = yoloDetector.isLoaded ? 'YOLO (30 FPS)' : 'YOLO (LOADING...)';
    engineToggleBtn.style.borderColor = 'var(--neon-cyan)';
    engineToggleBtn.style.color = 'var(--neon-cyan)';
    engineToggleBtn.style.background = 'rgba(0, 240, 255, 0.12)';
  } else {
    engineIcon.textContent = '🧠';
    engineLabel.textContent = 'GEMINI FLASH';
    engineToggleBtn.style.borderColor = 'var(--neon-amber)';
    engineToggleBtn.style.color = 'var(--neon-amber)';
    engineToggleBtn.style.background = 'rgba(245, 158, 11, 0.12)';
  }
}

/**
 * Handle YOLO Status Changes
 */
function handleYoloStatusChange(status) {
  if (status.status === 'loading') {
    showVoiceBanner('YOLO Vision Engine', status.message, 2500);
  } else if (status.status === 'ready') {
    showVoiceBanner('YOLO Ready', 'Real-time 30 FPS detection active!', 3000);
    updateEngineBadgeUI();
  }
}

/**
 * Set Engine Mode ('yolo' vs 'gemini')
 */
async function setEngineMode(newEngine) {
  state.engine = newEngine;
  localStorage.setItem('vision_engine', newEngine);
  updateEngineBadgeUI();

  if (newEngine === 'yolo') {
    // Stop Gemini auto-scan
    if (state.autoScanTimer) {
      clearInterval(state.autoScanTimer);
      state.autoScanTimer = null;
    }
    scanBtnLabel.textContent = 'QUICK SCAN';
    showVoiceBanner('Engine Switched', 'Real-Time YOLO Active (30+ FPS On-Device)');
    await startYoloLoop();
  } else {
    // Stop YOLO loop
    state.isYoloRunning = false;
    scanBtnLabel.textContent = 'SCAN NOW';
    showVoiceBanner('Engine Switched', 'Gemini Multimodal Cloud Vision Active');
    latencyValueEl.textContent = '-- ms';
  }
}

/**
 * Continuous Real-Time YOLO Detection Loop (30 FPS)
 */
async function startYoloLoop() {
  if (state.engine !== 'yolo') return;

  if (!yoloDetector.isLoaded && !yoloDetector.isLoading) {
    await yoloDetector.loadModel();
  }

  state.isYoloRunning = true;

  async function frameLoop() {
    if (!state.isYoloRunning || state.engine !== 'yolo') return;

    if (videoEl && videoEl.readyState >= 2 && !cameraManager.isPaused) {
      try {
        const result = await yoloDetector.detect(videoEl);
        if (result && result.objects) {
          state.detectedObjects = result.objects;
          hudRenderer.setObjects(result.objects);

          latencyValueEl.textContent = `${result.latencyMs} ms (YOLO)`;
          totalDetectedCountEl.textContent = `${result.objects.length} Objects`;

          // Throttle inventory list UI update to once every 1s
          const now = performance.now();
          if (now - state.lastInventoryUpdate > 1000) {
            updateInventoryUI(result.objects);
            state.lastInventoryUpdate = now;
          }
        }
      } catch (err) {
        console.warn('YOLO frame detection error:', err);
      }
    }

    if (state.isYoloRunning && state.engine === 'yolo') {
      requestAnimationFrame(frameLoop);
    }
  }

  requestAnimationFrame(frameLoop);
}

/**
 * Handle Camera Status Changes
 */
function handleCameraStatusChange(statusInfo) {
  if (statusInfo.status === 'active') {
    liveStatusDot.style.background = '#10b981';
    liveStatusDot.style.boxShadow = '0 0 8px #10b981';
    liveStatusText.textContent = 'LIVE FEED';
    cameraStatusLabel.textContent = `${statusInfo.facingMode.toUpperCase()} CAMERA // ${statusInfo.resolution}`;
  } else if (statusInfo.status === 'demo') {
    liveStatusDot.style.background = '#f59e0b';
    liveStatusDot.style.boxShadow = '0 0 8px #f59e0b';
    liveStatusText.textContent = 'DEMO FEED';
    cameraStatusLabel.textContent = 'SIMULATED CAMERA FEED // 1280x720';
  } else {
    liveStatusDot.style.background = '#64748b';
    liveStatusText.textContent = 'CONNECTING...';
  }
}

/**
 * Execute Cloud Scene Object Detection (Gemini)
 */
async function performGeminiScan() {
  if (state.isScanning) return;

  const frameDataUrl = cameraManager.captureFrameBase64();
  if (!frameDataUrl) return;

  state.isScanning = true;
  hudRenderer.setScanning(true);
  scanBtn.classList.add('scanning');
  scanBtnLabel.textContent = 'SCANNING...';
  voiceAgent.playChime('radar_sweep');

  try {
    const result = await geminiClient.detectObjects(frameDataUrl);
    if (!result) return;

    state.detectedObjects = result.objects || [];
    hudRenderer.setObjects(state.detectedObjects);

    latencyValueEl.textContent = `${result.latencyMs} ms (Gemini)`;
    totalDetectedCountEl.textContent = `${state.detectedObjects.length} Objects`;

    updateInventoryUI(state.detectedObjects);

    if (state.detectedObjects.length > 0) {
      voiceAgent.playChime('detection_success');
    }

    state.lastScanTime = Date.now();
    return result;
  } catch (err) {
    console.error('Scan detection error:', err);
    latencyValueEl.textContent = 'Quota / Error';

    if (
      err.message &&
      (err.message.includes('429') || err.message.includes('QuotaFailure') || err.message.includes('RESOURCE_EXHAUSTED'))
    ) {
      state.autoScan = false;
      autoScanToggleBtn.classList.remove('active');
      restartAutoScanTimer();
      showVoiceBanner(
        'Quota Limit Alert',
        'Gemini free-tier quota reached. Switched back to YOLO 30 FPS mode.',
        10000
      );
      setEngineMode('yolo');
    } else {
      showVoiceBanner('Detection Alert', err.message || 'Error communicating with Gemini');
    }
  } finally {
    state.isScanning = false;
    hudRenderer.setScanning(false);
    scanBtn.classList.remove('scanning');
    scanBtnLabel.textContent = state.engine === 'yolo' ? 'QUICK SCAN' : 'SCAN NOW';
  }
}

/**
 * General Scan Dispatcher
 */
async function performScan() {
  if (state.engine === 'yolo') {
    voiceAgent.playChime('radar_sweep');
    updateInventoryUI(state.detectedObjects);
    voiceAgent.playChime('detection_success');
    showVoiceBanner('YOLO Scan', `${state.detectedObjects.length} objects currently tracked in real time.`);
  } else {
    await performGeminiScan();
  }
}

/**
 * Start or Restart Auto-Scan loop (Gemini Mode)
 */
function restartAutoScanTimer() {
  if (state.autoScanTimer) {
    clearInterval(state.autoScanTimer);
    state.autoScanTimer = null;
  }

  if (state.engine === 'gemini' && state.autoScan) {
    state.autoScanTimer = setInterval(() => {
      if (!state.isScanning && !voiceAgent.isListening && !voiceAgent.isSpeaking) {
        performGeminiScan();
      }
    }, state.autoScanInterval);
  }
}

/**
 * Handle Voice Agent Commands
 */
async function handleVoiceCommand(cmd) {
  const query = cmd.raw || cmd.target || '';
  if (companionAgent) {
    await companionAgent.handleUserUtterance(query, state.detectedObjects);
  }
}

/**
 * Handle Voice Transcription Updates
 */
function handleVoiceTranscript({ interim, final }) {
  if (interim) {
    showVoiceBanner('Listening...', `"${interim}"`);
  } else if (final) {
    showVoiceBanner('Command Heard', `"${final}"`);
  }
}

/**
 * Handle Voice Agent State Changes
 */
function handleVoiceStateChange({ isListening, error }) {
  const dockCmdInput = document.getElementById('dockCmdInput');
  const dockCmdBar = document.getElementById('dockCmdBar');

  if (isListening) {
    micBtn.classList.add('listening');
    showVoiceBanner('Listening...', 'Ask to locate any object (e.g. "Where is the bottle?")');
  } else {
    micBtn.classList.remove('listening');
    if (error && error !== 'no-speech') {
      if (error === 'network') {
        // Browser/network blocks Chrome's cloud speech recognition socket
        showVoiceBanner(
          'Quick Locate Ready',
          'Voice recognition is restricted on this network. Tap any Quick Find pill or type your object below!',
          6000
        );
        if (dockCmdInput) {
          dockCmdInput.focus();
          dockCmdInput.placeholder = 'Type object (e.g. bottle) & Enter';
        }
        if (dockCmdBar) {
          dockCmdBar.classList.add('glow-highlight');
          setTimeout(() => dockCmdBar.classList.remove('glow-highlight'), 3600);
        }
      } else if (error === 'not-allowed' || error === 'service-not-allowed') {
        showVoiceBanner('Microphone Permission', 'Please allow microphone access in your browser address bar.', 7000);
      } else if (error === 'audio-capture') {
        showVoiceBanner('Microphone Notice', 'No microphone detected or audio capture failed.', 7000);
      }
    }
  }
}

/**
 * Display Voice Toast Banner
 */
function showVoiceBanner(title, message) {
  console.log(`[Notification] ${title}: ${message}`);
}

/**
 * Handle Interactive Object Selection (Clicking on Canvas Box or Card)
 */
function handleObjectSelected(obj) {
  hudRenderer.setTargetLock(obj);
  voiceAgent.playChime('target_locked');

  const clock = companionAgent.getClockPosition(obj);
  const prox = companionAgent.estimateProximity(obj);
  const speechText = `I see a ${obj.name} ${clock}, ${prox.distanceStr}.`;

  companionAgent.speakAndListen(speechText);
  highlightTargetInDrawer(obj);
}

/**
 * Update Sidebar Inventory UI
 */
function updateInventoryUI(objects) {
  const livingCount = objects.filter((o) => o.category === 'living').length;
  const nonLivingCount = objects.filter((o) => o.category === 'non_living').length;

  statTotalVal.textContent = objects.length;
  statLivingVal.textContent = livingCount;
  statNonLivingVal.textContent = nonLivingCount;

  if (objects.length === 0) {
    emptyObjectsMsg.style.display = 'flex';
    return;
  }
  emptyObjectsMsg.style.display = 'none';

  const visible = objects.filter((obj) => {
    if (state.activeFilter === 'living') return obj.category === 'living';
    if (state.activeFilter === 'non_living') return obj.category === 'non_living';
    return true;
  });

  const existingCards = objectsListContainer.querySelectorAll('.object-card');
  existingCards.forEach((c) => c.remove());

  visible.forEach((obj, idx) => {
    const card = document.createElement('div');
    const isLiving = obj.category === 'living';
    card.className = `object-card ${isLiving ? 'living' : 'non-living'}`;
    card.id = `objCard_${idx}`;

    card.innerHTML = `
      <div class="card-main-info">
        <div class="card-title-row">
          <span class="card-name">${escapeHtml(obj.name)}</span>
          <span class="card-category-tag ${isLiving ? 'living' : 'non-living'}">
            ${isLiving ? 'LIVING' : 'NON-LIVING'}
          </span>
        </div>
        <div class="card-details-row">
          <span>${escapeHtml(obj.location || 'In frame')}</span>
          ${obj.confidence ? ` &bull; <span>${obj.confidence}% conf</span>` : ''}
        </div>
      </div>
      <button class="locate-action-btn" title="Focus and Speak Details">LOCATE</button>
    `;

    card.addEventListener('click', () => handleObjectSelected(obj));
    const locateBtn = card.querySelector('.locate-action-btn');
    locateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleObjectSelected(obj);
    });

    objectsListContainer.appendChild(card);
  });
}

function highlightTargetInDrawer(targetObj) {
  const cards = objectsListContainer.querySelectorAll('.object-card');
  cards.forEach((c) => c.classList.remove('target-lock'));

  const matchingCard = Array.from(cards).find((c) => {
    const nameEl = c.querySelector('.card-name');
    return nameEl && nameEl.textContent.trim().toLowerCase() === (targetObj.name || '').trim().toLowerCase();
  });

  if (matchingCard) {
    matchingCard.classList.add('target-lock');
    matchingCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/**
 * Filter Mode Switch
 */
function setFilterMode(mode) {
  state.activeFilter = mode;
  filterChips.forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.filter === mode);
  });
  hudRenderer.setFilter(mode);
  updateInventoryUI(state.detectedObjects);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Event Bindings
 */
function initEventListeners() {
  // Engine Switcher in Header
  if (engineToggleBtn) {
    engineToggleBtn.addEventListener('click', () => {
      const next = state.engine === 'yolo' ? 'gemini' : 'yolo';
      setEngineMode(next);
      if (engineSelect) engineSelect.value = next;
    });
  }

  // Companion Mode Toggle Pill in Header
  if (companionToggleBtn) {
    companionToggleBtn.addEventListener('click', () => {
      const active = companionAgent.toggle(state.detectedObjects);
      updateCompanionUI(active, 'speaking');

      if (active && state.engine === 'yolo') {
        startYoloLoop();
      }
    });
  }

  // Speech / Mic Button: Toggle Microphone ON and OFF
  micBtn.addEventListener('click', () => {
    // If companion is speaking, cancel immediately so user can talk
    if (voiceAgent && voiceAgent.isSpeaking) {
      voiceAgent.stopSpeaking();
    }

    // Toggle on-device microphone
    const isNowListening = localWhisper.toggle();
    if (isNowListening) {
      micBtn.classList.add('listening');
      micBtn.setAttribute('aria-pressed', 'true');
      voiceAgent.playChime('listen_start');
      if (companionAgent) {
        updateCompanionUI(companionAgent.isActive, 'listening');
      }
    } else {
      micBtn.classList.remove('listening');
      micBtn.setAttribute('aria-pressed', 'false');
      voiceAgent.playChime('command_received');
      if (companionAgent) {
        updateCompanionUI(companionAgent.isActive, 'thinking');
      }
    }
  });

  // Spacebar Hotkey: Toggle Microphone ON and OFF
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      micBtn.click();
    }
  });

  // Ask Companion Text Input Bar
  const dockCmdInput = document.getElementById('dockCmdInput');
  const dockCmdSubmitBtn = document.getElementById('dockCmdSubmitBtn');

  function handleCommandSubmit() {
    const text = (dockCmdInput.value || '').trim();
    if (!text) return;
    dockCmdInput.value = '';
    companionAgent.handleUserUtterance(text, state.detectedObjects);
  }

  if (dockCmdSubmitBtn && dockCmdInput) {
    dockCmdSubmitBtn.addEventListener('click', handleCommandSubmit);
    dockCmdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCommandSubmit();
      }
    });
  }

  // Scan Trigger Button
  scanBtn.addEventListener('click', () => {
    performScan();
  });

  // Auto-Scan Toggle
  autoScanToggleBtn.addEventListener('click', () => {
    state.autoScan = !state.autoScan;
    autoScanToggleBtn.classList.toggle('active', state.autoScan);
    restartAutoScanTimer();
    showVoiceBanner('Auto-Scan Mode', state.autoScan ? 'Auto-scan enabled' : 'Auto-scan paused');
  });

  // Switch Front/Rear Camera
  switchCamBtn.addEventListener('click', async () => {
    cameraStatusLabel.textContent = 'SWITCHING CAMERA...';
    await cameraManager.toggleFacingMode();
  });

  // Filter Chips
  filterChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      setFilterMode(chip.dataset.filter);
    });
  });

  // Quick Target Strip Pills (100% On-Device Instant YOLO Search & Voice Response)
  const quickTargetPills = document.querySelectorAll('.quick-target-pill');
  quickTargetPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      const target = pill.dataset.target;
      voiceAgent.processSpokenCommand(`Where is the ${target}?`);
    });
  });

  // Inventory Drawer Toggle
  toggleDrawerBtn.addEventListener('click', () => {
    inventoryDrawer.classList.toggle('collapsed');
  });
  closeDrawerBtn.addEventListener('click', () => {
    inventoryDrawer.classList.add('collapsed');
  });

  // Voice Sample Chips (Click to test voice query)
  voiceSampleChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const cmd = chip.dataset.cmd;
      voiceAgent.processSpokenCommand(cmd);
    });
  });

  // Settings Modal Open/Close
  openSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
  });
  closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });
  cancelSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  // Scan Interval Slider
  scanIntervalRange.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    intervalDisplay.textContent = `${val.toFixed(1)}s`;
    state.autoScanInterval = Math.round(val * 1000);
    restartAutoScanTimer();
  });

  // Save Settings
  saveSettingsBtn.addEventListener('click', () => {
    if (engineSelect) {
      setEngineMode(engineSelect.value);
    }
    const key = apiKeyInput.value.trim();
    if (key) {
      geminiClient.setApiKey(key);
    }
    const model = modelSelect.value;
    geminiClient.setModel(model);

    voiceAgent.ttsEnabled = ttsCheckbox.checked;

    settingsModal.classList.add('hidden');
    showVoiceBanner('Settings Saved', `Engine: ${state.engine.toUpperCase()}. TTS: ${voiceAgent.ttsEnabled ? 'On' : 'Off'}.`);
  });

  // Spacebar hotkey to toggle voice listening
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      localWhisper.toggle();
    }
  });
}

/**
 * Bootstrap Application
 */
async function init() {
  initEventListeners();

  // 1. Start Camera Feed
  await cameraManager.start();

  // 2. Pre-load on-device Whisper voice model in background
  localWhisper.loadEngine();

  // 3. Initialize Real-Time YOLO Detector
  if (state.engine === 'yolo') {
    try {
      await yoloDetector.loadModel();
      startYoloLoop();
    } catch (err) {
      console.warn('Initial YOLO setup error, falling back to Gemini:', err);
      setEngineMode('gemini');
    }
  }

  // 4. Activate AI Visual Companion by default
  companionAgent.isActive = true;
  updateCompanionUI(true, 'idle');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
