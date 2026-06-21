// ============================================================
// components/ProgressBar.tsx — 三步进度条 / 阶段索引（可点击导航）
// ============================================================
//
// 显示 Protocol → Analyze → Report 的当前进度，并支持：
//   1. 点击任意步骤自由切换；点「🏠 主页」回到首页
//   2. 若点击的目标步骤"后面"还有已生成的数据，会弹确认框提醒——
//      返回后这些后续步骤的内容不保存
//   3. 确认返回后，清除目标步骤之后所有步骤的数据
"use client";

import { usePathname, useRouter } from "next/navigation";
import { STEPS, type Step, currentStepFromPath, confirmAndClearForStep } from "@/lib/steps";

export default function ProgressBar() {
  const pathname = usePathname();
  const router = useRouter();

  // 当前步骤编号（1/2/3）；首页返回 0（全部灰色）
  const currentStep = currentStepFromPath(pathname);

  // ── 点击某个步骤：必要时确认 + 清除后续数据，再跳转 ──────────
  function handleStepClick(target: Step) {
    if (target.step === currentStep) return;     // 已在该步，不动
    if (confirmAndClearForStep(target.step)) {   // 用户确认（或无需确认）才跳转
      router.push(target.path);
    }
  }

  return (
    <div className="w-full bg-white border-b border-slate-200 px-6 py-4">
      <div className="max-w-2xl mx-auto flex items-center gap-3">
        {/* ── 主页入口：随时自由返回首页（不清除数据）── */}
        <button
          onClick={() => router.push("/")}
          title="返回主页"
          className={[
            "shrink-0 flex flex-col items-center justify-center w-12 transition-colors",
            pathname === "/" ? "text-blue-600" : "text-slate-400 hover:text-blue-600",
          ].join(" ")}
        >
          <span className="text-xl leading-none">🏠</span>
          <span className="text-xs font-semibold mt-1">主页</span>
        </button>

        {/* 主页与步骤之间的分隔 */}
        <div className="h-8 w-px bg-slate-200 shrink-0" />

        {/* ── 三个步骤 ── */}
        <div className="flex items-center justify-between flex-1">
          {STEPS.map((s, index) => (
            <div key={s.step} className="flex items-center flex-1">
              {/* 单个步骤：整体可点击 */}
              <button
                onClick={() => handleStepClick(s)}
                title={`前往「${s.desc}」`}
                className="flex flex-col items-center flex-1 group cursor-pointer"
              >
                {/* 圆圈：根据完成状态显示不同颜色，hover 时有反馈 */}
                <div
                  className={[
                    "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all",
                    "group-hover:ring-4 group-hover:ring-blue-100",
                    s.step < currentStep
                      ? "bg-green-500 text-white"
                      : s.step === currentStep
                      ? "bg-blue-600 text-white ring-4 ring-blue-200"
                      : "bg-slate-200 text-slate-500 group-hover:bg-slate-300",
                  ].join(" ")}
                >
                  {s.step < currentStep ? "✓" : s.step}
                </div>

                {/* 步骤名称文字 */}
                <div className="mt-1 text-center">
                  <div
                    className={[
                      "text-xs font-semibold transition-colors",
                      s.step <= currentStep ? "text-slate-800" : "text-slate-400",
                      "group-hover:text-blue-600",
                    ].join(" ")}
                  >
                    {s.label}
                  </div>
                  <div className="text-xs text-slate-400">{s.desc}</div>
                </div>
              </button>

              {/* 步骤之间的连接线（最后一步不需要）*/}
              {index < STEPS.length - 1 && (
                <div
                  className={[
                    "h-0.5 flex-1 mx-2 mb-6 transition-all",
                    s.step < currentStep ? "bg-green-400" : "bg-slate-200",
                  ].join(" ")}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 小提示：说明点击可切换、返回会清后续 */}
      <p className="max-w-2xl mx-auto mt-2 text-center text-xs text-slate-400">
        💡 点击上方步骤可自由切换；返回较早步骤会清除其后步骤已生成的内容
      </p>
    </div>
  );
}
