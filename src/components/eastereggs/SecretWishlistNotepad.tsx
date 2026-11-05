import React, { useState, useEffect, useRef } from 'react';

export interface SecretWishlistNotepadProps {
  partnerName?: string;
  onFlipBack?: () => void;
}

export const SecretWishlistNotepad: React.FC<SecretWishlistNotepadProps> = ({
  partnerName = 'dein Wichtelpartner',
  onFlipBack,
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
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/15">
        <div className="flex items-center gap-1.5">
          <span className="text-lg">✨</span>
          <span className="font-extrabold text-sm sm:text-base text-amber-300 tracking-wide">
            {activeTab === 'mine' ? 'Geheimer Wunschzettel' : `Wünsche von ${partnerName}`}
          </span>
        </div>
        {onFlipBack && (
          <button
            type="button"
            data-testid="flip-card-back-btn"
            onClick={(e) => {
              e.stopPropagation();
              onFlipBack();
            }}
            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-slate-200 font-semibold transition-colors cursor-pointer"
          >
            Karte umdrehen ⮌
          </button>
        )}
      </div>

      {/* Main Content Area */}
      {activeTab === 'mine' ? (
        <div className="flex flex-col flex-1 space-y-2">
          <p className="text-xs text-slate-300">
            Trage hier Wünsche oder Hobbys ein. Dein Wichtel kann diese geheim einsehen!
          </p>

          <textarea
            id="secret-wishlist"
            data-testid="wishlist-textarea"
            value={content}
            onChange={handleTextChange}
            placeholder="Lieber Wichtel, ich freue mich über Kaffee, ein spannendes Buch oder edle Schokolade..."
            maxLength={2000}
            className="w-full flex-1 min-h-[140px] p-3 rounded-xl glass-input resize-none text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 border border-white/20 custom-scrollbar"
          />

          <div className="flex items-center justify-between pt-1 text-xs">
            {/* Status Indicator */}
            <div className="flex items-center gap-2">
              {isSaving && (
                <span className="text-amber-300 font-medium animate-pulse">
                  Wird gespeichert...
                </span>
              )}
              {isSaved && !isSaving && (
                <div
                  data-testid="wishlist-saved-indicator"
                  className="inline-flex items-center gap-1 font-bold text-emerald-400 animate-fade-in"
                >
                  <span>✓</span>
                  <span>Gespeichert</span>
                </div>
              )}
              {saveError && (
                <span className="text-red-400 font-semibold">{saveError}</span>
              )}
            </div>

            <span className="text-slate-400">{content.length}/2000</span>
          </div>

          {/* Peek Partner Wishlist Button */}
          <div className="pt-2 border-t border-white/10 flex justify-center">
            <button
              type="button"
              data-testid="peek-partner-wishlist-btn"
              onClick={handlePeekPartner}
              className="px-3.5 py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/40 text-amber-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <span>👀</span>
              <span>Wunschzettel von {partnerName} ansehen</span>
            </button>
          </div>
        </div>
      ) : (
        /* Partner Wishlist View */
        <div className="flex flex-col flex-1 space-y-3">
          <p className="text-xs text-slate-300">
            Hier sind die geheimen Wünsche deines Wichtelpartners:
          </p>

          <div
            data-testid="partner-wishlist-content"
            className="w-full flex-1 min-h-[140px] p-3 rounded-xl bg-black/30 border border-amber-300/30 text-sm text-slate-100 overflow-y-auto whitespace-pre-wrap custom-scrollbar"
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
              className="text-xs font-bold text-amber-300 hover:text-amber-200 underline cursor-pointer"
            >
              ← Zu meinem Wunschzettel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
