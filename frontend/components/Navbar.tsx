// ============================================================
// components/Navbar.tsx — 顶部导航栏组件
// ============================================================
//
// 导航栏的 ①②③ 与顶部阶段索引（ProgressBar）行为一致：
// 点击返回较早步骤时，会弹确认框并清除其后步骤已生成的内容。
// Logo 则是自由返回主页（不清除数据）。
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { STEPS, type Step, currentStepFromPath, confirmAndClearForStep } from "@/lib/steps";

// 步骤编号 → 圆圈数字（保持原导航栏的 ①②③ 样式）
const CIRCLED = ["", "①", "②", "③"];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const currentStep = currentStepFromPath(pathname);

  // 点击导航项：与 ProgressBar 共用同一套确认 + 清除逻辑
  function handleNavClick(target: Step) {
    if (target.step === currentStep) return;     // 已在该页，不动
    if (confirmAndClearForStep(target.step)) {   // 确认（或无需确认）才跳转
      router.push(target.path);
    }
  }

  return (
    <nav className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between shadow-md">
      {/* ── Logo：自由返回主页（不清除数据）── */}
      <Link href="/" className="text-xl font-bold tracking-tight hover:text-blue-400 transition-colors">
        🧪 DataLab AI
      </Link>

      {/* ── 右侧步骤导航 ── */}
      <div className="flex gap-1">
        {STEPS.map((s) => {
          const isActive = pathname.startsWith(s.path);
          return (
            <button
              key={s.path}
              onClick={() => handleNavClick(s)}
              className={[
                "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-600 text-white"            // 当前页：蓝色高亮
                  : "text-slate-300 hover:bg-slate-700", // 其他页：悬停变深
              ].join(" ")}
            >
              {`${CIRCLED[s.step]} ${s.desc}`}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
