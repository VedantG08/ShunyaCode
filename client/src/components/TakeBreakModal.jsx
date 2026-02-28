/**
 * Take Break modal: duration (5/10/15/20 min), sound notification, start break.
 * UI-only; break timer broadcast would use socket events.
 */
import { useState } from "react";

const DURATIONS = [5, 10, 15, 20];

export default function TakeBreakModal({ onClose, onStart }) {
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const handleStart = () => {
    onStart?.({ durationMinutes, soundEnabled });
    onClose?.();
  };

  return (
    <div className="ip-modal-overlay" onClick={onClose}>
      <div className="ip-modal ip-modal-break" onClick={(e) => e.stopPropagation()}>
        <div className="ip-modal-header">
          <div className="ip-modal-header-with-icon">
            <span className="ip-break-icon" aria-hidden>☕</span>
            <div>
              <h2 className="ip-modal-title">Take a Break</h2>
              <p className="ip-modal-subtitle">Give students a scheduled break</p>
            </div>
          </div>
          <button type="button" className="ip-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="ip-modal-body">
          <div className="ip-break-timer-display">
            <div className="ip-break-circle">
              <span className="ip-break-clock-icon">🕐</span>
              <span className="ip-break-time">{String(durationMinutes).padStart(2, "0")}:00</span>
              <span className="ip-break-status">Ready to Start</span>
            </div>
          </div>

          <div className="ip-field">
            <label className="ip-field-label">Break Duration (minutes)</label>
            <div className="ip-duration-btns">
              {DURATIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`ip-duration-btn ${durationMinutes === m ? "active" : ""}`}
                  onClick={() => setDurationMinutes(m)}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>

          <div className="ip-field ip-sound-field">
            <span className="ip-sound-icon" aria-hidden>🔔</span>
            <div>
              <label className="ip-field-label">Sound Notification</label>
              <p className="ip-field-desc">A gentle notification sound will play when the break ends to alert all participants to return.</p>
            </div>
            <button
              type="button"
              className={`ip-toggle ${soundEnabled ? "on" : ""}`}
              onClick={() => setSoundEnabled((v) => !v)}
              role="switch"
              aria-checked={soundEnabled}
            >
              <span className="ip-toggle-thumb" />
            </button>
          </div>
        </div>

        <div className="ip-modal-footer">
          <button type="button" className="ip-btn ip-btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="ip-btn ip-btn-break" onClick={handleStart}>
            Start Break
          </button>
        </div>
      </div>
    </div>
  );
}
