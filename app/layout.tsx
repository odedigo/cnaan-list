import type { Metadata, Viewport } from "next";
import { Rubik } from "next/font/google";

import "./globals.css";

const rubik = Rubik({ subsets: ["hebrew", "latin"], variable: "--font-rubik" });

export const metadata: Metadata = {
  title: "רשימת הקניות של משפחת כנען",
  description: "רשימת קניות ומלאי",
  applicationName: "רשימת הקניות של משפחת כנען",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: [{ url: "/favicon.ico" }],
  },
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
