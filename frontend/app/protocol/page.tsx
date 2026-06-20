"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loadSession, saveSession } from "@/lib/session";

export default function ProtocolPage() {
  const [description, setDescription] = useState("");
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  function handleSave() {
    const session = loadSession() ?? {};
    saveSession({
      ...session,
      protocol: {
        description,
        createdAt: new Date().toISOString(),
      } as any,
    });
    setSaved(true);
    setTimeout(() => router.push("/analyze"), 1500);
  }

  return (
    <>
      <div className="page-header">
        <span className="badge badge-primary">Step 1</span>
        <h1>📋 Experiment Protocol</h1>
        <p>Describe your experiment objectives, hypotheses, and methods.</p>
      </div>

      <div className="form-section">
        <div className="form-group">
          <label>
            Protocol Description
          </label>
          <textarea
            placeholder="e.g. This experiment investigates the effect of temperature on enzyme activity using a controlled variable approach..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="button-row">
          <button
            onClick={handleSave}
            disabled={!description.trim()}
            className="btn btn-primary"
          >
            Save & Continue →
          </button>
        </div>

        {saved && (
          <p style={{ marginTop: 12, color: "var(--success)", fontWeight: 600, fontSize: 14 }}>
            ✅ Saved! Redirecting to data analysis...
          </p>
        )}
      </div>

      <div className="warning-strip">
        🚧 Coming soon: AI-assisted protocol generation and literature search
      </div>
    </>
  );
}
