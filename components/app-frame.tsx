"use client";

/** Full-width frame for the desktop admin page. Every other screen stays in the phone column. */

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function AppFrame({ children }: { children: ReactNode }) {
  const path = usePathname();
  const desktop = path === "/admin" || path.startsWith("/admin/");
  return <div className={desktop ? "min-h-dvh w-full bg-[var(--cream)]" : "mx-auto min-h-dvh w-full max-w-[480px] bg-[var(--cream)]"}>{children}</div>;
}
