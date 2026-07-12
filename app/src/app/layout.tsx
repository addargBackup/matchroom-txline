import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MatchRoom — your group chat plays the match",
  description:
    "Pick your nation, seal your thesis, survive the match. Live World Cup rooms refereed by the TxLINE feed.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0e1a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto min-h-dvh max-w-md px-3 pb-8">{children}</div>
      </body>
    </html>
  );
}
