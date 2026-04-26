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
import type { VhDefaults } from './data';
import { fetchPrefsSection, saveFavs, saveSpeedRuns } from './data';

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
export function bumpChange() { notify(); }

let initialized = false;
let cachedMaxStats: any = null;

// Server sync state
let syncUserId: number | null = null;
let canSync = false;
let favsDirty = false;
let spdDirty = false;
let saveTimer: number | null = null;
const SAVE_DEBOUNCE_MS = 1000;

function scheduleServerSave() {
  if (!canSync) return;
  if (saveTimer != null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    saveTimer = null;
    try {
      if (favsDirty) {
        favsDirty = false;
        await saveFavs(mapToArray(state.craftFavorites));
      }
      if (spdDirty) {
        spdDirty = false;
        await saveSpeedRuns(mapToArray(state.craftSpeedrun));
      }
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
    favsDirty = true;
    scheduleServerSave();
    notify();
  };
  w.toggleSpeedrun = (code: string) => {
    if (state.craftSpeedrun[code]) delete state.craftSpeedrun[code];
    else state.craftSpeedrun[code] = true;
    saveMap(SPD_KEY, state.craftSpeedrun);
    spdDirty = true;
    scheduleServerSave();
    notify();
  };
  w.__vhItemClick = w.selectPageItem;
  w.__vhToggleFav = w.toggleFavorite;
  w.__vhToggleSpd = w.toggleSpeedrun;
}

/** Call once a logged-in user's id is known. Sections are independent:
 *  for each, if the server has data, it wins and replaces local; if the
 *  server has no data, local is left alone (subsequent user toggles will
 *  upload). This preserves "never set" on the server for usage tracking. */
export async function syncWithServer(userId: number) {
  if (syncUserId === userId) return;
  syncUserId = userId;
  canSync = true;
  try {
    const [favsSec, spdSec] = await Promise.all([
      fetchPrefsSection('favs'),
      fetchPrefsSection('speedruns'),
    ]);
    const updates: { craftFavorites?: Record<string, true>; craftSpeedrun?: Record<string, true> } = {};
    if (favsSec?.items) {
      const favs = arrayToMap(favsSec.items);
      saveMap(FAV_KEY, favs);
      updates.craftFavorites = favs;
    }
    if (spdSec?.items) {
      const spds = arrayToMap(spdSec.items);
      saveMap(SPD_KEY, spds);
      updates.craftSpeedrun = spds;
    }
    if (updates.craftFavorites || updates.craftSpeedrun) {
      setState(updates);
      notify();
    }
  } catch (err) {
    console.warn('vh prefs sync failed:', err);
  }
}

/** Call when user logs out — stop syncing but leave localStorage intact. */
export function clearServerSync() {
  syncUserId = null;
  canSync = false;
  favsDirty = false;
  spdDirty = false;
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
