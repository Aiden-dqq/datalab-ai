"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loadSession, saveSession } from "@/lib/session";
import type { ProtocolOutput } from "@/lib/session";

export default function ProtocolPage() {
  const [goal, setGoal] = useState("");

  const [mode, setMode] = useState<"idea" | "detailed">("idea");

  const [equipment, setEquipment] = useState("");
  const [budget, setBudget] = useState("");
  const [timeLimit, setTimeLimit] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProtocolOutput | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const router = useRouter();

  async function handleGenerate() {
    setLoading(true);
    setWarning(null);
    setResult(null);
    setCopied(false);

    let constraints: string | null = null;
    if (mode === "detailed") {
      const parts: string[] = [];
      if (equipment.trim()) parts.push(`Available equipment: ${equipment.trim()}`);
      if (budget.trim()) parts.push(`Budget limit: ${budget.trim()}`);
      if (timeLimit.trim()) parts.push(`Time limit: ${timeLimit.trim()}`);
      constraints = parts.length > 0 ? parts.join("\n") : null;
    }

    try {
      const resp = await fetch("/api/protocol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          constraints,
        }),
      });

      const json = await resp.json();

      setResult(json.data as ProtocolOutput);

      if (!json.ok) {
        setWarning(json.error ?? "The backend returned a sample (mock) protocol.");
      }
    } catch (err) {
      setWarning(`Request failed: ${String(err)}. Please make sure the backend is running on port 8000.`);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyCsv() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.csv_template);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setWarning("The browser blocked automatic copying. Please select and copy the CSV template below manually.");
    }
  }

  function handleContinue() {
    if (!result) return;
    const session = loadSession() ?? {};
    saveSession({
      ...session,
      protocol: result,
    });
    router.push("/analyze");
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">📋 Protocol Builder</h1>
        <p className="text-slate-500 mt-1">Describe your experiment goal and AI generates a structured protocol.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="flex gap-2">
            <button
              onClick={() => setMode("idea")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === "idea"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              💡 Idea Only
            </button>
            <button
              onClick={() => setMode("detailed")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === "detailed"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              🔧 Known Conditions
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {mode === "idea" ? "Experiment Idea" : "Experiment Goal"} <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full h-40 p-3 border border-slate-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="e.g. Study how different temperatures (20/37/60°C) affect amylase catalytic activity"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>

          {mode === "detailed" && (
            <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs text-slate-500">Add any conditions you already have (you can fill in only some):</p>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Equipment / Available Tools</label>
                <input
                  type="text"
                  className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="e.g. constant-temperature water bath, spectrophotometer"
                  value={equipment}
                  onChange={(e) => setEquipment(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Budget</label>
                <input
                  type="text"
                  className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="e.g. within 500 USD"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Time Limit</label>
                <input
                  type="text"
                  className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="e.g. experiment must finish within 2 hours"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value)}
                />
              </div>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={!goal.trim() || loading}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "🤖 Generating..." : "Generate Protocol"}
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4 min-h-[200px]">
          {!result && !loading && (
            <p className="text-slate-400 text-sm text-center pt-16">
              ← Fill in the experiment goal on the left, then click "Generate Protocol" to see the result here.
            </p>
          )}

          {loading && (
            <p className="text-slate-500 text-sm text-center pt-16">
              Generating the experiment protocol with AI, please wait...
            </p>
          )}

          {warning && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              ⚠️ {warning}
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800">{result.title}</h2>
                <p className="text-sm text-slate-600 mt-1">{result.objective}</p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">📊 Variables</h3>
                <table className="w-full text-xs border border-slate-200">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-2 py-1 text-left border-b border-slate-200">Variable</th>
                      <th className="px-2 py-1 text-left border-b border-slate-200">Unit</th>
                      <th className="px-2 py-1 text-left border-b border-slate-200">Type</th>
                      <th className="px-2 py-1 text-left border-b border-slate-200">Required</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.variables.map((v, i) => (
                      <tr key={i} className="text-slate-700">
                        <td className="px-2 py-1 border-b border-slate-100 font-mono">{v.name}</td>
                        <td className="px-2 py-1 border-b border-slate-100">{v.unit}</td>
                        <td className="px-2 py-1 border-b border-slate-100">{v.type}</td>
                        <td className="px-2 py-1 border-b border-slate-100">{v.required ? "✓" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">🧪 Procedure Steps</h3>
                <ol className="list-decimal list-inside space-y-1 text-xs text-slate-700">
                  {result.procedure_steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">📄 CSV Template Header</h3>
                <pre className="p-2 bg-slate-50 border border-slate-200 rounded text-xs font-mono text-slate-700 whitespace-pre-wrap break-all">
                  {result.csv_template}
                </pre>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleCopyCsv}
                  className="flex-1 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  {copied ? "✅ Copied" : "📋 Copy CSV Template"}
                </button>
                <button
                  onClick={handleContinue}
                  className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  Continue to Data Analysis →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
