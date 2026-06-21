"use client";

import { usePathname, useRouter } from "next/navigation";
import { STEPS, type Step, currentStepFromPath, confirmAndClearForStep } from "@/lib/steps";

export default function ProgressBar() {
  const pathname = usePathname();
  const router = useRouter();

  const currentStep = currentStepFromPath(pathname);

  function handleStepClick(target: Step) {
    if (target.step === currentStep) return;
    if (confirmAndClearForStep(target.step)) {
      router.push(target.path);
    }
  }

  return (
    <div className="w-full bg-white border-b border-slate-200 px-6 py-4">
      <div className="max-w-2xl mx-auto flex items-center gap-3">
        <button
          onClick={() => router.push("/")}
          title="Back to Home"
          className={[
            "shrink-0 flex flex-col items-center justify-center w-12 transition-colors",
            pathname === "/" ? "text-blue-600" : "text-slate-400 hover:text-blue-600",
          ].join(" ")}
        >
          <span className="text-xl leading-none">🏠</span>
          <span className="text-xs font-semibold mt-1">Home</span>
        </button>

        <div className="h-8 w-px bg-slate-200 shrink-0" />

        <div className="flex items-center justify-between flex-1">
          {STEPS.map((s, index) => (
            <div key={s.step} className="flex items-center flex-1">
              <button
                onClick={() => handleStepClick(s)}
                title={`Go to ${s.desc}`}
                className="flex flex-col items-center flex-1 group cursor-pointer"
              >
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

      <p className="max-w-2xl mx-auto mt-2 text-center text-xs text-slate-400">
        💡 Click any step above to switch freely. Going back to an earlier step clears the content generated in later steps.
      </p>
    </div>
  );
}
