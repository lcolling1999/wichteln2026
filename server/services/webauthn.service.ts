import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { getDatabase, runTransaction } from '../db/database.js';
import { createQueryLayer } from '../db/queries.js';

export class WebAuthnError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'WebAuthnError';
  }
}

/**
 * Extracts challenge from base64url-encoded clientDataJSON
 */
export function extractChallengeFromClientData(clientDataJSON: string): string {
  try {
    const jsonStr = Buffer.from(clientDataJSON, 'base64url').toString('utf8');
    const parsed = JSON.parse(jsonStr);
    if (!parsed.challenge || typeof parsed.challenge !== 'string') {
      throw new Error('Missing challenge');
    }
    return parsed.challenge;
  } catch {
    throw new WebAuthnError(400, 'Ungültiges clientDataJSON Format.', 'INVALID_CLIENT_DATA');
  }
}

export class WebAuthnService {
  private inFlightRegistrations = new Map<number, Promise<any>>();

  /**
   * 1. Registration Options
   */
  public async generateRegistrationOptions(participantId: number) {
    const db = getDatabase();
    const q = createQueryLayer(db);

    const participant = q.getParticipantById(participantId);
    if (!participant) {
      throw new WebAuthnError(404, 'Teilnehmer nicht gefunden.', 'PARTICIPANT_NOT_FOUND');
    }

    if (participant.is_registered === 1) {
      throw new WebAuthnError(
        409,
        'Dieser Teilnehmer ist bereits registriert. Bitte stattdessen einloggen.',
        'ALREADY_REGISTERED'
      );
    }

    const authenticators = q.getAuthenticatorsByParticipantId(participantId);

    // Invalidate prior registration challenges for this participant
    q.deleteChallengesByParticipantAndType(participantId, 'registration');

    const options = await generateRegistrationOptions({
      rpName: config.rpName,
      rpID: config.rpID,
      userID: Buffer.from(String(participant.id), 'utf8'),
      userName: participant.name,
      userDisplayName: participant.display_name,
      attestationType: 'none',
      excludeCredentials: authenticators.map((a) => ({
        id: a.id,
        transports: a.transports ? JSON.parse(a.transports) : undefined,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      supportedAlgorithmIDs: [-7, -257, -8], // ES256, RS256, EdDSA
      timeout: 60000,
    });

    // Save challenge with 5-minute TTL
    q.saveChallenge({
      challenge: options.challenge,
      participant_id: participant.id,
      type: 'registration',
      ttlMs: config.challengeTtlMs,
    });

    return options;
  }

  /**
   * 2. Registration Verification
   */
  public async verifyRegistration(participantId: number, bodyResponse: RegistrationResponseJSON) {
    // If another request is currently verifying registration for this participant, wait for it to complete
    while (this.inFlightRegistrations.has(participantId)) {
      try {
        await this.inFlightRegistrations.get(participantId);
      } catch {
        // ignore error from competing request; this request will re-verify state below
      }
    }

    const db = getDatabase();
    const q = createQueryLayer(db);

    const participant = q.getParticipantById(participantId);
    if (!participant) {
      throw new WebAuthnError(404, 'Teilnehmer nicht gefunden.', 'PARTICIPANT_NOT_FOUND');
    }

    if (participant.is_registered === 1) {
      throw new WebAuthnError(
        409,
        'Dieser Teilnehmer ist bereits registriert. Bitte stattdessen einloggen.',
        'ALREADY_REGISTERED'
      );
    }

    if (!bodyResponse || !bodyResponse.response || !bodyResponse.response.clientDataJSON) {
      throw new WebAuthnError(400, 'Ungültige Registrierungsdaten.', 'INVALID_PAYLOAD');
    }

    const verifyPromise = (async () => {
      // Extract challenge
      const clientChallenge = extractChallengeFromClientData(bodyResponse.response.clientDataJSON);

      // Single-use challenge retrieval & consumption
      const challengeRow = q.getAndConsumeRegistrationChallenge(participantId);

      if (!challengeRow || challengeRow.challenge !== clientChallenge) {
        // Also ensure we remove clientChallenge if it lingered
        try {
          db.prepare('DELETE FROM webauthn_challenges WHERE challenge = ?').run(clientChallenge);
        } catch {
          // ignore
        }
        // Check if participant was registered concurrently (e.g. lost a race condition)
        const pCheck = q.getParticipantById(participantId);
        if (pCheck && pCheck.is_registered === 1) {
          throw new WebAuthnError(
            409,
            'Dieser Teilnehmer ist bereits registriert. Bitte stattdessen einloggen.',
            'ALREADY_REGISTERED'
          );
        }
        throw new WebAuthnError(400, 'Registrierungs-Challenge ungültig oder abgelaufen.', 'CHALLENGE_NOT_FOUND');
      }

      if (challengeRow.participant_id !== participantId) {
        throw new WebAuthnError(400, 'Challenge gehört nicht zu diesem Teilnehmer.', 'CHALLENGE_MISMATCH');
      }

      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: bodyResponse,
          expectedChallenge: challengeRow.challenge,
          expectedOrigin: config.expectedOrigins,
          expectedRPID: config.rpID,
          requireUserVerification: false,
        });
      } catch (err: any) {
        throw new WebAuthnError(400, `Passkey-Verifikation fehlgeschlagen: ${err.message}`, 'VERIFICATION_FAILED');
      }

      if (!verification.verified || !verification.registrationInfo) {
        throw new WebAuthnError(400, 'Passkey-Registrierung konnte nicht verifiziert werden.', 'VERIFICATION_FAILED');
      }

      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

      // Transactionally save authenticator and mark participant as registered
      let participantData: { id: number; name: string; displayName: string };

      runTransaction(db, () => {
        const p = q.getParticipantById(participantId);
        if (!p) {
          throw new WebAuthnError(404, 'Teilnehmer nicht gefunden.', 'PARTICIPANT_NOT_FOUND');
        }
        if (p.is_registered === 1) {
          throw new WebAuthnError(409, 'Teilnehmer wurde bereits registriert.', 'ALREADY_REGISTERED');
        }

        q.createAuthenticator({
          id: credential.id,
          participant_id: participantId,
          public_key: Buffer.from(credential.publicKey),
          counter: credential.counter,
          transports: credential.transports,
          device_type: credentialDeviceType || 'unknown',
          backed_up: credentialBackedUp,
        });

        q.setParticipantRegistered(participantId);
        participantData = {
          id: p.id,
          name: p.name,
          displayName: p.display_name,
        };
      });

      const sessionToken = q.createSession(participantId, false);

      return {
        success: true,
        sessionToken,
        participant: participantData!,
      };
    })();

    this.inFlightRegistrations.set(participantId, verifyPromise);
    try {
      return await verifyPromise;
    } finally {
      this.inFlightRegistrations.delete(participantId);
    }
  }

  /**
   * 3. Authentication Options (Supports autofill and colleague-selected)
   */
  public async generateAuthenticationOptions(participantId?: number) {
    const db = getDatabase();
    const q = createQueryLayer(db);

    let allowCredentials = undefined;

    if (participantId) {
      const participant = q.getParticipantById(participantId);
      if (!participant) {
        throw new WebAuthnError(404, 'Teilnehmer nicht gefunden.', 'PARTICIPANT_NOT_FOUND');
      }

      const authenticators = q.getAuthenticatorsByParticipantId(participantId);
      if (authenticators.length > 0) {
        allowCredentials = authenticators.map((a) => ({
          id: a.id,
          transports: a.transports ? JSON.parse(a.transports) : undefined,
        }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID: config.rpID,
      allowCredentials,
      userVerification: 'preferred',
      timeout: 60000,
    });

    // Invalidate prior auth challenge for this participant if participantId was provided
    if (participantId) {
      q.deleteChallengesByParticipantAndType(participantId, 'authentication');
    }

    q.saveChallenge({
      challenge: options.challenge,
      participant_id: participantId || null,
      type: 'authentication',
      ttlMs: config.challengeTtlMs,
    });

    return options;
  }

  /**
   * 4. Authentication Verification & Replay Counter Check
   */
  public async verifyAuthentication(bodyResponse: AuthenticationResponseJSON) {
    const db = getDatabase();
    const q = createQueryLayer(db);

    if (!bodyResponse || !bodyResponse.id || !bodyResponse.response || !bodyResponse.response.clientDataJSON) {
      throw new WebAuthnError(400, 'Ungültige Login-Daten.', 'INVALID_PAYLOAD');
    }

    const clientChallenge = extractChallengeFromClientData(bodyResponse.response.clientDataJSON);

    // Consume challenge
    const challengeRow = q.getAndConsumeAuthChallenge(clientChallenge);
    if (!challengeRow) {
      throw new WebAuthnError(400, 'Login-Challenge ungültig oder abgelaufen.', 'CHALLENGE_NOT_FOUND');
    }

    // Lookup authenticator
    const authenticator = q.getAuthenticatorById(bodyResponse.id);
    if (!authenticator) {
      throw new WebAuthnError(401, 'Unbekannter Passkey. Bitte neu registrieren.', 'UNKNOWN_CREDENTIAL');
    }

    if (challengeRow.participant_id && challengeRow.participant_id !== authenticator.participant_id) {
      throw new WebAuthnError(401, 'Passkey gehört nicht zum ausgewählten Teilnehmer.', 'PARTICIPANT_MISMATCH');
    }

    const participant = q.getParticipantById(authenticator.participant_id);
    if (!participant || participant.is_registered === 0) {
      throw new WebAuthnError(401, 'Teilnehmer nicht aktiv registriert.', 'NOT_REGISTERED');
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: bodyResponse,
        expectedChallenge: challengeRow.challenge,
        expectedOrigin: config.expectedOrigins,
        expectedRPID: config.rpID,
        credential: {
          id: authenticator.id,
          publicKey: new Uint8Array(authenticator.public_key),
          counter: authenticator.counter,
          transports: authenticator.transports ? JSON.parse(authenticator.transports) : undefined,
        },
        requireUserVerification: false,
      });
    } catch (err: any) {
      throw new WebAuthnError(401, `Passkey-Signatur ungültig: ${err.message}`, 'VERIFICATION_FAILED');
    }

    if (!verification.verified || !verification.authenticationInfo) {
      throw new WebAuthnError(401, 'Passkey-Authentifizierung fehlgeschlagen.', 'AUTH_FAILED');
    }

    const { newCounter } = verification.authenticationInfo;
    q.updateAuthenticatorCounter(authenticator.id, newCounter);

    const sessionToken = q.createSession(participant.id, false);

    return {
      success: true,
      sessionToken,
      participant: {
        id: participant.id,
        name: participant.name,
        displayName: participant.display_name,
      },
    };
  }

  public createSession(participantId: number | null, isAdmin: boolean = false): string {
    const q = createQueryLayer(getDatabase());
    return q.createSession(participantId, isAdmin);
  }
}

export const webauthnService = new WebAuthnService();
