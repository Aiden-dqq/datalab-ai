"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loadSession, saveSession } from "@/lib/session";

export default function AnalyzePage() {
  const [protocolDesc, setProtocolDesc] = useState<string | null>(null);
  const [analysisInput, setAnalysisInput] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState("");
  const router = useRouter();

  useEffect(() => {
    const session = loadSession();
    if ((session?.protocol as any)?.description) {
      setProtocolDesc((session!.protocol as any).description);
    }
  }, []);

  async function handleAnalyze() {
    setIsAnalyzing(true);
    setResult("");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const mockResult = `Analysis complete!\n\nBased on your input:\n${analysisInput}\n\nPreliminary finding: the data shows significant correlation. Further statistical testing is recommended.`;
    setResult(mockResult);
    setIsAnalyzing(false);
    const session = loadSession() ?? {};
    saveSession({ ...session, analysis: { result: mockResult, analyzedAt: new Date().toISOString() } as any });
  }

  return (
    <>
      <div className="page-header">
        <span className="badge badge-success">Step 2</span>
        <h1>🔬 Analyze Data</h1>
        <p>Upload experiment data for AI-assisted analysis.</p>
      </div>

      {protocolDesc && (
        <div className="warning-strip" style={{ background: "#eff6ff", borderColor: "#bfdbfe" }}>
          <p style={{ color: "#1d4ed8" }}>
            <strong>📋 Current Protocol:</strong> {protocolDesc}
          </p>
        </div>
      )}

      <div className="form-section">
        <div className="form-group">
          <label>Experiment Data / Observations</label>
          <textarea
            placeholder={"Paste data or describe observations, e.g.:\ngroup,temperature,activity\nA,20,45\nB,37,98\nC,60,12"}
            value={analysisInput}
            onChange={(e) => setAnalysisInput(e.target.value)}
            style={{ fontFamily: "monospace" }}
          />
        </div>

        <div className="button-row">
          <button
            onClick={handleAnalyze}
            disabled={!analysisInput.trim() || isAnalyzing}
            className="btn btn-primary"
          >
            {isAnalyzing ? "🤖 AI Analyzing..." : "Start Analysis"}
          </button>
        </div>

        {result && (
          <div style={{ marginTop: 16 }}>
            <div className="result-box" style={{ marginBottom: 12 }}>
              {result}
            </div>
            <button onClick={() => router.push("/report")} className="btn btn-primary btn-full">
              Generate Report →
            </button>
          </div>
        )}
      </div>

      <div className="warning-strip">
        🚧 Coming soon: real AI analysis API (/api/analyze) with chart visualization
      </div>
    </>
  );
}
