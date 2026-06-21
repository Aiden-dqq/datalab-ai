// ============================================================
// app/analyze/page.tsx — 数据分析页（路由：/analyze）
// ============================================================
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { loadSession, saveSession, type AnalysisOutput } from "@/lib/session";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Scatter, ScatterChart, ZAxis, Legend,
  ComposedChart,
} from "recharts";

// ─── 辅助函数：把质量等级转成颜色类名 ──────────────────────
function qualityColor(level: AnalysisOutput["quality_level"]) {
  switch (level) {
    case "Excellent": return "text-green-700 bg-green-50 border-green-200";
    case "Good":      return "text-blue-700 bg-blue-50 border-blue-200";
    case "Risky":     return "text-amber-700 bg-amber-50 border-amber-200";
    case "Poor":      return "text-red-700 bg-red-50 border-red-200";
  }
}

function issueTypeLabel(type: string) {
  const labels: Record<string, string> = {
    missing: "缺失值", duplicate: "重复行",
    non_numeric: "非数字", time_gap: "时间跳跃", outlier: "离群值",
  };
  return labels[type] ?? type;
}

function severityColor(severity: string) {
  switch (severity) {
    case "high":   return "bg-red-100 text-red-700";
    case "medium": return "bg-amber-100 text-amber-700";
    default:       return "bg-slate-100 text-slate-600";
  }
}

// ─── 折线图组件 ──────────────────────────────────────────────
// C++ 类比：void renderChart(vector<map<string,variant>> chartData, vector<Issue> issues)
function DataChart({
  chartData,
  issues,
}: {
  chartData: AnalysisOutput["chart_data"];
  issues: AnalysisOutput["issues"];
}) {
  if (chartData.length === 0) return null;

  // 第一列作为 x 轴键名（通常是 time / 序号）
  const xKey = Object.keys(chartData[0])[0];

  // 找出所有"数字列"作为 y 轴，跳过 x 轴列
  // C++ 类比：vector<string> yKeys = filter(columns, isNumeric)
  const yKeys = Object.keys(chartData[0]).filter((k) => {
    if (k === xKey) return false;
    // 只要该列有至少一行是数字，就画它
    return chartData.some((row) => typeof row[k] === "number");
  });

  if (yKeys.length === 0) return null;

  // 收集所有离群值的行索引，存成 Set 方便 O(1) 查找
  // C++ 类比：unordered_set<int> outlierRows
  const outlierRowSet = new Set(
    issues
      .filter((iss) => iss.type === "outlier" && iss.row_index != null)
      .map((iss) => iss.row_index as number)
  );

  // 给每行数据打上 _isOutlier 标记，recharts 用自定义点颜色时需要这个信息
  // C++ 类比：给每个数据点加一个 bool isOutlier 字段
  const data = chartData.map((row, idx) => ({
    ...row,
    _rowIdx: idx,        // 原始行号，用于匹配离群值
    _isOutlier: outlierRowSet.has(idx),
  }));

  // 固定蓝色色板，每条线取一个颜色
  const LINE_COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b"];

  // 自定义点渲染：离群值画红色大圆，普通点不画（让线条更干净）
  // C++ 类比：重载 drawPoint(Point p) 函数
  function CustomDot(props: {
    cx?: number; cy?: number;
    payload?: Record<string, unknown>;
    // 透传其他 recharts 属性
    [k: string]: unknown;
  }) {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null) return null;
    if (payload?._isOutlier) {
      // 离群值：红色实心大圆
      return <circle cx={cx} cy={cy} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />;
    }
    // 普通点不画，保持线条整洁
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
        <h2 className="font-semibold text-slate-700">📈 数据折线图</h2>
        {/* 图例说明红点含义 */}
        <span className="flex items-center gap-1 text-xs text-slate-400">
          <span className="inline-block w-3 h-3 rounded-full bg-red-400" />
          离群值
        </span>
      </div>
      {/* ResponsiveContainer 让图表宽度自适应父容器 */}
      {/* C++ 类比：图表宽度 = parent.width，高度固定 280 */}
      <div className="px-4 py-4">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            {/* 网格线 */}
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            {/* x 轴：显示第一列的值，标签过长时截断 */}
            <XAxis
              dataKey={xKey}
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickFormatter={(v) => String(v).slice(0, 10)}
            />
            {/* y 轴：自动计算范围 */}
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} width={48} />
            {/* 鼠标悬停提示 */}
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {/* 对每个 y 轴列画一条线 */}
            {yKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                strokeWidth={2}
                dot={<CustomDot />}          // 用自定义点替换默认圆点
                activeDot={{ r: 4 }}         // 鼠标悬停时显示高亮点
                isAnimationActive={false}    // 关闭动画，数据多时更流畅
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── 主页面组件 ───────────────────────────────────────────
export default function AnalyzePage() {
  const [csvText, setCsvText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [protocolTitle, setProtocolTitle] = useState<string | null>(null);
  // 拖拽状态：用户把文件拖到区域上方时高亮边框
  const [isDragging, setIsDragging] = useState(false);
  // 已选择的文件名，显示在拖拽区域里
  const [fileName, setFileName] = useState<string | null>(null);
  // 隐藏的 <input type="file"> 的 ref，用于触发点击
  // C++ 类比：pointer to hidden file input element
  const fileInputRef = useRef<HTMLInputElement>(null);

  const router = useRouter();

  useEffect(() => {
    const session = loadSession();
    const proto = session?.protocol as Record<string, unknown> | undefined;
    const title = (proto?.title ?? proto?.description) as string | undefined;
    if (title) setProtocolTitle(title);
    if (session?.analysis) {
      setResult(session.analysis);
      const saved = session as Record<string, unknown>;
      if (typeof saved._lastCsvText === "string") setCsvText(saved._lastCsvText);
    }
  }, []);

  // ── 从 File 对象读取文本内容 ───────────────────────────
  // 抽出来给上传和拖拽共用，C++ 类比：void readFile(File* f)
  function readFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setCsvText(e.target?.result as string);
    reader.readAsText(file, "UTF-8");
  }

  // ── 点击选择文件 ───────────────────────────────────────
  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) readFile(file);
  }

  // ── 拖拽事件处理 ───────────────────────────────────────
  // onDragOver：文件悬停在区域上方（必须 preventDefault 才能触发 onDrop）
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  // onDragLeave：文件离开区域
  function handleDragLeave(e: React.DragEvent) {
    // relatedTarget 是鼠标移向的下一个元素；如果还在区域内部就不取消高亮
    // C++ 类比：if (!dropZone.contains(e.relatedTarget)) isDragging = false;
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }

  // onDrop：文件释放到区域内
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();  // 阻止浏览器默认的"打开文件"行为
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  }

  // ── 主分析函数 ─────────────────────────────────────────
  async function handleAnalyze() {
    if (!csvText.trim()) return;
    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const session = loadSession();
      const proto = session?.protocol as Record<string, unknown> | undefined;
      const protocolContext = proto
        ? `实验方案：${proto.title ?? proto.description ?? ""}\n目标：${proto.objective ?? ""}`
        : undefined;

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv_text: csvText,
          dataset_name: fileName ?? "experiment.csv",
          protocol_context: protocolContext,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.detail ?? `服务器错误 ${response.status}`);
      }

      const data = await response.json() as AnalysisOutput;
      setResult(data);

      const prev = loadSession() ?? {};
      saveSession({ ...prev, analysis: data, _lastCsvText: csvText } as typeof prev);

    } catch (e) {
      setError(e instanceof Error ? e.message : "未知错误，请检查后端是否启动");
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* 页面标题 */}
      <div>
        <h1 className="text-3xl font-bold text-slate-800">🔬 数据分析</h1>
        <p className="text-slate-500 mt-1">上传或粘贴 CSV 数据，程序自动检测质量问题，AI 辅助解释</p>
      </div>

      {protocolTitle && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <span className="font-medium text-blue-700">📋 当前实验：</span>
          <span className="text-blue-600 ml-1">{protocolTitle}</span>
        </div>
      )}

      {/* 输入区域卡片 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">

        {/* ── 拖拽上传区域 ────────────────────────────────── */}
        {/* C++ 类比：一个带事件监听的 div，响应 dragover/drop 事件 */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}  // 点击也能触发文件选择
          className={[
            // 基础样式：虚线边框、圆角、居中、可点击
            "flex flex-col items-center justify-center gap-2 cursor-pointer",
            "border-2 border-dashed rounded-xl py-7 px-4 transition-colors select-none",
            // 拖拽悬停时高亮，否则显示灰色虚线
            isDragging
              ? "border-blue-400 bg-blue-50"
              : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
          ].join(" ")}
        >
          {/* 图标 + 文字提示 */}
          <span className="text-3xl">{isDragging ? "📂" : "⬆️"}</span>
          <p className="text-sm font-medium text-slate-600">
            {fileName
              ? `已选择：${fileName}`
              : "拖拽 CSV 文件到这里"}
          </p>
          <p className="text-xs text-slate-400">
            {fileName ? "点击可重新选择" : "或点击选择文件"}
          </p>

          {/* 隐藏的原生文件输入，由 ref 控制，不直接显示 */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileInputChange}
            // 阻止点击 input 冒泡到父 div，避免触发两次文件选择弹窗
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* CSV 文本框 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            CSV 数据 <span className="text-slate-400 font-normal">（也可直接粘贴）</span>
          </label>
          <textarea
            className="w-full h-40 p-3 border border-slate-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
            placeholder={"粘贴 CSV 数据，例如：\ntime,temperature,absorbance\n0,25,0.12\n30,37,0.45\n60,60,0.08"}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
        </div>

        {/* 分析按钮 */}
        <button
          onClick={handleAnalyze}
          disabled={!csvText.trim() || isAnalyzing}
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
        >
          {isAnalyzing ? "⏳ 分析中..." : "开始分析"}
        </button>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            ❌ {error}
          </div>
        )}
      </div>

      {/* ── 分析结果展示区域 ────────────────────────────── */}
      {result && (
        <div className="space-y-5">

          {/* 质量评分卡片 */}
          <div className={`p-5 border rounded-xl ${qualityColor(result.quality_level)}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium opacity-70">数据质量评分</p>
                <p className="text-4xl font-bold mt-1">{result.quality_score}</p>
                <p className="text-sm mt-1">
                  等级：<span className="font-semibold">{result.quality_level}</span>
                  &nbsp;·&nbsp;{result.row_count} 行 × {result.column_count} 列
                  &nbsp;·&nbsp;发现 {result.issues.length} 个问题
                </p>
              </div>
              <div className="text-5xl opacity-20 font-black">{result.quality_score}</div>
            </div>
          </div>

          {/* 问题列表 */}
          {result.issues.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-semibold text-slate-700">🔍 程序检测到的问题</h2>
                <span className="text-xs text-slate-400">共 {result.issues.length} 条</span>
              </div>
              <ul className="divide-y divide-slate-50">
                {result.issues.slice(0, 30).map((issue, i) => (
                  <li key={i} className="px-5 py-3 flex items-start gap-3 text-sm">
                    <span className="mt-0.5 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 shrink-0">
                      {issueTypeLabel(issue.type)}
                    </span>
                    <span className={`mt-0.5 px-2 py-0.5 rounded text-xs font-medium shrink-0 ${severityColor(issue.severity)}`}>
                      {issue.severity === "high" ? "高" : issue.severity === "medium" ? "中" : "低"}
                    </span>
                    <span className="text-slate-600">{issue.message}</span>
                  </li>
                ))}
              </ul>
              {result.issues.length > 30 && (
                <div className="px-5 py-2 text-xs text-slate-400 border-t border-slate-100">
                  还有 {result.issues.length - 30} 条问题未显示
                </div>
              )}
            </div>
          )}

          {/* 统计数据表格 */}
          {Object.keys(result.statistics).length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <h2 className="font-semibold text-slate-700">📊 各列统计数据</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                      <th className="px-5 py-2 text-left">列名</th>
                      <th className="px-5 py-2 text-right">最小值</th>
                      <th className="px-5 py-2 text-right">最大值</th>
                      <th className="px-5 py-2 text-right">平均值</th>
                      <th className="px-5 py-2 text-right">中位数</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {Object.entries(result.statistics).map(([col, stats]) => (
                      <tr key={col} className="hover:bg-slate-50">
                        <td className="px-5 py-2.5 font-medium text-slate-700">{col}</td>
                        <td className="px-5 py-2.5 text-right text-slate-500">{stats.min ?? "—"}</td>
                        <td className="px-5 py-2.5 text-right text-slate-500">{stats.max ?? "—"}</td>
                        <td className="px-5 py-2.5 text-right text-slate-500">{stats.mean ?? "—"}</td>
                        <td className="px-5 py-2.5 text-right text-slate-500">{stats.median ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 折线图（统计表格下方）*/}
          <DataChart chartData={result.chart_data} issues={result.issues} />

          {/* AI 解释卡片 */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-700">🤖 AI 分析解读</h2>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                result.ai_explanation.confidence === "high"
                  ? "bg-green-100 text-green-700"
                  : result.ai_explanation.confidence === "medium"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-slate-100 text-slate-500"
              }`}>
                置信度：{result.ai_explanation.confidence === "high" ? "高" : result.ai_explanation.confidence === "medium" ? "中" : "低"}
              </span>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">可能原因</p>
              <ul className="space-y-1">
                {result.ai_explanation.possible_causes.map((cause, i) => (
                  <li key={i} className="text-sm text-slate-600 flex gap-2">
                    <span className="text-slate-300 shrink-0">•</span>
                    {cause}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">建议操作</p>
              <ul className="space-y-1">
                {result.ai_explanation.suggested_actions.map((action, i) => (
                  <li key={i} className="text-sm text-slate-600 flex gap-2">
                    <span className="text-blue-400 shrink-0">→</span>
                    {action}
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-600 border border-slate-100">
              <span className="font-medium text-slate-700">对结论的影响：</span>
              {result.ai_explanation.impact_on_conclusion}
            </div>
          </div>

          {/* 跳转到报告的按钮 */}
          <button
            onClick={() => router.push("/report")}
            className="w-full py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            生成报告 →
          </button>
        </div>
      )}
    </div>
  );
}
