# How Values Are Detected and Update Rates

## 1. Where detection runs

All metrics are computed **on the client** (each participant’s browser) using:

- **MediaPipe Face Landmarker** (`@mediapipe/tasks-vision`)
- **Input:** Local camera stream (off-screen `<video>` element)
- **Output:** Face landmarks (478 3D points) + face blendshapes (ARKit-style coefficients)

No video or frames are sent to the server; only the derived metrics are.

---

## 2. Frame and send rates (client)

| What | Value | Meaning |
|------|--------|--------|
| **Detection** | **Every frame (max throughput)** | The loop is driven by `requestAnimationFrame`; as soon as one `detectFace()` finishes, the next runs. Pipeline processes as many frames per second as the model can handle (~15–30+ on typical devices). No fixed interval. |
| **MediaPipe timestamp** | **Real elapsed time** | Because each detection is async, the real rate is “as fast as 200 ms allows” (often ~5 Hz), not tied to display FPS. |
| **Send interval** | **100 ms** | Throttle for sending: `intel-metrics` is emitted at most once every 100 ms. Server (and dashboard) get **at most 10 updates per second** per participant. |

So: **detection** runs at **maximum frame rate** (every frame the model can process); **values are sent** to the server at most every **100 ms** (10×/s).

---

## 3. Server-side update and history

| What | Value | Meaning |
|------|--------|--------|
| **`latest_emotion_data`** | Every `intel-metrics` | Overwritten on each received payload (up to ~10×/s per participant). |
| **History sample interval** | **1 second** | A new entry is appended to `emotion_history` only if at least 1 second has passed since the last append (`INTEL_HISTORY_SAMPLE_INTERVAL_MS = 1000`). |
| **History length** | **24 × 60 × 60** | Up to 24 hours of 1-second samples per participant. |

So the **dashboard “current” values** can change as often as the client sends (**up to ~10×/s**), while **history** is down-sampled to **1 sample per second**.

---

## 4. How each value is detected / derived

All of these are computed in **`client/src/intel/faceIntel.js`** from a single MediaPipe result (one detection run).

### 4.1 Raw inputs from MediaPipe

- **Face landmarks:** 478 3D points (normalized 0–1). Used for **focus** and (optionally) eye openness.
- **Face blendshapes:** ARKit-style blend shape scores (0–1). Category names include things like `mouthSmile`, `mouthFrown`, `browDown`, `eyeWide`, `noseSneer`, etc. Used for **emotions** and then for **engagement**, **concentration**, **confusion**.

### 4.2 Emotion intensities (happiness, sadness, surprise, neutral, anger, disgust, fear)

- **Source:** `blendshapesToEmotions(faceBlendshapes)` maps blend shape names to the 7 emotions.
- **Mapping examples:**  
  `mouthSmile` → happiness, `mouthFrown` → sadness, `browDown` → anger, `eyeWide` → surprise, `noseSneer` → disgust, etc. Scores are normalized to sum to 100 across the 7 emotions; if no matches, neutral = 100.
- **Output:** Percentages (0–100) for anger, disgust, fear, happiness, sadness, surprise, neutral. These are the **“values”** you see in the Real-Time Emotion Analysis and in the class score’s emotion component.

### 4.3 Engagement

- **Source:** Emotion intensities only (no landmarks).
- **Formula:** Weighted sum of normalized emotion proportions:  
  happiness×3.5 + surprise×3.0 + anger×2.0 + fear×1.5 − neutral×0.5 − sadness×1.0 − disgust×1.5, then scaled from a base of 60 to 0–100.
- **Meaning:** Higher when expressions suggest involvement (e.g. smile, surprise); lower for flat/neutral or negative.

### 4.4 Concentration

- **Source:** Emotion intensities only.
- **Formula:** Favors neutral and low arousal (neutral×3.0 + sadness×0.5 − happiness×0.8 − anger×1.5 − fear×2.0 − surprise×2.5), with a variability term (more diverse emotions reduce concentration), then scaled from base 50 to 0–100.
- **Meaning:** Higher when the face is calm/focused; lower when very expressive or varied.

### 4.5 Confusion

- **Source:** Emotion intensities only.
- **Formula:** Favors fear, surprise, disgust, anger, sadness; penalizes neutral and happiness; includes a “diversity” factor (more emotions above threshold increases confusion), then scaled from base 30 to 0–100.
- **Meaning:** Higher when the mix of expressions suggests uncertainty or negative affect.

### 4.6 Eye focus (focus) and 4.7 Distraction (iris-based gaze)

- **Source:** Face landmarks only (eye contour + iris indices). Uses the same geometry as MediaPipe Face Mesh with iris: no separate gaze model.
- **Method (when iris landmarks are available, 478-point model):**
  1. **Eye centers:** Mean of left/right eye contour landmarks (left: 362, 382, …; right: 33, 7, 163, …).
  2. **Iris centers:** Mean of 4 points per iris (left: 474–477, right: 469–472).
  3. **Displacement:** `left_vector = left_iris_center − left_eye_center`, same for right.
  4. **Normalize by eye size:** Eye size = (max − min)_x + (max − min)_y over contour; divide each vector by its eye size so result is scale-invariant.
  5. **Gaze vector:** `(left_normalized + right_normalized) / 2`; **gaze magnitude** = ‖gaze_vector‖.
  6. **Temporal smoothing:** Keep last 15 magnitude values; use their mean.
  7. **Map to distraction:** `normalized = min(1, avg_magnitude / 0.4)`. Piecewise: &lt; 0.3 → distraction 0–10%; 0.3–0.7 → 30–70%; &gt; 0.7 → 70–100%. Then **focus = 100 − distraction**, both clamped to [0, 100].
- **Fallback:** If iris landmarks are missing (e.g. model &lt; 478 points), use nose-tip position vs frame center (same as previous heuristic).
- **Meaning:** Focus = looking at camera/screen; distraction = looking away. Iris displacement reflects “how much” the eyes are off straight ahead.

### 4.8 Dominant emotion

- **Source:** The 7 emotion intensities.
- **Method:** `dominant_emotion` = the emotion with the highest intensity. If no face is detected, it is `'none'`.

### 4.9 When no face is detected

- If MediaPipe returns no face (`!result?.faceLandmarks?.length`), the client sends a single “no face” payload:  
  engagement, concentration, confusion, focus, distraction = 0; anger, disgust, fear, happiness, sadness, surprise = 0; neutral = 100; dominant_emotion = `'none'`.

---

## 5. Summary table

| Metric | Source (MediaPipe) | Update rate (client) | Sent to server | History (server) |
|--------|--------------------|----------------------|----------------|-------------------|
| All metrics | One detection run per tick | Max frame rate (~15–30/s typical) | Throttled: up to 10/s (every 100 ms) | 1 sample/s |
| Engagement, concentration, confusion | Blendshapes → emotions → formulas | Same | Same | Same |
| Focus, distraction | Landmarks (nose position) | Same | Same | Same |
| Happiness, sadness, surprise, neutral, etc. | Blendshapes → emotions | Same | Same | Same |

So: **all values are detected/tracked from the same pipeline**, at the **same frame and send rates**; the only difference is **which part of the MediaPipe result** (blendshapes vs landmarks) and **which formula** is used to derive each metric.
