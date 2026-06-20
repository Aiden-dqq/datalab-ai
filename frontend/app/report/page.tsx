// ============================================================
// app/report/page.tsx — 报告生成页（路由：/report）
// ============================================================
"use client";

import { useState, useEffect } from "react";
import { loadSession, saveSession, clearSession } from "@/lib/session";

export default function ReportPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportContent, setReportContent] = useState("");
  const [sessionData, setSessionData] = useState<{
    protocolDesc?: string;
    analysisResult?: string;
  }>({});

  // 组件挂载时读取前两步的数据
  useEffect(() => {
    const session = loadSession();
    setSessionData({
      protocolDesc: session?.protocol?.description,
      analysisResult: session?.analysis?.result,
    });
    // 如果已有保存的报告，直接显示
    if (session?.report?.content) {
      setReportContent(session.report.content);
    }
  }, []);

  async function handleGenerate() {
    setIsGenerating(true);

    // 模拟报告生成延迟（后续替换为 /api/report 调用）
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const report = `# 实验报告

## 实验方案摘要
${sessionData.protocolDesc ?? "（未填写）"}

## 数据分析结果
${sessionData.analysisResult ?? "（未分析）"}

## 结论
基于以上分析，实验数据支持原假设。建议后续扩大样本量以增强统计显著性。

---
*本报告由 DataLab AI 自动生成 · ${new Date().toLocaleString("zh-CN")}*`;

    setReportContent(report);
    setIsGenerating(false);

    // 保存报告到 localStorage
    const session = loadSession() ?? {};
    saveSession({
      ...session,
      report: {
        content: report,
        generatedAt: new Date().toISOString(),
      },
    });
  }

  function handleReset() {
    // 清空所有数据，重新开始
    clearSession();
    setReportContent("");
    setSessionData({});
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">📄 生成报告</h1>
        <p className="text-slate-500 mt-1">基于实验方案和分析结果，自动生成报告</p>
      </div>

      {/* 数据来源摘要 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3 text-sm">
        <h2 className="font-semibold text-slate-700">数据来源汇总</h2>
        <div className="flex items-center gap-2">
          <span className={sessionData.protocolDesc ? "text-green-500" : "text-slate-400"}>
            {sessionData.protocolDesc ? "✅" : "⭕"}
          </span>
          <span className="text-slate-600">
            实验方案：{sessionData.protocolDesc ? "已填写" : "未填写"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={sessionData.analysisResult ? "text-green-500" : "text-slate-400"}>
            {sessionData.analysisResult ? "✅" : "⭕"}
          </span>
          <span className="text-slate-600">
            分析结果：{sessionData.analysisResult ? "已完成" : "未分析"}
          </span>
        </div>
      </div>

      {/* 生成按钮 */}
      {!reportContent && (
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-slate-300 transition-colors"
        >
          {isGenerating ? "🤖 正在生成报告..." : "生成报告"}
        </button>
      )}

      {/* 报告内容 */}
      {reportContent && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            {/* whitespace-pre-wrap 保留换行符，类似 C++ cout 的 \n */}
            <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
              {reportContent}
            </pre>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => navigator.clipboard.writeText(reportContent)}
              className="flex-1 py-2.5 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors"
            >
              📋 复制报告
            </button>
            <button
              onClick={handleReset}
              className="flex-1 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-lg font-medium hover:bg-red-100 transition-colors"
            >
              🔄 重新开始
            </button>
          </div>
        </div>
      )}

      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
        🚧 后续迭代：将接入 /api/report，支持 PDF 导出和分享功能
      </div>
    </div>
  );
}
