import React, { useState, useEffect } from 'react';
import { Participant, DrawStatus } from '../../types';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDrawTriggered: () => void;
  status: DrawStatus | null;
  participants: Participant[];
}

export const AdminModal: React.FC<AdminModalProps> = ({
  isOpen,
  onClose,
  onDrawTriggered,
  status,
  participants,
}) => {
  const [pin, setPin] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [drawLoading, setDrawLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setPin('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pin }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Admin-PIN ungültig. Bitte erneut versuchen.');
        } else if (res.status === 429) {
          throw new Error('Zu viele fehlerhafte Anmeldeversuche. Bitte warten.');
        }
        throw new Error(data.error || 'Fehler bei der Admin-Anmeldung.');
      }

      setIsAuthenticated(true);
    } catch (err: any) {
      setError(err.message || 'Verbindungsfehler.');
    } finally {
      setLoading(false);
    }
  };

  const handleDraw = async () => {
    setError(null);
    setDrawLoading(true);

    try {
      const res = await fetch('/api/admin/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Auslosung konnte nicht durchgeführt werden.');
      }

      onDrawTriggered();
    } catch (err: any) {
      setError(err.message || 'Fehler bei der Auslosung.');
    } finally {
      setDrawLoading(false);
    }
  };

  const registeredCount = status?.registeredCount ?? participants.filter((p) => p.isRegistered).length;
  const isDrawn = status?.isDrawn ?? false;
  const canDraw = registeredCount === 24 && !isDrawn;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className="relative w-full max-w-md rounded-2xl glass-card border border-white/20 p-6 shadow-2xl text-white">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-white/50 hover:text-white p-1"
        >
          ✕
        </button>

        <div className="flex items-center space-x-2 mb-4">
          <span className="text-xl">🔐</span>
          <h2 className="text-lg font-bold text-white">Organisator-Bereich (Admin)</h2>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-200 text-xs">
            {error}
          </div>
        )}

        {!isAuthenticated ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="admin-pin-input"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Bitte Admin-PIN eingeben:
              </label>
              <input
                id="admin-pin-input"
                data-testid="admin-pin-input"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Admin-PIN"
                autoFocus
                className="glass-input w-full"
              />
            </div>

            <button
              type="submit"
              data-testid="admin-submit-btn"
              disabled={loading || !pin}
              className="w-full py-3 px-4 rounded-xl font-semibold text-[#002752] bg-gradient-to-r from-[#F9AA2E] to-amber-300 hover:from-amber-400 hover:to-yellow-200 transition-all disabled:opacity-50"
            >
              {loading ? 'Prüfe PIN...' : 'Anmelden'}
            </button>
          </form>
        ) : (
          <div data-testid="admin-dashboard" className="space-y-4">
            <div className="p-3 rounded-xl bg-[#001932]/60 border border-white/10 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Registriert:</span>
                <span className="font-bold text-amber-300">
                  {registeredCount} / 24
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Auslosungs-Status:</span>
                <span className={isDrawn ? 'text-emerald-400 font-bold' : 'text-slate-300'}>
                  {isDrawn ? '✓ Abgeschlossen' : 'Offen'}
                </span>
              </div>
            </div>

            {/* Draw Button */}
            <div className="pt-2">
              <button
                type="button"
                data-testid="admin-draw-btn"
                disabled={!canDraw || drawLoading}
                onClick={handleDraw}
                className={`w-full py-3.5 px-4 rounded-xl font-bold transition-all ${
                  canDraw
                    ? 'bg-gradient-to-r from-[#F9AA2E] via-amber-300 to-yellow-200 text-[#002752] shadow-lg shadow-[#F9AA2E]/30 hover:scale-[1.02]'
                    : 'bg-white/10 text-white/40 cursor-not-allowed border border-white/10'
                }`}
              >
                {drawLoading
                  ? 'Ziehung läuft...'
                  : isDrawn
                  ? 'Auslosung bereits erfolgt ✓'
                  : 'Wichtel-Auslosung jetzt starten'}
              </button>

              {!canDraw && !isDrawn && (
                <p className="text-[11px] text-amber-200/80 mt-2 text-center">
                  Auslosung erst möglich, wenn alle 24 Kollegen registriert sind (aktuell {registeredCount}/24).
                </p>
              )}
            </div>

            {/* Participants list */}
            <div className="mt-4 pt-3 border-t border-white/10">
              <h3 className="text-xs font-semibold text-slate-300 mb-2">Kollegen-Status</h3>
              <div className="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                {participants.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/5 text-xs"
                  >
                    <span>{p.displayName || p.name}</span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        p.isRegistered
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {p.isRegistered ? 'Registriert' : 'Ausstehend'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
