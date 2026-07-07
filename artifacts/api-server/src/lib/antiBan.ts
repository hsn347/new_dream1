/**
 * Anti-ban module — per-user sequential outgoing message queue.
 *
 * WhatsApp is sensitive to burst / parallel sending patterns.
 * This module ensures:
 *   1. Messages for a given user are sent sequentially (never in parallel)
 *   2. A random human-like jitter (MIN_JITTER..MAX_JITTER ms) is inserted
 *      between consecutive sends, regardless of how many customers are waiting
 *   3. A per-phone cooldown (MIN_PHONE_GAP_MS) prevents rapid back-to-back
 *      replies to the same customer (common with voice/image analysis flows)
 *   4. A soft hourly rate-limit (HOURLY_LIMIT) slows sending if the user is
 *      blasting too many messages in one hour
 *
 * Usage in webhook.ts:
 *   enqueueOutgoing(userId, customerPhone, async () => {
 *     await sendEvolutionMessage(...);
 *   }, (jitterMs) => {
 *     // fire typing indicator for jitterMs so customer sees "typing..."
 *     sendEvolutionTyping(..., jitterMs + 800).catch(() => {});
 *   });
 */

import { logger } from "./logger.js";

// ─── Tuneable constants ────────────────────────────────────────────────────────
const MIN_JITTER_MS   = 1_200;   // minimum inter-message pause
const MAX_JITTER_MS   = 3_800;   // maximum inter-message pause
const MIN_PHONE_GAP_MS = 5_000;  // min gap when replying to the SAME phone twice
const HOURLY_LIMIT    = 180;     // soft outgoing messages/hour per user
const HOURLY_BACKOFF  = 12_000;  // extra wait (ms) when hourly limit is hit

// ─── State ────────────────────────────────────────────────────────────────────
interface UserState {
  chain:           Promise<void>;
  hourlyCount:     number;
  hourlyWindowEnd: number;         // unix ms
  lastPhoneAt:     Map<string, number>;  // phone → last sent unix ms
}

const states = new Map<number, UserState>();

function getState(userId: number): UserState {
  let s = states.get(userId);
  if (!s) {
    s = {
      chain:           Promise.resolve(),
      hourlyCount:     0,
      hourlyWindowEnd: Date.now() + 3_600_000,
      lastPhoneAt:     new Map(),
    };
    states.set(userId, s);
  }
  return s;
}

function jitterMs(): number {
  return MIN_JITTER_MS + Math.random() * (MAX_JITTER_MS - MIN_JITTER_MS);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Enqueue an outgoing message task for a user.
 *
 * @param userId       - the tenant's userId (used to key the queue)
 * @param phone        - normalised customer phone (for per-phone cooldown)
 * @param task         - async function that does the actual WA send + DB insert
 * @param onBeforeSend - optional callback called with the computed jitter (ms)
 *                       just before the jitter sleep starts — use it to fire
 *                       sendEvolutionTyping so the customer sees "typing..."
 */
export function enqueueOutgoing(
  userId:       number,
  phone:        string,
  task:         () => Promise<void>,
  onBeforeSend?: (jitter: number) => void,
): void {
  const state = getState(userId);

  const next = state.chain
    .catch(() => {})
    .then(async () => {
      const now = Date.now();

      // ── Reset hourly window if expired ──────────────────────────────────
      if (now > state.hourlyWindowEnd) {
        state.hourlyCount     = 0;
        state.hourlyWindowEnd = now + 3_600_000;
      }

      // ── Soft hourly throttle ────────────────────────────────────────────
      if (state.hourlyCount >= HOURLY_LIMIT) {
        logger.warn({ userId, hourlyCount: state.hourlyCount }, "Anti-ban: hourly limit reached, inserting backoff");
        await new Promise(r => setTimeout(r, HOURLY_BACKOFF));
      }

      // ── Per-phone cooldown ──────────────────────────────────────────────
      const lastAt  = state.lastPhoneAt.get(phone) ?? 0;
      const elapsed = Date.now() - lastAt;
      if (elapsed < MIN_PHONE_GAP_MS) {
        const extra = MIN_PHONE_GAP_MS - elapsed;
        logger.debug({ userId, phone, extraMs: extra }, "Anti-ban: per-phone cooldown");
        await new Promise(r => setTimeout(r, extra));
      }

      // ── Random human-like jitter ────────────────────────────────────────
      const jitter = Math.round(jitterMs());
      onBeforeSend?.(jitter);
      await new Promise(r => setTimeout(r, jitter));

      // ── Execute the actual send ─────────────────────────────────────────
      try {
        await task();
        state.hourlyCount++;
        state.lastPhoneAt.set(phone, Date.now());
      } catch (err) {
        logger.error({ err, userId, phone }, "Anti-ban queue: task threw");
      }
    })
    .catch(() => {});

  state.chain = next;

  // Tidy up: when this chain link finishes, if it's still the head, drop it
  next.then(() => {
    if (states.get(userId)?.chain === next) {
      states.delete(userId);
    }
  }).catch(() => {});
}

/**
 * Human-like typing duration based on reply length.
 * ~40 ms/char, clamped to [1 500 ms, 6 000 ms].
 */
export function typingDuration(replyText: string): number {
  return Math.max(1_500, Math.min(6_000, replyText.length * 40));
}

/** Diagnostic stats — useful for admin dashboards. */
export function getAntiBanStats(userId: number): { hourlyCount: number } {
  const s = states.get(userId);
  return { hourlyCount: s?.hourlyCount ?? 0 };
}
