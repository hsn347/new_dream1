import { useState, useEffect, useCallback } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

type PushStatus = "unsupported" | "denied" | "granted" | "prompt" | "loading";

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    const perm = Notification.permission;
    if (perm === "denied") { setStatus("denied"); return; }
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        if (sub) { setSubscription(sub); setStatus("granted"); }
        else { setStatus(perm === "granted" ? "prompt" : "prompt"); }
      });
    }).catch(() => setStatus("unsupported"));
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    try {
      setStatus("loading");
      const res = await fetch("https://new-dream1-1.onrender.com/api/user/push/vapid-public-key", { credentials: "include" });
      const { publicKey } = await res.json() as { publicKey: string };

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await fetch("https://new-dream1-1.onrender.com/api/user/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(sub.toJSON()),
      });

      setSubscription(sub);
      setStatus("granted");
      return true;
    } catch {
      setStatus(Notification.permission === "denied" ? "denied" : "prompt");
      return false;
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!subscription) return;
    try {
      await fetch("https://new-dream1-1.onrender.com/api/user/push/unsubscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
      setSubscription(null);
      setStatus("prompt");
    } catch {}
  }, [subscription]);

  return { status, subscription, subscribe, unsubscribe };
}
