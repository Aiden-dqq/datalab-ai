// ============================================================
// app/report/page.tsx — AI Report Generator（路由：/report）
// ============================================================
//
// 功能：
//   1. 读取 session.protocol + session.analysis
//   2. 无数据时：提示补充 或 一键加载 Demo Data
//   3. 用户可填写报告格式要求（自定义关注点）
//   4. POST /api/report → Claude 生成五章节 Markdown 报告
//   5. 结构化章节卡片预览 + Copy Report（Markdown → 剪贴板）
//   6. API 失败时后端自动回退本地模板，前端无感知
//
// TypeScript 速查（假设你懂 C++）：
//   useState<T>(v)   ← 类型为 T 的响应式变量，改变时触发重渲染
//   useEffect(f,[])  ← 只在组件首次加载时执行一次（相当于构造函数）
//   type / interface ← 等价于 C++ 的 struct
//   string | null    ← 等价于 C++ 的 std::optional<std::string>
//   async / await    ← 等价于 C++ 的 std::future / co_await
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

// ============================================================
// Demo 数据（当用户尚未完成前两步时，一键加载用于展示）
// C++ 类比：constexpr ProtocolOutput DEMO_PROTOCOL = { ... };
// ============================================================

const DEMO_PROTOCOL: ProtocolOutput = {
  title: "温度对淀粉酶活性影响实验",
  objective: "探究不同温度条件下淀粉酶催化淀粉水解的活性变化规律，确定最适反应温度",
  assumptions: ["环境湿度保持恒定（相对湿度 50%）", "pH 维持在 7.0", "每次实验使用等量新鲜酶液"],
  equipment: ["恒温水浴锅", "分光光度计（580 nm）", "移液枪（0.5 mL）", "计时器", "碘液"],
  variables: [
    { name: "temperature", unit: "°C",  type: "numeric", required: true  },
    { name: "absorbance",  unit: "AU",  type: "numeric", required: true  },
    { name: "time",        unit: "s",   type: "time",    required: true  },
  ],
  sampling_frequency: "每 60 秒记录一次吸光度",
  expected_interval_minutes: 1,
  expected_duration_minutes: 30,
  procedure_steps: [
    "配制 1% 淀粉溶液 50 mL，备用",
    "将淀粉酶液分别置于 20 °C、37 °C、60 °C 水浴中预热 5 分钟",
    "各温度组同时加入等量淀粉溶液，立即计时",
    "每 60 秒取样 0.5 mL，加碘液后在 580 nm 处测吸光度",
    "记录至吸光度不再下降（反应完成）为止",
  ],
  control_conditions: ["pH 7.0 磷酸缓冲液", "酶液浓度统一为 0.1 mg/mL", "每组实验重复 3 次"],
  possible_errors: ["人为计时误差（±2 s）", "取样量不一致", "分光光度计示数波动"],
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
      column: "absorbance", message: "第 45 行吸光度 1.92 超出正常范围", value: 1.92,
    },
    {
      type: "missing",  severity: "medium", row_index: 28,
      column: "temperature", message: "第 28 行 temperature 列为空",
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
      "37 °C 条件下酶活性最高，符合淀粉酶最适温度范围",
      "60 °C 组吸光度下降缓慢，提示高温导致酶部分失活",
    ],
    suggested_actions: [
      "过滤第 45 行离群值后重新计算各组统计量",
      "补充第 28 行温度数据（可根据实验记录手册核查）",
    ],
    impact_on_conclusion:
      "整体数据质量良好，离群值数量少（1 / 90），对核心结论影响有限",
    confidence: "high",
  },
};

// ============================================================
// 章节元数据（标题 / 颜色主题 / 对应 sections 字段名）
// C++ 类比：const SectionMeta SECTIONS[] = { ... };
// ============================================================

const SECTION_META = [
  {
    key: "introduction" as const,
    label: "1. Introduction",
    sublabel: "引言",
    color: "border-blue-400",
    bg: "bg-blue-50",
    badge: "bg-blue-100 text-blue-700",
    icon: "🔬",
  },
  {
    key: "method" as const,
    label: "2. Method",
    sublabel: "实验方法",
    color: "border-violet-400",
    bg: "bg-violet-50",
    badge: "bg-violet-100 text-violet-700",
    icon: "⚗️",
  },
  {
    key: "results" as const,
    label: "3. Results",
    sublabel: "实验结果",
    color: "border-emerald-400",
    bg: "bg-emerald-50",
    badge: "bg-emerald-100 text-emerald-700",
    icon: "📊",
  },
  {
    key: "discussion" as const,
    label: "4. Discussion",
    sublabel: "讨论",
    color: "border-amber-400",
    bg: "bg-amber-50",
    badge: "bg-amber-100 text-amber-700",
    icon: "💬",
  },
  {
    key: "conclusion" as const,
    label: "5. Conclusion",
    sublabel: "结论",
    color: "border-teal-400",
    bg: "bg-teal-50",
    badge: "bg-teal-100 text-teal-700",
    icon: "✅",
  },
] as const;

// ============================================================
// 工具函数：把 Markdown 转成基础 HTML（不引入外部库）
// C++ 类比：std::string markdownToHtml(const std::string& md)
// ============================================================

function mdToHtml(md: string): string {
  return (
    md
      // 代码块 ``` ``` 先处理，防止内部被其他规则误替换
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
      // 无序列表
      .replace(/^- (.+)$/gm, '<li class="rp-li">$1</li>')
      // 有序列表
      .replace(/^\d+\. (.+)$/gm, '<li class="rp-oli">$1</li>')
      // 双换行 → 段落分隔
      .replace(/\n\n/g, '</p><p class="rp-p">')
      // 单换行 → <br>
      .replace(/\n/g, "<br />")
  );
}

// ============================================================
// 子组件：章节卡片（可折叠）
// C++ 类比：void renderSectionCard(SectionMeta meta, string content, bool open)
// ============================================================

function SectionCard({
  meta,
  content,
}: {
  meta: (typeof SECTION_META)[number];
  content: string;
}) {
  // open/closed 状态：默认全部展开
  const [open, setOpen] = useState(true);

  return (
    <div
      className={`rounded-xl border-l-4 ${meta.color} border border-slate-200 overflow-hidden`}
    >
      {/* 章节标题栏（点击可折叠）*/}
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

      {/* 章节内容（折叠时隐藏）*/}
      {open && (
        <div className="px-6 py-5 bg-white">
          {/* 用内联 style 渲染 Markdown，避免外部库依赖 */}
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

// ============================================================
// 子组件：数据来源状态徽章
// ============================================================

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

// ============================================================
// 主页面组件
// ============================================================

export default function ReportPage() {
  // ── 状态变量（C++ 类比：类的成员变量）──────────────────
  const [protocol, setProtocol]         = useState<ProtocolOutput | null>(null);
  const [analysis, setAnalysis]         = useState<AnalysisOutput | null>(null);
  const [usingDemo, setUsingDemo]       = useState(false);   // 是否在用 Demo 数据
  const [userReq, setUserReq]           = useState("");      // 用户格式要求文本
  const [report, setReport]             = useState<ReportOutput | null>(null);
  const [warnings, setWarnings]         = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copySuccess, setCopySuccess]   = useState(false);
  const [activeTab, setActiveTab]       = useState<"sections" | "raw">("sections");

  // ── 初始化：从 localStorage 读取 session ────────────────
  useEffect(() => {
    const session = loadSession();

    // AnalysisOutput 的标志是有 "statistics" 字段
    // 旧版 analyze 页面只保存 {result, analyzedAt}，不含 statistics
    const proto    = session?.protocol ?? null;
    const analysis = (session?.analysis && "statistics" in session.analysis)
      ? (session.analysis as AnalysisOutput)
      : null;

    setProtocol(proto as ProtocolOutput | null);
    setAnalysis(analysis);

    // 如果已有保存的报告，直接展示——但要先校验它是"完整的"。
    // ★ 早期后端异常时可能存下过"残报告"（某些章节为空字符串）。
    //   如果直接恢复，就会出现"Method/Results/Discussion 是空白"的现象。
    //   这里只在五章节都非空时才恢复缓存；否则丢弃它，让用户重新生成一份完整的。
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
      // 不完整 → 不恢复（页面会显示"生成报告"按钮，点一下即可得到完整报告）
    }
  }, []);

  // ── 一键加载 Demo Data ────────────────────────────────
  // 把 DEMO_PROTOCOL / DEMO_ANALYSIS 写入 session，同时更新本地状态
  function handleLoadDemo() {
    const session = loadSession() ?? {};
    saveSession({ ...session, protocol: DEMO_PROTOCOL, analysis: DEMO_ANALYSIS });
    setProtocol(DEMO_PROTOCOL);
    setAnalysis(DEMO_ANALYSIS);
    setUsingDemo(true);
    setReport(null);    // 清除旧报告，让用户重新生成
    setWarnings([]);
  }

  // ── 生成报告：POST /api/report ────────────────────────
  async function handleGenerate() {
    setIsGenerating(true);
    setWarnings([]);
    setReport(null);

    // 判断 analysis 是否是完整的 AnalysisOutput
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

      // 持久化到 localStorage
      const session = loadSession() ?? {};
      saveSession({ ...session, report: newReport });

    } catch (err) {
      // 网络层兜底（后端未启动等）——生成纯前端版报告
      console.error("报告生成失败:", err);

      const hasProt = Boolean(protocol);
      const hasAna  = hasRealAnalysis;

      // ── 前端最终兜底报告 ─────────────────────────────
      const intro = hasProt
        ? `本实验旨在${protocol!.objective}。实验假设：${protocol!.assumptions.slice(0, 2).join("；")}。`
        : "（未提供实验目标）";

      const method = hasProt
        ? `**实验设备**：${protocol!.equipment.join("、")}。\n\n**记录变量**：${protocol!.variables.map((v) => `${v.name}（${v.unit}）`).join("、")}。\n\n**采样频率**：${protocol!.sampling_frequency}。`
        : "未提供实验方案，方法章节无法生成。";

      const results = hasAna
        ? `数据集 **${analysis!.dataset_name}** 共 ${analysis!.row_count} 行，质量评分 **${analysis!.quality_score} / 100**（${analysis!.quality_level}）。`
        : "未提供数据分析结果，无法给出具体实验数值。";

      const discussion = hasProt && protocol!.possible_errors.length
        ? `潜在误差来源：${protocol!.possible_errors.slice(0, 3).join("；")}。`
        : "（后端服务不可用，讨论章节待补充）";

      const conclusion = hasAna
        ? `数据质量等级 ${analysis!.quality_level}，${analysis!.quality_level === "Good" || analysis!.quality_level === "Excellent" ? "结论可信度较高。" : "⚠️ 数据质量偏低，结论存在不确定性。"}`
        : "（缺少数据，无法给出结论）";

      const md = `# ${protocol?.title ?? "实验报告"}\n\n> ⚠️ 后端服务不可用，以下为前端本地兜底报告\n\n## 1. Introduction\n\n${intro}\n\n## 2. Method\n\n${method}\n\n## 3. Results\n\n${results}\n\n## 4. Discussion\n\n${discussion}\n\n## 5. Conclusion\n\n${conclusion}`;

      const fallback: ReportOutput = {
        title:    protocol?.title ?? "实验报告",
        markdown: md,
        sections: { introduction: intro, method, results, discussion, conclusion },
        generated_from: {
          has_protocol: hasProt,
          has_analysis: hasAna,
          dataset_name: analysis?.dataset_name,
        },
        warnings: [`后端服务不可用（${String(err).slice(0, 80)}），以下为前端本地兜底报告`],
      };

      setReport(fallback);
      setWarnings(fallback.warnings);
    } finally {
      setIsGenerating(false);
    }
  }

  // ── 复制报告 Markdown 到剪贴板 ─────────────────────────
  async function handleCopy() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.markdown);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    } catch {
      alert("复制失败，请手动选中文字后复制（Ctrl+A → Ctrl+C）");
    }
  }

  // ── 重新生成（清除报告，保留 protocol/analysis）────────
  function handleReset() {
    setReport(null);
    setWarnings([]);
    const session = loadSession() ?? {};
    // 用解构去掉 report 字段，保留其他字段
    const { report: _r, ...rest } = session;
    saveSession(rest);
  }

  // ── 是否有任何数据 ────────────────────────────────────
  const hasProtocol = Boolean(protocol);
  const hasAnalysis = Boolean(analysis && "statistics" in analysis);
  const hasAnyData  = hasProtocol || hasAnalysis;

  // ============================================================
  // JSX 渲染（C++ 类比：cout << buildHtml()）
  // ============================================================
  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">

      {/* ── 页面标题 ─────────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-bold text-slate-800">📄 AI Report Generator</h1>
        <p className="text-slate-500 mt-1 text-sm">
          整合实验方案与数据分析，由 Claude 生成五章节学术报告。
          报告中所有数值均来自真实数据，不虚构实验结果。
        </p>
      </div>

      {/* ── 数据来源面板 ──────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-700 text-sm">数据来源</h2>
          {usingDemo && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
              Demo 模式
            </span>
          )}
        </div>

        <SourceBadge
          ok={hasProtocol}
          label={
            hasProtocol
              ? `实验方案已加载：${protocol!.title}`
              : "实验方案未填写 —— Introduction / Method 章节内容将有限"
          }
        />
        <SourceBadge
          ok={hasAnalysis}
          label={
            hasAnalysis
              ? `数据分析已加载：${(analysis as AnalysisOutput).dataset_name}（${(analysis as AnalysisOutput).row_count} 行）`
              : "数据分析未完成 —— Results 章节将无法给出具体数值"
          }
        />

        {/* 无数据时：补充提示 + Demo Data 按钮 */}
        {!hasAnyData && (
          <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
            <p className="text-sm text-amber-800 font-medium">
              ⚠️ 尚未完成前两步，报告将缺少关键内容
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/protocol"
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                → 去填写实验方案
              </Link>
              <Link
                href="/analyze"
                className="px-3 py-1.5 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
              >
                → 去上传数据分析
              </Link>
              <button
                onClick={handleLoadDemo}
                className="px-3 py-1.5 text-xs bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors"
              >
                ✨ 使用 Demo Data（快速体验）
              </button>
            </div>
          </div>
        )}

        {/* 有部分数据时：也提供 Demo 按钮（可覆盖）*/}
        {hasAnyData && !usingDemo && (
          <button
            onClick={handleLoadDemo}
            className="text-xs text-slate-400 hover:text-slate-600 underline-offset-2 hover:underline transition-colors"
          >
            或改用 Demo Data 体验完整功能
          </button>
        )}
      </div>

      {/* ── 报告格式要求（用户自定义）─────────────────── */}
      {!report && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-2">
          <label className="block text-sm font-semibold text-slate-700">
            报告格式要求 <span className="font-normal text-slate-400">（选填）</span>
          </label>
          <textarea
            value={userReq}
            onChange={(e) => setUserReq(e.target.value)}
            rows={3}
            placeholder={
              "例如：\n• 使用英文撰写\n• Results 重点分析 temperature 变量\n• Conclusion 给出下一步实验建议"
            }
            className="w-full p-3 border border-slate-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none
                       font-mono leading-relaxed placeholder:text-slate-400"
          />
          <p className="text-xs text-slate-400">
            Claude 会在遵守"数值不编造"铁律的前提下，参考上述格式要求生成报告。
          </p>
        </div>
      )}

      {/* ── 生成按钮 ──────────────────────────────────── */}
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
              Claude 正在生成五章节报告（约 15-25 秒）...
            </>
          ) : (
            "🤖 生成实验报告"
          )}
        </button>
      )}

      {/* ── 警告列表 ──────────────────────────────────── */}
      {warnings.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
          {warnings.map((w, i) => (
            <p key={i} className="text-sm text-amber-800">
              ⚠️ {w}
            </p>
          ))}
        </div>
      )}

      {/* ── 报告区域 ──────────────────────────────────── */}
      {report && (
        <div className="space-y-4">

          {/* 操作栏 */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* 复制报告（Markdown → 剪贴板）*/}
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white
                         rounded-lg font-medium hover:bg-slate-700 transition-colors text-sm"
            >
              {copySuccess ? (
                <>✅ 已复制！可直接粘贴到 Google Docs</>
              ) : (
                <>📋 Copy Report（Markdown）</>
              )}
            </button>

            {/* 重新生成 */}
            <button
              onClick={handleReset}
              className="px-4 py-2.5 bg-white text-slate-600 border border-slate-300
                         rounded-lg font-medium hover:bg-slate-50 transition-colors text-sm"
            >
              🔄 重新生成
            </button>

            {/* 报告标题 */}
            <span className="text-sm text-slate-500 italic flex-1 text-right truncate">
              {report.title}
            </span>
          </div>

          {/* 视图切换标签 */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            <button
              onClick={() => setActiveTab("sections")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === "sections"
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              章节视图
            </button>
            <button
              onClick={() => setActiveTab("raw")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === "raw"
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              原始 Markdown
            </button>
          </div>

          {/* 章节视图：每节一张卡片（可折叠）*/}
          {activeTab === "sections" && (
            <div className="space-y-3">
              {SECTION_META.map((meta) => (
                <SectionCard
                  key={meta.key}
                  meta={meta}
                  content={report.sections[meta.key]}
                />
              ))}
            </div>
          )}

          {/* 原始 Markdown 视图：等宽字体，可全选复制 */}
          {activeTab === "raw" && (
            <div className="bg-slate-900 rounded-xl p-5 overflow-auto max-h-[600px]">
              <pre className="text-slate-100 text-xs leading-relaxed whitespace-pre-wrap font-mono">
                {report.markdown}
              </pre>
            </div>
          )}

          {/* 数据完整性标签（底部小标签）*/}
          <div className="flex flex-wrap gap-2 text-xs text-slate-500 pt-1">
            <span className="px-2 py-1 bg-slate-100 rounded-full">
              {report.generated_from.has_protocol ? "✓ 含实验方案" : "✗ 无实验方案"}
            </span>
            <span className="px-2 py-1 bg-slate-100 rounded-full">
              {report.generated_from.has_analysis
                ? `✓ 含分析数据（${report.generated_from.dataset_name ?? ""}）`
                : "✗ 无分析数据（Results 数值不可用）"}
            </span>
          </div>

        </div>
      )}
    </div>
  );
}
