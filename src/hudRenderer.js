/**
 * hudRenderer.js - AR HUD & Bounding Box Overlay Engine
 * Accurately maps 0..1000 normalized coordinates to the video viewport,
 * rendering cyber-vision brackets, neon glow outlines, category badges,
 * and animated voice target spotlight reticles.
 */

export class HudRenderer {
  constructor(canvasElement, videoElement, options = {}) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.video = videoElement;
    this.objects = [];
    this.targetLock = null; // Specially highlighted target from voice query
    this.filter = 'all'; // 'all', 'living', 'non_living'
    this.hoveredObject = null;
    this.selectedObject = null;
    this.onSelect = options.onSelect || (() => {});
    this.isScanning = false;
    this.scanProgress = 0; // 0 to 1 for radar beam animation

    this.initEvents();
    this.startRenderLoop();
  }

  initEvents() {
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
    this.canvas.addEventListener('mouseleave', () => {
      this.hoveredObject = null;
    });

    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    const rect = this.video.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setObjects(objects = []) {
    this.objects = objects;
    this.resizeCanvas();
  }

  setTargetLock(targetObject) {
    this.targetLock = targetObject;
    this.selectedObject = targetObject;
    this.resizeCanvas();
  }

  clearTargetLock() {
    this.targetLock = null;
  }

  setFilter(filter) {
    this.filter = filter;
  }

  setScanning(isScanning) {
    this.isScanning = isScanning;
    if (isScanning) {
      this.scanProgress = 0;
    }
  }

  /**
   * Convert normalized [ymin, xmin, ymax, xmax] (0-1000)
   * to pixel coordinates on the overlay canvas matching the video aspect-ratio.
   */
  mapBoxToPixels(box) {
    if (!box || box.length < 4) return null;
    const [ymin, xmin, ymax, xmax] = box;

    const rect = this.video.getBoundingClientRect();
    const vw = this.video.videoWidth || rect.width || 1280;
    const vh = this.video.videoHeight || rect.height || 720;
    const cw = rect.width;
    const ch = rect.height;

    if (cw === 0 || ch === 0) return null;

    // Determine scale for object-fit: cover
    const scale = Math.max(cw / vw, ch / vh);
    const renderedW = vw * scale;
    const renderedH = vh * scale;
    const offsetX = (cw - renderedW) / 2;
    const offsetY = (ch - renderedH) / 2;

    const x = offsetX + (xmin / 1000) * renderedW;
    const y = offsetY + (ymin / 1000) * renderedH;
    const w = ((xmax - xmin) / 1000) * renderedW;
    const h = ((ymax - ymin) / 1000) * renderedH;

    return { x, y, w, h };
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let found = null;
    const visibleObjects = this.getVisibleObjects();

    for (let i = visibleObjects.length - 1; i >= 0; i--) {
      const obj = visibleObjects[i];
      const box = this.mapBoxToPixels(obj.box_2d);
      if (box && mx >= box.x && mx <= box.x + box.w && my >= box.y && my <= box.y + box.h) {
        found = obj;
        break;
      }
    }

    if (this.hoveredObject !== found) {
      this.hoveredObject = found;
      this.canvas.style.cursor = found ? 'pointer' : 'crosshair';
    }
  }

  handleClick(e) {
    if (this.hoveredObject) {
      this.selectedObject = this.hoveredObject;
      this.onSelect(this.hoveredObject);
    }
  }

  getVisibleObjects() {
    return this.objects.filter((obj) => {
      if (this.filter === 'living') return obj.category === 'living';
      if (this.filter === 'non_living') return obj.category === 'non_living';
      return true;
    });
  }

  startRenderLoop() {
    const render = (time) => {
      this.draw(time);
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }

  draw(time = 0) {
    const rect = this.video.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    if (
      this.canvas.width !== rect.width * (window.devicePixelRatio || 1) ||
      this.canvas.height !== rect.height * (window.devicePixelRatio || 1)
    ) {
      this.resizeCanvas();
    }

    const ctx = this.ctx;
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    // 1. Draw Sci-Fi HUD Crosshairs & Corner Grids
    this.drawHudOverlay(ctx, w, h, time);

    // 2. Draw Radar Scanner Sweep if active
    if (this.isScanning) {
      this.drawScanSweep(ctx, w, h, time);
    }

    // 3. Draw Detected Objects Bounding Boxes
    const visible = this.getVisibleObjects();
    visible.forEach((obj) => {
      const isTarget =
        this.targetLock &&
        ((this.targetLock.name && obj.name && obj.name.toLowerCase() === this.targetLock.name.toLowerCase()) ||
          this.targetLock === obj);
      const isHovered = this.hoveredObject === obj;
      const isSelected = this.selectedObject === obj;

      this.drawObjectBox(ctx, obj, { isTarget, isHovered, isSelected, time });
    });

    // 4. If there's a voice target lock that isn't in visible list yet, draw it specially
    if (this.targetLock && this.targetLock.box_2d) {
      const alreadyDrawn = visible.some((o) => o === this.targetLock);
      if (!alreadyDrawn) {
        this.drawObjectBox(ctx, this.targetLock, { isTarget: true, isHovered: false, isSelected: true, time });
      }
    }
  }

  drawHudOverlay(ctx, w, h, time) {
    // Subtle viewport corner brackets
    const bracketSize = 24;
    const pad = 16;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
    ctx.lineWidth = 1.5;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(pad, pad + bracketSize);
    ctx.lineTo(pad, pad);
    ctx.lineTo(pad + bracketSize, pad);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(w - pad - bracketSize, pad);
    ctx.lineTo(w - pad, pad);
    ctx.lineTo(w - pad, pad + bracketSize);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(pad, h - pad - bracketSize);
    ctx.lineTo(pad, h - pad);
    ctx.lineTo(pad + bracketSize, h - pad);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(w - pad - bracketSize, h - pad);
    ctx.lineTo(w - pad, h - pad);
    ctx.lineTo(w - pad, h - pad - bracketSize);
    ctx.stroke();

    // Center Crosshair
    const cx = w / 2;
    const cy = h / 2;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 15, cy);
    ctx.lineTo(cx - 5, cy);
    ctx.moveTo(cx + 5, cy);
    ctx.lineTo(cx + 15, cy);
    ctx.moveTo(cx, cy - 15);
    ctx.lineTo(cx, cy - 5);
    ctx.moveTo(cx, cy + 5);
    ctx.lineTo(cx, cy + 15);
    ctx.stroke();
  }

  drawScanSweep(ctx, w, h, time) {
    this.scanProgress = (this.scanProgress + 0.015) % 1;
    const sweepY = this.scanProgress * h;

    const grad = ctx.createLinearGradient(0, sweepY - 40, 0, sweepY);
    grad.addColorStop(0, 'rgba(0, 240, 255, 0)');
    grad.addColorStop(0.7, 'rgba(0, 240, 255, 0.08)');
    grad.addColorStop(1, 'rgba(0, 240, 255, 0.6)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, sweepY - 40, w, 40);

    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, sweepY);
    ctx.lineTo(w, sweepY);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  drawObjectBox(ctx, obj, { isTarget, isHovered, isSelected, time }) {
    const coords = this.mapBoxToPixels(obj.box_2d);
    if (!coords) return;

    const { x, y, w, h } = coords;
    if (w <= 0 || h <= 0) return;

    const isLiving = obj.category === 'living';

    // Color scheme
    let strokeColor = isLiving ? '#10b981' : '#00f0ff'; // Emerald for Living, Electric Cyan for Non-Living
    let fillColor = isLiving ? 'rgba(16, 185, 129, 0.08)' : 'rgba(0, 240, 255, 0.08)';
    let glowColor = isLiving ? 'rgba(16, 185, 129, 0.5)' : 'rgba(0, 240, 255, 0.5)';

    if (isTarget) {
      strokeColor = '#f59e0b'; // Amber Gold for Target Locked
      fillColor = 'rgba(245, 158, 11, 0.16)';
      glowColor = 'rgba(245, 158, 11, 0.8)';
    } else if (isHovered || isSelected) {
      fillColor = isLiving ? 'rgba(16, 185, 129, 0.18)' : 'rgba(0, 240, 255, 0.18)';
    }

    ctx.save();

    // Box translucent fill
    ctx.fillStyle = fillColor;
    ctx.fillRect(x, y, w, h);

    // Box border with glow
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isTarget ? 2.5 : isHovered ? 2 : 1.2;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = isTarget ? 15 : isHovered ? 10 : 4;
    ctx.strokeRect(x, y, w, h);

    // Futuristic corner brackets
    const bracketLen = Math.min(16, w / 4, h / 4);
    ctx.lineWidth = isTarget ? 3.5 : 2.5;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(x, y + bracketLen);
    ctx.lineTo(x, y);
    ctx.lineTo(x + bracketLen, y);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(x + w - bracketLen, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + bracketLen);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(x, y + h - bracketLen);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + bracketLen, y + h);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(x + w - bracketLen, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - bracketLen);
    ctx.stroke();

    // Target Lock Reticle Animation
    if (isTarget) {
      const pulse = Math.sin(time * 0.008) * 4;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, Math.max(12, Math.min(w, h) / 3) + pulse, 0, Math.PI * 2);
      ctx.stroke();

      // Lock label banner
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('TARGET LOCKED', x + 4, y - 26 > 15 ? y - 24 : y + 14);
    }

    // Label Badge
    this.drawObjectBadge(ctx, obj, x, y, w, h, strokeColor, isLiving, isTarget);

    ctx.restore();
  }

  drawObjectBadge(ctx, obj, x, y, w, h, themeColor, isLiving, isTarget) {
    const labelText = obj.name || 'Object';
    const confText = obj.confidence ? `${obj.confidence}%` : '';
    const categoryBadge = isLiving ? 'LIVING' : 'NON-LIVING';

    ctx.font = '600 11px system-ui, -apple-system, sans-serif';
    const labelWidth = ctx.measureText(labelText).width;
    ctx.font = 'bold 9px monospace';
    const catWidth = ctx.measureText(categoryBadge).width;
    const confWidth = ctx.measureText(confText).width;

    const totalWidth = labelWidth + catWidth + confWidth + 28;
    const badgeHeight = 22;
    const badgeY = y - badgeHeight - 4 >= 4 ? y - badgeHeight - 4 : y + 4;

    // Badge Background
    ctx.fillStyle = 'rgba(8, 12, 20, 0.9)';
    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, badgeY, totalWidth, badgeHeight, 4);
    ctx.fill();
    ctx.stroke();

    // Category Indicator Pill
    ctx.fillStyle = isLiving ? '#10b981' : isTarget ? '#f59e0b' : '#00f0ff';
    ctx.beginPath();
    ctx.arc(x + 10, badgeY + badgeHeight / 2, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Name Text
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 11px system-ui, -apple-system, sans-serif';
    ctx.fillText(labelText, x + 18, badgeY + 15);

    // Category Text
    ctx.fillStyle = isLiving ? '#34d399' : isTarget ? '#fbbf24' : '#38bdf8';
    ctx.font = 'bold 8.5px monospace';
    ctx.fillText(categoryBadge, x + 22 + labelWidth, badgeY + 15);

    // Confidence
    if (confText) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillText(confText, x + 26 + labelWidth + catWidth, badgeY + 15);
    }
  }
}
