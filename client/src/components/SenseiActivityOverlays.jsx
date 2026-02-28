/**
 * Participant-facing overlays for Poll, Quiz, and Break (host starts via IntelPanel; server broadcasts to room).
 */
import { useState, useEffect, useRef } from "react";

export function PollView({ payload, socketRef, myId, isHost, onEnd }) {
  const { id: pollId, question, options, voteType } = payload || {};
  const [voted, setVoted] = useState(false);
  const [selected, setSelected] = useState(voteType === "multiple" ? [] : null);
  const [votes, setVotes] = useState([]);

  useEffect(() => {
    if (!socketRef?.current || !pollId) return;
    const s = socketRef.current;
    const onPollEnd = () => onEnd?.();
    const onVote = (v) => {
      if (v.pollId !== pollId) return;
      setVotes((prev) => {
        if (prev.some((e) => e.voterId === v.voterId)) return prev;
        return [...prev, { voterId: v.voterId, voterName: v.voterName, optionIndex: v.optionIndex, optionIndices: v.optionIndices }];
      });
    };
    s.on("sensei-poll-end", onPollEnd);
    s.on("sensei-poll-vote", onVote);
    return () => {
      s.off("sensei-poll-end", onPollEnd);
      s.off("sensei-poll-vote", onVote);
    };
  }, [pollId, socketRef, onEnd]);

  const handleVote = () => {
    if (!socketRef?.current || !pollId || voted) return;
    if (voteType === "single" && selected !== null) {
      socketRef.current.emit("sensei-poll-vote", { pollId, optionIndex: selected });
      setVoted(true);
    } else if (voteType === "multiple" && Array.isArray(selected) && selected.length > 0) {
      socketRef.current.emit("sensei-poll-vote", { pollId, optionIndices: [...selected] });
      setVoted(true);
    }
  };

  if (!payload?.question) return null;

  if (isHost) {
    const optionCounts = (options || []).map((_, i) => ({
      index: i,
      label: options[i],
      count: votes.filter((v) => (v.optionIndex !== undefined ? v.optionIndex === i : (v.optionIndices || []).includes(i))).length,
    }));
    return (
      <div className="sensei-overlay" role="dialog" aria-label="Poll results">
        <div className="sensei-overlay-card">
          <h3 className="sensei-overlay-title">Poll — Live results</h3>
          <p className="sensei-overlay-question">{question}</p>
          <div className="sensei-overlay-options sensei-overlay-options-readonly">
            {(options || []).map((opt, i) => (
              <div key={i} className="sensei-option-readonly">
                <span>{opt}</span>
                {optionCounts[i] != null && <span className="sensei-option-count">{optionCounts[i].count} vote(s)</span>}
              </div>
            ))}
          </div>
          <div className="sensei-results-section">
            <p className="sensei-results-label">Voted ({votes.length}):</p>
            <p className="sensei-results-names">{votes.length ? votes.map((v) => v.voterName || v.voterId?.slice(0, 8) || "—").join(", ") : "No votes yet."}</p>
          </div>
          <button type="button" className="sensei-overlay-btn" onClick={() => socketRef?.current?.emit("sensei-poll-end")}>
            End poll
          </button>
        </div>
        <style>{SENSEI_OVERLAY_STYLES}</style>
      </div>
    );
  }

  return (
    <div className="sensei-overlay" role="dialog" aria-label="Poll">
      <div className="sensei-overlay-card">
        <h3 className="sensei-overlay-title">Poll</h3>
        <p className="sensei-overlay-question">{question}</p>
        <div className="sensei-overlay-options">
          {options.map((opt, i) => (
            <label key={i} className="sensei-option">
              {voteType === "single" ? (
                <input
                  type="radio"
                  name="poll"
                  checked={selected === i}
                  onChange={() => setSelected(i)}
                  disabled={voted}
                />
              ) : (
                <input
                  type="checkbox"
                  checked={selected?.includes(i)}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = prev ? [...prev] : [];
                      if (next.includes(i)) return next.filter((x) => x !== i);
                      next.push(i);
                      return next.sort((a, b) => a - b);
                    })
                  }
                  disabled={voted}
                />
              )}
              <span>{opt}</span>
            </label>
          ))}
        </div>
        {!voted ? (
          <button type="button" className="sensei-overlay-btn" onClick={handleVote}>
            Submit vote
          </button>
        ) : (
          <p className="sensei-overlay-done">Vote submitted.</p>
        )}
      </div>
      <style>{SENSEI_OVERLAY_STYLES}</style>
    </div>
  );
}

function checkQuizCorrect(optionIndices, correctIndices) {
  if (!correctIndices.length) return optionIndices.length === 0;
  if (optionIndices.length !== correctIndices.length) return false;
  const set = new Set(optionIndices);
  return correctIndices.every((c) => set.has(c));
}

export function QuizView({ payload, socketRef, myId, isHost, onEnd }) {
  const { id: quizId, question, options, timeSeconds } = payload || {};
  const [selected, setSelected] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [timeLeft, setTimeLeft] = useState(timeSeconds ?? 60);
  const [submissions, setSubmissions] = useState([]);
  const startRef = useRef(Date.now());
  const intervalRef = useRef(null);

  const correctIndices = options?.map((o, i) => (o.correct ? i : null)).filter((x) => x !== null) ?? [];

  useEffect(() => {
    setTimeLeft(timeSeconds ?? 60);
    startRef.current = Date.now();
    setRevealed(false);
    setSubmitted(false);
    setSelected([]);
    setSubmissions([]);
  }, [quizId, timeSeconds]);

  useEffect(() => {
    if (!socketRef?.current || !quizId) return;
    const s = socketRef.current;
    const onAnswer = (a) => {
      if (a.quizId !== quizId) return;
      setSubmissions((prev) => {
        if (prev.some((e) => e.participantId === a.participantId)) return prev;
        return [...prev, { participantId: a.participantId, participantName: a.participantName, optionIndices: a.optionIndices || [] }];
      });
    };
    const onQuizEnd = () => {
      setRevealed(true);
      if (!isHost) setTimeout(() => onEnd?.(), 4000);
    };
    s.on("sensei-quiz-answer", onAnswer);
    s.on("sensei-quiz-end", onQuizEnd);
    return () => {
      s.off("sensei-quiz-answer", onAnswer);
      s.off("sensei-quiz-end", onQuizEnd);
    };
  }, [quizId, socketRef, onEnd, isHost]);

  useEffect(() => {
    if (isHost || revealed || timeLeft > 0) return;
    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
      const left = Math.max(0, (timeSeconds ?? 60) - elapsed);
      setTimeLeft(left);
      if (left <= 0) {
        setRevealed(true);
        if (!submitted && socketRef?.current && quizId) {
          socketRef.current.emit("sensei-quiz-answer", { quizId, optionIndices: [...selected] });
          setSubmitted(true);
        }
      }
    }, 500);
    return () => clearInterval(intervalRef.current);
  }, [timeSeconds, revealed, submitted, selected, quizId, socketRef, timeLeft, isHost]);

  useEffect(() => {
    if (isHost && quizId) {
      startRef.current = Date.now();
      const total = timeSeconds ?? 60;
      const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
        setTimeLeft(Math.max(0, total - elapsed));
      }, 500);
      return () => clearInterval(interval);
    }
  }, [isHost, quizId, timeSeconds]);

  const toggleOption = (i) => {
    if (submitted || revealed || isHost) return;
    setSelected((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort((a, b) => a - b)
    );
  };

  const handleSubmit = () => {
    if (submitted || revealed || !socketRef?.current || !quizId || isHost) return;
    socketRef.current.emit("sensei-quiz-answer", { quizId, optionIndices: [...selected] });
    setSubmitted(true);
    setRevealed(true);
  };

  const handleHostEndQuiz = () => {
    socketRef?.current?.emit("sensei-quiz-end");
    setRevealed(true);
  };

  const isCorrect =
    revealed &&
    correctIndices.length === selected.length &&
    correctIndices.every((c) => selected.includes(c));

  if (!payload?.question) return null;

  if (isHost) {
    return (
      <div className="sensei-overlay" role="dialog" aria-label="Quiz results">
        <div className="sensei-overlay-card">
          <h3 className="sensei-overlay-title">Quiz — Live results</h3>
          <p className="sensei-overlay-question">{question}</p>
          {!revealed && <p className="sensei-overlay-timer">Time left: {timeLeft}s</p>}
          <div className="sensei-overlay-options sensei-overlay-options-readonly">
            {(options || []).map((opt, i) => (
              <div key={i} className="sensei-option-readonly">
                <span>{opt.text}</span>
                {correctIndices.includes(i) && <span className="sensei-option-correct-label"> (correct)</span>}
              </div>
            ))}
          </div>
          <div className="sensei-results-section">
            <p className="sensei-results-label">Submitted ({submissions.length}):</p>
            <p className="sensei-results-names">
              {submissions.length ? submissions.map((s) => s.participantName || s.participantId?.slice(0, 8) || "—").join(", ") : "No submissions yet."}
            </p>
          </div>
          {revealed && submissions.length > 0 && (
            <div className="sensei-results-section">
              <p className="sensei-results-label">Results:</p>
              <ul className="sensei-results-list">
                {submissions.map((s, i) => {
                  const correct = checkQuizCorrect(s.optionIndices || [], correctIndices);
                  return (
                    <li key={i} className={correct ? "sensei-result-correct" : "sensei-result-wrong"}>
                      {s.participantName || s.participantId?.slice(0, 8) || "—"}: {correct ? "Correct" : "Incorrect"}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {!revealed ? (
            <button type="button" className="sensei-overlay-btn" onClick={handleHostEndQuiz}>
              End quiz
            </button>
          ) : (
            <button type="button" className="sensei-overlay-btn" onClick={() => onEnd?.()}>
              Close
            </button>
          )}
        </div>
        <style>{SENSEI_OVERLAY_STYLES}</style>
      </div>
    );
  }

  return (
    <div className="sensei-overlay" role="dialog" aria-label="Quiz">
      <div className="sensei-overlay-card">
        <h3 className="sensei-overlay-title">Quiz</h3>
        <p className="sensei-overlay-question">{question}</p>
        {!revealed && <p className="sensei-overlay-timer">Time left: {timeLeft}s</p>}
        <div className="sensei-overlay-options">
          {options.map((opt, i) => (
            <button
              key={i}
              type="button"
              className={`sensei-quiz-option ${selected.includes(i) ? "selected" : ""} ${
                revealed ? (opt.correct ? "correct" : selected.includes(i) ? "wrong" : "") : ""
              }`}
              onClick={() => toggleOption(i)}
              disabled={submitted || revealed}
            >
              <span className="sensei-option-letter">{String.fromCharCode(65 + i)}.</span>
              {opt.text}
            </button>
          ))}
        </div>
        {!submitted && !revealed && (
          <button type="button" className="sensei-overlay-btn" onClick={handleSubmit}>
            Submit answer
          </button>
        )}
        {revealed && (
          <p className={`sensei-overlay-done ${isCorrect ? "correct" : "wrong"}`}>
            {isCorrect ? "Correct!" : "Incorrect."} Correct:{" "}
            {correctIndices.map((i) => String.fromCharCode(65 + i)).join(", ")}
          </p>
        )}
      </div>
      <style>{SENSEI_OVERLAY_STYLES}</style>
    </div>
  );
}

export function BreakView({ payload, onEnd, isHost, socketRef }) {
  const { durationMinutes = 5, soundEnabled = true, startTime } = payload || {};
  const [secondsLeft, setSecondsLeft] = useState(durationMinutes * 60);
  const playedRef = useRef(false);

  useEffect(() => {
    if (!socketRef?.current || !payload) return;
    const s = socketRef.current;
    const onBreakEnd = () => onEnd?.();
    s.on("sensei-break-end", onBreakEnd);
    return () => s.off("sensei-break-end", onBreakEnd);
  }, [payload, socketRef, onEnd]);

  useEffect(() => {
    if (!startTime) return;
    const total = durationMinutes * 60 * 1000;
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const left = Math.max(0, Math.ceil((total - elapsed) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(interval);
        if (soundEnabled && !playedRef.current) {
          playedRef.current = true;
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.5);
          } catch (_) {}
        }
        setTimeout(() => onEnd?.(), 2000);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [startTime, durationMinutes, soundEnabled, onEnd]);

  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;

  const endBreakEarly = () => {
    if (isHost && socketRef?.current) socketRef.current.emit("sensei-break-end");
    onEnd?.();
  };

  if (isHost) {
    return (
      <div className="sensei-break-banner sensei-break-banner-host" role="status" aria-label="Break in progress">
        <div className="sensei-break-banner-inner">
          <span className="sensei-break-banner-icon" aria-hidden>☕</span>
          <span className="sensei-break-banner-label">Break —</span>
          <span className="sensei-break-banner-timer">
            {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
          </span>
          <span className="sensei-break-banner-hint">You can keep using the meeting. End break when ready.</span>
          <button type="button" className="sensei-break-banner-end" onClick={endBreakEarly}>
            End break
          </button>
        </div>
        <style>{SENSEI_OVERLAY_STYLES}</style>
      </div>
    );
  }

  return (
    <div className="sensei-overlay sensei-overlay-break" role="dialog" aria-label="Break">
      <div className="sensei-overlay-card">
        <span className="sensei-break-icon" aria-hidden>☕</span>
        <h3 className="sensei-overlay-title">Break time</h3>
        <p className="sensei-overlay-break-timer">
          {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
        </p>
        <p className="sensei-overlay-break-hint">Take a short break. You’ll hear a sound when it’s over.</p>
      </div>
      <style>{SENSEI_OVERLAY_STYLES}</style>
    </div>
  );
}

const SENSEI_OVERLAY_STYLES = `
  .sensei-overlay {
    position: fixed; inset: 0; z-index: 9999;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.75); padding: 20px;
  }
  .sensei-overlay-card {
    background: var(--surface, #161a20);
    border: 1px solid var(--border, #2a313c);
    border-radius: 16px;
    padding: 24px;
    max-width: 420px; width: 100%;
    box-shadow: 0 24px 48px rgba(0,0,0,0.4);
  }
  .sensei-overlay-title {
    margin: 0 0 12px; font-size: 1.1rem; font-weight: 700;
    color: var(--text, #e6e9ef);
  }
  .sensei-overlay-question {
    margin: 0 0 16px; font-size: 1rem; color: var(--text-muted, #8b92a0);
    line-height: 1.45;
  }
  .sensei-overlay-timer { margin: 0 0 12px; font-size: 0.9rem; color: var(--accent, #5b7fff); }
  .sensei-overlay-options { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
  .sensei-option {
    display: flex; align-items: center; gap: 10px; padding: 10px 12px;
    background: rgba(255,255,255,0.04); border-radius: 8px; cursor: pointer;
    border: 1px solid transparent;
  }
  .sensei-option:hover { background: rgba(255,255,255,0.06); }
  .sensei-option input[type="radio"], .sensei-option input[type="checkbox"] { accent-color: var(--accent, #5b7fff); }
  .sensei-quiz-option {
    display: flex; align-items: center; gap: 8px; padding: 12px;
    background: rgba(255,255,255,0.04); border: 1px solid var(--border, #2a313c);
    border-radius: 8px; cursor: pointer; text-align: left; font-size: 0.95rem;
    color: var(--text, #e6e9ef); font-family: inherit;
  }
  .sensei-quiz-option:hover:not(:disabled) { background: rgba(255,255,255,0.06); }
  .sensei-quiz-option.selected { border-color: var(--accent, #5b7fff); background: rgba(91,127,255,0.1); }
  .sensei-quiz-option.correct { border-color: #34c759; background: rgba(52,199,89,0.12); }
  .sensei-quiz-option.wrong { border-color: #e54d4d; background: rgba(229,77,77,0.12); }
  .sensei-quiz-option:disabled { cursor: default; }
  .sensei-option-letter { font-weight: 700; color: var(--text-muted); margin-right: 4px; }
  .sensei-overlay-btn {
    width: 100%; padding: 12px 20px;
    background: var(--accent, #5b7fff); color: white;
    border: none; border-radius: 10px; font-size: 1rem; font-weight: 600;
    cursor: pointer;
  }
  .sensei-overlay-btn:hover { background: var(--accent-hover, #4a6ae6); }
  .sensei-overlay-btn-ghost { background: transparent; color: var(--text-muted, #8b92a0); margin-top: 8px; }
  .sensei-overlay-btn-ghost:hover { background: rgba(255,255,255,0.06); }
  .sensei-overlay-options-readonly { margin-bottom: 12px; }
  .sensei-option-readonly {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 8px 12px; background: rgba(255,255,255,0.04); border-radius: 8px;
    font-size: 0.9rem; color: var(--text-muted, #8b92a0);
  }
  .sensei-option-count { font-size: 0.8rem; color: var(--accent, #5b7fff); }
  .sensei-option-correct-label { font-size: 0.8rem; color: #34c759; }
  .sensei-results-section { margin-bottom: 16px; }
  .sensei-results-label { font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin: 0 0 4px; }
  .sensei-results-names { font-size: 0.9rem; color: var(--text); margin: 0; word-break: break-word; }
  .sensei-results-list { list-style: none; margin: 0; padding: 0; font-size: 0.9rem; }
  .sensei-result-correct { color: #34c759; margin-bottom: 4px; }
  .sensei-result-wrong { color: #e54d4d; margin-bottom: 4px; }
  .sensei-overlay-done { margin: 12px 0 0; font-size: 0.9rem; color: var(--text-muted); }
  .sensei-overlay-done.correct { color: #34c759; }
  .sensei-overlay-done.wrong { color: #e54d4d; }
  .sensei-overlay-break .sensei-overlay-card { text-align: center; }
  .sensei-break-icon { font-size: 2.5rem; display: block; margin-bottom: 8px; }
  .sensei-overlay-break-timer {
    font-size: 3rem; font-weight: 700; margin: 8px 0;
    color: var(--accent, #5b7fff); font-variant-numeric: tabular-nums;
  }
  .sensei-overlay-break-hint { margin: 0; font-size: 0.85rem; color: var(--text-muted); }

  .sensei-break-banner {
    position: fixed; left: 0; right: 0; top: 0; z-index: 9998;
    background: var(--surface, #161a20);
    border-bottom: 1px solid var(--border, #2a313c);
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    padding: 10px 20px;
  }
  .sensei-break-banner-inner {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    max-width: 1200px; margin: 0 auto;
  }
  .sensei-break-banner-icon { font-size: 1.25rem; }
  .sensei-break-banner-label { font-size: 0.9rem; color: var(--text-muted, #8b92a0); }
  .sensei-break-banner-timer {
    font-size: 1.25rem; font-weight: 700; font-variant-numeric: tabular-nums;
    color: var(--accent, #5b7fff);
  }
  .sensei-break-banner-hint { font-size: 0.8rem; color: var(--text-muted); margin-right: auto; }
  .sensei-break-banner-end {
    padding: 6px 14px; font-size: 0.85rem; font-weight: 600;
    background: var(--accent, #5b7fff); color: white;
    border: none; border-radius: 8px; cursor: pointer;
  }
  .sensei-break-banner-end:hover { background: var(--accent-hover, #4a6ae6); }
`;
