import { useRef, useEffect } from 'react';

const REACTION_LABELS = { 'thumbs-up': '👍', clap: '👏' };

function VideoTile({ stream, name, isLocal, peerId, handRaised, isSpotlight, isPinned, onPin, isHost }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current || !stream) return;
    videoRef.current.srcObject = stream;
  }, [stream]);

  const raised = handRaised instanceof Map && peerId && handRaised.get(peerId);
  const canPin = !isLocal && onPin;
  const showPinned = isPinned || (isHost && isSpotlight);

  return (
    <div className={`tile ${isLocal ? 'tile-local' : ''} ${isSpotlight ? 'tile-spotlight' : ''} ${showPinned ? 'tile-pinned' : ''}`}>
      <video ref={videoRef} autoPlay playsInline muted={isLocal} />
      <span className="tile-name">{name || 'Unknown'}</span>
      {raised && <span className="tile-hand" title="Hand raised">✋</span>}
      {canPin && (
        <button
          type="button"
          className="tile-pin"
          onClick={() => onPin(showPinned ? null : peerId)}
          title={showPinned ? 'Unpin' : isHost ? 'Spotlight' : 'Pin'}
        >
          {showPinned ? '📌' : '📍'}
        </button>
      )}
    </div>
  );
}

export default function VideoGrid({
  localStream,
  remoteStreams,
  participants,
  localName,
  layout = 'grid',
  spotlightId,
  pinnedId,
  onPin,
  handRaised,
  reactions,
  reactionTick,
  isHost,
}) {
  const mainId = spotlightId || pinnedId;
  const remoteEntries = [...remoteStreams.entries()];
  const now = Date.now();
  const visibleReactions = (reactions || []).filter((r) => now - r.ts < 4000);
  void reactionTick;

  const getStream = (id) => {
    if (!id) return localStream;
    return remoteStreams.get(id);
  };
  const getName = (id) => {
    if (!id) return localName;
    return participants.find((p) => p.id === id)?.userName;
  };

  const mainStream = mainId ? getStream(mainId) : localStream;
  const mainName = mainId ? getName(mainId) : localName;
  const mainIsLocal = !mainId;

  const rest = [];
  if (!mainId) {
    remoteEntries.forEach(([peerId, stream]) => rest.push({ peerId, stream, isLocal: false }));
  } else {
    if (!mainIsLocal) rest.push({ peerId: null, stream: localStream, isLocal: true });
    remoteEntries.forEach(([peerId, stream]) => {
      if (peerId !== mainId) rest.push({ peerId, stream, isLocal: false });
    });
  }

  if (layout === 'grid') {
    const gridTiles = [
      <VideoTile key="local" stream={localStream} name={localName} isLocal peerId={null} handRaised={handRaised} isHost={isHost} />,
      ...remoteEntries.map(([peerId, stream]) => (
        <VideoTile
          key={peerId}
          stream={stream}
          name={getName(peerId)}
          isLocal={false}
          peerId={peerId}
          handRaised={handRaised}
          isSpotlight={peerId === spotlightId}
          isPinned={peerId === pinnedId}
          onPin={onPin}
          isHost={isHost}
        />
      )),
    ];
    return (
      <div className="grid-wrap">
        <div className="grid grid-layout-grid">
          {gridTiles}
        </div>
        {visibleReactions.length > 0 && (
          <div className="grid-reactions">
            {visibleReactions.map((r, i) => (
              <span key={`${r.fromId}-${r.ts}-${i}`} className="grid-reaction">
                {REACTION_LABELS[r.type] || r.type} {r.userName}
              </span>
            ))}
          </div>
        )}
        <style>{`
          .grid-wrap { position: relative; flex: 1; display: flex; flex-direction: column; min-height: 0; }
          .grid { flex: 1; display: grid; gap: 12px; padding: 16px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); align-content: center; justify-items: center; }
          .tile { position: relative; width: 100%; max-width: 400px; aspect-ratio: 16/10; background: var(--surface); border-radius: 12px; overflow: hidden; border: 1px solid var(--border); }
          .tile-spotlight { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
          .tile video { width: 100%; height: 100%; object-fit: cover; }
          .tile-name { position: absolute; bottom: 8px; left: 10px; padding: 4px 8px; background: rgba(0,0,0,0.6); border-radius: 6px; font-size: 12px; }
          .tile-hand { position: absolute; top: 8px; right: 10px; font-size: 20px; }
          .tile-pin { position: absolute; top: 8px; left: 10px; background: rgba(0,0,0,0.5); border: none; border-radius: 6px; padding: 4px; font-size: 14px; cursor: pointer; }
          .tile-local video { transform: scaleX(-1); }
          .grid-reactions { position: absolute; bottom: 80px; left: 50%; transform: translateX(-50%); display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; pointer-events: none; }
          .grid-reaction { padding: 8px 14px; background: rgba(0,0,0,0.7); border-radius: 20px; font-size: 14px; animation: reaction-in 0.2s ease; }
          @keyframes reaction-in { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
        `}</style>
      </div>
    );
  }

  if (layout === 'speaker') {
    return (
      <div className="grid-wrap layout-speaker">
        <div className="speaker-main">
          <VideoTile
            stream={mainStream}
            name={mainName}
            isLocal={mainIsLocal}
            peerId={mainId || null}
            handRaised={handRaised}
            isSpotlight={!!mainId && mainId === spotlightId}
            isPinned={!!mainId && mainId === pinnedId}
            onPin={onPin}
            isHost={isHost}
          />
        </div>
        <div className="speaker-rest">
          {rest.map(({ peerId: pid, stream, isLocal }) => (
            <VideoTile
              key={pid || 'local'}
              stream={stream}
              name={getName(pid)}
              isLocal={isLocal}
              peerId={pid}
              handRaised={handRaised}
              onPin={onPin}
              isHost={isHost}
            />
          ))}
        </div>
        {visibleReactions.length > 0 && (
          <div className="grid-reactions">
            {visibleReactions.map((r, i) => (
              <span key={`${r.fromId}-${r.ts}-${i}`} className="grid-reaction">
                {REACTION_LABELS[r.type] || r.type} {r.userName}
              </span>
            ))}
          </div>
        )}
        <style>{`
          .grid-wrap { position: relative; flex: 1; display: flex; flex-direction: column; min-height: 0; }
          .tile { position: relative; width: 100%; max-width: 400px; aspect-ratio: 16/10; background: var(--surface); border-radius: 12px; overflow: hidden; border: 1px solid var(--border); }
          .tile-spotlight { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
          .tile video { width: 100%; height: 100%; object-fit: cover; }
          .tile-name { position: absolute; bottom: 8px; left: 10px; padding: 4px 8px; background: rgba(0,0,0,0.6); border-radius: 6px; font-size: 12px; }
          .tile-hand { position: absolute; top: 8px; right: 10px; font-size: 20px; }
          .tile-pin { position: absolute; top: 8px; left: 10px; background: rgba(0,0,0,0.5); border: none; border-radius: 6px; padding: 4px; font-size: 14px; cursor: pointer; }
          .tile-local video { transform: scaleX(-1); }
          .grid-reactions { position: absolute; bottom: 80px; left: 50%; transform: translateX(-50%); display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; pointer-events: none; }
          .grid-reaction { padding: 8px 14px; background: rgba(0,0,0,0.7); border-radius: 20px; font-size: 14px; }
          .layout-speaker { display: flex; flex-direction: column; }
          .speaker-main { flex: 1; display: flex; align-items: center; justify-content: center; padding: 16px; min-height: 0; }
          .speaker-main .tile { max-width: 100%; width: 100%; max-width: 900px; aspect-ratio: 16/10; }
          .speaker-rest { display: flex; gap: 8px; padding: 12px 16px; overflow-x: auto; justify-content: center; flex-shrink: 0; }
          .speaker-rest .tile { width: 160px; min-width: 160px; aspect-ratio: 16/10; max-width: none; }
        `}</style>
      </div>
    );
  }

  if (layout === 'sidebar') {
    return (
      <div className="grid-wrap layout-sidebar">
        <div className="sidebar-main">
          <VideoTile
            stream={mainStream}
            name={mainName}
            isLocal={mainIsLocal}
            peerId={mainId || null}
            handRaised={handRaised}
            isSpotlight={!!mainId && mainId === spotlightId}
            isPinned={!!mainId && mainId === pinnedId}
            onPin={onPin}
            isHost={isHost}
          />
        </div>
        <aside className="sidebar-rest">
          {rest.map(({ peerId: pid, stream, isLocal }) => (
            <VideoTile
              key={pid || 'local'}
              stream={stream}
              name={getName(pid)}
              isLocal={isLocal}
              peerId={pid}
              handRaised={handRaised}
              onPin={onPin}
              isHost={isHost}
            />
          ))}
        </aside>
        {visibleReactions.length > 0 && (
          <div className="grid-reactions">
            {visibleReactions.map((r, i) => (
              <span key={`${r.fromId}-${r.ts}-${i}`} className="grid-reaction">
                {REACTION_LABELS[r.type] || r.type} {r.userName}
              </span>
            ))}
          </div>
        )}
        <style>{`
          .grid-wrap { position: relative; flex: 1; display: flex; flex-direction: column; min-height: 0; }
          .tile { position: relative; width: 100%; max-width: 400px; aspect-ratio: 16/10; background: var(--surface); border-radius: 12px; overflow: hidden; border: 1px solid var(--border); }
          .tile-spotlight { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
          .tile video { width: 100%; height: 100%; object-fit: cover; }
          .tile-name { position: absolute; bottom: 8px; left: 10px; padding: 4px 8px; background: rgba(0,0,0,0.6); border-radius: 6px; font-size: 12px; }
          .tile-hand { position: absolute; top: 8px; right: 10px; font-size: 20px; }
          .tile-pin { position: absolute; top: 8px; left: 10px; background: rgba(0,0,0,0.5); border: none; border-radius: 6px; padding: 4px; font-size: 14px; cursor: pointer; }
          .tile-local video { transform: scaleX(-1); }
          .grid-reactions { position: absolute; bottom: 80px; left: 50%; transform: translateX(-50%); display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; pointer-events: none; }
          .grid-reaction { padding: 8px 14px; background: rgba(0,0,0,0.7); border-radius: 20px; font-size: 14px; }
          .layout-sidebar { display: flex; flex-direction: row; }
          .sidebar-main { flex: 1; display: flex; align-items: center; justify-content: center; padding: 16px; min-width: 0; }
          .sidebar-main .tile { max-width: 100%; width: 100%; max-width: 800px; aspect-ratio: 16/10; }
          .sidebar-rest { width: 200px; flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; padding: 12px; overflow-y: auto; border-left: 1px solid var(--border); background: var(--surface); }
          .sidebar-rest .tile { width: 100%; aspect-ratio: 16/10; max-width: none; }
        `}</style>
      </div>
    );
  }

  return null;
}
