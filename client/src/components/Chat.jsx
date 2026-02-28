import { useState, useRef, useEffect } from 'react';

export default function Chat({ messages, onSend, onClose }) {
  const [input, setInput] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (text && onSend) {
      onSend(text);
      setInput('');
    }
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span>Chat</span>
        <button type="button" className="chat-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <ul ref={listRef} className="chat-messages">
        {messages.length === 0 && (
          <li className="chat-empty">No messages yet.</li>
        )}
        {messages.map((m) => (
          <li key={`${m.id}-${m.ts}`} className="chat-msg">
            <strong>{m.userName}:</strong> {m.text}
          </li>
        ))}
      </ul>
      <form onSubmit={handleSubmit} className="chat-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          maxLength={2000}
          className="chat-input"
        />
        <button type="submit" className="chat-send">Send</button>
      </form>
      <style>{`
        .chat-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
        }
        .chat-header {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .chat-close {
          background: none;
          color: var(--text-muted);
          font-size: 24px;
          line-height: 1;
          padding: 0 4px;
        }
        .chat-close:hover { color: var(--text); }
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          list-style: none;
          margin: 0;
          padding: 12px;
        }
        .chat-empty { color: var(--text-muted); font-size: 14px; }
        .chat-msg {
          margin-bottom: 10px;
          font-size: 14px;
          word-break: break-word;
        }
        .chat-msg strong { margin-right: 6px; }
        .chat-form {
          padding: 12px;
          border-top: 1px solid var(--border);
          display: flex;
          gap: 8px;
        }
        .chat-input {
          flex: 1;
          padding: 10px 12px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--bg);
          color: var(--text);
          font-size: 14px;
        }
        .chat-send {
          padding: 10px 16px;
          background: var(--accent);
          color: white;
          border-radius: 8px;
          font-weight: 600;
          font-size: 14px;
        }
        .chat-send:hover { background: var(--accent-hover); }
      `}</style>
    </div>
  );
}
