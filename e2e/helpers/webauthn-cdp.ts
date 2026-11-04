import { Page, CDPSession } from '@playwright/test';

/**
 * Supported WebAuthn protocols in Chrome DevTools Protocol (CDP)
 */
export type VirtualAuthenticatorProtocol = 'ctap2' | 'u2f';

/**
 * Supported authenticator transports
 */
export type VirtualAuthenticatorTransport = 'internal' | 'usb' | 'nfc' | 'ble' | 'hybrid';

/**
 * Options for configuring a Virtual Authenticator via CDP
 */
export interface VirtualAuthenticatorOptions {
  protocol: VirtualAuthenticatorProtocol;
  transport: VirtualAuthenticatorTransport;
  hasResidentKey: boolean;
  hasUserVerification: boolean;
  isUserVerified: boolean;
  automaticPresenceSimulation: boolean;
}

/**
 * Credential object stored inside a Virtual Authenticator
 */
export interface VirtualAuthenticatorCredential {
  credentialId: string;
  isResidentCredential: boolean;
  rpId: string;
  privateKey: string;
  userHandle?: string;
  signCount: number;
}

/**
 * Active Virtual Authenticator session handle
 */
export interface VirtualAuthenticatorSession {
  cdp: CDPSession;
  authenticatorId: string;
  options: VirtualAuthenticatorOptions;
}

/**
 * Default options configured for 100% headless Passkey (CTAP2 platform authenticator)
 * simulation with auto-approved biometric user verification.
 */
export const DEFAULT_VIRTUAL_AUTHENTICATOR_OPTIONS: VirtualAuthenticatorOptions = {
  protocol: 'ctap2',
  transport: 'internal',
  hasResidentKey: true,
  hasUserVerification: true,
  isUserVerified: true,
  automaticPresenceSimulation: true,
};

/**
 * Initializes a Chrome DevTools Protocol (CDP) Virtual Authenticator for the given Page.
 * Enables 100% headless passkey creation (attestation) and passkey assertion without
 * native OS biometric dialogs.
 * 
 * @param page Playwright Page instance (must be Chromium)
 * @param customOptions Optional configuration overrides
 * @returns VirtualAuthenticatorSession handle
 */
export async function setupVirtualAuthenticator(
  page: Page,
  customOptions?: Partial<VirtualAuthenticatorOptions>
): Promise<VirtualAuthenticatorSession> {
  const cdp = await page.context().newCDPSession(page);

  // Enable the WebAuthn domain in CDP
  await cdp.send('WebAuthn.enable');

  const options: VirtualAuthenticatorOptions = {
    ...DEFAULT_VIRTUAL_AUTHENTICATOR_OPTIONS,
    ...customOptions,
  };

  // Add the virtual authenticator to the browser context
  const result = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options,
  }) as { authenticatorId: string };

  return {
    cdp,
    authenticatorId: result.authenticatorId,
    options,
  };
}

/**
 * Removes the virtual authenticator and disables the WebAuthn CDP domain.
 */
export async function removeVirtualAuthenticator(
  session: VirtualAuthenticatorSession
): Promise<void> {
  try {
    await session.cdp.send('WebAuthn.removeVirtualAuthenticator', {
      authenticatorId: session.authenticatorId,
    });
    await session.cdp.send('WebAuthn.disable');
  } catch (err) {
    // Session might already be closed if page was closed
  } finally {
    try {
      await session.cdp.detach();
    } catch {
      // Ignored if already detached
    }
  }
}

/**
 * Retrieves all credentials currently stored in the virtual authenticator.
 */
export async function getStoredCredentials(
  session: VirtualAuthenticatorSession
): Promise<VirtualAuthenticatorCredential[]> {
  const result = await session.cdp.send('WebAuthn.getCredentials', {
    authenticatorId: session.authenticatorId,
  }) as { credentials: VirtualAuthenticatorCredential[] };

  return result.credentials || [];
}

/**
 * Clears all credentials currently registered in the virtual authenticator.
 */
export async function clearStoredCredentials(
  session: VirtualAuthenticatorSession
): Promise<void> {
  await session.cdp.send('WebAuthn.clearCredentials', {
    authenticatorId: session.authenticatorId,
  });
}

/**
 * Configures whether user verification (biometrics / PIN) succeeds or fails
 * on the virtual authenticator.
 */
export async function setUserVerification(
  session: VirtualAuthenticatorSession,
  isUserVerified: boolean
): Promise<void> {
  await session.cdp.send('WebAuthn.setUserVerified', {
    authenticatorId: session.authenticatorId,
    isUserVerified,
  });
}

/**
 * Configures whether automatic user presence simulation is enabled.
 */
export async function setAutomaticPresenceSimulation(
  session: VirtualAuthenticatorSession,
  enabled: boolean
): Promise<void> {
  await session.cdp.send('WebAuthn.setAutomaticPresenceSimulation', {
    authenticatorId: session.authenticatorId,
    enabled,
  });
}

/**
 * Sets whether user presence touch will succeed or fail.
 */
export async function setUserPresence(
  session: VirtualAuthenticatorSession,
  willSucceed: boolean
): Promise<void> {
  await (session.cdp.send as any)('WebAuthn.setUserPresence', {
    authenticatorId: session.authenticatorId,
    willSucceed,
  });
}
