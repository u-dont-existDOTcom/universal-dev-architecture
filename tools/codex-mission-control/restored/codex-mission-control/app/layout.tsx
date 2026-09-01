import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Codex Mission Control",
  description: "Objective-alignment observability for supervised Codex workers",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <nav aria-label="Mission Control primary navigation" style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          display: "flex",
          justifyContent: "flex-end",
          gap: "0.75rem",
          padding: "0.65rem 1rem",
          background: "rgba(7, 11, 18, 0.94)",
          borderBottom: "1px solid rgba(255,255,255,0.12)",
          backdropFilter: "blur(12px)",
        }}>
          <Link href="/">Fleet dashboard</Link>
          <Link href="/supervision">Project Manager & supervisors</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
