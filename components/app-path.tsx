"use client";

/** Current in-app path, so the shell can switch pages without a server refetch. */

import { createContext, useContext } from "react";

export type AppPathValue = { path: string; go: (href: string) => void };

export const AppPathContext = createContext<AppPathValue | null>(null);

export function useAppPath() {
  return useContext(AppPathContext);
}
