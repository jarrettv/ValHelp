// ── Spoiler system ────────────────────────────────────────────────
// A single global "progress" value (how far the player has advanced) drives
// which biome-tagged content is revealed. The Articles spoiler slider writes
// it; GuidesLayout stamps `data-spoiler="<revealedCount>"` on its root so CSS
// can hide/show content tagged with `sp-b<index>` (see GuidesLayout.css).
//
// Content is tagged by biome. Today that's markdown (`:::biome <name>` fences,
// handled in vhRender.raw.ts). Items / gear / weapons / food can reuse the same
// `sp-b<index>` class + biomeIndex() lookup later.

// `icon` is the biome art name for biomeIconUrl(); Deep North has none yet (null).
export const SPOILER_BIOMES: { key: string; label: string; icon: string | null }[] = [
  { key: 'meadows', label: 'Meadows', icon: 'Meadows' },
  { key: 'blackforest', label: 'Black Forest', icon: 'BlackForest' },
  { key: 'ocean', label: 'Ocean', icon: 'Ocean' },
  { key: 'swamp', label: 'Swamp', icon: 'Swamp' },
  { key: 'mountain', label: 'Mountain', icon: 'Mountains' },
  { key: 'plains', label: 'Plains', icon: 'Plains' },
  { key: 'mistlands', label: 'Mistlands', icon: 'Mistlands' },
  { key: 'ashlands', label: 'Ashlands', icon: 'Ashlands' },
  { key: 'deepnorth', label: 'Deep North', icon: null },
];

export const BIOME_COUNT = SPOILER_BIOMES.length;

// Accept the common spellings/spacings authors might write.
const ALIASES: Record<string, number> = {};
SPOILER_BIOMES.forEach((b, i) => {
  ALIASES[b.key] = i;
  ALIASES[b.label.toLowerCase()] = i;
});
Object.assign(ALIASES, {
  'black forest': 1, 'black-forest': 1,
  mountains: 4,
  'deep north': 8, 'deep-north': 8,
});

/** Biome name/key/label → 0-based index, or null if unknown. */
export function biomeIndex(name: string): number | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  return key in ALIASES ? ALIASES[key] : null;
}

export function biomeLabel(index: number): string {
  return SPOILER_BIOMES[index]?.label ?? '';
}

// ── Store ─────────────────────────────────────────────────────────
const STORAGE_KEY = 'vh-spoiler-progress';
// Meadows (the first biome) is never a spoiler, so progress can't drop below 1 —
// it stays revealed no matter where the slider is.
const MIN_PROGRESS = 1;
const DEFAULT_PROGRESS = 1;

function clamp(v: number): number {
  if (Number.isNaN(v)) return DEFAULT_PROGRESS;
  return Math.max(MIN_PROGRESS, Math.min(BIOME_COUNT, v));
}

function load(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw != null) return clamp(parseFloat(raw));
  } catch { /* ignore */ }
  return DEFAULT_PROGRESS;
}

let progress = load();
const listeners = new Set<() => void>();

function persist(v: number): void {
  try { localStorage.setItem(STORAGE_KEY, String(v)); } catch { /* ignore */ }
}
function emit(): void {
  listeners.forEach(fn => fn());
}

export function getProgress(): number {
  return progress;
}

/** How many biomes are fully revealed (integer threshold used for gating). */
export function getRevealedCount(): number {
  return Math.floor(progress);
}

export function setProgress(v: number): void {
  const next = clamp(v);
  if (next === progress) return;
  progress = next;
  persist(next);
  emit();
  scheduleServerSave(); // no-op unless a logged-in user is synced
}

export function subscribeSpoiler(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// ── Server sync (logged-in users) ─────────────────────────────────
// Progress always lives in localStorage; when a user is logged in it also syncs
// to their prefs (code "spoiler") so it follows them across devices/browsers.
const SAVE_DEBOUNCE_MS = 1000;
let syncUserId: number | null = null;
let canSync = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// Apply a value received from the server without echoing it back up.
function applyFromServer(v: number): void {
  const next = clamp(v);
  if (next === progress) return;
  progress = next;
  persist(next);
  emit();
}

function scheduleServerSave(): void {
  if (!canSync) return;
  if (saveTimer != null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fetch('/api/auth/prefs', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'spoiler', items: [String(progress)] }),
    }).catch(() => { /* offline / auth lapsed — localStorage still holds it */ });
  }, SAVE_DEBOUNCE_MS);
}

/** Call once a logged-in user's id is known. A saved server value wins over
 *  local; if the user has none yet, the current local progress is uploaded. */
export async function syncSpoilerWithServer(userId: number): Promise<void> {
  if (syncUserId === userId) return;
  syncUserId = userId;
  canSync = true;
  try {
    const res = await fetch('/api/auth/prefs/spoiler', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      const raw = Array.isArray(data?.items) ? data.items[0] : undefined;
      const v = raw != null ? parseFloat(String(raw)) : NaN;
      if (!Number.isNaN(v)) { applyFromServer(v); return; }
    }
    // 401 / 404 / empty → no saved value yet: push local up so it's persisted.
    scheduleServerSave();
  } catch { /* ignore — keep local */ }
}

/** Call on logout — stop syncing but leave localStorage intact. */
export function clearSpoilerSync(): void {
  syncUserId = null;
  canSync = false;
  if (saveTimer != null) { clearTimeout(saveTimer); saveTimer = null; }
}
