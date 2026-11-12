import React, { useState, useEffect, useRef } from 'react';
import { REFRESH_EVENT } from '../common/PullToRefresh';

export interface SecretWishlistNotepadProps {
  partnerName?: string;
  onFlipBack?: () => void;
  /** Label for the close/flip-back button (defaults to 'Karte umdrehen' for the 3D card) */
  closeLabel?: string;
  /** Whether the draw has already happened. If false, only personal wishlist is shown (no partner peek). */
  isDrawn?: boolean;
}

export const SecretWishlistNotepad: React.FC<SecretWishlistNotepadProps> = ({
  partnerName = 'dein Wichtelpartner',
  onFlipBack,
  closeLabel = 'Karte umdrehen',
  isDrawn = true,
}) => {
  const [activeTab, setActiveTab] = useState<'mine' | 'partner'>('mine');
  const [content, setContent] = useState<string>('');
  const [partnerContent, setPartnerContent] = useState<string>('');
  const [partnerLoading, setPartnerLoading] = useState<boolean>(false);
  const [partnerFetched, setPartnerFetched] = useState<boolean>(false);
  const [partnerError, setPartnerError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>('');
  /** Latest text in the textarea (readable from timers/unmount without stale closures) */
  const latestContentRef = useRef<string>('');
  /** True once the user typed - a late GET response must not overwrite their input */
  const userEditedRef = useRef<boolean>(false);
  const saveSeqRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  // Flush a pending (debounced) save when the notepad closes/unmounts, so no text is lost
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        const pending = latestContentRef.current;
        if (pending !== lastSavedRef.current) {
          fetch('/api/me/wishlist', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            keepalive: true,
            body: JSON.stringify({ content: pending }),
          }).catch(() => {});
        }
      }
    };
  }, []);

  // 1. Initial Load of Current User's Wishlist (GET /api/me/wishlist)
  useEffect(() => {
    let isMounted = true;
    fetch('/api/me/wishlist', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && !userEditedRef.current && data && typeof data.content === 'string') {
          latestContentRef.current = data.content;
          setContent(data.content);
          lastSavedRef.current = data.content;
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // 1b. Pull-to-refresh: reload own wishlist (only if there are no unsaved local edits)
  //     and the partner's wishlist (if it was already opened) without flashing a loading state.
  useEffect(() => {
    const onRefresh = () => {
      const hasUnsavedEdits =
        debounceTimerRef.current !== null || latestContentRef.current !== lastSavedRef.current;
      if (!hasUnsavedEdits) {
        fetch('/api/me/wishlist', { credentials: 'include' })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (!isMountedRef.current || !data || typeof data.content !== 'string') return;
            // Re-check: the user may have started typing while the request was running
            if (debounceTimerRef.current !== null || latestContentRef.current !== lastSavedRef.current) return;
            latestContentRef.current = data.content;
            lastSavedRef.current = data.content;
            setContent(data.content);
          })
          .catch(() => {});
      }

      if (isDrawn && (partnerFetched || activeTab === 'partner')) {
        fetch('/api/partner/wishlist', { credentials: 'include' })
          .then(async (res) => {
            if (!isMountedRef.current) return;
            if (res.status === 404) {
              setPartnerContent('');
              setPartnerError(null);
              setPartnerFetched(true);
              return;
            }
            if (!res.ok) return;
            const data = await res.json();
            if (!isMountedRef.current) return;
            setPartnerContent(data.content || '');
            setPartnerError(null);
            setPartnerFetched(true);
          })
          .catch(() => {});
      }
    };
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(REFRESH_EVENT, onRefresh);
  }, [isDrawn, partnerFetched, activeTab]);

  // 2. Debounced Autosave (PUT /api/me/wishlist, 500ms debounce)
  const saveWishlist = async (textToSave: string) => {
    if (textToSave === lastSavedRef.current) return;
    const seq = ++saveSeqRef.current;
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/me/wishlist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: textToSave }),
      });
      if (!res.ok) {
        throw new Error(
          res.status === 401 || res.status === 403
            ? 'Nicht angemeldet – bitte neu einloggen, sonst geht dein Text verloren.'
            : 'Speichern fehlgeschlagen – wir versuchen es bei der nächsten Änderung erneut.'
        );
      }
      if (!isMountedRef.current) return;
      // Ignore outdated responses (a newer save was started meanwhile)
      if (seq !== saveSeqRef.current) return;
      lastSavedRef.current = textToSave;
      setIsSaved(latestContentRef.current === textToSave);
    } catch (err: any) {
      if (isMountedRef.current && seq === saveSeqRef.current) {
        setSaveError(err.message || 'Fehler beim Speichern');
      }
    } finally {
      if (isMountedRef.current && seq === saveSeqRef.current) setIsSaving(false);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextText = e.target.value;
    userEditedRef.current = true;
    latestContentRef.current = nextText;
    setContent(nextText);
    setIsSaved(false);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      saveWishlist(nextText);
    }, 500);
  };

  // 3. Fetch Partner Wishlist (GET /api/partner/wishlist)
  const handlePeekPartner = async () => {
    setActiveTab('partner');
    if (partnerFetched) return;
    setPartnerLoading(true);
    setPartnerError(null);
    try {
      const res = await fetch('/api/partner/wishlist', { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 404) {
          setPartnerContent('');
          setPartnerFetched(true);
          return;
        }
        throw new Error('Partner-Wunschzettel konnte nicht geladen werden.');
      }
      const data = await res.json();
      setPartnerContent(data.content || '');
      setPartnerFetched(true);
    } catch (err: any) {
      setPartnerError(err.message);
    } finally {
      setPartnerLoading(false);
    }
  };

  return (
    <div
      data-testid="secret-wishlist-notepad"
      className="flex flex-col h-full w-full text-left select-text"
      onClick={(e) => e.stopPropagation()} // Stop click bubbling to avoid accidental flip
    >
      {/* Header bar with Flip Back / Close button */}
      <div className="flex items-start justify-between gap-3 pb-3 mb-3 border-b border-amber-400/20">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <span className="text-lg sm:text-xl leading-none mt-0.5 shrink-0">📝</span>
          <div className="min-w-0">
            <h3 className="font-extrabold text-sm sm:text-base text-amber-300 tracking-tight leading-snug">
              {activeTab === 'mine' ? 'Dein geheimer Wunschzettel' : `Wünsche von ${partnerName}`}
            </h3>
            <span className="text-[11px] text-amber-200/70 block leading-snug mt-0.5">
              {activeTab === 'mine' ? 'Sichtbar nur für deinen Wichtel' : 'Geschenk-Tipps für dich'}
            </span>
          </div>
        </div>
        {onFlipBack && (
          <button
            type="button"
            data-testid="flip-card-back-btn"
            onClick={(e) => {
              e.stopPropagation();
              onFlipBack();
            }}
            className="px-2.5 py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 text-[11px] sm:text-xs text-amber-100 font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0 whitespace-nowrap"
          >
            <span>{closeLabel}</span>
            {closeLabel === 'Karte umdrehen' && (
              <svg
                className="w-3.5 h-3.5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Main Content Area */}
      {activeTab === 'mine' ? (
        <div className="flex flex-col flex-1 space-y-2.5">
          <p className="text-xs text-slate-200/90 leading-relaxed bg-white/5 p-2 rounded-lg border border-white/10">
            💡 Trage hier Ideen, Vorlieben oder No-Gos für dein Geschenk ein. Der Text wird beim Tippen <strong>automatisch gespeichert</strong> und kann von deinem Wichtel geheim eingesehen werden.
          </p>

          <textarea
            id="secret-wishlist"
            data-testid="wishlist-textarea"
            value={content}
            onChange={handleTextChange}
            placeholder="Lieber Wichtel, ich freue mich über Kaffee, ein spannendes Buch oder edle Schokolade..."
            maxLength={2000}
            className="w-full flex-1 min-h-[140px] p-3 rounded-xl bg-slate-900/80 resize-none text-sm text-white placeholder-slate-400/70 focus:outline-none focus:ring-2 focus:ring-amber-400 border border-amber-400/30 custom-scrollbar shadow-inner"
          />

          <div className="flex items-center justify-between min-h-[20px] pt-0.5 text-xs">
            {/* Status Indicator */}
            <div className="flex items-center gap-2">
              {isSaving && (
                <span className="text-amber-300 font-medium animate-pulse flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  Wird gespeichert...
                </span>
              )}
              {isSaved && !isSaving && (
                <div
                  data-testid="wishlist-saved-indicator"
                  className="inline-flex items-center gap-1 font-bold text-emerald-400 animate-fade-in"
                >
                  <span>✓</span>
                  <span>Automatisch gespeichert</span>
                </div>
              )}
              {saveError && (
                <span className="text-red-400 font-semibold">{saveError}</span>
              )}
            </div>

            <span className="text-slate-400 font-mono text-[11px]">{content.length}/2000</span>
          </div>

          {/* Peek Partner Wishlist Button (only post-draw) */}
          {isDrawn && (
            <div className="pt-2.5 border-t border-white/10">
              <button
                type="button"
                data-testid="peek-partner-wishlist-btn"
                onClick={handlePeekPartner}
                className="w-full px-4 py-2.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/45 text-amber-100 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-[0.99]"
              >
                <span className="text-sm">👀</span>
                <span>Wunschzettel von {partnerName} ansehen</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Partner Wishlist View */
        <div className="flex flex-col flex-1 space-y-3">
          <p className="text-xs text-slate-200/90 leading-relaxed bg-white/5 p-2 rounded-lg border border-white/10">
            🎁 Hier sind die geheimen Geschenk-Wünsche deines Partners:
          </p>

          <div
            data-testid="partner-wishlist-content"
            className="w-full flex-1 min-h-[140px] p-3 rounded-xl bg-slate-900/80 border border-amber-300/40 text-sm text-slate-100 overflow-y-auto whitespace-pre-wrap custom-scrollbar shadow-inner"
          >
            {partnerLoading ? (
              <span className="text-slate-400 animate-pulse">Lade Wünsche...</span>
            ) : partnerError ? (
              <span className="text-red-400">{partnerError}</span>
            ) : partnerContent.trim() ? (
              partnerContent
            ) : (
              <span className="text-slate-400 italic">
                {partnerName} hat noch keine Wünsche eingetragen. Lass deiner Kreativität freien Lauf! 🎁
              </span>
            )}
          </div>

          <div className="pt-2.5 border-t border-white/10">
            <button
              type="button"
              data-testid="back-to-my-wishlist-btn"
              onClick={() => setActiveTab('mine')}
              className="w-full px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-amber-200 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
            >
              <span>←</span>
              <span>Zu meinem Wunschzettel</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
