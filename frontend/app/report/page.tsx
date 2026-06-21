"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  loadSession,
  saveSession,
  type ReportOutput,
  type ProtocolOutput,
  type AnalysisOutput,
} from "@/lib/session";

const DEMO_PROTOCOL: ProtocolOutput = {
  title: "Effect of Temperature on Amylase Activity",
  objective: "Investigate how the catalytic activity of amylase on starch hydrolysis changes under different temperatures, and determine the optimal reaction temperature.",
  assumptions: ["Ambient humidity stays constant (relative humidity 50%)", "pH is maintained at 7.0", "An equal amount of fresh enzyme solution is used each time"],
  equipment: ["Constant-temperature water bath", "Spectrophotometer (580 nm)", "Pipette (0.5 mL)", "Timer", "Iodine solution"],
  variables: [
    { name: "temperature", unit: "°C",  type: "numeric", required: true  },
    { name: "absorbance",  unit: "AU",  type: "numeric", required: true  },
    { name: "time",        unit: "s",   type: "time",    required: true  },
  ],
  sampling_frequency: "Record absorbance every 60 seconds",
  expected_interval_minutes: 1,
  expected_duration_minutes: 30,
  procedure_steps: [
    "Prepare 50 mL of 1% starch solution and set aside",
    "Pre-warm the amylase solution in 20 °C, 37 °C, and 60 °C water baths for 5 minutes",
    "Add an equal amount of starch solution to each temperature group at the same time and start timing immediately",
    "Sample 0.5 mL every 60 seconds, add iodine solution, and measure absorbance at 580 nm",
    "Continue recording until absorbance stops decreasing (reaction complete)",
  ],
  control_conditions: ["pH 7.0 phosphate buffer", "Enzyme concentration standardized at 0.1 mg/mL", "Each group repeated 3 times"],
  possible_errors: ["Human timing error (±2 s)", "Inconsistent sampling volume", "Spectrophotometer reading fluctuation"],
  csv_template: "time,temperature,absorbance",
};

const DEMO_ANALYSIS: AnalysisOutput = {
  dataset_name: "amylase_temperature_exp.csv",
  row_count: 90,
  column_count: 3,
  quality_score: 82,
  quality_level: "Good",
  issues: [
    {
      type: "outlier",  severity: "low",    row_index: 45,
      column: "absorbance", message: "Row 45: absorbance 1.92 is outside the normal range", value: 1.92,
    },
    {
      type: "missing",  severity: "medium", row_index: 28,
      column: "temperature", message: "Row 28: the temperature column is empty",
    },
  ],
  statistics: {
    temperature: { min: 20,   max: 60,   mean: 39,   median: 37   },
    absorbance:  { min: 0.12, max: 1.95, mean: 0.87, median: 0.82 },
    time:        { min: 0,    max: 1740, mean: 870,  median: 870  },
  },
  chart_data: [],
  ai_explanation: {
    possible_causes: [
      "Enzyme activity is highest at 37 °C, consistent with the optimal temperature range of amylase",
      "Absorbance in the 60 °C group decreases slowly, suggesting partial enzyme denaturation at high temperature",
    ],
    suggested_actions: [
      "Filter out the outlier in row 45, then recompute the statistics for each group",
      "Fill in the missing temperature value in row 28 (cross-check against the lab record book)",
    ],
    impact_on_conclusion:
      "Overall data quality is good with few outliers (1 / 90), so the impact on the core conclusion is limited",
    confidence: "high",
  },
};

const SECTION_META = [
  {
    key: "introduction" as const,
    label: "1. Introduction",
    sublabel: "Introduction",
    color: "border-blue-400",
    bg: "bg-blue-50",
    badge: "bg-blue-100 text-blue-700",
    icon: "🔬",
  },
  {
    key: "method" as const,
    label: "2. Method",
    sublabel: "Method",
    color: "border-violet-400",
    bg: "bg-violet-50",
    badge: "bg-violet-100 text-violet-700",
    icon: "⚗️",
  },
  {
    key: "results" as const,
    label: "3. Results",
    sublabel: "Results",
    color: "border-emerald-400",
    bg: "bg-emerald-50",
    badge: "bg-emerald-100 text-emerald-700",
    icon: "📊",
  },
  {
    key: "discussion" as const,
    label: "4. Discussion",
    sublabel: "Discussion",
    color: "border-amber-400",
    bg: "bg-amber-50",
    badge: "bg-amber-100 text-amber-700",
    icon: "💬",
  },
  {
    key: "conclusion" as const,
    label: "5. Conclusion",
    sublabel: "Conclusion",
    color: "border-teal-400",
    bg: "bg-teal-50",
    badge: "bg-teal-100 text-teal-700",
    icon: "✅",
  },
] as const;

function mdToHtml(md: string): string {
  return (
    md
      .replace(
        /```[\s\S]*?```/g,
        (m) => `<pre class="rp-code">${m.replace(/```\w*\n?/g, "")}</pre>`
      )
      .replace(/^#{3} (.+)$/gm, '<h3 class="rp-h3">$1</h3>')
      .replace(/^#{2} (.+)$/gm, '<h2 class="rp-h2">$1</h2>')
      .replace(/^#{1} (.+)$/gm, '<h1 class="rp-h1">$1</h1>')
      .replace(/^---$/gm, '<hr class="rp-hr" />')
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/^- (.+)$/gm, '<li class="rp-li">$1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li class="rp-oli">$1</li>')
      .replace(/\n\n/g, '</p><p class="rp-p">')
      .replace(/\n/g, "<br />")
  );
}

function SectionCard({
  meta,
  content,
}: {
  meta: (typeof SECTION_META)[number];
  content: string;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div
      className={`rounded-xl border-l-4 ${meta.color} border border-slate-200 overflow-hidden`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-5 py-3 ${meta.bg} text-left`}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{meta.icon}</span>
          <span className="font-semibold text-slate-800">{meta.label}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.badge}`}>
            {meta.sublabel}
          </span>
        </div>
        <span className="text-slate-400 text-sm">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-6 py-5 bg-white">
          <style>{`
            .rp-h1{font-size:1.4rem;font-weight:700;margin:.5rem 0 1rem;color:#1e293b}
            .rp-h2{font-size:1.1rem;font-weight:700;margin:1.2rem 0 .6rem;color:#334155}
            .rp-h3{font-size:.95rem;font-weight:600;margin:1rem 0 .4rem;color:#475569}
            .rp-p{margin:.6rem 0;line-height:1.8;color:#374151}
            .rp-li{margin:.25rem 0 .25rem 1.4rem;list-style:disc;line-height:1.75;color:#374151}
            .rp-oli{margin:.25rem 0 .25rem 1.4rem;list-style:decimal;line-height:1.75;color:#374151}
            .rp-hr{border:none;border-top:1px solid #e2e8f0;margin:1rem 0}
            .rp-code{background:#f8fafc;border:1px solid #e2e8f0;border-radius:.375rem;
                     padding:.75rem 1rem;font-size:.8rem;overflow-x:auto;margin:.75rem 0}
          `}</style>
          <div
            className="text-sm leading-relaxed"
            dangerouslySetInnerHTML={{
              __html: `<p class="rp-p">${mdToHtml(content)}</p>`,
            }}
          />
        </div>
      )}
    </div>
  );
}

function SourceBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={ok ? "text-emerald-500" : "text-slate-400"}>
        {ok ? "✅" : "⭕"}
      </span>
      <span className={ok ? "text-slate-700" : "text-slate-400"}>{label}</span>
    </div>
  );
}

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
  const [isDownloading, setIsDownloading] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const session = loadSession();

    const proto    = session?.protocol ?? null;
    const analysis = (session?.analysis && "statistics" in session.analysis)
      ? (session.analysis as AnalysisOutput)
      : null;

    setProtocol(proto as ProtocolOutput | null);
    setAnalysis(analysis);

    if (session?.report) {
      const s = session.report.sections;
      const allFilled =
        !!s &&
        !!s.introduction?.trim() &&
        !!s.method?.trim() &&
        !!s.results?.trim() &&
        !!s.discussion?.trim() &&
        !!s.conclusion?.trim();
      if (allFilled) {
        setReport(session.report);
      }
    }
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

    const hasRealAnalysis =
      Boolean(analysis && "statistics" in analysis);

    try {
      const resp = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protocol:          protocol  ?? null,
          analysis:          hasRealAnalysis ? analysis : null,
          user_requirements: userReq.trim() || null,
        }),
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      }

      const data = await resp.json();

      const newReport: ReportOutput = {
        title:          data.title,
        markdown:       data.markdown,
        sections:       data.sections,
        generated_from: data.generated_from,
        warnings:       data.warnings ?? [],
      };

      setReport(newReport);
      setWarnings(data.warnings ?? []);

      const session = loadSession() ?? {};
      saveSession({ ...session, report: newReport });

    } catch (err) {
      console.error("Report generation failed:", err);

      const hasProt = Boolean(protocol);
      const hasAna  = hasRealAnalysis;

      const intro = hasProt
        ? `This experiment aims to ${protocol!.objective}. Assumptions: ${protocol!.assumptions.slice(0, 2).join("; ")}.`
        : "(No experiment goal provided)";

      const method = hasProt
        ? `**Equipment**: ${protocol!.equipment.join(", ")}.\n\n**Recorded variables**: ${protocol!.variables.map((v) => `${v.name} (${v.unit})`).join(", ")}.\n\n**Sampling frequency**: ${protocol!.sampling_frequency}.`
        : "No protocol provided, so the Method section cannot be generated.";

      const results = hasAna
        ? `Dataset **${analysis!.dataset_name}** has ${analysis!.row_count} rows, with a quality score of **${analysis!.quality_score} / 100** (${analysis!.quality_level}).`
        : "No data analysis provided, so specific experimental values cannot be given.";

      const discussion = hasProt && protocol!.possible_errors.length
        ? `Potential sources of error: ${protocol!.possible_errors.slice(0, 3).join("; ")}.`
        : "(Backend service unavailable, Discussion section to be completed)";

      const conclusion = hasAna
        ? `Data quality level: ${analysis!.quality_level}. ${analysis!.quality_level === "Good" || analysis!.quality_level === "Excellent" ? "The conclusion has relatively high reliability." : "⚠️ Data quality is low, so the conclusion carries uncertainty."}`
        : "(Insufficient data, no conclusion can be drawn)";

      const md = `# ${protocol?.title ?? "Experiment Report"}\n\n> ⚠️ Backend service unavailable. The following is a local fallback report generated on the frontend.\n\n## 1. Introduction\n\n${intro}\n\n## 2. Method\n\n${method}\n\n## 3. Results\n\n${results}\n\n## 4. Discussion\n\n${discussion}\n\n## 5. Conclusion\n\n${conclusion}`;

      const fallback: ReportOutput = {
        title:    protocol?.title ?? "Experiment Report",
        markdown: md,
        sections: { introduction: intro, method, results, discussion, conclusion },
        generated_from: {
          has_protocol: hasProt,
          has_analysis: hasAna,
          dataset_name: analysis?.dataset_name,
        },
        warnings: [`Backend service unavailable (${String(err).slice(0, 80)}). The following is a local fallback report generated on the frontend.`],
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
      alert("Copy failed. Please select the text manually and copy it (Ctrl+A → Ctrl+C).");
    }
  }

  async function handleDownloadPDF() {
    if (!report) return;

    if (activeTab !== "sections") {
      setActiveTab("sections");
      await new Promise((r) => setTimeout(r, 250));
    }
    const node = reportRef.current;
    if (!node) return;

    setIsDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      const imgData = canvas.toDataURL("image/jpeg", 0.95);

      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position -= pageH;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
        heightLeft -= pageH;
      }

      const watermark = "DataLab";
      const PX_TO_MM = 25.4 / 96;
      const gapX = 150 * PX_TO_MM;
      const gapY = 100 * PX_TO_MM;
      const GState = (pdf as unknown as { GState: new (o: object) => object }).GState;
      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.saveGraphicsState();
        pdf.setGState(new GState({ opacity: 0.28 }));
        pdf.setFontSize(13);
        pdf.setTextColor(150, 150, 150);
        for (let y = -gapY; y < pageH + gapY; y += gapY) {
          for (let x = -gapX; x < pageW + gapX; x += gapX) {
            pdf.text(watermark, x, y, { angle: 45 });
          }
        }
        pdf.restoreGraphicsState();
      }

      const safeTitle = (report.title || "Experiment Report")
        .replace(/[\\/:*?"<>|]/g, "_")
        .slice(0, 60);
      pdf.save(`${safeTitle}.pdf`);
    } catch (e) {
      alert("Failed to generate PDF: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsDownloading(false);
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
    <div className="max-w-3xl mx-auto space-y-6 pb-16">

      <div>
        <h1 className="text-3xl font-bold text-slate-800">📄 AI Report Generator</h1>
        <p className="text-slate-500 mt-1 text-sm">
          Combine the experiment protocol and data analysis to generate a five-section academic report with Claude.
          All values come from real data; experimental results are never fabricated.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-700 text-sm">Data Sources</h2>
          {usingDemo && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
              Demo Mode
            </span>
          )}
        </div>

        <SourceBadge
          ok={hasProtocol}
          label={
            hasProtocol
              ? `Protocol loaded: ${protocol!.title}`
              : "Protocol not provided — Introduction / Method sections will be limited"
          }
        />
        <SourceBadge
          ok={hasAnalysis}
          label={
            hasAnalysis
              ? `Data analysis loaded: ${(analysis as AnalysisOutput).dataset_name} (${(analysis as AnalysisOutput).row_count} rows)`
              : "Data analysis not completed — the Results section cannot provide specific values"
          }
        />

        {!hasAnyData && (
          <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
            <p className="text-sm text-amber-800 font-medium">
              ⚠️ The first two steps are not complete, so the report will be missing key content.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/protocol"
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                → Fill in the protocol
              </Link>
              <Link
                href="/analyze"
                className="px-3 py-1.5 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
              >
                → Upload data for analysis
              </Link>
              <button
                onClick={handleLoadDemo}
                className="px-3 py-1.5 text-xs bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors"
              >
                ✨ Use Demo Data (quick preview)
              </button>
            </div>
          </div>
        )}

        {hasAnyData && !usingDemo && (
          <button
            onClick={handleLoadDemo}
            className="text-xs text-slate-400 hover:text-slate-600 underline-offset-2 hover:underline transition-colors"
          >
            Or switch to Demo Data to try the full workflow
          </button>
        )}
      </div>

      {!report && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-2">
          <label className="block text-sm font-semibold text-slate-700">
            Report Format Requirements <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            value={userReq}
            onChange={(e) => setUserReq(e.target.value)}
            rows={3}
            placeholder={
              "e.g.:\n• Write in English\n• Results should focus on the temperature variable\n• Conclusion should suggest next experiment steps"
            }
            className="w-full p-3 border border-slate-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none
                       font-mono leading-relaxed placeholder:text-slate-400"
          />
          <p className="text-xs text-slate-400">
            Claude generates the report using the format requirements above, while strictly following the rule of never fabricating values.
          </p>
        </div>
      )}

      {!report && (
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-semibold text-base
                     hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed
                     transition-colors flex items-center justify-center gap-2"
        >
          {isGenerating ? (
            <>
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Claude is generating the five-section report (about 20-40 seconds, please wait)...
            </>
          ) : (
            "🤖 Generate Report"
          )}
        </button>
      )}

      {warnings.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
          {warnings.map((w, i) => (
            <p key={i} className="text-sm text-amber-800">
              ⚠️ {w}
            </p>
          ))}
        </div>
      )}

      {report && (
        <div className="space-y-4">

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white
                         rounded-lg font-medium hover:bg-slate-700 transition-colors text-sm"
            >
              {copySuccess ? (
                <>✅ Copied! You can paste it straight into Google Docs</>
              ) : (
                <>📋 Copy Report (Markdown)</>
              )}
            </button>

            <button
              onClick={handleReset}
              className="px-4 py-2.5 bg-white text-slate-600 border border-slate-300
                         rounded-lg font-medium hover:bg-slate-50 transition-colors text-sm"
            >
              🔄 Regenerate
            </button>

            <span className="text-sm text-slate-500 italic flex-1 text-right truncate">
              {report.title}
            </span>
          </div>

          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            <button
              onClick={() => setActiveTab("sections")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === "sections"
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Section View
            </button>
            <button
              onClick={() => setActiveTab("raw")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === "raw"
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Raw Markdown
            </button>
          </div>

          {activeTab === "sections" && (
            <div ref={reportRef} className="space-y-3 bg-white p-2 rounded-xl">
              {SECTION_META.map((meta) => (
                <SectionCard
                  key={meta.key}
                  meta={meta}
                  content={report.sections[meta.key]}
                />
              ))}

              <p className="text-center text-xs text-slate-400 pt-3 mt-2 border-t border-slate-100">
                Generated by DataLab AI · For Reference Only
              </p>
            </div>
          )}

          {activeTab === "raw" && (
            <div className="bg-slate-900 rounded-xl p-5 overflow-auto max-h-[600px]">
              <pre className="text-slate-100 text-xs leading-relaxed whitespace-pre-wrap font-mono">
                {report.markdown}
              </pre>
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-xs text-slate-500 pt-1">
            <span className="px-2 py-1 bg-slate-100 rounded-full">
              {report.generated_from.has_protocol ? "✓ Protocol included" : "✗ No protocol"}
            </span>
            <span className="px-2 py-1 bg-slate-100 rounded-full">
              {report.generated_from.has_analysis
                ? `✓ Analysis data included (${report.generated_from.dataset_name ?? ""})`
                : "✗ No analysis data (Results values unavailable)"}
            </span>
          </div>

          <button
            onClick={handleDownloadPDF}
            disabled={isDownloading}
            className="w-full py-3 bg-rose-600 text-white rounded-lg font-medium
                       hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed
                       transition-colors flex items-center justify-center gap-2"
          >
            {isDownloading ? "⏳ Generating PDF..." : "📄 Download PDF Report"}
          </button>
          <p className="text-center text-xs text-slate-400 -mt-1">
            Each PDF page is tiled with a diagonal "DataLab" watermark. For reference only.
          </p>

        </div>
      )}
    </div>
  );
}
