// Controller façade around vhRender.raw — handles state priming,
// click delegation, and favorites/speedrun persistence (localStorage +
// optional server sync for logged-in users).
import {
  state,
  setState,
  computeMaxStatsExt,
  renderListItemHTML,
  renderDetailInto,
  type VhPageKey,
} from './vhRender.raw';
import type { VhItem } from './types';
import type { VhDefaults, VhPrefs } from './data';
import { fetchPrefs, savePrefs } from './data';

export type { VhPageKey };

const FAV_KEY = 'vh_favorites';
const SPD_KEY = 'vh_speedrun';

function loadMap(key: string): Record<string, true> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveMap(key: string, map: Record<string, true>) {
  try { localStorage.setItem(key, JSON.stringify(map)); } catch { /* ignore */ }
}

function mapToArray(m: Record<string, true>): string[] {
  return Object.keys(m);
}
function arrayToMap(a?: string[] | null): Record<string, true> {
  const out: Record<string, true> = {};
  (a || []).forEach(c => { out[c] = true; });
  return out;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let changeCounter = 0;
export function subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }
export function getChangeCounter() { return changeCounter; }
function notify() { changeCounter++; listeners.forEach(l => l()); }

let initialized = false;
let cachedMaxStats: any = null;

// Server sync state
let syncUserId: number | null = null;
let favsUpdatedAt: string = '';
let speedRunsUpdatedAt: string = '';
let saveTimer: number | null = null;
const SAVE_DEBOUNCE_MS = 1000;

function currentPrefs(): VhPrefs {
  return {
    favs: { items: mapToArray(state.craftFavorites), at: favsUpdatedAt },
    speedRuns: { items: mapToArray(state.craftSpeedrun), at: speedRunsUpdatedAt },
  };
}

function touchFavs() { favsUpdatedAt = new Date().toISOString(); }
function touchSpeedRuns() { speedRunsUpdatedAt = new Date().toISOString(); }

function scheduleServerSave() {
  if (!syncUserId) return;
  if (saveTimer != null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    saveTimer = null;
    try {
      await savePrefs(currentPrefs());
    } catch (err) {
      console.warn('vh prefs save failed:', err);
    }
  }, SAVE_DEBOUNCE_MS);
}

export function initVhState(items: VhItem[], defaults?: VhDefaults | null) {
  if (initialized) return;
  initialized = true;
  const byCode: Record<string, VhItem> = {};
  items.forEach(it => { byCode[it.code] = it; });

  // Favorites: use saved localStorage if present, else seed from defaults.json
  let favs = loadMap(FAV_KEY);
  if (Object.keys(favs).length === 0 && defaults?.favorites?.length) {
    favs = {};
    defaults.favorites.forEach(code => { favs[code] = true; });
    saveMap(FAV_KEY, favs);
  }

  // Speedrun: saved → defaults.json → items with `speedrun: true`
  let spds = loadMap(SPD_KEY);
  if (Object.keys(spds).length === 0) {
    spds = {};
    if (defaults?.speedrun?.length) {
      defaults.speedrun.forEach(code => { spds[code] = true; });
    } else {
      items.forEach(it => { if ((it as any).speedrun) spds[it.code] = true; });
    }
    saveMap(SPD_KEY, spds);
  }
  cachedMaxStats = computeMaxStatsExt(items);
  setState({
    allItems: items,
    craftItemsByCode: byCode,
    craftFavorites: favs,
    craftSpeedrun: spds,
    pageMaxStats: cachedMaxStats,
    pageSelectedCode: null,
  });

  // The ported HTML uses inline onclick="selectPageItem('X')" etc.
  const w = window as any;
  w.selectPageItem = (code: string) => {
    setState({ pageSelectedCode: code });
    notify();
  };
  w.toggleFavorite = (code: string) => {
    if (state.craftFavorites[code]) delete state.craftFavorites[code];
    else state.craftFavorites[code] = true;
    saveMap(FAV_KEY, state.craftFavorites);
    touchFavs();
    scheduleServerSave();
    notify();
  };
  w.toggleSpeedrun = (code: string) => {
    if (state.craftSpeedrun[code]) delete state.craftSpeedrun[code];
    else state.craftSpeedrun[code] = true;
    saveMap(SPD_KEY, state.craftSpeedrun);
    touchSpeedRuns();
    scheduleServerSave();
    notify();
  };
  w.__vhItemClick = w.selectPageItem;
  w.__vhToggleFav = w.toggleFavorite;
  w.__vhToggleSpd = w.toggleSpeedrun;
}

/** Call once a logged-in user's id is known.
 *  Server is the source of truth; on first login with empty server prefs,
 *  we upload the user's localStorage selections. */
export async function syncWithServer(userId: number) {
  if (syncUserId === userId) return;
  syncUserId = userId;
  try {
    const server = await fetchPrefs();
    if (!server) { syncUserId = null; return; }
    const favsSec = server.favs;
    const spdSec = server.speedRuns;
    const hasServerData =
      (favsSec?.items && favsSec.items.length > 0) ||
      (spdSec?.items && spdSec.items.length > 0);
    if (hasServerData) {
      // Server wins — replace local state and persist to localStorage.
      const favs = arrayToMap(favsSec?.items);
      const spds = arrayToMap(spdSec?.items);
      favsUpdatedAt = favsSec?.at || '';
      speedRunsUpdatedAt = spdSec?.at || '';
      saveMap(FAV_KEY, favs);
      saveMap(SPD_KEY, spds);
      setState({ craftFavorites: favs, craftSpeedrun: spds });
      notify();
    } else {
      // Server empty — upload whatever we have locally.
      if (!favsUpdatedAt) touchFavs();
      if (!speedRunsUpdatedAt) touchSpeedRuns();
      await savePrefs(currentPrefs());
    }
  } catch (err) {
    console.warn('vh prefs sync failed:', err);
    syncUserId = null;
  }
}

/** Call when user logs out — stop syncing but leave localStorage intact. */
export function clearServerSync() {
  syncUserId = null;
  favsUpdatedAt = '';
  speedRunsUpdatedAt = '';
  if (saveTimer != null) { window.clearTimeout(saveTimer); saveTimer = null; }
}

export function setSelectedCode(code: string | null) {
  state.pageSelectedCode = code;
  setState({ pageSelectedCode: code });
  notify();
}

export function setPageMaxStats(maxStats: any) {
  state.pageMaxStats = maxStats;
  setState({ pageMaxStats: maxStats });
}

export function getMaxStats() { return cachedMaxStats; }
export function getSelectedCode() { return state.pageSelectedCode; }
export { renderListItemHTML, renderDetailInto };
