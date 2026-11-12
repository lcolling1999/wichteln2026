import { useState, useCallback, useRef } from 'react';
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
} from '@simplewebauthn/browser';

import { Participant } from '../types';

export interface UseWebAuthnReturn {
  isLoading: boolean;
  isSupported: boolean;
  error: string | null;
  clearError: () => void;
  register: (participantId: number) => Promise<Participant>;
  login: (participantId?: number) => Promise<Participant>;
  conditionalLogin: () => Promise<Participant | null>;
  prefetchOptions: (participantId?: number, isRegistered?: boolean) => void;
}

const PREFETCH_TTL_MS = 45_000;

export function useWebAuthn(): UseWebAuthnReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefetchedRegRef = useRef<{ participantId: number; options: any; ts: number } | null>(null);
  const prefetchedLoginRef = useRef<{ participantId?: number; options: any; ts: number } | null>(null);

  const clearError = useCallback(() => setError(null), []);
  const isSupported = typeof window !== 'undefined' && browserSupportsWebAuthn();

  /**
   * Prefetches WebAuthn options when a colleague is selected in the dropdown so that on iOS Safari
   * `startRegistration` / `startAuthentication` can run synchronously inside the tap gesture
   * without losing transient user activation during a network round-trip.
   */
  const prefetchOptions = useCallback(
    (participantId?: number, isRegistered?: boolean) => {
      if (!isSupported || typeof fetch !== 'function') return;
      if (participantId && !isRegistered) {
        fetch('/api/auth/register-options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ participantId }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((options) => {
            if (options) {
              prefetchedRegRef.current = { participantId, options, ts: Date.now() };
            }
          })
          .catch(() => {});
      } else {
        fetch('/api/auth/login-options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(participantId ? { participantId } : {}),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((options) => {
            if (options) {
              prefetchedLoginRef.current = { participantId, options, ts: Date.now() };
            }
          })
          .catch(() => {});
      }
    },
    [isSupported]
  );

  /**
   * 1. Register a colleague with their chosen participant ID
   */
  const register = useCallback(
    async (participantId: number): Promise<Participant> => {
      setIsLoading(true);
      setError(null);

      try {
        if (!isSupported) {
          throw new Error('WebAuthn / Passkeys werden von deinem Browser leider nicht unterstützt.');
        }

        // Step 1: Use prefetched creation options if fresh (keeps iOS Safari user gesture intact),
        // otherwise request from server
        let creationOptions: any;
        const cachedReg = prefetchedRegRef.current;
        if (
          cachedReg &&
          cachedReg.participantId === participantId &&
          Date.now() - cachedReg.ts < PREFETCH_TTL_MS
        ) {
          creationOptions = cachedReg.options;
          prefetchedRegRef.current = null;
        } else {
          const optRes = await fetch('/api/auth/register-options', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ participantId }),
          });

          if (!optRes.ok) {
            const data = await optRes.json().catch(() => ({}));
            if (optRes.status === 409) {
              throw new Error('Dieser Kollege ist bereits registriert. Bitte logge dich stattdessen ein.');
            }
            throw new Error(data.error || 'Fehler beim Abrufen der Registrierungsoptionen.');
          }

          creationOptions = await optRes.json();
        }

        // Step 2: Invoke browser WebAuthn Passkey ceremony
        const regResponse = await startRegistration({ optionsJSON: creationOptions });

        // Step 3: Verify attestation response with server
        const verifyRes = await fetch('/api/auth/register-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            participantId,
            response: regResponse,
          }),
        });

        if (!verifyRes.ok) {
          const data = await verifyRes.json().catch(() => ({}));
          throw new Error(data.error || 'Passkey-Registrierung fehlgeschlagen.');
        }

        const verifyData = await verifyRes.json();

        try {
          localStorage.setItem('wichteln_last_participant_id', String(participantId));
        } catch {
          // ignore localStorage restrictions
        }

        return verifyData.participant;
      } catch (err: any) {
        if (err.name === 'NotAllowedError') {
          setError('Passkey-Vorgang wurde abgebrochen oder hat das Zeitlimit überschritten.');
        } else if (err.name === 'InvalidStateError') {
          setError('Auf diesem Gerät ist bereits ein Passkey für diesen Account hinterlegt.');
        } else {
          setError(err.message || 'Unerwarteter Fehler bei der Passkey-Registrierung.');
        }
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [isSupported]
  );

  /**
   * 2. Log in using an existing Passkey assertion
   */
  const login = useCallback(
    async (participantId?: number): Promise<Participant> => {
      setIsLoading(true);
      setError(null);

      try {
        if (!isSupported) {
          throw new Error('WebAuthn / Passkeys werden von deinem Browser leider nicht unterstützt.');
        }

        // Step 1: Use prefetched assertion options if fresh (keeps iOS Safari user gesture intact),
        // otherwise request from server
        let requestOptions: any;
        const cachedLogin = prefetchedLoginRef.current;
        if (
          cachedLogin &&
          cachedLogin.participantId === participantId &&
          Date.now() - cachedLogin.ts < PREFETCH_TTL_MS
        ) {
          requestOptions = cachedLogin.options;
          prefetchedLoginRef.current = null;
        } else {
          const optRes = await fetch('/api/auth/login-options', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(participantId ? { participantId } : {}),
          });

          if (!optRes.ok) {
            const data = await optRes.json().catch(() => ({}));
            throw new Error(data.error || 'Fehler beim Abrufen der Login-Optionen.');
          }

          requestOptions = await optRes.json();
        }

        // Step 2: Invoke browser Passkey assertion prompt
        const authResponse = await startAuthentication({ optionsJSON: requestOptions });

        // Step 3: Verify assertion with server
        const verifyRes = await fetch('/api/auth/login-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ response: authResponse }),
        });

        if (!verifyRes.ok) {
          const data = await verifyRes.json().catch(() => ({}));
          throw new Error(data.error || 'Passkey-Login fehlgeschlagen.');
        }

        const verifyData = await verifyRes.json();

        if (verifyData.participant?.id) {
          try {
            localStorage.setItem('wichteln_last_participant_id', String(verifyData.participant.id));
          } catch {
            // ignore
          }
        }

        return verifyData.participant;
      } catch (err: any) {
        if (err.name === 'NotAllowedError') {
          setError('Login-Vorgang wurde abgebrochen.');
        } else {
          setError(err.message || 'Unerwarteter Fehler beim Passkey-Login.');
        }
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [isSupported]
  );

  /**
   * 3. Conditional mediation / WebAuthn autofill auto-login on page load
   */
  const conditionalLogin = useCallback(async (): Promise<Participant | null> => {
    try {
      if (!isSupported) return null;
      const autofillAvailable = await browserSupportsWebAuthnAutofill().catch(() => false);
      if (!autofillAvailable) return null;

      const optRes = await fetch('/api/auth/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });

      if (!optRes.ok) return null;
      const requestOptions = await optRes.json();

      const authResponse = await startAuthentication({
        optionsJSON: requestOptions,
        useBrowserAutofill: true,
      });

      const verifyRes = await fetch('/api/auth/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ response: authResponse }),
      });

      if (!verifyRes.ok) return null;
      const data = await verifyRes.json();
      return data.participant || null;
    } catch {
      // User cancellation or autofill silence is expected
      return null;
    }
  }, [isSupported]);

  return {
    isLoading,
    isSupported,
    error,
    clearError,
    register,
    login,
    conditionalLogin,
    prefetchOptions,
  };
}
