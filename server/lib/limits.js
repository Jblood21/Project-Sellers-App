/**
 * Counters for the few places a stranger can make this server do work, store
 * data or send mail. They live in memory: this is one process, a restart clears
 * them, and that is the right trade for a guard whose job is to stop floods and
 * guessing, not to keep a ledger. A second instance would count separately, which
 * only makes the limits looser, never stricter.
 *
 * A limiter is a fixed window: `max` uses of one key per `windowMs`.
 */
import net from 'node:net';

const MAX_KEYS = 50000;

/**
 * Who a request counts against. An IPv4 address is one line; an IPv6 /64 is too, and a home connection
 * hands out all 2^64 addresses in one, so counting the whole address would let a script rotate past every
 * limit for free. IPv6 is reduced to its /64 (and an IPv4 address wrapped in IPv6 is unwrapped).
 */
export function clientKey(req) {
  const raw = String(req.ip ?? '').replace(/%.*$/, '');
  if (!raw || !net.isIPv6(raw)) return raw;
  const [left, right = ''] = raw.split('::');
  const part = (side) => (side ? side.split(':') : []);
  const tail = part(right);
  // A dotted IPv4 tail (::ffff:1.2.3.4) is two groups.
  const v4 = tail.length && tail.at(-1).includes('.') ? tail.pop() : null;
  if (v4) {
    const n = v4.split('.').map(Number);
    tail.push(((n[0] << 8) | n[1]).toString(16), ((n[2] << 8) | n[3]).toString(16));
  }
  const head = part(left);
  const groups = raw.includes('::')
    ? [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill('0'), ...tail]
    : [...head, ...tail];
  const value = groups.map((g) => parseInt(g || '0', 16));
  if (value.slice(0, 5).every((g) => g === 0) && value[5] === 0xffff) {
    return `${value[6] >> 8}.${value[6] & 255}.${value[7] >> 8}.${value[7] & 255}`;
  }
  return `${value.slice(0, 4).map((g) => g.toString(16)).join(':')}::/64`;
}

/**
 * Limits are on everywhere except a test run. `node --test` drives one app from one
 * address and reuses a handful of emails throughout, which a limit would (rightly) count
 * as a single visitor hammering the gate. A test of the limits themselves sets
 * RATE_LIMITS=on; RATE_LIMITS=off turns them off anywhere.
 */
export const limitsOn = () => {
  const setting = process.env.RATE_LIMITS;
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return !process.env.NODE_TEST_CONTEXT;
};

export function createLimiter({ windowMs, max }) {
  const hits = new Map(); // key -> { count, resetAt }

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, Math.min(windowMs, 60 * 1000));
  sweep.unref?.();

  const live = (key) => {
    const entry = hits.get(key);
    if (!entry) return null;
    if (entry.resetAt <= Date.now()) {
      hits.delete(key);
      return null;
    }
    return entry;
  };

  return {
    /** Whole seconds until `key` may be used again, or 0 when it may be used now. */
    wait(key) {
      if (!limitsOn()) return 0;
      const entry = live(key);
      return entry && entry.count >= max ? Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000)) : 0;
    },
    /** Count one use of `key`. */
    hit(key) {
      if (!limitsOn()) return;
      const entry = live(key);
      if (entry) {
        entry.count += 1;
        return;
      }
      // A flood of keys that are each used once must not become a memory problem
      // of its own: past the cap, drop the oldest tenth.
      if (hits.size >= MAX_KEYS) {
        let drop = Math.ceil(MAX_KEYS / 10);
        for (const oldest of hits.keys()) {
          hits.delete(oldest);
          if (--drop <= 0) break;
        }
      }
      hits.set(key, { count: 1, resetAt: Date.now() + windowMs });
    },
    /** Take one use of `key` back, for a use that turned out not to cost anything. */
    release(key) {
      const entry = hits.get(key);
      if (!entry) return;
      entry.count -= 1;
      if (entry.count <= 0) hits.delete(key);
    },
    /** Forget `key`, for example after a successful sign-in. */
    reset(key) {
      hits.delete(key);
    },
  };
}

/** What a person is told when a limit stops them. Plain, and says when to come back. */
export const tooMany = (what, wait) => {
  const minutes = Math.ceil(wait / 60);
  const hours = Math.ceil(wait / 3600);
  const when = wait < 90 ? 'in a minute'
    : minutes < 90 ? `in about ${minutes} minutes`
      : hours < 24 ? `in about ${hours} hours`
        : 'tomorrow';
  return `Too many ${what}. Please try again ${when}.`;
};

/**
 * Counts one use against each `[limiter, key]` pair and hands back `{ wait, release }`. When any is
 * already used up, `wait` is the seconds to come back and nothing is counted. Otherwise the uses are
 * held, and `release()` gives them back, for work that turned out not to happen (a send that failed
 * should not cost the buyer one of their five). Holding first is what keeps two requests arriving at
 * once from both getting through on the last use.
 */
export function reserve(rules) {
  const live = rules.filter(([, key]) => key);
  let wait = 0;
  for (const [limiter, key] of live) wait = Math.max(wait, limiter.wait(key));
  if (wait) return { wait, release() {} };
  for (const [limiter, key] of live) limiter.hit(key);
  let released = false;
  return {
    wait: 0,
    release() {
      if (released) return;
      released = true;
      for (const [limiter, key] of live) limiter.release(key);
    },
  };
}

/**
 * Express middleware: every request counts one use against each `[limiter, key]`
 * pair `rulesOf(req)` returns, and is refused with 429 (and Retry-After) when any
 * of them is already used up. Nothing is counted for a refused request, so a
 * client that keeps knocking does not push its own wait further out.
 */
export function limitRequests(rulesOf, what) {
  return (req, res, next) => {
    const rules = rulesOf(req).filter(([, key]) => key);
    let wait = 0;
    for (const [limiter, key] of rules) wait = Math.max(wait, limiter.wait(key));
    if (wait) {
      res.set('Retry-After', String(wait));
      return res.status(429).json({ error: tooMany(what, wait) });
    }
    for (const [limiter, key] of rules) limiter.hit(key);
    return next();
  };
}
