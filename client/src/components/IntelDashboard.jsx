import { useState, useMemo } from 'react';
import {
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts';

const EMOTION_COLORS = {
  anger: '#ff0033',
  disgust: '#9900ff',
  fear: '#cc00ff',
  happiness: '#00ff66',
  sadness: '#00ccff',
  surprise: '#ffcc00',
  neutral: '#8e8ea0',
};

const METRIC_CONFIG = [
  { key: 'engagement', label: 'Average Engagement', gradient: 'linear-gradient(90deg, #ff00ff, #ff66ff)', class: 'intel-bar-engagement' },
  { key: 'concentration', label: 'Average Concentration', gradient: 'linear-gradient(90deg, #00ffff, #66ffff)', class: 'intel-bar-concentration' },
  { key: 'confusion', label: 'Average Confusion', gradient: 'linear-gradient(90deg, #ff3300, #ff6600)', class: 'intel-bar-confusion' },
  { key: 'focus', label: 'Eye Focus', gradient: 'linear-gradient(90deg, #00ff00, #66ff66)', class: 'intel-bar-focus' },
  { key: 'distraction', label: 'Distraction', gradient: 'linear-gradient(90deg, #ff0000, #ff6666)', class: 'intel-bar-distraction' },
];

function ProgressMetric({ label, value, gradient, barClass }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="intel-metric">
      <h3 className="intel-metric-title">{label}</h3>
      <div className="intel-progress-container">
        <div
          className={`intel-progress-bar ${barClass}`}
          style={{ width: `${pct}%`, background: gradient }}
        />
      </div>
      <span className="intel-metric-value">{Math.round(pct)}%</span>
    </div>
  );
}

function flattenHistory(history) {
  const rows = [];
  (history || []).forEach((record, i) => {
    const primary = Array.isArray(record) ? record[0] : record;
    if (primary && typeof primary === 'object') {
      rows.push({
        index: i,
        time: primary.timestamp ? new Date(primary.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '',
        engagement: primary.engagement ?? 0,
        concentration: primary.concentration ?? 0,
        confusion: primary.confusion ?? 0,
        focus: primary.focus ?? 0,
      });
    }
  });
  return rows.slice(-80);
}

function emotionDataForPie(current) {
  const primary = Array.isArray(current) ? current[0] : current;
  if (!primary) return Object.keys(EMOTION_COLORS).map((name) => ({ name, value: 0 }));
  return Object.keys(EMOTION_COLORS).map((name) => ({
    name,
    value: Math.max(0, Math.min(100, Number(primary[name]) || 0)),
  }));
}

function exportCSV(participants) {
  const rows = [];
  participants.forEach((p) => {
    (p.history || []).forEach((record) => {
      const arr = Array.isArray(record) ? record : [record];
      arr.forEach((face) => {
        if (face && typeof face === 'object') {
          rows.push({
            participant_id: p.participant_id,
            name: p.name,
            ...face,
          });
        }
      });
    });
  });
  if (rows.length === 0) return;
  const headers = ['participant_id', 'name', 'timestamp', 'dominant_emotion', 'engagement', 'concentration', 'confusion', 'focus', 'anger', 'disgust', 'fear', 'happiness', 'sadness', 'surprise', 'neutral'];
  const line = (r) => headers.map((h) => (r[h] != null ? String(r[h]).replace(/"/g, '""') : '')).join(',');
  const csv = [headers.join(','), ...rows.map((r) => line(r))].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `intel_export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const CHART_THEME = {
  grid: 'rgba(0, 255, 255, 0.1)',
  text: '#ffffff',
  axis: 'rgba(142, 142, 160, 0.9)',
  tooltipBg: 'rgba(10, 10, 26, 0.95)',
};

export default function IntelDashboard({ participants, onClose }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = useMemo(() => {
    const id = selectedId || (participants?.[0]?.participant_id ?? null);
    return participants?.find((p) => p.participant_id === id) ?? null;
  }, [participants, selectedId]);

  const current = selected?.current;
  const primary = Array.isArray(current) ? current[0] : current;
  const history = selected?.history ?? [];
  const timeSeriesData = useMemo(() => flattenHistory(history), [history]);
  const pieData = useMemo(() => emotionDataForPie(current), [current]);

  const hasData = participants?.length > 0 && participants.some((p) => (p.history?.length ?? 0) > 0);

  return (
    <div className="intel-overlay">
      <div className="intel-panel">
        <header className="intel-header">
          <div className="intel-header-inner">
            <h1 className="intel-title">SENSEI — Host Analytics</h1>
            <p className="intel-subtitle">Member engagement &amp; emotion metrics</p>
          </div>
          <button type="button" className="intel-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </header>

        <div className="intel-host-header">
          <div className="intel-participant-wrap">
            <label htmlFor="intel-participant">Member:</label>
            <select
              id="intel-participant"
              value={selected?.participant_id ?? ''}
              onChange={(e) => setSelectedId(e.target.value || null)}
            >
              <option value="">— Select member —</option>
              {(participants || []).map((p) => (
                <option key={p.participant_id} value={p.participant_id}>
                  {p.name || p.participant_id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {participants?.length > 0 ? (
          <main className="intel-dashboard">
            <div className="intel-left-column">
              <div className="intel-chart-container intel-timeline-section">
                <h3 className="intel-chart-title">Emotion Analysis Over Time</h3>
                <p className="intel-timeline-hint">2 min window — engagement, concentration, confusion</p>
                <div className="intel-chart-wrapper intel-timeline-wrapper">
                  <ResponsiveContainer width="100%" height={230}>
                    <LineChart data={timeSeriesData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
                      <XAxis dataKey="time" tick={{ fontSize: 10, fill: CHART_THEME.axis }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: CHART_THEME.axis }} />
                      <Tooltip
                        contentStyle={{
                          background: CHART_THEME.tooltipBg,
                          border: '1px solid rgba(0, 255, 255, 0.3)',
                          borderRadius: '4px',
                          color: CHART_THEME.text,
                        }}
                        labelStyle={{ color: CHART_THEME.text }}
                      />
                      <Line type="monotone" dataKey="engagement" stroke="#ff00ff" strokeWidth={2} dot={false} name="Engagement" />
                      <Line type="monotone" dataKey="concentration" stroke="#00ffff" strokeWidth={2} dot={false} name="Concentration" />
                      <Line type="monotone" dataKey="confusion" stroke="#ff3300" strokeWidth={2} dot={false} name="Confusion" />
                      <Line type="monotone" dataKey="focus" stroke="#00ff66" strokeWidth={2} dot={false} name="Focus" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="intel-emotion-panel">
              <h2 className="intel-panel-heading">Emotion Analysis</h2>

              <div className="intel-metrics-summary intel-metrics-row">
                {METRIC_CONFIG.slice(0, 3).map((m) => (
                  <ProgressMetric
                    key={m.key}
                    label={m.label}
                    value={primary?.[m.key]}
                    gradient={m.gradient}
                    barClass={m.class}
                  />
                ))}
              </div>
              <div className="intel-metrics-summary intel-gaze-metrics">
                {METRIC_CONFIG.slice(3, 5).map((m) => (
                  <ProgressMetric
                    key={m.key}
                    label={m.label}
                    value={primary?.[m.key]}
                    gradient={m.gradient}
                    barClass={m.class}
                  />
                ))}
              </div>

              <div className="intel-emotion-summary">
                <div className="intel-charts-grid">
                  <div className="intel-chart-container">
                    <h3 className="intel-chart-title">Current Emotion Distribution</h3>
                    <div className="intel-chart-wrapper">
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie
                            data={pieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={85}
                            paddingAngle={2}
                            stroke="rgba(17, 17, 34, 0.9)"
                            strokeWidth={1}
                            label={({ name, value }) => (value > 0 ? `${name} ${value}%` : '')}
                          >
                            {pieData.map((e) => (
                              <Cell key={e.name} fill={EMOTION_COLORS[e.name] || '#8e8ea0'} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(v) => [`${v}%`, '']}
                            contentStyle={{
                              background: CHART_THEME.tooltipBg,
                              border: '1px solid rgba(0, 255, 255, 0.3)',
                              borderRadius: '4px',
                              color: CHART_THEME.text,
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px' }} formatter={(v) => <span style={{ color: '#8e8ea0' }}>{v}</span>} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>

              <div className="intel-export-section">
                <h3 className="intel-export-title">Export Data</h3>
                <div className="intel-export-buttons">
                  <button
                    type="button"
                    className="intel-export-btn intel-export-csv"
                    onClick={() => exportCSV(participants)}
                    disabled={!hasData}
                  >
                    Export CSV
                  </button>
                </div>
              </div>
            </div>
          </main>
        ) : (
          <p className="intel-empty">No members yet. Share the room link for others to join; engagement metrics will appear here.</p>
        )}
      </div>
      <div className="intel-backdrop" onClick={onClose} aria-hidden="true" />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700&family=Rajdhani:wght@400;500;600;700&display=swap');
        .intel-overlay {
          position: fixed; inset: 0; z-index: 100;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Rajdhani', sans-serif;
        }
        .intel-backdrop {
          position: absolute; inset: 0;
          background: rgba(0, 0, 0, 0.7);
        }
        .intel-panel {
          position: relative;
          background: #0a0a1a;
          background-image:
            linear-gradient(135deg, rgba(255, 0, 255, 0.06) 0%, transparent 70%),
            linear-gradient(45deg, rgba(0, 255, 255, 0.06) 0%, transparent 70%);
          border: 1px solid rgba(0, 255, 255, 0.25);
          border-radius: 4px;
          box-shadow: 0 0 20px rgba(0, 255, 255, 0.15), 0 0 40px rgba(0, 0, 0, 0.5);
          max-width: 95vw; width: 1000px; max-height: 92vh;
          overflow: auto;
          color: #ffffff;
        }
        .intel-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid #00ffff;
          position: relative;
        }
        .intel-header::after {
          content: ''; position: absolute; bottom: -2px; left: 25%; width: 50%; height: 1px;
          background: linear-gradient(90deg, transparent, #ff00ff, transparent);
          box-shadow: 0 0 5px #ff00ff, 0 0 10px #ff00ff;
        }
        .intel-title {
          font-family: 'Orbitron', sans-serif; font-size: 1.4rem; font-weight: 700;
          color: #ff00ff; margin: 0; letter-spacing: 2px; text-transform: uppercase;
          text-shadow: 0 0 5px #ff00ff;
        }
        .intel-subtitle {
          color: #00ffff; font-size: 0.95rem; margin: 4px 0 0 0;
          font-family: 'Orbitron', sans-serif; letter-spacing: 1px;
        }
        .intel-close {
          background: rgba(17, 17, 34, 0.8); color: #8e8ea0; border: 1px solid rgba(0, 255, 255, 0.3);
          width: 36px; height: 36px; border-radius: 4px; font-size: 1.5rem; line-height: 1;
          cursor: pointer; padding: 0; display: flex; align-items: center; justify-content: center;
        }
        .intel-close:hover { color: #00ffff; border-color: #00ffff; }
        .intel-host-header {
          display: flex; align-items: center; flex-wrap: wrap; gap: 12px;
          margin: 16px 20px; padding-bottom: 12px;
        }
        .intel-participant-wrap { display: flex; align-items: center; gap: 8px; }
        .intel-participant-wrap label { color: #8e8ea0; font-size: 0.95rem; }
        .intel-participant-wrap select {
          padding: 8px 12px; background: #111122; border: 1px solid #00ffff;
          color: #ffffff; border-radius: 4px; min-width: 200px; font-size: 0.95rem;
        }
        .intel-dashboard {
          display: grid; grid-template-columns: 1.6fr 1fr; gap: 20px;
          padding: 0 20px 20px; align-items: start;
        }
        .intel-left-column { display: flex; flex-direction: column; gap: 20px; }
        .intel-chart-container {
          background: rgba(17, 17, 34, 0.7);
          border-radius: 4px; padding: 20px; margin-bottom: 0;
          box-shadow: 0 0 10px rgba(0, 255, 255, 0.2);
          border: 1px solid rgba(0, 255, 255, 0.2);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .intel-chart-container:hover {
          box-shadow: 0 0 15px rgba(0, 255, 255, 0.35);
          border-color: rgba(0, 255, 255, 0.4);
        }
        .intel-chart-title {
          font-size: 1.1rem; font-weight: 600; color: #00ffff; margin-bottom: 10px;
          padding-bottom: 10px; border-bottom: 2px solid rgba(0, 255, 255, 0.3);
          letter-spacing: 1px; font-family: 'Orbitron', sans-serif;
        }
        .intel-timeline-hint {
          font-size: 0.85rem; color: #8e8ea0; margin: -4px 0 10px 0;
        }
        .intel-chart-wrapper { position: relative; width: 100%; }
        .intel-timeline-wrapper { height: 230px; }
        .intel-emotion-panel {
          background: rgba(17, 17, 34, 0.7);
          border-radius: 4px; padding: 20px;
          box-shadow: 0 0 10px rgba(0, 255, 255, 0.2);
          border: 1px solid rgba(255, 0, 255, 0.2);
        }
        .intel-panel-heading {
          color: #ff00ff; margin-bottom: 20px; padding-bottom: 10px;
          border-bottom: 2px solid #ffff00; text-shadow: 0 0 3px #ff00ff;
          text-transform: uppercase; letter-spacing: 2px;
          font-family: 'Orbitron', sans-serif; font-weight: 500; font-size: 1.1rem;
        }
        .intel-metrics-summary {
          display: grid; gap: 16px; margin: 16px 0; padding: 16px;
          background: rgba(17, 17, 34, 0.7); border-radius: 8px;
          box-shadow: 0 0 15px rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(0, 255, 255, 0.2);
        }
        .intel-metrics-row { grid-template-columns: repeat(3, 1fr); }
        .intel-gaze-metrics {
          grid-template-columns: repeat(2, 1fr);
          margin-top: 8px; border-left: 4px solid #00ff00;
        }
        .intel-metric {
          display: flex; flex-direction: column; align-items: stretch;
          text-align: center; min-width: 0;
        }
        .intel-metric-title {
          font-size: 0.9rem; color: #00ffff; margin-bottom: 10px;
          letter-spacing: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .intel-progress-container {
          background: rgba(0, 0, 0, 0.3); border-radius: 20px; height: 16px;
          overflow: hidden; position: relative; margin-bottom: 6px;
          border: 1px solid rgba(0, 255, 255, 0.3);
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
        }
        .intel-progress-bar {
          height: 100%; border-radius: 20px; min-width: 4px;
          transition: width 0.5s ease-in-out;
          box-shadow: 0 0 5px rgba(255, 255, 255, 0.4);
        }
        .intel-metric-value {
          display: block; text-align: right; margin-top: 4px;
          font-size: 1rem; font-weight: 700; color: #ffff00;
          letter-spacing: 0.5px; background: rgba(0, 0, 0, 0.5);
          padding: 2px 8px; border-radius: 8px; align-self: flex-end;
          box-shadow: 0 0 3px #00ffff;
        }
        .intel-emotion-summary { margin-top: 20px; }
        .intel-charts-grid {
          display: grid; grid-template-columns: 1fr; gap: 20px;
        }
        .intel-chart-wrapper .recharts-wrapper { margin: 0 auto; }
        .intel-export-section {
          margin-top: 24px; padding: 16px;
          background: rgba(0, 0, 0, 0.3); border-radius: 4px;
          border: 1px solid #ffff00; position: relative; overflow: hidden;
        }
        .intel-export-section::before {
          content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 2px;
          background: linear-gradient(90deg, transparent, #ffff00, transparent);
          animation: intel-scanline 4s linear infinite;
        }
        @keyframes intel-scanline {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .intel-export-title {
          color: #ffff00; margin-bottom: 12px; font-family: 'Orbitron', sans-serif;
          font-size: 1rem; letter-spacing: 1px; text-transform: uppercase;
          text-shadow: 0 0 5px #ffff00;
        }
        .intel-export-buttons { display: flex; gap: 10px; flex-wrap: wrap; }
        .intel-export-btn {
          background: linear-gradient(45deg, #111122, rgba(0, 0, 0, 0.5));
          color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.15);
          padding: 10px 16px; border-radius: 4px; font-family: 'Rajdhani', sans-serif;
          font-weight: 600; font-size: 0.9rem; cursor: pointer;
          transition: all 0.2s ease; box-shadow: 0 0 5px rgba(0, 0, 0, 0.5);
        }
        .intel-export-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        .intel-export-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .intel-export-csv { border-color: rgba(0, 255, 255, 0.3); }
        .intel-export-csv:hover:not(:disabled) { color: #00ffff; border-color: #00ffff; }
        .intel-empty {
          padding: 32px 20px; text-align: center; color: #8e8ea0;
          margin: 0; font-style: italic;
          background: rgba(255, 0, 255, 0.05); border-radius: 4px;
          margin: 0 20px 20px; border: 1px solid rgba(255, 0, 255, 0.1);
        }
        @media (max-width: 900px) {
          .intel-dashboard { grid-template-columns: 1fr; }
        }
        @media (max-width: 600px) {
          .intel-metrics-row { grid-template-columns: 1fr; }
          .intel-gaze-metrics { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
