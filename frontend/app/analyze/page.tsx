// ============================================================
// app/analyze/page.tsx — 数据分析页（路由：/analyze）
// ============================================================
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loadSession, saveSession } from "@/lib/session";

export default function AnalyzePage() {
  // 从上一步读取的实验方案描述（用于展示上下文）
  const [protocolDesc, setProtocolDesc] = useState<string | null>(null);
  const [analysisInput, setAnalysisInput] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false); // 模拟 AI 分析中
  const [result, setResult] = useState("");
  const router = useRouter();

  // useEffect 在组件"挂载"（首次显示）时执行一次
  // C++ 类比：构造函数里的初始化逻辑
  // 依赖数组 [] 为空表示只执行一次（不监听任何变量）
  useEffect(() => {
    const session = loadSession();
    if (session?.protocol?.description) {
      setProtocolDesc(session.protocol.description);
    }
  }, []);

  // 模拟 AI 分析（后续替换为真实 API 调用）
  async function handleAnalyze() {
    setIsAnalyzing(true);
    setResult("");

    // 调用后端 API（通过 next.config.js 的 rewrite 转发到 FastAPI）
    // 目前后端还没有 /api/analyze，这里先模拟延迟
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const mockResult = `分析完成！\n\n基于您输入的数据：\n${analysisInput}\n\n初步发现：数据显示显著的相关性，建议进一步统计检验。`;
    setResult(mockResult);
    setIsAnalyzing(false);

    // 保存分析结果到 localStorage
    const session = loadSession() ?? {};
    saveSession({
      ...session,
      analysis: {
        result: mockResult,
        analyzedAt: new Date().toISOString(),
      },
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">🔬 Analyze Data</h1>
        <p className="text-slate-500 mt-1">Upload experiment data for AI-assisted analysis</p>
      </div>

      {/* 显示上一步的实验方案（如果有）*/}
      {protocolDesc && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <span className="font-medium text-blue-700">📋 Current Protocol:</span>
          <p className="text-blue-600 mt-1 line-clamp-2">{protocolDesc}</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Experiment Data / Observations
          </label>
          <textarea
            className="w-full h-36 p-3 border border-slate-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
            placeholder="Paste data or describe observations, e.g.:&#10;group,temperature,activity&#10;A,20,45&#10;B,37,98&#10;C,60,12"
            value={analysisInput}
            onChange={(e) => setAnalysisInput(e.target.value)}
          />
        </div>

        <button
          onClick={handleAnalyze}
          disabled={!analysisInput.trim() || isAnalyzing}
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
        >
          {isAnalyzing ? "🤖 AI Analyzing..." : "Start Analysis"}
        </button>

        {/* 分析结果 */}
        {result && (
          <div className="space-y-3">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 whitespace-pre-line">
              {result}
            </div>
            <button
              onClick={() => router.push("/report")}
              className="w-full py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              Generate Report →
            </button>
          </div>
        )}
      </div>

      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
        🚧 Coming soon: real AI analysis API (/api/analyze) with chart visualization
      </div>
    </div>
  );
}
