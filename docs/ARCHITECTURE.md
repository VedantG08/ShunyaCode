# MARK_2 — Full System Architecture

## 1. High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (Browser)                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐  │
│  │   React     │  │   Socket.io  │  │  WebRTC /       │  │  MediaPipe        │  │
│  │   App       │  │   Client     │  │  LiveKit Client │  │  Face Landmarker  │  │
│  │ (Vite SPA)  │  │ (signaling)  │  │ (media)         │  │ (intel pipeline)  │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬────────┘  └────────┬─────────┘  │
│         │                │                    │                     │            │
│         └────────────────┼────────────────────┼─────────────────────┘            │
│                          │                    │                                   │
└──────────────────────────┼────────────────────┼───────────────────────────────────┘
                           │                    │
                    HTTP/WS │                    │ (mesh: offer/answer/ICE
                    :3001   │                    │  via Socket.io; SFU: LiveKit)
                           ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         SERVER (Node.js)                                          │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────────┐  │
│  │ Express + HTTP      │  │ Socket.io            │  │ LiveKit Server SDK      │  │
│  │ /health             │  │ Rooms, signaling,   │  │ (token generation for   │  │
│  │ /livekit/token      │  │ intel aggregation   │  │  SFU mode only)         │  │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ (SFU mode only)
                                    ▼
                    ┌───────────────────────────────┐
                    │ LiveKit Server (optional)     │
                    │ ws://localhost:7880           │
                    └───────────────────────────────┘
```

- **Two meeting modes:** Mesh (P2P via server signaling) and SFU (LiveKit). Mode is chosen at create/join via `sfu=1` in the URL.
- **Intel (AI analytics)** runs only in mesh mode: client-side face detection, server aggregates and pushes to the host.

---

## 2. Tech Stack

| Layer        | Technology |
|-------------|------------|
| **Client**  | React 18, Vite 5, React Router 6, Socket.io-client, Recharts |
| **Media (mesh)** | WebRTC (getUserMedia, RTCPeerConnection), Google STUN |
| **Media (SFU)**  | LiveKit Client, LiveKit Components React |
| **Intel**   | @mediapipe/tasks-vision (Face Landmarker + iris), client-side only |
| **Export**  | jsPDF, jspdf-autotable, html2canvas |
| **Server**  | Node.js (ESM), Express, Socket.io, LiveKit Server SDK (tokens only) |
| **Optional**| LiveKit server (Docker) for SFU |

---

## 3. Repository Structure

```
MARK_2/
├── client/                    # React SPA
│   ├── index.html
│   ├── vite.config.js         # Dev proxy: /socket.io, /livekit → :3001
│   ├── package.json
│   └── src/
│       ├── main.jsx           # Entry: BrowserRouter, App
│       ├── App.jsx            # Routes: /, /meeting/:roomId
│       ├── index.css          # Global styles
│       ├── pages/
│       │   ├── Home.jsx       # Lobby: create/join, room options
│       │   └── Meeting.jsx    # Wrapper: media acquisition, Mesh vs SFU
│       ├── components/
│       │   ├── MeetingRoom.jsx      # Mesh UI: grid, controls, intel, theme
│       │   ├── MeetingRoomSFU.jsx   # LiveKit VideoConference
│       │   ├── VideoGrid.jsx        # Tiles, layout, pin/spotlight
│       │   ├── Controls.jsx         # Mute, video, chat, participants, leave
│       │   ├── Participants.jsx     # Sidebar list
│       │   ├── Chat.jsx             # In-meeting chat
│       │   ├── IntelPanel.jsx       # Host-only analytics dashboard
│       │   ├── LaunchPollModal.jsx
│       │   ├── StartQuizModal.jsx
│       │   ├── TakeBreakModal.jsx
│       │   └── IntelDashboard.jsx    # Legacy/alternate intel view
│       ├── hooks/
│       │   ├── useMeeting.js        # Socket.io room, WebRTC peers, state
│       │   ├── useIntelMetrics.js   # Face pipeline → intel-metrics
│       │   └── useIntelDashboard.js # Host: intel-dashboard → state
│       └── intel/
│           ├── faceIntel.js         # MediaPipe pipeline, metrics derivation
│           └── exportReport.js      # CSV, PDF, dashboard image export
├── server/
│   ├── index.js              # Express + Socket.io + LiveKit token API
│   ├── package.json
│   └── .env                  # PORT, LIVEKIT_*
├── docs/
│   └── ARCHITECTURE.md       # This document
└── package.json             # Root: install:all, server, client scripts
```

---

## 4. Client Architecture

### 4.1 Routing and Entry

- **`/`** → `Home`: name, create meeting (with options) or join by ID/link. Navigates to `/meeting/:roomId?name=...&create=1|...`.
- **`/meeting/:roomId`** → `Meeting`: reads `roomId` and query (name, create, sfu, password, scheduled, expiry, waiting). If `sfu=1`, renders `MeetingRoomSFU` (no local stream from Meeting); else acquires `getUserMedia`, then renders `MeetingRoom` with `localStream` and `localStreamRef`.

### 4.2 Meeting Modes

| Mode  | Component        | Media path                    | Intel |
|-------|------------------|-------------------------------|-------|
| Mesh  | MeetingRoom      | Socket.io signaling → WebRTC P2P | Yes (host-only dashboard) |
| SFU   | MeetingRoomSFU   | POST /livekit/token → LiveKit Room | No |

### 4.3 Mesh Mode: Core Data Flow

1. **Meeting** gets `getUserMedia` → passes `localStream` and `localStreamRef` to **MeetingRoom**.
2. **MeetingRoom** uses **useMeeting(roomId, userName, localStreamRef, roomOptions)**:
   - Connects Socket.io to `window.location.origin` (proxied to server).
   - Emits `join-room` with roomId, userName, payload (isCreator, roomOptions, password, etc.).
   - Receives `room-joined` (participants, isHost, myId) or error/waiting/password flows.
   - Exchanges WebRTC: on `participant-joined`, creates RTCPeerConnection, addTrack(localStream), offer → server → answer/ICE; ontrack → addRemoteStream(peerId, stream).
   - Subscribes to: chat, mute-all, kick, end-meeting, raise-hand, reactions, spotlight.
3. **MeetingRoom** renders **VideoGrid** (local + remote streams), **Controls**, **Participants**, **Chat**, and optionally **IntelPanel** (if host and mesh).

### 4.4 Intel (AI Analytics) Pipeline — Mesh Only

1. **useIntelMetrics({ enabled, localStreamRef, socketRef })**
   - Enabled when in call and mesh (no SFU).
   - Creates an off-screen `<video>` fed from `localStreamRef.current`, runs on `requestAnimationFrame`.
   - Each frame: **detectFace(video, timestamp)** (faceIntel.js) → **resultToEmotionData(result, iso)** → emit `intel-metrics` with `{ emotion_data }` (throttled, e.g. 100 ms).
   - All participants (including host) send metrics so the server can aggregate everyone.

2. **faceIntel.js**
   - Loads MediaPipe Face Landmarker (WASM + model from CDN), with iris refinement.
   - **detectFace(video, timestamp)** → FaceLandmarker.detectForVideo → landmarks + blendshapes.
   - Derives: emotions (blendshapes → happiness, sadness, etc.), engagement, concentration, confusion, eye focus, distraction (iris-based gaze), plus raw emotions. Output format: `emotion_data` array (one object per face) with timestamp and all metrics.

3. **Server** (see below) receives `intel-metrics`, stores per-socket in `room.intel`, samples history every 1 s, and emits **intel-dashboard** to the room creator only: `{ participants: [{ participant_id, name, current, history }] }`.

4. **useIntelDashboard(socketRef, isHost)**
   - Only when isHost: subscribes to `intel-dashboard`, sets state to `payload.participants`.
   - **MeetingRoom** passes this state as `intelParticipants` into **IntelPanel**.

5. **IntelPanel**
   - Computes class score (weighted formula over participants with valid face data), heatmap (per-participant engagement over time), aggregated history for charts.
   - Renders: score ring, metric bars, real-time emotion line chart (2-min window, full history in memory), engagement heatmap, engagement-drop alert, actions (Launch Poll, Quiz, Break), export (CSV, PDF, dashboard image).
   - Theme support: light, dark, auto, red-pill, cyberpunk, midnight, matrix (with terminology and visual variants).

### 4.5 Theme and UI State

- **MeetingRoom** holds: theme (localStorage), resolvedTheme (auto = system), analyticsVisible (show/hide IntelPanel), chatOpen, participantsOpen, layout, pinnedId, spotlightId, etc.
- Theme is applied via `data-theme={resolvedTheme}` on the room container and passed to IntelPanel and Participants/Controls for matrix-style labels (e.g. “Nodes”, “Simulation”, “Signal Integrity”).

---

## 5. Server Architecture

### 5.1 Process and Ports

- Single Node process (default port **3001**).
- HTTP server (Express) + Socket.io on the same server.

### 5.2 HTTP API

| Method | Path             | Purpose |
|--------|------------------|--------|
| GET    | /health          | Health check `{ ok: true }` |
| POST   | /livekit/token   | Body: room, identity, name → LiveKit JWT for SFU join |

### 5.3 Socket.io Events (Server-Side)

| Event (in)         | From | Action |
|--------------------|------|--------|
| join-room          | any  | Create or join room; validate password/schedule/waiting; emit room-joined or waiting-for-host / wrong-password / meeting-not-started etc. |
| admit              | host| Move peer from pending to members, join room, emit admitted + participant-joined |
| reject             | host| Remove from pending, emit rejected to peer |
| offer / answer / ice-candidate | any | Relay to target peer (WebRTC signaling) |
| chat-message       | any  | Broadcast to room |
| mute-all           | host| Broadcast mute-audio to room |
| mute-peer          | host| Emit mute-audio-request to target |
| kick               | host| Remove from members/pending, leave room, emit kicked / participant-left |
| end-meeting        | host| Emit meeting-ended to room, delete room |
| raise-hand         | any | Broadcast participant-hand-raised |
| reaction           | any | Broadcast reaction |
| spotlight          | host| Broadcast spotlight-changed(peerId) |
| intel-metrics      | any | Update room.intel[socket.id], sample history; emit intel-dashboard to room.creatorId only |

### 5.4 Room State (In-Memory)

- **rooms**: Map roomId → room object.
- **room**: creatorId, password, scheduledAt, expiryMinutes, waitingRoom, members Map(socketId → { userName }), pending Map (waiting room), expiryTimer, **intel** Map(socketId → { latest_emotion_data, emotion_history, last_history_sample_time }).
- On join (create or direct): initialize or update members, set socket.roomId, socket.userName, socket.isHost; initialize intel entry per participant.
- On disconnect: remove from members/pending/intel; if creator and no one left, schedule expiry or delete room; else emit participant-left.

### 5.5 Intel Aggregation

- **intel-metrics** payload: `{ emotion_data: array }`. Stored in `room.intel[socket.id].latest_emotion_data`; every 1 s a copy is appended to `emotion_history` (capped).
- Response: build `participants` from `room.intel` + `room.members` (participant_id, name, current, history), emit **intel-dashboard** to `room.creatorId` only.

---

## 6. Data Flows Summary

| Flow | Direction | Protocol |
|------|-----------|----------|
| Room join / leave / participants | Client ↔ Server | Socket.io |
| WebRTC signaling (mesh) | Client ↔ Server ↔ Client | Socket.io (offer, answer, ice-candidate) |
| Chat, mute, kick, end, raise-hand, reaction, spotlight | Client → Server → Room | Socket.io |
| Intel metrics (per participant) | Client → Server | Socket.io (intel-metrics) |
| Intel dashboard (aggregated) | Server → Host | Socket.io (intel-dashboard) |
| Media (mesh) | Client ↔ Client | WebRTC (RTP) |
| Media (SFU) | Client ↔ LiveKit | LiveKit (via token from server) |
| LiveKit token | Client → Server | HTTP POST /livekit/token |

---

## 7. External Services

| Service | Role |
|--------|------|
| **Google STUN** | stun.l.google.com:19302 (mesh mode ICE) |
| **MediaPipe CDN** | WASM + model for Face Landmarker (client) |
| **LiveKit Server** | Optional; SFU media when `sfu=1`. Server only issues tokens; client talks to LiveKit for media. |

---

## 8. Run and Deployment

- **Dev:** From repo root: `npm run server` (server :3001), `npm run client` (Vite :3000, proxy to :3001). Open http://localhost:3000.
- **Production:** Build client (`npm run build` in client), serve static from Express or a separate static host; server must be reachable for Socket.io and optionally for `/livekit/token`. Env: PORT, LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET for SFU.

---

## 9. Key Files Quick Reference

| Concern | Primary file(s) |
|--------|------------------|
| Room creation/join, room options | Home.jsx, Meeting.jsx |
| Mesh meeting logic, WebRTC, signaling | useMeeting.js, server index.js |
| SFU meeting | MeetingRoomSFU.jsx, server /livekit/token |
| Face detection and metrics | faceIntel.js, useIntelMetrics.js |
| Host dashboard and aggregation | useIntelDashboard.js, IntelPanel.jsx, server intel-metrics/intel-dashboard |
| Export (CSV, PDF, image) | exportReport.js |
| Themes and matrix terminology | MeetingRoom.jsx, IntelPanel.jsx, Participants.jsx, Controls.jsx |
