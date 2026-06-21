import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DataLab AI",
  description: "AI experimental report assistant",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="siteHeader">
          <div className="siteHeaderInner">
            <div className="siteHeaderLeft">
              <a className="siteBrand" href="/">
                <span className="siteBrandIcon">⚗</span>
                <span>DataLab AI</span>
              </a>

              <nav className="siteNav" aria-label="Page Navigation">
                <a className="siteNavLink" href="/protocol">
                  Protocol
                </a>
                <a className="siteNavLink" href="/analyze">
                  Data Analysis
                </a>
                <a className="siteNavLink" href="/report">
                  Report
                </a>
              </nav>
            </div>

            <a className="siteStartButton" href="/protocol">
              Let&apos;s Start
              <span>›</span>
            </a>
          </div>
        </header>

        {children}
      </body>
    </html>
  );
}