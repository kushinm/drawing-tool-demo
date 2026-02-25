/* ============================================================
   app.js — Main Application Controller
   ============================================================
   This is the "brain" of the app. It:
   1. Creates all the module instances (DataStore, Drawing, etc.)
   2. Manages screen navigation (welcome → calibration → trials → done)
   3. Handles the trial lifecycle (start/end trial, advance)
   4. Wires up all UI button events
   
   FLOW:
   Welcome Screen → Calibration → Trial 1 → Trial 2 → Trial 3 → Done
   
   To change the number of trials, edit TOTAL_TRIALS below.
   ============================================================ */

import { DataStore } from './datastore.js';
import { DrawingEngine } from './drawing.js';
import { EyeTracker } from './eyetracking.js';
import { Exporter } from './exporter.js';

// ---- CONFIGURATION ----
const TOTAL_TRIALS = 3;   // Number of drawing trials

// ---- MODULE INSTANCES ----
// (created after DOM is ready)
let dataStore;
let drawing;
let eyeTracker;
let exporter;

// ---- STATE ----
let currentTrialNumber = 0;
let timerInterval = null;
let trialStartTime = 0;
let trialPNGs = [];        // Store each trial's final drawing as PNG data URL

/* ==============================================================
   DOM REFERENCES
   We grab all the elements we need up front.
   ============================================================== */
const $ = (sel) => document.querySelector(sel);

const screens = {
  welcome: $('#screen-welcome'),
  calibration: $('#screen-calibration'),
  drawing: $('#screen-drawing'),
  done: $('#screen-done'),
};

const elements = {
  // Welcome
  participantId: $('#participant-id'),
  btnStartCalibration: $('#btn-start-calibration'),
  welcomeError: $('#welcome-error'),

  // Calibration
  calibrationInstruction: $('#calibration-instruction'),
  btnBeginCalibration: $('#btn-begin-calibration'),
  calibrationDots: $('#calibration-dots'),
  calibrationComplete: $('#calibration-complete'),
  btnGoToTrials: $('#btn-go-to-trials'),

  // Drawing
  canvas: $('#drawing-canvas'),
  gazeDot: $('#gaze-dot'),
  trialLabel: $('#trial-label'),
  trialTimer: $('#trial-timer'),
  trialStatus: $('#trial-status'),

  // Tools
  toolPen: $('#tool-pen'),
  toolEraser: $('#tool-eraser'),
  toolUndo: $('#tool-undo'),
  toolClear: $('#tool-clear'),

  // Trial controls
  btnStartTrial: $('#btn-start-trial'),
  btnEndTrial: $('#btn-end-trial'),

  // Done
  summaryStats: $('#summary-stats'),
  btnDownload: $('#btn-download'),
};

/* ==============================================================
   SCREEN NAVIGATION
   Only one screen is visible at a time.
   ============================================================== */
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

/* ==============================================================
   TIMER
   Shows elapsed time during a trial (MM:SS format).
   ============================================================== */
function startTimer() {
  trialStartTime = performance.now();
  elements.trialTimer.textContent = '00:00';

  timerInterval = setInterval(() => {
    const elapsed = (performance.now() - trialStartTime) / 1000;
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = Math.floor(elapsed % 60).toString().padStart(2, '0');
    elements.trialTimer.textContent = `${mins}:${secs}`;
  }, 500);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

/* ==============================================================
   TRIAL LIFECYCLE
   ============================================================== */

function onStartTrial() {
  currentTrialNumber++;
  if (currentTrialNumber > TOTAL_TRIALS) return;

  // Update UI
  elements.trialLabel.textContent = `Trial ${currentTrialNumber} of ${TOTAL_TRIALS}`;
  elements.trialStatus.textContent = 'Drawing...';
  elements.btnStartTrial.disabled = true;
  elements.btnEndTrial.disabled = false;

  // Reset canvas for new trial
  drawing.reset();
  drawing.enable();

  // Start data recording
  dataStore.startTrial();

  // Start gaze tracking
  eyeTracker.startTracking();

  // Start the visible timer
  startTimer();
}

function onEndTrial() {
  // Stop everything
  stopTimer();
  drawing.disable();
  eyeTracker.stopTracking();
  dataStore.endTrial();

  // Save the final drawing as PNG
  trialPNGs.push(drawing.exportPNG());

  // Check if we have more trials
  if (currentTrialNumber < TOTAL_TRIALS) {
    // More trials to go
    elements.trialStatus.textContent = `Trial ${currentTrialNumber} complete. Ready for next trial.`;
    elements.btnStartTrial.disabled = false;
    elements.btnEndTrial.disabled = true;
  } else {
    // All trials done!
    elements.trialStatus.textContent = 'All trials complete!';
    elements.btnStartTrial.disabled = true;
    elements.btnEndTrial.disabled = true;

    // Shut down eye tracker
    eyeTracker.shutdown();

    // Show the done screen after a brief pause
    setTimeout(() => {
      showDoneScreen();
    }, 1000);
  }
}

function showDoneScreen() {
  showScreen('done');

  // Populate summary
  const summary = dataStore.getSummary();
  let html = '';
  for (const trial of summary) {
    html += `
      <div style="margin-bottom: 0.5rem;">
        <strong>Trial ${trial.trialNumber}:</strong>
        ${trial.duration}s · ${trial.strokeCount} strokes · ${trial.gazePointCount} gaze points
      </div>
    `;
  }
  elements.summaryStats.innerHTML = html;
}

/* ==============================================================
   TOOL UI WIRING
   ============================================================== */
function setupToolbar() {
  // Tool buttons (pen, eraser)
  const toolBtns = document.querySelectorAll('.tool-btn[data-tool]');
  toolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;

      if (tool === 'undo') {
        drawing.undo();
        return;
      }
      if (tool === 'clear') {
        drawing.clearAll();
        return;
      }

      // Toggle active state for pen/eraser
      toolBtns.forEach(b => {
        if (b.dataset.tool === 'pen' || b.dataset.tool === 'eraser') {
          b.classList.remove('active');
        }
      });
      btn.classList.add('active');
      drawing.setTool(tool);
    });
  });

  // Thickness buttons
  const thicknessBtns = document.querySelectorAll('.thickness-btn');
  thicknessBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      thicknessBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      drawing.setThickness(parseInt(btn.dataset.size));
    });
  });

  // Color buttons
  const colorBtns = document.querySelectorAll('.color-btn');
  colorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      colorBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      drawing.setColor(btn.dataset.color);
      // Also switch to pen tool
      toolBtns.forEach(b => {
        if (b.dataset.tool === 'pen') b.classList.add('active');
        if (b.dataset.tool === 'eraser') b.classList.remove('active');
      });
    });
  });
}

/* ==============================================================
   INITIALIZATION
   Everything starts here when the page loads.
   ============================================================== */
function init() {
  // Create module instances
  dataStore = new DataStore();
  drawing = new DrawingEngine(elements.canvas, dataStore);
  eyeTracker = new EyeTracker(dataStore, elements.gazeDot);
  exporter = new Exporter(dataStore);

  // ---- Welcome Screen ----
  // Enable the start button once a participant ID is entered
  elements.participantId.addEventListener('input', () => {
    elements.btnStartCalibration.disabled = elements.participantId.value.trim() === '';
  });

  elements.btnStartCalibration.addEventListener('click', async () => {
    const pid = elements.participantId.value.trim();
    if (!pid) return;

    dataStore.setParticipantId(pid);
    elements.welcomeError.textContent = '';

    // Initialize WebGazer (requests camera)
    elements.btnStartCalibration.textContent = 'Initializing camera...';
    elements.btnStartCalibration.disabled = true;

    const success = await eyeTracker.initialize();
    if (!success) {
      elements.welcomeError.textContent = 
        'Could not access the camera. Please allow camera access and try again.';
      elements.btnStartCalibration.textContent = 'Start Calibration';
      elements.btnStartCalibration.disabled = false;
      return;
    }

    // Move to calibration screen
    showScreen('calibration');
  });

  // ---- Calibration Screen ----
  elements.btnBeginCalibration.addEventListener('click', async () => {
    elements.calibrationInstruction.style.display = 'none';

    // Run the 9-point calibration
    await eyeTracker.runCalibration(elements.calibrationDots);

    // Show completion message
    elements.calibrationComplete.style.display = 'block';
  });

  elements.btnGoToTrials.addEventListener('click', () => {
    showScreen('drawing');
    // Resize canvas now that it's visible
    drawing.resize();
  });

  // ---- Drawing Screen ----
  setupToolbar();
  elements.btnStartTrial.addEventListener('click', onStartTrial);
  elements.btnEndTrial.addEventListener('click', onEndTrial);

  // ---- Done Screen ----
  elements.btnDownload.addEventListener('click', () => {
    exporter.exportAll(trialPNGs);
  });

  // ---- Handle window resize ----
  window.addEventListener('resize', () => {
    if (screens.drawing.classList.contains('active')) {
      drawing.resize();
    }
  });

  // Show welcome screen
  showScreen('welcome');
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
