import { useEffect, useMemo, useState, useCallback } from 'react';
import '@livekit/components-styles';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';

function makeIdentity(name) {
  const safe = (name || 'guest').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) || 'guest';
  return `${safe}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function MeetingRoomSFU({ roomId, userName, roomOptions, onLeave }) {
  const [token, setToken] = useState(null);
  const [livekitUrl, setLivekitUrl] = useState(null);
  const [error, setError] = useState(null);

  const identity = useMemo(() => makeIdentity(userName), [userName]);
  const inviteLink = typeof window !== 'undefined'
    ? `${window.location.origin}/meeting/${roomId}?name=${encodeURIComponent(userName)}&sfu=1`
    : '';

  const copyInvite = useCallback(() => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).catch(() => {});
  }, [inviteLink]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        const res = await fetch('/livekit/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room: roomId, identity, name: userName }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || `Token request failed (${res.status})`);
        if (cancelled) return;
        setToken(json.token);
        setLivekitUrl(json.url);
      } catch (e) {
        if (cancelled) return;
        setError(e?.message || 'Failed to start SFU meeting');
      }
    })();
    return () => { cancelled = true; };
  }, [roomId, identity, userName, roomOptions?.password]);

  if (error) {
    return (
      <div className="sfu-fallback">
        <h2>SFU meeting failed</h2>
        <p>{error}</p>
        <button type="button" onClick={onLeave}>Back</button>
        <style>{`
          .sfu-fallback { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; background: #0d0f12; color: #e6e9ef; }
          .sfu-fallback h2 { margin: 0; }
          .sfu-fallback p { margin: 0; color: #8b92a0; max-width: 520px; text-align: center; }
          .sfu-fallback button { padding: 10px 18px; background: #5b7fff; color: white; border-radius: 8px; font-weight: 600; border: none; }
        `}</style>
      </div>
    );
  }

  if (!token || !livekitUrl) {
    return (
      <div className="sfu-fallback">
        <p>Connecting to SFU…</p>
        <button type="button" onClick={onLeave}>Cancel</button>
        <style>{`
          .sfu-fallback { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; background: #0d0f12; color: #e6e9ef; }
          .sfu-fallback button { padding: 10px 18px; background: #161a20; color: #e6e9ef; border-radius: 8px; font-weight: 600; border: 1px solid #2a313c; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="sfu-room">
      <header className="sfu-header">
        <span className="sfu-id">Sensei (SFU): {roomId}</span>
        <button type="button" className="sfu-copy" onClick={copyInvite}>Copy invite link</button>
      </header>
      <LiveKitRoom
        serverUrl={livekitUrl}
        token={token}
        connect={true}
        video={true}
        audio={true}
        onDisconnected={onLeave}
        data-lk-theme="default"
        style={{ flex: 1, minHeight: 0 }}
      >
        <VideoConference />
      </LiveKitRoom>
      <style>{`
        .sfu-room { height: 100vh; display: flex; flex-direction: column; background: #0d0f12; color: #e6e9ef; }
        .sfu-header { flex-shrink: 0; padding: 10px 20px; background: #161a20; border-bottom: 1px solid #2a313c; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .sfu-id { font-size: 14px; color: #8b92a0; }
        .sfu-copy { padding: 8px 14px; background: #1c2129; color: #e6e9ef; border-radius: 8px; border: 1px solid #2a313c; font-size: 13px; font-weight: 500; }
        .lk-video-conference { flex: 1; min-height: 0; }
      `}</style>
    </div>
  );
}

