import { useRef, useState, useCallback } from 'react';

const LAYOUTS = [
  { id: 'grid', label: 'Grid', title: 'Grid view' },
  { id: 'speaker', label: 'Speaker', title: 'Speaker focus' },
  { id: 'sidebar', label: 'Sidebar', title: 'Speaker + grid sidebar' },
];

export default function Controls({
  localStream,
  replaceVideoTrack,
  onLeave,
  onChatToggle,
  onParticipantsToggle,
  chatOpen,
  participantsOpen,
  isHost,
  theme,
  onMuteAll,
  onEndMeeting,
  audioMutedByHost,
  clearAudioMutedByHost,
  handRaised,
  myId,
  setRaiseHand,
  sendReaction,
  layout,
  onLayoutChange,
}) {
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const screenStreamRef = useRef(null);

  const isMuted = muted || audioMutedByHost;
  const myHandRaised = myId && handRaised instanceof Map && handRaised.get(myId);

  const toggleMute = useCallback(() => {
    if (!localStream) return;
    const audio = localStream.getAudioTracks()[0];
    if (audio) {
      audio.enabled = !audio.enabled;
      setMuted(!audio.enabled);
      if (audio.enabled) clearAudioMutedByHost?.();
    }
  }, [localStream, clearAudioMutedByHost]);

  const toggleVideo = useCallback(() => {
    if (!localStream) return;
    const video = localStream.getVideoTracks()[0];
    if (video) {
      video.enabled = !video.enabled;
      setVideoOff(!video.enabled);
    }
  }, [localStream]);

  const toggleScreenShare = useCallback(async () => {
    if (!localStream || !replaceVideoTrack) return;
    try {
      if (screenSharing && screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        const video = localStream.getVideoTracks()[0];
        if (video) {
          video.enabled = true;
          replaceVideoTrack(video);
        }
        setScreenSharing(false);
        return;
      }
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];
      replaceVideoTrack(screenTrack);
      screenTrack.onended = () => {
        const video = localStream.getVideoTracks()[0];
        if (video) {
          video.enabled = true;
          replaceVideoTrack(video);
        }
        setScreenSharing(false);
      };
      localStream.getVideoTracks()[0].enabled = false;
      setScreenSharing(true);
    } catch (e) {
      console.error('Screen share failed', e);
    }
  }, [localStream, screenSharing, replaceVideoTrack]);

  const toggleRaiseHand = useCallback(() => {
    setRaiseHand?.(!myHandRaised);
  }, [myHandRaised, setRaiseHand]);

  return (
    <div className="controls">
      <button
        type="button"
        className={`control-btn ${isMuted ? 'active' : ''}`}
        onClick={toggleMute}
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 6l4 4m0 4l-4 4M5 5l14 14" />
            <path d="M2 12h4M10 12h2M18 12h2" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a3 3 0 0 1 3 3v10a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M9 22h6" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className={`control-btn ${videoOff ? 'active' : ''}`}
        onClick={toggleVideo}
        title={videoOff ? 'Turn on camera' : 'Turn off camera'}
      >
        {videoOff ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 16v4M8 8v4M2 2l20 20M6 4h4l2 2h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4l-2 2H8" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 7l-7 5 7 5V7z" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className={`control-btn ${screenSharing ? 'active' : ''}`}
        onClick={toggleScreenShare}
        title={screenSharing ? 'Stop sharing' : 'Share screen'}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="4" width="20" height="14" rx="2" />
          <path d="M8 20h8M12 20v-4" />
        </svg>
      </button>
      <button
        type="button"
        className={`control-btn ${myHandRaised ? 'active' : ''}`}
        onClick={toggleRaiseHand}
        title="Raise hand"
      >
        <span aria-hidden>🙋</span>
      </button>
      <div className="control-reactions">
        <button type="button" className="control-btn control-reaction" onClick={() => sendReaction?.('thumbs-up')} title="Thumbs up">
          <span aria-hidden>👍</span>
        </button>
        <button type="button" className="control-btn control-reaction" onClick={() => sendReaction?.('clap')} title="Clap">
          <span aria-hidden>👏</span>
        </button>
      </div>
      <div className="control-layout">
        {LAYOUTS.map((l) => (
          <button
            key={l.id}
            type="button"
            className={`control-btn control-layout-btn ${layout === l.id ? 'active' : ''}`}
            onClick={() => onLayoutChange?.(l.id)}
            title={l.title}
          >
            {l.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={`control-btn ${chatOpen ? 'active' : ''}`}
        onClick={onChatToggle}
        title="Chat"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
      <button
        type="button"
        className={`control-btn ${participantsOpen ? 'active' : ''}`}
        onClick={onParticipantsToggle}
        title={theme === 'matrix' ? 'Nodes' : 'Participants'}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </button>
      {isHost && (
        <>
          <button type="button" className="control-btn control-host" onClick={onMuteAll} title="Mute all">
            Mute all
          </button>
          <button type="button" className="control-btn control-host control-end" onClick={onEndMeeting} title="End Sensei call for all">
            End call
          </button>
        </>
      )}
      <button type="button" className="control-btn control-leave" onClick={onLeave} title="Leave">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Leave
      </button>
      <style>{`
        .controls {
          padding: 12px 24px;
          background: var(--surface);
          border-top: 1px solid var(--border);
          display: flex;
          gap: 8px;
          justify-content: center;
          align-items: center;
          flex-wrap: wrap;
        }
        .control-btn {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: var(--surface-hover);
          color: var(--text);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
        }
        .control-btn:hover {
          background: var(--border);
        }
        .control-btn.active {
          background: var(--accent);
          color: white;
        }
        .control-reactions { display: flex; gap: 4px; }
        .control-reaction { width: 40px; height: 40px; font-size: 18px; }
        .control-layout { display: flex; gap: 4px; }
        .control-layout-btn {
          width: auto;
          padding: 0 12px;
          border-radius: 24px;
          font-size: 12px;
        }
        .control-host {
          width: auto;
          padding: 0 14px;
          border-radius: 24px;
          font-size: 13px;
          background: var(--surface-hover);
        }
        .control-end { background: rgba(229, 77, 77, 0.2); color: var(--danger); }
        .control-end:hover { background: rgba(229, 77, 77, 0.35); }
        .control-leave {
          width: auto;
          padding: 0 20px;
          border-radius: 24px;
          background: var(--danger);
          color: white;
        }
        .control-leave:hover {
          background: var(--danger-hover);
        }
      `}</style>
    </div>
  );
}
