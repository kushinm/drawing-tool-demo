/* ============================================================
   datastore.js — Data Collection & Export
   ============================================================
   This module manages all the data we collect during the study.
   
   KEY CONCEPT: Shared Timeline
   Both stroke data and gaze data use the same time reference
   (performance.now() offset to a session start time). This means
   you can directly compare timestamps across strokes and gazes.
   
   DATA STRUCTURE OVERVIEW:
   
   sessionData = {
     participantId: "P001",
     sessionStartTime: 1700000000000,   // Unix ms when session began
     screenWidth: 1024,
     screenHeight: 768,
     canvasWidth: 1024,
     canvasHeight: 620,
     userAgent: "...",
     trials: [
       {
         trialNumber: 1,
         startTime: 1234.56,            // ms since session start
         endTime: 5678.90,
         strokes: [
           {
             strokeId: 0,
             tool: "pen",               // "pen" or "eraser"
             color: "#1a1a2e",
             thickness: 4,
             startTime: 1300.00,
             endTime: 1450.00,
             points: [
               { x: 100, y: 200, pressure: 0.5, time: 1300.00 },
               { x: 101, y: 201, pressure: 0.6, time: 1316.67 },
               ...
             ]
           },
           ...
         ],
         actions: [
           { type: "undo", time: 2000.00 },
           { type: "clear", time: 3000.00 },
           ...
         ],
         gazeData: [
           { x: 500, y: 300, time: 1234.56 },
           { x: 502, y: 301, time: 1250.23 },
           ...
         ]
       }
     ]
   }
   ============================================================ */

export class DataStore {
  constructor() {
    // The epoch for all timestamps in this session.
    // We record this so we can convert relative times back to absolute if needed.
    this.sessionStartEpoch = Date.now();
    this.sessionStartPerf = performance.now();

    // Main data container
    this.sessionData = {
      participantId: '',
      sessionStartTime: this.sessionStartEpoch,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      canvasWidth: 0,    // set later when canvas is ready
      canvasHeight: 0,
      devicePixelRatio: window.devicePixelRatio || 1,
      userAgent: navigator.userAgent,
      trials: []
    };

    // Tracks the currently active trial (null if between trials)
    this._currentTrial = null;
    this._currentStroke = null;
    this._strokeCounter = 0;
  }

  /* ----------------------------------------------------------
     TIMING HELPER
     Returns milliseconds since session start.
     All timestamps in our data use this reference.
     ---------------------------------------------------------- */
  now() {
    return performance.now() - this.sessionStartPerf;
  }

  /* ----------------------------------------------------------
     SESSION SETUP
     ---------------------------------------------------------- */
  setParticipantId(id) {
    this.sessionData.participantId = id;
  }

  setCanvasSize(width, height) {
    this.sessionData.canvasWidth = width;
    this.sessionData.canvasHeight = height;
  }

  /* ----------------------------------------------------------
     TRIAL MANAGEMENT
     ---------------------------------------------------------- */

  /**
   * Start a new trial. Returns the trial number (1-indexed).
   */
  startTrial() {
    const trialNumber = this.sessionData.trials.length + 1;
    this._strokeCounter = 0;

    this._currentTrial = {
      trialNumber: trialNumber,
      startTime: this.now(),
      endTime: null,
      strokes: [],
      actions: [],     // undo, clear, etc.
      gazeData: []
    };

    this.sessionData.trials.push(this._currentTrial);
    return trialNumber;
  }

  /**
   * End the current trial.
   */
  endTrial() {
    if (this._currentTrial) {
      this._currentTrial.endTime = this.now();
      // Finalize any in-progress stroke
      this.endStroke();
      this._currentTrial = null;
    }
  }

  /**
   * Check if a trial is currently active.
   */
  isTrialActive() {
    return this._currentTrial !== null;
  }

  /* ----------------------------------------------------------
     STROKE RECORDING
     Called by the drawing module as the user draws.
     ---------------------------------------------------------- */

  /**
   * Begin a new stroke.
   * @param {string} tool - "pen" or "eraser"
   * @param {string} color - hex color string
   * @param {number} thickness - line width in pixels
   */
  startStroke(tool, color, thickness) {
    if (!this._currentTrial) return;

    this._currentStroke = {
      strokeId: this._strokeCounter++,
      tool: tool,
      color: color,
      thickness: thickness,
      startTime: this.now(),
      endTime: null,
      points: []
    };

    this._currentTrial.strokes.push(this._currentStroke);
  }

  /**
   * Add a point to the current stroke.
   * @param {number} x - x coordinate on canvas
   * @param {number} y - y coordinate on canvas
   * @param {number} pressure - Apple Pencil pressure (0-1), defaults to 0.5
   */
  addStrokePoint(x, y, pressure = 0.5) {
    if (!this._currentStroke) return;

    this._currentStroke.points.push({
      x: Math.round(x * 100) / 100,  // round to 2 decimal places
      y: Math.round(y * 100) / 100,
      pressure: Math.round(pressure * 1000) / 1000,
      time: this.now()
    });
  }

  /**
   * End the current stroke.
   */
  endStroke() {
    if (this._currentStroke) {
      this._currentStroke.endTime = this.now();
      this._currentStroke = null;
    }
  }

  /* ----------------------------------------------------------
     ACTION RECORDING
     Records non-drawing actions (undo, clear) for analysis.
     ---------------------------------------------------------- */
  recordAction(actionType) {
    if (!this._currentTrial) return;

    this._currentTrial.actions.push({
      type: actionType,
      time: this.now()
    });
  }

  /* ----------------------------------------------------------
     GAZE DATA RECORDING
     Called by the eye tracking module at ~60Hz.
     ---------------------------------------------------------- */

  /**
   * Record a gaze point.
   * @param {number} x - gaze x on screen
   * @param {number} y - gaze y on screen
   */
  addGazePoint(x, y) {
    if (!this._currentTrial) return;

    this._currentTrial.gazeData.push({
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      time: this.now()
    });
  }

  /* ----------------------------------------------------------
     DATA EXPORT
     ---------------------------------------------------------- */

  /**
   * Get the full session data object (for JSON export).
   */
  getSessionData() {
    return this.sessionData;
  }

  /**
   * Get a summary for the "study complete" screen.
   */
  getSummary() {
    return this.sessionData.trials.map(trial => {
      const durationSec = ((trial.endTime - trial.startTime) / 1000).toFixed(1);
      return {
        trialNumber: trial.trialNumber,
        duration: durationSec,
        strokeCount: trial.strokes.length,
        gazePointCount: trial.gazeData.length,
        actionCount: trial.actions.length
      };
    });
  }

  /**
   * Generate a filename-safe string for this session.
   */
  getFilenamePrefix() {
    const pid = this.sessionData.participantId || 'unknown';
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return `${pid}_${date}`;
  }
}
