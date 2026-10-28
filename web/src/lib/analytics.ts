// First-party usage events for the Worlds pages (api/worlds/usage, ModuleWorlds/WorldsEvents.cs,
// read on /auth/events): seeds generated and opened, zoom depth, POI clicks,
// device class. A random id per browser tab stands in for the visitor; no IP
// addresses are kept and nothing goes to third parties. Events are batched and
// sent every few seconds, and with sendBeacon when the page is hidden.

type Data = Record<string, string | number | boolean | null | undefined | Record<string, number>>;
interface QueuedEvent { kind: string; seed?: string; data?: Data }

const FLUSH_MS = 8000;
const MAX_BATCH = 50;

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
}

let session: string | null = null;
function sessionId(): string {
  if (session) return session;
  try {
    session = sessionStorage.getItem('vh-session');
    if (!session) { session = newId(); sessionStorage.setItem('vh-session', session); }
  } catch { session ??= newId(); }
  return session;
}

export type DeviceClass = 'desktop' | 'mobile' | 'tablet';

/** Touch-first and narrow is a phone, touch-first and wide a tablet, otherwise a desktop. */
export function deviceClass(): DeviceClass {
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  if (!coarse) return 'desktop';
  return Math.min(screen.width, screen.height) < 600 ? 'mobile' : 'tablet';
}

let queue: QueuedEvent[] = [];
let timer: number | undefined;
let started = false;

function body(events: QueuedEvent[]) {
  return JSON.stringify({ session: sessionId(), device: deviceClass(), events });
}

function flush(beacon = false) {
  if (timer) { clearTimeout(timer); timer = undefined; }
  while (queue.length) {
    const batch = queue.slice(0, MAX_BATCH);
    queue = queue.slice(MAX_BATCH);
    const payload = body(batch);
    if (beacon && navigator.sendBeacon?.('/api/worlds/usage', new Blob([payload], { type: 'application/json' }))) continue;
    fetch('/api/worlds/usage', { method: 'POST', credentials: 'include', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body: payload }).catch(() => {});
  }
}

function start() {
  if (started) return;
  started = true;
  addEventListener('pagehide', () => flush(true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
  queue.push({ kind: 'session_start', data: {
    w: innerWidth, h: innerHeight, dpr: Math.round(devicePixelRatio * 100) / 100,
    touch: navigator.maxTouchPoints > 0, lang: navigator.language, ref: document.referrer ? new URL(document.referrer).host : null,
  } });
}

/** Record an event (kind: lowercase and underscores). Best effort: never throws. */
export function track(kind: string, seed?: string | null, data?: Data) {
  try {
    start();
    queue.push({ kind, seed: seed ?? undefined, data });
    if (queue.length >= MAX_BATCH) flush();
    else timer ??= window.setTimeout(() => flush(), FLUSH_MS);
  } catch { /* analytics must never break the page */ }
}

/** Send what's queued now (e.g. before navigating away within the app). */
export function flushEvents() { try { flush(true); } catch { /* ignore */ } }
