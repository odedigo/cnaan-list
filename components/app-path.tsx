"use client";

import { createContext, useContext } from "react";

export type AppPathValue = { path: string; go: (href: string) => void };

export const AppPathContext = createContext<AppPathValue | null>(null);

export function useAppPath() {
  return useContext(AppPathContext);
}
