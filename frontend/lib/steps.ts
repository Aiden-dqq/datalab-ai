// ============================================================
// lib/steps.ts — 三步流程的共享配置与导航逻辑
// ============================================================
//
// 把"步骤定义 + 返回时的确认/清除逻辑"集中在这里，
// 供顶部阶段索引（ProgressBar）和导航栏（Navbar）共用，行为保持一致。
// ============================================================

import { loadSession, saveSession, type ProjectSession } from "./session";

// ─── 步骤配置 ──────────────────────────────────────────────
// keys：该步骤"拥有"的 session 数据字段（返回更早步骤时，靠它清除后续内容）
//   _lastCsvText 不是 ProjectSession 的正式字段，但 analyze 页用它回填 CSV 文本框，
//   所以这里也一并清掉。
export const STEPS = [
  { path: "/protocol", step: 1, label: "Protocol", desc: "实验方案", keys: ["protocol"] },
  { path: "/analyze",  step: 2, label: "Analyze",  desc: "数据分析", keys: ["analysis", "_lastCsvText"] },
  { path: "/report",   step: 3, label: "Report",   desc: "生成报告", keys: ["report"] },
] as const;

export type Step = (typeof STEPS)[number];

// 根据当前 URL 路径算出当前步骤编号（1/2/3）；首页等返回 0
export function currentStepFromPath(pathname: string): number {
  return STEPS.find((s) => pathname.startsWith(s.path))?.step ?? 0;
}

// ─── 返回某步：必要时确认 + 清除后续数据 ─────────────────────
// 行为：
//   - 若"目标步之后"存在已生成的数据 → 弹确认框提醒不保存
//     · 用户取消 → 返回 false（调用方不应跳转）
//     · 用户确认 → 清除后续步骤数据，返回 true
//   - 若后面没有数据 → 直接返回 true（无打扰）
// 只能在客户端（浏览器）调用，因为用到 window.confirm / localStorage。
export function confirmAndClearForStep(targetStep: number): boolean {
  const session = (loadSession() ?? {}) as unknown as Record<string, unknown>;
  const laterSteps = STEPS.filter((s) => s.step > targetStep);
  // 后续步骤里，哪些真的有数据（会被清掉）
  const affected = laterSteps.filter((s) => s.keys.some((k) => session[k] != null));

  if (affected.length > 0) {
    const target = STEPS.find((s) => s.step === targetStep);
    const names = affected.map((s) => s.desc).join("、");
    const ok = window.confirm(
      `返回「${target?.desc ?? ""}」后，后面步骤（${names}）已生成的内容将不会保存。\n\n是否确认返回上一步？`
    );
    if (!ok) return false;

    // 清除目标步之后所有步骤的数据
    const cleaned = { ...session };
    laterSteps.forEach((s) => s.keys.forEach((k) => delete cleaned[k]));
    saveSession(cleaned as unknown as ProjectSession);
  }
  return true;
}
