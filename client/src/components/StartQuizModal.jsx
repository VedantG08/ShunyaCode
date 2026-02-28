/**
 * Start Quiz modal: question, answer options, correct answer(s), time limit.
 * UI-only; quiz broadcast would use socket events.
 */
import { useState } from "react";

const MIN_TIME = 15;
const MAX_TIME = 300;
const TIME_STEP = 15;

export default function StartQuizModal({ onClose, onStart }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState([{ text: "", correct: false }, { text: "", correct: false }]);
  const [multipleCorrect, setMultipleCorrect] = useState(false);
  const [timeSeconds, setTimeSeconds] = useState(60);

  const addOption = () => {
    if (options.length < 6) setOptions((o) => [...o, { text: "", correct: false }]);
  };

  const setOption = (i, text, correct) => {
    setOptions((o) => {
      const next = [...o];
      next[i] = { ...next[i], text: text ?? next[i].text, correct: correct ?? next[i].correct };
      return next;
    });
  };

  const toggleCorrect = (i) => {
    setOptions((o) => {
      if (multipleCorrect) {
        return o.map((opt, j) => (j === i ? { ...opt, correct: !opt.correct } : opt));
      }
      return o.map((opt, j) => ({ ...opt, correct: j === i ? !o[i].correct : false }));
    });
  };

  const hasCorrect = options.some((o) => o.correct);

  const handleStart = () => {
    const q = question.trim();
    const opts = options.map((o) => o.text.trim()).filter(Boolean);
    if (q && opts.length >= 2 && hasCorrect) {
      onStart?.({ question: q, options: opts.map((o, i) => ({ text: o, correct: options[i].correct })), timeSeconds });
    }
    onClose?.();
  };

  return (
    <div className="ip-modal-overlay" onClick={onClose}>
      <div className="ip-modal ip-modal-quiz" onClick={(e) => e.stopPropagation()}>
        <div className="ip-modal-header">
          <div>
            <h2 className="ip-modal-title">Start Quiz</h2>
            <p className="ip-modal-subtitle">Create a timed quiz for your students</p>
          </div>
          <button type="button" className="ip-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="ip-modal-body">
          <div className="ip-field">
            <label className="ip-field-label">Question Progress</label>
            <p className="ip-field-hint">0/10 Complete</p>
          </div>

          <div className="ip-field">
            <label className="ip-field-label">Quiz Question</label>
            <textarea
              className="ip-textarea"
              placeholder="What is the Pythagorean theorem?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
            />
          </div>

          <div className="ip-field">
            <div className="ip-field-row">
              <label className="ip-field-label">Answer Options ({options.filter((o) => o.text.trim()).length}/4)</label>
              <button type="button" className="ip-btn-add" onClick={addOption} disabled={options.length >= 6}>+ Add Answer</button>
            </div>
            {options.map((opt, i) => (
              <div key={i} className="ip-quiz-option-row">
                <button
                  type="button"
                  className={`ip-radio ${opt.correct ? "correct" : ""}`}
                  onClick={() => toggleCorrect(i)}
                  title="Mark as correct"
                />
                <span className="ip-option-letter">{String.fromCharCode(65 + i)}.</span>
                <input
                  type="text"
                  className="ip-input"
                  placeholder={`Answer ${String.fromCharCode(65 + i)}`}
                  value={opt.text}
                  onChange={(e) => setOption(i, e.target.value)}
                />
              </div>
            ))}
            {!hasCorrect && options.some((o) => o.text.trim()) && (
              <p className="ip-warning">Please mark at least one correct answer.</p>
            )}
          </div>

          <div className="ip-field">
            <label className="ip-field-label">Multiple Correct Answers</label>
            <p className="ip-field-desc">Allow more than one correct answer</p>
            <button
              type="button"
              className={`ip-toggle ${multipleCorrect ? "on" : ""}`}
              onClick={() => setMultipleCorrect((v) => !v)}
              role="switch"
              aria-checked={multipleCorrect}
            >
              <span className="ip-toggle-thumb" />
            </button>
          </div>

          <div className="ip-field">
            <label className="ip-field-label">Time Limit (seconds)</label>
            <div className="ip-time-range">
              <span>{MIN_TIME}s</span>
              <input
                type="range"
                min={MIN_TIME}
                max={MAX_TIME}
                step={TIME_STEP}
                value={timeSeconds}
                onChange={(e) => setTimeSeconds(Number(e.target.value))}
                className="ip-slider"
              />
              <span>{timeSeconds >= 60 ? `${Math.floor(timeSeconds / 60)}m` : `${timeSeconds}s`}</span>
            </div>
            <p className="ip-time-value">{timeSeconds}s</p>
          </div>
        </div>

        <div className="ip-modal-footer">
          <button type="button" className="ip-btn ip-btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="ip-btn ip-btn-success" onClick={handleStart} disabled={!question.trim() || options.filter((o) => o.text.trim()).length < 2 || !hasCorrect}>
            Start Quiz
          </button>
        </div>
      </div>
    </div>
  );
}
