import { useState, useCallback, useEffect } from 'react';
import { useMeeting } from '../hooks/useMeeting';
import { useIntelMetrics } from '../hooks/useIntelMetrics';
import { useIntelDashboard } from '../hooks/useIntelDashboard';
import VideoGrid from './VideoGrid';
import Controls from './Controls';
import Chat from './Chat';
import Participants from './Participants';
import IntelPanel from './IntelPanel';
import { PollView, QuizView, BreakView } from './SenseiActivityOverlays';

function JoinStateView({ status, error, notStartedAt, joinWithPassword, onLeave }) {
  const [password, setPassword] = useState('');

  if (status === 'connecting') {
    return (
      <div className="state-view">
        <p>Connecting…</p>
      </div>
    );
  }

  if (status === 'waiting') {
    return (
      <div className="state-view">
        <p>Waiting for the host to admit you.</p>
        <button type="button" className="state-btn secondary" onClick={onLeave}>Leave</button>
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className="state-view">
        <p>You were not admitted to this Sensei call.</p>
        <button type="button" className="state-btn primary" onClick={onLeave}>Back to home</button>
      </div>
    );
  }

  if (status === 'not-started') {
    const at = notStartedAt ? new Date(notStartedAt).toLocaleString() : '';
    return (
      <div className="state-view">
        <p>This Sensei call has not started yet.</p>
        <p className="state-muted">Scheduled: {at}</p>
        <button type="button" className="state-btn secondary" onClick={onLeave}>Leave</button>
      </div>
    );
  }

  if (status === 'password-required') {
    return (
      <div className="state-view">
        <p>This room requires a password.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            joinWithPassword(password);
          }}
          className="state-form"
        >
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="state-input"
            autoComplete="current-password"
          />
          <button type="submit" className="state-btn primary">Join</button>
        </form>
        <button type="button" className="state-btn secondary" onClick={onLeave}>Cancel</button>
      </div>
    );
  }

  if (status === 'kicked') {
    return (
      <div className="state-view">
        <p>You were removed from the Sensei call.</p>
        <button type="button" className="state-btn primary" onClick={onLeave}>Back to home</button>
      </div>
    );
  }

  if (status === 'ended') {
    return (
      <div className="state-view">
        <p>The host ended the Sensei call.</p>
        <button type="button" className="state-btn primary" onClick={onLeave}>Back to home</button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="state-view">
        <p className="state-error">{error}</p>
        <button type="button" className="state-btn primary" onClick={onLeave}>Back to home</button>
      </div>
    );
  }

  return (
    <div className="state-view">
      <p>Connecting…</p>
      <button type="button" className="state-btn secondary" onClick={onLeave}>Cancel</button>
    </div>
  );
}

const THEME_OPTIONS = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'auto', label: 'Auto' },
  { id: 'red-pill', label: 'Red Pill' },
  { id: 'cyberpunk', label: 'Cyberpunk' },
  { id: 'midnight', label: 'Midnight Command' },
  { id: 'matrix', label: 'Matrix' },
];
const THEME_IDS = new Set(THEME_OPTIONS.map((o) => o.id));

export default function MeetingRoom({ roomId, userName, roomOptions, localStream, localStreamRef, onLeave }) {
  const {
    participants,
    remoteStreams,
    messages,
    error,
    status,
    isHost,
    pendingParticipants,
    notStartedAt,
    handRaised,
    reactions,
    spotlightId,
    audioMutedByHost,
    myId,
    joinWithPassword,
    admit,
    reject,
    sendMessage,
    replaceVideoTrack,
    muteAll,
    requestMutePeer,
    kick,
    endMeeting,
    setRaiseHand,
    sendReaction,
    setSpotlight,
    clearAudioMutedByHost,
    socketRef,
  } = useMeeting(roomId, userName, localStreamRef, roomOptions);

  const inCall = status === 'joined';
  const meshMode = !roomOptions?.sfu;
  useIntelMetrics({
    enabled: inCall && meshMode,
    localStreamRef,
    socketRef,
  });
  const intelParticipants = useIntelDashboard(socketRef, isHost);

  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [layout, setLayout] = useState('grid');
  const [pinnedId, setPinnedId] = useState(null);
  const [reactionTick, setReactionTick] = useState(0);
  const [analyticsVisible, setAnalyticsVisible] = useState(true);
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    const t = localStorage.getItem('mark2-theme') || 'dark';
    return THEME_IDS.has(t) ? t : 'dark';
  });
  const [resolvedTheme, setResolvedTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    const t = localStorage.getItem('mark2-theme') || 'dark';
    const effective = THEME_IDS.has(t) ? t : 'dark';
    if (effective === 'auto') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return effective;
  });

  const [activePoll, setActivePoll] = useState(null);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [activeBreak, setActiveBreak] = useState(null);

  useEffect(() => {
    const s = socketRef?.current;
    if (!inCall || !s) return;
    const onPoll = (p) => setActivePoll(p);
    const onPollEnd = () => setActivePoll(null);
    const onQuiz = (p) => setActiveQuiz(p);
    const onQuizEnd = () => setActiveQuiz(null);
    const onBreak = (p) => setActiveBreak(p);
    const onBreakEnd = () => setActiveBreak(null);
    s.on('sensei-poll', onPoll);
    s.on('sensei-poll-end', onPollEnd);
    s.on('sensei-quiz', onQuiz);
    s.on('sensei-quiz-end', onQuizEnd);
    s.on('sensei-break', onBreak);
    s.on('sensei-break-end', onBreakEnd);
    return () => {
      s.off('sensei-poll', onPoll);
      s.off('sensei-poll-end', onPollEnd);
      s.off('sensei-quiz', onQuiz);
      s.off('sensei-quiz-end', onQuizEnd);
      s.off('sensei-break', onBreak);
      s.off('sensei-break-end', onBreakEnd);
    };
  }, [inCall]);

  useEffect(() => {
    if (theme === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      setResolvedTheme(mq.matches ? 'dark' : 'light');
      const onChange = () => setResolvedTheme(mq.matches ? 'dark' : 'light');
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    setResolvedTheme(theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('mark2-theme', theme);
  }, [theme]);
  const handlePin = useCallback((peerId) => {
    if (isHost) setSpotlight(spotlightId === peerId ? null : peerId);
    else setPinnedId((prev) => (prev === peerId ? null : peerId));
  }, [isHost, spotlightId, setSpotlight]);
  const effectiveSpotlight = isHost ? spotlightId : null;
  const effectivePinned = isHost ? null : pinnedId;
  useEffect(() => {
    if (!reactions?.length) return;
    const id = setInterval(() => setReactionTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [reactions?.length]);

  const inviteLink = typeof window !== 'undefined'
    ? `${window.location.origin}/meeting/${roomId}?name=` + encodeURIComponent(userName)
    : '';

  const copyInvite = useCallback(() => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).catch(() => {});
  }, [inviteLink]);

  const showStateView = !inCall || status === 'kicked' || status === 'ended';

  if (showStateView) {
    return (
      <div className="room room-state">
        <JoinStateView
          status={status}
          error={error}
          notStartedAt={notStartedAt}
          joinWithPassword={joinWithPassword}
          onLeave={onLeave}
        />
        <style>{`
          .room-state {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--bg);
          }
          .state-view {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 32px;
            max-width: 360px;
            text-align: center;
          }
          .state-view p { margin: 0 0 16px; }
          .state-muted { color: var(--text-muted); font-size: 14px; }
          .state-error { color: var(--danger); }
          .state-form { display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; }
          .state-input {
            padding: 12px 16px;
            border: 1px solid var(--border);
            border-radius: 10px;
            background: var(--bg);
            color: var(--text);
            font-size: 15px;
          }
          .state-btn { padding: 12px 20px; border-radius: 10px; font-size: 15px; font-weight: 600; margin: 4px; }
          .state-btn.primary { background: var(--accent); color: white; border: none; }
          .state-btn.primary:hover { background: var(--accent-hover); }
          .state-btn.secondary { background: var(--surface-hover); color: var(--text); border: 1px solid var(--border); }
          .state-btn.secondary:hover { background: var(--border); }
          .room-state .state-view { background: #161a20; color: #e6e9ef; }
          .room-state .state-view p { color: #e6e9ef; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="room" data-theme={resolvedTheme}>
      {activePoll && (
        <PollView
          payload={activePoll}
          socketRef={socketRef}
          myId={myId}
          isHost={isHost}
          onEnd={() => setActivePoll(null)}
        />
      )}
      {activeQuiz && (
        <QuizView
          payload={activeQuiz}
          socketRef={socketRef}
          myId={myId}
          isHost={isHost}
          onEnd={() => setActiveQuiz(null)}
        />
      )}
      {activeBreak && (
        <BreakView
          payload={activeBreak}
          onEnd={() => setActiveBreak(null)}
          isHost={isHost}
          socketRef={socketRef}
        />
      )}
      <header className="room-header">
        <span className="room-id">{resolvedTheme === 'matrix' ? 'Simulation' : 'Sensei'}: {roomId}</span>
        <div className="room-header-actions">
          {isHost && meshMode && (
            <button
              type="button"
              className="room-analytics-toggle"
              onClick={() => setAnalyticsVisible((v) => !v)}
              title={analyticsVisible ? 'Hide AI Analytics' : 'Show AI Analytics'}
            >
              {analyticsVisible ? 'Hide AI Analytics' : 'Show AI Analytics'}
            </button>
          )}
          <div className="room-theme-switcher">
            <label className="room-theme-label" htmlFor="room-theme-select">Theme</label>
            <select
              id="room-theme-select"
              className="room-theme-select"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              title="Choose theme"
            >
              {THEME_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>
          {isHost && pendingParticipants.length > 0 && (
            <button
              type="button"
              className="room-pending-badge"
              onClick={() => setPendingOpen((o) => !o)}
            >
              {pendingParticipants.length} waiting
            </button>
          )}
          <button type="button" className="room-copy" onClick={copyInvite}>Copy invite link</button>
        </div>
      </header>
      {pendingOpen && isHost && pendingParticipants.length > 0 && (
        <div className="room-pending-panel">
          <div className="room-pending-header">Waiting to join</div>
          <ul className="room-pending-list">
            {pendingParticipants.map((p) => (
              <li key={p.id} className="room-pending-item">
                <span>{p.userName}</span>
                <div>
                  <button type="button" className="room-pending-admit" onClick={() => { admit(p.id); setPendingOpen(false); }}>Admit</button>
                  <button type="button" className="room-pending-reject" onClick={() => reject(p.id)}>Reject</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <div className="room-error">{error}</div>
      )}
      <div className="room-main">
        <div className="room-video-area">
          <VideoGrid
            localStream={localStream}
            remoteStreams={remoteStreams}
            participants={participants}
            localName={userName}
            layout={layout}
            spotlightId={effectiveSpotlight}
            pinnedId={effectivePinned}
            onPin={handlePin}
            handRaised={handRaised}
            reactions={reactions}
            reactionTick={reactionTick}
            isHost={isHost}
          />
          <aside className={`room-sidebar ${chatOpen ? 'open' : ''}`}>
            <Chat
              messages={messages}
              onSend={sendMessage}
              onClose={() => setChatOpen(false)}
            />
          </aside>
          <aside className={`room-sidebar room-participants ${participantsOpen ? 'open' : ''}`}>
            <Participants
              participants={participants}
              localName={userName}
              onClose={() => setParticipantsOpen(false)}
              isHost={isHost}
              myId={myId}
              onMutePeer={requestMutePeer}
              onKick={kick}
              handRaised={handRaised}
              theme={resolvedTheme}
            />
          </aside>
        </div>
        {isHost && meshMode && analyticsVisible && (
          <div className="room-intel-panel">
            <IntelPanel
              participants={intelParticipants}
              theme={resolvedTheme}
              socketRef={socketRef}
              onPollLaunch={(payload) => {
                if (socketRef?.current) socketRef.current.emit('sensei-poll', payload);
              }}
              onQuizStart={(payload) => {
                if (socketRef?.current) socketRef.current.emit('sensei-quiz', payload);
              }}
              onBreakStart={(payload) => {
                if (socketRef?.current) socketRef.current.emit('sensei-break', payload);
              }}
            />
          </div>
        )}
      </div>
      <Controls
        localStream={localStream}
        replaceVideoTrack={replaceVideoTrack}
        onLeave={onLeave}
        onChatToggle={() => { setChatOpen((o) => !o); setParticipantsOpen(false); }}
        onParticipantsToggle={() => { setParticipantsOpen((o) => !o); setChatOpen(false); }}
        chatOpen={chatOpen}
        participantsOpen={participantsOpen}
        isHost={isHost}
        theme={resolvedTheme}
        onMuteAll={muteAll}
        onEndMeeting={endMeeting}
        audioMutedByHost={audioMutedByHost}
        clearAudioMutedByHost={clearAudioMutedByHost}
        handRaised={handRaised}
        myId={myId}
        setRaiseHand={setRaiseHand}
        sendReaction={sendReaction}
        layout={layout}
        onLayoutChange={setLayout}
      />
      <style>{`
        .room {
          height: 100vh;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: #0d0f12;
          color: #e6e9ef;
        }
        .room-header {
          padding: 10px 20px;
          background: #161a20;
          color: #e6e9ef;
          border-bottom: 1px solid #2a313c;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-shrink: 0;
        }
        .room-header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .room-analytics-toggle {
          padding: 6px 12px;
          background: var(--surface-hover);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
        }
        .room-analytics-toggle:hover { background: var(--border); }
        .room-theme-switcher { display: flex; align-items: center; gap: 8px; }
        .room-theme-label { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
        .room-theme-select {
          padding: 6px 10px;
          background: var(--surface-hover);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          min-width: 120px;
        }
        .room-theme-select:hover, .room-theme-select:focus { border-color: var(--accent); outline: none; }
        .room-id { font-size: 14px; color: var(--text-muted); }
        .room-pending-badge {
          padding: 6px 12px;
          background: var(--accent);
          color: white;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
        }
        .room-pending-badge:hover { opacity: 0.9; }
        .room-copy {
          padding: 8px 14px;
          background: var(--surface-hover);
          color: var(--text);
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
        }
        .room-copy:hover { background: var(--border); }
        .room-pending-panel {
          padding: 12px 20px;
          background: var(--surface-hover);
          border-bottom: 1px solid var(--border);
        }
        .room-pending-header { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
        .room-pending-list { list-style: none; margin: 0; padding: 0; }
        .room-pending-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          font-size: 14px;
        }
        .room-pending-admit { margin-right: 8px; padding: 6px 12px; background: var(--success); color: white; border-radius: 6px; font-size: 13px; font-weight: 500; }
        .room-pending-reject { padding: 6px 12px; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 6px; font-size: 13px; }
        .room-error {
          padding: 10px 16px;
          background: rgba(229, 77, 77, 0.15);
          color: var(--danger);
          font-size: 14px;
        }
        .room-main {
          flex: 1;
          display: flex;
          min-height: 0;
          position: relative;
          background: #0d0f12;
        }
        .room-video-area {
          flex: 1;
          min-width: 0;
          display: flex;
          position: relative;
        }
        .room-sidebar {
          width: 320px;
          background: var(--surface);
          border-left: 1px solid var(--border);
          display: none;
          flex-direction: column;
        }
        .room-sidebar.open { display: flex; }
        .room-intel-panel {
          width: 520px;
          min-width: 440px;
          max-width: 560px;
          background: #0a0a1a;
          border-left: 1px solid rgba(0, 255, 255, 0.2);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          flex-shrink: 0;
        }

        /* Light theme — set variables so VideoGrid, Controls, etc. inherit */
        .room[data-theme="light"] {
          --bg: #f1f5f9;
          --surface: #e2e8f0;
          --surface-hover: #cbd5e1;
          --border: #cbd5e1;
          --text: #1e293b;
          --text-muted: #64748b;
          --accent: #0ea5e9;
          --accent-hover: #0284c7;
          background: #f1f5f9;
          color: #1e293b;
        }
        .room[data-theme="light"] .room-header {
          background: #e2e8f0;
          color: #1e293b;
          border-bottom-color: #cbd5e1;
        }
        .room[data-theme="light"] .room-id,
        .room[data-theme="light"] .room-analytics-toggle,
        .room[data-theme="light"] .room-theme-label { color: #475569; }
        .room[data-theme="light"] .room-theme-select { background: #fff; color: #334155; border-color: #cbd5e1; }
        .room[data-theme="light"] .room-theme-select:hover, .room[data-theme="light"] .room-theme-select:focus { border-color: #0ea5e9; }
        .room[data-theme="light"] .room-analytics-toggle {
          background: #fff;
          border-color: #cbd5e1;
          color: #334155;
        }
        .room[data-theme="light"] .room-analytics-toggle:hover { background: #e2e8f0; }
        .room[data-theme="light"] .room-main { background: #f1f5f9; }
        .room[data-theme="light"] .room-copy {
          background: #fff;
          color: #334155;
          border: 1px solid #cbd5e1;
        }
        .room[data-theme="light"] .room-copy:hover { background: #e2e8f0; }
        .room[data-theme="light"] .room-pending-panel { background: #e2e8f0; border-bottom-color: #cbd5e1; }
        .room[data-theme="light"] .room-intel-panel {
          background: #e2e8f0;
          border-left-color: #94a3b8;
        }

        /* Red Pill Protocol */
        .room[data-theme="red-pill"] {
          --bg: #0D0D0D;
          --surface: #1a1a1a;
          --surface-hover: #262626;
          --border: #333;
          --text: #e6e6e6;
          --text-muted: #999;
          --accent: #FF003C;
          --accent-hover: #e60036;
          --success: #00FF66;
          background: #0D0D0D;
          color: #e6e6e6;
        }
        .room[data-theme="red-pill"] .room-header { background: #1a1a1a; border-bottom-color: #333; }
        .room[data-theme="red-pill"] .room-main { background: #0D0D0D; }
        .room[data-theme="red-pill"] .room-intel-panel { background: #0D0D0D; border-left-color: rgba(255,0,60,0.35); }

        /* Cyberpunk Neon */
        .room[data-theme="cyberpunk"] {
          --bg: #1A0033;
          --surface: #2d0052;
          --surface-hover: #3d0066;
          --border: rgba(0,240,255,0.25);
          --text: #e6e6ff;
          --text-muted: #b8a0d0;
          --accent: #00F0FF;
          --accent-hover: #00c4d1;
          background: #1A0033;
          color: #e6e6ff;
        }
        .room[data-theme="cyberpunk"] .room-header { background: #2d0052; border-bottom-color: rgba(0,240,255,0.2); }
        .room[data-theme="cyberpunk"] .room-main { background: #1A0033; }
        .room[data-theme="cyberpunk"] .room-intel-panel { background: #1A0033; border-left-color: rgba(0,240,255,0.35); }
        .room[data-theme="cyberpunk"] .room-theme-select:hover, .room[data-theme="cyberpunk"] .room-analytics-toggle:hover { box-shadow: 0 0 10px rgba(0,240,255,0.4); }

        /* Midnight Command */
        .room[data-theme="midnight"] {
          --bg: #0A1A2F;
          --surface: #132639;
          --surface-hover: #2A4D69;
          --border: rgba(91,192,235,0.2);
          --text: #e8f4fc;
          --text-muted: #7a9fb8;
          --accent: #5BC0EB;
          --accent-hover: #4aadd4;
          background: #0A1A2F;
          color: #e8f4fc;
        }
        .room[data-theme="midnight"] .room-header { background: #132639; border-bottom-color: rgba(91,192,235,0.2); }
        .room[data-theme="midnight"] .room-main { background: #0A1A2F; }
        .room[data-theme="midnight"] .room-intel-panel { background: #0A1A2F; border-left-color: rgba(91,192,235,0.3); }

        /* Matrix */
        .room[data-theme="matrix"] {
          --bg: #0D0D0D;
          --surface: #111111;
          --surface-hover: #1a1a1a;
          --border: rgba(0,255,102,0.2);
          --text: #E6FFE6;
          --text-muted: #8A8A8A;
          --accent: #00FF66;
          --accent-hover: #00cc52;
          --danger: #FF003C;
          background: #0D0D0D;
          color: #E6FFE6;
        }
        .room[data-theme="matrix"] .room-header { background: #111111; border-bottom-color: rgba(0,255,102,0.15); }
        .room[data-theme="matrix"] .room-main { background: #0D0D0D; }
        .room[data-theme="matrix"] .room-intel-panel { background: #0D0D0D; border-left-color: rgba(0,255,102,0.25); }
        .room[data-theme="matrix"] .room-id { font-family: "Orbitron", "Space Mono", sans-serif; letter-spacing: 0.06em; }
        .room[data-theme="matrix"] .room-analytics-toggle { font-family: "Orbitron", "Space Mono", sans-serif; }
      `}</style>
    </div>
  );
}
