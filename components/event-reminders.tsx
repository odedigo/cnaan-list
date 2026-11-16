"use client";

/** Subscribes an installed app to the daily event reminder push. */

import { useEffect } from "react";

import { isInstalledApp } from "@/lib/installed-app";

export function EventReminders() {
  useEffect(() => {
    if (!isInstalledApp()) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
    if (!key) return;

    const enable = () => {
      void subscribe(key);
    };
    if (Notification.permission === "granted") enable();
    else if (Notification.permission === "default") {
      enable();
      window.addEventListener("pointerdown", enable, { once: true });
    }
    return () => window.removeEventListener("pointerdown", enable);
  }, []);

  return null;
}

let subscriptionTask: Promise<void> | null = null;

function subscribe(publicKey: string) {
  subscriptionTask ??= subscribeOnce(publicKey).finally(() => {
    subscriptionTask = null;
  });
  return subscriptionTask;
}

async function subscribeOnce(publicKey: string) {
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (permission !== "granted") {
    if (existing) {
      await fetch("/api/push-subscription", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: existing.endpoint }),
      }).catch(() => undefined);
      await existing.unsubscribe().catch(() => undefined);
    }
    return;
  }

  const current = existing && sameKey(existing, publicKey) ? existing : await replaceSubscription(registration, existing, publicKey);
  const json = current.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return;
  await fetch("/api/push-subscription", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }),
  }).catch(() => undefined);
}

async function replaceSubscription(registration: ServiceWorkerRegistration, existing: PushSubscription | null, publicKey: string) {
  if (existing) await existing.unsubscribe().catch(() => undefined);
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
}

function sameKey(subscription: PushSubscription, publicKey: string) {
  const current = subscription.options.applicationServerKey;
  if (!current) return true;
  const actual = new Uint8Array(current);
  const expected = urlBase64ToUint8Array(publicKey);
  if (actual.length !== expected.length) return false;
  return actual.every((byte, index) => byte === expected[index]);
}

function urlBase64ToUint8Array(value: string) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
