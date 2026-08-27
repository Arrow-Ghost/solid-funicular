/**
 * main.js - AgentX Vision Core Orchestrator
 * Integrates Camera feed, Gemini Vision multimodal detection,
 * Voice agent commands & TTS, AR HUD rendering, and UI controls.
 */

import { CameraManager } from './camera.js';
import { GeminiVisionClient } from './geminiVision.js';
import { VoiceAgent } from './voiceAgent.js';
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

// Voice Banner Elements
const voiceBanner = document.getElementById('voiceBanner');
const voiceCommandText = document.getElementById('voiceCommandText');
const voiceResponseText = document.getElementById('voiceResponseText');

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
const apiKeyInput = document.getElementById('apiKeyInput');
const modelSelect = document.getElementById('modelSelect');
const scanIntervalRange = document.getElementById('scanIntervalRange');
const intervalDisplay = document.getElementById('intervalDisplay');
const ttsCheckbox = document.getElementById('ttsCheckbox');

// Application State
const state = {
  autoScan: false, // Default to on-demand to preserve API quota
  autoScanInterval: 4000, // 4 seconds
  autoScanTimer: null,
  isScanning: false,
  activeFilter: 'all',
  lastScanTime: 0,
  detectedObjects: []
};

// Initialize Subsystems
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

const hudRenderer = new HudRenderer(canvasEl, videoEl, {
  onSelect: handleObjectSelected
});

// Setup Settings Initial Values
apiKeyInput.value = geminiClient.getApiKey();
modelSelect.value = geminiClient.getModel();
ttsCheckbox.checked = voiceAgent.ttsEnabled;

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
 * Execute Scene Object Detection
 */
async function performScan() {
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

    // Update Telemetry
    latencyValueEl.textContent = `${result.latencyMs} ms`;
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

    if (err.message && (err.message.includes('429') || err.message.includes('QuotaFailure') || err.message.includes('RESOURCE_EXHAUSTED'))) {
      state.autoScan = false;
      autoScanToggleBtn.classList.remove('active');
      restartAutoScanTimer();
      showVoiceBanner('Quota Limit Alert', 'Gemini free-tier quota reached for this model. Switch to Gemini 3.7 Flash in Settings or wait to retry.', 10000);
    } else {
      showVoiceBanner('Detection Alert', err.message || 'Error communicating with Gemini');
    }
  } finally {
    state.isScanning = false;
    hudRenderer.setScanning(false);
    scanBtn.classList.remove('scanning');
    scanBtnLabel.textContent = 'SCAN NOW';
  }
}

/**
 * Start or Restart Auto-Scan loop
 */
function restartAutoScanTimer() {
  if (state.autoScanTimer) {
    clearInterval(state.autoScanTimer);
    state.autoScanTimer = null;
  }

  if (state.autoScan) {
    state.autoScanTimer = setInterval(() => {
      if (!state.isScanning && !voiceAgent.isListening && !voiceAgent.isSpeaking) {
        performScan();
      }
    }, state.autoScanInterval);
  }
}

/**
 * Handle Voice Agent Commands
 */
async function handleVoiceCommand(cmd) {
  console.log('Processed voice command:', cmd);

  if (cmd.type === 'TRIGGER_SCAN') {
    showVoiceBanner(`Command: "${cmd.raw}"`, 'Analyzing camera feed...');
    await performScan();
    return;
  }

  if (cmd.type === 'DESCRIBE_SCENE') {
    showVoiceBanner(`Command: "${cmd.raw}"`, 'Analyzing entire view...');
    const result = await performScan();
    if (result && result.scene_summary) {
      showVoiceBanner(`Scene Overview`, result.scene_summary);
      voiceAgent.speak(result.scene_summary);
    }
    return;
  }

  if (cmd.type === 'FILTER_LIVING') {
    setFilterMode('living');
    voiceAgent.speak('Displaying living things only.');
    return;
  }

  if (cmd.type === 'FILTER_NON_LIVING') {
    setFilterMode('non_living');
    voiceAgent.speak('Displaying non-living things only.');
    return;
  }

  if (cmd.type === 'FILTER_ALL') {
    setFilterMode('all');
    voiceAgent.speak('Displaying all detected objects.');
    return;
  }

  if (cmd.type === 'IDENTIFY_TARGET') {
    const targetQuery = cmd.target || cmd.raw;
    showVoiceBanner(`Locating: "${targetQuery}"`, 'Analyzing visual field for target...');

    const frameDataUrl = cameraManager.captureFrameBase64();
    if (!frameDataUrl) {
      showVoiceBanner('Voice Search', 'Camera frame unavailable.');
      return;
    }

    hudRenderer.setScanning(true);
    try {
      const response = await geminiClient.identifyTargetObject(frameDataUrl, cmd.raw);
      hudRenderer.setScanning(false);

      if (response && response.found) {
        voiceAgent.playChime('target_locked');
        hudRenderer.setTargetLock(response);
        showVoiceBanner(`Found: ${response.name || targetQuery}`, response.spoken_response);
        voiceAgent.speak(response.spoken_response);

        // Highlight or add to inventory list
        highlightTargetInDrawer(response);
      } else {
        const msg = response?.spoken_response || `I couldn't locate "${targetQuery}" in your current camera view.`;
        showVoiceBanner(`Target Not Found`, msg);
        voiceAgent.speak(msg);
      }
    } catch (err) {
      hudRenderer.setScanning(false);
      console.error('Target identification failed:', err);
      showVoiceBanner('Voice Identification Error', err.message);
    }
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
  if (isListening) {
    micBtn.classList.add('listening');
    showVoiceBanner('Listening...', 'Speak an instruction or ask to locate an object');
  } else {
    micBtn.classList.remove('listening');
    if (error && error !== 'no-speech') {
      showVoiceBanner('Microphone Notice', `Recognition status: ${error}`);
    }
  }
}

/**
 * Display Voice Toast Banner
 */
let voiceBannerTimeout = null;
function showVoiceBanner(title, message, autoHideMs = 6000) {
  voiceBanner.classList.remove('hidden');
  voiceCommandText.textContent = title;
  voiceResponseText.textContent = message;

  if (voiceBannerTimeout) clearTimeout(voiceBannerTimeout);
  if (autoHideMs > 0) {
    voiceBannerTimeout = setTimeout(() => {
      voiceBanner.classList.add('hidden');
    }, autoHideMs);
  }
}

/**
 * Handle Interactive Object Selection (Clicking on Canvas Box or Card)
 */
function handleObjectSelected(obj) {
  hudRenderer.setTargetLock(obj);
  voiceAgent.playChime('target_locked');

  const catName = obj.category === 'living' ? 'living organism' : 'non-living object';
  const speechText = `${obj.name}, a ${catName}. Located ${obj.location || 'in view'}.`;

  showVoiceBanner(obj.name, speechText);
  voiceAgent.speak(speechText);

  // Scroll to and highlight card in inventory
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

  // Filter objects based on active filter
  const visible = objects.filter((obj) => {
    if (state.activeFilter === 'living') return obj.category === 'living';
    if (state.activeFilter === 'non_living') return obj.category === 'non_living';
    return true;
  });

  // Rebuild object cards
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
  // Mic Trigger Button
  micBtn.addEventListener('click', () => {
    voiceAgent.toggleListening();
  });

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
    const key = apiKeyInput.value.trim();
    if (key) {
      geminiClient.setApiKey(key);
    }
    const model = modelSelect.value;
    geminiClient.setModel(model);

    voiceAgent.ttsEnabled = ttsCheckbox.checked;

    settingsModal.classList.add('hidden');
    showVoiceBanner('Settings Saved', `Model set to ${model}. TTS is ${voiceAgent.ttsEnabled ? 'enabled' : 'disabled'}.`);
  });

  // Spacebar hotkey to toggle voice listening
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      voiceAgent.toggleListening();
    }
  });
}

/**
 * Bootstrap Application
 */
async function init() {
  initEventListeners();

  // Start Camera
  await cameraManager.start();

  // Initial Scan after camera settles
  setTimeout(() => {
    performScan();
    restartAutoScanTimer();
  }, 1000);
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
