import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Codex Mission Control",
  description: "Objective-alignment observability for supervised Codex workers",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
