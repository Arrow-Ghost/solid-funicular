/**
 * camera.js - Camera Feed & Stream Management
 * Supports WebRTC live camera streams, front/rear camera switching,
 * frame capture for Gemini multimodal API, and simulated demo mode fallback.
 */

export class CameraManager {
  constructor(videoElement, options = {}) {
    this.video = videoElement;
    this.stream = null;
    this.facingMode = options.facingMode || 'environment'; // 'environment' (rear) or 'user' (front)
    this.isPaused = false;
    this.isDemoMode = false;
    this.demoCanvas = null;
    this.demoInterval = null;
    this.captureCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    this.captureCtx = this.captureCanvas ? this.captureCanvas.getContext('2d') : null;
    this.onStatusChange = options.onStatusChange || (() => {});
  }

  /**
   * Initialize and start the camera stream.
   */
  async start() {
    this.stop();
    this.isDemoMode = false;
    this.onStatusChange({ status: 'starting', message: 'Requesting camera access...' });

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API (getUserMedia) not supported in this browser.');
      }

      const constraints = {
        audio: false,
        video: {
          facingMode: { ideal: this.facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        console.warn('Strict constraints failed, attempting fallback to generic video...', err);
        this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      this.video.srcObject = this.stream;
      await new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          this.video.play().then(resolve).catch(resolve);
        };
      });

      this.isPaused = false;
      this.onStatusChange({
        status: 'active',
        facingMode: this.facingMode,
        resolution: `${this.video.videoWidth}x${this.video.videoHeight}`,
        isDemo: false
      });
      return { success: true, isDemo: false };
    } catch (err) {
      console.warn('Camera stream could not start. Falling back to Demo Simulator mode:', err);
      this.startDemoMode();
      this.onStatusChange({
        status: 'demo',
        message: 'Running in Demo Simulation mode (no physical camera access)',
        error: err.message,
        isDemo: true
      });
      return { success: false, isDemo: true, error: err.message };
    }
  }

  /**
   * Switch between front and rear cameras.
   */
  async toggleFacingMode() {
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    if (!this.isDemoMode) {
      return await this.start();
    } else {
      this.drawDemoScene();
      return { success: true, isDemo: true };
    }
  }

  /**
   * Pause or resume the camera feed.
   */
  togglePause() {
    if (!this.video) return false;
    if (this.isPaused) {
      if (!this.isDemoMode && this.video.play) {
        this.video.play();
      }
      this.isPaused = false;
    } else {
      if (!this.isDemoMode && this.video.pause) {
        this.video.pause();
      }
      this.isPaused = true;
    }
    return this.isPaused;
  }

  /**
   * Stop camera stream and cleanup.
   */
  stop() {
    if (this.demoInterval) {
      clearInterval(this.demoInterval);
      this.demoInterval = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
    }
    this.isPaused = false;
  }

  /**
   * Capture current video frame as base64 JPEG data URL.
   * Scaled to max 1024px dimension for high detection accuracy and fast upload.
   */
  captureFrameBase64(maxDimension = 1024, quality = 0.85) {
    if (this.isDemoMode) {
      return this.captureDemoFrame(quality);
    }

    if (!this.video || !this.video.videoWidth || !this.video.videoHeight) {
      return null;
    }

    const srcW = this.video.videoWidth;
    const srcH = this.video.videoHeight;

    let targetW = srcW;
    let targetH = srcH;

    if (srcW > maxDimension || srcH > maxDimension) {
      if (srcW >= srcH) {
        targetW = maxDimension;
        targetH = Math.round((srcH * maxDimension) / srcW);
      } else {
        targetH = maxDimension;
        targetW = Math.round((srcW * maxDimension) / srcH);
      }
    }

    this.captureCanvas.width = targetW;
    this.captureCanvas.height = targetH;

    // Handle horizontal flipping if front camera
    this.captureCtx.save();
    if (this.facingMode === 'user') {
      this.captureCtx.translate(targetW, 0);
      this.captureCtx.scale(-1, 1);
    }
    this.captureCtx.drawImage(this.video, 0, 0, targetW, targetH);
    this.captureCtx.restore();

    return this.captureCanvas.toDataURL('image/jpeg', quality);
  }

  /**
   * Simulated Demo Mode for environments without hardware webcam or permission.
   * Generates a realistic scene with Living (human, potted plant, cat) and Non-Living (laptop, mug, headphones, lamp).
   */
  startDemoMode() {
    this.isDemoMode = true;
    if (!this.demoCanvas) {
      this.demoCanvas = document.createElement('canvas');
      this.demoCanvas.width = 1280;
      this.demoCanvas.height = 720;
    }

    // Connect demo canvas stream to video element
    try {
      const demoStream = this.demoCanvas.captureStream(30);
      this.video.srcObject = demoStream;
      this.video.play().catch(() => {});
    } catch (e) {
      console.warn('captureStream not supported, will draw directly');
    }

    let frame = 0;
    this.demoInterval = setInterval(() => {
      frame++;
      this.drawDemoScene(frame);
    }, 100);
  }

  drawDemoScene(frame = 0) {
    const ctx = this.demoCanvas.getContext('2d');
    const w = this.demoCanvas.width;
    const h = this.demoCanvas.height;

    // Room background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, '#151b2e');
    bgGrad.addColorStop(1, '#0b0f19');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Grid walls / floor perspective
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Desk surface
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(100, 480, w - 200, 220);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.strokeRect(100, 480, w - 200, 220);

    // 1. [NON-LIVING] Laptop (Center)
    ctx.fillStyle = '#334155';
    ctx.fillRect(480, 440, 320, 180);
    // Screen glow
    const screenGrad = ctx.createLinearGradient(500, 450, 780, 570);
    screenGrad.addColorStop(0, '#0284c7');
    screenGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = screenGrad;
    ctx.fillRect(500, 450, 280, 130);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(450, 580, 380, 20);

    // 2. [LIVING] Potted Plant (Left)
    // Pot
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.moveTo(220, 580);
    ctx.lineTo(290, 580);
    ctx.lineTo(275, 640);
    ctx.lineTo(235, 640);
    ctx.closePath();
    ctx.fill();
    // Foliage
    ctx.fillStyle = '#10b981';
    for (let i = 0; i < 5; i++) {
      const angle = (i - 2) * 0.4;
      const sway = Math.sin(frame * 0.1 + i) * 5;
      ctx.beginPath();
      ctx.ellipse(255 + sway, 520 + i * 8, 30, 50, angle, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. [NON-LIVING] Coffee Mug (Right)
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(860, 520, 65, 80);
    // Steam animation
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(890, 510);
    ctx.quadraticCurveTo(880 + Math.sin(frame * 0.2) * 8, 470, 895, 440);
    ctx.stroke();

    // 4. [LIVING] Person Silhouette / Operator (Background Center-Right)
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    // Head
    ctx.arc(640, 250, 60, 0, Math.PI * 2);
    // Shoulders
    ctx.ellipse(640, 380, 160, 90, 0, 0, Math.PI);
    ctx.fill();

    // Demo watermark overlay
    ctx.fillStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.font = '14px monospace';
    ctx.fillText('SIMULATED FEED // DEMO MODE ACTIVE', 120, 50);
  }

  captureDemoFrame(quality = 0.85) {
    if (!this.demoCanvas) {
      this.startDemoMode();
    }
    return this.demoCanvas.toDataURL('image/jpeg', quality);
  }
}
