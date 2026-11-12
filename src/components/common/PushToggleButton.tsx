import React, { useEffect, useState } from 'react';
import { usePushNotifications } from '../../hooks/usePushNotifications';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Module-level cache so the browser's one-time `beforeinstallprompt` event is preserved
// across phase transitions (Onboarding -> Lobby -> Safe -> PartnerReveal).
let sharedInstallPrompt: BeforeInstallPromptEvent | null = null;
const promptSubscribers = new Set<(ev: BeforeInstallPromptEvent | null) => void>();

function notifyPromptSubscribers(ev: BeforeInstallPromptEvent | null) {
  sharedInstallPrompt = ev;
  promptSubscribers.forEach((fn) => fn(ev));
}

if (typeof window !== 'undefined') {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    notifyPromptSubscribers(e as BeforeInstallPromptEvent);
  });
  window.addEventListener('appinstalled', () => {
    notifyPromptSubscribers(null);
  });
}

export interface PushToggleButtonProps {
  className?: string;
}

export const PushToggleButton: React.FC<PushToggleButtonProps> = ({ className = '' }) => {
  const {
    isSupported,
    isServerEnabled,
    permission,
    isSubscribed,
    isBusy,
    error,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => sharedInstallPrompt
  );
  const [isStandalone, setIsStandalone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      Boolean((navigator as any).standalone) ||
      Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches)
    );
  });

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isMobileBrowserTab = (isIos || isAndroid) && !isStandalone;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePromptUpdate = (ev: BeforeInstallPromptEvent | null) => {
      setInstallPrompt(ev);
    };
    promptSubscribers.add(handlePromptUpdate);

    const handleAppInstalled = () => {
      setIsStandalone(true);
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      promptSubscribers.delete(handlePromptUpdate);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        notifyPromptSubscribers(null);
      }
    } catch {
      // Ignore user dismissal
    }
  };

  return (
    <div
      className={`relative z-20 w-full max-w-sm mx-auto flex flex-col items-center gap-2 ${className}`}
    >
      {/* PWA Home-Screen Install Banner for Android & iPhone when opened in a regular browser tab */}
      {isMobileBrowserTab && (
        <div
          data-testid="pwa-install-hint"
          className="w-full px-3.5 py-2.5 rounded-xl bg-amber-400/10 border border-amber-300/30 text-[11px] text-slate-200 flex flex-col items-center gap-2 text-center"
        >
          {installPrompt ? (
            <button
              type="button"
              data-testid="pwa-install-btn"
              onClick={handleInstallClick}
              className="w-full py-2 px-3 rounded-lg font-bold text-[#002752] bg-gradient-to-r from-[#F9AA2E] to-amber-400 hover:from-amber-400 hover:to-amber-300 shadow-sm flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.99]"
            >
              <span>📲</span>
              <span>Als Wichtel-App installieren (Vollbild &amp; Push)</span>
            </button>
          ) : isIos ? (
            <span>
              📲 <strong>App-Tipp (iPhone):</strong> In Safari auf <strong>Teilen → „Zum Home-Bildschirm“</strong> tippen – startet im Vollbild &amp; schaltet Push frei.
            </span>
          ) : (
            <span>
              📲 <strong>App-Tipp (Android):</strong> Im Chrome-Menü <strong>⋮ → „Zum Startbildschirm hinzufügen“</strong> wählen für Vollbild &amp; zuverlässige Push-Infos.
            </span>
          )}
        </div>
      )}

      {/* Push Notification Controls */}
      {isSupported && isServerEnabled && (
        <>
          {permission === 'denied' ? (
            <div className="w-full text-center px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] text-slate-300">
              🔕 Benachrichtigungen sind im Browser blockiert. Zum Aktivieren oben links in der Adressleiste auf das Symbol tippen → <strong>Berechtigungen → Benachrichtigungen zulassen</strong>.
            </div>
          ) : (
            <button
              type="button"
              data-testid="push-toggle-btn"
              disabled={isBusy}
              onClick={isSubscribed ? unsubscribe : subscribe}
              className={`w-full px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 ${
                isSubscribed
                  ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-400/35 text-emerald-200'
                  : 'bg-white/5 hover:bg-white/15 border-white/15 text-slate-200'
              }`}
            >
              <span>{isSubscribed ? '🔔' : '🔕'}</span>
              <span>
                {isBusy
                  ? 'Wird aktualisiert...'
                  : isSubscribed
                  ? 'Push-Erinnerungen aktiv (Tippen zum Ausschalten)'
                  : 'Push-Erinnerungen aktivieren (3 Tage vorher & Wunschzettel)'}
              </span>
            </button>
          )}
          {error && <span className="text-[11px] text-red-300 text-center">{error}</span>}
        </>
      )}
    </div>
  );
};
