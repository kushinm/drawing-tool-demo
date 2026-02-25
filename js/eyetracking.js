/* ============================================================
   eyetracking.js — WebGazer Eye Tracking Wrapper
   ============================================================
   Wraps the WebGazer.js library to provide:
   - Initialization and camera access
   - 9-point calibration routine
   - Continuous gaze data streaming into the DataStore
   - Gaze visualization (optional dot overlay)
   
   IMPORTANT NOTES FOR RESEARCHERS:
   - WebGazer uses the device's front-facing camera
   - Accuracy depends heavily on calibration quality
   - Works best in good lighting with minimal head movement
   - On iPad, Safari must grant camera permission
   - Gaze coordinates are in screen pixels (not canvas pixels)
   
   CALIBRATION:
   We use a simple 9-point calibration grid. The participant
   clicks each point while looking at it. Each point must be
   clicked twice for basic accuracy. You can increase
   CLICKS_PER_POINT for better calibration.
   ============================================================ */

export class EyeTracker {
  /**
   * @param {DataStore} dataStore - Reference to the data store
   * @param {HTMLElement} gazeDot - The gaze visualization dot element
   */
  constructor(dataStore, gazeDot) {
    this.dataStore = dataStore;
    this.gazeDot = gazeDot;
    this.isTracking = false;
    this.isInitialized = false;
    this._gazeListener = null;

    // Calibration settings
    this.CLICKS_PER_POINT = 2;  // How many clicks per calibration point
  }

  /* ----------------------------------------------------------
     INITIALIZATION
     ---------------------------------------------------------- */

  /**
   * Initialize WebGazer. Must be called before calibration.
   * Requests camera permission and sets up the library.
   * @returns {Promise<boolean>} true if successful
   */
  async initialize() {
    // Check if WebGazer is loaded
    if (typeof webgazer === 'undefined') {
      console.error('WebGazer.js not loaded! Check your script tag.');
      return false;
    }

    try {
      // Configure WebGazer
      webgazer
        .setRegression('ridge')       // Ridge regression is most accurate
        .setGazeListener((data, timestamp) => {
          // This fires on every gaze prediction (~60Hz)
          if (data && this.isTracking) {
            this._onGaze(data.x, data.y);
          }
        });

      // Start WebGazer (this triggers camera permission dialog)
      await webgazer.begin();

      // Hide the built-in video preview and prediction dot
      // (We have our own gaze dot visualization)
      webgazer.showVideoPreview(false);
      webgazer.showPredictionPoints(false);

      // Try to also hide the default webgazer video element if it exists
      const videoEl = document.getElementById('webgazerVideoFeed');
      if (videoEl) videoEl.style.display = 'none';
      const faceOverlay = document.getElementById('webgazerFaceOverlay');
      if (faceOverlay) faceOverlay.style.display = 'none';
      const faceFeedbackBox = document.getElementById('webgazerFaceFeedbackBox');
      if (faceFeedbackBox) faceFeedbackBox.style.display = 'none';

      this.isInitialized = true;
      console.log('WebGazer initialized successfully.');
      return true;

    } catch (err) {
      console.error('Failed to initialize WebGazer:', err);
      return false;
    }
  }

  /* ----------------------------------------------------------
     CALIBRATION
     9 points arranged in a grid across the screen.
     ---------------------------------------------------------- */

  /**
   * Run the calibration routine.
   * Creates dots that the user clicks while looking at them.
   * @param {HTMLElement} container - DOM element to put dots in
   * @returns {Promise<void>} resolves when calibration is complete
   */
  async runCalibration(container) {
    // Clear WebGazer's existing calibration data
    webgazer.clearData();

    return new Promise((resolve) => {
      // Define 9 calibration points as percentage positions
      // Arranged in a 3x3 grid with margins from edges
      const positions = [
        { x: 10, y: 10 }, { x: 50, y: 10 }, { x: 90, y: 10 },
        { x: 10, y: 50 }, { x: 50, y: 50 }, { x: 90, y: 50 },
        { x: 10, y: 90 }, { x: 50, y: 90 }, { x: 90, y: 90 },
      ];

      let currentIndex = 0;
      let clicksOnCurrent = 0;

      // Clear any existing dots
      container.innerHTML = '';

      const showNextDot = () => {
        if (currentIndex >= positions.length) {
          // Calibration complete!
          container.innerHTML = '';
          resolve();
          return;
        }

        // Remove previous dot
        container.innerHTML = '';

        // Create new dot
        const dot = document.createElement('div');
        dot.className = 'calibration-dot';
        dot.style.left = positions[currentIndex].x + '%';
        dot.style.top = positions[currentIndex].y + '%';
        container.appendChild(dot);

        // Handle clicks on the dot
        clicksOnCurrent = 0;
        dot.addEventListener('click', () => {
          clicksOnCurrent++;
          if (clicksOnCurrent >= this.CLICKS_PER_POINT) {
            dot.classList.add('clicked');
            // Short delay so user sees the "clicked" state
            setTimeout(() => {
              currentIndex++;
              showNextDot();
            }, 300);
          }
        });
      };

      showNextDot();
    });
  }

  /* ----------------------------------------------------------
     TRACKING CONTROL
     ---------------------------------------------------------- */

  /**
   * Start recording gaze data and showing the gaze dot.
   */
  startTracking() {
    this.isTracking = true;
    this.gazeDot.classList.add('visible');
  }

  /**
   * Stop recording gaze data and hide the gaze dot.
   */
  stopTracking() {
    this.isTracking = false;
    this.gazeDot.classList.remove('visible');
  }

  /**
   * Completely shut down WebGazer (end of study).
   */
  shutdown() {
    this.stopTracking();
    if (this.isInitialized && typeof webgazer !== 'undefined') {
      webgazer.end();
      this.isInitialized = false;
    }
  }

  /* ----------------------------------------------------------
     INTERNAL: GAZE CALLBACK
     Called ~60 times per second with gaze coordinates.
     ---------------------------------------------------------- */
  _onGaze(x, y) {
    // Clamp to screen bounds
    x = Math.max(0, Math.min(x, window.innerWidth));
    y = Math.max(0, Math.min(y, window.innerHeight));

    // Update the visual indicator
    this.gazeDot.style.left = x + 'px';
    this.gazeDot.style.top = y + 'px';

    // Record in data store (only during active trial)
    this.dataStore.addGazePoint(x, y);
  }
}
