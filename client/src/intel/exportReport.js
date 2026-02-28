/**
 * Analytics export: CSV, PDF report, and Dashboard Image.
 * PDF is a high-grade report with insights; Dashboard Image captures the live panel.
 */
import { jsPDF } from "jspdf";
import { applyPlugin } from "jspdf-autotable";
import html2canvas from "html2canvas";

applyPlugin(jsPDF);

function pct(v) {
  return Math.max(0, Math.min(100, Number(v) || 0));
}

function primary(cur) {
  return Array.isArray(cur) ? cur[0] : cur;
}

// --- CSV (unchanged behavior) ---
export function exportCSV(participants) {
  const rows = [];
  for (const p of participants || []) {
    for (const rec of p.history || []) {
      const arr = Array.isArray(rec) ? rec : [rec];
      for (const face of arr) {
        if (face && typeof face === "object") {
          rows.push({ participant_id: p.participant_id, name: p.name, ...face });
        }
      }
    }
  }
  if (!rows.length) return;
  const hs = [
    "participant_id", "name", "timestamp", "dominant_emotion", "engagement", "concentration",
    "confusion", "focus", "anger", "disgust", "fear", "happiness", "sadness", "surprise", "neutral",
  ];
  const csv = [
    hs.join(","),
    ...rows.map((r) =>
      hs.map((h) => (r[h] != null ? String(r[h]).replace(/"/g, '""') : "")).join(",")
    ),
  ].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "intel_" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

// --- Per-participant summary for PDF ---
function participantSummaries(participants) {
  return (participants || []).map((p) => {
    const hist = p.history || [];
    let eng = 0, conc = 0, conf = 0, foc = 0, dist = 0, happy = 0, sad = 0, n = 0;
    for (const rec of hist) {
      const face = primary(rec);
      if (face && typeof face === "object") {
        eng += pct(face.engagement);
        conc += pct(face.concentration);
        conf += pct(face.confusion);
        foc += pct(face.focus);
        dist += pct(face.distraction);
        happy += pct(face.happiness);
        sad += pct(face.sadness);
        n++;
      }
    }
    if (!n) n = 1;
    return {
      name: p.name || (p.participant_id && p.participant_id.slice(0, 12)) || "—",
      engagement: Math.round(eng / n),
      concentration: Math.round(conc / n),
      confusion: Math.round(conf / n),
      focus: Math.round(foc / n),
      distraction: Math.round(dist / n),
      samples: n,
    };
  });
}

// --- Insights text from data ---
function buildInsights(classScore, aggregatedHistory, engagementAlert, participantCount) {
  const insights = [];
  const durationMin =
    aggregatedHistory.length >= 2
      ? Math.round((aggregatedHistory[aggregatedHistory.length - 1].ts - aggregatedHistory[0].ts) / 60000)
      : 0;

  insights.push(`Session duration: ${durationMin} minute(s) of tracked analytics.`);
  insights.push(`Participants with data: ${participantCount}.`);

  const scoreLabel = classScore.score >= 70 ? "Good" : classScore.score >= 40 ? "Fair" : "Low";
  insights.push(`Overall class score: ${classScore.score}% (${scoreLabel}).`);

  const metrics = [
    { key: "engagement", val: classScore.engagement, label: "Engagement" },
    { key: "concentration", val: classScore.concentration, label: "Concentration" },
    { key: "confusion", val: classScore.confusion, label: "Confusion" },
    { key: "focus", val: classScore.focus, label: "Eye focus" },
    { key: "distraction", val: classScore.distraction, label: "Distraction" },
  ];
  const sorted = [...metrics].filter((m) => m.key !== "confusion" && m.key !== "distraction").sort((a, b) => b.val - a.val);
  if (sorted.length) {
    insights.push(`Strongest metric: ${sorted[0].label} at ${sorted[0].val}%.`);
    insights.push(`Confusion level: ${classScore.confusion}%; Distraction: ${classScore.distraction}%.`);
  }

  if (engagementAlert && engagementAlert.active) {
    insights.push(`Engagement drop detected: ${engagementAlert.count} participant(s) below threshold.`);
    insights.push(`Recommendation: Consider a short break, poll, or interactive activity to re-engage.`);
  } else if (participantCount > 0) {
    insights.push("No significant engagement drop detected in the analyzed window.");
  }

  if (classScore.score < 50 && participantCount > 0) {
    insights.push("Overall score is below 50%; review content pacing and clarity.");
  }
  if (classScore.focus < 40) {
    insights.push("Eye focus is relatively low; encourage camera-on and screen attention where possible.");
  }

  return insights;
}

/** Actionable recommendations to improve future meetings. */
function buildRecommendationsForFutureMeetings(classScore, engagementAlert, participantCount, durationMin) {
  const recs = [];
  if (classScore.score < 50 && participantCount > 0) {
    recs.push("Shorten segments and add checkpoints; low overall score suggests pacing or clarity issues.");
  }
  if (classScore.engagement < 50) {
    recs.push("Introduce more interactive elements (polls, Q&A, breakout discussions) in the next session.");
  }
  if (classScore.concentration < 50) {
    recs.push("Consider shorter blocks (e.g. 15–20 min) with clear objectives per block.");
  }
  if (classScore.confusion > 40) {
    recs.push("Recap key points more often and leave time for clarification questions.");
  }
  if (classScore.focus < 45 || classScore.distraction > 50) {
    recs.push("Remind participants to stay on camera when possible; reduce off-screen distractions.");
  }
  if (engagementAlert && engagementAlert.active) {
    recs.push("Schedule a short break or activity when engagement drops; use the in-app Poll/Quiz/Break tools.");
  }
  if (durationMin > 45 && (classScore.engagement < 60 || classScore.concentration < 60)) {
    recs.push("For long sessions, plan a break around the 45-minute mark to sustain attention.");
  }
  if (recs.length === 0 && participantCount > 0) {
    recs.push("Metrics are in a healthy range; maintain current format and keep monitoring for consistency.");
  }
  return recs;
}

/**
 * Generate a professional PDF report with insights, metrics, and tables.
 */
export function exportPDF(participants, classScore, heatmap, aggregatedHistory, engagementAlert) {
  try {
    return exportPDFImpl(participants, classScore, heatmap, aggregatedHistory, engagementAlert);
  } catch (err) {
    console.error("PDF export failed:", err);
  }
}

function exportPDFImpl(participants, classScore, heatmap, aggregatedHistory, engagementAlert) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 18;

  const title = "Sensei Analytics Report";
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(title, pageW / 2, y, { align: "center" });
  y += 10;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(
    "Generated " + new Date().toLocaleString() + " — AI-driven engagement and emotion analytics",
    pageW / 2,
    y,
    { align: "center" }
  );
  doc.setTextColor(0, 0, 0);
  y += 16;

  const participantCount = participants?.filter((p) => (p.history || []).length > 0).length || 0;
  const aggHist = aggregatedHistory || [];
  const durationMin = aggHist.length >= 2
    ? Math.round((aggHist[aggHist.length - 1].ts - aggHist[0].ts) / 60000)
    : 0;
  const insights = buildInsights(classScore, aggHist, engagementAlert, participantCount);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.text(
    "This report covers the full session from first to last recorded data point.",
    pageW / 2,
    y,
    { align: "center" }
  );
  doc.setTextColor(0, 0, 0);
  y += 10;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Executive Summary", 14, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const summaryLines = doc.splitTextToSize(
    `This report summarizes real-time emotion and engagement analytics for the entire session. ` +
      `Class score is a weighted combination of engagement (25%), concentration (25%), clarity (20%), eye focus (15%), attention (10%), and positive affect (5%). ` +
      `Data is derived from face and expression analysis. Use the insights and recommendations below to improve future sessions.`,
    pageW - 28
  );
  doc.text(summaryLines, 14, y);
  y += summaryLines.length * 5 + 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Key Insights", 14, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  for (const line of insights) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.text("• " + line, 18, y);
    y += 6;
  }
  y += 10;

  // Class score breakdown table
  if (y > 250) {
    doc.addPage();
    y = 20;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Class Score Breakdown", 14, y);
  y += 8;

  doc.autoTable({
    startY: y,
    head: [["Metric", "Value (%)", "Interpretation"]],
    body: [
      ["Overall score", String(classScore.score), classScore.score >= 70 ? "Good" : classScore.score >= 40 ? "Fair" : "Low"],
      ["Engagement", String(classScore.engagement), classScore.engagement >= 60 ? "Strong" : classScore.engagement >= 40 ? "Moderate" : "Low"],
      ["Concentration", String(classScore.concentration), classScore.concentration >= 60 ? "Strong" : classScore.concentration >= 40 ? "Moderate" : "Low"],
      ["Confusion", String(classScore.confusion), classScore.confusion <= 30 ? "Low" : classScore.confusion <= 50 ? "Moderate" : "High"],
      ["Eye focus", String(classScore.focus), classScore.focus >= 60 ? "Strong" : classScore.focus >= 40 ? "Moderate" : "Low"],
      ["Distraction", String(classScore.distraction), classScore.distraction <= 30 ? "Low" : classScore.distraction <= 50 ? "Moderate" : "High"],
    ],
    theme: "grid",
    headStyles: { fillColor: [41, 128, 185], fontStyle: "bold" },
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 14;

  // Participant-level summary
  const summaries = participantSummaries(participants);
  if (summaries.length > 0) {
    if (y > 230) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Participant Summary", 14, y);
    y += 8;

    doc.autoTable({
      startY: y,
      head: [["Participant", "Engagement", "Concentration", "Confusion", "Focus", "Distraction", "Samples"]],
      body: summaries.map((s) => [
        s.name,
        s.engagement + "%",
        s.concentration + "%",
        s.confusion + "%",
        s.focus + "%",
        s.distraction + "%",
        String(s.samples),
      ]),
      theme: "grid",
      headStyles: { fillColor: [52, 73, 94], fontStyle: "bold" },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 14;
  }

  // Heatmap summary (participant engagement trend)
  if (heatmap && heatmap.length > 0 && y < 240) {
    if (y > 220) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Engagement Heatmap Summary (recent time slots)", 14, y);
    y += 8;

    const heatmapBody = heatmap.map((row) => {
      const avg = row.vals.filter((v) => v != null).length
        ? Math.round(row.vals.reduce((a, v) => a + (v ?? 0), 0) / row.vals.filter((v) => v != null).length)
        : "—";
      const level = typeof avg === "number" ? (avg >= 70 ? "High" : avg >= 40 ? "Mid" : "Low") : "—";
      return [row.name, typeof avg === "number" ? avg + "%" : avg, level];
    });
    doc.autoTable({
      startY: y,
      head: [["Participant", "Avg. engagement", "Level"]],
      body: heatmapBody,
      theme: "grid",
      headStyles: { fillColor: [52, 73, 94], fontStyle: "bold" },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // Recommendations for future sessions
  const recommendations = buildRecommendationsForFutureMeetings(classScore, engagementAlert, participantCount, durationMin);
  if (recommendations.length > 0) {
    if (y > 230) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Recommendations for future sessions", 14, y);
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const rec of recommendations) {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      const lines = doc.splitTextToSize(rec, pageW - 28);
      doc.text(lines, 18, y);
      y += lines.length * 5 + 4;
    }
    y += 8;
  }

  // Footer on last page
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      "Confidential — Sensei Analytics | Page " + i + " of " + totalPages,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
    doc.setTextColor(0, 0, 0);
  }

  const filename = "sensei_analytics_report_" + new Date().toISOString().slice(0, 10) + ".pdf";
  try {
    const data = doc.output("arraybuffer");
    const blob = new Blob([data], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    try {
      doc.save(filename);
    } catch (e2) {
      console.error("PDF download failed:", e2);
    }
  }
}

/**
 * Build an SVG path for a metric over time (full meeting period).
 */
function buildTimelinePath(points, key, width, height, padding = 40) {
  if (!points || points.length < 2) return "";
  const minTs = points[0].ts;
  const maxTs = points[points.length - 1].ts;
  const rangeTs = maxTs - minTs || 1;
  const minVal = 0;
  const maxVal = 100;
  const rangeVal = maxVal - minVal;
  const w = width - padding * 2;
  const h = height - padding * 2;
  const d = points
    .map((p, i) => {
      const x = padding + (w * (p.ts - minTs)) / rangeTs;
      const v = p[key] != null ? Number(p[key]) : 0;
      const y = padding + h - (h * (v - minVal)) / rangeVal;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
  return d;
}

/**
 * Generate a summary dashboard image: overall metrics + full meeting timeline (start to end).
 * Creates an off-screen div, renders the summary view, captures it with html2canvas, then removes the div.
 */
export async function exportDashboardSummaryImage(participants, classScore, heatmap, aggregatedHistory) {
  const aggHist = aggregatedHistory || [];
  const durationMin = aggHist.length >= 2
    ? Math.round((aggHist[aggHist.length - 1].ts - aggHist[0].ts) / 60000)
    : 0;
  const chartW = 720;
  const chartH = 220;
  const padding = 40;

  const container = document.createElement("div");
  container.style.cssText = [
    "position:fixed",
    "left:-9999px",
    "top:0",
    "width:760px",
    "minHeight:520px",
    "background:linear-gradient(180deg,#0f172a 0%,#1e293b 100%)",
    "color:#e2e8f0",
    "fontFamily:'Segoe UI',sans-serif",
    "padding:24px",
    "boxSizing:border-box",
    "border:1px solid rgba(99,179,237,0.3)",
    "borderRadius:12px",
    "boxShadow:0 8px 32px rgba(0,0,0,0.4)",
  ].join(";");

  const title = document.createElement("h2");
  title.textContent = "Sensei analytics — full period";
  title.style.cssText = "margin:0 0 8px;fontSize:18px;fontWeight:700;color:#94a3b8;letterSpacing:0.5px;";
  container.appendChild(title);

  const sub = document.createElement("p");
  sub.textContent = `Duration: ${durationMin} min | Generated ${new Date().toLocaleString()}`;
  sub.style.cssText = "margin:0 0 20px;fontSize:12px;color:#64748b;";
  container.appendChild(sub);

  const scoreRow = document.createElement("div");
  scoreRow.style.cssText = "display:flex;alignItems:center;gap:16px;marginBottom:20px;flexWrap:wrap;";
  const scoreLabel = document.createElement("span");
  scoreLabel.textContent = "Class score:";
  scoreLabel.style.cssText = "fontSize:13px;color:#94a3b8;";
  const scoreVal = document.createElement("span");
  scoreVal.textContent = `${classScore.score}%`;
  scoreVal.style.cssText = "fontSize:24px;fontWeight:700;color:#38bdf8;";
  scoreRow.appendChild(scoreLabel);
  scoreRow.appendChild(scoreVal);
  ["Engagement", "Concentration", "Confusion", "Focus", "Distraction"].forEach((label, i) => {
    const keys = ["engagement", "concentration", "confusion", "focus", "distraction"];
    const val = classScore[keys[i]] ?? 0;
    const s = document.createElement("span");
    s.textContent = `${label}: ${val}%`;
    s.style.cssText = "fontSize:12px;color:#cbd5e1;";
    scoreRow.appendChild(s);
  });
  container.appendChild(scoreRow);

  const chartTitle = document.createElement("p");
  chartTitle.textContent = "Engagement & concentration over time (start → end)";
  chartTitle.style.cssText = "margin:0 0 8px;fontSize:12px;fontWeight:600;color:#94a3b8;";
  container.appendChild(chartTitle);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(chartW));
  svg.setAttribute("height", String(chartH));
  svg.setAttribute("style", "display:block;");
  const engagementPath = buildTimelinePath(aggHist, "engagement", chartW, chartH, padding);
  const concentrationPath = buildTimelinePath(aggHist, "concentration", chartW, chartH, padding);
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", String(chartW));
  bg.setAttribute("height", String(chartH));
  bg.setAttribute("fill", "rgba(15,23,42,0.5)");
  bg.setAttribute("rx", "6");
  svg.appendChild(bg);
  if (engagementPath) {
    const pathEng = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathEng.setAttribute("d", engagementPath);
    pathEng.setAttribute("fill", "none");
    pathEng.setAttribute("stroke", "#a78bfa");
    pathEng.setAttribute("strokeWidth", "2");
    svg.appendChild(pathEng);
  }
  if (concentrationPath) {
    const pathConc = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathConc.setAttribute("d", concentrationPath);
    pathConc.setAttribute("fill", "none");
    pathConc.setAttribute("stroke", "#38bdf8");
    pathConc.setAttribute("strokeWidth", "2");
    svg.appendChild(pathConc);
  }
  const axisColor = "rgba(148,163,184,0.5)";
  const lineY = document.createElementNS("http://www.w3.org/2000/svg", "line");
  lineY.setAttribute("x1", String(padding));
  lineY.setAttribute("y1", String(padding));
  lineY.setAttribute("x2", String(padding));
  lineY.setAttribute("y2", String(chartH - padding));
  lineY.setAttribute("stroke", axisColor);
  lineY.setAttribute("strokeWidth", "1");
  svg.appendChild(lineY);
  const lineX = document.createElementNS("http://www.w3.org/2000/svg", "line");
  lineX.setAttribute("x1", String(padding));
  lineX.setAttribute("y1", String(chartH - padding));
  lineX.setAttribute("x2", String(chartW - padding));
  lineX.setAttribute("y2", String(chartH - padding));
  lineX.setAttribute("stroke", axisColor);
  lineX.setAttribute("strokeWidth", "1");
  svg.appendChild(lineX);
  container.appendChild(svg);

  const legend = document.createElement("div");
  legend.style.cssText = "display:flex;gap:16px;marginTop:8px;fontSize:11px;color:#94a3b8;";
  legend.innerHTML = "<span><span style='display:inline-block;width:12px;height:2px;background:#a78bfa;vertical-align:middle;margin-right:4px;'></span>Engagement</span><span><span style='display:inline-block;width:12px;height:2px;background:#38bdf8;vertical-align:middle;margin-right:4px;'></span>Concentration</span>";
  container.appendChild(legend);

  if (heatmap && heatmap.length > 0) {
    const heatTitle = document.createElement("p");
    heatTitle.textContent = "Participant engagement (recent)";
    heatTitle.style.cssText = "margin:20px 0 8px;fontSize:12px;fontWeight:600;color:#94a3b8;";
    container.appendChild(heatTitle);
    const heatDiv = document.createElement("div");
    heatDiv.style.cssText = "display:flex;flexDirection:column;gap:4px;";
    heatmap.slice(0, 8).forEach((row) => {
      const avg = row.vals.filter((v) => v != null).length
        ? Math.round(row.vals.reduce((a, v) => a + (v ?? 0), 0) / row.vals.filter((v) => v != null).length)
        : null;
      const r = document.createElement("div");
      r.style.cssText = "display:flex;alignItems:center;gap:8px;fontSize:11px;";
      r.innerHTML = `<span style="minWidth:80px;color:#cbd5e1;">${String(row.name).slice(0, 12)}</span><span style="width:40px;color:#94a3b8;">${avg != null ? avg + "%" : "—"}</span>`;
      heatDiv.appendChild(r);
    });
    container.appendChild(heatDiv);
  }

  document.body.appendChild(container);
  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#0f172a",
      logging: false,
    });
    const dataUrl = canvas.toDataURL("image/png", 1.0);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "sensei_dashboard_summary_" + new Date().toISOString().slice(0, 19).replace(/:/g, "-") + ".png";
    a.click();
  } catch (err) {
    console.error("Dashboard summary image export failed:", err);
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Capture the dashboard DOM element as a high-quality PNG image (current panel view).
 */
export async function exportDashboardImage(containerRef) {
  if (!containerRef?.current) return;
  try {
    const canvas = await html2canvas(containerRef.current, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      logging: false,
      windowWidth: containerRef.current.scrollWidth,
      windowHeight: containerRef.current.scrollHeight,
    });
    const dataUrl = canvas.toDataURL("image/png", 1.0);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "analytics_dashboard_" + new Date().toISOString().slice(0, 19).replace(/:/g, "-") + ".png";
    a.click();
  } catch (err) {
    console.error("Dashboard image export failed:", err);
  }
}
