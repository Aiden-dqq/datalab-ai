import { loadSession, saveSession, type ProjectSession } from "./session";

export const STEPS = [
  { path: "/protocol", step: 1, label: "Protocol", desc: "Build Protocol", keys: ["protocol"] },
  { path: "/analyze",  step: 2, label: "Analyze",  desc: "Data Analysis", keys: ["analysis", "_lastCsvText"] },
  { path: "/report",   step: 3, label: "Report",   desc: "Generate Report", keys: ["report"] },
] as const;

export type Step = (typeof STEPS)[number];

export function currentStepFromPath(pathname: string): number {
  return STEPS.find((s) => pathname.startsWith(s.path))?.step ?? 0;
}

export function confirmAndClearForStep(targetStep: number): boolean {
  const session = (loadSession() ?? {}) as unknown as Record<string, unknown>;
  const laterSteps = STEPS.filter((s) => s.step > targetStep);
  const affected = laterSteps.filter((s) => s.keys.some((k) => session[k] != null));

  if (affected.length > 0) {
    const target = STEPS.find((s) => s.step === targetStep);
    const names = affected.map((s) => s.desc).join(", ");
    const ok = window.confirm(
      `Going back to "${target?.desc ?? ""}" will discard the content already generated in the later steps (${names}).\n\nAre you sure you want to go back?`
    );
    if (!ok) return false;

    const cleaned = { ...session };
    laterSteps.forEach((s) => s.keys.forEach((k) => delete cleaned[k]));
    saveSession(cleaned as unknown as ProjectSession);
  }
  return true;
}
