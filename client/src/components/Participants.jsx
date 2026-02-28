export default function Participants({
  participants,
  localName,
  onClose,
  isHost,
  myId,
  onMutePeer,
  onKick,
  handRaised,
  theme,
}) {
  const isMe = (p) => p.id === myId || p.userName === localName;
  const label = theme === 'matrix' ? 'Nodes' : 'Participants';

  return (
    <div className="participants-panel">
      <div className="participants-header">
        <span>{label} ({participants.length})</span>
        <button type="button" className="participants-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <ul className="participants-list">
        {participants.map((p) => (
          <li key={p.id} className="participants-item">
            <span className="participants-dot" />
            <span className="participants-name">
              {p.userName}
              {isMe(p) && <span className="participants-you">(you)</span>}
              {handRaised instanceof Map && handRaised.get(p.id) && (
                <span className="participants-hand" title="Hand raised">✋</span>
              )}
            </span>
            {isHost && !isMe(p) && (
              <div className="participants-actions">
                <button type="button" className="participants-mute" onClick={() => onMutePeer?.(p.id)} title="Mute">Mute</button>
                <button type="button" className="participants-kick" onClick={() => onKick?.(p.id)} title="Remove">Remove</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <style>{`
        .participants-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
        }
        .participants-header {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .participants-close {
          background: none;
          color: var(--text-muted);
          font-size: 24px;
          line-height: 1;
          padding: 0 4px;
        }
        .participants-close:hover { color: var(--text); }
        .participants-list {
          list-style: none;
          margin: 0;
          padding: 12px;
          overflow-y: auto;
        }
        .participants-item {
          padding: 10px 0;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          flex-wrap: wrap;
        }
        .participants-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--success);
          flex-shrink: 0;
        }
        .participants-name { flex: 1; min-width: 0; }
        .participants-you { color: var(--text-muted); font-size: 13px; margin-left: 4px; }
        .participants-hand { margin-left: 6px; }
        .participants-actions { display: flex; gap: 6px; }
        .participants-mute, .participants-kick {
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
        }
        .participants-mute {
          background: var(--surface-hover);
          color: var(--text);
          border: 1px solid var(--border);
        }
        .participants-kick {
          background: rgba(229, 77, 77, 0.15);
          color: var(--danger);
          border: none;
        }
        .participants-kick:hover { background: rgba(229, 77, 77, 0.25); }
      `}</style>
    </div>
  );
}
