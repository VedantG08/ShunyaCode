# Sensei — Presentation Content (6 Slides)

Use this content to build your PowerPoint. Each section below is one slide.

---

## Slide 1: Title & Introduction

**Title:** Sensei — AI-Powered Online Meeting Platform

**Subtitle:** Video conferencing with real-time engagement analytics

**Bullet points:**
- **Sensei** is an online meeting platform that combines video calls with **AI-driven engagement insights**.
- Designed for educators and hosts who want to see how participants are engaging (attention, focus, confusion) in real time.
- No account required; create a room, share the link, and start a call with optional password, waiting room, and scheduled start.

**Optional one-liner:**  
*"Video calls with screen share, chat, and AI-powered engagement insights — all in the browser."*

---

## Slide 2: Problem & Objective

**Title:** Why Sensei?

**Problem:**
- In online meetings, hosts cannot easily tell if participants are engaged, confused, or distracted.
- Lack of real-time feedback makes it hard to adjust pace, take breaks, or run interactive activities.

**Objective:**
- Provide **real-time analytics** to the host: engagement score, concentration, confusion, eye focus, distraction, and emotion-style metrics.
- Keep **privacy-first**: face analysis runs in the participant’s browser; only aggregated metrics are sent to the server and shown to the host.
- Support **interactive activities**: host can launch polls, quizzes, and break timers that all participants see and respond to in the same call.

**Takeaway:** Sensei turns a standard video call into a **data-informed** meeting experience without leaving the browser.

---

## Slide 3: Key Features

**Title:** What Sensei Offers

**Meeting basics:**
- Create or join by room ID or invite link; optional password and waiting room.
- Video and audio (mute, camera on/off), screen sharing, in-meeting chat.
- Host controls: mute all, mute/kick participant, end call for everyone.
- Raise hand, reactions (e.g. thumbs up, clap), pin/spotlight for video layout.

**AI analytics (host-only, mesh mode):**
- **Average class score** — single metric from engagement, concentration, confusion, focus, distraction.
- **Real-time emotion/engagement chart** — all 9 metrics over time (latest 2 minutes visible, scroll for older).
- **Engagement heatmap** — per-participant engagement over time.
- **Engagement drop alerts** — host is notified when attention drops, with suggestions (e.g. launch poll, quiz, break).

**Interactive activities (host starts, everyone sees):**
- **Poll** — single or multiple choice; participants vote; host can end poll.
- **Quiz** — timed quiz with correct answers; participants submit; results shown when time ends or host ends quiz.
- **Break** — countdown timer for everyone; optional sound when break ends.

**Export:**
- CSV (raw data), PDF (analytics report with insights and recommendations), dashboard image (summary chart).

**Themes:**
- Light, Dark, Auto, plus Red Pill, Cyberpunk, Midnight, Matrix.

---

## Slide 4: Tech Stack

**Title:** Technology Used

**Client (frontend):**
- **React 18** + **Vite 5** — UI and fast build/dev.
- **React Router 6** — routes (/ and /meeting/:roomId).
- **Socket.io-client** — real-time signaling, chat, presence, intel, poll/quiz/break.
- **WebRTC** — camera, mic, and P2P video/audio in mesh mode.
- **MediaPipe Face Landmarker** — face mesh + iris in the browser for engagement, gaze, emotion-style metrics.
- **Recharts** — line charts for the analytics dashboard.
- **jsPDF + jspdf-autotable + html2canvas** — PDF report and dashboard image export.
- **LiveKit client + components** (optional) — SFU mode for larger meetings.

**Server (backend):**
- **Node.js** + **Express** — HTTP API (/health, POST /livekit/token) and static client in production.
- **Socket.io** — rooms, signaling for WebRTC, chat, host controls, intel aggregation, poll/quiz/break broadcast.
- **LiveKit Server SDK** (optional) — issue tokens for SFU mode.
- **dotenv** — config (PORT, LIVEKIT_*); **cors** — CORS for browser.

**Why this stack:**  
Single language (JavaScript), same origin for client and Socket.io, no extra media server in mesh mode, and AI runs on-device for privacy.

---

## Slide 5: Architecture

**Title:** How It Works

**High-level flow:**
1. **Client (browser):** React app loads; user creates or joins a room; Socket.io connects to the server.
2. **Server:** Manages rooms (members, pending, options); relays signaling (offer/answer/ICE) for WebRTC; aggregates intel; broadcasts poll/quiz/break.
3. **Media:** In **mesh mode**, peers send media via WebRTC (P2P). In **SFU mode**, client uses LiveKit for media.
4. **Intel:** Each participant runs MediaPipe on their video in the browser and sends throttled metrics to the server; server forwards aggregated data only to the **host** (room creator).

**Data flow (short):**
- **Room join / leave / signaling** → Socket.io (client ↔ server ↔ client).
- **Chat, mute, kick, raise hand, reactions** → Socket.io to room.
- **Intel metrics** → client → server → host only (intel-dashboard).
- **Poll / quiz / break** → host emits → server broadcasts to room → all clients show overlay.

**Deployment:**  
One server process: build the React app, run Node with `NODE_ENV=production`; server serves the built client and Socket.io on the same port (same origin). Deploy to Railway, Render, or any Node host with HTTPS.

---

## Slide 6: Demo, Deployment & Conclusion

**Title:** Try It & Deploy

**Run locally:**
1. From project root: `npm run install:all` → `npm run build` → `npm run start`.
2. Open the URL (e.g. http://localhost:3001). Create a room, share the link, join from another device/browser to test video, chat, and analytics.

**Host on the internet:**
- Push the repo to **GitHub**.
- Use **Railway** or **Render**: connect repo, set **Build** to `npm run install:all && npm run build`, **Start** to `NODE_ENV=production node server/index.js`, then use the generated HTTPS URL.
- Share that URL so others can join without an account.

**Conclusion:**
- **Sensei** = video meetings + **real-time engagement analytics** + **polls, quizzes, breaks** in one platform.
- **Privacy:** face analysis in the browser; only aggregated metrics to the host.
- **Stack:** React, Vite, Socket.io, WebRTC, MediaPipe, Node.js, Express — ready to extend (e.g. more themes, more activities, SFU for large meetings).

**Closing line (optional):**  
*"Sensei — meet smarter, not harder."*

---

## Quick reference for slide titles

| Slide | Title |
|-------|--------|
| 1 | Sensei — AI-Powered Online Meeting Platform |
| 2 | Why Sensei? (Problem & Objective) |
| 3 | Key Features |
| 4 | Tech Stack |
| 5 | Architecture |
| 6 | Demo, Deployment & Conclusion |
