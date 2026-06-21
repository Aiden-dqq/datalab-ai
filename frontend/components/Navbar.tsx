"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { STEPS, type Step, currentStepFromPath, confirmAndClearForStep } from "@/lib/steps";

const CIRCLED = ["", "①", "②", "③"];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const currentStep = currentStepFromPath(pathname);

  function handleNavClick(target: Step) {
    if (target.step === currentStep) return;
    if (confirmAndClearForStep(target.step)) {
      router.push(target.path);
    }
  }

  return (
    <nav className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between shadow-md">
      <Link href="/" className="text-xl font-bold tracking-tight hover:text-blue-400 transition-colors">
        🧪 DataLab AI
      </Link>

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
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-700",
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
