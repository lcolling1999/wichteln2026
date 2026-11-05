import React, { useState, useEffect, useRef } from 'react';

export interface SecretWishlistNotepadProps {
  partnerName?: string;
  onFlipBack?: () => void;
  /** Whether the draw has already happened. If false, only personal wishlist is shown (no partner peek). */
  isDrawn?: boolean;
}

export const SecretWishlistNotepad: React.FC<SecretWishlistNotepadProps> = ({
  partnerName = 'dein Wichtelpartner',
  onFlipBack,
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

  // 1. Initial Load of Current User's Wishlist (GET /api/me/wishlist)
  useEffect(() => {
    let isMounted = true;
    fetch('/api/me/wishlist', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data && typeof data.content === 'string') {
          setContent(data.content);
          lastSavedRef.current = data.content;
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Debounced Autosave (PUT /api/me/wishlist, 500ms debounce)
  const saveWishlist = async (textToSave: string) => {
    if (textToSave === lastSavedRef.current) return;
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
        throw new Error('Speichern fehlgeschlagen');
      }
      lastSavedRef.current = textToSave;
      setIsSaved(true);
    } catch (err: any) {
      setSaveError(err.message || 'Fehler beim Speichern');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextText = e.target.value;
    setContent(nextText);
    setIsSaved(false);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
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
      {/* Header bar with Flip Back button */}
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-amber-400/20">
        <div className="flex items-center gap-2">
          <span className="text-xl">📝</span>
          <div>
            <h3 className="font-extrabold text-sm sm:text-base text-amber-300 tracking-wide leading-tight">
              {activeTab === 'mine' ? 'Dein geheimer Wunschzettel' : `Wünsche von ${partnerName}`}
            </h3>
            <span className="text-[11px] text-amber-200/70 block">
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
            className="px-3 py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 text-xs text-amber-100 font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            Karte umdrehen ⮌
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

          <div className="flex items-center justify-between pt-1 text-xs">
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
            <div className="pt-2 border-t border-white/10 flex justify-center">
              <button
                type="button"
                data-testid="peek-partner-wishlist-btn"
                onClick={handlePeekPartner}
                className="px-4 py-2 rounded-xl bg-amber-400/25 hover:bg-amber-400/35 border border-amber-300/50 text-amber-200 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md active:scale-95"
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

          <div className="flex justify-between items-center pt-1">
            <button
              type="button"
              data-testid="back-to-my-wishlist-btn"
              onClick={() => setActiveTab('mine')}
              className="text-xs font-bold text-amber-300 hover:text-amber-200 underline cursor-pointer flex items-center gap-1"
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
