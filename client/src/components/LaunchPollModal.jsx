/**
 * Launch Poll modal: question, answer options (2–6), vote type, participation status.
 * UI-only; actual poll broadcast would use socket events.
 */
import { useState } from "react";

const MAX_OPTIONS = 6;

export default function LaunchPollModal({ participants = [], onClose, onLaunch }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [voteType, setVoteType] = useState("single");
  const [voted, setVoted] = useState(new Set());

  const addOption = () => {
    if (options.length < MAX_OPTIONS) setOptions((o) => [...o, ""]);
  };

  const setOption = (i, v) => {
    setOptions((o) => {
      const next = [...o];
      next[i] = v;
      return next;
    });
  };

  const removeOption = (i) => {
    if (options.length > 2) setOptions((o) => o.filter((_, j) => j !== i));
  };

  const handleLaunch = () => {
    const q = question.trim();
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (q && opts.length >= 2) onLaunch?.({ question: q, options: opts, voteType });
    onClose?.();
  };

  return (
    <div className="ip-modal-overlay" onClick={onClose}>
      <div className="ip-modal ip-modal-poll" onClick={(e) => e.stopPropagation()}>
        <div className="ip-modal-header">
          <div>
            <h2 className="ip-modal-title">Launch Poll</h2>
            <p className="ip-modal-subtitle">Create a live poll for your students</p>
          </div>
          <button type="button" className="ip-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="ip-modal-body">
          <div className="ip-field">
            <label className="ip-field-label">Poll Question</label>
            <input
              type="text"
              className="ip-input"
              placeholder="What topic should we cover next?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>

          <div className="ip-field">
            <div className="ip-field-row">
              <label className="ip-field-label">Answer Options</label>
              <span className="ip-field-hint">({options.filter(Boolean).length}/{MAX_OPTIONS})</span>
              <button type="button" className="ip-btn-add" onClick={addOption} disabled={options.length >= MAX_OPTIONS}>+ Add Option</button>
            </div>
            {options.map((opt, i) => (
              <div key={i} className="ip-option-row">
                <span className="ip-option-num">{i + 1}.</span>
                <input
                  type="text"
                  className="ip-input"
                  placeholder={`Option ${i + 1}`}
                  value={opt}
                  onChange={(e) => setOption(i, e.target.value)}
                />
                {options.length > 2 && (
                  <button type="button" className="ip-btn-remove" onClick={() => removeOption(i)}>Remove</button>
                )}
              </div>
            ))}
          </div>

          <div className="ip-field">
            <label className="ip-field-label">Vote Type</label>
            <div className="ip-vote-type">
              <button
                type="button"
                className={`ip-vote-btn ${voteType === "single" ? "active" : ""}`}
                onClick={() => setVoteType("single")}
              >
                Single Choice
              </button>
              <button
                type="button"
                className={`ip-vote-btn ${voteType === "multiple" ? "active" : ""}`}
                onClick={() => setVoteType("multiple")}
              >
                Multiple Choice
              </button>
            </div>
          </div>

          {participants.length > 0 && (
            <div className="ip-field">
              <label className="ip-field-label">Participation Status</label>
              <p className="ip-participation-hint">{voted.size}/{participants.length} Voted</p>
              <ul className="ip-participant-list">
                {participants.map((p) => (
                  <li key={p.participant_id} className="ip-participant-item">
                    <span>{p.name || p.participant_id?.slice(0, 8)}</span>
                    <span className={voted.has(p.participant_id) ? "ip-status-voted" : "ip-status-pending"}>
                      {voted.has(p.participant_id) ? "Voted" : "Not Voted"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="ip-modal-footer">
          <button type="button" className="ip-btn ip-btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="ip-btn ip-btn-primary" onClick={handleLaunch} disabled={!question.trim() || options.filter(Boolean).length < 2}>
            Launch Poll
          </button>
        </div>
      </div>
    </div>
  );
}
