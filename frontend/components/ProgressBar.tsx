// ============================================================
// components/ProgressBar.tsx — 三步进度条组件
// ============================================================
//
// 显示 Protocol → Analyze → Report 的当前进度
// 根据当前 URL 路径自动高亮对应的步骤
"use client";

import { usePathname } from "next/navigation";

// ─── 步骤配置 ──────────────────────────────────────────────
// 每个步骤包含：路径匹配规则、步骤编号、步骤名称
const STEPS = [
  { path: "/protocol", step: 1, label: "Protocol",  desc: "实验方案" },
  { path: "/analyze",  step: 2, label: "Analyze",   desc: "数据分析" },
  { path: "/report",   step: 3, label: "Report",    desc: "生成报告" },
];

export default function ProgressBar() {
  const pathname = usePathname();

  // 找到当前步骤编号（1、2 或 3）；首页返回 0（全部灰色）
  // C++ 类比：
  //   int currentStep = 0;
  //   for (auto& s : STEPS) if (pathname == s.path) currentStep = s.step;
  const currentStep = STEPS.find((s) => pathname.startsWith(s.path))?.step ?? 0;

  return (
    // 整个进度条容器：水平 flex，居中，上下间距
    <div className="w-full bg-white border-b border-slate-200 px-6 py-4">
      <div className="max-w-2xl mx-auto flex items-center justify-between">
        {STEPS.map((s, index) => (
          // React.Fragment 是透明容器，相当于 C++ 里把多个语句放在 {} 里
          <div key={s.step} className="flex items-center flex-1">
            {/* ── 单个步骤圆圈 + 文字 ── */}
            <div className="flex flex-col items-center flex-1">
              {/* 圆圈：根据完成状态显示不同颜色 */}
              <div
                className={[
                  "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all",
                  s.step < currentStep
                    ? "bg-green-500 text-white"          // 已完成：绿色
                    : s.step === currentStep
                    ? "bg-blue-600 text-white ring-4 ring-blue-200" // 当前：蓝色+光晕
                    : "bg-slate-200 text-slate-500",     // 未到达：灰色
                ].join(" ")}
              >
                {/* 已完成的步骤显示 ✓，其他显示步骤编号 */}
                {s.step < currentStep ? "✓" : s.step}
              </div>

              {/* 步骤名称文字 */}
              <div className="mt-1 text-center">
                <div
                  className={[
                    "text-xs font-semibold",
                    s.step <= currentStep ? "text-slate-800" : "text-slate-400",
                  ].join(" ")}
                >
                  {s.label}
                </div>
                <div className="text-xs text-slate-400">{s.desc}</div>
              </div>
            </div>

            {/* ── 步骤之间的连接线（最后一步不需要）── */}
            {index < STEPS.length - 1 && (
              <div
                className={[
                  "h-0.5 flex-1 mx-2 mb-6 transition-all",
                  // 如果下一步已到达，连接线变蓝色
                  s.step < currentStep ? "bg-green-400" : "bg-slate-200",
                ].join(" ")}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
