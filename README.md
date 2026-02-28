# Sensei — Online meeting platform

Video conferencing with core features: create/join by room ID or link, video/audio, mute and camera toggle, screen sharing, in-meeting chat, participants list, and leave.

## Stack

- **Client:** React 18, Vite, Socket.io-client, WebRTC (getUserMedia, RTCPeerConnection)
- **Server:** Node.js, Express, Socket.io (signaling and room state)

## Run locally

1. Install and start the server (signaling + rooms):

```bash
cd server
npm install
npm run dev
```

Server runs at `http://localhost:3001`.

2. Install and start the client:

```bash
cd client
npm install
npm run dev
```

Client runs at `http://localhost:3000`. Vite proxies `/socket.io` to the server.

3. Open `http://localhost:3000`, enter your name, create a meeting or join with an ID/link. Share the invite link with others to join the same room.

## Push to GitHub

1. **Create a new repo** on [github.com](https://github.com) (New repository). Do not add a README or .gitignore if the project already has files.

2. **From the project folder** (e.g. `MARK_2`), in a terminal:

```bash
git init
git add .
git commit -m "Initial commit: Sensei meeting platform"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

Replace `YOUR_USERNAME` and `YOUR_REPO_NAME` with your GitHub username and repo name. If the repo already had a `git init` and you only need to push to a new remote:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

A `.gitignore` is included so `node_modules/`, `.env`, and `client/dist/` are not pushed.

## Features

- Create meeting (generates room ID) or join with ID/link
- **Meeting options (create):** optional password, scheduled start time, room expiry when empty (15 min / 30 min / 1 hr / 2 hr / when everyone leaves), waiting room
- **Waiting room:** host can enable; joiners see "Waiting for host to admit you"; host sees "X waiting" and can Admit or Reject
- **Password/PIN:** set when creating; joiners must enter password (or include in link) to join
- **Scheduled meetings:** set start time when creating; joiners see "Meeting has not started yet" and scheduled time until then
- **Room expiry:** when the last person leaves, room is removed after the chosen delay (or immediately if "when everyone leaves")
- Copy invite link from the meeting header
- Video and audio with mute and camera on/off
- Screen sharing (replace video with display capture)
- **Host controls:** Mute all, Mute someone (per participant in list), Kick participant, End meeting for all (everyone sees "The host ended the meeting")
- **Raise hand:** button in controls; hand icon on tile and in participants list
- **Reactions:** thumbs up and clap; short-lived overlay on screen (~4 s)
- **Pin / spotlight:** on a video tile, Pin (or Spotlight if host) to feature that participant; host spotlight is room-wide, others pin locally
- **Layouts:** Grid (all equal), Speaker (one large + strip), Sidebar (one large + sidebar list)
- In-meeting chat
- Participants list (with Mute/Remove for host, hand indicator)
- Leave meeting
- **SFU (LiveKit) large meeting mode:** optional mode for larger rooms (server issues LiveKit tokens; media is routed via LiveKit SFU)

## Environment

- `PORT` (server): default `3001`
- Client expects the server at the same origin (use Vite proxy in dev).

## Host on the internet (so others can use it)

Push the repo to **GitHub**, then use **Railway** or **Render** to deploy:

- **[Railway](https://railway.app):** New Project → Deploy from GitHub → set **Build** to `npm run install:all && npm run build`, **Start** to `NODE_ENV=production node server/index.js` → Generate domain. Share the URL (HTTPS).
- **[Render](https://render.com):** New Web Service → connect repo → same Build/Start commands → Create. Share the URL.

Full step-by-step and other options (VPS, Docker): **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## SFU (LiveKit) mode (optional)

This repo supports an SFU-based room for larger meetings using LiveKit.

1. Start LiveKit (Docker):

```bash
cd infra/livekit
docker compose up -d
```

2. Configure the app server (copy `server/.env.example` to `server/.env` and keep the defaults for local):

```env
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret
```

3. Start server + client as usual.

4. Create a meeting with **Meeting options → Large meeting mode (SFU via LiveKit)**.
