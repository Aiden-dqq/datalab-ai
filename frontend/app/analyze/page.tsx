"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { loadSession, saveSession, type AnalysisOutput } from "@/lib/session";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  Line,
} from "recharts";

function qualityColor(level: AnalysisOutput["quality_level"]) {
  switch (level) {
    case "Excellent":
      return "text-green-700 bg-green-50 border-green-200";
    case "Good":
      return "text-blue-700 bg-blue-50 border-blue-200";
    case "Risky":
      return "text-amber-700 bg-amber-50 border-amber-200";
    case "Poor":
      return "text-red-700 bg-red-50 border-red-200";
    default:
      return "text-slate-700 bg-slate-50 border-slate-200";
  }
}

function issueTypeLabel(type: string) {
  const labels: Record<string, string> = {
    missing: "Missing",
    duplicate: "Duplicate",
    non_numeric: "Non-numeric",
    format: "Format Error",
    time_gap: "Time Gap",
    outlier: "Outlier",
  };
  return labels[type] ?? type;
}

function severityColor(severity: string) {
  switch (severity) {
    case "high":
      return "bg-red-100 text-red-700";
    case "medium":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function errorTypeLabel(t: string) {
  const labels: Record<string, string> = {
    natural_variation: "Natural Variation",
    operation_error: "Operation Error",
    equipment_error: "Equipment Error",
    recording_error: "Recording Error",
  };
  return labels[t] ?? t;
}

function stripDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

function DataChart({
  chartData,
  issues,
}: {
  chartData?: AnalysisOutput["chart_data"];
  issues?: AnalysisOutput["issues"];
}) {
  const safeChartData = chartData ?? [];
  const safeIssues = issues ?? [];

  if (safeChartData.length === 0) return null;

  const xKey = Object.keys(safeChartData[0])[0];

  const yKeys = Object.keys(safeChartData[0]).filter((k) => {
    if (k === xKey) return false;
    return safeChartData.some((row) => typeof row[k] === "number");
  });

  if (yKeys.length === 0) return null;

  const outlierRowSet = new Set(
    safeIssues
      .filter((iss) => iss.type === "outlier" && iss.row_index != null)
      .map((iss) => iss.row_index as number)
  );

  const data = safeChartData.map((row, idx) => ({
    ...row,
    _rowIdx: idx,
    _isOutlier: outlierRowSet.has(idx),
  }));

  const LINE_COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b"];

  function CustomDot(props: {
    cx?: number;
    cy?: number;
    payload?: Record<string, unknown>;
    [k: string]: unknown;
  }) {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null) return null;

    if (payload?._isOutlier) {
      return (
        <circle
          cx={cx}
          cy={cy}
          r={5}
          fill="#ef4444"
          stroke="#fff"
          strokeWidth={1.5}
        />
      );
    }

    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
        <h2 className="font-semibold text-slate-700">📈 Data Chart</h2>
        <span className="flex items-center gap-1 text-xs text-slate-400">
          <span className="inline-block w-3 h-3 rounded-full bg-red-400" />
          Outlier
        </span>
      </div>

      <div className="px-4 py-4">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey={xKey}
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickFormatter={(v) => String(v).slice(0, 10)}
            />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} width={48} />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid #e2e8f0",
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />

            {yKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                strokeWidth={2}
                dot={<CustomDot />}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function AnalyzePage() {
  const [csvText, setCsvText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [protocolTitle, setProtocolTitle] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [inputKind, setInputKind] = useState<"text" | "xlsx" | "image">("text");
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<string | null>(null);

  const [experimentSteps, setExperimentSteps] = useState("");
  const [protocolCtx, setProtocolCtx] = useState<string | null>(null);
  const hasProtocol = protocolCtx !== null;

  const router = useRouter();

  useEffect(() => {
    const session = loadSession();
    const proto = session?.protocol as Record<string, unknown> | undefined;
    const title = (proto?.title ?? proto?.description) as string | undefined;

    if (title) setProtocolTitle(title);

    if (proto) {
      const steps = Array.isArray(proto.procedure_steps)
        ? (proto.procedure_steps as string[])
        : [];

      const equip = Array.isArray(proto.equipment)
        ? (proto.equipment as string[])
        : [];

      const ctx = [
        `Protocol: ${proto.title ?? proto.description ?? ""}`,
        `Objective: ${proto.objective ?? ""}`,
        steps.length
          ? `Procedure steps:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
          : "",
        equip.length ? `Equipment: ${equip.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      setProtocolCtx(ctx);
    }

    if (session?.analysis) {
      setResult(session.analysis);
      const saved = session as Record<string, unknown>;
      if (typeof saved._lastCsvText === "string") setCsvText(saved._lastCsvText);
    }
  }, []);

  function readFile(file: File) {
    setFileName(file.name);

    const name = file.name.toLowerCase();
    const reader = new FileReader();

    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      setInputKind("xlsx");
      setMediaType(null);
      setCsvText("");

      reader.onload = (e) => {
        setFileBase64(stripDataUrl(e.target?.result as string));
      };

      reader.readAsDataURL(file);
    } else if (file.type.startsWith("image/")) {
      setInputKind("image");
      setMediaType(file.type);
      setCsvText("");

      reader.onload = (e) => {
        setFileBase64(stripDataUrl(e.target?.result as string));
      };

      reader.readAsDataURL(file);
    } else {
      setInputKind("text");
      setFileBase64(null);
      setMediaType(null);

      reader.onload = (e) => {
        setCsvText(e.target?.result as string);
      };

      reader.readAsText(file, "UTF-8");
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) readFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  }

  const hasInput = inputKind === "text" ? !!csvText.trim() : !!fileBase64;

  async function handleAnalyze() {
    if (!hasInput) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv_text: csvText,
          dataset_name: fileName ?? "experiment.csv",
          protocol_context: protocolCtx ?? undefined,
          input_kind: inputKind,
          file_base64: fileBase64 ?? undefined,
          media_type: mediaType ?? undefined,
          experiment_steps: experimentSteps.trim() ? experimentSteps : undefined,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.detail ?? `Server error ${response.status}`);
      }

const json = await response.json();

if (!json.ok) {
  throw new Error(json.error ?? "Analysis failed");
}

const analysis = json.data as AnalysisOutput;
setResult(analysis);

const prev = loadSession() ?? {};
saveSession({ ...prev, analysis, _lastCsvText: csvText } as typeof prev);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unknown error. Please check whether the backend is running."
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">🔬 Data Analysis</h1>
        <p className="text-slate-500 mt-1">
          Upload or paste CSV data. The system detects quality issues automatically
          and AI helps explain them.
        </p>
      </div>

      {protocolTitle && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <span className="font-medium text-blue-700">📋 Current Experiment: </span>
          <span className="text-blue-600 ml-1">{protocolTitle}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={[
            "flex flex-col items-center justify-center gap-2 cursor-pointer",
            "border-2 border-dashed rounded-xl py-7 px-4 transition-colors select-none",
            isDragging
              ? "border-blue-400 bg-blue-50"
              : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
          ].join(" ")}
        >
          <span className="text-3xl">{isDragging ? "📂" : "⬆️"}</span>

          <p className="text-sm font-medium text-slate-600">
            {fileName ? `Selected: ${fileName}` : "Drop a CSV / Excel / image here"}
          </p>

          <p className="text-xs text-slate-400">
            {fileName
              ? "Click to choose another file"
              : "Supports .csv / .xlsx / table images, or click to choose a file"}
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,.xlsx,.xls,image/*"
            className="hidden"
            onChange={handleFileInputChange}
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {inputKind !== "text" && fileBase64 && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
            {inputKind === "xlsx"
              ? "📊 Excel file loaded"
              : "🖼️ Image loaded (AI will read the table)"}
            : {fileName}
            <span className="text-blue-400 ml-1">
              — click "Start Analysis", or paste text below to switch to text mode
            </span>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Data Text{" "}
            <span className="text-slate-400 font-normal">
              (CSV / tab-separated / semicolon-separated, or paste directly)
            </span>
          </label>

          <textarea
            className="w-full h-40 p-3 border border-slate-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
            placeholder={
              "Paste CSV data, e.g.:\ntime,temperature,absorbance\n0,25,0.12\n30,37,0.45\n60,60,0.08"
            }
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setInputKind("text");
              setFileBase64(null);
              setMediaType(null);
            }}
          />
        </div>

        <button
          onClick={handleAnalyze}
          disabled={!hasInput || isAnalyzing}
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
        >
          {isAnalyzing ? "⏳ Analyzing..." : "Start Analysis"}
        </button>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            ❌ {error}
          </div>
        )}
      </div>

      {result &&
        (() => {
          const issues = result.issues ?? [];
          const statistics = result.statistics ?? {};
          const chartData = result.chart_data ?? [];
          const errorDiagnosis = result.error_diagnosis ?? [];

          const aiExplanation = result.ai_explanation ?? {
            confidence: "low",
            possible_causes: [],
            suggested_actions: [],
            impact_on_conclusion:
              "No AI explanation was returned for this analysis.",
          };

          return (
            <div className="space-y-5">
              <div className={`p-5 border rounded-xl ${qualityColor(result.quality_level)}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium opacity-70">Data Quality Score</p>

                    <p className="text-4xl font-bold mt-1">
                      {result.quality_score ?? "—"}
                    </p>

                    <p className="text-sm mt-1">
                      Level:{" "}
                      <span className="font-semibold">
                        {result.quality_level ?? "Unknown"}
                      </span>
                      &nbsp;·&nbsp;{result.row_count ?? 0} rows ×{" "}
                      {result.column_count ?? 0} cols
                      &nbsp;·&nbsp;{issues.length} issues found
                    </p>
                  </div>

                  <div className="text-5xl opacity-20 font-black">
                    {result.quality_score ?? "—"}
                  </div>
                </div>
              </div>

              {issues.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="font-semibold text-slate-700">🔍 Detected Issues</h2>
                    <span className="text-xs text-slate-400">{issues.length} total</span>
                  </div>

                  <ul className="divide-y divide-slate-50">
                    {issues.slice(0, 30).map((issue, i) => (
                      <li key={i} className="px-5 py-3 flex items-start gap-3 text-sm">
                        <span className="mt-0.5 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 shrink-0">
                          {issueTypeLabel(issue.type)}
                        </span>

                        <span
                          className={`mt-0.5 px-2 py-0.5 rounded text-xs font-medium shrink-0 ${severityColor(issue.severity)}`}
                        >
                          {issue.severity === "high"
                            ? "High"
                            : issue.severity === "medium"
                            ? "Medium"
                            : "Low"}
                        </span>

                        <span className="text-slate-600">{issue.message}</span>
                      </li>
                    ))}
                  </ul>

                  {issues.length > 30 && (
                    <div className="px-5 py-2 text-xs text-slate-400 border-t border-slate-100">
                      {issues.length - 30} more issues not shown
                    </div>
                  )}
                </div>
              )}

              {Object.keys(statistics).length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100">
                    <h2 className="font-semibold text-slate-700">📊 Column Statistics</h2>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                          <th className="px-5 py-2 text-left">Column</th>
                          <th className="px-5 py-2 text-right">Min</th>
                          <th className="px-5 py-2 text-right">Max</th>
                          <th className="px-5 py-2 text-right">Mean</th>
                          <th className="px-5 py-2 text-right">Median</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-50">
                        {Object.entries(statistics).map(([col, stats]) => (
                          <tr key={col} className="hover:bg-slate-50">
                            <td className="px-5 py-2.5 font-medium text-slate-700">
                              {col}
                            </td>
                            <td className="px-5 py-2.5 text-right text-slate-500">
                              {stats.min ?? "—"}
                            </td>
                            <td className="px-5 py-2.5 text-right text-slate-500">
                              {stats.max ?? "—"}
                            </td>
                            <td className="px-5 py-2.5 text-right text-slate-500">
                              {stats.mean ?? "—"}
                            </td>
                            <td className="px-5 py-2.5 text-right text-slate-500">
                              {stats.median ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <DataChart chartData={chartData} issues={issues} />

              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-slate-700">🤖 AI Analysis</h2>

                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium ${
                      aiExplanation.confidence === "high"
                        ? "bg-green-100 text-green-700"
                        : aiExplanation.confidence === "medium"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    Confidence:{" "}
                    {aiExplanation.confidence === "high"
                      ? "High"
                      : aiExplanation.confidence === "medium"
                      ? "Medium"
                      : "Low"}
                  </span>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Possible Causes
                  </p>

                  {aiExplanation.possible_causes.length > 0 ? (
                    <ul className="space-y-1">
                      {aiExplanation.possible_causes.map((cause, i) => (
                        <li key={i} className="text-sm text-slate-600 flex gap-2">
                          <span className="text-slate-300 shrink-0">•</span>
                          {cause}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-400">
                      No possible causes were returned.
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Suggested Actions
                  </p>

                  {aiExplanation.suggested_actions.length > 0 ? (
                    <ul className="space-y-1">
                      {aiExplanation.suggested_actions.map((action, i) => (
                        <li key={i} className="text-sm text-slate-600 flex gap-2">
                          <span className="text-blue-400 shrink-0">→</span>
                          {action}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-400">
                      No suggested actions were returned.
                    </p>
                  )}
                </div>

                <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-600 border border-slate-100">
                  <span className="font-medium text-slate-700">
                    Impact on Conclusion:{" "}
                  </span>
                  {aiExplanation.impact_on_conclusion}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <h2 className="font-semibold text-slate-700">🔧 Error Diagnosis</h2>

                {!hasProtocol && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                    <p className="text-sm text-amber-800 font-medium">
                      Tell me your experiment steps so AI can pinpoint which step caused
                      each problem:
                    </p>

                    <textarea
                      className="w-full h-24 p-3 border border-amber-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm"
                      placeholder={
                        "Describe each step, e.g.:\n1. Prepare enzyme solution and substrate\n2. Control temperature in a water bath\n3. Mix and start timing\n4. Read absorbance on a spectrophotometer"
                      }
                      value={experimentSteps}
                      onChange={(e) => setExperimentSteps(e.target.value)}
                    />

                    <button
                      onClick={handleAnalyze}
                      disabled={!experimentSteps.trim() || isAnalyzing}
                      className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
                    >
                      {isAnalyzing ? "⏳ Re-analyzing..." : "🔄 Re-analyze with Steps"}
                    </button>
                  </div>
                )}

                {errorDiagnosis.length > 0 ? (
                  <ul className="space-y-3">
                    {errorDiagnosis.map((d, i) => {
                      const issue = issues[d.issue_index];

                      return (
                        <li
                          key={i}
                          className="p-3 border border-slate-200 rounded-lg space-y-2"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                              {errorTypeLabel(d.error_type)}
                            </span>

                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                d.is_acceptable
                                  ? "bg-green-100 text-green-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {d.is_acceptable ? "Acceptable" : "Needs Attention"}
                            </span>

                            {issue && (
                              <span className="text-xs text-slate-400">
                                Related issue: {issue.message}
                              </span>
                            )}
                          </div>

                          <p className="text-sm text-slate-600">
                            <span className="font-medium text-slate-700">
                              Related step:{" "}
                            </span>
                            {d.related_step}
                          </p>

                          <p className="text-sm text-slate-600">
                            <span className="font-medium text-slate-700">
                              Suggestion:{" "}
                            </span>
                            {d.suggestion}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400">
                    No error diagnosis results yet.
                  </p>
                )}
              </div>

              <button
                onClick={() => router.push("/report")}
                className="w-full py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
              >
                Generate Report →
              </button>
            </div>
          );
        })()}
    </div>
  );
}