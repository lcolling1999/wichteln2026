import React, { useState, useMemo, useRef } from 'react';
import { Participant } from '../../types';

interface ColleagueSelectorProps {
  colleagues: Participant[];
  selectedId: number | null;
  onSelect: (colleague: Participant | null) => void;
  disabled?: boolean;
}

/**
 * Normalizes strings by trimming, stripping diacritics via NFD, and lowercasing.
 * E.g. 'andre' matches both 'André' (NFC) and 'Andre\u0301' (NFD).
 */
export function normalizeSearch(str: string): string {
  if (!str) return '';
  return str
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export const ColleagueSelector: React.FC<ColleagueSelectorProps> = ({
  colleagues,
  selectedId,
  onSelect,
  disabled = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });

  const filteredColleagues = useMemo(() => {
    if (!searchTerm.trim()) return colleagues;
    const norm = normalizeSearch(searchTerm);
    return colleagues.filter((c) => {
      const matchDisplay = normalizeSearch(c.displayName || c.name).includes(norm);
      const matchRaw = normalizeSearch(c.name).includes(norm);
      return matchDisplay || matchRaw;
    });
  }, [colleagues, searchTerm]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePos({ x, y });
  };

  const registeredCount = colleagues.filter((c) => c.isRegistered).length;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="relative w-full max-w-md mx-auto group"
    >
      {/* Dynamic Spotlight Glow Effect */}
      <div
        className="pointer-events-none absolute -inset-1 rounded-2xl opacity-60 transition-opacity duration-500 blur-xl group-hover:opacity-100"
        style={{
          background: `radial-gradient(circle at ${mousePos.x}% ${mousePos.y}%, rgba(249, 170, 46, 0.45) 0%, rgba(0, 72, 145, 0.25) 50%, transparent 80%)`,
        }}
      />

      <div className="relative bg-[#004891]/40 backdrop-blur-xl border border-white/20 rounded-2xl p-5 shadow-xl transition-all duration-300">
        <label
          htmlFor="colleague-select"
          className="block text-sm font-medium text-amber-200/90 mb-2 flex items-center justify-between"
        >
          <span>Wer bist du?</span>
          <span className="text-xs text-white/60">
            {registeredCount}/24 registriert
          </span>
        </label>

        {/* Native Select element */}
        <div className="relative">
          <select
            id="colleague-select"
            data-testid="colleague-select"
            disabled={disabled}
            value={selectedId !== null ? String(selectedId) : ''}
            onChange={(e) => {
              const val = e.target.value;
              if (!val) {
                onSelect(null);
              } else {
                const item = colleagues.find((c) => String(c.id) === val);
                onSelect(item || null);
              }
            }}
            className="w-full bg-[#002752]/90 text-white font-medium border border-white/20 rounded-xl px-4 py-3.5 pr-10 outline-none transition-all duration-200 cursor-pointer focus:border-[#F9AA2E] focus:ring-2 focus:ring-[#F9AA2E]/50 disabled:opacity-50 appearance-none text-base"
          >
            <option value="" disabled className="bg-[#001932] text-slate-400">
              -- Wähle deinen Namen aus --
            </option>
            {colleagues.map((c) => (
              <option
                key={c.id}
                value={String(c.id)}
                data-registered={c.isRegistered ? 'true' : 'false'}
                className={`bg-[#002752] ${
                  c.isRegistered ? 'text-amber-300 font-semibold' : 'text-slate-100'
                }`}
              >
                {c.displayName} {c.isRegistered ? '✓ (registriert)' : ''}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-[#F9AA2E]">
            <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
              <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
            </svg>
          </div>
        </div>

        {/* Quick Filter Search Input for Desktop & Mobile UX */}
        <div className="mt-3 relative">
          <input
            type="text"
            placeholder="Namen suchen (z.B. André, Sara)..."
            value={searchTerm}
            disabled={disabled}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/5 text-sm text-white placeholder-white/40 border border-white/10 rounded-lg px-3 py-1.5 outline-none focus:border-[#F9AA2E]/60 focus:bg-white/10 transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1.5 text-xs text-white/50 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        {/* Colleague Quick-Chips for fast tap selection & test verification */}
        {searchTerm ? (
          <div className="mt-3 max-h-36 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {filteredColleagues.length === 0 ? (
              <p className="text-xs text-white/50 py-1 text-center">Kein Kollege gefunden</p>
            ) : (
              filteredColleagues.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  data-testid={`colleague-item-${c.id}`}
                  disabled={disabled}
                  onClick={() => onSelect(c)}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                    selectedId === c.id
                      ? 'bg-[#F9AA2E] text-[#002752] font-bold'
                      : c.isRegistered
                      ? 'bg-amber-500/15 text-amber-200 border border-amber-500/30 hover:bg-amber-500/25'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <span>{c.displayName}</span>
                  {c.isRegistered && (
                    <span className="text-[10px] text-amber-300 font-semibold">Registriert ✓</span>
                  )}
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};
