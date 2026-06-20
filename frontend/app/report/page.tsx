// ============================================================
// app/report/page.tsx — AI Report Generator（路由：/report）
// ============================================================
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  loadSession,
  saveSession,
  type ReportOutput,
  type ProtocolOutput,
  type AnalysisOutput,
} from "@/lib/session";

// ── Demo Data ─────────────────────────────────────────────
const DEMO_PROTOCOL: ProtocolOutput = {
  title: "Effect of Temperature on Amylase Activity",
  objective: "Investigate how different temperatures affect the catalytic activity of amylase in hydrolyzing starch, and determine the optimal reaction temperature",
  assumptions: ["Ambient humidity remains constant (50% RH)", "pH maintained at 7.0", "Equal volumes of fresh enzyme solution used each trial"],
  equipment: ["Thermostatic water bath", "Spectrophotometer (580 nm)", "Micropipette (0.5 mL)", "Stopwatch", "Iodine solution"],
  variables: [
    { name: "temperature", unit: "°C", type: "numeric", required: true },
    { name: "absorbance",  unit: "AU", type: "numeric", required: true },
    { name: "time",        unit: "s",  type: "time",    required: true },
  ],
  sampling_frequency: "Record absorbance every 60 seconds",
  expected_interval_minutes: 1,
  expected_duration_minutes: 30,
  procedure_steps: [
    "Prepare 50 mL of 1% starch solution",
    "Pre-warm amylase solutions in water baths at 20 °C, 37 °C, and 60 °C for 5 minutes",
    "Add equal volumes of starch solution to each temperature group simultaneously and start timer",
    "Take 0.5 mL samples every 60 s, add iodine, and measure absorbance at 580 nm",
    "Continue until absorbance stops decreasing (reaction complete)",
  ],
  control_conditions: ["pH 7.0 phosphate buffer", "Enzyme concentration fixed at 0.1 mg/mL", "3 replicates per group"],
  possible_errors: ["Manual timing error (±2 s)", "Inconsistent sample volume", "Spectrophotometer reading fluctuation"],
  csv_template: "time,temperature,absorbance",
};

const DEMO_ANALYSIS: AnalysisOutput = {
  dataset_name: "amylase_temperature_exp.csv",
  row_count: 90,
  column_count: 3,
  quality_score: 82,
  quality_level: "Good",
  issues: [
    { type: "outlier",  severity: "low",    row_index: 45, column: "absorbance",  message: "Row 45 absorbance value 1.92 exceeds expected range", value: 1.92 },
    { type: "missing",  severity: "medium", row_index: 28, column: "temperature", message: "Row 28 temperature column is empty" },
  ],
  statistics: {
    temperature: { min: 20,   max: 60,   mean: 39,   median: 37   },
    absorbance:  { min: 0.12, max: 1.95, mean: 0.87, median: 0.82 },
    time:        { min: 0,    max: 1740, mean: 870,  median: 870  },
  },
  chart_data: [],
  ai_explanation: {
    possible_causes: [
      "Enzyme activity peaks at 37 °C, consistent with amylase optimal temperature range",
      "Slow absorbance decrease in the 60 °C group suggests partial enzyme denaturation at high temperature",
    ],
    suggested_actions: [
      "Filter row 45 outlier and recalculate group statistics",
      "Recover row 28 temperature value from lab notebook",
    ],
    impact_on_conclusion: "Overall data quality is good; the single outlier (1/90 rows) has limited impact on core conclusions",
    confidence: "high",
  },
};

// ── Section metadata ───────────────────────────────────────
const SECTION_META = [
  { key: "introduction" as const, label: "1. Introduction", sublabel: "Background & Aim",  icon: "🔬", modifier: ""                   },
  { key: "method"       as const, label: "2. Method",       sublabel: "Procedure",         icon: "⚗️", modifier: "section-card--method"     },
  { key: "results"      as const, label: "3. Results",      sublabel: "Data & Statistics", icon: "📊", modifier: "section-card--results"    },
  { key: "discussion"   as const, label: "4. Discussion",   sublabel: "Analysis",          icon: "💬", modifier: "section-card--discussion" },
  { key: "conclusion"   as const, label: "5. Conclusion",   sublabel: "Summary",           icon: "✅", modifier: "section-card--conclusion" },
];

// ── Markdown → HTML (no external lib) ─────────────────────
function mdToHtml(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, (m) => `<pre class="md-code">${m.replace(/```\w*\n?/g, "")}</pre>`)
    .replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2 class="md-h2">$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1 class="md-h1">$1</h1>')
    .replace(/^---$/gm, '<hr class="md-hr" />')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,     "<em>$1</em>")
    .replace(/^- (.+)$/gm,      '<li class="md-li">$1</li>')
    .replace(/^\d+\. (.+)$/gm,  '<li class="md-oli">$1</li>')
    .replace(/\n\n/g, '</p><p class="md-p">')
    .replace(/\n/g,   "<br />");
}

// ── Section card (collapsible) ─────────────────────────────
function SectionCard({ meta, content }: { meta: (typeof SECTION_META)[number]; content: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`section-card ${meta.modifier}`}>
      <button className="section-header" onClick={() => setOpen((v) => !v)}>
        <div className="section-title">
          <span style={{ fontSize: 18 }}>{meta.icon}</span>
          <span className="section-title-text">{meta.label}</span>
          <span className="badge badge-primary" style={{ fontSize: 11 }}>{meta.sublabel}</span>
        </div>
        <span className="section-chevron">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div
          className="section-body"
          dangerouslySetInnerHTML={{ __html: `<p class="md-p">${mdToHtml(content)}</p>` }}
        />
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────
export default function ReportPage() {
  const [protocol, setProtocol]         = useState<ProtocolOutput | null>(null);
  const [analysis, setAnalysis]         = useState<AnalysisOutput | null>(null);
  const [usingDemo, setUsingDemo]       = useState(false);
  const [userReq, setUserReq]           = useState("");
  const [report, setReport]             = useState<ReportOutput | null>(null);
  const [warnings, setWarnings]         = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copySuccess, setCopySuccess]   = useState(false);
  const [activeTab, setActiveTab]       = useState<"sections" | "raw">("sections");

  useEffect(() => {
    const session = loadSession();
    const proto    = session?.protocol ?? null;
    const analysis = (session?.analysis && "statistics" in session.analysis)
      ? (session.analysis as AnalysisOutput) : null;
    setProtocol(proto as ProtocolOutput | null);
    setAnalysis(analysis);
    if (session?.report) setReport(session.report);
  }, []);

  function handleLoadDemo() {
    const session = loadSession() ?? {};
    saveSession({ ...session, protocol: DEMO_PROTOCOL, analysis: DEMO_ANALYSIS });
    setProtocol(DEMO_PROTOCOL);
    setAnalysis(DEMO_ANALYSIS);
    setUsingDemo(true);
    setReport(null);
    setWarnings([]);
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setWarnings([]);
    setReport(null);
    const hasRealAnalysis = Boolean(analysis && "statistics" in analysis);
    try {
      const resp = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protocol:          protocol ?? null,
          analysis:          hasRealAnalysis ? analysis : null,
          user_requirements: userReq.trim() || null,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      const data = await resp.json();
      const newReport: ReportOutput = {
        title: data.title, markdown: data.markdown,
        sections: data.sections, generated_from: data.generated_from, warnings: data.warnings ?? [],
      };
      setReport(newReport);
      setWarnings(data.warnings ?? []);
      const session = loadSession() ?? {};
      saveSession({ ...session, report: newReport });
    } catch (err) {
      console.error("Report generation failed:", err);
      const hasProt = Boolean(protocol);
      const hasAna  = hasRealAnalysis;
      const intro      = hasProt ? `This experiment aimed to ${protocol!.objective}.` : "(No experiment objective provided)";
      const method     = hasProt ? `**Equipment**: ${protocol!.equipment.join(", ")}.\n\n**Sampling frequency**: ${protocol!.sampling_frequency}.` : "No protocol provided.";
      const results    = hasAna  ? `Dataset **${analysis!.dataset_name}** — ${analysis!.row_count} rows, quality score **${analysis!.quality_score} / 100** (${analysis!.quality_level}).` : "No analysis data — specific values cannot be reported.";
      const discussion = hasProt && protocol!.possible_errors.length ? `Potential sources of error: ${protocol!.possible_errors.slice(0, 3).join("; ")}.` : "(Backend unavailable)";
      const conclusion = hasAna  ? `Data quality: ${analysis!.quality_level}.` : "(Insufficient data)";
      const md = `# ${protocol?.title ?? "Lab Report"}\n\n> ⚠️ Backend unavailable — client-side fallback\n\n## 1. Introduction\n\n${intro}\n\n## 2. Method\n\n${method}\n\n## 3. Results\n\n${results}\n\n## 4. Discussion\n\n${discussion}\n\n## 5. Conclusion\n\n${conclusion}`;
      const fallback: ReportOutput = {
        title: protocol?.title ?? "Lab Report", markdown: md,
        sections: { introduction: intro, method, results, discussion, conclusion },
        generated_from: { has_protocol: hasProt, has_analysis: hasAna, dataset_name: analysis?.dataset_name },
        warnings: [`Backend unavailable (${String(err).slice(0, 80)}) — client-side fallback report`],
      };
      setReport(fallback);
      setWarnings(fallback.warnings);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCopy() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.markdown);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    } catch {
      alert("Copy failed — please select all text manually (Ctrl+A → Ctrl+C)");
    }
  }

  function handleReset() {
    setReport(null);
    setWarnings([]);
    const session = loadSession() ?? {};
    const { report: _r, ...rest } = session;
    saveSession(rest);
  }

  const hasProtocol = Boolean(protocol);
  const hasAnalysis = Boolean(analysis && "statistics" in analysis);
  const hasAnyData  = hasProtocol || hasAnalysis;

  return (
    <>
      {/* Page header */}
      <div className="page-header">
        <span className="badge badge-primary">Experiment Report</span>
        <h1>📄 AI Report Generator</h1>
        <p>
          Combines your protocol and analysis — Claude writes a five-section academic report.
          All numerical values come from real data; no results are fabricated.
        </p>
      </div>

      {/* Data source card */}
      <div className="data-card">
        <div className="data-card-header">
          <span className="data-card-title">Data Sources</span>
          {usingDemo && <span className="badge badge-warning">Demo Mode</span>}
        </div>

        <div className="source-row">
          <span className={hasProtocol ? "source-icon-ok" : "source-icon-no"}>
            {hasProtocol ? "✅" : "⭕"}
          </span>
          <span className={hasProtocol ? "source-text-ok" : "source-text-no"}>
            {hasProtocol
              ? `Protocol loaded: ${protocol!.title}`
              : "No protocol — Introduction & Method sections will be limited"}
          </span>
        </div>

        <div className="source-row">
          <span className={hasAnalysis ? "source-icon-ok" : "source-icon-no"}>
            {hasAnalysis ? "✅" : "⭕"}
          </span>
          <span className={hasAnalysis ? "source-text-ok" : "source-text-no"}>
            {hasAnalysis
              ? `Analysis loaded: ${(analysis as AnalysisOutput).dataset_name} (${(analysis as AnalysisOutput).row_count} rows)`
              : "No analysis — Results section cannot show real numerical values"}
          </span>
        </div>

        {/* No data: show navigation + demo */}
        {!hasAnyData && (
          <div className="notice-box">
            <p>⚠️ Steps 1 & 2 not complete — report will be missing key content</p>
            <div className="notice-links">
              <Link href="/protocol" className="btn btn-primary btn-sm">→ Go to Protocol</Link>
              <Link href="/analyze"  className="btn btn-secondary btn-sm">→ Go to Analyze</Link>
              <button onClick={handleLoadDemo} className="btn btn-dark btn-sm">✨ Load Demo Data</button>
            </div>
          </div>
        )}

        {hasAnyData && !usingDemo && (
          <button
            onClick={handleLoadDemo}
            style={{ marginTop: 8, background: "none", border: "none", cursor: "pointer",
                     fontSize: 13, color: "var(--muted)", textDecoration: "underline" }}
          >
            or load Demo Data to try the full experience
          </button>
        )}
      </div>

      {/* Report format requirements */}
      {!report && (
        <div className="form-section">
          <div className="form-group">
            <label>
              Report Format Requirements
              <span className="label-hint">(optional)</span>
            </label>
            <textarea
              value={userReq}
              onChange={(e) => setUserReq(e.target.value)}
              rows={3}
              placeholder={"e.g.\n• Focus Results on the temperature variable\n• Add a next-steps recommendation in Conclusion\n• Keep the tone formal and concise"}
              style={{ minHeight: 90 }}
            />
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--muted)" }}>
              Claude will follow the "no fabricated values" rule while honoring your formatting preferences.
            </p>
          </div>

          <div className="button-row">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="btn btn-primary"
              style={{ flex: 1, justifyContent: "center" }}
            >
              {isGenerating ? (
                <>
                  <span className="spinner" />
                  Generating five-section report (15–25 s)...
                </>
              ) : "🤖 Generate Report"}
            </button>
          </div>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="warning-strip">
          {warnings.map((w, i) => <p key={i}>⚠️ {w}</p>)}
        </div>
      )}

      {/* Report output */}
      {report && (
        <>
          {/* Action bar */}
          <div className="report-actions">
            <button onClick={handleCopy} className="btn btn-dark">
              {copySuccess ? "✅ Copied! Paste into Google Docs" : "📋 Copy Report (Markdown)"}
            </button>
            <button onClick={handleReset} className="btn btn-outline">
              🔄 Regenerate
            </button>
            <span className="report-title-label">{report.title}</span>
          </div>

          {/* Tab switcher */}
          <div className="tab-bar">
            <button className={`tab ${activeTab === "sections" ? "active" : ""}`} onClick={() => setActiveTab("sections")}>
              Sections
            </button>
            <button className={`tab ${activeTab === "raw" ? "active" : ""}`} onClick={() => setActiveTab("raw")}>
              Raw Markdown
            </button>
          </div>

          {/* Section cards */}
          {activeTab === "sections" && (
            <div>
              {SECTION_META.map((meta) => (
                <SectionCard key={meta.key} meta={meta} content={report.sections[meta.key]} />
              ))}
            </div>
          )}

          {/* Raw markdown */}
          {activeTab === "raw" && (
            <div className="raw-view">
              <pre>{report.markdown}</pre>
            </div>
          )}

          {/* Meta tags */}
          <div className="meta-tags">
            <span className="meta-tag">
              {report.generated_from.has_protocol ? "✓ Protocol included" : "✗ No protocol"}
            </span>
            <span className="meta-tag">
              {report.generated_from.has_analysis
                ? `✓ Analysis included (${report.generated_from.dataset_name ?? ""})`
                : "✗ No analysis data"}
            </span>
          </div>
        </>
      )}
    </>
  );
}
