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
// Progress always lives in localStorage; when a user is logged in the *level*
// (integer revealed count) also syncs to their prefs so it follows them across
// devices/browsers. Only the integer travels — the fractional part is a local
// slider-animation detail and doesn't change what's revealed.
const SAVE_DEBOUNCE_MS = 1000;
let syncUserId: number | null = null;
let canSync = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let savedLevel: number | null = null;

// Apply a level received from the server without echoing it back up.
function applyFromServer(level: number): void {
  savedLevel = level;
  const next = clamp(level);
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
    const level = getRevealedCount();
    if (level === savedLevel) return; // dragging within a biome — nothing new to store
    savedLevel = level;
    fetch('/api/auth/prefs/spoiler', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ level }),
    }).catch(() => {
      savedLevel = null; // offline / auth lapsed — retry on the next change
    });
  }, SAVE_DEBOUNCE_MS);
}

/** Call once a logged-in user's id is known. A saved server level wins over
 *  local; if the user has none yet, the current local level is uploaded. */
export async function syncSpoilerWithServer(userId: number): Promise<void> {
  if (syncUserId === userId) return;
  syncUserId = userId;
  canSync = true;
  try {
    const res = await fetch('/api/auth/prefs/spoiler', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      const level = Number(data?.level);
      if (Number.isFinite(level)) { applyFromServer(level); return; }
    }
    // 401 / 404 / empty → no saved level yet: push local up so it's persisted.
    scheduleServerSave();
  } catch { /* ignore — keep local */ }
}

/** Call on logout — stop syncing but leave localStorage intact. */
export function clearSpoilerSync(): void {
  syncUserId = null;
  canSync = false;
  savedLevel = null;
  if (saveTimer != null) { clearTimeout(saveTimer); saveTimer = null; }
}
