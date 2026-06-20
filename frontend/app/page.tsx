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
// 这是服务器组件（没有 "use client"），在服务器端渲染成 HTML 后发给浏览器。
// ============================================================

import Link from "next/link";

export default function HomePage() {
  return (
    // 整体垂直居中布局
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-6">
      {/* 大标题 */}
      <div className="space-y-2">
        <h1 className="text-5xl font-extrabold text-slate-800">
          🧪 DataLab AI
        </h1>
        <p className="text-xl text-slate-500">
          智能实验工作流平台 — 从方案到报告，一步到位
        </p>
      </div>

      {/* 功能卡片区域 */}
      {/* grid grid-cols-3 gap-4 → 三列网格布局，间距 16px */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl mt-4">
        {/* 卡片 1：实验方案 */}
        <Link
          href="/protocol"
          className="group p-6 bg-white rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-lg transition-all"
        >
          <div className="text-3xl mb-2">📋</div>
          <h2 className="text-lg font-semibold text-slate-800 group-hover:text-blue-600">
            Step 1: Protocol
          </h2>
          <p className="text-sm text-slate-500 mt-1">填写实验方案与目标</p>
        </Link>

        {/* 卡片 2：数据分析 */}
        <Link
          href="/analyze"
          className="group p-6 bg-white rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-lg transition-all"
        >
          <div className="text-3xl mb-2">🔬</div>
          <h2 className="text-lg font-semibold text-slate-800 group-hover:text-blue-600">
            Step 2: Analyze
          </h2>
          <p className="text-sm text-slate-500 mt-1">上传数据，AI 辅助分析</p>
        </Link>

        {/* 卡片 3：生成报告 */}
        <Link
          href="/report"
          className="group p-6 bg-white rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-lg transition-all"
        >
          <div className="text-3xl mb-2">📄</div>
          <h2 className="text-lg font-semibold text-slate-800 group-hover:text-blue-600">
            Step 3: Report
          </h2>
          <p className="text-sm text-slate-500 mt-1">自动生成实验报告</p>
        </Link>
      </div>

      {/* 开始按钮 */}
      <Link
        href="/protocol"
        className="mt-4 px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-md"
      >
        开始实验 →
      </Link>
    </div>
  );
}
