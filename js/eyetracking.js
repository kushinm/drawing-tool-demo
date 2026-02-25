/* ============================================================
   eyetracking.js — WebGazer Eye Tracking Wrapper
   ============================================================
   Wraps the WebGazer.js library with robust camera handling.
   
   KEY IMPROVEMENT: We request camera access ourselves BEFORE
   handing it to WebGazer. This avoids silent permission failures
   and gives clear error messages for each failure mode.
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
    this._cameraStream = null;

    // Calibration settings
    this.CLICKS_PER_POINT = 2;
  }

  /* ----------------------------------------------------------
     CAMERA ACCESS — Explicit, robust permission handling
     ---------------------------------------------------------- */

  /**
   * Request camera access with fallback constraints and clear errors.
   * @returns {Promise<MediaStream>}
   */
  async _requestCamera() {
    // Check if getUserMedia is available at all
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        'Camera API not available. This page must be served over HTTPS ' +
        '(or localhost). Try GitHub Pages for HTTPS hosting.'
      );
    }

    // Try progressively simpler camera constraints
    const constraintSets = [
      { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } },
      { video: { facingMode: 'user' } },
      { video: true }
    ];

    let lastError = null;

    for (const constraints of constraintSets) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('Camera acquired successfully.');
        return stream;
      } catch (err) {
        lastError = err;
        console.warn(`Camera attempt failed (${err.name}): ${err.message}`);

        // Permission denied — no point retrying with other constraints
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          throw new Error(
            'Camera permission was denied.\n\n' +
            'Please grant camera access:\n' +
            '• iPad Safari: tap "Allow" on the popup, or go to Settings → Safari → Camera\n' +
            '• Chrome: click the lock/camera icon in the address bar\n' +
            '• Then reload this page.'
          );
        }

        // Device not found
        if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          throw new Error('No camera found on this device.');
        }
      }
    }

    throw new Error(`Could not access camera: ${lastError?.message || 'Unknown error'}`);
  }

  /* ----------------------------------------------------------
     INITIALIZATION
     ---------------------------------------------------------- */

  /**
   * Initialize WebGazer with robust error handling.
   * @param {function} [onStatus] - Optional callback for progress messages
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async initialize(onStatus) {
    const log = onStatus || ((msg) => console.log('[EyeTracker]', msg));

    // Check WebGazer is loaded
    if (typeof webgazer === 'undefined') {
      return {
        success: false,
        error: 'WebGazer.js is not loaded. Check that lib/webgazer.js exists.'
      };
    }

    try {
      // 1. Get camera stream ourselves (clear error handling)
      log('Requesting camera access...');
      this._cameraStream = await this._requestCamera();

      // 2. Configure WebGazer
      log('Configuring eye tracker...');
      webgazer
        .setRegression('ridge')
        .setGazeListener((data, _timestamp) => {
          if (data && this.isTracking) {
            this._onGaze(data.x, data.y);
          }
        });

      // 3. Pass our stream to WebGazer so it doesn't request camera again
      webgazer.setStaticVideo(this._cameraStream);

      // 4. Start WebGazer (loads the face mesh model — can take a few seconds)
      log('Loading face tracking model (may take a moment)...');
      await webgazer.begin(this._cameraStream);

      // 5. Hide WebGazer's built-in UI (we have our own)
      webgazer.showVideoPreview(false);
      webgazer.showPredictionPoints(false);
      this._hideWebGazerUI();

      this.isInitialized = true;
      log('Eye tracking initialized successfully!');
      return { success: true };

    } catch (err) {
      console.error('EyeTracker init failed:', err);

      let errorMsg = err.message || 'Unknown initialization error.';

      // Detect the MediaPipe loading failure
      if (errorMsg.includes('t is not a function') ||
          errorMsg.includes('face_mesh') ||
          errorMsg.includes('404')) {
        errorMsg =
          'Face tracking model failed to load.\n\n' +
          'Make sure the /mediapipe/face_mesh/ folder is present on your server.\n' +
          '(This folder comes from the WebGazer npm package.)\n\n' +
          'Technical detail: ' + err.message;
      }

      return { success: false, error: errorMsg };
    }
  }

  /**
   * Hide WebGazer's default video/overlay elements.
   */
  _hideWebGazerUI() {
    const ids = [
      'webgazerVideoFeed',
      'webgazerFaceOverlay',
      'webgazerFaceFeedbackBox',
      'webgazerGazeDot',
      'webgazerVideoContainer'
    ];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
  }

  /* ----------------------------------------------------------
     CALIBRATION
     ---------------------------------------------------------- */

  /**
   * Run the 9-point calibration routine.
   * @param {HTMLElement} container - DOM element for calibration dots
   * @returns {Promise<void>}
   */
  async runCalibration(container) {
    webgazer.clearData();

    return new Promise((resolve) => {
      const positions = [
        { x: 10, y: 10 }, { x: 50, y: 10 }, { x: 90, y: 10 },
        { x: 10, y: 50 }, { x: 50, y: 50 }, { x: 90, y: 50 },
        { x: 10, y: 90 }, { x: 50, y: 90 }, { x: 90, y: 90 },
      ];

      let currentIndex = 0;
      let clicksOnCurrent = 0;
      container.innerHTML = '';

      const showNextDot = () => {
        if (currentIndex >= positions.length) {
          container.innerHTML = '';
          resolve();
          return;
        }

        container.innerHTML = '';
        const dot = document.createElement('div');
        dot.className = 'calibration-dot';
        dot.style.left = positions[currentIndex].x + '%';
        dot.style.top = positions[currentIndex].y + '%';
        container.appendChild(dot);

        clicksOnCurrent = 0;
        dot.addEventListener('click', () => {
          clicksOnCurrent++;
          if (clicksOnCurrent >= this.CLICKS_PER_POINT) {
            dot.classList.add('clicked');
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

  startTracking() {
    this.isTracking = true;
    this.gazeDot.classList.add('visible');
  }

  stopTracking() {
    this.isTracking = false;
    this.gazeDot.classList.remove('visible');
  }

  shutdown() {
    this.stopTracking();
    if (this.isInitialized && typeof webgazer !== 'undefined') {
      try { webgazer.end(); } catch (e) { /* ignore */ }
      this.isInitialized = false;
    }
    if (this._cameraStream) {
      this._cameraStream.getTracks().forEach(t => t.stop());
      this._cameraStream = null;
    }
  }

  /* ----------------------------------------------------------
     INTERNAL
     ---------------------------------------------------------- */

  _onGaze(x, y) {
    x = Math.max(0, Math.min(x, window.innerWidth));
    y = Math.max(0, Math.min(y, window.innerHeight));

    this.gazeDot.style.left = x + 'px';
    this.gazeDot.style.top = y + 'px';

    this.dataStore.addGazePoint(x, y);
  }
}
