/**
 * Special in-app order sound only (session open peers + kitchen new ticket).
 *
 * Profile "Ses Efekti" gates ONLY this Audio playback via getOrderSoundEnabled().
 * It must never suppress Notification Center rows, OS toasts (new Notification),
 * or Web Push / service-worker banners.
 *
 * Swap the file under public/sounds/ (or change these URLs) to change the effect.
 */
export const ORDER_NOTIFICATION_SOUND_URL = '/sounds/order-notification.mp3';
export const ORDER_NOTIFICATION_SOUND_FALLBACK_URL = '/sounds/order-notification.wav';

const PREF_PREFIX = 'alfatek-order-sound';
const DEDUPE_MS = 2500;
const VOLUME = 0.7;

function prefKey(userId) {
  return `${PREF_PREFIX}:${userId || 'anon'}`;
}

/** Default: enabled */
export function getOrderSoundEnabled(userId) {
  try {
    const raw = localStorage.getItem(prefKey(userId));
    if (raw === null) return true;
    return raw === '1' || raw === 'true';
  } catch {
    return true;
  }
}

export function setOrderSoundEnabled(userId, enabled) {
  try {
    localStorage.setItem(prefKey(userId), enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
  return Boolean(enabled);
}

function soundDedupeKey(n) {
  const tag = n?.tag || '';
  const event = n?.event || '';
  let p = n?.payload;
  if (typeof p === 'string') {
    try {
      p = JSON.parse(p);
    } catch {
      p = {};
    }
  }
  const id = p?.ticketId || p?.sessionId || '';
  return `${event}|${tag}|${id}`;
}

function shouldPlayForNotification(notification) {
  const event = notification?.event || '';
  // Staff call is a separate alert type — never play the order sound for it
  if (event === 'kitchen:staff_call') return false;
  return (
    notification?.playSound === true || notification?.payload?.playSound === true
  );
}

function claimDedupeLock(notification) {
  const key = `alfatek-order-sound-lock:${soundDedupeKey(notification)}`;
  try {
    const now = Date.now();
    const prev = Number(localStorage.getItem(key) || 0);
    if (now - prev < DEDUPE_MS) return false;
    localStorage.setItem(key, String(now));
    return true;
  } catch {
    return true;
  }
}

/**
 * Singleton audio controller — one HTMLAudioElement, preload once, reuse.
 */
class OrderSoundManager {
  constructor() {
    this.audio = null;
    this.ready = false;
    this.failed = false;
    this.loading = null;
    this.usingFallback = false;
  }

  ensureAudio(src = ORDER_NOTIFICATION_SOUND_URL) {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = 'auto';
      this.audio.volume = VOLUME;
      this.audio.addEventListener('error', () => {
        if (!this.usingFallback && src === ORDER_NOTIFICATION_SOUND_URL) {
          this.usingFallback = true;
          this.ready = false;
          this.failed = false;
          this.audio.src = ORDER_NOTIFICATION_SOUND_FALLBACK_URL;
          this.audio.load();
          return;
        }
        this.failed = true;
        console.warn('[order-sound] audio load failed', src);
      });
    }
    if (this.audio.src !== new URL(src, window.location.origin).href && !this.usingFallback) {
      this.audio.src = src;
    } else if (!this.audio.src) {
      this.audio.src = src;
    }
    return this.audio;
  }

  /** Warm cache at app boot — never throws. */
  preload() {
    if (this.loading) return this.loading;
    if (this.ready || this.failed) return Promise.resolve(this.ready);

    this.loading = new Promise((resolve) => {
      try {
        const audio = this.ensureAudio(ORDER_NOTIFICATION_SOUND_URL);
        if (!audio) {
          resolve(false);
          return;
        }

        const done = (ok) => {
          this.ready = ok;
          if (!ok) this.failed = true;
          resolve(ok);
        };

        if (audio.readyState >= 2) {
          done(true);
          return;
        }

        const onReady = () => {
          cleanup();
          done(true);
        };
        const onError = () => {
          cleanup();
          // error handler may switch to fallback; give it a moment
          if (this.usingFallback) {
            audio.addEventListener('canplaythrough', onReady, { once: true });
            audio.addEventListener(
              'error',
              () => {
                cleanup();
                done(false);
              },
              { once: true }
            );
            return;
          }
          done(false);
        };
        const cleanup = () => {
          audio.removeEventListener('canplaythrough', onReady);
          audio.removeEventListener('error', onError);
        };

        audio.addEventListener('canplaythrough', onReady, { once: true });
        audio.addEventListener('error', onError, { once: true });
        audio.load();
      } catch (err) {
        console.warn('[order-sound] preload failed', err?.message || err);
        this.failed = true;
        resolve(false);
      }
    }).finally(() => {
      this.loading = null;
    });

    return this.loading;
  }

  /**
   * Restart shared audio from the start (no stacked Audio instances).
   * Never throws into the notification pipeline.
   */
  play() {
    try {
      const audio = this.ensureAudio(
        this.usingFallback ? ORDER_NOTIFICATION_SOUND_FALLBACK_URL : ORDER_NOTIFICATION_SOUND_URL
      );
      if (!audio || this.failed) return;

      audio.pause();
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch((err) => {
          console.warn('[order-sound] play blocked or failed', err?.message || err);
        });
      }
    } catch (err) {
      console.warn('[order-sound] play error', err?.message || err);
    }
  }
}

const manager = new OrderSoundManager();

/** Call after office/kitchen auth (or lazily on first play). */
export function preloadOrderNotificationSound() {
  return manager.preload();
}

/**
 * Pref off → silent return only (no effect on inbox / push / OS toast).
 * Same event across tabs is deduped (~2.5s); in-tab restarts the shared Audio.
 */
export function playOrderNotificationSound(userId, notification) {
  if (!shouldPlayForNotification(notification)) return;
  if (!getOrderSoundEnabled(userId)) return;
  if (!claimDedupeLock(notification)) return;

  void manager.preload().then(() => {
    manager.play();
  });
}
