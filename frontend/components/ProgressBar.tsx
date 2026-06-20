"use client";

import { usePathname } from "next/navigation";

const STEPS = [
  { path: "/protocol", step: 1, label: "Protocol", desc: "Design protocol"  },
  { path: "/analyze",  step: 2, label: "Analyze",  desc: "Analyze data"    },
  { path: "/report",   step: 3, label: "Report",   desc: "Generate report" },
];

export default function ProgressBar() {
  const pathname = usePathname();
  const currentStep = STEPS.find((s) => pathname.startsWith(s.path))?.step ?? 0;

  return (
    <div className="progress-bar">
      <div className="progress-steps">
        {STEPS.map((s, index) => (
          <div key={s.step} style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <div className="step">
              <div
                className={[
                  "step-dot",
                  s.step < currentStep  ? "step-dot--done"
                  : s.step === currentStep ? "step-dot--active"
                  : "step-dot--pending",
                ].join(" ")}
              >
                {s.step < currentStep ? "✓" : s.step}
              </div>
              <div className="step-label">
                <div className={`step-name ${s.step <= currentStep ? "" : "step-name--muted"}`}>
                  {s.label}
                </div>
                <div className="step-desc">{s.desc}</div>
              </div>
            </div>

            {index < STEPS.length - 1 && (
              <div
                className={`step-line ${s.step < currentStep ? "step-line--done" : "step-line--pending"}`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
