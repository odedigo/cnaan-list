"use client";

/** On the first load of a signed-in session, open the grocery page. */

import { useEffect } from "react";

const startedKey = "cnaanlist-session-started";

export function StartAtGrocery({ signedIn }: { signedIn: boolean }) {
  useEffect(() => {
    if (!signedIn) return;
    if (sessionStorage.getItem(startedKey)) return;
    sessionStorage.setItem(startedKey, "1");
    if (new URLSearchParams(window.location.search).get("share") === "1") return;
    if (window.location.pathname !== "/grocery") window.location.replace("/grocery");
  }, [signedIn]);
  return null;
}
