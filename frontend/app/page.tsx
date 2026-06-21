"use client";

import { useEffect, useState } from "react";

const features = [
  {
    id: "protocol",
    tab: "Protocol Builder",
    title: "Protocol Builder",
    label: "Function 01",
    desc: "Turn a high-level experiment goal into a structured protocol with variables, steps, equipment, and a data table template.",
    video: "/videos/prediction.mp4",
    route: "/protocol",
    chips: ["Goal Input", "Variables", "Steps", "CSV Template"],
    points: [
      "Break down experiment goals",
      "Generate variable design",
      "Plan step-by-step procedures",
      "Create data recording templates",
    ],
  },
  {
    id: "quality",
    tab: "Data Quality Diagnosis",
    title: "Data Quality Diagnosis",
    label: "Function 02",
    desc: "Upload measured experiment data and automatically detect missing values, duplicates, outliers, and abnormal trends.",
    video: "/videos/cleaning.mp4",
    route: "/analyze",
    chips: ["CSV Upload", "Missing Check", "Outliers", "Quality Score"],
    points: [
      "Detect missing and duplicate data",
      "Identify outliers and abnormal values",
      "Analyze data trend issues",
      "Generate data quality feedback",
    ],
  },
  {
    id: "report",
    tab: "Report Generator",
    title: "Report Generator",
    label: "Function 03",
    desc: "Combine the experiment protocol and analyzed data into a structured academic-style report with traceable suggestions.",
    video: "/videos/compare.mp4",
    route: "/report",
    chips: ["Protocol", "Data Analysis", "Report Draft", "Suggestions"],
    points: [
      "Combine protocol and results",
      "Reference real measured data",
      "Generate structured reports",
      "Highlight areas to improve",
    ],
  },
];

const sponsorTools = [
  {
    name: "Claude",
    logo: "https://cdn.simpleicons.org/claude",
  },
  {
    name: "Sentry",
    logo: "https://cdn.simpleicons.org/sentry",
  },
  {
    name: "Arize",
    logo: "https://www.google.com/s2/favicons?domain=arize.com&sz=128",
  },
];

const softwareTools = [
  {
    name: "Next.js",
    logo: "https://cdn.simpleicons.org/nextdotjs",
  },
  {
    name: "React",
    logo: "https://cdn.simpleicons.org/react",
  },
  {
    name: "FastAPI",
    logo: "https://cdn.simpleicons.org/fastapi",
  },
  {
    name: "Python",
    logo: "https://cdn.simpleicons.org/python",
  },
  {
    name: "Pandas",
    logo: "https://cdn.simpleicons.org/pandas",
  },
  {
    name: "Tailwind CSS",
    logo: "https://cdn.simpleicons.org/tailwindcss",
  },
  {
    name: "GitHub",
    logo: "https://cdn.simpleicons.org/github",
  },
  {
    name: "DataLab AI",
    logo: "",
  },
];

export default function Home() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [videoError, setVideoError] = useState(false);

  const active = features[activeIndex];

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((current) => (current + 1) % features.length);
    }, 3000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setVideoError(false);
  }, [activeIndex]);

  const scrollToDemo = () => {
    document.getElementById("demo-section")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <main className="landingPage">
      <header className="topbar">
        <div className="topbarInner">
          <div className="leftNavGroup">
            <a className="brand" href="/">
              <span className="brandIcon">⚗</span>
              <span>DataLab AI</span>
            </a>

            <nav className="navLinks" aria-label="Main Navigation">
              <a href="/protocol">Protocol</a>
              <a href="/analyze">Data Analysis</a>
              <a href="/report">Report</a>
            </nav>
          </div>

          <a className="letsStartButton" href="/protocol">
            Let&apos;s Start
            <span>›</span>
          </a>
        </div>
      </header>

      <section className="heroSection">
        <div className="heroGlow heroGlowLeft" />
        <div className="heroGlow heroGlowRight" />

        <div className="heroBadge">✦ AI Experimental Report Assistant</div>

        <h1>DataLab AI</h1>

        <div className="heroSubtitle">
          <p>Turn experiment protocols into predictive reports</p>
          <p>Clean measured data and compare it with AI forecasts</p>
          <p>Find error-prone steps and generate actionable fixes</p>
        </div>

        <div className="heroButtons">
          <a className="heroPrimary" href="/protocol">
            Start Analysis
            <span>→</span>
          </a>

          <button className="heroSecondary" onClick={scrollToDemo}>
            View Demo
            <span>↓</span>
          </button>
        </div>

        <div className="scrollHint">⌄</div>
      </section>

      <section id="demo-section" className="showcaseSection">
        <div className="notebook">
          <div className="notebookTabs">
            {features.map((feature, index) => (
              <button
                key={feature.id}
                className={
                  index === activeIndex ? "notebookTab active" : "notebookTab"
                }
                onClick={() => setActiveIndex(index)}
              >
                {feature.tab}
              </button>
            ))}
          </div>

          <div className="canvas">
            <aside className="workflowBoard">
              <p className="handTitle">Experiment Workflow</p>

              <div className="flowMap">
                <div className="flowNode protocolNode">Protocol Builder</div>
                <div className="flowArrow arrowOne">↓</div>
                <div className="flowNode predictionNode">Data Diagnosis</div>
                <div className="flowArrow arrowTwo">↓</div>
                <div className="flowNode compareNode">Report Generator</div>
              </div>

              <div className="stickyNote">
                <strong>Focus on</strong>
                <span>{active.title}</span>
              </div>
            </aside>

            <section className="demoPanel">
              <div className="demoHeader">
                <div>
                  <p>{active.label}</p>
                  <h3>{active.title}</h3>
                </div>

                <a href={active.route}>Open →</a>
              </div>

              <p className="demoDesc">{active.desc}</p>

              <div className="videoBox">
                {!videoError ? (
                  <video
                    key={active.video}
                    src={active.video}
                    autoPlay
                    muted
                    loop
                    playsInline
                    onError={() => setVideoError(true)}
                  />
                ) : (
                  <div className="videoFallback">
                    <div className="fakeWindow">
                      <div className="fakeWindowTop">
                        <span />
                        <span />
                        <span />
                      </div>
                      <div className="fakeChart">
                        <div />
                        <div />
                        <div />
                        <div />
                      </div>
                    </div>

                    <strong>{active.title}</strong>
                    <p>Video preview will appear here after upload.</p>
                  </div>
                )}
              </div>

              <div className="progressBar">
                <span key={active.id} />
              </div>

              <div className="chipRow">
                {active.chips.map((chip) => (
                  <span key={chip}>{chip}</span>
                ))}
              </div>
            </section>

            <aside className="detailPanel">
              <div className="detailCard">
                <h4>Core Capabilities</h4>
                {active.points.map((point) => (
                  <p key={point}>✓ {point}</p>
                ))}
              </div>

              <div className="detailCard light">
                <h4>Use Cases</h4>
                <p>Experiment planning</p>
                <p>Data quality review</p>
                <p>Report structure generation</p>
                <p>Team demo presentation</p>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="sponsorSection">
        <div className="sponsorRows">
          <div className="sponsorRowBlock">
            <div className="sponsorRowLabel">
              <span>Hackathon Sponsors We Used</span>
            </div>

            <div className="sponsorMarquee">
              <div className="sponsorTrack sponsorTrackLeft">
                {[
                  ...sponsorTools,
                  ...sponsorTools,
                  ...sponsorTools,
                  ...sponsorTools,
                ].map((item, index) => (
                  <div
                    className="sponsorLogoCard sponsorCard"
                    key={`${item.name}-${index}`}
                  >
                    <span className="logoMark">
                      <img src={item.logo} alt={`${item.name} logo`} />
                    </span>
                    <strong>{item.name}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="sponsorRowBlock">
            <div className="sponsorRowLabel">
              <span>Other Tools in Our Stack</span>
            </div>

            <div className="sponsorMarquee">
              <div className="sponsorTrack sponsorTrackRight">
                {[...softwareTools, ...softwareTools, ...softwareTools].map(
                  (item, index) => (
                    <div
                      className="sponsorLogoCard softwareCard"
                      key={`${item.name}-${index}`}
                    >
                      <span className="logoMark">
                        {item.logo ? (
                          <img src={item.logo} alt={`${item.name} logo`} />
                        ) : (
                          "⚗"
                        )}
                      </span>
                      <strong>{item.name}</strong>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="downloadArea">
          <button className="downloadButton">
            <span></span>
            <div>
              <strong>iOS App</strong>
              <small>Coming soon</small>
            </div>
          </button>

          <a className="downloadButton activeDownload" href="/protocol">
            <span>🌐</span>
            <div>
              <strong>Web App</strong>
              <small>Start now</small>
            </div>
          </a>

          <button className="downloadButton">
            <span>🤖</span>
            <div>
              <strong>Android App</strong>
              <small>Coming soon</small>
            </div>
          </button>
        </div>
      </section>
    </main>
  );
}