import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import ProgressBar from "@/components/ProgressBar";

export const metadata: Metadata = {
  title: "DataLab AI",
  description: "AI-powered lab workflow platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <ProgressBar />
        <main className="container-narrow">
          {children}
        </main>
      </body>
    </html>
  );
}
