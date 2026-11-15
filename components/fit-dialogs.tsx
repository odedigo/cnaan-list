"use client";

/** Pins modal dialogs to the visible screen and scales a card down when its contents are taller. */

import { useLayoutEffect } from "react";

const dialogSelector = "dialog[open], [role='dialog'][aria-modal='true']";

export function FitDialogs() {
  useLayoutEffect(() => {
    let fitting = false;
    let again = false;

    function schedule() {
      if (fitting) {
        again = true;
        return;
      }
      queueMicrotask(run);
    }

    function run() {
      fitting = true;
      try {
        fit();
      } finally {
        fitting = false;
      }
      if (again) {
        again = false;
        queueMicrotask(run);
      }
    }

    function forgetHeights() {
      for (const card of document.querySelectorAll<HTMLElement>("[data-fit-height]")) delete card.dataset.fitHeight;
    }

    function fit() {
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const height = viewport?.height ?? window.innerHeight;
      if (height < 1) return;

      const seen = new Set<HTMLElement>();
      for (const node of document.querySelectorAll<HTMLElement>(dialogSelector)) {
        const overlay = overlayOf(node);
        if (!overlay || seen.has(overlay)) continue;
        seen.add(overlay);
        const reserve = overlay === node ? 0 : reservedBottom(overlay);
        pin(overlay, top, height, reserve);
        if (overlay !== node) continue;
        const card = singleCard(overlay);
        if (!card) {
          setInline(overlay, "overflowY", "auto");
          continue;
        }
        setInline(overlay, "overflow", "hidden");
        scaleCard(card, overlay);
      }
    }

    function onResize() {
      forgetHeights();
      schedule();
    }

    function onContentLoad(event: Event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const card = target.closest("[data-fit-height]");
      if (!(card instanceof HTMLElement)) return;
      delete card.dataset.fitHeight;
      schedule();
    }

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", onResize);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", onResize);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          const target = mutation.target;
          const card = target instanceof Element ? target.closest("[data-fit-height]") : null;
          if (card instanceof HTMLElement) delete card.dataset.fitHeight;
          schedule();
          return;
        }
        const target = mutation.target;
        if (!(target instanceof HTMLElement)) continue;
        if (mutation.attributeName === "open" || target.matches(dialogSelector)) {
          schedule();
          return;
        }
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style", "class", "open"],
    });
    document.addEventListener("load", onContentLoad, true);
    schedule();
    return () => {
      viewport?.removeEventListener("resize", onResize);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("load", onContentLoad, true);
      observer.disconnect();
    };
  }, []);
  return null;
}

function overlayOf(node: HTMLElement) {
  if (node instanceof HTMLDialogElement || getComputedStyle(node).position === "fixed") return node;
  let parent = node.parentElement;
  while (parent && parent !== document.body) {
    if (getComputedStyle(parent).position === "fixed") return parent;
    parent = parent.parentElement;
  }
  return null;
}

function reservedBottom(overlay: HTMLElement) {
  const stored = overlay.dataset.fitReserve;
  if (stored != null) return Number(stored) || 0;
  const value = parseFloat(getComputedStyle(overlay).bottom);
  const reserved = Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  overlay.dataset.fitReserve = String(reserved);
  return reserved;
}

function pin(overlay: HTMLElement, top: number, viewportHeight: number, reserved: number) {
  const height = Math.max(0, Math.round(viewportHeight - reserved));
  setInline(overlay, "top", `${Math.round(top)}px`);
  setInline(overlay, "height", `${height}px`);
  setInline(overlay, "maxHeight", `${height}px`);
  setInline(overlay, "bottom", "auto");
}

function scaleCard(card: HTMLElement, overlay: HTMLElement) {
  const available = contentBox(overlay);
  if (available < 80) return;
  const needed = unscaledHeight(card);
  if (needed < 1) return;
  const keyboard = window.innerHeight - overlay.clientHeight > 140;
  if (!keyboard && zoomSupported() && needed > available + 1) {
    const scale = Math.round(((available - 1) / needed) * 1000) / 1000;
    setZoom(card, String(Math.max(scale, 0.01)));
    setInline(card, "maxHeight", "none");
    setInline(card, "overflowY", "visible");
    return;
  }
  setZoom(card, "");
  setInline(card, "maxHeight", `${available}px`);
  setInline(card, "overflowY", "auto");
  setInline(card, "minHeight", "0px");
  setInline(card, "overscrollBehavior", "contain");
  keepFocusVisible(card);
}

function keepFocusVisible(card: HTMLElement) {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !card.contains(active) || active === card) return;
  const cardRect = card.getBoundingClientRect();
  const rect = active.getBoundingClientRect();
  if (rect.bottom > cardRect.bottom) card.scrollTop += rect.bottom - cardRect.bottom + 12;
  else if (rect.top < cardRect.top) card.scrollTop -= cardRect.top - rect.top + 12;
}

function zoomSupported() {
  return CSS.supports("zoom", "0.5");
}

function unscaledHeight(card: HTMLElement) {
  const stored = Number(card.dataset.fitHeight);
  if (stored > 0) return stored;
  setZoom(card, "");
  setInline(card, "maxHeight", "none");
  const needed = card.offsetHeight;
  if (needed > 0) card.dataset.fitHeight = String(needed);
  return needed;
}

function contentBox(overlay: HTMLElement) {
  const style = getComputedStyle(overlay);
  const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  return Math.floor(overlay.clientHeight - padding);
}

function singleCard(overlay: HTMLElement) {
  const children = [...overlay.children].filter(
    (node): node is HTMLElement => node instanceof HTMLElement && node.tagName !== "STYLE",
  );
  return children.length === 1 ? children[0] : null;
}

function setZoom(element: HTMLElement, value: string) {
  if (element.style.getPropertyValue("zoom") === value) return;
  if (value) element.style.setProperty("zoom", value);
  else element.style.removeProperty("zoom");
}

function setInline(element: HTMLElement, property: "top" | "height" | "maxHeight" | "bottom" | "overflow" | "overflowY" | "minHeight" | "overscrollBehavior", value: string) {
  if (element.style[property] !== value) element.style[property] = value;
}
