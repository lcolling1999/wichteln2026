import { useState, useEffect, useCallback } from 'react';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function usePushNotifications() {
  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  const [permission, setPermission] = useState<NotificationPermission>(() =>
    isSupported ? Notification.permission : 'denied'
  );
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [isServerEnabled, setIsServerEnabled] = useState<boolean>(true);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupported) return;
    let cancelled = false;

    (async () => {
      try {
        const keyRes = await fetch('/api/push/vapid-public-key', { credentials: 'include' });
        if (keyRes.ok) {
          const keyData = await keyRes.json();
          if (!cancelled) setIsServerEnabled(Boolean(keyData.enabled && keyData.publicKey));
        }
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          if (!cancelled) setIsSubscribed(Boolean(sub));
        }
      } catch {
        // Silent check
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported) return;
    setIsBusy(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setError('Benachrichtigungen wurden im Browser blockiert.');
        return;
      }

      const keyRes = await fetch('/api/push/vapid-public-key', { credentials: 'include' });
      const keyData = await keyRes.json();
      if (!keyData.enabled || !keyData.publicKey) {
        setIsServerEnabled(false);
        setError('Push-Dienst ist auf dem Server noch nicht aktiv (web-push fehlt).');
        return;
      }

      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
        });
      }

      const saveRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(sub.toJSON()),
      });
      if (!saveRes.ok) {
        throw new Error('Speichern der Push-Anmeldung fehlgeschlagen.');
      }

      setIsSubscribed(true);
    } catch (err: any) {
      setError(err?.message || 'Push-Aktivierung fehlgeschlagen.');
    } finally {
      setIsBusy(false);
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;
    setIsBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
    } catch (err: any) {
      setError(err?.message || 'Abmelden fehlgeschlagen.');
    } finally {
      setIsBusy(false);
    }
  }, [isSupported]);

  return {
    isSupported,
    isServerEnabled,
    permission,
    isSubscribed,
    isBusy,
    error,
    subscribe,
    unsubscribe,
  };
}
