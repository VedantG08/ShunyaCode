# Sensei — Tech Stack Reference

Every technology used in this project, what it does, and why it is used.

---

## Runtime & language

| Tech | Where | What it does | Why |
|------|--------|----------------|-----|
| **Node.js** | Server | JavaScript runtime that runs the backend outside the browser. | Runs the Express + Socket.io server; same language (JavaScript) as the client for consistency. |
| **JavaScript (ES modules)** | Client + Server | Language for app logic. Project uses `"type": "module"` for `import`/`export`. | Single language across stack; ESM for modern, tree-shakeable modules. |
| **JSX** | Client | Syntax extension that looks like HTML inside JavaScript; compiles to `React.createElement` calls. | Lets you write React UI in a readable, component-based way. |

---

## Client (frontend)

### Core UI

| Tech | What it does | Why |
|------|----------------|-----|
| **React 18** | Library for building UIs as components with state and lifecycle. Renders the DOM and updates it when state changes. | Industry standard for SPAs; component reuse, hooks, and a large ecosystem. |
| **react-dom** | Package that renders React components into the real DOM and handles events. | Required by React for web; ties React tree to the browser DOM. |
| **React Router (react-router-dom) v6** | Client-side routing: maps URLs (e.g. `/`, `/meeting/:roomId`) to components without full page reloads. | Single-page app navigation; shareable meeting URLs and back/forward support. |

### Build & dev

| Tech | What it does | Why |
|------|----------------|-----|
| **Vite 5** | Build tool and dev server: fast HMR, bundles the app with Rollup for production, serves the client in dev. | Very fast dev feedback; simple config; native ESM and optimized production builds. |
| **@vitejs/plugin-react** | Vite plugin that compiles JSX and enables React Fast Refresh (HMR for React). | So Vite can understand and compile JSX and preserve React state on hot reload. |

### Real-time & networking

| Tech | What it does | Why |
|------|----------------|-----|
| **socket.io-client** | Client library for the Socket.io protocol: persistent connection to the server, emit/listen events (e.g. `join-room`, `room-joined`, `offer`, `answer`). | Signaling for WebRTC (room join, SDP/ICE), chat, presence, and intel metrics; reconnection and fallbacks built in. |
| **WebRTC (browser APIs)** | Browser APIs: `getUserMedia` (camera/mic), `RTCPeerConnection` (P2P audio/video). No separate package; used via the browser. | Actual peer-to-peer media in mesh mode; low latency and no media server for small groups. |

### Media & AI / intel

| Tech | What it does | Why |
|------|----------------|-----|
| **@mediapipe/tasks-vision** | Google’s ML library in the browser: Face Landmarker (face mesh + iris). Runs inference on video frames. | Powers the “intel” pipeline: face detection, landmarks, blendshapes for engagement, gaze, and emotion-style metrics. |
| **LiveKit client (livekit-client)** | SDK to connect to a LiveKit server as a participant: publish/subscribe to tracks, handle reconnection. | Used only in SFU mode for larger meetings when media is routed through LiveKit instead of P2P. |
| **@livekit/components-react** | Prebuilt React components for LiveKit (e.g. video conference layout, controls). | Speeds up the SFU UI so we don’t build the entire call UI from scratch. |
| **@livekit/components-styles** | Default CSS for LiveKit React components. | Consistent look for the SFU meeting view. |

### Charts & data viz

| Tech | What it does | Why |
|------|----------------|-----|
| **Recharts** | React chart library: line charts, axes, tooltips, legends from declarative components. | Used for the real-time emotion/engagement line chart and other analytics visuals in the intel dashboard. |

### Export (reports & images)

| Tech | What it does | Why |
|------|----------------|-----|
| **jsPDF** | Generates PDFs in the browser: pages, text, positioning. | Builds the Sensei analytics PDF report (summary, tables, recommendations). |
| **jspdf-autotable** | Plugin for jsPDF that draws tables (headers, rows, styling). | Tables in the PDF report (e.g. participant metrics, heatmap summary). |
| **html2canvas** | Renders a DOM node (or full page) into a canvas and can export as image. | Captures the dashboard or a summary view as PNG for the “dashboard image” export. |

### Fonts (loaded in HTML)

| Tech | What it does | Why |
|------|----------------|-----|
| **Google Fonts (DM Sans, Orbitron, Space Mono, IBM Plex Mono)** | Web fonts loaded from Google’s CDN; applied via CSS `font-family`. | Typography for the app and themes (e.g. Matrix theme uses Orbitron/Space Mono/IBM Plex Mono). |

---

## Server (backend)

### HTTP & API

| Tech | What it does | Why |
|------|----------------|-----|
| **Express** | Minimal web framework: routes, middleware, JSON body parsing. | Serves `/health`, `POST /livekit/token`, and mounts the Socket.io server on the same HTTP server. |
| **cors** | Middleware that sets CORS headers (e.g. `Access-Control-Allow-Origin`) on responses. | Allows the browser to call the server from another origin if needed; currently used with permissive origin for flexibility. |
| **dotenv** | Loads `.env` from disk into `process.env` (e.g. `PORT`, `LIVEKIT_*`). | Keeps secrets and config out of code; different envs (dev/prod) without code changes. |

### Real-time

| Tech | What it does | Why |
|------|----------------|-----|
| **Socket.io (server)** | Server-side Socket.io: attaches to the HTTP server, handles WebSocket (and polling fallback), rooms, broadcast/emit to clients. | Same protocol as socket.io-client; implements room join/leave, signaling (offer/answer/ICE), chat, mute/kick, intel aggregation, etc. |

### External services (optional)

| Tech | What it does | Why |
|------|----------------|-----|
| **livekit-server-sdk** | Server SDK to create LiveKit access tokens (JWT) for a room and identity. | When SFU mode is used, the server issues a token so the client can connect to the LiveKit server; no token logic in the client. |

---

## Root / tooling

| Tech | What it does | Why |
|------|----------------|-----|
| **npm** | Package manager and script runner: `npm install`, `npm run build`, `npm run start`. | Installs dependencies and runs scripts defined in `package.json` (client, server, root). |
| **Root package.json scripts** | `install:all`, `build`, `start`, `server`, `client` orchestrate the monorepo. | Single entry point: install both apps, build client, run production server from repo root. |

---

## Browser / platform APIs (no npm package)

| Tech | What it does | Why |
|------|----------------|-----|
| **getUserMedia** | Returns a `MediaStream` from camera and/or microphone. | Source of local video/audio for the call and for the intel pipeline (face detection on video frames). |
| **RTCPeerConnection** | Establishes P2P connection: exchange SDP (offer/answer) and ICE candidates, then stream audio/video. | Mesh mode: direct peer-to-peer media between participants; signaling is done via Socket.io. |
| **Canvas / 2D context** | Used under the hood by MediaPipe and html2canvas to process or capture pixels. | Image data for face detection and for exporting the dashboard as an image. |
| **Clipboard API** | `navigator.clipboard.writeText()` to copy the invite link. | One-click copy of the meeting URL to share. |

---

## Summary by role

| Role | Technologies |
|------|----------------|
| **UI framework** | React, react-dom, React Router |
| **Build & dev** | Vite, @vitejs/plugin-react |
| **Real-time** | Socket.io (client + server) |
| **Media (mesh)** | WebRTC (getUserMedia, RTCPeerConnection) |
| **Media (SFU)** | LiveKit client, LiveKit components, livekit-server-sdk |
| **Intel / analytics** | @mediapipe/tasks-vision (Face Landmarker) |
| **Charts** | Recharts |
| **Export** | jsPDF, jspdf-autotable, html2canvas |
| **Server** | Node.js, Express, cors, dotenv, Socket.io |
| **Fonts** | Google Fonts (DM Sans, Orbitron, Space Mono, IBM Plex Mono) |
