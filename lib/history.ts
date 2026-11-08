/** History writes that keep Next's entry state. Dropping it makes the next pop reload the page. */

export function pushAppHistory(url: string, patch?: Record<string, unknown>) {
  writeAppHistory("push", url, patch);
}

export function replaceAppHistory(url: string, patch?: Record<string, unknown>) {
  writeAppHistory("replace", url, patch);
}

function writeAppHistory(mode: "push" | "replace", url: string, patch?: Record<string, unknown>) {
  const current = window.history.state;
  const state = patch
    ? {
        ...(current && typeof current === "object" ? (current as Record<string, unknown>) : {}),
        ...patch,
      }
    : current;
  const method = mode === "push" ? History.prototype.pushState : History.prototype.replaceState;
  method.call(window.history, state, "", url);
}
