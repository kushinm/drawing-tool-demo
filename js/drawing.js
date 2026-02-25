/* ============================================================
   drawing.js — Canvas Drawing Engine
   ============================================================
   Handles all drawing on the HTML5 Canvas.
   
   FEATURES:
   - Pen tool with color and thickness
   - Eraser tool
   - Undo (removes last stroke)
   - Clear canvas
   - Apple Pencil pressure sensitivity
   - High-DPI canvas scaling (Retina displays)
   
   ARCHITECTURE:
   We keep a "stroke history" array. Each time we undo or need
   to re-render, we replay all strokes from scratch. This is
   simple and reliable (no complex state management needed).
   ============================================================ */

export class DrawingEngine {
  /**
   * @param {HTMLCanvasElement} canvas - The drawing canvas element
   * @param {DataStore} dataStore - Reference to the data store for recording
   */
  constructor(canvas, dataStore) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.dataStore = dataStore;

    // Current tool settings
    this.tool = 'pen';        // 'pen' or 'eraser'
    this.color = '#1a1a2e';
    this.thickness = 4;

    // Drawing state
    this.isDrawing = false;
    this.enabled = false;     // Drawing only allowed during active trial

    // Stroke history for undo/redo
    // Each entry is an array of points with tool settings
    this._strokeHistory = [];
    this._currentPoints = [];

    // Set up the canvas for high-DPI screens
    this._setupHiDPI();

    // Bind all input events
    this._bindEvents();
  }

  /* ----------------------------------------------------------
     CANVAS SETUP
     ---------------------------------------------------------- */

  /**
   * Handle high-DPI (Retina) displays.
   * Canvas pixels ≠ CSS pixels on Retina screens.
   * We scale the canvas buffer up so lines look crisp.
   */
  _setupHiDPI() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Set the canvas buffer size (actual pixels)
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;

    // Set the CSS display size
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';

    // Scale the context so drawing commands use CSS coordinates
    this.ctx.scale(dpr, dpr);

    // Store logical dimensions for coordinate conversion
    this.logicalWidth = rect.width;
    this.logicalHeight = rect.height;

    // Tell the data store about our canvas size
    this.dataStore.setCanvasSize(rect.width, rect.height);

    // Clear to white
    this._clearCanvas();
  }

  /**
   * Call this if the window is resized (unlikely mid-trial, but safe).
   */
  resize() {
    // Save current image data
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    this._setupHiDPI();
    // Replay all strokes instead of restoring image (cleaner)
    this._replayStrokes();
  }

  /* ----------------------------------------------------------
     INPUT HANDLING
     Supports both mouse and touch/stylus (Apple Pencil).
     ---------------------------------------------------------- */
  _bindEvents() {
    const c = this.canvas;

    // --- Pointer Events (modern API, works for mouse + touch + pencil) ---
    c.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    c.addEventListener('pointermove', (e) => this._onPointerMove(e));
    c.addEventListener('pointerup', (e) => this._onPointerUp(e));
    c.addEventListener('pointercancel', (e) => this._onPointerUp(e));
    c.addEventListener('pointerleave', (e) => this._onPointerUp(e));

    // Prevent default touch behaviors (scrolling, zooming)
    c.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    c.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  /**
   * Convert a pointer event to canvas-local coordinates.
   * Returns { x, y, pressure }.
   */
  _getPointerPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      // Apple Pencil provides pressure via PointerEvent.pressure
      // Mouse defaults to 0.5
      pressure: e.pressure !== undefined ? e.pressure : 0.5
    };
  }

  _onPointerDown(e) {
    if (!this.enabled) return;

    // Only respond to primary pointer (ignore palm rejection on iPad)
    if (!e.isPrimary) return;

    this.isDrawing = true;
    const pos = this._getPointerPos(e);

    // Start recording this stroke
    this._currentPoints = [];
    this._addPoint(pos);

    // Record in data store
    this.dataStore.startStroke(this.tool, this.color, this.thickness);
    this.dataStore.addStrokePoint(pos.x, pos.y, pos.pressure);

    // Begin the visual path
    this.ctx.beginPath();
    this._applyToolStyle();
    this.ctx.moveTo(pos.x, pos.y);
  }

  _onPointerMove(e) {
    if (!this.isDrawing || !this.enabled) return;
    if (!e.isPrimary) return;

    const pos = this._getPointerPos(e);
    this._addPoint(pos);

    // Record in data store
    this.dataStore.addStrokePoint(pos.x, pos.y, pos.pressure);

    // Draw the line segment
    this.ctx.lineTo(pos.x, pos.y);
    this.ctx.stroke();
    // Continue the path from this point
    this.ctx.beginPath();
    this.ctx.moveTo(pos.x, pos.y);
  }

  _onPointerUp(e) {
    if (!this.isDrawing) return;

    this.isDrawing = false;

    // Save this stroke to history (for undo)
    if (this._currentPoints.length > 0) {
      this._strokeHistory.push({
        tool: this.tool,
        color: this.color,
        thickness: this.thickness,
        points: [...this._currentPoints]
      });
    }

    // End recording in data store
    this.dataStore.endStroke();
    this._currentPoints = [];
  }

  _addPoint(pos) {
    this._currentPoints.push({
      x: pos.x,
      y: pos.y,
      pressure: pos.pressure
    });
  }

  /* ----------------------------------------------------------
     RENDERING
     ---------------------------------------------------------- */

  /**
   * Apply the current tool's visual style to the canvas context.
   */
  _applyToolStyle() {
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (this.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = this.thickness * 4; // eraser is bigger
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.thickness;
    }
  }

  /**
   * Replay all strokes from history onto a clean canvas.
   * Used after undo or clear operations.
   */
  _replayStrokes() {
    this._clearCanvas();
    const ctx = this.ctx;

    for (const stroke of this._strokeHistory) {
      if (stroke.points.length === 0) continue;

      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stroke.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.lineWidth = stroke.thickness * 4;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.thickness;
      }

      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }

    // Reset composite operation
    ctx.globalCompositeOperation = 'source-over';
  }

  /**
   * Clear the canvas to white.
   */
  _clearCanvas() {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
    ctx.restore();
  }

  /* ----------------------------------------------------------
     PUBLIC TOOL ACTIONS
     Called by the UI module when the user clicks tool buttons.
     ---------------------------------------------------------- */

  setTool(tool) {
    this.tool = tool;
  }

  setColor(color) {
    this.color = color;
    // Switch to pen when picking a color
    this.tool = 'pen';
  }

  setThickness(thickness) {
    this.thickness = thickness;
  }

  /**
   * Undo the last stroke.
   */
  undo() {
    if (this._strokeHistory.length === 0) return;
    this._strokeHistory.pop();
    this._replayStrokes();
    this.dataStore.recordAction('undo');
  }

  /**
   * Clear the entire canvas and stroke history.
   */
  clearAll() {
    this._strokeHistory = [];
    this._clearCanvas();
    this.dataStore.recordAction('clear');
  }

  /**
   * Enable drawing (called when a trial starts).
   */
  enable() {
    this.enabled = true;
  }

  /**
   * Disable drawing (called when a trial ends).
   */
  disable() {
    this.enabled = false;
    this.isDrawing = false;
  }

  /**
   * Reset for a new trial (clears canvas and history).
   */
  reset() {
    this._strokeHistory = [];
    this._currentPoints = [];
    this._clearCanvas();
  }

  /**
   * Export the current canvas as a PNG data URL.
   */
  exportPNG() {
    return this.canvas.toDataURL('image/png');
  }
}
