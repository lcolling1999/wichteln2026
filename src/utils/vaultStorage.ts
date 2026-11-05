/**
 * Small device-local memory for the reveal flow:
 *  - whether this colleague already opened the safe on this device
 *  - whether the big reveal animation (scramble + confetti) has already been played
 *
 * Keys include the draw's verification hash, so a new draw automatically starts fresh.
 */

function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function suffix(userId: number, drawHash: string | null | undefined): string {
  return `${userId}_${(drawHash || 'nohash').slice(0, 16)}`;
}

const VAULT_PREFIX = 'wichteln_vault_unlocked_';
const REVEAL_PREFIX = 'wichteln_reveal_seen_';

export function isVaultUnlocked(userId: number, drawHash: string | null | undefined): boolean {
  return getStorage()?.getItem(VAULT_PREFIX + suffix(userId, drawHash)) === '1';
}

export function markVaultUnlocked(userId: number, drawHash: string | null | undefined): void {
  try {
    getStorage()?.setItem(VAULT_PREFIX + suffix(userId, drawHash), '1');
  } catch {
    // storage may be blocked (private mode) - the app still works, just without memory
  }
}

export function resetVaultUnlocked(userId: number, drawHash: string | null | undefined): void {
  try {
    getStorage()?.removeItem(VAULT_PREFIX + suffix(userId, drawHash));
  } catch {
    // ignore
  }
}

export function hasSeenReveal(userId: number, drawHash: string | null | undefined): boolean {
  return getStorage()?.getItem(REVEAL_PREFIX + suffix(userId, drawHash)) === '1';
}

export function markRevealSeen(userId: number, drawHash: string | null | undefined): void {
  try {
    getStorage()?.setItem(REVEAL_PREFIX + suffix(userId, drawHash), '1');
  } catch {
    // ignore
  }
}
