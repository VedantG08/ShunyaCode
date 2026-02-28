/**
 * IntelPanel - premium analytics sidebar.
 * Layout: Class Score (top) -> Real-Time Emotion Analysis -> Engagement Heatmap -> (reserved).
 * Real-Time chart: all 9 metrics, toggleable legend, full history, 2-min visible window, horizontal scroll.
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import LaunchPollModal from "./LaunchPollModal";
import StartQuizModal from "./StartQuizModal";
import TakeBreakModal from "./TakeBreakModal";
import { exportCSV, exportPDF, exportDashboardImage, exportDashboardSummaryImage } from "../intel/exportReport";

const TWO_MIN_MS = 2 * 60 * 1000;
const EMOTION_SERIES = [
  { key: "engagement",    label: "Engagement",    color: "#a78bfa" },
  { key: "concentration", label: "Concentration", color: "#38bdf8" },
  { key: "confusion",     label: "Confusion",     color: "#f87171" },
  { key: "focus",         label: "Eye focus",     color: "#34d399" },
  { key: "distraction",   label: "Distraction",   color: "#fb923c" },
  { key: "happiness",     label: "Happiness",     color: "#fbbf24" },
  { key: "sadness",       label: "Sadness",       color: "#60a5fa" },
  { key: "surprise",      label: "Surprise",      color: "#c084fc" },
  { key: "neutral",       label: "Neutral",       color: "#94a3b8" },
];

// ------- helpers -----------------------------------------------------------
function pct(v) { return Math.max(0, Math.min(100, Number(v) || 0)); }

function primary(cur) { return Array.isArray(cur) ? cur[0] : cur; }

/**
 * Average Class Score — richer formula:
 *
 * 1. Only participants with valid face data (camera on, face detected) are included.
 *
 * 2. Weighted combination of six components (weights sum to 1):
 *    - Engagement    25%  (cognitive involvement)
 *    - Concentration 25%  (sustained attention)
 *    - (100−Confusion) 20% (clarity; confusion lowers score)
 *    - Eye focus     15%  (gaze at camera)
 *    - (100−Distraction) 10% (distraction lowers score)
 *    - Emotion       5%   (happiness + (100−sadness))/2 (positive affect)
 *
 *    score = 0.25*eng + 0.25*conc + 0.20*(100−conf) + 0.15*focus + 0.10*(100−dist) + 0.05*emotion
 *    then clamped to [0, 100].
 *
 * 3. The five bars show per-metric averages across included participants.
 */
function isFaceActive(face) {
  if (!face || typeof face !== "object") return false;
  if (face.dominant_emotion === "none") return false;
  const eng = pct(face.engagement);
  const conc = pct(face.concentration);
  const foc = pct(face.focus);
  return eng > 0 || conc > 0 || foc > 0;
}

const CLASS_SCORE_WEIGHTS = {
  engagement: 0.25,
  concentration: 0.25,
  confusionInverse: 0.20,
  focus: 0.15,
  distractionInverse: 0.10,
  emotion: 0.05,
};

function computeClassScore(participants) {
  const empty = { score: 0, engagement: 0, concentration: 0, confusion: 0, focus: 0, distraction: 0 };
  if (!participants?.length) return empty;
  let eng = 0, conc = 0, conf = 0, foc = 0, dist = 0, happy = 0, sad = 0, n = 0;
  for (const p of participants) {
    const face = primary(p.current);
    if (!isFaceActive(face)) continue;
    eng += pct(face.engagement);
    conc += pct(face.concentration);
    conf += pct(face.confusion);
    foc += pct(face.focus);
    dist += pct(face.distraction);
    happy += pct(face.happiness);
    sad += pct(face.sadness);
    n++;
  }
  if (!n) return empty;
  eng /= n; conc /= n; conf /= n; foc /= n; dist /= n; happy /= n; sad /= n;
  const emotionComponent = (happy + (100 - sad)) / 2;
  const score =
    CLASS_SCORE_WEIGHTS.engagement * eng +
    CLASS_SCORE_WEIGHTS.concentration * conc +
    CLASS_SCORE_WEIGHTS.confusionInverse * (100 - conf) +
    CLASS_SCORE_WEIGHTS.focus * foc +
    CLASS_SCORE_WEIGHTS.distractionInverse * (100 - dist) +
    CLASS_SCORE_WEIGHTS.emotion * emotionComponent;
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    engagement: Math.round(eng),
    concentration: Math.round(conc),
    confusion: Math.round(conf),
    focus: Math.round(foc),
    distraction: Math.round(dist),
  };
}

/** Full history from meeting start; each row has ts (ms), t (label), and all 9 metrics. */
function flatHistory(history) {
  const rows = [];
  for (const rec of (history || [])) {
    const face = Array.isArray(rec) ? rec[0] : rec;
    if (face && typeof face === "object") {
      const ts = face.timestamp ? new Date(face.timestamp).getTime() : 0;
      rows.push({
        ts,
        t: face.timestamp
          ? new Date(face.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
          : "",
        engagement:    pct(face.engagement),
        concentration: pct(face.concentration),
        confusion:     pct(face.confusion),
        focus:         pct(face.focus),
        distraction:   pct(face.distraction),
        happiness:     pct(face.happiness),
        sadness:       pct(face.sadness),
        surprise:      pct(face.surprise),
        neutral:       pct(face.neutral),
      });
    }
  }
  return rows;
}

const AGGREGATE_BUCKET_MS = 1000;
const METRIC_KEYS = ["engagement", "concentration", "confusion", "focus", "distraction", "happiness", "sadness", "surprise", "neutral"];

/**
 * Real-time emotion average across all participants: time-bucketed aggregation.
 * - Collects all (timestamp, metrics) from every participant's history.
 * - Buckets by AGGREGATE_BUCKET_MS (1s); for each bucket, averages each metric over all samples in that bucket.
 * - Returns same shape as flatHistory so the chart can use it (ts, t, and all 9 metrics).
 */
function aggregatedEmotionHistory(participants) {
  const points = [];
  for (const p of participants || []) {
    for (const rec of p.history || []) {
      const face = Array.isArray(rec) ? rec[0] : rec;
      if (face && typeof face === "object" && face.timestamp) {
        const ts = new Date(face.timestamp).getTime();
        points.push({
          ts,
          engagement:    pct(face.engagement),
          concentration: pct(face.concentration),
          confusion:     pct(face.confusion),
          focus:         pct(face.focus),
          distraction:   pct(face.distraction),
          happiness:     pct(face.happiness),
          sadness:       pct(face.sadness),
          surprise:      pct(face.surprise),
          neutral:       pct(face.neutral),
        });
      }
    }
  }
  if (points.length === 0) return [];

  const minTs = Math.min(...points.map((d) => d.ts));
  const maxTs = Math.max(...points.map((d) => d.ts));
  const buckets = [];
  for (let t = minTs; t <= maxTs; t += AGGREGATE_BUCKET_MS) {
    const inBucket = points.filter((d) => d.ts >= t && d.ts < t + AGGREGATE_BUCKET_MS);
    if (inBucket.length === 0) continue;
    const row = { ts: t, t: new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) };
    for (const key of METRIC_KEYS) {
      const sum = inBucket.reduce((a, d) => a + d[key], 0);
      row[key] = Math.round(sum / inBucket.length);
    }
    buckets.push(row);
  }
  return buckets;
}

const LOW_ENGAGEMENT_THRESHOLD = 40;
const ENGAGEMENT_WINDOW_5MIN_SAMPLES = 300;

/**
 * Engagement drop alert: participants with avg engagement (last 5 min) below threshold.
 * Also computes class-average drop % for the "Why this alert?" explanation.
 */
function computeEngagementDropAlert(participants) {
  const lowAttention = [];
  let classAvgRecent = 0;
  let classAvgPrevious = 0;
  let nRecent = 0;
  let nPrevious = 0;

  for (const p of participants || []) {
    const hist = p.history || [];
    if (hist.length < 10) continue;
    const recent = hist.slice(-ENGAGEMENT_WINDOW_5MIN_SAMPLES);
    const previous = hist.length >= ENGAGEMENT_WINDOW_5MIN_SAMPLES * 2
      ? hist.slice(-ENGAGEMENT_WINDOW_5MIN_SAMPLES * 2, -ENGAGEMENT_WINDOW_5MIN_SAMPLES)
      : [];

    let sum = 0;
    for (const rec of recent) {
      const face = Array.isArray(rec) ? rec[0] : rec;
      if (face && typeof face === "object") sum += pct(face.engagement);
    }
    const avgEng = recent.length ? sum / recent.length : 0;
    classAvgRecent += avgEng;
    nRecent += recent.length ? 1 : 0;

    if (previous.length) {
      let sumPrev = 0;
      for (const rec of previous) {
        const face = Array.isArray(rec) ? rec[0] : rec;
        if (face && typeof face === "object") sumPrev += pct(face.engagement);
      }
      classAvgPrevious += sumPrev / previous.length;
      nPrevious += 1;
    }

    if (avgEng < LOW_ENGAGEMENT_THRESHOLD && recent.length >= 30) {
      lowAttention.push({ name: p.name || p.participant_id?.slice(0, 8) || "—", avgEng });
    }
  }

  const avgRecent = nRecent ? classAvgRecent / (participants?.length || 1) : 0;
  const avgPrevious = nPrevious ? classAvgPrevious / nPrevious : avgRecent;
  const dropPercent = avgPrevious > 0 ? Math.round(((avgPrevious - avgRecent) / avgPrevious) * 100) : 0;
  const names = lowAttention.map((x) => x.name).join(" and ");
  const explanation = lowAttention.length > 0
    ? `AI analysis detected a ${dropPercent > 0 ? dropPercent + "%" : "noticeable"} drop in average engagement over the last 5 minutes. ${names} ${lowAttention.length === 1 ? "is" : "are"} showing signs of distraction with reduced eye contact and increased head movement. Consider re-engaging students with an interactive activity or break.`
    : "";

  return {
    active: lowAttention.length > 0,
    count: lowAttention.length,
    names,
    dropPercent: Math.max(0, dropPercent),
    explanation,
  };
}

function buildHeatmap(participants, numCols) {
  numCols = numCols || 18;
  return (participants || []).map((p) => {
    const hist = p.history || [];
    const vals = [];
    for (let i = Math.max(0, hist.length - numCols); i < hist.length; i++) {
      const face = Array.isArray(hist[i]) ? hist[i][0] : hist[i];
      vals.push(face && typeof face === "object" ? pct(face.engagement) : 0);
    }
    while (vals.length < numCols) vals.unshift(null);
    return {
      id:   p.participant_id,
      name: p.name || (p.participant_id && p.participant_id.slice(0, 8)) || "—",
      vals: vals.slice(-numCols),
    };
  });
}

function cellColor(v) {
  if (v === null) return "rgba(255,255,255,0.04)";
  if (v >= 70)   return "#00c85a";
  if (v >= 40)   return "#f59e0b";
  return "#ef4444";
}

function scoreLabel(s) {
  if (s >= 70) return "Good";
  if (s >= 40) return "Fair";
  return "Low";
}

function scoreBadgeColor(s) {
  if (s >= 70) return { bg: "rgba(0,200,90,0.18)", fg: "#00c85a" };
  if (s >= 40) return { bg: "rgba(245,158,11,0.18)", fg: "#f59e0b" };
  return { bg: "rgba(239,68,68,0.18)", fg: "#ef4444" };
}


const TOOLTIP_STYLE = {
  background: "rgba(8,10,20,0.96)",
  border: "1px solid rgba(99,179,237,0.3)",
  borderRadius: "6px",
  color: "#e2e8f0",
  fontSize: "11px",
  padding: "6px 10px",
};


// ------- sub-components ---------------------------------------------------
function ScoreRing({ score, ringLabel = "CLASS SCORE", isMatrix }) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const badge = scoreBadgeColor(score);
  const strokeColor = isMatrix ? (score >= 40 ? "#00FF66" : "#FF003C") : badge.fg;
  return (
    <div className="ip-ring-wrap">
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} fill="none" stroke={isMatrix ? "rgba(0,255,102,0.12)" : "rgba(99,179,237,0.1)"} strokeWidth="8" />
        <circle
          cx="55" cy="55" r={r} fill="none"
          stroke={strokeColor} strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform="rotate(-90 55 55)"
          style={{ transition: "stroke-dasharray 0.8s cubic-bezier(.4,0,.2,1)" }}
        />
        <text x="55" y="49" textAnchor="middle" fill={badge.fg} fontSize="22" fontWeight="700" fontFamily="Orbitron, sans-serif">{score}</text>
        <text className="ip-ring-label" x="55" y="64" textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="9" fontFamily="Rajdhani, sans-serif" letterSpacing="1">{ringLabel}</text>
      </svg>
      <span className="ip-ring-badge" style={{ background: badge.bg, color: badge.fg }}>{scoreLabel(score)}</span>
    </div>
  );
}

function MetricBar({ label, value, color }) {
  return (
    <div className="ip-mbar">
      <div className="ip-mbar-head">
        <span className="ip-mbar-label">{label}</span>
        <span className="ip-mbar-val" style={{ color }}>{value}%</span>
      </div>
      <div className="ip-mbar-track">
        <div className="ip-mbar-fill" style={{ width: value + "%", background: color }} />
      </div>
    </div>
  );
}

function EmotionLegend({ visible, onToggle }) {
  return (
    <div className="ip-legend">
      {EMOTION_SERIES.map(({ key, label, color }) => (
        <button
          key={key}
          type="button"
          className={`ip-legend-item ${visible.has(key) ? "" : "ip-legend-item--off"}`}
          onClick={() => onToggle(key)}
        >
          <span className="ip-legend-dot" style={{ background: color }} />
          {label}
        </button>
      ))}
    </div>
  );
}

// ------- main component ---------------------------------------------------
const DEFAULT_VISIBLE = new Set(EMOTION_SERIES.map((s) => s.key));

const AGGREGATE_VALUE = "";

export default function IntelPanel({ participants, theme = "dark" }) {
  const [selectedId, setSelectedId] = useState(AGGREGATE_VALUE);
  const [visibleSeries, setVisibleSeries] = useState(() => new Set(DEFAULT_VISIBLE));
  const [showWhyAlert, setShowWhyAlert] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [breakOpen, setBreakOpen] = useState(false);
  const chartScrollRef = useRef(null);
  const dashboardRef = useRef(null);
  const prevCountRef = useRef(participants?.length ?? 0);
  const [joinRipple, setJoinRipple] = useState(false);

  useEffect(() => {
    const n = participants?.length ?? 0;
    if (n > prevCountRef.current && prevCountRef.current >= 0) {
      setJoinRipple(true);
      const t = setTimeout(() => setJoinRipple(false), 1600);
      prevCountRef.current = n;
      return () => clearTimeout(t);
    }
    prevCountRef.current = n;
  }, [participants?.length]);

  const engagementDropAlert = useMemo(() => computeEngagementDropAlert(participants), [participants]);
  const selectedParticipant = useMemo(() => {
    if (selectedId === AGGREGATE_VALUE || !selectedId) return null;
    return participants?.find((p) => p.participant_id === selectedId) ?? null;
  }, [participants, selectedId]);

  const fullHistory = useMemo(() => {
    if (selectedId === AGGREGATE_VALUE) return aggregatedEmotionHistory(participants);
    return flatHistory(selectedParticipant?.history);
  }, [selectedId, selectedParticipant, participants]);
  const classScore = useMemo(() => computeClassScore(participants), [participants]);
  const heatmap = useMemo(() => buildHeatmap(participants), [participants]);
  const hasData = participants?.some((p) => (p.history?.length ?? 0) > 0);
  const badge = scoreBadgeColor(classScore.score);

  const totalDurationMs = useMemo(() => {
    if (fullHistory.length < 2) return 0;
    const first = fullHistory[0].ts;
    const last = fullHistory[fullHistory.length - 1].ts;
    return last - first || TWO_MIN_MS;
  }, [fullHistory]);

  const chartVisibleWidth = 480;
  const chartTotalWidth = useMemo(() => {
    const slots = totalDurationMs / TWO_MIN_MS;
    return Math.max(chartVisibleWidth, Math.ceil(slots) * chartVisibleWidth);
  }, [totalDurationMs]);

  const toggleSeries = (key) => {
    setVisibleSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    const el = chartScrollRef.current;
    if (!el || fullHistory.length === 0) return;
    const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 30;
    if (atEnd) el.scrollLeft = el.scrollWidth - el.clientWidth;
  }, [fullHistory.length]);

  const themeClass = theme && theme !== "dark" ? `ip-theme-${theme.replace(/\s+/g, "-")}` : "";
  const isMatrix = theme === "matrix";
  const labels = {
    headerTitle: isMatrix ? "SYSTEM STATUS" : "AI Analytics",
    classScore: isMatrix ? "SIGNAL INTEGRITY" : "Average Class Score",
    ringLabel: isMatrix ? "SIGNAL" : "CLASS SCORE",
    emotionChart: isMatrix ? "SIGNAL STREAM" : "Real-Time Emotion Analysis",
    heatmap: isMatrix ? "NODE SIGNAL MAP" : "Engagement Heatmap",
    alertTitle: isMatrix ? "SYSTEM BREACH" : "Engagement Drop Detected",
    allNodes: isMatrix ? "All nodes (avg)" : "All (average)",
    noParticipants: isMatrix ? "No nodes yet." : "No participants yet.",
    waitingNodes: isMatrix ? "Waiting for nodes…" : "Waiting for participants…",
    whyAlert: isMatrix ? "Why this breach?" : "Why this alert?",
    collecting: isMatrix ? "Acquiring signal…" : "Collecting data…",
  };
  return (
    <div className={`ip-root ${themeClass} ${isMatrix && joinRipple ? "ip-join-ripple" : ""}`}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700&family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* ── header ── */}
      <div className="ip-header">
        <span className="ip-header-title">{labels.headerTitle}</span>
        <span className="ip-header-live">{isMatrix ? "ENGAGEMENT ACTIVE" : "LIVE"}</span>
      </div>

      {/* ── scrollable body ── */}
      <div className="ip-body">
        {isMatrix && <div className="ip-matrix-rain" aria-hidden />}
        <div className="ip-body-inner">
        {!participants?.length ? (
          <div className="ip-empty-state">
            <p>{labels.noParticipants}</p>
            <p className="ip-empty-sub">{isMatrix ? "Share the invite link to begin signal acquisition." : "Share the invite link to begin collecting analytics."}</p>
          </div>
        ) : (
          <div ref={dashboardRef} className="ip-dashboard-capture">
            {/* 1. Class Score */}
            <div className="ip-card">
              <div className="ip-card-title">{labels.classScore}</div>
              <div className="ip-score-layout">
                <ScoreRing score={classScore.score} ringLabel={labels.ringLabel} isMatrix={isMatrix} />
                <div className="ip-score-bars">
                  <MetricBar label="Engagement"    value={classScore.engagement}    color="#a78bfa" />
                  <MetricBar label="Concentration" value={classScore.concentration} color="#38bdf8" />
                  <MetricBar label="Confusion"     value={classScore.confusion}     color="#f87171" />
                  <MetricBar label="Eye focus"    value={classScore.focus}         color="#34d399" />
                  <MetricBar label="Distraction"  value={classScore.distraction}  color="#fb923c" />
                </div>
              </div>
            </div>

            {/* 2. Real-Time Emotion Analysis */}
            <div className="ip-card">
              <div className="ip-card-title-row">
                <span className="ip-card-title">{labels.emotionChart}</span>
                <span className="ip-live-dot" />
              </div>
              <div className="ip-selector-row">
                <select
                  className="ip-selector"
                  value={selectedId ?? AGGREGATE_VALUE}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  <option value={AGGREGATE_VALUE}>{labels.allNodes}</option>
                  {(participants || []).map((p) => (
                    <option key={p.participant_id ?? p.name ?? ''} value={p.participant_id ?? ''}>
                      {p.name || (p.participant_id && p.participant_id.slice(0, 8)) || "—"}
                    </option>
                  ))}
                </select>
              </div>
              {fullHistory.length > 1 ? (
                <div className="ip-chart-wrap">
                  <p className="ip-chart-hint">Latest 2 min visible; scroll left to see older data. Click legend to toggle series.</p>
                  <div ref={chartScrollRef} className="ip-chart-scroll">
                    <div className="ip-chart-inner" style={{ width: chartTotalWidth }}>
                      <LineChart width={chartTotalWidth} height={180} data={fullHistory} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="4 4" stroke="rgba(99,179,237,0.08)" />
                        <XAxis dataKey="t" tick={{ fontSize: 9, fill: "#64748b" }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#94a3b8", fontSize: "10px" }} />
                        {EMOTION_SERIES.filter((s) => visibleSeries.has(s.key)).map((s) => (
                          <Line key={s.key} type="monotoneX" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} name={s.label} isAnimationActive={false} />
                        ))}
                      </LineChart>
                    </div>
                  </div>
                  <EmotionLegend visible={visibleSeries} onToggle={toggleSeries} />
                </div>
              ) : (
                <p className="ip-waiting">{labels.collecting}</p>
              )}
            </div>

            {/* 3. Engagement Heatmap */}
            <div className="ip-card">
              <div className="ip-card-title-row">
                <span className="ip-card-title">{labels.heatmap}</span>
                <div className="ip-heat-legend">
                  <span className="ip-heat-swatch" style={{ background: "#ef4444" }} />
                  <span className="ip-heat-text">Low</span>
                  <span className="ip-heat-swatch" style={{ background: "#f59e0b" }} />
                  <span className="ip-heat-text">Mid</span>
                  <span className="ip-heat-swatch" style={{ background: "#00c85a" }} />
                  <span className="ip-heat-text">High</span>
                </div>
              </div>
              {heatmap.length ? (
                <div className="ip-heatmap">
                  {heatmap.map((row) => (
                    <div key={row.id} className="ip-heatmap-row">
                      <span className="ip-heatmap-name">{row.name}</span>
                      <div className="ip-heatmap-cells">
                        {row.vals.map((v, j) => {
                          const level = v === null ? "none" : v >= 66 ? "high" : v >= 33 ? "mid" : "low";
                          return (
                            <div
                              key={j}
                              className={`ip-heatmap-cell ${isMatrix ? `ip-heat-${level}` : ""}`}
                              style={{ background: cellColor(v) }}
                              title={v !== null ? v + "%" : "no data"}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="ip-waiting">{labels.waitingNodes}</p>
              )}
            </div>

            {/* 4. Engagement Drop Alert + Actions */}
            <div className={`ip-card ip-card-alert ${isMatrix && engagementDropAlert.active ? "ip-alert-glitch" : ""}`}>
              <div className="ip-alert-header">
                <span className="ip-alert-icon" aria-hidden>⚠</span>
                <div>
                  <h3 className="ip-alert-title">{labels.alertTitle}</h3>
                  <p className="ip-alert-sub">
                    {engagementDropAlert.active
                      ? isMatrix
                        ? `${engagementDropAlert.count} node${engagementDropAlert.count > 1 ? "s" : ""} signal degraded · Last 5 min`
                        : `${engagementDropAlert.count} student${engagementDropAlert.count > 1 ? "s" : ""} showing low attention · Last 5 min`
                      : isMatrix ? "Signal integrity within range." : "No drop detected. Metrics are within range."}
                  </p>
                </div>
              </div>
              {engagementDropAlert.active && (
                <>
                  <button
                    type="button"
                    className="ip-why-alert"
                    onClick={() => setShowWhyAlert((v) => !v)}
                  >
                    <span className="ip-why-chevron">{showWhyAlert ? "▾" : "▸"}</span>
                    {labels.whyAlert}
                  </button>
                  {showWhyAlert && engagementDropAlert.explanation && (
                    <div className="ip-why-body">{engagementDropAlert.explanation}</div>
                  )}
                </>
              )}
              <div className="ip-action-btns">
                <button type="button" className="ip-action-btn ip-action-poll" onClick={() => setPollOpen(true)}>
                  Launch Poll
                </button>
                <button type="button" className="ip-action-btn ip-action-quiz" onClick={() => setQuizOpen(true)}>
                  Start Quiz
                </button>
                <button type="button" className="ip-action-btn ip-action-break" onClick={() => setBreakOpen(true)}>
                  Take Break
                </button>
              </div>
            </div>

            {/* Export data */}
            <div className="ip-card ip-export-card">
              <div className="ip-card-title">Export data</div>
              <div className="ip-export-btns">
                <button
                  type="button"
                  className="ip-export-btn"
                  onClick={() => exportCSV(participants)}
                  disabled={!hasData}
                  title="Download raw data as CSV"
                >
                  CSV
                </button>
                <button
                  type="button"
                  className="ip-export-btn"
                  onClick={() =>
                    exportPDF(
                      participants,
                      classScore,
                      heatmap,
                      aggregatedEmotionHistory(participants),
                      engagementDropAlert
                    )
                  }
                  disabled={!hasData}
                  title="Professional PDF with insights"
                >
                  PDF
                </button>
                <button
                  type="button"
                  className="ip-export-btn"
                  onClick={() =>
                    exportDashboardSummaryImage(
                      participants,
                      classScore,
                      heatmap,
                      aggregatedEmotionHistory(participants)
                    )
                  }
                  disabled={!hasData}
                  title="Sensei dashboard summary image with overall metrics and start-to-end time graph"
                >
                  Dashboard image
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      {pollOpen && (
        <LaunchPollModal
          participants={participants}
          onClose={() => setPollOpen(false)}
          onLaunch={(payload) => { console.log("Launch poll", payload); setPollOpen(false); }}
        />
      )}
      {quizOpen && (
        <StartQuizModal
          onClose={() => setQuizOpen(false)}
          onStart={(payload) => { console.log("Start quiz", payload); setQuizOpen(false); }}
        />
      )}
      {breakOpen && (
        <TakeBreakModal
          onClose={() => setBreakOpen(false)}
          onStart={(payload) => { console.log("Start break", payload); setBreakOpen(false); }}
        />
      )}

      <style>{`
        .ip-root {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100%;
          background: #080c14;
          color: #e2e8f0;
          font-family: "Rajdhani", "Segoe UI", sans-serif;
          overflow: hidden;
        }

        /* header */
        .ip-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(99,179,237,0.15);
          flex-shrink: 0;
          background: rgba(255,255,255,0.02);
        }
        .ip-header-title {
          font-family: "Orbitron", sans-serif;
          font-size: 0.85rem;
          font-weight: 600;
          letter-spacing: 2px;
          color: #e2e8f0;
        }
        .ip-header-live {
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 1.5px;
          color: #ef4444;
          background: rgba(239,68,68,0.15);
          border: 1px solid rgba(239,68,68,0.4);
          padding: 2px 8px;
          border-radius: 4px;
        }

        /* body */
        .ip-body {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          position: relative;
        }
        .ip-body-inner { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 12px; }
        .ip-body::-webkit-scrollbar { width: 4px; }
        .ip-body::-webkit-scrollbar-track { background: transparent; }
        .ip-body::-webkit-scrollbar-thumb { background: rgba(99,179,237,0.2); border-radius: 4px; }

        /* card */
        .ip-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(99,179,237,0.12);
          border-radius: 10px;
          padding: 14px;
          transition: border-color 0.2s;
        }
        .ip-card:hover { border-color: rgba(99,179,237,0.25); }
        .ip-card-title {
          font-family: "Orbitron", sans-serif;
          font-size: 0.65rem;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: #94a3b8;
          margin-bottom: 12px;
        }
        .ip-card-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .ip-card-title-row .ip-card-title { margin-bottom: 0; }

        /* live dot */
        .ip-live-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: #ef4444;
          box-shadow: 0 0 6px #ef4444;
          animation: ip-pulse 1.8s ease-in-out infinite;
        }
        @keyframes ip-pulse {
          0%,100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }

        /* class score */
        .ip-score-layout { display: flex; align-items: center; gap: 14px; }
        .ip-ring-wrap { display: flex; flex-direction: column; align-items: center; gap: 6px; flex-shrink: 0; }
        .ip-ring-badge {
          font-size: 0.75rem; font-weight: 700; letter-spacing: 0.5px;
          padding: 2px 10px; border-radius: 4px;
        }
        .ip-score-bars { flex: 1; display: flex; flex-direction: column; gap: 9px; }
        .ip-mbar {}
        .ip-mbar-head { display: flex; justify-content: space-between; margin-bottom: 4px; }
        .ip-mbar-label { font-size: 0.8rem; color: #94a3b8; }
        .ip-mbar-val { font-size: 0.8rem; font-weight: 700; }
        .ip-mbar-track {
          height: 8px;
          background: rgba(255,255,255,0.06);
          border-radius: 20px;
          overflow: hidden;
        }
        .ip-mbar-fill {
          height: 100%;
          border-radius: 20px;
          min-width: 4px;
          transition: width 0.7s cubic-bezier(.4,0,.2,1);
          box-shadow: 0 0 6px currentColor;
          opacity: 0.9;
        }

        /* selector */
        .ip-selector-row { margin-bottom: 10px; }
        .ip-selector {
          width: 100%;
          padding: 6px 10px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(99,179,237,0.2);
          border-radius: 6px;
          color: #e2e8f0;
          font-family: "Rajdhani", sans-serif;
          font-size: 0.85rem;
        }

        /* chart */
        .ip-chart-wrap { }
        .ip-chart-hint {
          font-size: 0.7rem; color: #64748b; margin: -4px 0 8px;
        }
        .ip-chart-scroll {
          overflow-x: auto;
          overflow-y: hidden;
          margin: 0 -4px;
          border-radius: 6px;
        }
        .ip-chart-scroll::-webkit-scrollbar { height: 6px; }
        .ip-chart-scroll::-webkit-scrollbar-track { background: rgba(99,179,237,0.06); border-radius: 3px; }
        .ip-chart-scroll::-webkit-scrollbar-thumb { background: rgba(99,179,237,0.25); border-radius: 3px; }
        .ip-chart-inner { min-width: 0; }
        .ip-legend {
          display: flex; gap: 10px; justify-content: center;
          margin-top: 10px; flex-wrap: wrap;
        }
        .ip-legend-item {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 0.7rem; color: #94a3b8;
          background: none; border: none; cursor: pointer; padding: 2px 6px;
          border-radius: 4px; font-family: inherit;
          transition: opacity 0.2s;
        }
        .ip-legend-item:hover { opacity: 0.9; }
        .ip-legend-item--off { opacity: 0.4; text-decoration: line-through; }
        .ip-legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

        /* heatmap */
        .ip-heat-legend { display: flex; align-items: center; gap: 5px; }
        .ip-heat-swatch { width: 10px; height: 10px; border-radius: 2px; }
        .ip-heat-text { font-size: 0.7rem; color: #64748b; margin-right: 4px; }
        .ip-heatmap { display: flex; flex-direction: column; gap: 5px; }
        .ip-heatmap-row { display: flex; align-items: center; gap: 8px; }
        .ip-heatmap-name { width: 56px; font-size: 0.75rem; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; }
        .ip-heatmap-cells { flex: 1; display: flex; gap: 2px; }
        .ip-heatmap-cell { flex: 1; height: 16px; border-radius: 3px; transition: opacity 0.3s; }
        .ip-heatmap-cell:hover { opacity: 0.75; }

        /* reserved */
        .ip-card-reserved { min-height: 80px; }
        .ip-reserved-placeholder { height: 48px; border-radius: 6px; background: rgba(255,255,255,0.02); border: 1px dashed rgba(99,179,237,0.1); }

        /* empty */
        .ip-empty-state { text-align: center; padding: 40px 20px; color: #64748b; font-size: 0.9rem; }
        .ip-empty-sub { font-size: 0.8rem; margin-top: 6px; }
        .ip-waiting { font-size: 0.8rem; color: #64748b; text-align: center; padding: 20px 0; font-style: italic; }

        /* export */
        .ip-export-card { margin-top: 4px; }
        .ip-export-card .ip-card-title { margin-bottom: 12px; }
        .ip-export-btns {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 10px;
        }
        .ip-dashboard-capture { outline: none; }
        .ip-export-btn {
          padding: 10px 12px;
          background: rgba(99,179,237,0.08);
          border: 1px solid rgba(99,179,237,0.25);
          border-radius: 8px;
          color: #94a3b8;
          font-family: "Rajdhani", sans-serif;
          font-weight: 600;
          font-size: 0.8rem;
          cursor: pointer;
          letter-spacing: 0.5px;
          transition: all 0.2s;
          text-align: center;
        }
        .ip-export-btn:hover:not(:disabled) { background: rgba(99,179,237,0.15); color: #e2e8f0; border-color: rgba(99,179,237,0.5); }
        .ip-export-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        /* Engagement drop alert */
        .ip-card-alert {
          border-color: rgba(234,179,8,0.35);
          background: rgba(234,179,8,0.06);
        }
        .ip-alert-header { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; }
        .ip-alert-icon { font-size: 1.4rem; color: #eab308; flex-shrink: 0; }
        .ip-alert-title { font-size: 0.9rem; font-weight: 700; color: #e2e8f0; margin: 0 0 4px; }
        .ip-alert-sub { font-size: 0.8rem; color: #94a3b8; margin: 0; }
        .ip-why-alert {
          display: flex; align-items: center; gap: 6px;
          background: none; border: none; color: #f59e0b; font-size: 0.8rem; cursor: pointer;
          padding: 6px 0; margin-bottom: 8px; font-family: inherit;
        }
        .ip-why-alert:hover { text-decoration: underline; }
        .ip-why-chevron { font-size: 0.7rem; }
        .ip-why-body {
          font-size: 0.78rem; color: #cbd5e1; line-height: 1.4;
          padding: 10px 12px; margin-bottom: 12px; border-radius: 6px;
          background: rgba(0,0,0,0.2); border: 1px solid rgba(234,179,8,0.2);
        }
        .ip-action-btns { display: flex; flex-wrap: wrap; gap: 8px; }
        .ip-action-btn {
          flex: 1; min-width: 100px; padding: 10px 12px; border-radius: 8px;
          font-size: 0.85rem; font-weight: 600; font-family: inherit; cursor: pointer;
          border: none; color: #fff; transition: opacity 0.2s;
        }
        .ip-action-btn:hover { opacity: 0.9; }
        .ip-action-poll { background: #7c3aed; }
        .ip-action-quiz { background: #059669; }
        .ip-action-break { background: #c2410c; }

        /* Modals */
        .ip-modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.7);
          display: flex; align-items: center; justify-content: center;
          z-index: 10000; padding: 20px;
        }
        .ip-modal {
          background: #0f172a; border: 1px solid rgba(99,179,237,0.2);
          border-radius: 12px; max-width: 440px; width: 100%;
          max-height: 90vh; overflow: hidden; display: flex; flex-direction: column;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
        .ip-modal-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          padding: 16px 18px; border-bottom: 1px solid rgba(99,179,237,0.15);
        }
        .ip-modal-header-with-icon { display: flex; align-items: flex-start; gap: 12px; }
        .ip-modal-title { font-size: 1.1rem; font-weight: 700; color: #e2e8f0; margin: 0 0 4px; }
        .ip-modal-subtitle { font-size: 0.8rem; color: #94a3b8; margin: 0; }
        .ip-modal-close {
          width: 32px; height: 32px; border-radius: 50%; border: none;
          background: #b91c1c; color: #fff; font-size: 1.2rem; cursor: pointer;
          line-height: 1; padding: 0; flex-shrink: 0;
        }
        .ip-modal-close:hover { background: #dc2626; }
        .ip-modal-body { padding: 16px 18px; overflow-y: auto; flex: 1; }
        .ip-modal-footer {
          display: flex; gap: 10px; justify-content: flex-end;
          padding: 14px 18px; border-top: 1px solid rgba(99,179,237,0.15);
        }
        .ip-field { margin-bottom: 16px; }
        .ip-field-label { display: block; font-size: 0.8rem; font-weight: 600; color: #94a3b8; margin-bottom: 6px; }
        .ip-field-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
        .ip-field-hint, .ip-field-desc { font-size: 0.75rem; color: #64748b; margin: 0 0 6px; }
        .ip-input, .ip-textarea {
          width: 100%; padding: 8px 12px; background: rgba(255,255,255,0.05);
          border: 1px solid rgba(99,179,237,0.2); border-radius: 6px;
          color: #e2e8f0; font-size: 0.9rem; font-family: inherit;
        }
        .ip-textarea { resize: vertical; min-height: 60px; }
        .ip-btn-add { padding: 6px 12px; background: #059669; color: #fff; border: none; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
        .ip-btn-add:disabled { opacity: 0.5; cursor: not-allowed; }
        .ip-option-row, .ip-quiz-option-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .ip-option-num, .ip-option-letter { font-size: 0.85rem; color: #94a3b8; min-width: 20px; }
        .ip-btn-remove { padding: 4px 8px; font-size: 0.75rem; background: transparent; color: #f87171; border: 1px solid rgba(248,113,113,0.4); border-radius: 4px; cursor: pointer; }
        .ip-vote-type { display: flex; gap: 8px; }
        .ip-vote-btn { padding: 8px 14px; border-radius: 6px; font-size: 0.85rem; border: 1px solid rgba(99,179,237,0.3); background: rgba(255,255,255,0.05); color: #e2e8f0; cursor: pointer; }
        .ip-vote-btn.active { background: #7c3aed; border-color: #7c3aed; color: #fff; }
        .ip-participant-list { list-style: none; margin: 0; padding: 0; max-height: 120px; overflow-y: auto; }
        .ip-participant-item { display: flex; justify-content: space-between; padding: 6px 0; font-size: 0.85rem; }
        .ip-status-voted { color: #34d399; }
        .ip-status-pending { color: #f59e0b; }
        .ip-warning { font-size: 0.8rem; color: #f59e0b; margin: 4px 0 0; }
        .ip-radio { width: 20px; height: 20px; border-radius: 50%; border: 2px solid #64748b; background: transparent; cursor: pointer; flex-shrink: 0; }
        .ip-radio.correct { background: #34d399; border-color: #34d399; }
        .ip-toggle { width: 44px; height: 24px; border-radius: 12px; background: #334155; border: none; cursor: pointer; position: relative; flex-shrink: 0; }
        .ip-toggle.on { background: #059669; }
        .ip-toggle-thumb { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform 0.2s; }
        .ip-toggle.on .ip-toggle-thumb { transform: translateX(20px); }
        .ip-time-range { display: flex; align-items: center; gap: 10px; }
        .ip-slider { flex: 1; accent-color: #f59e0b; }
        .ip-time-value { font-size: 0.9rem; font-weight: 600; color: #f59e0b; margin: 6px 0 0; }
        .ip-break-timer-display { display: flex; justify-content: center; margin-bottom: 20px; }
        .ip-break-circle {
          width: 140px; height: 140px; border-radius: 50%;
          border: 4px solid #c2410c; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 4px;
        }
        .ip-break-clock-icon { font-size: 1.2rem; }
        .ip-break-time { font-size: 1.8rem; font-weight: 700; color: #e2e8f0; }
        .ip-break-status { font-size: 0.75rem; color: #f59e0b; }
        .ip-break-icon { font-size: 1.5rem; }
        .ip-duration-btns { display: flex; gap: 8px; flex-wrap: wrap; }
        .ip-duration-btn { padding: 10px 20px; border-radius: 8px; font-size: 0.9rem; font-weight: 600; border: 1px solid #475569; background: rgba(255,255,255,0.05); color: #94a3b8; cursor: pointer; }
        .ip-duration-btn.active { background: #c2410c; border-color: #c2410c; color: #fff; }
        .ip-sound-field { display: flex; align-items: flex-start; gap: 12px; }
        .ip-sound-icon { font-size: 1.2rem; flex-shrink: 0; }
        .ip-btn { padding: 10px 18px; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; border: none; }
        .ip-btn-secondary { background: #334155; color: #e2e8f0; }
        .ip-btn-primary { background: #7c3aed; color: #fff; }
        .ip-btn-success { background: #059669; color: #fff; }
        .ip-btn-break { background: #c2410c; color: #fff; }

        /* Light theme */
        .ip-root.ip-theme-light .ip-ring-label { fill: rgba(0,0,0,0.65); }
        .ip-root.ip-theme-light {
          background: #e2e8f0;
          color: #1e293b;
        }
        .ip-root.ip-theme-light .ip-header {
          background: #f1f5f9;
          border-bottom-color: #cbd5e1;
        }
        .ip-root.ip-theme-light .ip-header-title { color: #334155; }
        .ip-root.ip-theme-light .ip-body::-webkit-scrollbar-thumb { background: rgba(15,23,42,0.2); }
        .ip-root.ip-theme-light .ip-card {
          background: rgba(255,255,255,0.7);
          border-color: #cbd5e1;
        }
        .ip-root.ip-theme-light .ip-card:hover { border-color: #94a3b8; }
        .ip-root.ip-theme-light .ip-card-title,
        .ip-root.ip-theme-light .ip-mbar-label,
        .ip-root.ip-theme-light .ip-legend-item,
        .ip-root.ip-theme-light .ip-heatmap-name { color: #64748b; }
        .ip-root.ip-theme-light .ip-mbar-track { background: rgba(0,0,0,0.08); }
        .ip-root.ip-theme-light .ip-selector {
          background: #fff;
          border-color: #cbd5e1;
          color: #334155;
        }
        .ip-root.ip-theme-light .ip-chart-scroll::-webkit-scrollbar-track { background: rgba(0,0,0,0.06); }
        .ip-root.ip-theme-light .ip-chart-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.2); }
        .ip-root.ip-theme-light .ip-chart-hint,
        .ip-root.ip-theme-light .ip-heat-text,
        .ip-root.ip-theme-light .ip-empty-state,
        .ip-root.ip-theme-light .ip-empty-sub,
        .ip-root.ip-theme-light .ip-waiting { color: #64748b; }
        .ip-root.ip-theme-light .ip-export-btn {
          background: #f1f5f9;
          border-color: #94a3b8;
          color: #475569;
        }
        .ip-root.ip-theme-light .ip-export-btn:hover:not(:disabled) { background: #e2e8f0; color: #1e293b; border-color: #64748b; }
        .ip-root.ip-theme-light .ip-card-alert {
          border-color: rgba(234,179,8,0.5);
          background: rgba(234,179,8,0.1);
        }
        .ip-root.ip-theme-light .ip-alert-title { color: #1e293b; }
        .ip-root.ip-theme-light .ip-alert-sub { color: #64748b; }
        .ip-root.ip-theme-light .ip-why-body {
          background: rgba(0,0,0,0.06);
          border-color: rgba(234,179,8,0.3);
          color: #475569;
        }
        .ip-root.ip-theme-light .ip-modal-overlay { background: rgba(0,0,0,0.4); }
        .ip-root.ip-theme-light .ip-modal {
          background: #f8fafc;
          border-color: #cbd5e1;
          box-shadow: 0 20px 60px rgba(0,0,0,0.15);
        }
        .ip-root.ip-theme-light .ip-modal-header { border-bottom-color: #e2e8f0; }
        .ip-root.ip-theme-light .ip-modal-title { color: #1e293b; }
        .ip-root.ip-theme-light .ip-modal-subtitle,
        .ip-root.ip-theme-light .ip-field-label { color: #64748b; }
        .ip-root.ip-theme-light .ip-modal-footer { border-top-color: #e2e8f0; }
        .ip-root.ip-theme-light .ip-input,
        .ip-root.ip-theme-light .ip-textarea {
          background: #fff;
          border-color: #cbd5e1;
          color: #334155;
        }
        .ip-root.ip-theme-light .ip-vote-btn {
          background: #f1f5f9;
          border-color: #cbd5e1;
          color: #334155;
        }
        .ip-root.ip-theme-light .ip-duration-btn {
          background: #f1f5f9;
          border-color: #94a3b8;
          color: #475569;
        }
        .ip-root.ip-theme-light .ip-break-time { color: #1e293b; }
        .ip-root.ip-theme-light .ip-reserved-placeholder {
          background: rgba(0,0,0,0.04);
          border-color: #cbd5e1;
        }

        /* Red Pill Protocol */
        .ip-root.ip-theme-red-pill { background: #0D0D0D; color: #e6e6e6; }
        .ip-root.ip-theme-red-pill .ip-ring-label { fill: rgba(255,255,255,0.5); }
        .ip-root.ip-theme-red-pill .ip-header { background: #1a1a1a; border-bottom-color: rgba(255,0,60,0.2); }
        .ip-root.ip-theme-red-pill .ip-card { background: rgba(255,255,255,0.04); border-color: rgba(255,0,60,0.2); }
        .ip-root.ip-theme-red-pill .ip-card-title, .ip-root.ip-theme-red-pill .ip-mbar-label, .ip-root.ip-theme-red-pill .ip-legend-item, .ip-root.ip-theme-red-pill .ip-heatmap-name { color: #999; }
        .ip-root.ip-theme-red-pill .ip-mbar-track { background: rgba(255,255,255,0.08); }
        .ip-root.ip-theme-red-pill .ip-selector { background: rgba(255,255,255,0.06); border-color: rgba(255,0,60,0.3); color: #e6e6e6; }
        .ip-root.ip-theme-red-pill .ip-export-btn { background: rgba(255,0,60,0.1); border-color: rgba(255,0,60,0.3); color: #ccc; }
        .ip-root.ip-theme-red-pill .ip-export-btn:hover:not(:disabled) { background: rgba(255,0,60,0.2); color: #fff; border-color: #FF003C; }
        .ip-root.ip-theme-red-pill .ip-modal { background: #1a1a1a; border-color: rgba(255,0,60,0.25); }
        .ip-root.ip-theme-red-pill .ip-input, .ip-root.ip-theme-red-pill .ip-textarea { background: rgba(255,255,255,0.06); border-color: rgba(255,0,60,0.25); color: #e6e6e6; }

        /* Cyberpunk Neon */
        .ip-root.ip-theme-cyberpunk { background: #1A0033; color: #e6e6ff; }
        .ip-root.ip-theme-cyberpunk .ip-ring-label { fill: rgba(0,240,255,0.7); }
        .ip-root.ip-theme-cyberpunk .ip-header { background: #2d0052; border-bottom-color: rgba(0,240,255,0.25); }
        .ip-root.ip-theme-cyberpunk .ip-card { background: rgba(0,240,255,0.04); border-color: rgba(0,240,255,0.2); }
        .ip-root.ip-theme-cyberpunk .ip-card:hover { border-color: rgba(255,0,230,0.4); box-shadow: 0 0 12px rgba(0,240,255,0.15); }
        .ip-root.ip-theme-cyberpunk .ip-card-title, .ip-root.ip-theme-cyberpunk .ip-mbar-label, .ip-root.ip-theme-cyberpunk .ip-legend-item, .ip-root.ip-theme-cyberpunk .ip-heatmap-name { color: #b8a0d0; }
        .ip-root.ip-theme-cyberpunk .ip-mbar-track { background: rgba(0,240,255,0.08); }
        .ip-root.ip-theme-cyberpunk .ip-selector { background: rgba(0,240,255,0.06); border-color: rgba(0,240,255,0.3); color: #e6e6ff; }
        .ip-root.ip-theme-cyberpunk .ip-export-btn { background: rgba(0,240,255,0.1); border-color: rgba(0,240,255,0.3); color: #b8a0d0; }
        .ip-root.ip-theme-cyberpunk .ip-export-btn:hover:not(:disabled) { background: rgba(0,240,255,0.2); color: #00F0FF; border-color: #00F0FF; box-shadow: 0 0 10px rgba(0,240,255,0.3); }
        .ip-root.ip-theme-cyberpunk .ip-modal { background: #2d0052; border-color: rgba(0,240,255,0.3); }
        .ip-root.ip-theme-cyberpunk .ip-input, .ip-root.ip-theme-cyberpunk .ip-textarea { background: rgba(0,240,255,0.06); border-color: rgba(0,240,255,0.25); color: #e6e6ff; }

        /* Midnight Command */
        .ip-root.ip-theme-midnight { background: #0A1A2F; color: #e8f4fc; }
        .ip-root.ip-theme-midnight .ip-ring-label { fill: rgba(91,192,235,0.8); }
        .ip-root.ip-theme-midnight .ip-header { background: #132639; border-bottom-color: rgba(91,192,235,0.2); }
        .ip-root.ip-theme-midnight .ip-card { background: rgba(91,192,235,0.04); border-color: rgba(91,192,235,0.18); }
        .ip-root.ip-theme-midnight .ip-card-title, .ip-root.ip-theme-midnight .ip-mbar-label, .ip-root.ip-theme-midnight .ip-legend-item, .ip-root.ip-theme-midnight .ip-heatmap-name { color: #7a9fb8; }
        .ip-root.ip-theme-midnight .ip-mbar-track { background: rgba(91,192,235,0.08); }
        .ip-root.ip-theme-midnight .ip-selector { background: rgba(91,192,235,0.06); border-color: rgba(91,192,235,0.25); color: #e8f4fc; }
        .ip-root.ip-theme-midnight .ip-export-btn { background: rgba(91,192,235,0.1); border-color: rgba(91,192,235,0.3); color: #7a9fb8; }
        .ip-root.ip-theme-midnight .ip-export-btn:hover:not(:disabled) { background: rgba(91,192,235,0.2); color: #5BC0EB; border-color: #5BC0EB; }
        .ip-root.ip-theme-midnight .ip-modal { background: #132639; border-color: rgba(91,192,235,0.25); }
        .ip-root.ip-theme-midnight .ip-input, .ip-root.ip-theme-midnight .ip-textarea { background: rgba(91,192,235,0.06); border-color: rgba(91,192,235,0.2); color: #e8f4fc; }

        /* Matrix theme */
        .ip-root.ip-theme-matrix {
          background: #0D0D0D;
          color: #E6FFE6;
          font-family: "Space Mono", "IBM Plex Mono", "Orbitron", monospace;
        }
        .ip-root.ip-theme-matrix .ip-header { background: #111111; border-bottom-color: rgba(0,255,102,0.2); }
        .ip-root.ip-theme-matrix .ip-header-title,
        .ip-root.ip-theme-matrix .ip-card-title,
        .ip-root.ip-theme-matrix .ip-mbar-label,
        .ip-root.ip-theme-matrix .ip-legend-item,
        .ip-root.ip-theme-matrix .ip-heatmap-name { font-family: "Orbitron", "Space Mono", sans-serif; text-transform: uppercase; letter-spacing: 0.08em; }
        .ip-root.ip-theme-matrix .ip-header-title { color: #E6FFE6; }
        .ip-root.ip-theme-matrix .ip-header-live { color: #00FF66; background: rgba(0,255,102,0.12); border-color: rgba(0,255,102,0.4); }
        .ip-root.ip-theme-matrix .ip-ring-label { fill: rgba(0,255,102,0.8); }
        .ip-root.ip-theme-matrix .ip-card { background: #111111; border-color: rgba(0,255,102,0.18); }
        .ip-root.ip-theme-matrix .ip-card:hover { border-color: rgba(0,255,102,0.35); box-shadow: 0 0 14px rgba(0,255,102,0.08); }
        .ip-root.ip-theme-matrix .ip-card-title,
        .ip-root.ip-theme-matrix .ip-mbar-label,
        .ip-root.ip-theme-matrix .ip-legend-item,
        .ip-root.ip-theme-matrix .ip-heatmap-name { color: #8A8A8A; }
        .ip-root.ip-theme-matrix .ip-mbar-track { background: rgba(0,255,102,0.08); }
        .ip-root.ip-theme-matrix .ip-mbar-fill { box-shadow: 0 0 6px rgba(0,255,102,0.4); }
        .ip-root.ip-theme-matrix .ip-selector { background: #111111; border-color: rgba(0,255,102,0.25); color: #E6FFE6; font-family: "IBM Plex Mono", "Space Mono", monospace; }
        .ip-root.ip-theme-matrix .ip-chart-hint,
        .ip-root.ip-theme-matrix .ip-heat-text,
        .ip-root.ip-theme-matrix .ip-waiting,
        .ip-root.ip-theme-matrix .ip-empty-state,
        .ip-root.ip-theme-matrix .ip-empty-sub { color: #8A8A8A; }
        .ip-root.ip-theme-matrix .ip-export-btn { background: rgba(0,255,102,0.08); border-color: rgba(0,255,102,0.3); color: #8A8A8A; }
        .ip-root.ip-theme-matrix .ip-export-btn:hover:not(:disabled) { background: rgba(0,255,102,0.18); color: #00FF66; border-color: #00FF66; box-shadow: 0 0 10px rgba(0,255,102,0.25); }
        .ip-root.ip-theme-matrix .ip-card-alert { border-color: rgba(255,0,60,0.3); background: rgba(255,0,60,0.04); }
        .ip-root.ip-theme-matrix .ip-alert-title { color: #FF003C; }
        .ip-root.ip-theme-matrix .ip-alert-sub { color: #8A8A8A; }
        .ip-root.ip-theme-matrix .ip-modal { background: #111111; border-color: rgba(0,255,102,0.25); }
        .ip-root.ip-theme-matrix .ip-input, .ip-root.ip-theme-matrix .ip-textarea { background: #0D0D0D; border-color: rgba(0,255,102,0.2); color: #E6FFE6; font-family: "IBM Plex Mono", "Space Mono", monospace; }
        /* Matrix heatmap engagement pulse: green = engaged, flicker = unstable, red = disengaged */
        .ip-root.ip-theme-matrix .ip-heatmap-cell.ip-heat-high { box-shadow: 0 0 10px rgba(0,255,102,0.6); }
        .ip-root.ip-theme-matrix .ip-heatmap-cell.ip-heat-mid { animation: ip-matrix-flicker 1.2s ease-in-out infinite; box-shadow: 0 0 8px rgba(0,255,102,0.4); }
        .ip-root.ip-theme-matrix .ip-heatmap-cell.ip-heat-low { box-shadow: 0 0 10px rgba(255,0,60,0.5); }
        .ip-root.ip-theme-matrix .ip-body { position: relative; }
        .ip-matrix-rain {
          position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 0;
          background: linear-gradient(180deg, transparent 0%, rgba(0,255,102,0.02) 15%, transparent 30%, rgba(0,255,102,0.015) 45%, transparent 60%, rgba(0,255,102,0.02) 75%, transparent 100%);
          background-size: 100% 400px;
          animation: ip-matrix-rain 12s linear infinite;
          opacity: 0.5;
        }
        @keyframes ip-matrix-rain {
          0% { background-position: 0 0; }
          100% { background-position: 0 400px; }
        }
        @keyframes ip-matrix-flicker {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(0,255,102,0.5); }
          50% { opacity: 0.75; box-shadow: 0 0 4px rgba(0,255,102,0.3); }
        }
        @keyframes ip-glitch {
          0% { filter: none; transform: translate(0); }
          20% { filter: none; transform: translate(-2px, 1px); }
          40% { filter: drop-shadow(0 0 4px #FF003C); transform: translate(2px, -1px); }
          60% { filter: none; transform: translate(-1px, 2px); }
          80% { filter: drop-shadow(0 0 6px #FF003C); transform: translate(1px, -2px); }
          100% { filter: none; transform: translate(0); }
        }
        .ip-alert-glitch { animation: ip-glitch 0.5s ease-out; }
        @keyframes ip-join-ripple {
          0% { box-shadow: inset 0 0 0 0 rgba(0,255,102,0); }
          30% { box-shadow: inset 0 0 30px 8px rgba(0,255,102,0.12); }
          100% { box-shadow: inset 0 0 0 0 rgba(0,255,102,0); }
        }
        .ip-root.ip-theme-matrix.ip-join-ripple { animation: ip-join-ripple 1.4s ease-out; }
      `}</style>
    </div>
  );
}
