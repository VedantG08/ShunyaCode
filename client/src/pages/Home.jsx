import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function randomRoomId() {
  return Math.random().toString(36).slice(2, 10);
}

const EXPIRY_OPTIONS = [
  { value: 0, label: 'When everyone leaves' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
];

export default function Home() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [error, setError] = useState('');

  const [createPassword, setCreatePassword] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [expiryMinutes, setExpiryMinutes] = useState(30);
  const [waitingRoom, setWaitingRoom] = useState(false);
  const [sfuMode, setSfuMode] = useState(false);
  const [showCreateOptions, setShowCreateOptions] = useState(false);

  const handleCreate = (e) => {
    e.preventDefault();
    const name = userName.trim();
    if (!name) {
      setError('Enter your name');
      return;
    }
    setError('');
    const roomId = randomRoomId();
    const params = new URLSearchParams({ name });
    params.set('create', '1');
    if (createPassword.trim()) params.set('password', createPassword.trim());
    if (scheduledAt) params.set('scheduled', new Date(scheduledAt).toISOString());
    params.set('expiry', String(expiryMinutes));
    if (waitingRoom) params.set('waiting', '1');
    if (sfuMode) params.set('sfu', '1');
    navigate(`/meeting/${roomId}?${params.toString()}`);
  };

  const handleJoin = (e) => {
    e.preventDefault();
    const name = userName.trim();
    const room = joinRoomId.trim();
    if (!name) {
      setError('Enter your name');
      return;
    }
    if (!room) {
      setError('Enter room ID or paste link');
      return;
    }
    setError('');
    let roomId = room.replace(/.*\/(?:meeting\/)?([a-z0-9-]+).*/i, '$1');
    const params = new URLSearchParams({ name });
    try {
      const maybeUrl = new URL(room, window.location.origin);
      const m = maybeUrl.pathname.match(/\/meeting\/([^/]+)/i);
      if (m?.[1]) roomId = m[1];
      const preserved = new URLSearchParams(maybeUrl.search);
      for (const key of ['sfu', 'password']) {
        const v = preserved.get(key);
        if (v) params.set(key, v);
      }
    } catch {
      // ignore parse failures
    }
    if (joinPassword.trim()) params.set('password', joinPassword.trim());
    navigate(`/meeting/${roomId}?${params.toString()}`);
  };

  return (
    <div className="home">
      <div className="home-bg" aria-hidden />
      <div className="home-inner">
        <header className="home-hero">
          <h1 className="home-title">Sensei</h1>
          <p className="home-tagline">Video calls with screen share, chat, and AI-powered engagement insights</p>
        </header>

        <div className="home-card">
          <div className="home-card-inner">
            <div className="home-section home-section-name">
              <label className="home-field-label">Your name</label>
              <input
                type="text"
                placeholder="How others will see you"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="home-input"
                maxLength={50}
                autoComplete="name"
              />
            </div>

            <form onSubmit={handleCreate} className="home-form home-form-create">
              <div className="home-section">
                <h2 className="home-section-title">Start a Sensei call</h2>
                <p className="home-section-desc">Create a new room and share the link with others.</p>
              </div>
              <button
                type="button"
                className="home-options-toggle"
                onClick={() => setShowCreateOptions((o) => !o)}
                aria-expanded={showCreateOptions}
              >
                <span className="home-options-toggle-text">Sensei options</span>
                <span className="home-options-toggle-icon">{showCreateOptions ? '−' : '+'}</span>
              </button>
              {showCreateOptions && (
                <div className="home-options">
                  <div className="home-options-group">
                    <span className="home-options-group-title">Security</span>
                    <label className="home-label">
                      <span className="home-label-text">Password (optional)</span>
                      <input
                        type="text"
                        placeholder="Room password"
                        value={createPassword}
                        onChange={(e) => setCreatePassword(e.target.value)}
                        className="home-input home-input-sm"
                        maxLength={20}
                        autoComplete="off"
                      />
                    </label>
                  </div>
                  <div className="home-options-group">
                    <span className="home-options-group-title">Schedule</span>
                    <label className="home-label">
                      <span className="home-label-text">Scheduled start (optional)</span>
                      <input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        className="home-input home-input-sm"
                      />
                    </label>
                    <label className="home-label">
                      <span className="home-label-text">Room expires when empty</span>
                      <select
                        value={expiryMinutes}
                        onChange={(e) => setExpiryMinutes(Number(e.target.value))}
                        className="home-input home-input-sm home-select"
                      >
                        {EXPIRY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="home-options-group">
                    <span className="home-options-group-title">Room behavior</span>
                    <label className="home-checkbox">
                      <input
                        type="checkbox"
                        checked={waitingRoom}
                        onChange={(e) => setWaitingRoom(e.target.checked)}
                        className="home-checkbox-input"
                      />
                      <span className="home-checkbox-label">Waiting room (host admits participants)</span>
                    </label>
                    <label className="home-checkbox">
                      <input
                        type="checkbox"
                        checked={sfuMode}
                        onChange={(e) => setSfuMode(e.target.checked)}
                        className="home-checkbox-input"
                      />
                      <span className="home-checkbox-label">Large meeting mode (SFU via LiveKit)</span>
                    </label>
                  </div>
                </div>
              )}
              <button type="submit" className="home-btn home-btn-primary">
                Start call
              </button>
            </form>

            <div className="home-divider">
              <span className="home-divider-line" />
              <span className="home-divider-text">or join with ID or link</span>
              <span className="home-divider-line" />
            </div>

            <form onSubmit={handleJoin} className="home-form home-form-join">
              <div className="home-section">
                <label className="home-field-label">Room ID or invite link</label>
                <input
                  type="text"
                  placeholder="Paste link or enter room ID"
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value)}
                  className="home-input"
                  autoComplete="off"
                />
              </div>
              <div className="home-section">
                <label className="home-field-label">Password (if required)</label>
                <input
                  type="password"
                  placeholder="Room password"
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  className="home-input"
                  autoComplete="off"
                />
              </div>
              <button type="submit" className="home-btn home-btn-secondary">
                Join call
              </button>
            </form>

            {error && (
              <div className="home-error" role="alert">
                {error}
              </div>
            )}
          </div>
        </div>

        <p className="home-footer">No account required. Your camera and mic stay on your device.</p>
      </div>

      <style>{`
        .home {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          position: relative;
          overflow: hidden;
        }
        .home-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 80% 50% at 50% -20%, rgba(91, 127, 255, 0.12), transparent),
            radial-gradient(ellipse 60% 40% at 100% 50%, rgba(91, 127, 255, 0.06), transparent),
            radial-gradient(ellipse 60% 40% at 0% 50%, rgba(91, 127, 255, 0.06), transparent);
          pointer-events: none;
        }
        .home-inner {
          position: relative;
          width: 100%;
          max-width: 440px;
        }
        .home-hero {
          text-align: center;
          margin-bottom: 32px;
        }
        .home-title {
          margin: 0 0 8px;
          font-size: 2.25rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--text);
        }
        .home-tagline {
          margin: 0;
          font-size: 0.9375rem;
          color: var(--text-muted);
          line-height: 1.45;
          max-width: 360px;
          margin-left: auto;
          margin-right: auto;
        }
        .home-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 32px;
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.25);
        }
        .home-card-inner {
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        .home-section {
          margin-bottom: 16px;
        }
        .home-section:last-child { margin-bottom: 0; }
        .home-section-name { margin-bottom: 24px; }
        .home-section-title {
          margin: 0 0 4px;
          font-size: 1rem;
          font-weight: 600;
          color: var(--text);
        }
        .home-section-desc {
          margin: 0 0 12px;
          font-size: 0.8125rem;
          color: var(--text-muted);
        }
        .home-field-label {
          display: block;
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--text-muted);
          margin-bottom: 6px;
        }
        .home-input {
          width: 100%;
          padding: 14px 16px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--bg);
          color: var(--text);
          font-size: 1rem;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .home-input::placeholder {
          color: var(--text-muted);
          opacity: 0.8;
        }
        .home-input:hover {
          border-color: rgba(91, 127, 255, 0.25);
        }
        .home-input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(91, 127, 255, 0.2);
        }
        .home-input-sm {
          padding: 10px 14px;
          font-size: 0.9375rem;
        }
        .home-select {
          cursor: pointer;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none' stroke='%238b92a0' stroke-width='2'%3E%3Cpath d='M2 4 L6 8 L10 4'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 14px center;
          padding-right: 36px;
        }
        .home-form {
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        .home-form-create { margin-bottom: 8px; }
        .home-form-join { margin-top: 8px; }
        .home-options-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 12px 0;
          margin-bottom: 4px;
          background: none;
          border: none;
          color: var(--accent);
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: color 0.2s;
        }
        .home-options-toggle:hover {
          color: var(--accent-hover);
        }
        .home-options-toggle-icon {
          font-size: 1.25rem;
          line-height: 1;
          opacity: 0.9;
        }
        .home-options {
          display: flex;
          flex-direction: column;
          gap: 20px;
          padding: 20px 0 24px;
          border-top: 1px solid var(--border);
          margin-bottom: 8px;
        }
        .home-options-group {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .home-options-group-title {
          font-size: 0.6875rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
        }
        .home-label {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .home-label-text {
          font-size: 0.8125rem;
          color: var(--text-muted);
        }
        .home-checkbox {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          cursor: pointer;
          font-size: 0.875rem;
          color: var(--text);
        }
        .home-checkbox-input {
          width: 18px;
          height: 18px;
          margin-top: 2px;
          flex-shrink: 0;
          accent-color: var(--accent);
          cursor: pointer;
        }
        .home-checkbox-label {
          line-height: 1.4;
          color: var(--text-muted);
        }
        .home-divider {
          display: flex;
          align-items: center;
          gap: 16px;
          margin: 24px 0;
        }
        .home-divider-line {
          flex: 1;
          height: 1px;
          background: var(--border);
        }
        .home-divider-text {
          font-size: 0.8125rem;
          color: var(--text-muted);
          white-space: nowrap;
        }
        .home-btn {
          width: 100%;
          padding: 14px 24px;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s, transform 0.05s;
        }
        .home-btn:active {
          transform: scale(0.99);
        }
        .home-btn-primary {
          background: var(--accent);
          color: white;
          border: none;
          margin-top: 4px;
        }
        .home-btn-primary:hover {
          background: var(--accent-hover);
        }
        .home-btn-secondary {
          background: transparent;
          color: var(--text);
          border: 2px solid var(--border);
        }
        .home-btn-secondary:hover {
          background: var(--surface-hover);
          border-color: var(--text-muted);
        }
        .home-error {
          margin-top: 20px;
          padding: 12px 16px;
          border-radius: 10px;
          background: rgba(229, 77, 77, 0.12);
          border: 1px solid rgba(229, 77, 77, 0.3);
          color: var(--danger);
          font-size: 0.875rem;
        }
        .home-footer {
          margin-top: 24px;
          text-align: center;
          font-size: 0.8125rem;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
