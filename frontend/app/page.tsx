import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <h1>🧪 DataLab AI</h1>
        <p>AI-Powered Lab Workflow — From Protocol to Report</p>
        <div className="hero-cta">
          <Link href="/protocol" className="btn btn-primary">
            Get Started →
          </Link>
        </div>
      </section>

      <section className="grid">
        <Link href="/protocol" className="card card-link" style={{ display: "block" }}>
          <span className="badge badge-primary">Step 1</span>
          <h2>📋 Protocol</h2>
          <p>Design your experiment protocol — objectives, equipment, variables, and procedure.</p>
          <span className="btn btn-primary btn-sm">Open Protocol Tool</span>
        </Link>

        <Link href="/analyze" className="card card-link" style={{ display: "block" }}>
          <span className="badge badge-success">Step 2</span>
          <h2>🔬 Analyze</h2>
          <p>Upload experiment data. AI checks quality, computes statistics, and explains key trends.</p>
          <span className="btn btn-primary btn-sm">Open Analyzer</span>
        </Link>

        <Link href="/report" className="card card-link" style={{ display: "block" }}>
          <span className="badge badge-warning">Step 3</span>
          <h2>📄 Report</h2>
          <p>Generate a five-section academic report from your protocol and analysis results.</p>
          <span className="btn btn-primary btn-sm">Open Report Tool</span>
        </Link>
      </section>
    </>
  );
}
