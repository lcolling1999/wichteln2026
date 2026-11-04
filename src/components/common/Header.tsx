import React from 'react';
import { soundEngine } from '../../audio/soundEngine';

interface HeaderProps {
  isMuted: boolean;
  onToggleMute: () => void;
  onAdminOpen?: () => void;
  showAdmin?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  isMuted,
  onToggleMute,
  onAdminOpen,
  showAdmin = false,
}) => {
  return (
    <header className="relative z-20 w-full max-w-2xl mx-auto flex items-center justify-between px-3 py-3 sm:px-4">
      <div className="flex items-center space-x-2">
        <span className="text-xl" role="img" aria-label="Geschenk">🎁</span>
        <span className="font-extrabold tracking-tight text-white text-sm sm:text-base">
          WICHTELN <span className="text-[#F9AA2E]">2026</span>
        </span>
      </div>

      <div className="flex items-center space-x-2">
        {showAdmin && onAdminOpen && (
          <button
            type="button"
            data-testid="admin-login-trigger"
            onClick={onAdminOpen}
            className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-xs font-medium transition-colors"
          >
            Admin
          </button>
        )}

        {/* Audio Mute Toggle Button */}
        <button
          type="button"
          data-testid="audio-toggle-btn"
          onClick={() => {
            soundEngine.getContext(); // Ensure AudioContext initialized on gesture
            onToggleMute();
          }}
          aria-label={isMuted ? 'Ton einschalten' : 'Ton stummschalten'}
          className="p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white transition-all flex items-center justify-center"
        >
          {isMuted ? (
            <svg
              data-testid="audio-muted-icon"
              className="w-4 h-4 text-amber-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg
              className="w-4 h-4 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
};
