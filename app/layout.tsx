import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DiligenceDesk",
  description: "KYB diligence packs built from verifiable, paid Telegraph intelligence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
