import { getDatabase } from '../db/database.js';
import { createQueryLayer } from '../db/queries.js';

/** 3 days before 2026-12-03T18:00:00+01:00 */
export const PARTY_REMINDER_AT_MS = Date.parse('2026-11-30T18:00:00+01:00');
export const PARTY_START_AT_MS = Date.parse('2026-12-03T18:00:00+01:00');

interface WebPushModule {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  generateVAPIDKeys(): { publicKey: string; privateKey: string };
  sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload?: string
  ): Promise<{ statusCode: number }>;
}

let cachedWebPush: WebPushModule | null | undefined;
let missingWarned = false;

async function loadWebPush(): Promise<WebPushModule | null> {
  if (cachedWebPush !== undefined) return cachedWebPush;
  try {
    // Dynamic import so the server still boots/tests cleanly even before `npm install web-push`
    const mod = (await import('web-push' as string)) as { default?: WebPushModule } & WebPushModule;
    cachedWebPush = mod.default ?? mod;
    return cachedWebPush;
  } catch {
    cachedWebPush = null;
    if (!missingWarned) {
      missingWarned = true;
      console.warn(
        '[Push] Paket "web-push" ist nicht installiert. Bitte `npm install web-push` ausführen, um Hintergrund-Push zu aktivieren.'
      );
    }
    return null;
  }
}

export async function getVapidPublicKey(): Promise<string | null> {
  const wp = await loadWebPush();
  if (!wp) return null;
  const keys = ensureVapidKeys(wp);
  return keys.publicKey;
}

function ensureVapidKeys(wp: WebPushModule): { publicKey: string; privateKey: string } {
  const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPub && envPriv) {
    wp.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:wichteln@localhost', envPub, envPriv);
    return { publicKey: envPub, privateKey: envPriv };
  }

  const db = getDatabase();
  const q = createQueryLayer(db);
  let publicKey = q.getAppKv('vapid_public_key');
  let privateKey = q.getAppKv('vapid_private_key');

  if (!publicKey || !privateKey) {
    const generated = wp.generateVAPIDKeys();
    publicKey = generated.publicKey;
    privateKey = generated.privateKey;
    q.setAppKv('vapid_public_key', publicKey);
    q.setAppKv('vapid_private_key', privateKey);
  }

  wp.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:wichteln@localhost',
    publicKey,
    privateKey
  );
  return { publicKey, privateKey };
}

async function sendPush(
  wp: WebPushModule,
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; tag: string; url?: string }
): Promise<boolean> {
  try {
    await wp.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return true;
  } catch (err: any) {
    const statusCode = err?.statusCode;
    // Subscription expired or unsubscribed -> remove from DB
    if (statusCode === 404 || statusCode === 410) {
      const q = createQueryLayer(getDatabase());
      q.deletePushSubscription(sub.endpoint);
    } else {
      console.error('[Push] Fehler beim Senden:', err?.message || err);
    }
    return false;
  }
}

/**
 * Background worker:
 * 1. Sends debounced partner-wishlist notifications once 10 minutes have passed since the last edit.
 * 2. Sends the one-time 3-days-before reminder for the Christmas party.
 */
export async function processPendingPushNotifications(nowMs: number = Date.now()): Promise<void> {
  const wp = await loadWebPush();
  if (!wp) return;
  ensureVapidKeys(wp);

  const db = getDatabase();
  const q = createQueryLayer(db);

  // 1. Debounced partner wishlist updates
  const dueWishlists = q.getDueWishlistPushes();
  for (const item of dueWishlists) {
    // Clear first so concurrent ticks never send twice
    q.clearWishlistPush(item.receiverId);
    const giverSubs = q.getPushSubscriptionsByParticipant(item.giverId);
    for (const sub of giverSubs) {
      await sendPush(wp, sub, {
        title: '🎁 Wunschzettel aktualisiert',
        body: `${item.receiverName} hat den Wunschzettel angepasst – schau doch mal rein!`,
        tag: `partner-wishlist-${item.receiverId}`,
        url: '/',
      });
    }
  }

  // 2. One-time reminder 3 days before Christmas party (2026-11-30 18:00 -> 2026-12-03 18:00)
  if (nowMs >= PARTY_REMINDER_AT_MS && nowMs < PARTY_START_AT_MS) {
    const pendingSubs = q.getSubscriptionsPendingPartyReminder();
    for (const sub of pendingSubs) {
      const ok = await sendPush(wp, sub, {
        title: '🎄 Noch 3 Tage bis zur Weihnachtsfeier!',
        body: 'Am 03.12. um 18:00 Uhr im Gasthof Sack in Konradsreuth. Ist dein Wichtelgeschenk schon bereit?',
        tag: 'christmas-party-reminder',
        url: '/',
      });
      if (ok) {
        q.markPartyReminderSent(sub.id);
      }
    }
  }
}

/**
 * Sends a push notification to all subscribed devices right when the draw is executed.
 */
export async function sendDrawCompleteNotifications(): Promise<void> {
  const wp = await loadWebPush();
  if (!wp) return;
  ensureVapidKeys(wp);

  const q = createQueryLayer(getDatabase());
  const subs = q.getAllPushSubscriptions();
  await Promise.allSettled(
    subs.map((sub) =>
      sendPush(wp, sub, {
        title: '🔐 Die Wichtel-Auslosung ist durch!',
        body: 'Dein Wichtelpartner wartet im Tresor auf dich – öffne die App und knacke das Schloss!',
        tag: 'wichteln-draw-complete',
        url: '/',
      })
    )
  );
}
