# Sensei — Deployment Guide

## How to host Sensei on the internet (so others can use it)

You need to run the app on a server that has a public URL and HTTPS. Two simple options:

---

### Option 1: Railway (quick, free tier)

1. **Push your code to GitHub** (if not already).
2. Go to [railway.app](https://railway.app) and sign in (e.g. with GitHub).
3. **New Project** → **Deploy from GitHub repo** → choose your Sensei repo.
4. **Settings** for the new service:
   - **Root directory:** leave default (repo root).
   - **Build command:**  
     `npm run install:all && npm run build`
   - **Start command:**  
     `NODE_ENV=production node server/index.js`
   - **Environment:** Add variable `NODE_ENV` = `production` (Railway usually sets `PORT` for you).
5. Click **Deploy**. When it’s done, open **Settings** → **Networking** → **Generate domain**. You’ll get a URL like `https://your-app.up.railway.app`.
6. **Share that URL** with others. They open it in the browser, enter their name, create or join a room, and can video-call (camera/mic work because the site is HTTPS).

---

### Option 2: Render (free tier)

1. **Push your code to GitHub** (if not already).
2. Go to [render.com](https://render.com) and sign in (e.g. with GitHub).
3. **New** → **Web Service** → connect your Sensei repo.
4. **Configure:**
   - **Environment:** Node.
   - **Build command:**  
     `npm run install:all && npm run build`
   - **Start command:**  
     `NODE_ENV=production node server/index.js`
   - **Instance type:** Free (or paid if you need more).
5. Click **Create Web Service**. Render will build and run the app and give you a URL like `https://your-app.onrender.com`.
6. **Share that URL** with others so they can use Sensei in the browser.

**Note:** On Render’s free tier the app may sleep after inactivity; the first open after that can be slow until it wakes up.

---

### What you get

- A **public HTTPS URL** (e.g. `https://sensei-xyz.up.railway.app`).
- Anyone with the link can open it, create a room or join with a room ID/link, and use video/audio (no account needed).
- Invite links from inside Sensei (e.g. “Copy invite link”) use this URL, so others can join the same room.

For more options (VPS, Docker, SFU/LiveKit), see the sections below.

---

## Overview

- **Client:** React (Vite) SPA; connects to the server via Socket.io at **same origin** (`window.location.origin`).
- **Server:** Node.js (Express + Socket.io); serves API, Socket.io, and in production the built client.
- **Production layout:** One process serves both. Build the client, then run the server; it serves static files from `client/dist` so the app and Socket.io share one URL (required for simple deployment).

---

## 1. Build and run (single host)

From the **project root**:

```bash
# Install dependencies (once)
npm run install:all

# Build the client
npm run build

# Run the server (serves API + client; use PORT from env or 3001)
npm run start
```

Or with a custom port:

```bash
PORT=8080 npm run start
```

Then open `http://localhost:3001` (or the port you set). The client is served from the same host, so Socket.io and `/livekit/token` work without CORS or extra config.

---

## 2. Environment variables

| Variable | Where | Description |
|----------|--------|-------------|
| `PORT` | Server | HTTP + Socket.io port. Default `3001`. |
| `NODE_ENV` | Server | Set to `production` when deploying. Enables serving `client/dist`. |
| `LIVEKIT_URL` | Server | Only for SFU mode. LiveKit server URL (e.g. `wss://your-livekit.example.com`). |
| `LIVEKIT_API_KEY` | Server | Only for SFU mode. |
| `LIVEKIT_API_SECRET` | Server | Only for SFU mode. |

Example `.env` in `server/`:

```env
PORT=3001
NODE_ENV=production
# Optional for SFU (large meeting) mode:
# LIVEKIT_URL=wss://your-livekit.example.com
# LIVEKIT_API_KEY=your-key
# LIVEKIT_API_SECRET=your-secret
```

---

## 3. HTTPS and browser requirements

- **getUserMedia** (camera/mic) requires a **secure context**: HTTPS or `localhost`.
- Deploy behind HTTPS (e.g. reverse proxy with TLS or a platform that provides it).

---

## 4. Deploy to a platform

Run the **same** app (server that serves the client) on your chosen host.

### Option A: Railway / Render / Fly.io (recommended)

1. **Root:** Use the **repository root** as the app root (so `server/` and `client/` are both present).

2. **Build:** In the platform’s build step, install and build the client, then the server has access to `client/dist`:
   ```bash
   npm run install:all
   npm run build
   ```

3. **Start:** Start the server from the **project root** so `server/index.js` can resolve `../client/dist`:
   ```bash
   NODE_ENV=production node server/index.js
   ```
   Or set **Start Command** to:
   ```bash
   npm run start
   ```
   (Ensure `NODE_ENV=production` is set in the platform’s environment.)

4. **Env:** Set `PORT` if the platform injects it (e.g. Railway/Render set `PORT` automatically). Add `LIVEKIT_*` only if you use SFU.

5. **HTTPS:** Use the platform’s default domain (or your own) so the app is served over HTTPS.

### Option B: VPS (e.g. Ubuntu, DigitalOcean)

1. Clone the repo and install:
   ```bash
   npm run install:all
   npm run build
   ```

2. Run with a process manager (e.g. PM2) from the **project root**:
   ```bash
   NODE_ENV=production PORT=3001 node server/index.js
   ```
   Or with PM2:
   ```bash
   pm2 start server/index.js --name sensei --node-args="NODE_ENV=production" -i 1
   ```

3. Put Nginx (or Caddy) in front: terminate TLS, proxy `/` and `/socket.io` (and `/livekit` if you use it) to `http://127.0.0.1:3001`.

### Option C: Docker

Example Dockerfile (build and run from repo root):

```dockerfile
FROM node:20-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./server/
RUN npm ci --prefix server
COPY server/ ./server/
COPY --from=client /app/client/dist ./client/dist/
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "server/index.js"]
```

Build and run:

```bash
docker build -t sensei .
docker run -p 3001:3001 -e PORT=3001 sensei
```

Use HTTPS in front (reverse proxy or host’s TLS).

---

## 5. SFU (LiveKit) mode in production

If you want “Large meeting mode (SFU via LiveKit)”:

1. Deploy or use a LiveKit server (e.g. [LiveKit Cloud](https://livekit.io) or self-hosted).
2. Set on the **Sensei server** (same env as above):
   - `LIVEKIT_URL` (e.g. `wss://your-livekit.example.com`)
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
3. Ensure the client can reach the LiveKit URL (same-origin or CORS if needed; the client uses the token from your server and then talks to LiveKit).

---

## 6. Checklist

- [ ] Dependencies installed (`npm run install:all`)
- [ ] Client built (`npm run build`) and `client/dist` present
- [ ] Server started from **project root** with `NODE_ENV=production`
- [ ] `PORT` set if the host expects it
- [ ] App served over **HTTPS** (or `localhost` for testing)
- [ ] Optional: `LIVEKIT_*` set if using SFU mode

---

## 7. Split deployment (client and server on different origins)

If you host the client on a static host (e.g. Vercel/Netlify) and the server elsewhere:

1. **Server:** Deploy only the server (do not serve `client/dist`). Set CORS so the client’s origin is allowed (Socket.io and Express already use `cors({ origin: true })`; tighten in production).
2. **Client:** Add a build-time env for the server URL, e.g. `VITE_SIGNAL_URL`, and in `useMeeting.js` connect with `io(import.meta.env.VITE_SIGNAL_URL || window.location.origin, { path: '/socket.io', ... })`.
3. **LiveKit:** If using SFU, `/livekit/token` must be reachable from the client (same as the server URL or a separate API).

This is more work; for most cases, single-origin deployment (server serves the client) is simpler.
