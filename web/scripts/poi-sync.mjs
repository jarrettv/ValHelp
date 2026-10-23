// POI icons: web/public/img/Poi holds the icons as you save them in Inkscape.
// Nothing here ever writes to that folder (only the admin page's SVGO button
// does, through poi-icons-plugin.ts). Optimized (svgo) copies
// are made on the way out: into dist by the build (poi-icons-plugin.ts), and
// for uploads to production. Git is the history: roll an icon back with
// `git checkout <rev> -- web/public/img/Poi/<name>.svg`.
//
//   npm run poi:push       upload every icon that differs from the live site
//   npm run poi:watch      upload each icon as you save it (also built into `npm run dev`)
//   npm run poi:prune      drop production uploads a deploy made redundant
//
// Uploading needs POI_SYNC_KEY (matching the API's POI_SYNC_KEY setting) in the
// environment or web/.env.local; POI_SYNC_URL overrides https://valheim.help.

import { existsSync, readdirSync, readFileSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimize } from 'svgo';
import svgoConfig from './svgo.poi.config.mjs';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ICON_DIR = join(WEB, 'public', 'img', 'Poi');

export const iconNames = (dir = ICON_DIR) => existsSync(dir)
  ? readdirSync(dir).filter(f => f.toLowerCase().endsWith('.svg')).map(f => f.slice(0, -4)).sort()
  : [];

export function optimizeSvg(source) {
  return optimize(source, svgoConfig).data;
}

/** The optimized icon, or null while it isn't a valid SVG (Inkscape mid-save). */
export function optimizedIcon(name, dir = ICON_DIR) {
  try { return optimizeSvg(readFileSync(join(dir, `${name}.svg`), 'utf8')); } catch { return null; }
}

// ── Production ───────────────────────────────────────────────────────────────

/** POI_SYNC_* from the environment, falling back to web/.env.local. */
export function pushConfig(env = process.env) {
  let key = env.POI_SYNC_KEY, url = env.POI_SYNC_URL;
  const local = join(WEB, '.env.local');
  if ((!key || !url) && existsSync(local)) {
    for (const line of readFileSync(local, 'utf8').split(/\r?\n/)) {
      const m = /^\s*(POI_SYNC_KEY|POI_SYNC_URL)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
      if (m?.[1] === 'POI_SYNC_KEY') key ||= m[2];
      if (m?.[1] === 'POI_SYNC_URL') url ||= m[2];
    }
  }
  return key ? { key, url: (url || 'https://valheim.help').replace(/\/$/, '') } : null;
}

async function call(cfg, method, path, body) {
  const r = await fetch(cfg.url + path, {
    method,
    headers: { 'X-Poi-Sync-Key': cfg.key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path}: HTTP ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

/** Upload one icon (optimized) as an admin icon. */
export async function pushIcon(cfg, name) {
  const svg = optimizedIcon(name);
  if (svg === null) return false;
  await call(cfg, 'PUT', `/api/admin/poi/sync/icons/${name}`, { svg });
  return true;
}

/**
 * Upload every icon whose optimized form isn't what the live site serves: the
 * deployed built-in, unless an earlier upload replaced it.
 */
export async function pushAll(cfg) {
  const config = await fetch(`${cfg.url}/api/poi/config`).then(r => r.json());
  const pushed = [];
  for (const name of iconNames()) {
    const mine = optimizedIcon(name);
    if (mine === null) continue;
    const live = config.icons?.[name]
      ? `${cfg.url}/api/poi/icons/${name}.svg?v=${config.icons[name]}`
      : `${cfg.url}/img/Poi/${name}.svg`;
    const r = await fetch(live);
    // Uploads come back sanitized (reformatted), so an uploaded icon is always re-sent; that's harmless.
    if (r.ok && (await r.text()) === mine) continue;
    if (await pushIcon(cfg, name)) pushed.push(name);
  }
  return pushed;
}

/** Ask production to drop uploaded icons identical to the deployed built-in. */
export async function prune(cfg) {
  return call(cfg, 'DELETE', '/api/admin/poi/sync/icons?redundant=true');
}

// ── Watch ────────────────────────────────────────────────────────────────────

/**
 * Call `onSave(name)` shortly after an icon stops changing (Inkscape writes a
 * file in several steps). Read-only: never writes to the icon folder.
 */
export function watchIcons(onSave) {
  const timers = new Map();
  const watcher = watch(ICON_DIR, (_, file) => {
    if (!file || !file.toLowerCase().endsWith('.svg')) return;
    const name = file.slice(0, -4);
    clearTimeout(timers.get(name));
    timers.set(name, setTimeout(() => { timers.delete(name); onSave(name); }, 400));
  });
  return () => { for (const t of timers.values()) clearTimeout(t); watcher.close(); };
}

/** Upload each icon to production as it's saved. */
export function watchAndPush(cfg, log = console.log) {
  return watchIcons(name => {
    if (!existsSync(join(ICON_DIR, `${name}.svg`))) return;   // deleted: nothing to upload
    pushIcon(cfg, name).then(
      ok => ok && log(`[poi-sync] uploaded ${name} to ${cfg.url}`),
      err => log(`[poi-sync] upload of ${name} failed: ${err.message}`));
  });
}

// ── CLI ──────────────────────────────────────────────────────────────────────

async function main(argv) {
  const [cmd = 'push'] = argv;
  const cfg = pushConfig();
  if (!cfg) throw new Error('POI_SYNC_KEY is not set (environment or web/.env.local)');
  switch (cmd) {
    case 'push': {
      const pushed = await pushAll(cfg);
      console.log(pushed.length ? `uploaded ${pushed.join(' ')}` : 'production is up to date');
      break;
    }
    case 'watch':
      console.log(`[poi-sync] watching ${ICON_DIR}, uploading to ${cfg.url}`);
      watchAndPush(cfg);
      break;
    case 'prune': {
      const r = await prune(cfg);
      console.log(`removed ${r?.removed ?? 0} redundant upload(s)${r?.names?.length ? `: ${r.names.join(' ')}` : ''}`);
      break;
    }
    default:
      throw new Error(`unknown command ${cmd} (push, watch, prune)`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch(err => { console.error(`[poi-sync] ${err.message}`); process.exit(1); });
}
