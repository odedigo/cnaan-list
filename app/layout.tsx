import type { Metadata, Viewport } from "next";
import { Rubik } from "next/font/google";

import "./globals.css";

const rubik = Rubik({ subsets: ["hebrew", "latin"], variable: "--font-rubik" });

export const metadata: Metadata = {
  title: "CnaanList",
  description: "רשימת קניות ומלאי",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${rubik.variable} font-[family-name:var(--font-rubik)] antialiased`}>
        <div className="mx-auto min-h-dvh w-full max-w-[480px] bg-[var(--cream)]">{children}</div>
      </body>
    </html>
  );
}
