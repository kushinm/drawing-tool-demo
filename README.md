# Sandboxing Drawing tool!

What we're trying here --
A web-based drawing tool with integrated webcam eye tracking. 
Participants complete drawing trials using a stylus (Apple Pencil) while their eye gaze is tracked via the device's front-facing camera.

## Quick Start

### Option 1: GitHub Pages (recommended for deployment)

1. Push this repo to GitHub
2. Go to **Settings → Pages → Source → Deploy from branch** (main, root)
3. Access at `https://kushinm.github.io/drawing-tool-demo/`
4. Open on your iPad's Safari browser

### Option 2: Local Development

Any local HTTP server works. For example:

```bash
# Python 3
python3 -m http.server 8000

# Node.js (npx, no install needed)
npx serve .

# VS Code: use the "Live Server" extension
```

Then open `http://localhost:8000` in your browser.

> **Important:** The app must be served over HTTPS (or localhost) for camera access to work. GitHub Pages provides HTTPS automatically.
I recommend just doing the github pages version for now!
---

## How It Works

### Study Flow

```
Welcome Screen → Calibration → Trials →Data Export
```

1. **Welcome**: Participant enters their ID
2. **Calibration**: 9-point eye tracking calibration (click dots while looking at them)
3. **Drawing Trials**: 3 trials, each with explicit Start/End buttons
4. **Export**: Download JSON data + PNG images (we can hook up a DB later)

### What Gets Recorded

| Data Type | What | Sample Rate |
|-----------|------|-------------|
| **Strokes** | x, y, pressure, timestamp per point | Every pointer event (~60-120Hz) |
| **Gaze** | x, y, timestamp | ~60Hz (WebGazer prediction rate) |
| **Actions** | undo, clear events with timestamps | On occurrence |
| **Trial timing** | Start/end time per trial | On occurrence |

All timestamps use the same clock (`performance.now()` relative to session start), so strokes and gaze data are directly comparable.

---

## Project Structure

```
├── index.html              # Main HTML — screens, toolbar, canvas
├── css/
│   └── styles.css          # All styles, CSS variables for theming
├── js/
│   ├── app.js              # Main controller — screen flow, trial lifecycle
│   ├── datastore.js        # Data structures & timestamp management
│   ├── drawing.js          # Canvas drawing engine (pen, eraser, undo)
│   ├── eyetracking.js      # WebGazer wrapper (calibration, gaze recording)
│   └── exporter.js         # File download utilities
└── README.md
```

### Module Responsibilities

- **`app.js`** — The "brain." Creates all modules, manages navigation between screens, handles button clicks, runs the trial loop.
- **`datastore.js`** — Single source of truth for all collected data. Provides a shared `now()` clock. Other modules call methods like `addStrokePoint()` and `addGazePoint()` to record data.
- **`drawing.js`** — Manages the HTML5 Canvas. Handles pointer events (mouse, touch, Apple Pencil), stroke rendering, undo via replay, and PNG export.
- **`eyetracking.js`** — Thin wrapper around WebGazer.js. Manages initialization, calibration UI, and pipes gaze predictions into the DataStore.
- **`exporter.js`** — Downloads data as files (JSON + PNGs). No external dependencies.

---

## Data Format

The exported JSON file has this structure:

```jsonc
{
  "participantId": "P001",
  "sessionStartTime": 1700000000000,    // Unix timestamp (ms)
  "screenWidth": 1024,
  "screenHeight": 768,
  "canvasWidth": 1024,
  "canvasHeight": 640,
  "devicePixelRatio": 2,
  "userAgent": "Mozilla/5.0 ...",
  "trials": [
    {
      "trialNumber": 1,
      "startTime": 5000.0,              // ms since session start
      "endTime": 65000.0,
      "strokes": [
        {
          "strokeId": 0,
          "tool": "pen",                 // "pen" or "eraser"
          "color": "#1a1a2e",
          "thickness": 4,
          "startTime": 5500.0,
          "endTime": 6200.0,
          "points": [
            { "x": 412.5, "y": 300.1, "pressure": 0.45, "time": 5500.0 },
            { "x": 413.2, "y": 301.0, "pressure": 0.52, "time": 5516.7 }
            // ... more points
          ]
        }
        // ... more strokes
      ],
      "actions": [
        { "type": "undo", "time": 15000.0 },
        { "type": "clear", "time": 30000.0 }
      ],
      "gazeData": [
        { "x": 500.0, "y": 350.2, "time": 5000.0 },
        { "x": 501.5, "y": 349.8, "time": 5016.7 }
        // ... ~60 points per second
      ]
    }
    // ... trials 2 and 3
  ]
}
```

### Linking Strokes to Gaze

Since both strokes and gaze use the same `time` reference, you can align them directly:

```python
import json
import pandas as pd

with open('P001_2024-01-15_data.json') as f:
    data = json.load(f)

trial = data['trials'][0]

# Convert to DataFrames
gaze_df = pd.DataFrame(trial['gazeData'])

# For each stroke, find gaze points during that stroke
for stroke in trial['strokes']:
    mask = (gaze_df['time'] >= stroke['startTime']) & \
           (gaze_df['time'] <= stroke['endTime'])
    gaze_during_stroke = gaze_df[mask]
    print(f"Stroke {stroke['strokeId']}: {len(gaze_during_stroke)} gaze points")
```

---

## iPad / Apple Pencil Notes

- **Apple Pencil pressure** is captured via `PointerEvent.pressure` (0.0–1.0)
- **Palm rejection** works automatically — only the primary pointer is tracked
- **Safari on iPad** requires HTTPS for camera access (use GitHub Pages)
- The toolbar uses large touch targets (48px minimum) for finger interaction
- `touch-action: none` prevents unwanted scrolling/zooming during drawing

---

## Configuration

### Changing the Number of Trials

In `js/app.js`, edit line 18:

```js
const TOTAL_TRIALS = 3;   // Change to any number
```

### Changing Calibration Accuracy

In `js/eyetracking.js`, edit the `CLICKS_PER_POINT` property:

```js
this.CLICKS_PER_POINT = 2;  // Increase for better calibration (slower)
```

### Adding Drawing Colors

In `index.html`, add more color buttons inside `.color-options`:

```html
<button class="color-btn" data-color="#9b59b6" title="Purple" style="background:#9b59b6;"></button>
```

### Theming

Edit CSS variables in `css/styles.css`:

```css
:root {
  --color-primary: #2a9d8f;   /* Main accent color */
  --color-bg: #f5f0eb;        /* Background */
  /* ... etc */
}
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Camera permission denied | Ensure HTTPS. On iPad: Settings → Safari → Camera → Allow |
| WebGazer not loading | Check network connectivity; the script loads from CDN |
| Drawing feels laggy | Close other tabs; ensure hardware acceleration is on |
| Downloads blocked | Safari may block multiple rapid downloads; click "Allow" in the popup |
| Gaze tracking inaccurate | Ensure good lighting, stable head position, re-calibrate |

---

## Dependencies

- **[WebGazer.js](https://webgazer.cs.brown.edu/)** — Webcam eye tracking (loaded via CDN)
- No other external dependencies. Pure vanilla JavaScript.

## License

MIT — use freely for research.
