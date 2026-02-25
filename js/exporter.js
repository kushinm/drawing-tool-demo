/* ============================================================
   exporter.js — Data Export as Single ZIP
   ============================================================
   Uses JSZip (loaded via <script> tag in index.html) to bundle
   all study data into one downloadable .zip file.
   
   ZIP CONTENTS:
     {participantId}_{date}/
       data.json              — Full session data (strokes + gaze)
       trial1.png             — Drawing image for trial 1
       trial2.png             — Drawing image for trial 2
       trial3.png             — Drawing image for trial 3
   ============================================================ */

export class Exporter {
  /**
   * @param {DataStore} dataStore - The data store with all session data
   */
  constructor(dataStore) {
    this.dataStore = dataStore;
  }

  /* ----------------------------------------------------------
     MAIN EXPORT — Single ZIP download
     ---------------------------------------------------------- */

  /**
   * Export all data as a single .zip file.
   * @param {string[]} trialPNGs - Array of data URLs for each trial's canvas PNG
   */
  async exportAll(trialPNGs) {
    const prefix = this.dataStore.getFilenamePrefix();
    const sessionData = this.dataStore.getSessionData();

    // Check JSZip is loaded
    if (typeof JSZip === 'undefined') {
      console.error('JSZip not loaded! Falling back to individual downloads.');
      this._fallbackExport(sessionData, trialPNGs, prefix);
      return;
    }

    const zip = new JSZip();

    // Create a folder inside the zip
    const folder = zip.folder(prefix);

    // Add the JSON data file
    const jsonStr = JSON.stringify(sessionData, null, 2);
    folder.file('data.json', jsonStr);

    // Add each trial's PNG
    for (let i = 0; i < trialPNGs.length; i++) {
      // trialPNGs[i] is a data URL like "data:image/png;base64,iVBOR..."
      // We need just the base64 part after the comma
      const base64Data = trialPNGs[i].split(',')[1];
      folder.file(`trial${i + 1}.png`, base64Data, { base64: true });
    }

    // Generate the zip and trigger download
    const blob = await zip.generateAsync({ type: 'blob' });
    this._downloadBlob(blob, `${prefix}.zip`);
  }

  /* ----------------------------------------------------------
     DOWNLOAD HELPER
     ---------------------------------------------------------- */

  /**
   * Trigger a browser download for a Blob.
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

  /* ----------------------------------------------------------
     FALLBACK — If JSZip fails to load, download files individually
     ---------------------------------------------------------- */

  _fallbackExport(sessionData, trialPNGs, prefix) {
    // Download JSON
    const jsonStr = JSON.stringify(sessionData, null, 2);
    const jsonBlob = new Blob([jsonStr], { type: 'application/json' });
    this._downloadBlob(jsonBlob, `${prefix}_data.json`);

    // Download PNGs with short delays (browsers block rapid downloads)
    trialPNGs.forEach((dataURL, i) => {
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = `${prefix}_trial${i + 1}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, (i + 1) * 400);
    });
  }
}