// ============================================================
// app/page.tsx — 首页（路由：/）
// ============================================================
//
// 在 Next.js App Router 中，文件路径即路由路径：
//   app/page.tsx          → /          （首页）
//   app/protocol/page.tsx → /protocol
//   app/analyze/page.tsx  → /analyze
//   app/report/page.tsx   → /report
//
// 注意：这里用 "use client" 声明为客户端组件，因为 Demo Mode 按钮需要
// 写 localStorage（saveSession）并做编程式跳转（router.push）——这些都是
// 只能在浏览器里跑的操作。
// ============================================================
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  saveSession,
  loadSession,
  type ProtocolOutput,
  type AnalysisOutput,
  type ProjectSession,
} from "@/lib/session";

// ─────────────────────────────────────────────────────────────
// 三个功能卡片的数据（抽成数组，渲染时 map 出来，避免重复写三遍 JSX）
// C++ 类比：vector<FeatureCard> features;
// ─────────────────────────────────────────────────────────────
const FEATURES = [
  {
    href: "/protocol",
    icon: "📋",
    title: "实验方案生成",
    desc: "输入实验目标，AI 自动产出结构化方案：变量、步骤、设备与 CSV 模板。",
  },
  {
    href: "/analyze",
    icon: "🔬",
    title: "数据分析纠错",
    desc: "上传 CSV，程序确定性检测缺失/重复/离群点，AI 解读异常成因。",
  },
  {
    href: "/report",
    icon: "📄",
    title: "实验报告生成",
    desc: "综合方案与数据，一键生成五章节学术报告，数值只引用真实统计。",
  },
];

export default function HomePage() {
  const router = useRouter(); // router.push("/analyze") 用于跳转

  // ── Demo Mode：一键填入示例数据并跳转 ─────────────────────
  // 把预设的"实验方案 + 数据分析结果"写进会话（localStorage），
  // 然后跳到 /analyze —— 分析页挂载时会自动读取并展示完整结果
  // （图表、问题列表、统计表、AI 解读），让用户零输入直接看到效果。
  function handleDemo() {
    // 读取已有会话（保留可能存在的字段），只覆盖 protocol / analysis
    const prev = loadSession() ?? {};
    saveSession({
      ...prev,
      protocol: DEMO_PROTOCOL,
      analysis: DEMO_ANALYSIS,
      // _lastCsvText 不是 ProjectSession 的正式字段，但分析页会读它来回填
      // CSV 文本框；用 as 断言绕过类型检查（与 analyze 页面里的写法一致）。
      _lastCsvText: DEMO_CSV_TEXT,
    } as ProjectSession);
    router.push("/analyze");
  }

  return (
    <div className="flex flex-col items-center text-center gap-8">
      {/* ── 顶部：产品介绍 ───────────────────────────────── */}
      <div className="space-y-3 max-w-2xl">
        <h1 className="text-5xl font-extrabold text-slate-800">
          🧪 DataLab AI
        </h1>
        <p className="text-xl text-slate-500">
          智能实验工作流平台 — 从方案到报告，一步到位
        </p>
        {/* 一段话说清"是什么 + 解决什么问题" */}
        <p className="text-base text-slate-600 leading-relaxed pt-2">
          做实验最耗时的往往不是实验本身，而是<strong>设计方案</strong>、
          <strong>排查数据问题</strong>和<strong>撰写报告</strong>这三件杂事。
          DataLab AI 把它们串成一条流水线：你只需描述想法，AI 帮你生成实验方案、
          自动检测数据质量并解释异常、最后产出规范的实验报告——
          让你把精力真正放回科学问题上。
        </p>
      </div>

      {/* ── 三个功能卡片 ─────────────────────────────────── */}
      {/* grid：手机单列、中等屏及以上三列 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-4xl">
        {FEATURES.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="group p-6 bg-white rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-lg transition-all text-left"
          >
            <div className="text-3xl mb-2">{f.icon}</div>
            <h2 className="text-lg font-semibold text-slate-800 group-hover:text-blue-600">
              {f.title}
            </h2>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">{f.desc}</p>
          </Link>
        ))}
      </div>

      {/* ── 行动按钮区 ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
        {/* 主按钮：开始实验 → /protocol */}
        <Link
          href="/protocol"
          className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-md"
        >
          开始实验 →
        </Link>

        {/* 次按钮：Demo Mode 一键体验（填充示例数据后跳转）*/}
        <button
          onClick={handleDemo}
          className="px-8 py-3 bg-white text-slate-700 border border-slate-300 rounded-lg font-semibold hover:border-blue-400 hover:text-blue-600 transition-colors shadow-sm"
        >
          🎬 Demo Mode 一键体验
        </button>
      </div>

      {/* Demo Mode 的简短说明，降低理解成本 */}
      <p className="text-xs text-slate-400 -mt-4">
        没有数据？点 Demo Mode 自动填入一份示例实验，直接查看分析与报告效果。
      </p>
    </div>
  );
}

// ============================================================
// 以下是 Demo Mode 用的示例数据（模块级常量，不参与每次渲染）
// 它们严格对应 lib/session.ts 里的 ProtocolOutput / AnalysisOutput 类型。
// 主题：温度对淀粉酶活性的影响
// ============================================================

// ── 示例 CSV 文本（与下面 DEMO_ANALYSIS.chart_data 一致）──────
// 第 9 行 absorbance=9.90 是离群点，第 10 行 temperature 缺失。
const DEMO_CSV_TEXT = `time,temperature,absorbance
0,25,0.10
1,30,0.22
2,37,0.45
3,40,0.51
4,45,0.48
5,50,0.30
6,55,0.18
7,60,0.09
8,37,9.90
9,,0.40`;

// ── 示例实验方案 ─────────────────────────────────────────────
const DEMO_PROTOCOL: ProtocolOutput = {
  title: "温度对淀粉酶催化活性的影响",
  objective: "研究不同温度（25~60°C）下淀粉酶催化淀粉水解的活性变化，找出最适温度",
  assumptions: [
    "淀粉酶溶液浓度与批次保持一致",
    "底物（淀粉）浓度恒定",
    "除温度外其他环境因素（pH、湿度）基本恒定",
  ],
  equipment: ["恒温水浴锅", "分光光度计", "移液枪", "计时器", "试管若干"],
  variables: [
    { name: "time", unit: "min", type: "time", required: true },
    { name: "temperature", unit: "°C", type: "numeric", required: true },
    { name: "absorbance", unit: "a.u.", type: "numeric", required: true },
  ],
  sampling_frequency: "每 1 分钟记录一次",
  expected_interval_minutes: 1,
  expected_duration_minutes: 10,
  procedure_steps: [
    "配制相同浓度的淀粉酶溶液与淀粉底物溶液",
    "将水浴锅依次设定到 25、30、37…60°C 各目标温度",
    "在每个温度下混合酶与底物，启动计时",
    "按设定频率取样，用分光光度计测量吸光度",
    "记录数据并在实验结束后整理、剔除异常值",
  ],
  control_conditions: [
    "每组使用相同体积的酶液与底物",
    "同一台分光光度计、同一波长测量",
    "由同一名操作者完成全部测量",
  ],
  possible_errors: [
    "水浴温度波动带来的系统误差",
    "取样/计时的人为误差",
    "比色皿污染导致的读数异常",
  ],
  csv_template: "time,temperature,absorbance",
};

// ── 示例数据分析结果 ─────────────────────────────────────────
const DEMO_ANALYSIS: AnalysisOutput = {
  dataset_name: "demo_amylase.csv",
  row_count: 10,
  column_count: 3,
  quality_score: 88,
  quality_level: "Good",
  issues: [
    {
      type: "outlier",
      severity: "high",
      row_index: 8,
      column: "absorbance",
      message: "第 8 行 absorbance 列值 9.9 远超正常范围，疑似比色皿污染或读数错误",
      value: 9.9,
    },
    {
      type: "missing",
      severity: "medium",
      row_index: 9,
      column: "temperature",
      message: "第 9 行 temperature 列存在缺失值（空）",
    },
  ],
  statistics: {
    time: { min: 0, max: 9, mean: 4.5, median: 4.5 },
    temperature: { min: 25, max: 60, mean: 42.11, median: 40 },
    absorbance: { min: 0.09, max: 9.9, mean: 1.263, median: 0.42 },
  },
  // 绘图数据：缺失的 temperature 用 null 表示（前端画图会自然跳过）
  chart_data: [
    { time: 0, temperature: 25, absorbance: 0.1 },
    { time: 1, temperature: 30, absorbance: 0.22 },
    { time: 2, temperature: 37, absorbance: 0.45 },
    { time: 3, temperature: 40, absorbance: 0.51 },
    { time: 4, temperature: 45, absorbance: 0.48 },
    { time: 5, temperature: 50, absorbance: 0.3 },
    { time: 6, temperature: 55, absorbance: 0.18 },
    { time: 7, temperature: 60, absorbance: 0.09 },
    { time: 8, temperature: 37, absorbance: 9.9 },
    { time: 9, temperature: null as unknown as number, absorbance: 0.4 },
  ],
  ai_explanation: {
    possible_causes: [
      "第 8 行吸光度异常偏高，最可能是比色皿残留污染或气泡导致的读数错误",
      "第 9 行温度缺失，推测为记录时遗漏或水浴显示读数不清",
      "高温段（55~60°C）吸光度下降，符合酶在高温下逐渐失活的预期",
    ],
    suggested_actions: [
      "复测或剔除第 8 行的异常吸光度后再做趋势分析",
      "补测第 9 行的温度，或在分析时忽略该行",
      "围绕 37~40°C 加密采样，更精确地定位最适温度",
    ],
    impact_on_conclusion:
      "异常值与缺失各 1 处、占比很小，剔除后不影响‘存在最适温度’这一主结论，结论可信度较高。",
    confidence: "high",
  },
  // 逐问题错误诊断（与上面 issues 一一对应）
  error_diagnosis: [
    {
      issue_index: 0, // 对应 absorbance=9.9 的离群点
      is_acceptable: false,
      error_type: "equipment_error",
      related_step: "步骤 4（用分光光度计测量吸光度）。9.9 远超正常范围，最可能是比色皿污染或气泡导致读数异常",
      suggestion: "比色前清洁并校零比色皿、排除气泡，复测该点；确属异常则剔除后再分析",
    },
    {
      issue_index: 1, // 对应 temperature 缺失
      is_acceptable: false,
      error_type: "recording_error",
      related_step: "步骤 5（记录数据）。温度缺失最可能是记录时遗漏或读数不清",
      suggestion: "补录该行温度，或在分析时忽略该行；建议改用自动温度记录避免漏记",
    },
  ],
};
