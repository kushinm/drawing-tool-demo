/* ============================================================
   exporter.js — Data Export Utilities
   ============================================================
   Handles exporting study data:
   - JSON file with all stroke + gaze data
   - PNG images for each trial's final drawing
   
   We avoid external dependencies (like JSZip) to keep things
   simple. Instead, we trigger multiple downloads or use a 
   single combined JSON file.
   
   EXPORTED FILE FORMAT:
   {participantId}_{date}_data.json — Full session data
   {participantId}_{date}_trial{N}.png — Drawing image per trial
   ============================================================ */

export class Exporter {
  /**
   * @param {DataStore} dataStore - The data store with all session data
   */
  constructor(dataStore) {
    this.dataStore = dataStore;
  }

  /* ----------------------------------------------------------
     MAIN EXPORT FUNCTION
     Downloads the JSON data file and all trial PNGs.
     ---------------------------------------------------------- */

  /**
   * Export all data. Call this at the end of the study.
   * @param {string[]} trialPNGs - Array of data URLs for each trial's canvas PNG
   */
  async exportAll(trialPNGs) {
    const prefix = this.dataStore.getFilenamePrefix();
    const sessionData = this.dataStore.getSessionData();

    // 1. Download the main JSON data file
    this._downloadJSON(sessionData, `${prefix}_data.json`);

    // 2. Download each trial's PNG with a short delay between downloads
    //    (browsers may block rapid multiple downloads)
    for (let i = 0; i < trialPNGs.length; i++) {
      await this._delay(300);
      this._downloadDataURL(trialPNGs[i], `${prefix}_trial${i + 1}.png`);
    }
  }

  /* ----------------------------------------------------------
     DOWNLOAD HELPERS
     ---------------------------------------------------------- */

  /**
   * Download an object as a JSON file.
   */
  _downloadJSON(data, filename) {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    this._downloadBlob(blob, filename);
  }

  /**
   * Download a data URL (like a PNG from canvas.toDataURL).
   */
  _downloadDataURL(dataURL, filename) {
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Download a Blob as a file.
   */
  _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Simple delay helper.
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
