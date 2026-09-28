// Auto-ported from ValHelpTools vhcli/wwwroot/index.html (lines 427-479, 987-2167).
// Minimal adaptations: icon URLs rewritten to /api/icon/... and onclick handlers
// route through window.__vhItemClick / window.__vhToggleFav / window.__vhToggleSpd.
/* eslint-disable */
// @ts-nocheck
import { biomeIndex, biomeLabel, SPOILER_BIOMES, getRevealedCount } from './spoiler';
import { itemBiomeIndex, itemSpoilerClass } from './itemBiome';
import {
  STATIONS as SHEET_STATIONS, stationLevelAt, stationsFor, sheetFor,
  COMFORT_SLOTS, COMFORT_BASE, COMFORT_CAP, comfortPick, comfortAt, restedMinutes,
  buildKeysFor, BUILD_LABELS, stationPage,
} from './biomeSheets';

// ── Spoiler gating for list rows ──────────────────────────────────
// The class drives the blur from CSS (so dragging the slider re-skins the list
// with no re-render); the veil is the lock plate drawn over the blurred row.
function spoilerClass(code) {
  return itemSpoilerClass(code);
}
function spoilerVeil(code) {
  var idx = itemBiomeIndex(code);
  if (idx == null) return '';
  return '<div class="sp-veil" aria-hidden="true">'
    + '<span class="sp-veil-lock">🔒</span>'
    + '<span class="sp-veil-txt">' + esc(biomeLabel(idx)) + '</span>'
    + '</div>';
}

export type VhState = {
  allItems: any[] | null;
  craftItemsByCode: Record<string, any>;
  pageSelectedCode: string | null;
  pageMaxStats: any;
  craftFavorites: Record<string, true>;
  craftSpeedrun: Record<string, true>;
  mobImages: any;
};

export const state: VhState = {
  allItems: null,
  craftItemsByCode: {},
  pageSelectedCode: null,
  pageMaxStats: null,
  craftFavorites: {},
  craftSpeedrun: {},
  mobImages: null,
};

// Proxy the module-level globals the ported code expects
let allItems: any = null;
let craftItemsByCode: any = {};
let pageSelectedCode: any = null;
let pageMaxStats: any = null;
let craftFavorites: any = {};
let craftSpeedrun: any = {};
let mobImages: any = null;

export function setState(s: Partial<VhState>) {
  Object.assign(state, s);
  allItems = state.allItems;
  craftItemsByCode = state.craftItemsByCode;
  pageSelectedCode = state.pageSelectedCode;
  pageMaxStats = state.pageMaxStats;
  craftFavorites = state.craftFavorites;
  craftSpeedrun = state.craftSpeedrun;
  mobImages = state.mobImages;
}

// stubs — React wrapper reroutes these to component callbacks
declare const window: any;
function selectPageItem(code: string) { window.__vhItemClick?.(code); }
function toggleFavorite(code: string) { window.__vhToggleFav?.(code); }
function toggleSpeedrun(code: string) { window.__vhToggleSpd?.(code); }
function badgeBgClass(code: string) {
  const f = craftFavorites[code], s = craftSpeedrun[code];
  if (f && s) return " both-bg"; if (f) return " fav-bg"; if (s) return " speed-bg"; return "";
}
function esc(s: any) { return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/\x27/g,"&#39;"); }

const ICON_STAR = '<svg viewBox="0 0 24 24"><path fill="#ca0" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>';
const ICON_RUNNER = '<svg viewBox="0 0 24 24"><path fill="#4af" d="M13.5 5.5c1.09 0 2-.92 2-2a2 2 0 0 0-2-2c-1.11 0-2 .88-2 2c0 1.08.89 2 2 2M9.89 19.38l1-4.38L13 17v6h2v-7.5l-2.11-2l.61-3A7.3 7.3 0 0 0 19 13v-2c-1.91 0-3.5-1-4.31-2.42l-1-1.58c-.4-.62-1-1-1.69-1c-.31 0-.5.08-.81.08L6 8.28V13h2V9.58l1.79-.7L8.19 17l-4.9-1l-.4 2z"/></svg>';

// One line per Piece.ComfortGroup. Every group but Standalone counts its best
// piece only, so the line says what "best" turns on where that isn't obvious.
const COMFORT_GROUP_DESC = {
  Fire: 'Must be lit to count. Only the highest counts.',
  Bed: 'Sets your spawn point, and sleeping grants rested outright.',
  Seating: 'Only the highest counts — a throne beats any number of benches.',
  Table: 'Only the highest counts.',
  Carpet: 'Only the highest counts. Fur rugs are +2, woven and hide rugs +1.',
  Banner: 'Only the highest counts. Jute curtains are the +2 in this group.',
  ItemStand: 'Only the highest counts, and every stand in the group is +1.',
  Ornament: 'Only the highest counts — three pots are still +1.',
  Garland: 'Only the highest counts.',
  Lantern: 'Only the highest counts.',
  Bathing: 'Only the highest counts.',
  Standalone: 'No group, so these stack with each other and with everything else.',
};

// ── Ported rendering code (lines 987-2167) ─────────────────────────
var NON_COMBAT_DMG = { chop: 1, pickaxe: 1, damage: 1 };
function combatDamage(damages) {
  if (!damages) return 0;
  var total = 0;
  var keys = Object.keys(damages);
  for (var i = 0; i < keys.length; i++) {
    if (!NON_COMBAT_DMG[keys[i]]) total += damages[keys[i]];
  }
  return total;
}

function itemSortValue(it) {
  if (it.armor) return it.armor.base || 0;
  if (it.food) return (it.food.health || 0) + (it.food.stamina || 0) + (it.food.eitr || 0);
  if (it.damages) return combatDamage(it.damages);
  if (it.block && it.block.power && it.category === 'Shield') return it.block.power;
  return 0;
}

// ── Per-page list item renderers ──

// ── SVG bar helpers ──

var DMG_COLORS = {
  slash: '#d4a050', pierce: '#c08840', blunt: '#e0b868',
  fire: '#cc4433', frost: '#a8d8ea', lightning: '#3388aa',
  poison: '#66bb66', spirit: '#b8e8b0',
};

function scaleColor(hex, brightness) {
  var r = parseInt(hex.slice(1,3), 16);
  var g = parseInt(hex.slice(3,5), 16);
  var b = parseInt(hex.slice(5,7), 16);
  r = Math.round(r * brightness);
  g = Math.round(g * brightness);
  b = Math.round(b * brightness);
  return '#' + ((1<<24)|(r<<16)|(g<<8)|b).toString(16).slice(1);
}

function dmgBarSvg(val, it, globalMaxDmg, large) {
  var dmg = it.damages || {};
  var dpl = it.damagesPerLevel || {};
  var dScale = it.damageScale || {};
  var levels = it.maxQuality || 1;
  var order = ['slash', 'pierce', 'blunt', 'fire', 'frost', 'lightning', 'poison', 'spirit'];
  var qBrightness = [1.0, 0.33, 0.60, 1.0];

  // Build sequential squares: all Q1 types, then all Q2 added, etc.
  var allSquares = [];
  var baseDmg = 0, totalDmg = 0;
  for (var q = 0; q < levels; q++) {
    var bright = qBrightness[q];
    for (var oi = 0; oi < order.length; oi++) {
      var dt = order[oi];
      if (NON_COMBAT_DMG[dt]) continue;
      var scale = dScale[dt] || 1;
      var base = Math.round((dmg[dt] || 0) * scale);
      var per = Math.round((dpl[dt] || 0) * scale);
      var added = q === 0 ? base : per;
      var color = DMG_COLORS[dt] || '#888';
      var scaled = scaleColor(color, bright);
      if (q === 0) baseDmg += added;
      else totalDmg += added;
      for (var ci = 0; ci < added; ci++) allSquares.push(scaled);
    }
  }
  totalDmg += baseDmg;

  var sq = large ? 5 : 2, gap = 1, rows = 5, step = sq + gap;
  var totalCols = Math.ceil(Math.max(globalMaxDmg, 200) / rows);
  var svgW = totalCols * step + (large ? 80 : 18);
  var svgH = rows * step;

  var s = '<svg class="craft-bar-svg" width="' + svgW + '" height="' + svgH + '" viewBox="0 0 ' + svgW + ' ' + svgH + '">';

  // Draw empty background
  for (var c = 0; c < totalCols; c++) {
    for (var r = 0; r < rows; r++) {
      s += '<rect x="' + (c * step) + '" y="' + (r * step) + '" width="' + sq + '" height="' + sq + '" fill="#1a1a2e"/>';
    }
  }

  // Draw filled squares sequentially
  for (var i = 0; i < allSquares.length; i++) {
    var c = Math.floor(i / rows);
    var r = (rows - 1) - (i % rows);
    var x = c * step;
    var y = r * step;
    s += '<rect x="' + x + '" y="' + y + '" width="' + sq + '" height="' + sq + '" fill="' + allSquares[i] + '"/>';
  }

  var textX = totalCols * step + 2;
  var fontSize = large ? 16 : 8;
  var fontWeight = large ? 'bold' : 'normal';
  var label = baseDmg;
  if (large && totalDmg > baseDmg) label = baseDmg + '-' + totalDmg;
  s += '<text x="' + textX + '" y="' + (svgH / 2 + fontSize / 3) + '" font-size="' + fontSize + '" font-weight="' + fontWeight + '" fill="#ccc" font-family="system-ui">' + label + '</text>';
  s += '</svg>';
  return s;
}

var _shieldId = 0;
function shieldSvg(pct, val, size) {
  var id = 'sm' + (++_shieldId);
  var r = 9, cx = 10, cy = 10;
  var angle = pct * 360;
  var rad = (angle - 90) * Math.PI / 180;
  var x = cx + r * Math.cos(rad);
  var y = cy + r * Math.sin(rad);
  var large = angle > 180 ? 1 : 0;
  var pie = angle >= 360
    ? '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#ca0"/>'
    : '<path d="M' + cx + ',' + cy + ' L' + cx + ',' + (cy - r) + ' A' + r + ',' + r + ' 0 ' + large + ',1 ' + x.toFixed(2) + ',' + y.toFixed(2) + ' Z" fill="#ca0"/>';
  var sp = 'M10 1C10 1 3 3.5 3 3.5v8c0 3 3 6 7 7.5 4-1.5 7-4.5 7-7.5V3.5S10 1 10 1z';
  var px = size || 20;
  var labelPx = Math.max(8, Math.round(px * 0.45));
  return '<div class="craft-bar-group" title="Block: ' + val + '">' +
    '<svg class="craft-bar-svg" width="' + px + '" height="' + px + '" viewBox="0 0 20 20">' +
    '<defs><clipPath id="' + id + '"><path d="' + sp + '"/></clipPath></defs>' +
    '<path d="' + sp + '" fill="#222"/>' +
    '<g clip-path="url(#' + id + ')">' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#222"/>' +
    pie +
    '</g>' +
    '<path d="' + sp + '" fill="none" stroke="#48c" stroke-width="1"/>' +
    '</svg>' +
    '<span style="font-size:' + labelPx + 'px;color:#ccc;font-weight:bold">' + Math.round(val) + '</span>' +
    '</div>';
}

var FORK_COLORS = { hp: '#c44', sta: '#ca4', etr: '#48a', bal: '#aaa' };
var FORK_PATH = 'M14.153 8.5H12.611V1.019H10.617V8.5H9.076V1.019H7.082v9.32c0 .806.311 1.555.877 2.121.565.566 1.315.877 2.121.877h.537v9.603h1.994v-9.603h.537c.806 0 1.556-.311 2.121-.877.566-.565.877-1.315.877-2.121V1.019h-1.994z';
var ADRENALINE_PATH = 'M3.9 11.175q-.275-.3-.275-.712T3.9 9.75l2.8-2.8-1.075-1.075-.3.3q-.3.3-.712.3t-.713-.3-.275-.712.275-.688l2-2q.3-.3.713-.3t.712.3q.3.275.3.7t-.3.7l-.3.3L8.1 5.55l2.8-2.8q.3-.3.713-.3t.712.3.3.713-.3.712l-.675.65 1.55 1.55-2.825 2.8q-.275.3-.275.713t.275.712q.3.3.713.3t.712-.3l2.8-2.825 1.525 1.5L13.3 12.1q-.3.3-.3.713t.3.712q.275.275.688.263t.712-.288l2.8-2.825 1.525 1.525q.575.575.575 1.413t-.575 1.412l-.7.725 4.725 4.7H20.2l-3.3-3.3-.7.725q-.575.575-1.412.575t-1.413-.575L6 10.5l-.675.675q-.3.275-.712.275t-.713-.275';
function adrenalineSvg(size) {
  var s = size || 14;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" style="vertical-align:middle;flex-shrink:0"><path fill="#e8a030" d="' + ADRENALINE_PATH + '"/></svg>';
}
function forkSvg(type, size) {
  var col = FORK_COLORS[type] || FORK_COLORS.bal;
  var s = size || 12;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" style="vertical-align:middle;flex-shrink:0">' +
    '<path fill="' + col + '" d="' + FORK_PATH + '"/></svg>';
}

function foodForkType(food) {
  if (!food) return 'bal';
  var h = food.health || 0, s = food.stamina || 0, e = food.eitr || 0;
  if (e > h && e > s) return 'etr';
  if (h > s * 1.2) return 'hp';
  if (s > h * 1.2) return 'sta';
  return 'bal';
}

function foodMiniBar(pct, val, color, label, large) {
  var s = large ? 3 : 1;
  var w = 42 * s, trackW = 26 * s, barH = 5 * s, padY = 3 * s;
  var barW = Math.max(2 * s, Math.round(Math.min(pct, 1) * trackW));
  var svgH = (padY + barH + padY);
  var opacity = val === 0 ? ' opacity="0.2"' : '';
  var fontSize = large ? 14 : 7;
  var fontWeight = large ? 'bold' : 'normal';
  return '<svg width="' + w + '" height="' + svgH + '" viewBox="0 0 ' + w + ' ' + svgH + '"' + opacity + '>' +
    '<rect x="0" y="' + padY + '" width="' + trackW + '" height="' + barH + '" rx="' + (2*s) + '" fill="#0a0a0a"/>' +
    (val > 0 ? '<rect x="0" y="' + padY + '" width="' + barW + '" height="' + barH + '" rx="' + (2*s) + '" fill="' + color + '"/>' : '') +
    '<text x="' + (trackW + 2*s) + '" y="' + (padY + barH - s) + '" font-size="' + fontSize + '" font-weight="' + fontWeight + '" fill="#999" font-family="system-ui">' + Math.round(val) + '</text>' +
    '</svg>';
}

var _heartId = 0;
function regenHeart(ignored, val, large) {
  var id = 'rh' + (++_heartId);
  var pct = Math.min(val / 6, 1);
  var fillH = Math.round(pct * 22);
  var fillY = 23 - fillH;
  var s = large ? 2 : 1;
  var sz = 20 * s;
  var hp = 'M21.19 12.683c-2.5 5.41-8.62 8.2-8.88 8.32a.85.85 0 0 1-.62 0c-.25-.12-6.38-2.91-8.88-8.32c-1.55-3.37-.69-7 1-8.56a4.93 4.93 0 0 1 4.36-1.05a6.16 6.16 0 0 1 3.78 2.62a6.15 6.15 0 0 1 3.79-2.62a4.93 4.93 0 0 1 4.36 1.05c1.78 1.56 2.65 5.19 1.09 8.56';
  var fontSize = large ? 14 : 8;
  var fontWeight = large ? 'bold' : 'normal';
  return '<div style="display:flex;align-items:center;gap:' + (2*s) + 'px" title="Regen: +' + val + '/tick">' +
    '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24">' +
    '<defs><clipPath id="' + id + '"><path d="' + hp + '"/></clipPath></defs>' +
    '<path d="' + hp + '" fill="#322"/>' +
    '<rect x="0" y="' + fillY + '" width="24" height="' + fillH + '" fill="#c44" clip-path="url(#' + id + ')"/>' +
    '<path d="' + hp + '" fill="none" stroke="#f66" stroke-width="0.5"/>' +
    '</svg>' +
    '<span style="font-size:' + fontSize + 'px;font-weight:' + fontWeight + ';color:#c88">+' + val + '</span></div>';
}

function statBarSvg(val, perLvl, levels, large, globalMax, baseColor, pointsPerBox) {
  var ppb = pointsPerBox || 1;
  var maxVal = val + perLvl * (levels - 1);
  var scale = large ? 2 : 1;
  var boxSize = 3 * scale, gap = 1 * scale, boxStep = boxSize + gap;
  var maxBoxes = Math.ceil((globalMax || maxVal) / ppb);
  var textSpace = large ? 80 : 20;
  var w = maxBoxes * boxStep + textSpace, h = 10 * scale;

  var s = '<div class="craft-bar-group">' +
    '<svg class="craft-bar-svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">';

  for (var i = 0; i < maxBoxes; i++) {
    var x = i * boxStep;
    var point = (i + 1) * ppb;
    var color;
    if (point <= val) {
      color = baseColor;
    } else if (levels >= 2 && point <= val + perLvl) {
      color = scaleColor(baseColor, 0.33);
    } else if (levels >= 3 && point <= val + perLvl * 2) {
      color = scaleColor(baseColor, 0.60);
    } else if (levels >= 4 && point <= val + perLvl * 3) {
      color = scaleColor(baseColor, 1.0);
    } else {
      color = '#1a1a2e';
    }
    s += '<rect x="' + x + '" y="' + (2 * scale) + '" width="' + boxSize + '" height="' + (6 * scale) + '" fill="' + color + '"/>';
  }

  var textX = maxBoxes * boxStep + 2;
  var fontSize = large ? 16 : 8;
  var fontWeight = large ? 'bold' : 'normal';
  var label = Math.round(val);
  if (large && levels > 1) label = Math.round(val) + '-' + Math.round(maxVal);
  var textY = 2 * scale + 6 * scale;
  s += '<text x="' + textX + '" y="' + textY + '" font-size="' + fontSize + '" font-weight="' + fontWeight + '" fill="' + (large ? '#ccc' : '#999') + '" font-family="system-ui">' + label + '</text>';
  s += '</svg></div>';
  return s;
}

function armorBarSvg(pct, val, armorObj, maxQ, large, globalMax) {
  var perLvl = (armorObj && armorObj.perLevel) || 0;
  var levels = (maxQ && maxQ > 1) ? maxQ : 1;
  var baseColor = '#3cc878';
  var qBright = [1.0, 0.33, 0.60, 1.0];
  var maxVal = val + perLvl * (levels - 1);

  var allSquares = [];
  var baseDmg = 0, totalDmg = 0;
  for (var q = 0; q < levels; q++) {
    var added = q === 0 ? Math.round(val) : Math.round(perLvl);
    var scaled = scaleColor(baseColor, qBright[q]);
    if (q === 0) baseDmg = added; else totalDmg += added;
    for (var ci = 0; ci < added; ci++) allSquares.push(scaled);
  }
  totalDmg += baseDmg;

  var sq = large ? 6 : 3, gap = 1, rows = 2, step = sq + gap;
  var totalCols = Math.ceil((globalMax || maxVal) / rows);
  var textSpace = large ? 80 : 18;
  var svgW = totalCols * step + textSpace;
  var svgH = rows * step;

  var s = '<svg class="craft-bar-svg" width="' + svgW + '" height="' + svgH + '" viewBox="0 0 ' + svgW + ' ' + svgH + '">';
  // Empty background
  for (var c = 0; c < totalCols; c++) {
    for (var r = 0; r < rows; r++) {
      s += '<rect x="' + (c * step) + '" y="' + (r * step) + '" width="' + sq + '" height="' + sq + '" fill="#1a1a2e"/>';
    }
  }
  // Filled squares
  for (var i = 0; i < allSquares.length; i++) {
    var c = Math.floor(i / rows);
    var r = (rows - 1) - (i % rows);
    s += '<rect x="' + (c * step) + '" y="' + (r * step) + '" width="' + sq + '" height="' + sq + '" fill="' + allSquares[i] + '"/>';
  }
  var textX = totalCols * step + 2;
  var fontSize = large ? 16 : 8;
  var fontWeight = large ? 'bold' : 'normal';
  var label = baseDmg;
  if (large && totalDmg > baseDmg) label = baseDmg + '-' + totalDmg;
  s += '<text x="' + textX + '" y="' + (svgH / 2 + fontSize / 3) + '" font-size="' + fontSize + '" font-weight="' + fontWeight + '" fill="' + (large ? '#ccc' : '#999') + '" font-family="system-ui">' + label + '</text>';
  s += '</svg>';
  return s;
}

function blockBarSvg(val, blockObj, maxQ, large, globalMax) {
  var perLvl = (blockObj && blockObj.powerPerLevel) || 0;
  var levels = (maxQ && maxQ > 1) ? maxQ : 1;
  return statBarSvg(val, perLvl, levels, large, globalMax, '#ccaa33', 3);
}

// ── Per-page list item renderers ──

function trinketSummary(fx) {
  if (!fx) return '';
  var p = [];
  if (fx.healthRegenMultiplier) p.push('HP regen +' + Math.round((fx.healthRegenMultiplier - 1) * 100) + '%');
  if (fx.staminaRegenMultiplier) p.push('Stam regen +' + Math.round((fx.staminaRegenMultiplier - 1) * 100) + '%');
  if (fx.eitrRegenMultiplier) p.push('Eitr regen +' + Math.round((fx.eitrRegenMultiplier - 1) * 100) + '%');
  if (fx.healthUpFront) p.push('+' + fx.healthUpFront + ' HP');
  if (fx.staminaUpFront) p.push('+' + fx.staminaUpFront + ' stam');
  if (fx.eitrUpFront) p.push('+' + fx.eitrUpFront + ' eitr');
  if (fx.addArmor) p.push('+' + fx.addArmor + ' armor');
  if (fx.speedModifier) p.push('Speed +' + Math.round(fx.speedModifier * 100) + '%');
  if (fx.swimSpeedModifier) p.push('Swim +' + Math.round(fx.swimSpeedModifier * 100) + '%');
  if (fx.swimStaminaModifier) p.push('Swim stam ' + Math.round(fx.swimStaminaModifier * 100) + '%');
  if (fx.blockStaminaModifier) p.push('Blk stam ' + Math.round(fx.blockStaminaModifier * 100) + '%');
  if (fx.timedBlockBonus) p.push('Parry +' + fx.timedBlockBonus);
  if (fx.damageBonus) { for (var dt in fx.damageBonus) p.push(dt + ' +' + Math.round(fx.damageBonus[dt] * 100) + '%'); }
  var SKILL_SHORT = {'Blocking':'Blk','ElementalMagic':'Elem','BloodMagic':'Blood','WoodCutting':'WC'};
  if (fx.skillBonus) { fx.skillBonus.forEach(function(sb) { p.push((SKILL_SHORT[sb.skill] || sb.skill) + ' +' + sb.bonus); }); }
  if (fx.resistances) {
    var byMod = {};
    fx.resistances.forEach(function(r) { (byMod[r.modifier] = byMod[r.modifier] || []).push(r.type); });
    for (var mod in byMod) p.push(byMod[mod].join('/') + ' ' + mod);
  }
  return p.join(', ');
}

function renderCraftListItem(it, maxStats) {
  var sel = it.code === pageSelectedCode ? ' selected' : '';
  var iconHtml = it.hasIcon
    ? '<img src="/api/icon/' + encodeURIComponent(it.code) + '.png" alt="" draggable="false">'
    : '<div class="craft-item-icon-placeholder"></div>';
  var h = '<div class="craft-item' + sel + badgeBgClass(it.code) + spoilerClass(it.code) + '" data-code="' + esc(it.code) + '" onclick="selectPageItem(\'' + esc(it.code) + '\')">' + spoilerVeil(it.code);
  h += '<div class="craft-item-badge">';
  if (craftFavorites[it.code]) h += ICON_STAR;
  if (craftSpeedrun[it.code]) h += ICON_RUNNER;
  h += '</div>';
  h += iconHtml;
  h += '<div class="craft-item-info"><div class="craft-item-name">' + esc(it.name || it.code) + '</div>';
  var sub = it.subcategory || '';
  if (it.food) {
    var f = it.food;
    h += '<div class="craft-item-food">';
    h += forkSvg(foodForkType(f), 12);
    if (f.health) h += '<span class="fhp">' + f.health + ' hp</span>';
    if (f.stamina) h += '<span class="fst">' + f.stamina + ' sta</span>';
    if (f.eitr) h += '<span class="fei">' + f.eitr + ' eitr</span>';
    h += '</div>';
  } else if (it.armor && it.armor.base && maxStats.skillMaxArmor[sub]) {
    var apct = Math.min(it.armor.base / maxStats.skillMaxArmor[sub], 1);
    h += armorBarSvg(apct, it.armor.base, it.armor, it.maxQuality, false, maxStats.maxArmor);
  } else if ((it.damages && sub !== 'Shields') || (it.block && it.block.power)) {
    h += '<div class="craft-item-bars">';
    if (it.damages && sub !== 'Shields' && maxStats.skillMaxDmg[sub]) {
      h += dmgBarSvg(combatDamage(it.damages), it, maxStats.skillMaxDmg[sub]);
    }
    if (it.block && it.block.power && maxStats.skillMaxBlock[sub]) {
      h += shieldSvg(Math.min(it.block.power / Math.max(maxStats.skillMaxBlock[sub], 64), 1), it.block.power);
    }
    h += '</div>';
  } else {
    h += '<div class="craft-item-cat">' + esc(sub || it.category || '') + '</div>';
  }
  h += '</div></div>';
  return h;
}

function renderTinyRecipeInner(resources) {
  var h = '';
  resources.forEach(function(res) {
    var resItem = craftItemsByCode[res.item];
    h += '<span style="display:inline-flex;align-items:center;gap:1px;flex-shrink:0">';
    if (resItem && resItem.hasIcon) h += '<img src="/api/icon/' + encodeURIComponent(res.item) + '.png" style="width:14px;height:14px;image-rendering:pixelated">';
    h += '<span style="font-size:9px;color:#999">' + res.amount + '</span></span>';
  });
  return h;
}

function renderTinyRecipe(resources) {
  return '<div style="display:flex;gap:3px;align-items:center;margin-top:1px;flex-wrap:nowrap;overflow:hidden">' + renderTinyRecipeInner(resources) + '</div>';
}

function findMeadBase(finishedCode) {
  if (!allItems) return null;
  for (var i = 0; i < allItems.length; i++) {
    if (allItems[i].meadFinished === finishedCode) return allItems[i];
  }
  return null;
}

function renderFoodListItem(it, maxStats) {
  var sel = it.code === pageSelectedCode ? ' selected' : '';
  var isMeadBase = it.subcategory === 'MeadKetill';
  var iconHtml = it.hasIcon
    ? '<img src="/api/icon/' + encodeURIComponent(it.code) + '.png" alt="" draggable="false">'
    : '<div class="craft-item-icon-placeholder"></div>';
  var h = '<div class="craft-item' + sel + badgeBgClass(it.code) + spoilerClass(it.code) + '" data-code="' + esc(it.code) + '" onclick="selectPageItem(\'' + esc(it.code) + '\')">' + spoilerVeil(it.code);
  h += '<div class="craft-item-badge">';
  if (craftFavorites[it.code]) h += ICON_STAR;
  if (craftSpeedrun[it.code]) h += ICON_RUNNER;
  h += '</div>';
  h += iconHtml;
  h += '<div class="craft-item-info"><div class="craft-item-name">';
  var r = it.recipe || {};
  if (r.station === 'piece_cauldron' || r.station === 'piece_MeadCauldron') {
    h += '<span style="font-size:11px;font-weight:bold;color:#ca0;margin-right:4px">' + (r.stationLevel || 1) + '</span>';
  }
  h += esc(it.name || it.code) + '</div>';
  if (it.food) {
    var f = it.food;
    h += '<div class="craft-item-bars" style="gap:3px">';
    h += forkSvg(foodForkType(f), 14);
    h += foodMiniBar(maxStats.maxHp ? (f.health||0) / maxStats.maxHp : 0, f.health||0, '#c55', 'HP');
    h += foodMiniBar(maxStats.maxSta ? (f.stamina||0) / maxStats.maxSta : 0, f.stamina||0, '#cc5', 'STA');
    h += foodMiniBar(maxStats.maxEitr ? (f.eitr||0) / maxStats.maxEitr : 0, f.eitr||0, '#58c', 'EITR');
    if (f.regen && maxStats.maxRegen) h += regenHeart(f.regen / maxStats.maxRegen, f.regen);
    h += '</div>';
  } else if (isMeadBase && it.recipe && it.recipe.resources) {
    h += renderTinyRecipe(it.recipe.resources);
    var baseSe = (it.meadFinished && craftItemsByCode[it.meadFinished]) ? (craftItemsByCode[it.meadFinished].statusEffect || it.statusEffect) : it.statusEffect;
    if (baseSe) {
      h += '<div style="font-size:10px;color:#8ac;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + statusEffectSummary(baseSe, it.meadFinished || it.code) + '</div>';
    }
  } else if (it.subcategory === 'Fermenter') {
    var se = it.statusEffect;
    if (se) {
      h += '<div style="font-size:10px;color:#8ac;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + statusEffectSummary(se, it.code) + '</div>';
    }
  } else {
    h += '<div class="craft-item-cat">' + esc(it.subcategory || '') + '</div>';
  }
  h += '</div></div>';
  return h;
}

function renderMeadListItem(it, maxStats) {
  var sel = it.code === pageSelectedCode ? ' selected' : '';
  var paired = it.meadFinished ? craftItemsByCode[it.meadFinished] : null;
  var displayIcon = paired && paired.hasIcon ? paired.code : (it.hasIcon ? it.code : '');
  var iconHtml = displayIcon
    ? '<img src="/api/icon/' + encodeURIComponent(displayIcon) + '.png" alt="" draggable="false" style="width:32px;height:32px;image-rendering:pixelated;flex-shrink:0">'
    : '<div class="craft-item-icon-placeholder"></div>';
  var displayName = paired ? paired.name : it.name;
  var h = '<div class="craft-item' + sel + badgeBgClass(it.code) + spoilerClass(it.code) + '" data-code="' + esc(it.code) + '" onclick="selectPageItem(\'' + esc(it.code) + '\')">' + spoilerVeil(it.code);
  h += '<div class="craft-item-badge">';
  if (craftFavorites[it.code]) h += ICON_STAR;
  if (craftSpeedrun[it.code]) h += ICON_RUNNER;
  h += '</div>';
  h += iconHtml;
  h += '<div class="craft-item-info"><div class="craft-item-name">' + esc(displayName || it.code) + '</div>';
  h += '<div class="craft-item-cat" style="color:#cda">' + esc(it.subcategory || '') + '</div>';
  h += '</div></div>';
  return h;
}

function renderArmorListItem(it, maxStats) {
  var sel = it.code === pageSelectedCode ? ' selected' : '';
  var iconHtml = it.hasIcon
    ? '<img src="/api/icon/' + encodeURIComponent(it.code) + '.png" alt="" draggable="false">'
    : '<div class="craft-item-icon-placeholder"></div>';
  var h = '<div class="craft-item' + sel + badgeBgClass(it.code) + spoilerClass(it.code) + '" data-code="' + esc(it.code) + '" onclick="selectPageItem(\'' + esc(it.code) + '\')">' + spoilerVeil(it.code);
  h += '<div class="craft-item-badge">';
  if (craftFavorites[it.code]) h += ICON_STAR;
  if (craftSpeedrun[it.code]) h += ICON_RUNNER;
  h += '</div>';
  h += iconHtml;
  h += '<div class="craft-item-info"><div class="craft-item-name">' + esc(it.name || it.code) + '</div>';
  var trinket = it.trinket;
  var trinketFx = it.trinketEffect;
  var vp = it.vendorPrice;
  var UTILITY_DESC = {'BeltStrength':'+150 carry weight','Wishbone':'Detect buried treasure','Demister':'Clears Mistlands mist','CryptKey':'Opens Sunken Crypts'};
  if (UTILITY_DESC[it.code]) {
    h += '<div style="display:flex;gap:6px;font-size:11px;align-items:center">';
    h += '<span style="color:#8ac">' + UTILITY_DESC[it.code] + '</span>';
    if (vp) {
      h += '<svg viewBox="0 0 20 20" style="width:10px;height:10px;flex-shrink:0"><circle cx="10" cy="10" r="8" fill="#ca0"/></svg>';
      h += '<span style="color:#ca0;font-weight:bold">' + vp.cost + '</span>';
    }
    h += '</div>';
  } else if (trinket) {
    h += '<div style="display:flex;gap:6px;font-size:11px;align-items:center">';
    h += adrenalineSvg(12);
    h += '<span style="color:#f80;font-weight:bold">' + trinket.maxAdrenaline + '</span>';
    h += '<span style="color:#8ac">' + esc(trinketSummary(trinketFx)) + '</span>';
    h += '</div>';
  } else if (it.armor && it.armor.base && maxStats.maxArmor) {
    var itMaxArmor = it.armor.base + (it.armor.perLevel || 0) * ((it.maxQuality || 1) - 1);
    var _amv = it.modifiers && it.modifiers.movement;
    var _amvPct = _amv ? Math.round(_amv * 100) : 0;
    var _amvOpacity = _amv ? '' : 'opacity:0.05;';
    var _amvColor = _amvPct > 0 ? '#6c6' : '#c66';
    h += '<div style="display:flex;gap:8px;align-items:center">';
    h += armorBarSvg(itMaxArmor / maxStats.maxArmor, it.armor.base, it.armor, it.maxQuality, false, maxStats.maxArmor);
    h += '<span style="font-size:11px;font-weight:bold;color:' + _amvColor + ';min-width:28px;text-align:right;' + _amvOpacity + '">' + (_amvPct > 0 ? '+' : '') + _amvPct + '%</span>';
    h += '</div>';
  } else if (it.block && it.block.power && maxStats.maxBlock) {
    h += '<div style="display:flex;gap:8px;align-items:center;font-size:11px">';
    h += shieldSvg(it.block.power / Math.max(maxStats.maxBlock, 64), it.block.power);
    var _parry = it.block.parryBonus || 0;
    var _parryCol = _parry >= 2 ? '#4c8' : '#ca0';
    h += '<span style="color:' + _parryCol + ';font-weight:bold;min-width:28px;text-align:right">' + (_parry ? _parry + 'x' : '') + '</span>';
    h += '<span style="color:#8ac;min-width:28px;text-align:right">' + (it.block.force || '') + '</span>';
    var _mv = it.modifiers && it.modifiers.movement;
    h += '<span style="color:#c66;min-width:28px;text-align:right">' + (_mv ? Math.round(_mv * 100) + '%' : '') + '</span>';
    h += '</div>';
  } else {
    h += '<div class="craft-item-cat">' + esc(it.subcategory || '') + '</div>';
  }
  h += '</div></div>';
  return h;
}

function renderTrophyListItem(it, maxStats) {
  return renderBestiaryListItem(it, maxStats);
}

var BESTIARY_MOD_FILLS = {
  'VeryWeak':1,'Weak':0.75,'Normal':0.5,'Resistant':0.25,'VeryResistant':0.125,'Immune':0
};
var BESTIARY_MOD_LABELS = {
  'VeryWeak':'Very Weak','Weak':'Weak','Normal':'','Resistant':'Resist','VeryResistant':'V.Resist','Immune':'Immune'
};
var BESTIARY_MOD_ORDER = ['Blunt','Slash','Pierce','Fire','Frost','Lightning','Poison','Spirit'];

function bestiaryModBox(dt, mod, size) {
  var stroke = DMG_COLORS[dt.toLowerCase()] || '#888';
  var fill = BESTIARY_MOD_FILLS[mod] !== undefined ? BESTIARY_MOD_FILLS[mod] : 0.5;
  var fillH = Math.round(fill * size);
  var fillY = size - fillH;
  var s = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" style="display:block">';
  // Fill from bottom
  if (fillH > 0) {
    s += '<rect x="1" y="' + (fillY + 1) + '" width="' + (size - 2) + '" height="' + (fillH - 1) + '" fill="' + stroke + '" opacity="0.45" rx="1"/>';
  }
  // Stroke border
  var strokeOpacity = fill === 0 ? 0.25 : 1;
  s += '<rect x="0.5" y="0.5" width="' + (size - 1) + '" height="' + (size - 1) + '" fill="none" stroke="' + stroke + '" stroke-width="1.5" rx="2" opacity="' + strokeOpacity + '"/>';
  s += '</svg>';
  return s;
}

function renderBestiaryListItem(it, maxStats) {
  var sel = it.code === pageSelectedCode ? ' selected' : '';
  var iconHtml = it.hasIcon
    ? '<img src="/api/icon/' + encodeURIComponent(it.code) + '.png" alt="" draggable="false">'
    : '<div class="craft-item-icon-placeholder"></div>';
  var td = it.trophyDrop;
  var liMinStar = td.minStar || 0;
  var hp = (liMinStar ? td.hp * (liMinStar + 1) : td.hp) || '?';
  // Biome categories are locked outright, but All / Favorites / Speedrun mix
  // every biome together — those rows blur like any other item.
  var h = '<div class="craft-item' + sel + badgeBgClass(it.code) + spoilerClass(it.code) + '" data-code="' + esc(it.code) + '" onclick="selectPageItem(\'' + esc(it.code) + '\')">' + spoilerVeil(it.code);
  h += '<div class="craft-item-badge">';
  if (craftFavorites[it.code]) h += ICON_STAR;
  if (craftSpeedrun[it.code]) h += ICON_RUNNER;
  h += '</div>';
  h += iconHtml;
  h += '<div class="craft-item-info"><div class="craft-item-name">' + esc(td.creature || it.name || it.code) + '</div>';
  h += '<div style="display:flex;gap:6px;align-items:center;font-size:11px;flex-wrap:wrap">';
  h += '<span style="color:#c55;font-weight:bold">' + hp + ' HP</span>';
  if (liMinStar) h += '<span style="color:#ca0;font-weight:bold;font-size:10px">' + liMinStar + '★</span>';
  if (td.boss) h += '<span style="color:#ca0;font-weight:bold">BOSS</span>';
  if (td.flying) h += '<span style="color:#8cf;font-size:10px">Flying</span>';
  if (td.tameable) h += '<span style="color:#6c6;font-size:10px">Tame</span>';
  h += '</div>';
  // Mini modifier boxes
  var mods = td.modifiers || {};
  h += '<div style="display:flex;gap:2px;margin-top:2px" title="Blunt Slash Pierce Fire Frost Lightning Poison Spirit">';
  for (var mi = 0; mi < BESTIARY_MOD_ORDER.length; mi++) {
    var dt = BESTIARY_MOD_ORDER[mi];
    var mod = mods[dt] || 'Normal';
    h += '<span title="' + dt + ': ' + (BESTIARY_MOD_LABELS[mod] || mod || 'Normal') + '">' + bestiaryModBox(dt, mod, 12) + '</span>';
  }
  h += '</div>';
  h += '</div></div>';
  return h;
}

function renderComfortListItem(it, maxStats) {
  var sel = it.code === pageSelectedCode ? ' selected' : '';
  var iconHtml = it.hasIcon
    ? '<img src="/api/icon/' + encodeURIComponent(it.code) + '.png" alt="" draggable="false">'
    : '<div class="craft-item-icon-placeholder"></div>';
  var h = '<div class="craft-item' + sel + badgeBgClass(it.code) + spoilerClass(it.code) + '" data-code="' + esc(it.code) + '" onclick="selectPageItem(\'' + esc(it.code) + '\')">' + spoilerVeil(it.code);
  h += '<div class="craft-item-badge">';
  if (craftFavorites[it.code]) h += ICON_STAR;
  if (craftSpeedrun[it.code]) h += ICON_RUNNER;
  h += '</div>';
  h += iconHtml;
  h += '<div class="craft-item-info"><div class="craft-item-name">' + esc(it.name || it.code) + '</div>';
  h += '<div style="display:flex;align-items:center;gap:4px">';
  h += '<span style="color:#8cf;font-weight:bold;font-size:12px">+' + it.comfort + '</span>';
  h += '<span class="craft-item-cat" style="margin:0">' + esc(it.comfortGroup || '') + '</span>';
  if (it.seasonal) h += '<span class="comfort-tag seasonal">' + esc(it.seasonal) + '</span>';
  if (it.comfortGroup === 'Fire') h += '<span class="comfort-tag fire">Lit</span>';
  h += '</div></div></div>';
  return h;
}

function renderComfortDetailFull(code) {
  var it = craftItemsByCode[code];
  if (!it) return;
  var detail = document.getElementById('items-detail');
  var h = '<div class="detail-header">';
  h += '<div class="detail-toggles">';
  h += '<button class="detail-toggle-btn' + (craftFavorites[code] ? ' active' : '') + '" onclick="toggleFavorite(\'' + esc(code) + '\')" title="Favorite">' + ICON_STAR + '</button>';
  h += '<button class="detail-toggle-btn' + (craftSpeedrun[code] ? ' active' : '') + '" onclick="toggleSpeedrun(\'' + esc(code) + '\')" title="Speedrun">' + ICON_RUNNER + '</button>';
  h += '</div>';
  if (it.hasIcon) h += '<img class="detail-icon" src="/api/icon/' + encodeURIComponent(it.code) + '.png" alt="">';
  h += '<div><div class="detail-title">' + esc(it.name || it.code) + '</div>';
  if (it.description) {
    var desc = it.description.replace(/<color[^>]*>/g, '').replace(/<\/color>/g, '');
    h += '<div class="detail-desc">' + esc(desc) + '</div>';
  }
  h += '<div class="detail-meta">' + esc(it.comfortGroup || 'Comfort') + '</div>';
  h += '</div></div>';

  // Comfort value
  h += '<div class="detail-section">Comfort</div>';
  h += '<div class="detail-stat-row"><span class="label">Comfort bonus</span><span class="val" style="color:#8cf;font-weight:bold">+' + it.comfort + '</span></div>';
  h += '<div class="detail-stat-row"><span class="label">Category</span><span class="val">' + esc(it.comfortGroup || '') + '</span></div>';
  if (COMFORT_GROUP_DESC[it.comfortGroup]) {
    h += '<div class="detail-stat-row"><span class="label" style="color:#888;font-size:11px">' + esc(COMFORT_GROUP_DESC[it.comfortGroup]) + '</span></div>';
  }
  if (it.seasonal) h += '<div class="detail-stat-row"><span class="label">Availability</span><span class="val"><span class="comfort-tag seasonal">' + esc(it.seasonal) + ' event only</span></span></div>';
  if (it.playerBase) h += '<div class="detail-stat-row"><span class="label">Player base</span><span class="val"><span class="comfort-tag pb">Base</span></span></div>';
  if (it.attackedOnSight) h += '<div class="detail-stat-row"><span class="label">Mob target</span><span class="val"><span class="comfort-tag aos">Targeted</span></span></div>';
  if (it.comfortGroup === 'Fire') h += '<div class="detail-stat-row"><span class="label">Requires</span><span class="val"><span class="comfort-tag fire">Lit</span></span></div>';

  // Recipe
  var resources = (it.recipe && it.recipe.resources) || [];
  if (resources.length) {
    h += renderRecipeCards(it);
  }
  h += '<div class="detail-item-md" data-code="' + esc(code) + '"></div>';

  detail.innerHTML = h;
}

function renderBestiaryDetailFull(code) {
  var it = craftItemsByCode[code];
  if (!it) return;
  var detail = document.getElementById('items-detail');
  var td = it.trophyDrop || {};
  var h = '';

  // ── Star model ─────────────────────────────────────────────────
  // Star range comes from the game's spawn config (minStar..maxStar): maxStar 0
  // means the creature never spawns starred (no selector); minStar==maxStar>0
  // means it ALWAYS spawns starred (e.g. Lord Reto, locked at 2★); otherwise a
  // selector spans the range, swaps the render, and auto-rotates every 2.5s.
  var mob = (typeof mobImages !== 'undefined' && mobImages && mobImages.images) ? mobImages.images[code] : null;
  var credit = (typeof mobImages !== 'undefined' && mobImages) ? mobImages._credit : null;
  var maxStar = td.maxStar || 0;
  var minStar = td.minStar || 0;
  var canStar = !!td.hp && !td.boss && maxStar > 0;
  var fixedStar = (canStar && minStar === maxStar) ? maxStar : null;
  var selStars = [];
  if (canStar) { for (var ss = minStar; ss <= maxStar; ss++) selStars.push(ss); }
  var initStar = canStar ? minStar : 0;

  // Resolve an image per star with graceful fallback (per-star → nearest → definitive).
  function mobImgFor(s) {
    if (mob && mob.stars && mob.stars[s]) return mob.stars[s];
    if (mob && mob.stars) {
      var ks = Object.keys(mob.stars).map(Number).sort(function (a, b) { return a - b; });
      var pick = null;
      for (var i = 0; i < ks.length; i++) { if (ks[i] <= s) pick = ks[i]; }
      if (pick == null && ks.length) pick = ks[0];
      if (pick != null) return mob.stars[pick];
    }
    if (mob && mob.image) return mob.image;
    return null;
  }
  var imgByStar = { 0: mobImgFor(0), 1: mobImgFor(1), 2: mobImgFor(2) };
  var hasRender = !!(mob && (imgByStar[initStar]));

  // ── Profile: art (or gray placeholder) on the left, info on the right ──
  // Two columns that collapse gracefully on a phone (flex-wrap).
  var tags = [];
  if (td.biome) tags.push(td.biome);
  if (td.boss) tags.push('Boss');
  if (td.flying) tags.push('Flying');
  if (td.tameable) tags.push('Tameable');

  h += '<div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px">';

  // LEFT: shrunk render or gray box, with attribution + star selector beneath.
  h += '<div style="flex:0 0 auto;width:132px;max-width:42vw">';
  if (hasRender) {
    // Fixed square frame + object-fit:contain so every creature's art occupies
    // the same box regardless of its native aspect ratio (matches the gray box).
    h += '<div style="width:100%;aspect-ratio:1/1;background:rgba(0,0,0,0.15);border-radius:6px;overflow:hidden;display:flex;align-items:center;justify-content:center">';
    h += '<img id="vh-mob-img" src="' + esc(imgByStar[initStar]) + '" alt="' + esc(td.creature || it.name) + '" style="width:100%;height:100%;object-fit:contain;display:block">';
    h += '</div>';
    if (credit && credit.author) {
      var creditHref = esc(credit.source || 'https://valheim.fandom.com');
      h += '<div style="font-size:9px;color:#666;margin-top:3px;line-height:1.3;text-align:center">Art by <a href="' + creditHref + '" target="_blank" rel="noopener noreferrer" style="color:#8a8a8a">' + esc(credit.author) + '</a>' + (credit.license ? ' · ' + esc(credit.license) : '') + '</div>';
    }
  } else {
    h += '<div style="width:100%;aspect-ratio:1/1;background:#2a2a2a;border:1px solid #3a3a3a;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#555;font-size:11px;text-align:center">';
    if (it.hasIcon) h += '<img src="/api/icon/' + encodeURIComponent(it.code) + '.png" style="width:52px;height:52px;image-rendering:pixelated;opacity:0.65">';
    else h += 'No art';
    h += '</div>';
  }
  if (selStars.length > 1) {
    h += '<div id="vh-mob-stars" style="display:flex;gap:5px;justify-content:center;flex-wrap:wrap;margin-top:8px">';
    for (var si = 0; si < selStars.length; si++) {
      var sv = selStars[si];
      var on = sv === initStar;
      h += '<button type="button" data-star="' + sv + '" onclick="window.__vhMobPick(' + sv + ')" ' +
        'style="cursor:pointer;font-size:12px;font-weight:bold;padding:3px 9px;border-radius:4px;border:1px solid ' +
        (on ? '#ca0;color:#ca0;background:rgba(204,170,0,0.12)' : '#444;color:#888;background:transparent') + '">' + sv + '★</button>';
    }
    h += '</div>';
  } else if (fixedStar != null) {
    h += '<div style="text-align:center;font-size:11px;color:#ca0;margin-top:8px">Always spawns at ' + fixedStar + '★</div>';
  }
  h += '</div>';

  // RIGHT: name, tags, and the stat cards.
  h += '<div style="flex:1 1 168px;min-width:150px">';
  h += '<div style="font-size:20px;font-weight:bold;color:#fff;line-height:1.15">' + esc(td.creature || it.name || it.code) + '</div>';
  if (tags.length) h += '<div style="font-size:12px;color:#888;margin-top:2px">' + tags.join(' · ') + '</div>';

  h += '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">';
  if (td.hp) {
    var cardHp = td.hp * (initStar + 1);
    h += '<div class="food-stat hp"><div class="fs-val" id="vh-mob-hp">' + cardHp + '</div><div class="fs-label" id="vh-mob-hp-label">' + (canStar || fixedStar != null ? 'HP (' + initStar + '★)' : 'HP') + '</div></div>';
  }
  if (td.staggerFactor > 0) {
    h += '<div class="food-stat"><div class="fs-val" style="color:#da4">' + Math.round(td.staggerFactor * 100) + '%</div><div class="fs-label">Stagger</div></div>';
  } else if (td.hp) {
    h += '<div class="food-stat"><div class="fs-val" style="color:#666">—</div><div class="fs-label">Stagger</div></div>';
  }
  if (td.rate > 0) {
    var pctStr = td.rate >= 1 ? '100%' : (td.rate * 100) + '%';
    h += '<div class="food-stat"><div class="fs-val" style="color:#c8c">' + pctStr + '</div><div class="fs-label">Trophy</div></div>';
  }
  var score = it.trophyScore || 0;
  if (score) h += '<div class="food-stat"><div class="fs-val" style="color:#ca0">' + score + '</div><div class="fs-label">Points</div></div>';
  h += '</div>';

  h += '</div>';  // right column
  h += '</div>';  // profile row

  // Info grid
  h += '<div style="display:grid;grid-template-columns:auto 1fr;gap:2px 12px;font-size:12px;margin:8px 0">';
  if (td.id) h += '<span style="color:#666">ID</span><span style="color:#aaa;font-family:monospace;font-size:11px">' + esc(td.id) + '</span>';
  if (td.faction) h += '<span style="color:#666">Faction</span><span style="color:#aaa">' + esc(td.faction) + '</span>';
  if (!td.noTrophy) h += '<span style="color:#666">Trophy</span><span style="color:#aaa">' + esc(it.name || it.code) + '</span>';
  if (td.stagger === false) h += '<span style="color:#666">Block Stagger</span><span style="color:#c66">Immune</span>';
  if (td.tameable) {
    var tameMin = Math.round((td.tamingTime || 0) / 60);
    h += '<span style="color:#666">Taming Time</span><span style="color:#6c6">' + tameMin + ' min</span>';
  }
  h += '</div>';

  // Resistance chart — 8 boxes with labels
  var mods = td.modifiers || {};
  h += '<div style="margin-top:10px">';
  h += '<div style="font-size:11px;color:#666;font-weight:bold;margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">Damage Modifiers</div>';
  h += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
  for (var i = 0; i < BESTIARY_MOD_ORDER.length; i++) {
    var dt = BESTIARY_MOD_ORDER[i];
    var mod = mods[dt] || 'Normal';
    var dmgCol = DMG_COLORS[dt.toLowerCase()] || '#888';
    var modLabel = BESTIARY_MOD_LABELS[mod];
    if (modLabel === undefined) modLabel = mod;
    h += '<div style="display:flex;flex-direction:column;align-items:center;gap:2px">';
    h += bestiaryModBox(dt, mod, 32);
    h += '<div style="font-size:9px;color:' + dmgCol + '">' + (dt === 'Lightning' ? 'Ltng' : dt) + '</div>';
    if (modLabel) h += '<div style="font-size:8px;color:#888">' + modLabel + '</div>';
    h += '</div>';
  }
  h += '</div>';
  h += '</div>';

  // Drops section
  var drops = td.drops || [];
  if (drops.length > 0) {
    h += '<div style="margin-top:10px">';
    h += '<div style="font-size:11px;color:#666;font-weight:bold;margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">Drops</div>';
    for (var di = 0; di < drops.length; di++) {
      var d = drops[di];
      var dIcon = d.code ? '<img src="/api/icon/' + encodeURIComponent(d.code) + '.png" style="width:20px;height:20px;image-rendering:pixelated;vertical-align:middle" onerror="this.style.display=\'none\'">' : '';
      var dChance = d.chance >= 1 ? '' : '<span style="color:#888;font-size:10px">' + Math.round(d.chance * 100) + '%</span>';
      var dAmt = '';
      if (d.min && d.max && (d.min !== 1 || d.max !== 1)) {
        dAmt = '<span style="color:#888;font-size:10px">×' + (d.min === d.max ? d.min : d.min + '-' + d.max) + '</span>';
      }
      var dStar = d.perStar ? '<span style="color:#ca0;font-size:10px" title="Quantity scales with star level">★+</span>' : '';
      h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">';
      h += dIcon;
      h += '<span style="font-size:12px;color:#ccc">' + esc(d.item) + '</span>';
      h += dChance + dAmt + dStar;
      h += '</div>';
    }
    h += '</div>';
  }

  h += '<div class="detail-item-md" data-code="' + esc(code) + '"></div>';

  // Vendor price if any
  if (it.vendorPrice) {
    h += '<div style="margin-top:8px;font-size:12px;color:#ca0">Vendor: ' + it.vendorPrice + ' coins</div>';
  }

  detail.innerHTML = h;
  detail.style.background = '';

  // ── Star selector state + 2.5s auto-rotation ───────────────────
  vhMobStop();
  window.__vhMob = { code: code, base: td.hp || 0, cur: initStar, stars: selStars, imgByStar: imgByStar };
  if (selStars.length > 1) {
    window.__vhMobTimer = setInterval(function () {
      var m = window.__vhMob;
      // Self-clean if the detail was replaced/unmounted.
      if (!m || !document.getElementById('vh-mob-hp')) { vhMobStop(); return; }
      var idx = m.stars.indexOf(m.cur);
      window.__vhMobApply(m.stars[(idx + 1) % m.stars.length]);
    }, 2500);
  }
}

// Apply a star: swap render, update HP readout, highlight the active button.
function vhMobApply(star) {
  var m = window.__vhMob;
  if (!m) return;
  m.cur = star;
  var img = document.getElementById('vh-mob-img');
  if (img && m.imgByStar && m.imgByStar[star]) img.src = m.imgByStar[star];
  var hp = document.getElementById('vh-mob-hp');
  if (hp && m.base) hp.textContent = m.base * (star + 1);
  var lbl = document.getElementById('vh-mob-hp-label');
  if (lbl && m.base) lbl.textContent = 'HP (' + star + '★)';
  var wrap = document.getElementById('vh-mob-stars');
  if (wrap) {
    var btns = wrap.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var on = Number(btns[i].getAttribute('data-star')) === star;
      btns[i].style.borderColor = on ? '#ca0' : '#444';
      btns[i].style.color = on ? '#ca0' : '#888';
      btns[i].style.background = on ? 'rgba(204,170,0,0.12)' : 'transparent';
    }
  }
}
function vhMobStop() {
  if (window.__vhMobTimer) { clearInterval(window.__vhMobTimer); window.__vhMobTimer = null; }
}
// Manual pick stops auto-rotation.
window.__vhMobApply = vhMobApply;
window.__vhMobPick = function (star) { vhMobStop(); vhMobApply(star); };

// ── Per-page detail renderers ──

function scaleFontSize(text, maxWidth) {
  var baseSize = 9, charW = 5.5;
  var textW = text.length * charW;
  if (textW <= maxWidth) return baseSize;
  return Math.max(7, Math.floor(baseSize * maxWidth / textW));
}

function renderCraftDetailFull(code) {
  var it = craftItemsByCode[code];
  if (!it) return;
  var detail = document.getElementById('items-detail');
  renderGenericDetail(code, detail);
}

function formatDuration(secs) {
  if (secs >= 60) return Math.round(secs / 60) + ' min';
  return Math.round(secs) + 's';
}

function renderStatusEffectSection(se) {
  if (!se) return '';
  var h = '<div class="detail-section">Effect</div>';
  var stats = [];
  if (se.duration) stats.push(['Duration', formatDuration(se.duration)]);
  if (se.cooldown) stats.push(['Cooldown', formatDuration(se.cooldown)]);
  if (se.healthOverTime) stats.push(['Heal', '+' + se.healthOverTime + ' HP over ' + se.healthOverTimeDuration + 's']);
  if (se.healthUpFront) stats.push(['Instant Heal', '+' + se.healthUpFront + ' HP']);
  if (se.healthRegenMultiplier && se.healthRegenMultiplier !== 1) stats.push(['HP Regen', (se.healthRegenMultiplier > 1 ? '+' : '') + Math.round((se.healthRegenMultiplier - 1) * 100) + '%']);
  if (se.staminaOverTime) stats.push(['Stamina', '+' + se.staminaOverTime + ' over ' + se.staminaOverTimeDuration + 's']);
  if (se.staminaUpFront) stats.push(['Instant Stamina', '+' + se.staminaUpFront]);
  if (se.staminaRegenMultiplier && se.staminaRegenMultiplier !== 1) stats.push(['Stamina Regen', (se.staminaRegenMultiplier > 1 ? '+' : '') + Math.round((se.staminaRegenMultiplier - 1) * 100) + '%']);
  if (se.eitrOverTime) stats.push(['Eitr', '+' + se.eitrOverTime + ' over ' + se.eitrOverTimeDuration + 's']);
  if (se.eitrUpFront) stats.push(['Instant Eitr', '+' + se.eitrUpFront]);
  if (se.eitrRegenMultiplier && se.eitrRegenMultiplier !== 1) stats.push(['Eitr Regen', (se.eitrRegenMultiplier > 1 ? '+' : '') + Math.round((se.eitrRegenMultiplier - 1) * 100) + '%']);
  if (se.speedModifier) stats.push(['Speed', (se.speedModifier > 0 ? '+' : '') + Math.round(se.speedModifier * 100) + '%']);
  if (se.carryWeight) stats.push(['Carry Weight', '+' + se.carryWeight]);
  if (se.damageModifier && se.damageModifier !== 1) stats.push(['Damage', (se.damageModifier > 1 ? '+' : '') + Math.round((se.damageModifier - 1) * 100) + '%']);
  if (se.jumpModifier) stats.push(['Jump Height', '+' + Math.round(se.jumpModifier * 100) + '%']);
  if (se.jumpStaminaModifier) stats.push(['Jump Stamina', Math.round(se.jumpStaminaModifier * 100) + '%']);
  if (se.swimStaminaModifier) stats.push(['Swim Stamina', Math.round(se.swimStaminaModifier * 100) + '%']);
  if (se.fallDamageModifier) stats.push(['Fall Damage', Math.round(se.fallDamageModifier * 100) + '%']);
  if (se.stealthModifier) stats.push(['Stealth', (se.stealthModifier > 0 ? '+' : '') + Math.round(se.stealthModifier * 100) + '%']);
  if (se.resistances) {
    se.resistances.forEach(function(r) {
      stats.push([r.type, r.modifier]);
    });
  }
  stats.forEach(function(s) {
    h += '<div class="detail-stat-row"><span class="label">' + s[0] + '</span><span class="val">' + s[1] + '</span></div>';
  });
  return h;
}

var SPECIAL_EFFECT_NOTES = {
  MeadBugRepellent: 'Immune to Deathsquito',
  MeadBaseBugRepellent: 'Immune to Deathsquito',
  MeadTamer: '2x Faster Tames',
  MeadBaseTamer: '2x Faster Tames',
  MeadTrollPheromones: 'Increased spawns',
  MeadBzerker: '-80% Stam usage',
  MeadBaseBzerker: '-80% Stam usage'
};

function statusEffectSummary(se, code) {
  if (!se) return '';
  // Items with a curated note override the auto-generated stat list
  if (code && SPECIAL_EFFECT_NOTES[code]) {
    var override = SPECIAL_EFFECT_NOTES[code];
    if (se.duration) {
      var dur = se.duration >= 60 ? Math.round(se.duration / 60) + ' min' : Math.round(se.duration) + ' secs';
      override += ' · ' + dur;
    }
    return override;
  }
  var parts = [];
  if (se.healthOverTime) parts.push('+' + se.healthOverTime + ' HP');
  if (se.healthRegenMultiplier && se.healthRegenMultiplier !== 1) parts.push('HP regen ' + (se.healthRegenMultiplier > 1 ? '+' : '') + Math.round((se.healthRegenMultiplier - 1) * 100) + '%');
  if (se.staminaOverTime) parts.push('+' + se.staminaOverTime + ' sta');
  if (se.staminaRegenMultiplier && se.staminaRegenMultiplier !== 1) parts.push('sta regen ' + (se.staminaRegenMultiplier > 1 ? '+' : '') + Math.round((se.staminaRegenMultiplier - 1) * 100) + '%');
  if (se.eitrOverTime) parts.push('+' + se.eitrOverTime + ' eitr');
  if (se.eitrRegenMultiplier && se.eitrRegenMultiplier !== 1) parts.push('eitr regen ' + (se.eitrRegenMultiplier > 1 ? '+' : '') + Math.round((se.eitrRegenMultiplier - 1) * 100) + '%');
  if (se.speedModifier) parts.push('speed +' + Math.round(se.speedModifier * 100) + '%');
  if (se.carryWeight) parts.push('+' + se.carryWeight + ' carry');
  if (se.swimStaminaModifier) parts.push('swim ' + Math.round(se.swimStaminaModifier * 100) + '%');
  if (se.jumpModifier) parts.push('jump +' + Math.round(se.jumpModifier * 100) + '%');
  if (se.resistances) se.resistances.forEach(function(r) { parts.push(r.type + ' ' + r.modifier); });
  if (se.duration) parts.push(formatDuration(se.duration));
  var s = parts.join(' \u00b7 ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function renderFoodDetailFull(code) {
  var it = craftItemsByCode[code];
  if (!it) return;
  // Mead bases → use mead detail renderer
  if (it.subcategory === 'MeadKetill') {
    renderMeadDetailFull(code);
    return;
  }
  var detail = document.getElementById('items-detail');
  renderGenericDetail(code, detail);
  // Finished mead → show its base + the base's ingredients (above Properties)
  if (it.subcategory === 'Fermenter') {
    var meadBase = findMeadBase(code);
    if (meadBase) {
      var stationName = 'Mead Cauldron';
      if (meadBase.recipe && meadBase.recipe.station) {
        var _ms = craftItemsByCode[meadBase.recipe.station];
        if (_ms && _ms.name) stationName = _ms.name;
      }
      var hm = '<div class="detail-section">' + esc(stationName) + '</div>';
      hm += '<div class="mead-link" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;cursor:pointer" onclick="selectPageItem(\'' + esc(meadBase.code) + '\')">';
      if (meadBase.hasIcon) hm += '<img src="/api/icon/' + encodeURIComponent(meadBase.code) + '.png" style="width:24px;height:24px;image-rendering:pixelated">';
      hm += '<div><div style="color:#8cf;font-size:12px;font-weight:bold;text-decoration:underline">' + esc(meadBase.name || meadBase.code) + '</div>';
      hm += '<div style="color:#888;font-size:11px">Ferments in ~2 days</div></div></div>';
      if (meadBase.recipe && meadBase.recipe.resources) {
        hm += renderRecipeByQuality(meadBase);
      }
      // Insert above Properties section if present, else append
      var sections = detail.querySelectorAll('.detail-section');
      var propsSection = null;
      for (var _si = 0; _si < sections.length; _si++) {
        if (sections[_si].textContent === 'Properties') { propsSection = sections[_si]; break; }
      }
      var temp = document.createElement('div');
      temp.innerHTML = hm;
      if (propsSection && propsSection.parentNode) {
        while (temp.firstChild) propsSection.parentNode.insertBefore(temp.firstChild, propsSection);
      } else {
        while (temp.firstChild) detail.appendChild(temp.firstChild);
      }
    }
    return;
  }
  // If no recipe, check for a cooking source
  if (it.recipe) return;
  var sourceCode = it.cookSource;
  if (!sourceCode) return;
  var source = craftItemsByCode[sourceCode];
  if (!source) return;
  var h = detail.innerHTML;
  h += '<div style="margin-top:12px;border-top:1px solid #333;padding-top:8px">';
  h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">';
  if (source.hasIcon) h += '<img src="/api/icon/' + encodeURIComponent(sourceCode) + '.png" style="width:32px;height:32px;image-rendering:pixelated">';
  h += '<div><div style="color:#fff;font-size:13px;font-weight:bold">' + esc(source.name || sourceCode) + '</div>';
  var stationLabel = (it.subcategory === 'IronCooking') ? 'Iron Cooking Station' : (it.subcategory === 'CookingStation' ? 'Cooking Station' : 'Prep Table \u2192 Stone Oven');
  h += '<div style="color:#888;font-size:11px">' + esc(stationLabel) + '</div></div></div>';
  if (source.recipe && source.recipe.resources) {
    h += renderRecipeCards(source);
  } else {
    h += '<div class="recipe-cards">';
    h += '<div class="recipe-card">';
    h += '<div class="recipe-card-name" style="font-size:' + scaleFontSize(source.name || sourceCode, 52) + 'px">' + esc(source.name || sourceCode) + '</div>';
    if (source.hasIcon) h += '<img src="/api/icon/' + encodeURIComponent(sourceCode) + '.png" alt="">';
    else h += '<div style="width:32px;height:32px;background:#222;border-radius:4px"></div>';
    h += '<div class="recipe-card-count">1</div></div></div>';
  }
  h += '</div>';
  detail.innerHTML = h;
}

function renderMeadDetailFull(code) {
  var base = craftItemsByCode[code];
  if (!base) return;
  var detail = document.getElementById('items-detail');
  // Show base as main item with generic detail (recipe, stats, etc.)
  renderGenericDetail(code, detail);

  // Reorder: Effect → (Ferments into) → Properties
  function findSection(label) {
    var ss = detail.querySelectorAll('.detail-section');
    for (var i = 0; i < ss.length; i++) if (ss[i].textContent === label) return ss[i];
    return null;
  }
  function sectionRange(secEl) {
    var nodes = [secEl];
    var n = secEl.nextElementSibling;
    while (n && !n.classList.contains('detail-section')) { nodes.push(n); n = n.nextElementSibling; }
    return nodes;
  }

  var propsSection = findSection('Properties');
  var effectSection = findSection('Effect');
  if (propsSection && effectSection) {
    var effectNodes = sectionRange(effectSection);
    var anchor = effectNodes[effectNodes.length - 1].nextSibling;
    var propsNodes = sectionRange(propsSection);
    propsNodes.forEach(function(n) { detail.insertBefore(n, anchor); });
  }

  // Insert "Ferments into" block above (now-relocated) Properties section
  var paired = base.meadFinished ? craftItemsByCode[base.meadFinished] : null;
  if (paired) {
    var meadCount = (code === 'MeadBaseBzerker') ? 3 : 6;
    var h = '<div class="mead-ferments-block" style="margin-top:12px;border-top:1px solid #333;padding-top:8px">';
    h += '<div class="mead-link" style="display:flex;align-items:center;gap:8px;cursor:pointer" onclick="selectPageItem(\'' + esc(paired.code) + '\')">';
    if (paired.hasIcon) h += '<img src="/api/icon/' + encodeURIComponent(paired.code) + '.png" style="width:32px;height:32px;image-rendering:pixelated">';
    h += '<div><div style="color:#8cf;font-size:13px">Ferments into ' + meadCount + 'x <span style="font-weight:bold;text-decoration:underline">' + esc(paired.name || paired.code) + '</span> in ~2 days</div>';
    if (paired.description) {
      var desc = paired.description.replace(/<color[^>]*>/g, '').replace(/<\/color>/g, '');
      h += '<div style="color:#888;font-size:11px;margin-top:2px">' + esc(desc) + '</div>';
    }
    h += '</div></div>';
    h += '</div>';

    var temp = document.createElement('div');
    temp.innerHTML = h;
    var insertBefore = findSection('Effect') || findSection('Properties');
    while (temp.firstChild) {
      if (insertBefore && insertBefore.parentNode) insertBefore.parentNode.insertBefore(temp.firstChild, insertBefore);
      else detail.appendChild(temp.firstChild);
    }
  }
}

function renderArmorDetailFull(code) {
  var it = craftItemsByCode[code];
  if (!it) return;
  var detail = document.getElementById('items-detail');
  renderGenericDetail(code, detail);
}

function renderRecipeCards(item) {
  var h = '<div class="recipe-cards">';
  var r = item.recipe;
  if (r.station) {
    var stationItem = craftItemsByCode[r.station];
    var stLvl = r.stationLevel || 1;
    h += '<div class="recipe-station-card">';
    h += '<div class="recipe-station-star">';
    h += '<svg viewBox="0 0 24 24"><path fill="#b87333" stroke="#da5" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m8.587 8.236l2.598-5.232a.911.911 0 0 1 1.63 0l2.598 5.232l5.808.844a.902.902 0 0 1 .503 1.542l-4.202 4.07l.992 5.75c.127.738-.653 1.3-1.32.952L12 18.678l-5.195 2.716c-.666.349-1.446-.214-1.319-.953l.992-5.75l-4.202-4.07a.902.902 0 0 1 .503-1.54z"/></svg>';
    h += '<span class="lvl-num">' + stLvl + '</span></div>';
    // Link through to the station's guide page when it has one.
    var stName = esc(stationItem ? stationItem.name : r.station);
    var stPath = stationPage(r.station) ? '/guides/stations/' + r.station : '';
    h += '<div class="recipe-station-name">' + (stPath
      ? '<a href="' + stPath + '" onclick="if(window.__vhNavigate){event.preventDefault();window.__vhNavigate(\'' + stPath + '\');}">' + stName + '</a>'
      : stName) + '</div></div>';
  }
  (r.resources || []).forEach(function(res) {
    var resItem = craftItemsByCode[res.item];
    var resName = resItem ? (resItem.name || res.item) : res.item;
    var resHasIcon = resItem && resItem.hasIcon;
    h += '<div class="recipe-card">';
    h += '<div class="recipe-card-name" style="font-size:' + scaleFontSize(resName, 52) + 'px">' + esc(resName) + '</div>';
    if (resHasIcon) h += '<img src="/api/icon/' + encodeURIComponent(res.item) + '.png" alt="">';
    else h += '<div style="width:32px;height:32px;background:#222;border-radius:4px"></div>';
    var showPerLevel = res.perLevel && (item.maxQuality || 1) > 1;
    h += '<div class="recipe-card-count">' + res.amount + (showPerLevel ? '<span style="font-size:9px;color:#888"> +' + res.perLevel + '</span>' : '') + '</div>';
    h += '</div>';
  });
  h += '</div>';
  return h;
}

function renderRecipeByQuality(item) {
  var r = item.recipe;
  var maxQ = item.maxQuality || 1;
  var h = '';

  var stationName = '';
  var stLvl = r.stationLevel || 1;
  if (r.station) {
    var stationItem = craftItemsByCode[r.station];
    stationName = stationItem ? stationItem.name : r.station;
  }

  // One row per quality level
  for (var q = 1; q <= maxQ; q++) {
    h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">';
    // Station star with level
    var qLvl = r.station ? stLvl + (q - 1) : (q === 1 ? 0 : q - 1);
    var starOpacity = (!r.station && q === 1) ? 'opacity:0.05;' : '';
    h += '<div class="recipe-station-star" style="width:24px;height:24px;flex-shrink:0;' + starOpacity + '">';
    h += '<svg viewBox="0 0 24 24" style="width:24px;height:24px"><path fill="#b87333" stroke="#da5" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m8.587 8.236l2.598-5.232a.911.911 0 0 1 1.63 0l2.598 5.232l5.808.844a.902.902 0 0 1 .503 1.542l-4.202 4.07l.992 5.75c.127.738-.653 1.3-1.32.952L12 18.678l-5.195 2.716c-.666.349-1.446-.214-1.319-.953l.992-5.75l-4.202-4.07a.902.902 0 0 1 .503-1.54z"/></svg>';
    h += '<span class="lvl-num" style="font-size:11px">' + qLvl + '</span></div>';
    // Resource cards with count
    (r.resources || []).forEach(function(res) {
      var resItem = craftItemsByCode[res.item];
      var resName = resItem ? (resItem.name || res.item) : res.item;
      var resHasIcon = resItem && resItem.hasIcon;
      var amount = q === 1 ? res.amount : (res.perLevel || 0) * (q - 1);
      var cardOpacity = amount <= 0 ? 'opacity:0.05;' : '';
      h += '<div style="display:flex;align-items:center;background:#1a1a2e;border:1px solid #333;border-radius:4px;padding:2px 4px 2px 2px;gap:2px;' + cardOpacity + '" title="' + esc(resName) + '">';
      if (resHasIcon) h += '<img src="/api/icon/' + encodeURIComponent(res.item) + '.png" style="width:24px;height:24px;image-rendering:pixelated">';
      else h += '<div style="width:24px;height:24px;background:#222;border-radius:3px"></div>';
      h += '<span style="font-size:12px;font-weight:bold;color:#fff;min-width:24px;text-align:right">x' + Math.max(amount, 0) + '</span>';
      h += '</div>';
    });
    h += '</div>';
  }
  return h;
}

function buildStationInfo(stationCode, desc) {
  var station = craftItemsByCode[stationCode];
  if (!station) return '';
  var h = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">';
  if (station.hasIcon) h += '<img src="/api/icon/' + encodeURIComponent(stationCode) + '.png" style="width:32px;height:32px;image-rendering:pixelated">';
  h += '<div><div style="color:#cda;font-weight:bold">' + esc(station.name || stationCode) + '</div>';
  h += '<div style="color:#666;font-size:11px">' + esc(desc) + '</div></div></div>';
  var r = station.recipe || {};
  var resources = r.resources || [];
  if (resources.length) {
    h += renderRecipeCards(station);
  }
  return h;
}

function renderGenericDetail(code, detail) {
  var it = craftItemsByCode[code];
  if (!it) return;
  var isFav = craftFavorites[code];
  var isSpeed = craftSpeedrun[code];
  var h = '<div class="detail-header">';
  h += '<div class="detail-toggles">';
  h += '<button class="detail-toggle-btn' + (isFav ? ' active' : '') + '" onclick="toggleFavorite(\'' + esc(code) + '\')" title="Favorite">' + ICON_STAR + '</button>';
  h += '<button class="detail-toggle-btn' + (isSpeed ? ' active' : '') + '" onclick="toggleSpeedrun(\'' + esc(code) + '\')" title="Speedrun">' + ICON_RUNNER + '</button>';
  h += '</div>';
  if (it.hasIcon) h += '<img class="detail-icon" src="/api/icon/' + encodeURIComponent(it.code) + '.png" alt="">';
  h += '<div><div class="detail-title">' + esc(it.name || it.code) + '</div>';
  if (it.description) {
    var desc = it.description.replace(/<color[^>]*>/g, '').replace(/<\/color>/g, '');
    h += '<div class="detail-desc">' + esc(desc) + '</div>';
  }
  var _metaText = it.category || '';
  if (it.type && it.type !== it.category) _metaText += ' / ' + it.type;
  if (it.recipe && it.recipe.station) {
    var _st = craftItemsByCode[it.recipe.station];
    _metaText = _st ? _st.name : it.recipe.station;
  }
  h += '<div class="detail-meta">' + esc(_metaText) + '</div>';
  h += '</div></div>';
  var isUtilityItem = (it.code === 'BeltStrength' || it.code === 'Wishbone' || it.code === 'Demister' || it.code === 'CryptKey' || it.code.indexOf('Trinket') === 0);
  var stats = [];
  if (it.weight) stats.push(['Weight', it.weight]);
  if (it.maxStack && it.maxStack > 1) stats.push(['Stack', it.maxStack]);
  if (it.maxQuality && it.maxQuality > 1) stats.push(['Quality', '1-' + it.maxQuality]);
  if (it.teleportable === false) stats.push(['Teleport', 'No']);
  if (it.skill && !isUtilityItem) stats.push(['Skill', it.skill]);
  var vp = it.vendorPrice;
  if (vp) {
    h += '<div style="display:flex;align-items:center;gap:6px;margin:4px 0;padding:4px 0;border-top:1px solid #333">';
    h += '<svg viewBox="0 0 20 20" style="width:16px;height:16px;flex-shrink:0"><circle cx="10" cy="10" r="8" fill="#ca0"/></svg>';
    h += '<span style="color:#ca0;font-weight:bold;font-size:13px">' + vp.cost + '</span>';
    h += '<span style="color:#888;font-size:12px">' + (vp.qty ? 'for ' + vp.qty + 'x ' : '') + 'from ' + esc(vp.vendor) + '</span>';
    h += '</div>';
  }
  if (it.food) {
    var f = it.food;
    var _fMax = pageMaxStats || { maxHp: f.health||1, maxSta: f.stamina||1, maxEitr: f.eitr||1, maxRegen: f.regen||1 };
    h += '<div class="detail-section">Stats</div>';
    h += '<div style="display:flex;align-items:center;gap:12px">';
    h += forkSvg(foodForkType(f), 48);
    h += '<div class="craft-item-bars" style="flex:1;min-width:0;gap:3px;margin:8px 0">';
    h += foodMiniBar(_fMax.maxHp ? (f.health||0) / _fMax.maxHp : 0, f.health||0, '#c55', 'HP', true);
    h += foodMiniBar(_fMax.maxSta ? (f.stamina||0) / _fMax.maxSta : 0, f.stamina||0, '#cc5', 'STA', true);
    h += foodMiniBar(_fMax.maxEitr ? (f.eitr||0) / _fMax.maxEitr : 0, f.eitr||0, '#58c', 'EITR', true);
    if (f.regen && _fMax.maxRegen) h += regenHeart(f.regen / _fMax.maxRegen, f.regen, true);
    h += '</div>';
    h += '</div>';
    var dur = f.duration ? Math.round(f.duration / 60) : 0;
    stats.push(['Duration', dur + ' min']);
    if (f.regen) {
      stats.push(['Regen', f.regen + ' hp/tick']);
      stats.push(['Total Heal', Math.round(f.regen * (f.duration / 10)) + ' hp']);
    }
  }
  var isTrophy = it.page === 'bestiary';
  var isShield = it.category === 'Shield';
  var skipCombat = isTrophy || isShield || isUtilityItem;
  if (isTrophy && it.trophyDrop) {
    var td = it.trophyDrop;
    var pctStr = td.rate >= 1 ? '100%' : (td.rate * 100) + '%';
    var tScore = it.trophyScore || 0;
    h += '<div style="display:flex;gap:12px;margin:8px 0;flex-wrap:wrap">';
    h += '<div style="background:#1a1a2e;border:1px solid #333;border-radius:6px;padding:6px 12px;text-align:center"><div style="font-size:20px;font-weight:bold;color:#ca0">' + tScore + '</div><div style="font-size:10px;color:#888;text-transform:uppercase">Points</div></div>';
    h += '<div style="background:#1a1a2e;border:1px solid #333;border-radius:6px;padding:6px 12px;text-align:center"><div style="font-size:20px;font-weight:bold;color:#c8c">' + pctStr + '</div><div style="font-size:10px;color:#888;text-transform:uppercase">Drop Rate</div></div>';
    h += '</div>';
    stats.push(['Dropped by', td.creature]);
    if (td.biome) stats.push(['Biome', td.biome]);
    if (td.boss) stats.push(['Boss', 'Yes']);
  }
  if (!skipCombat && it.damages) {
    h += '<div class="detail-section">Damage</div>';
    // Large bar graph — use category max so empty boxes show relative scale
    var _ds = it.damageScale || {};
    var combatTotal = 0;
    var _dk2 = Object.keys(it.damages);
    for (var _j=0;_j<_dk2.length;_j++) { if (!NON_COMBAT_DMG[_dk2[_j]]) combatTotal += it.damages[_dk2[_j]] * (_ds[_dk2[_j]] || 1); }
    var sub = it.subcategory || '';
    var catMax = (pageMaxStats && pageMaxStats.skillMaxDmg[sub]) || combatTotal;
    var _hasBlock = !!(it.block && it.block.power);
    if (_hasBlock) {
      h += '<div style="display:flex;align-items:center;gap:12px">';
      h += '<div style="flex:1;min-width:0">' + dmgBarSvg(combatTotal, it, catMax, true) + '</div>';
      h += '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">';
      var _skillMaxBlock = (pageMaxStats && pageMaxStats.skillMaxBlock && pageMaxStats.skillMaxBlock[sub]) || it.block.power;
      var _blockPct = Math.min(it.block.power / Math.max(_skillMaxBlock, 64), 1);
      h += shieldSvg(_blockPct, it.block.power, 48);
      if (it.block.parryBonus) {
        var _pb = it.block.parryBonus;
        var _pbColor = _pb >= 2 ? '#4c8' : '#ca0';
        h += '<div style="background:#1a1a2e;border:1px solid #333;border-radius:6px;padding:4px 10px;text-align:center"><div style="font-size:16px;font-weight:bold;color:' + _pbColor + '">' + _pb + 'x</div><div style="font-size:9px;color:#888;text-transform:uppercase">Parry</div></div>';
      }
      h += '</div>';
      h += '</div>';
    } else {
      h += dmgBarSvg(combatTotal, it, catMax, true);
    }
    // Legend
    var _dScale = it.damageScale || {};
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">';
    var _dtOrder = ['slash','pierce','blunt','fire','frost','lightning','poison','spirit'];
    for (var _di = 0; _di < _dtOrder.length; _di++) {
      var _dt = _dtOrder[_di];
      var _sc = _dScale[_dt] || 1;
      var _dv = (it.damages[_dt] || 0) * _sc;
      var _dp = ((it.damagesPerLevel && it.damagesPerLevel[_dt]) || 0) * _sc;
      if (!_dv && !_dp) continue;
      var _col = DMG_COLORS[_dt] || '#888';
      var _label = _dt;
      if (_dScale.note && _sc !== 1) _label = _dScale.note;
      h += '<div style="display:flex;align-items:center;gap:4px">';
      h += '<div style="width:10px;height:10px;background:' + _col + ';border-radius:1px;flex-shrink:0"></div>';
      h += '<span style="font-size:12px;color:#ccc;text-transform:capitalize">' + _label + '</span>';
      h += '<span style="font-size:12px;font-weight:bold;color:#fff">' + Math.round(_dv) + '</span>';
      if (_dp) h += '<span style="font-size:11px;color:#888">+' + Math.round(_dp) + '/lvl</span>';
      h += '</div>';
    }
    h += '</div>';
  }
  if (isShield && it.block) {
    var _blockMax = (pageMaxStats && pageMaxStats.maxBlock) || it.block.power;
    h += '<div class="detail-section">Block</div>';
    h += blockBarSvg(it.block.power, it.block, it.maxQuality, true, _blockMax);
    // Shield stats cards
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">';
    if (it.shieldStyle) {
      h += '<div style="background:#1a1a2e;border:1px solid #333;border-radius:6px;padding:6px 12px;text-align:center"><div style="font-size:14px;font-weight:bold;color:#cda">' + it.shieldStyle + '</div><div style="font-size:10px;color:#888;text-transform:uppercase">Style</div></div>';
    }
    var parryVal = it.block.parryBonus || 0;
    var parryColor = parryVal >= 2 ? '#4c8' : parryVal > 0 ? '#ca0' : '#666';
    h += '<div style="background:#1a1a2e;border:1px solid #333;border-radius:6px;padding:6px 12px;text-align:center"><div style="font-size:18px;font-weight:bold;color:' + parryColor + '">' + (parryVal ? parryVal + 'x' : 'None') + '</div><div style="font-size:10px;color:#888;text-transform:uppercase">Parry Bonus</div></div>';
    if (it.block.force) {
      h += '<div style="background:#1a1a2e;border:1px solid #333;border-radius:6px;padding:6px 12px;text-align:center"><div style="font-size:18px;font-weight:bold;color:#8ac">' + it.block.force + '</div><div style="font-size:10px;color:#888;text-transform:uppercase">Parry Force</div></div>';
    }
    var moveMod = it.modifiers && it.modifiers.movement;
    if (moveMod) {
      h += '<div style="background:#1a1a2e;border:1px solid #333;border-radius:6px;padding:6px 12px;text-align:center"><div style="font-size:18px;font-weight:bold;color:#c66">' + Math.round(moveMod * 100) + '%</div><div style="font-size:10px;color:#888;text-transform:uppercase">Speed</div></div>';
    }
    h += '</div>';
  }
  if (!skipCombat && it.block && it.block.power) {
    stats.push(['Block', it.block.power]);
    if (it.block.parryBonus) stats.push(['Parry', it.block.parryBonus + 'x']);
  }
  if (!skipCombat && it.knockback) stats.push(['Knockback', it.knockback]);
  if (!skipCombat && it.backstab && it.backstab !== 1) stats.push(['Backstab', it.backstab + 'x']);
  if (it.armor && it.armor.base) {
    var _armorMax = (pageMaxStats && pageMaxStats.maxArmor) || (it.armor.base + (it.armor.perLevel || 0) * ((it.maxQuality || 1) - 1));
    h += '<div class="detail-section">Armor</div>';
    var _detMv = it.modifiers && it.modifiers.movement;
    var _detMvPct = _detMv ? Math.round(_detMv * 100) : 0;
    var _detMvColor = _detMvPct > 0 ? '#6c6' : '#c66';
    var _detMvOpacity = _detMv ? '' : 'opacity:0.05;';
    h += '<div style="display:flex;align-items:center;justify-content:space-between">';
    h += armorBarSvg(1, it.armor.base, it.armor, it.maxQuality, true, _armorMax);
    h += '<div style="background:#1a1a2e;border:1px solid #333;border-radius:6px;padding:6px 12px;text-align:center;flex-shrink:0;' + _detMvOpacity + '"><div style="font-size:18px;font-weight:bold;color:' + _detMvColor + '">' + (_detMvPct > 0 ? '+' : '') + _detMvPct + '%</div><div style="font-size:10px;color:#888;text-transform:uppercase">Speed</div></div>';
    h += '</div>';
  }
  if (it.durability) {
    stats.push(['Durability', it.durability.max + (it.durability.perLevel ? ' +' + it.durability.perLevel + '/lvl' : '')]);
  }
  if (it.set) stats.push(['Set', it.set.name + ' (' + it.set.size + 'pc)']);
  // Trinket adrenaline effect
  var trinket = it.trinket;
  var trinketFx = it.trinketEffect;
  if (trinket) {
    h += '<div class="detail-section">Adrenaline Effect</div>';
    h += '<div style="display:flex;gap:12px;flex-wrap:wrap">';
    h += '<div style="background:#1a1a2e;border:1px solid #333;border-radius:6px;padding:6px 12px;text-align:center"><div style="font-size:20px;font-weight:bold;color:#f80">' + adrenalineSvg(18) + ' ' + trinket.maxAdrenaline + '</div><div style="font-size:10px;color:#888;text-transform:uppercase">Adrenaline</div></div>';
    if (trinketFx) {
      if (trinketFx.name) {
        h += '<div style="background:#1a1a2e;border:1px solid #333;border-radius:6px;padding:6px 12px;text-align:center"><div style="font-size:14px;font-weight:bold;color:#8ac">' + esc(trinketFx.name) + '</div><div style="font-size:10px;color:#888;text-transform:uppercase">Effect</div></div>';
      }
      if (trinketFx.duration > 1) {
        h += '<div style="background:#1a1a2e;border:1px solid #333;border-radius:6px;padding:6px 12px;text-align:center"><div style="font-size:20px;font-weight:bold;color:#aaa">' + trinketFx.duration + 's</div><div style="font-size:10px;color:#888;text-transform:uppercase">Duration</div></div>';
      }
    }
    h += '</div>';
    if (trinketFx) {
      var lines = [];
      if (trinketFx.healthRegenMultiplier) lines.push('Health regen +' + Math.round((trinketFx.healthRegenMultiplier - 1) * 100) + '%');
      if (trinketFx.staminaRegenMultiplier) lines.push('Stamina regen +' + Math.round((trinketFx.staminaRegenMultiplier - 1) * 100) + '%');
      if (trinketFx.eitrRegenMultiplier) lines.push('Eitr regen +' + Math.round((trinketFx.eitrRegenMultiplier - 1) * 100) + '%');
      if (trinketFx.healthUpFront) lines.push('Restore ' + trinketFx.healthUpFront + ' health');
      if (trinketFx.staminaUpFront) lines.push('Restore ' + trinketFx.staminaUpFront + ' stamina');
      if (trinketFx.eitrUpFront) lines.push('Restore ' + trinketFx.eitrUpFront + ' eitr');
      if (trinketFx.addArmor) lines.push('+' + trinketFx.addArmor + ' armor');
      if (trinketFx.speedModifier) lines.push('Speed +' + Math.round(trinketFx.speedModifier * 100) + '%');
      if (trinketFx.swimSpeedModifier) lines.push('Swim speed +' + Math.round(trinketFx.swimSpeedModifier * 100) + '%');
      if (trinketFx.swimStaminaModifier) lines.push('Swim stamina ' + Math.round(trinketFx.swimStaminaModifier * 100) + '%');
      if (trinketFx.blockStaminaModifier) lines.push('Block stamina ' + Math.round(trinketFx.blockStaminaModifier * 100) + '%');
      if (trinketFx.timedBlockBonus) lines.push('Parry bonus +' + trinketFx.timedBlockBonus);
      if (trinketFx.damageBonus) {
        for (var dt in trinketFx.damageBonus) lines.push(dt + ' damage +' + Math.round(trinketFx.damageBonus[dt] * 100) + '%');
      }
      if (trinketFx.skillBonus) {
        trinketFx.skillBonus.forEach(function(sb) { lines.push(sb.skill + ' +' + sb.bonus); });
      }
      if (trinketFx.resistances) {
        trinketFx.resistances.forEach(function(r) { lines.push(r.type + ': ' + r.modifier); });
      }
      if (lines.length) {
        h += '<div style="color:#ccc;font-size:12px;margin-top:6px">' + lines.join(' · ') + '</div>';
      }
      if (trinketFx.tooltip) {
        h += '<div style="color:#888;font-size:12px;margin-top:4px;font-style:italic">' + esc(trinketFx.tooltip) + '</div>';
      }
    }
  }
  // Recipe — one row per quality level
  if (it.recipe) {
    var _recipeLabel = 'Recipe';
    if (it.recipe.station) { var _rs = craftItemsByCode[it.recipe.station]; _recipeLabel = _rs ? _rs.name : it.recipe.station; }
    h += '<div class="detail-section">' + esc(_recipeLabel) + '</div>';
    h += renderRecipeByQuality(it);
  }
  h += '<div class="detail-item-md" data-code="' + esc(code) + '"></div>';
  if (stats.length) {
    h += '<div class="detail-section">Properties</div>';
    stats.forEach(function(s) {
      h += '<div class="detail-stat-row"><span class="label">' + s[0] + '</span><span class="val">' + s[1] + '</span></div>';
    });
  }
  if (!skipCombat && it.primaryAttack) {
    h += '<div class="detail-section">Primary Attack</div>';
    var pa = it.primaryAttack;
    if (pa.stamina) h += '<div class="detail-stat-row"><span class="label">Stamina</span><span class="val">' + pa.stamina + '</span></div>';
    if (pa.eitr) h += '<div class="detail-stat-row"><span class="label">Eitr</span><span class="val">' + pa.eitr + '</span></div>';
    if (pa.range) h += '<div class="detail-stat-row"><span class="label">Range</span><span class="val">' + pa.range + '</span></div>';
  }
  if (it.statusEffect) {
    h += renderStatusEffectSection(it.statusEffect);
  }
  // Badge accent gradient matching list item bg — applied to parent so it covers padding
  var gradientEl = detail.parentElement || detail;
  var _isFav = craftFavorites[code], _isSpd = craftSpeedrun[code];
  if (_isFav && _isSpd) {
    gradientEl.style.background = 'linear-gradient(135deg, rgba(60,200,80,0.25), transparent 100px)';
  } else if (_isFav) {
    gradientEl.style.background = 'linear-gradient(135deg, rgba(200,160,0,0.25), transparent 100px)';
  } else if (_isSpd) {
    gradientEl.style.background = 'linear-gradient(135deg, rgba(60,140,255,0.25), transparent 100px)';
  } else {
    gradientEl.style.background = '';
  }
  detail.innerHTML = h;
}

// ── Exposed exports ────────────────────────────────────────────────
export function computeMaxStatsExt(items: any[]) {
  return computeMaxStatsImpl(items);
}

function computeMaxStatsImpl(items: any[]) {
  let maxHp = 0, maxSta = 0, maxEitr = 0, maxRegen = 0, maxArmor = 0, maxBlock = 0;
  const skillMaxDmg: any = {}, skillMaxBlock: any = {}, skillMaxArmor: any = {};
  items.forEach(function(it: any) {
    if (it.food) {
      if (it.food.health > maxHp) maxHp = it.food.health;
      if (it.food.stamina > maxSta) maxSta = it.food.stamina;
      if ((it.food.eitr||0) > maxEitr) maxEitr = it.food.eitr;
      if ((it.food.regen||0) > maxRegen) maxRegen = it.food.regen;
    }
    if (it.armor && it.armor.base) {
      const full = it.armor.base + (it.armor.perLevel||0) * ((it.maxQuality||1) - 1);
      if (full > maxArmor) maxArmor = full;
      const sub = it.subcategory || '';
      if (!skillMaxArmor[sub] || full > skillMaxArmor[sub]) skillMaxArmor[sub] = full;
    }
    if (it.block && it.block.power) {
      if (it.block.power > maxBlock) maxBlock = it.block.power;
      const sub2 = it.subcategory || '';
      if (!skillMaxBlock[sub2] || it.block.power > skillMaxBlock[sub2]) skillMaxBlock[sub2] = it.block.power;
    }
    if (it.damages) {
      const d = combatDamage(it.damages);
      let dpl = 0;
      if (it.damagesPerLevel) { const dk = Object.keys(it.damagesPerLevel); for (let i=0;i<dk.length;i++) if (!NON_COMBAT_DMG[dk[i]]) dpl += it.damagesPerLevel[dk[i]]; }
      const dMax = d + dpl * ((it.maxQuality||1) - 1);
      const sub3 = it.subcategory || '';
      if (!skillMaxDmg[sub3] || dMax > skillMaxDmg[sub3]) skillMaxDmg[sub3] = dMax;
    }
  });
  return { maxHp, maxSta, maxEitr, maxRegen, maxArmor, maxBlock, skillMaxDmg, skillMaxBlock, skillMaxArmor };
}

export type VhPageKey = 'craft' | 'armor' | 'food' | 'bestiary' | 'comfort';

// ── Markdown macro rendering (ported from vhcli/wwwroot/index.html lines 2685-2906) ──
function mdFindItem(name: string) {
  if (!craftItemsByCode) return null;
  if (craftItemsByCode[name]) return craftItemsByCode[name];
  var lc = name.toLowerCase();
  var keys = Object.keys(craftItemsByCode);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === lc) return craftItemsByCode[keys[i]];
  }
  for (var j = 0; j < keys.length; j++) {
    var it = craftItemsByCode[keys[j]];
    if ((it.name || '').toLowerCase() === lc) return it;
  }
  for (var k = 0; k < keys.length; k++) {
    var it2 = craftItemsByCode[keys[k]];
    if ((it2.name || '').toLowerCase().indexOf(lc) !== -1) return it2;
  }
  return null;
}

function mdItemChip(name: string, kind: string, value: string) {
  var it = mdFindItem(name);
  var displayName = it ? (it.name || it.code) : name;
  var code = it ? it.code : name;
  var hasIcon = it && it.hasIcon;
  var iconHtml = hasIcon ? '<img src="/api/icon/' + encodeURIComponent(code) + '.png" style="width:16px;height:16px;image-rendering:pixelated;vertical-align:middle">' : '';

  if (kind === 'icon2x') {
    var bigIcon = hasIcon ? '<img src="/api/icon/' + encodeURIComponent(code) + '.png" style="width:32px;height:32px;image-rendering:pixelated;vertical-align:middle">' : '';
    return '<span class="md-item" title="' + esc(displayName) + '" style="display:inline-flex;align-items:center;vertical-align:middle">' + bigIcon + '</span>';
  }
  if (kind === 'icon') {
    return '<span class="md-item" title="' + esc(displayName) + '" style="display:inline-flex;align-items:center;vertical-align:middle">' + iconHtml + '</span>';
  }
  if (kind === 'link') {
    var linkLabel = value || displayName;
    if (!it) {
      return '<span class="md-item-link" title="' + esc(name) + '" style="display:inline-flex;align-items:center;gap:3px;vertical-align:middle;color:#88bbff;text-decoration:underline">'
        + '<span>' + esc(linkLabel) + '</span></span>';
    }
    // Build a real /guides/<page>/<subcat>/<code> path so the link works in
    // any markdown context (item details, tips pages, changelog) — fallback
    // to native href navigation if no SPA nav helper is registered.
    // Item.page in items.json doesn't always equal the URL pageSlug — armor
    // items live under /guides/gear/, bestiary under /guides/enemies/, etc.
    var pageMap: any = { weapons: 'weapons', armor: 'gear', food: 'food', comfort: 'comfort', bestiary: 'enemies' };
    var pageSlug = pageMap[it.page] || it.page || 'weapons';
    var subcatSlug = it.subcategory ? it.subcategory.toLowerCase().replace(/\s+/g, '-') : '';
    var path = '/guides/' + pageSlug + (subcatSlug ? '/' + subcatSlug : '') + '/' + code;
    var escPath = path.replace(/'/g, "\\'");
    // Prefer SPA navigation when available; otherwise let the browser follow the href.
    var click = ' onclick="if(window.__vhNavigate){event.preventDefault();window.__vhNavigate(\'' + escPath + '\');}"';
    return '<a href="' + path + '" class="md-item-link" title="' + esc(displayName) + '"' + click
      + ' style="display:inline-flex;align-items:center;gap:3px;vertical-align:middle;color:#88bbff;text-decoration:underline;cursor:pointer">'
      + iconHtml + '<span>' + esc(linkLabel) + '</span></a>';
  }

  var qty = '';
  if (kind === 'level') {
    qty = '<span style="position:relative;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;vertical-align:middle;margin-left:1px">'
        + '<svg viewBox="0 0 24 24" style="width:16px;height:16px;position:absolute"><path fill="#b87333" stroke="#da5" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m8.587 8.236l2.598-5.232a.911.911 0 0 1 1.63 0l2.598 5.232l5.808.844a.902.902 0 0 1 .503 1.542l-4.202 4.07l.992 5.75c.127.738-.653 1.3-1.32.952L12 18.678l-5.195 2.716c-.666.349-1.446-.214-1.319-.953l.992-5.75l-4.202-4.07a.902.902 0 0 1 .503-1.54z"/></svg>'
        + '<span style="position:relative;font-size:9px;font-weight:bold;color:#ffe066;text-shadow:0 1px 1px #000">' + esc(value) + '</span></span>';
  } else if (kind === 'amount' && value !== '1') {
    qty = '<span style="font-size:11px;font-weight:bold;color:#fff;margin-left:1px">×' + esc(value) + '</span>';
  }

  var onclick = it ? ' onclick="event.preventDefault();window.__vhItemClick&&window.__vhItemClick(\'' + code.replace(/'/g, "\\'") + '\')"' : '';

  return '<span class="md-item" title="' + esc(displayName) + '"' + onclick
    + ' style="display:inline-flex;align-items:center;gap:2px;background:#1a1a2e;border:1px solid #333;border-radius:4px;padding:1px 5px 1px 3px;vertical-align:middle;font-size:12px;color:#cda;' + (it ? 'cursor:pointer' : '') + '">'
    + iconHtml
    + '<span>' + esc(displayName) + '</span>'
    + qty + '</span>';
}

function mdRecipeBlock(name: string) {
  var it = mdFindItem(name);
  if (!it || !it.recipe) return '<span style="color:#666;font-size:12px">[recipe: ' + esc(name) + ' not found]</span>';
  return renderRecipeCards(it);
}

// ── Forsaken powers ────────────────────────────────────────────────
// Hang a boss trophy on its stone at the Sacrificial Stones to unlock the
// power. Not in items.json (trophies carry no power data), so the text lives
// here — keep it in sync with the boss table in docs/articles_overview.md.
var BOSS_POWERS: any = {
  TrophyEikthyr:     { name: 'Eikthyr',   desc: '60% less Stamina drain from running, jumping, and swimming.' },
  TrophyTheElder:    { name: 'The Elder', desc: '+60% chopping and mining damage, and +30% Health regeneration.' },
  TrophyBonemass:    { name: 'Bonemass',  desc: '25% resistance to Pierce, Slash, and Blunt; blocking costs no Stamina and returns +5 Stamina per block.' },
  TrophyDragonQueen: { name: 'Moder',     desc: 'Permanent tailwind, +300 carry weight, +10% movement speed, and 50% Frost resistance.' },
  TrophyGoblinKing:  { name: 'Yagluth',   desc: '50% Lightning resistance, +25 Farming skill, and +10% damage.' },
  TrophySeekerQueen: { name: 'The Queen', desc: '+100% Eitr regeneration, sneaking costs no Stamina, and 50% Poison resistance.' },
  TrophyFader:       { name: 'Fader',     desc: '+100% Adrenaline generation, 50% reduced stagger, and 50% Fire resistance.' },
};

/// Accepts either the trophy code (`TrophyEikthyr`) or the boss name (`Eikthyr`).
function mdFindPower(key: string) {
  var k = (key || '').trim(), lower = k.toLowerCase();
  if (BOSS_POWERS[k]) return { code: k, p: BOSS_POWERS[k] };
  for (var code in BOSS_POWERS) {
    if (code.toLowerCase() === lower || BOSS_POWERS[code].name.toLowerCase() === lower)
      return { code: code, p: BOSS_POWERS[code] };
  }
  return null;
}

// Inline elements only — the macro lands inside a <p>, so a <div> would be
// invalid there. `.vh-power` in GuidesLayout.css makes the spans lay out.
function mdPowerBlock(key: string) {
  var hit = mdFindPower(key);
  if (!hit) return '<span style="color:#666;font-size:12px">[power: ' + esc(key) + ' not found]</span>';
  return '<span class="vh-power">'
    + '<img class="vh-power-icon" src="/api/icon/' + encodeURIComponent(hit.code) + '.png" alt="" onerror="this.style.display=\'none\'">'
    + '<span class="vh-power-body">'
    + '<span class="vh-power-name">' + esc(hit.p.name) + '</span>'
    + '<span class="vh-power-desc">' + mdInline(hit.p.desc) + '</span>'
    + '<span class="vh-power-meta">Activate with <code>F</code> &middot; 5 minutes per use</span>'
    + '</span></span>';
}

// ── Biome cheat sheet ──────────────────────────────────────────────
// `{sheet:<biome>}` on a line of its own renders the compact per-biome card:
// the equipped-armour shot on the left, then food / weapon / mead / comfort /
// boss facts and the workstation strip. The *picks* live in biomeSheets.ts;
// every number here (armour totals, food stats, station levels) is derived
// from items.json and the station tables, so the card can't drift from the
// game data.
//
// Two ways a thing can be dimmed, and they mean different things:
//   `off`     — real but not reachable yet in this biome (grey, still legible)
//   `sp-fog`  — past the reader's spoiler level (blurred, unreadable). The
//               `sp-b<index>` class next to it is what CSS unblurs later.

function sheetFog(idx) {
  return (idx == null || idx < 0) ? '' : ' sp-fog sp-b' + idx;
}

function sheetIcon(code, size, cls) {
  return '<img class="' + (cls || '') + '" src="/api/icon/' + encodeURIComponent(code) + '.png"'
    + ' alt="" style="width:' + size + 'px;height:' + size + 'px"'
    + ' onerror="this.style.visibility=\'hidden\'">';
}

/** Item icon + name, tagged with its own biome so late items blur themselves. */
function sheetChip(code, label, size) {
  var it = craftItemsByCode[code];
  var name = label || (it ? (it.name || code) : code);
  var click = it ? ' onclick="window.__vhItemClick&&window.__vhItemClick(\'' + String(code).replace(/'/g, "\\'") + '\')"' : '';
  return '<span class="vh-sheet-chip' + sheetFog(itemBiomeIndex(code)) + '" title="' + esc(name) + '"' + click + '>'
    + sheetIcon(code, size || 18, 'vh-sheet-chip-icon')
    + '<span class="vh-sheet-chip-name">' + esc(name) + '</span></span>';
}

/** One icon per unit, so a count reads at a glance without a ×N to parse.
 *  Past five they shingle by a quarter of their width to stay on one line. */
function sheetIconRun(code, n, size) {
  var it = craftItemsByCode[code] || {};
  var px = size || 20;
  var overlap = n > 5;
  var h = '<span class="vh-sheet-run' + (overlap ? ' overlap' : '') + sheetFog(itemBiomeIndex(code)) + '"'
    + (overlap ? ' style="--ov:' + -Math.round(px * 0.25) + 'px"' : '')
    + ' title="' + esc((it.name || code) + (n > 1 ? ' ×' + n : '')) + '"'
    + ' onclick="window.__vhItemClick&&window.__vhItemClick(\'' + String(code).replace(/'/g, "\\'") + '\')">';
  for (var i = 0; i < n; i++) h += sheetIcon(code, px, '');
  return h + '</span>';
}

/** Offer → fight → loot, the one line that says what a biome is *for*. */
function sheetBossChain(boss) {
  var arrow = '<span class="vh-sheet-arrow" aria-hidden="true">→</span>';
  var h = '<span class="vh-sheet-boss">';
  if (boss.prestep) {
    h += sheetIconRun(boss.prestep[0], boss.prestep[1], 20);
    h += arrow;
  }
  h += sheetIconRun(boss.offering[0], boss.offering[1], 20);
  h += arrow;
  h += '<span class="vh-sheet-bossname">' + sheetIcon(boss.trophy, 22, '')
    + '<span>' + esc(boss.name) + '</span></span>';
  if (boss.drops.length) {
    h += arrow;
    boss.drops.forEach(function (d) { h += sheetIconRun(d[0], d[1], 20); });
  }
  return h + '</span>';
}

function sheetStar(q) {
  return '<span class="vh-sheet-star" title="quality ' + q + '">'
    + '<svg viewBox="0 0 24 24"><path fill="#b87333" stroke="#da5" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m8.587 8.236l2.598-5.232a.911.911 0 0 1 1.63 0l2.598 5.232l5.808.844a.902.902 0 0 1 .503 1.542l-4.202 4.07l.992 5.75c.127.738-.653 1.3-1.32.952L12 18.678l-5.195 2.716c-.666.349-1.446-.214-1.319-.953l.992-5.75l-4.202-4.07a.902.902 0 0 1 .503-1.54z"/></svg>'
    + '<span class="vh-sheet-star-num">' + q + '</span></span>';
}

/** Armour a piece contributes at quality q (clamped to what it can reach). */
function sheetPieceArmor(code, q) {
  var it = craftItemsByCode[code];
  if (!it || !it.armor) return 0;
  var lvl = Math.min(q, it.maxQuality || 1);
  return (it.armor.base || 0) + (it.armor.perLevel || 0) * (lvl - 1);
}

function sheetFoodTotals(codes) {
  var t = { health: 0, stamina: 0, eitr: 0 };
  codes.forEach(function (c) {
    var f = (craftItemsByCode[c] || {}).food;
    if (!f) return;
    t.health += f.health || 0;
    t.stamina += f.stamina || 0;
    t.eitr += f.eitr || 0;
  });
  return t;
}

/** No visible label — the icons say what the row is, and the ~58px the label
 *  cost is worth more to the content on a phone. It survives as the row's
 *  accessible name. */
function sheetRow(label, body, cls) {
  return '<div class="vh-sheet-row' + (cls ? ' ' + cls : '') + '" aria-label="' + esc(label) + '">'
    + '<span class="vh-sheet-val">' + body + '</span></div>';
}

/** One station: base icon, level reached / level cap, then a pip per upgrade
 *  you can actually build here. Upgrades from later biomes aren't drawn at
 *  all — the level-out-of-cap fraction is what says more is coming. */
function sheetStation(stationCode, biomeIdx) {
  var st = SHEET_STATIONS[stationCode];
  if (!st) return '';
  var lvl = stationLevelAt(stationCode, biomeIdx);
  var cap = 1 + st.upgrades.length;
  var locked = lvl === 0;
  var pips = locked ? '' : st.upgrades.filter(function (u) {
    return u.biome <= biomeIdx;
  }).map(function (u) {
    return '<span class="vh-sheet-pip" title="' + esc(u.name + ' — ' + matsText(u.mats)) + '">'
      + sheetIcon(u.code, 16, '') + '</span>';
  }).join('');
  return '<div class="vh-sheet-station' + (locked ? ' off' : '') + sheetFog(st.biome) + '">'
    + '<a class="vh-sheet-station-icon" href="/guides/stations/' + encodeURIComponent(stationCode) + '"'
    + ' title="' + esc(st.name) + ' — open the station guide"'
    + ' onclick="if(window.__vhNavigate){event.preventDefault();window.__vhNavigate(\'/guides/stations/' + stationCode + '\');}">'
    + sheetIcon(stationCode, 24, '') + '</a>'
    + '<span class="vh-sheet-station-lvl">' + lvl + '<span class="cap">/' + cap + '</span></span>'
    + '<span class="vh-sheet-pips">' + pips + '</span>'
    + '</div>';
}

// ── Station guide pages ────────────────────────────────────────────
// One page per station that things are actually crafted at: the station's own
// recipe, a recipe card per upgrade piece, and the list of everything it
// makes. Everything on the page is spoiler-gated by the item's own biome, so
// the page grows as the reader's slider moves — a Meadows player opening the
// workbench sees the two upgrades they can build and the handful of recipes
// they have, not the full 82.

function matsText(mats) {
  return (mats || []).map(function (m) {
    var it = craftItemsByCode[m[0]];
    return (it ? (it.name || m[0]) : m[0]) + ' ×' + m[1];
  }).join(', ');
}

/** Recipe cards for a [code, count][] cost, matching renderRecipeCards' look. */
function stationMatCards(mats) {
  var h = '<div class="recipe-cards">';
  (mats || []).forEach(function (m) {
    var it = craftItemsByCode[m[0]];
    var name = it ? (it.name || m[0]) : m[0];
    h += '<div class="recipe-card' + sheetFog(itemBiomeIndex(m[0])) + '">';
    h += '<div class="recipe-card-name" style="font-size:' + scaleFontSize(name, 52) + 'px">' + esc(name) + '</div>';
    h += it && it.hasIcon
      ? '<img src="/api/icon/' + encodeURIComponent(m[0]) + '.png" alt="">'
      : '<div style="width:32px;height:32px;background:#222;border-radius:4px"></div>';
    h += '<div class="recipe-card-count">' + m[1] + '</div>';
    h += '</div>';
  });
  return h + '</div>';
}

/** Compact row for one craftable: icon, name, and the station level it needs. */
function stationCraftRow(it, baseLevel) {
  var need = (it.recipe && it.recipe.stationLevel) || 1;
  var code = it.code;
  return '<a class="vh-st-craft' + itemSpoilerClass(code) + '" href="/guides/' + itemPagePath(it) + '"'
    + ' onclick="if(window.__vhNavigate){event.preventDefault();window.__vhNavigate(\'/guides/' + itemPagePath(it) + '\');}"'
    + ' title="' + esc(it.name || code) + '">'
    + (it.hasIcon ? '<img src="/api/icon/' + encodeURIComponent(code) + '.png" alt="">' : '<span class="vh-st-noicon"></span>')
    + '<span class="vh-st-craft-name">' + esc(it.name || code) + '</span>'
    + (need > baseLevel ? '<span class="vh-st-craft-lvl" title="Needs station level ' + need + '">' + need + '</span>' : '')
    + spoilerVeil(code)
    + '</a>';
}

/** Same /guides/<page>/<subcat>/<code> path mdItemChip builds for links. */
function itemPagePath(it) {
  var pageMap = { weapons: 'weapons', armor: 'gear', food: 'food', comfort: 'comfort', bestiary: 'enemies' };
  var pageSlug = pageMap[it.page] || it.page || 'weapons';
  var subcatSlug = it.subcategory ? it.subcategory.toLowerCase().replace(/\s+/g, '-') : '';
  return pageSlug + (subcatSlug ? '/' + subcatSlug : '') + '/' + it.code;
}

export function renderStationPage(code: string): string {
  var page = stationPage(code);
  var st = craftItemsByCode[code];
  if (!page || !st) return '<div class="vh-sheet-missing">[station: ' + esc(code) + ' not found]</div>';
  var def = SHEET_STATIONS[code];

  var h = '<div class="vh-station">';

  // Header: what it is, and where it becomes buildable.
  h += '<div class="vh-station-head">';
  h += '<img class="vh-station-icon" src="/api/icon/' + encodeURIComponent(code) + '.png" alt="">';
  h += '<div><h2 class="vh-station-title">' + esc(st.name || code) + '</h2>';
  h += '<div class="vh-station-biome">Unlocks in ' + esc(biomeLabel(page.biome)) + '</div></div>';
  h += '</div>';
  h += '<p class="vh-station-blurb">' + mdInline(page.blurb) + '</p>';
  if (st.description) {
    h += '<p class="vh-station-desc">' + esc(String(st.description).replace(/<color[^>]*>/g, '').replace(/<\/color>/g, '')) + '</p>';
  }

  // Build cost for the station itself.
  h += '<h3>Build cost</h3>';
  h += st.recipe ? renderRecipeCards(st) : '<p class="vh-station-none">Found in the world rather than built.</p>';

  // Upgrades, each with its own cost. Later ones stay listed but blur.
  if (def && def.upgrades.length) {
    h += '<h3>Upgrades <span class="vh-station-sub">level 1 &rarr; ' + (1 + def.upgrades.length) + '</span></h3>';
    h += '<p class="vh-station-note">Each piece placed near the station raises its level by one, unlocking the recipes below that need it.</p>';
    def.upgrades.forEach(function (u, i) {
      h += '<div class="vh-station-up' + sheetFog(u.biome) + '">';
      h += '<div class="vh-station-up-head">';
      // Not every upgrade piece has an extracted icon yet — hide rather than
      // leave a broken image where one is missing.
      h += '<img src="/api/icon/' + encodeURIComponent(u.code) + '.png" alt=""'
        + ' onerror="this.style.display=\'none\'">';
      h += '<span class="vh-station-up-name">' + esc(u.name) + '</span>';
      h += '<span class="vh-station-up-lvl">level ' + (i + 2) + '</span>';
      h += '</div>';
      h += stationMatCards(u.mats);
      h += '</div>';
    });
  }

  // Everything it makes, grouped by the level you need.
  var craftables = (allItems || []).filter(function (it) {
    return it.recipe && it.recipe.station === code && !it.hidden;
  });
  h += '<h3>Crafted here <span class="vh-station-sub">' + craftables.length + ' item' + (craftables.length === 1 ? '' : 's') + '</span></h3>';
  var levels = {};
  craftables.forEach(function (it) {
    var lv = (it.recipe.stationLevel || 1);
    (levels[lv] = levels[lv] || []).push(it);
  });
  Object.keys(levels).map(Number).sort(function (a, b) { return a - b; }).forEach(function (lv) {
    var group = levels[lv].sort(function (a, b) {
      return (itemBiomeIndex(a.code) ?? 0) - (itemBiomeIndex(b.code) ?? 0)
        || String(a.name || a.code).localeCompare(String(b.name || b.code));
    });
    h += '<div class="vh-st-level">Needs level ' + lv + '</div>';
    h += '<div class="vh-st-crafts">';
    group.forEach(function (it) { h += stationCraftRow(it, lv); });
    h += '</div>';
  });

  return h + '</div>';
}

/** Comfort drawn as a station: shelter is the base piece, each furniture
 *  category an upgrade slot showing the best piece unlocked so far — the bed
 *  pip becomes the Dragon Bed in the Mountain, the table pip becomes the Round
 *  Table in the Plains. Categories you can't furnish yet aren't drawn. */
function sheetComfortStation(biomeIdx) {
  var lvl = comfortAt(biomeIdx);
  var pips = COMFORT_SLOTS.map(function (slot) {
    var pick = comfortPick(slot, biomeIdx);
    if (!pick) return '';
    var it = craftItemsByCode[pick.code] || {};
    return '<span class="vh-sheet-pip"'
      + ' title="' + esc(slot.group + ' — ' + (it.name || pick.code) + ' +' + pick.comfort) + '">'
      + sheetIcon(pick.code, 16, '') + '</span>';
  }).join('');
  return '<div class="vh-sheet-station">'
    + '<span class="vh-sheet-station-icon" title="Sheltered, by a lit fire — +' + COMFORT_BASE + ' before any furniture">'
    + '<img src="/data/vh/rested.png" alt="" style="width:24px;height:24px;image-rendering:pixelated">'
    + '</span>'
    + '<span class="vh-sheet-station-lvl">' + lvl + '<span class="cap">/' + COMFORT_CAP + '</span></span>'
    + '<span class="vh-sheet-pips">' + pips + '</span>'
    + '<span class="vh-sheet-rested">' + restedMinutes(lvl) + ' min rested</span>'
    + '</div>';
}

// ── Build switching ────────────────────────────────────────────────
// Each card carries every build's panes and shows one, picked by `data-build`
// on the card root. The choice is a reader preference, not per-card state, so
// clicking a tab restacks every sheet on the page and is remembered — cycling
// biomes keeps you on the build you actually play.
var SHEET_BUILD_KEY = 'vh-sheet-build';

function sheetStoredBuild() {
  try { return localStorage.getItem(SHEET_BUILD_KEY) || ''; } catch (e) { return ''; }
}

/** The stored preference if this sheet offers it, else its first build. */
function sheetBuildFor(keys) {
  var want = sheetStoredBuild();
  return keys.indexOf(want) >= 0 ? want : keys[0];
}

window.__vhSheetBuild = function (btn) {
  var want = btn.getAttribute('data-b');
  try { localStorage.setItem(SHEET_BUILD_KEY, want); } catch (e) { /* private mode */ }
  var cards = document.querySelectorAll('.vh-sheet');
  for (var i = 0; i < cards.length; i++) {
    var card = cards[i];
    // A biome without that build (no magic before the Mistlands) keeps its own.
    var have = (card.getAttribute('data-builds') || '').split(',');
    var use = have.indexOf(want) >= 0 ? want : have[0];
    card.setAttribute('data-build', use);
    var tabs = card.querySelectorAll('.vh-sheet-tab');
    for (var j = 0; j < tabs.length; j++) {
      var on = tabs[j].getAttribute('data-b') === use;
      tabs[j].className = 'vh-sheet-tab' + (on ? ' active' : '');
      tabs[j].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }
};

/** Armour hero for one build — the equipped shot, then the numbers under it. */
function sheetArmorPane(a, buildKey) {
  var armorTotal = a.pieces.reduce(function (sum, c) { return sum + sheetPieceArmor(c, a.quality); }, 0)
    + (a.cape ? sheetPieceArmor(a.cape, a.quality) : 0);
  var h = '<div class="vh-sheet-armor" data-build="' + buildKey + '">';
  h += '<div class="vh-sheet-armor-art">';
  h += '<img src="' + esc(a.img || '/img/guide/placeholder.svg') + '"'
    + ' onerror="this.onerror=null;this.src=\'/img/guide/placeholder.svg\'"'
    + ' alt="' + esc(a.shot || (a.label + ' armour set, equipped')) + '">';
  h += '<span class="vh-sheet-armor-pieces">';
  a.pieces.forEach(function (c) { h += sheetIcon(c, 16, ''); });
  if (a.cape) h += sheetIcon(a.cape, 16, '');
  h += '</span></div>';
  h += '<div class="vh-sheet-armor-name">' + esc(a.label) + sheetStar(a.quality) + '</div>';
  h += '<div class="vh-sheet-armor-stat"><b>' + Math.round(armorTotal) + '</b> armor</div>';
  if (a.note) h += '<div class="vh-sheet-armor-note">' + mdInline(a.note) + '</div>';
  return h + '</div>';
}

/** The rows that change with the build: food and weapon. */
function sheetBuildFacts(build, buildKey) {
  var h = '<div class="vh-sheet-buildfacts" data-build="' + buildKey + '">';
  var ft = sheetFoodTotals(build.foods);
  var foodBody = '<span class="vh-sheet-icons">'
    + build.foods.map(function (c) {
        var it = craftItemsByCode[c] || {};
        return '<span class="vh-sheet-food' + sheetFog(itemBiomeIndex(c)) + '" title="' + esc(it.name || c) + '"'
          + ' onclick="window.__vhItemClick&&window.__vhItemClick(\'' + String(c).replace(/'/g, "\\'") + '\')">'
          + sheetIcon(c, 26, '') + '</span>';
      }).join('')
    + '</span>'
    + '<span class="vh-sheet-nums">'
    + '<b style="color:#c66">' + Math.round(ft.health) + '</b>'
    + '<span class="sep">/</span><b style="color:#cc6">' + Math.round(ft.stamina) + '</b>'
    + (ft.eitr ? '<span class="sep">/</span><b style="color:#6ac">' + Math.round(ft.eitr) + '</b>' : '')
    + '</span>';
  h += sheetRow('Food', foodBody, 'is-food');
  if (build.foodNote) h += '<div class="vh-sheet-note">' + mdInline(build.foodNote) + '</div>';
  // Off-hand sits in the weapon row rather than its own: the pair is one
  // decision, and the row wraps on a phone instead of costing a line.
  var hands = sheetChip(build.weapon.code, null, 20) + sheetStar(build.weapon.quality);
  if (build.offhand) {
    hands += sheetChip(build.offhand.code, null, 20) + sheetStar(build.offhand.quality);
  }
  h += sheetRow('Weapon', hands);
  if (build.weapon.note) h += '<div class="vh-sheet-note">' + mdInline(build.weapon.note) + '</div>';
  return h + '</div>';
}

// Sheets are hidden site-wide for now — too many of the picks in
// biomeSheets.ts are still wrong to show readers. The `{sheet:<biome>}` lines
// stay in the biome docs and the cycler stays in the tree; flip this back to
// false (and uncomment the cycler in ArticlesPage.tsx) once they are checked.
var SHEETS_HIDDEN = true;

/** Strip each `## <heading>` whose only content is a (now hidden) sheet macro.
 *  Temporary, and paired with SHEETS_HIDDEN — delete both together. */
function dropEmptiedSheetHeadings(lines) {
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    if (/^#{2,3} /.test(lines[i].trim())) {
      // Look past blanks for what this heading actually introduces.
      var j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      var k = j + 1;
      while (k < lines.length && lines[k].trim() === '') k++;
      // Heading → sheet macro → next heading (or EOF) means the section is
      // now empty; skip the heading and the macro, keep everything after.
      if (j < lines.length && /^\{sheet:[^}]+\}$/i.test(lines[j].trim())
          && (k >= lines.length || /^#{1,3} /.test(lines[k].trim()))) {
        i = j;
        continue;
      }
    }
    out.push(lines[i]);
  }
  return out;
}

function renderBiomeSheetHtml(name) {
  if (SHEETS_HIDDEN) return '';
  var hit = sheetFor(name);
  if (!hit) return '<div class="vh-sheet-missing">[sheet: ' + esc(name) + ' not found]</div>';
  var s = hit.sheet, bi = hit.index;
  var art = (SPOILER_BIOMES[bi] || {}).icon;
  var keys = buildKeysFor(s);
  var active = sheetBuildFor(keys);

  // ── Header: biome, build tabs, then the boss you leave behind ──
  var h = '<div class="vh-sheet" data-biome="' + esc(s.key) + '"'
    + ' data-builds="' + keys.join(',') + '" data-build="' + active + '">';
  h += '<div class="vh-sheet-head">';
  if (art) h += '<img class="vh-sheet-biome" src="/data/vh/Biome' + art + '.png" alt="">';
  h += '<span class="vh-sheet-title">' + esc(s.label) + '</span>';
  h += '<span class="vh-sheet-tabs" role="group" aria-label="Build">';
  keys.forEach(function (k) {
    h += '<button type="button" class="vh-sheet-tab' + (k === active ? ' active' : '') + '"'
      + ' data-b="' + k + '" aria-pressed="' + (k === active ? 'true' : 'false') + '"'
      + ' onclick="window.__vhSheetBuild(this)">' + esc(BUILD_LABELS[k]) + '</button>';
  });
  h += '</span>';
  if (s.boss) h += sheetBossChain(s.boss);
  h += '</div>';

  // ── Armour hero, one pane per build ──
  keys.forEach(function (k) { h += sheetArmorPane(s.builds[k].armor, k); });

  // ── Facts: build-specific rows, then the meads, which every build drinks ──
  h += '<div class="vh-sheet-facts">';
  keys.forEach(function (k) { h += sheetBuildFacts(s.builds[k], k); });

  var meadBody = s.meads.length
    ? s.meads.map(function (c) { return sheetChip(c, null, 18); }).join('')
    : '<span class="vh-sheet-none">no meads yet</span>';
  h += sheetRow('Mead', meadBody);
  if (s.meadNote) h += '<div class="vh-sheet-note">' + mdInline(s.meadNote) + '</div>';

  // One trinket slot, and gear.md picks per biome rather than per build.
  if (s.trinket) {
    h += sheetRow('Trinket', sheetChip(s.trinket.code, null, 18));
    if (s.trinket.note) h += '<div class="vh-sheet-note">' + mdInline(s.trinket.note) + '</div>';
  }

  h += '</div>';

  // ── Workstations ──
  // Rested leads: comfort is the thing you set up first and carry everywhere.
  h += '<div class="vh-sheet-stations">';
  h += sheetComfortStation(bi);
  stationsFor(bi).forEach(function (code) { h += sheetStation(code, bi); });
  h += '</div>';

  h += '</div>';
  return h;
}

/** Public entry — the macro and the landing-page cycler both call this. */
export function renderBiomeSheet(name: string): string {
  return renderBiomeSheetHtml(name);
}

var MD_DMG_COLORS: any = {
  'Slash':'#d4a050','Blunt':'#e0b868','Pierce':'#c08840',
  'Fire':'#cc4433','Frost':'#a8d8ea','Lightning':'#3388aa',
  'Poison':'#66bb66','Spirit':'#b8e8b0'
};
var MD_STAT_COLORS: any = {
  'HP':'#c66','Health':'#c66','Healing':'#c66',
  'Stamina':'#cc6','Stam':'#cc6',
  'Eitr':'#6ac'
};

export function mdInline(text: string): string {
  var codes: string[] = [];
  var safe = text.replace(/`([^`]+)`/g, function(_, code) {
    codes.push(code);
    return '\x00CODE' + (codes.length - 1) + '\x00';
  });
  var imgs: string[] = [];
  safe = safe.replace(/<img [^>]+>/g, function(m) { imgs.push(m); return '\x00IMG' + (imgs.length - 1) + '\x00'; });
  safe = safe.replace(/<br\s*\/?>/g, function(m) { imgs.push(m); return '\x00IMG' + (imgs.length - 1) + '\x00'; });
  // `<span style="...">` passes through like <img>/<br>, so a doc can size or
  // colour a run of text. The text inside still gets the usual inline passes.
  safe = safe.replace(/<\/?span[^>]*>/g, function(m) { imgs.push(m); return '\x00IMG' + (imgs.length - 1) + '\x00'; });
  safe = safe.replace(/\{set:([A-Za-z0-9_]+)\}/g, function(_, nm) {
    var key = setBySlug(nm);
    if (!key) return nm;                       // escaped with the rest of the line
    var meta = VH_SETS[key], path = '/guides/gear/set-' + setSlug(key);
    // Stash the markup like the other macros do — everything still in `safe`
    // gets esc()'d at the end, so raw HTML returned here would show as text.
    var s = '<a class="vh-set-chip" href="' + path + '"'
      + ' onclick="if(window.__vhNavigate){event.preventDefault();window.__vhNavigate(\'' + path + '\');}">'
      + '<img src="/api/icon/' + encodeURIComponent(meta.helmet) + '.png" alt="" draggable="false">'
      + '<span>' + esc(meta.label) + '</span></a>';
    imgs.push(s); return '\x00IMG' + (imgs.length - 1) + '\x00';
  });
  safe = safe.replace(/\{modbox:([^}]+)\}/g, function(_, spec) {
    var parts = spec.split('|');
    var s = '<span style="display:inline-flex;gap:2px;vertical-align:middle">';
    parts.forEach(function(p: string) {
      var a = p.split(':');
      var dt = a[0]||'', mod = a[1]||'Normal';
      s += '<span title="' + dt + ': ' + (BESTIARY_MOD_LABELS[mod]||mod||'Normal') + '">' + bestiaryModBox(dt, mod, 16) + '</span>';
    });
    s += '</span>';
    imgs.push(s); return '\x00IMG' + (imgs.length - 1) + '\x00';
  });
  safe = safe.replace(/\{bars:([^}]+)\}/g, function(_, spec) {
    var parts = spec.split('|');
    var s = '<span style="display:inline-flex;gap:4px;align-items:center;vertical-align:middle">';
    parts.forEach(function(p: string) {
      var a = p.split('/');
      var pct = parseInt(a[0]||'0'), color = a[1]||'#888', label = a[2]||'';
      var w = 48, h = 12, filled = Math.round(Math.min(pct, 100) / 100 * w);
      s += '<svg width="' + (w + (label ? 30 : 0)) + '" height="' + h + '">';
      s += '<rect x="0" y="1" width="' + w + '" height="' + (h-2) + '" rx="2" fill="#1a1a2e"/>';
      if (filled > 0) s += '<rect x="0" y="1" width="' + filled + '" height="' + (h-2) + '" rx="2" fill="' + color + '"/>';
      if (label) s += '<text x="' + (w+3) + '" y="' + (h-2) + '" font-size="9" fill="#999" font-family="system-ui">' + label + '</text>';
      s += '</svg>';
    });
    s += '</span>';
    imgs.push(s); return '\x00IMG' + (imgs.length - 1) + '\x00';
  });
  safe = safe.replace(/\{bar:(\d+):([^:}]+)(?::([^}]*))?\}/g, function(_, pct, color, label) {
    var w = 80, h = 14, filled = Math.round(Math.min(parseInt(pct), 100) / 100 * w);
    var s = '<svg width="' + (w + (label ? 40 : 0)) + '" height="' + h + '" style="vertical-align:middle">';
    s += '<rect x="0" y="1" width="' + w + '" height="' + (h-2) + '" rx="2" fill="#1a1a2e"/>';
    if (filled > 0) s += '<rect x="0" y="1" width="' + filled + '" height="' + (h-2) + '" rx="2" fill="' + color + '"/>';
    if (label) s += '<text x="' + (w+4) + '" y="' + (h-3) + '" font-size="10" fill="#999" font-family="system-ui">' + label + '</text>';
    s += '</svg>';
    imgs.push(s); return '\x00IMG' + (imgs.length - 1) + '\x00';
  });
  safe = safe.replace(/\{parry:([^}]+)\}/g, function(_, val) {
    var v = parseFloat(val);
    var col = v >= 2 ? '#4c8' : '#ca0';
    var s = '<span style="color:' + col + ';font-weight:bold">' + val + '×</span>';
    imgs.push(s); return '\x00IMG' + (imgs.length - 1) + '\x00';
  });
  safe = safe.replace(/\{fork(?::([a-z]+))?(?::(\d+))?\}/g, function(_, t, sz) {
    var s = forkSvg(t || 'bal', sz ? parseInt(sz, 10) : 14);
    imgs.push(s); return '\x00IMG' + (imgs.length - 1) + '\x00';
  });
  safe = safe.replace(/\{adrenaline\}/g, function() {
    var s = adrenalineSvg(14);
    imgs.push(s); return '\x00IMG' + (imgs.length - 1) + '\x00';
  });
  safe = safe.replace(/\[([^\]]+)\](?:\((?:(lvl)(\d+)|(\d+))\)|(\*)|(\+)|(@)(?:"([^"]*)")?)/g, function(_m, name, lvlPrefix, lvlVal, amount, _star, plus, atSign, linkLabel) {
    var s;
    if (lvlPrefix) {
      s = mdItemChip(name, 'level', lvlVal);
    } else if (amount !== undefined) {
      s = mdItemChip(name, 'amount', amount);
    } else if (atSign) {
      s = mdItemChip(name, 'link', linkLabel || '');
    } else if (plus) {
      s = mdItemChip(name, 'icon2x', '');
    } else {
      s = mdItemChip(name, 'icon', '');
    }
    imgs.push(s); return '\x00IMG' + (imgs.length - 1) + '\x00';
  });
  safe = safe.replace(/\{recipe:([^}]+)\}/g, function(_, name) {
    var s = mdRecipeBlock(name.trim());
    imgs.push(s); return '\x00IMG' + (imgs.length - 1) + '\x00';
  });
  safe = safe.replace(/\{power:([^}]+)\}/g, function(_, name) {
    var s = mdPowerBlock(name.trim());
    imgs.push(s); return '\x00IMG' + (imgs.length - 1) + '\x00';
  });
  return esc(safe)
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#fff">$1</strong>')
    .replace(/\[([^\]]+)\]\(\/([^)]+)\)/g, function(_: string, text: string, path: string) {
      var hashIdx = path.indexOf('#');
      if (hashIdx >= 0) {
        var hash = path.slice(hashIdx);
        return '<a href="' + hash + '" onclick="event.preventDefault();var el=document.getElementById(\'' + hash.slice(1).replace(/'/g, "\\'") + '\');if(el)el.scrollIntoView({behavior:\'smooth\'})" style="color:#88bbff;text-decoration:underline;cursor:pointer">' + text + '</a>';
      }
      return '<a href="/' + path + '" onclick="event.preventDefault();window.__vhNavigate&&window.__vhNavigate(\'/' + path.replace(/'/g, "\\'") + '\')" style="color:#88bbff;text-decoration:underline;cursor:pointer">' + text + '</a>';
    })
    .replace(/\b(Slash|Blunt|Pierce|Fire|Frost|Lightning|Poison|Spirit)\b/g, function(m: string) {
      return '<span style="color:' + MD_DMG_COLORS[m] + ';font-weight:bold">' + m + '</span>';
    })
    .replace(/\b(HP|Health|Healing|Stamina|Stam|Eitr)\b/g, function(m: string) {
      return '<span style="color:' + MD_STAT_COLORS[m] + ';font-weight:bold">' + m + '</span>';
    })
    .replace(/\x00IMG(\d+)\x00/g, function(_: string, idx: string) { return imgs[parseInt(idx)]; })
    .replace(/\x00CODE(\d+)\x00/g, function(_: string, idx: string) { return '<code style="background:#2a2a3e;padding:1px 5px;border-radius:3px;font-size:12px;color:#e8e8e8">' + esc(codes[parseInt(idx)]) + '</code>'; });
}

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Armour set pages ──────────────────────────────────────────────
// `{set:<name>}` links to a set's own page, and renderSetPageHtml builds it:
// every piece, what it costs, and roughly how many kills that is.
//
// The set's display name is the game's own set-effect name, and the icon is the
// one the game shows for that effect — always the set's helmet. Neither is in
// items.json (the names live in the game's localisation), so they are listed
// here.
var VH_SETS = {
  troll:                  { label: 'Sneaky',            helmet: 'HelmetTrollLeather' },
  berserker_armor:        { label: 'Berserk',           helmet: 'HelmetBerserkerHood' },
  root_armor:             { label: 'Improved archery',  helmet: 'HelmetRoot' },
  fenring_armor:          { label: 'Fenris blessing',   helmet: 'HelmetFenring' },
  lox:                    { label: 'Boon of the Lox',   helmet: 'HelmetLox' },
  berserker_armor_undead: { label: 'Vilebone Wrath',    helmet: 'HelmetBerserkerUndead' },
  AshlandsMediumArmor:    { label: "Ask's Endurance",   helmet: 'HelmetAshlandsMediumHood' },
  DeepNorthMediumArmor:   { label: 'Vanguard',          helmet: 'HelmetDNMediumHood' },
  harvester:              { label: 'Harvester',         helmet: 'HelmetStrawHat' },
};

function setBySlug(slug) {
  var s = String(slug || '').toLowerCase();
  for (var k in VH_SETS) if (k.toLowerCase() === s) return k;
  return null;
}
function setSlug(name) { return String(name).toLowerCase(); }

/** Pieces of a set, helmet first then chest, legs, cape. */
function setPieces(name) {
  if (!allItems) return [];
  var order = { Helmets: 0, Chest: 1, Legs: 2, Capes: 3 };
  var out = allItems.filter(function (it) { return it.set && it.set.name === name; });
  out.sort(function (a, b) {
    var ao = order[a.subcategory], bo = order[b.subcategory];
    ao = ao == null ? 9 : ao; bo = bo == null ? 9 : bo;
    return ao - bo || (a.name < b.name ? -1 : 1);
  });
  return out;
}

/** Where a material comes from, and how much of it one kill yields.
 *  Two shapes to cover: ordinary materials sit in a creature's `drops`, while a
 *  trophy is its own bestiary entry carrying the drop `rate` — it never appears
 *  in anyone's drop list, so looking only at `drops` misses every trophy. */
function bestDropSource(code) {
  if (!allItems) return null;
  var best = null;
  for (var i = 0; i < allItems.length; i++) {
    var it = allItems[i], td = it.trophyDrop;
    if (!td) continue;
    // the trophy itself
    if (it.code === code && !td.noTrophy && td.rate > 0) {
      var t = { creature: td.creature || it.name, per: td.rate, biome: td.biome || '' };
      if (!best || t.per > best.per) best = t;
    }
    for (var d = 0; d < (td.drops || []).length; d++) {
      var dr = td.drops[d];
      if (dr.code !== code) continue;
      var mn = dr.min == null ? 1 : dr.min, mx = dr.max == null ? mn : dr.max;
      var per = (dr.chance == null ? 1 : dr.chance) * ((mn + mx) / 2);
      if (per > 0 && (!best || per > best.per)) {
        best = { creature: td.creature || it.name, per: per, biome: td.biome || '' };
      }
    }
  }
  return best;
}

function itemByCode(code) {
  if (!allItems) return null;
  for (var i = 0; i < allItems.length; i++) if (allItems[i].code === code) return allItems[i];
  return null;
}

/** What a piece costs at each step: the craft, then one entry per upgrade.
 *  Upgrading away from level N costs N x perLevel, so the steps climb. */
function setPieceLevels(it) {
  var res = (it.recipe || {}).resources || [];
  var maxQ = it.maxQuality || 1;
  var mats = [];
  for (var i = 0; i < res.length; i++) {
    if (!res[i].item || /^Upgrader/.test(res[i].item)) continue;
    mats.push(res[i]);
  }
  var levels = [];
  for (var lv = 1; lv <= maxQ; lv++) {
    var row = [];
    for (var m = 0; m < mats.length; m++) {
      var qty = lv === 1 ? (mats[m].amount || 0) : (mats[m].perLevel || 0) * (lv - 1);
      if (qty > 0) row.push({ code: mats[m].item, qty: qty });
    }
    levels.push({ level: lv, mats: row });
  }
  return { levels: levels, maxQuality: maxQ };
}

/** Every material the whole set needs, and the kills behind each. */
function setMaterialTotals(pieces) {
  var need = {}, order = [];
  for (var p = 0; p < pieces.length; p++) {
    var lv = setPieceLevels(pieces[p]).levels;
    for (var l = 0; l < lv.length; l++) {
      for (var m = 0; m < lv[l].mats.length; m++) {
        var c = lv[l].mats[m].code;
        if (need[c] == null) { need[c] = 0; order.push(c); }
        need[c] += lv[l].mats[m].qty;
      }
    }
  }
  var rows = [];
  for (var i = 0; i < order.length; i++) {
    var code = order[i], src = bestDropSource(code), item = itemByCode(code);
    rows.push({
      code: code, name: (item && item.name) || code, hasIcon: !!(item && item.hasIcon),
      total: need[code], src: src,
      kills: src ? Math.ceil(need[code] / src.per) : null,
    });
  }
  rows.sort(function (a, b) { return (b.kills || 0) - (a.kills || 0); });
  return rows;
}

/** The creature to actually go and farm: whoever drops the material the set
 *  needs most of, ties going to the bigger grind.
 *
 *  Picking by raw kill count instead would name the wrong creature — the Fenris
 *  set needs 68 Leather Scraps off Boar against 72 Wolf Pelt off Wolf, so a
 *  kill-count rule calls a Mountain set a Meadows farm. Quantity tracks what the
 *  set is actually made of. */
function setMainFarm(rows) {
  var best = null;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r.src) continue;
    if (!best || r.total > best.total || (r.total === best.total && r.kills > best.kills)) {
      best = { creature: r.src.creature, kills: r.kills, total: r.total, material: r.name };
    }
  }
  return best;
}

function matChip(code, qty) {
  var it = itemByCode(code);
  var icon = it && it.hasIcon
    ? '<img src="/api/icon/' + encodeURIComponent(code) + '.png" alt="" draggable="false">' : '';
  return '<span class="vh-set-chip2" title="' + esc((it && it.name) || code) + '">'
    + icon + '<span>' + qty + '</span></span>';
}

function renderSetPageHtml(slug) {
  var name = setBySlug(slug);
  if (!name) return '<div class="vh-items-detail-empty">Unknown set.</div>';
  var meta = VH_SETS[name], pieces = setPieces(name);
  if (!pieces.length) return '<div class="vh-items-detail-empty">No pieces found for this set.</div>';

  var rows = setMaterialTotals(pieces);
  var farm = setMainFarm(rows);
  var totalKills = 0;
  for (var r = 0; r < rows.length; r++) totalKills += rows[r].kills || 0;

  var maxQ = 1;
  var lvs = [];
  for (var p = 0; p < pieces.length; p++) {
    var pl = setPieceLevels(pieces[p]);
    lvs.push(pl);
    if (pl.maxQuality > maxQ) maxQ = pl.maxQuality;
  }

  var h = '<div class="vh-set">'
    + '<div class="vh-set-head">'
    + '<img class="vh-set-icon" src="/api/icon/' + encodeURIComponent(meta.helmet) + '.png" alt="">'
    + '<div><div class="vh-set-name">' + esc(meta.label) + '</div>'
    + '<div class="vh-set-sub">' + pieces.length + ' pieces · bonus applies with all of them equipped</div></div>'
    + '</div>';

  if (farm) {
    var fsrc = null;
    for (var q = 0; q < rows.length; q++) if (rows[q].src && rows[q].src.creature === farm.creature) { fsrc = rows[q]; break; }
    h += '<div class="vh-set-farm">'
      + '<span class="vh-set-farm-lbl">Mainly farm</span>'
      + '<strong>' + esc(farm.creature) + '</strong>'
      + '<span class="vh-set-farm-kills">~' + farm.kills + ' kills</span>'
      + '<span class="vh-set-farm-for">for ' + farm.total + ' ' + esc(farm.material) + '</span>'
      + '<span class="vh-set-farm-all">' + totalKills + ' kills across every material</span>'
      + '</div>';
    void fsrc;
  }

  // levels down the side, pieces across the top
  h += '<table class="vh-set-grid"><thead><tr><th>Level</th>';
  for (var c = 0; c < pieces.length; c++) {
    h += '<th>' + (pieces[c].hasIcon
      ? '<img src="/api/icon/' + encodeURIComponent(pieces[c].code) + '.png" alt="">' : '')
      + '<span>' + esc(pieces[c].name || pieces[c].code) + '</span></th>';
  }
  h += '</tr></thead><tbody>';
  for (var lv = 1; lv <= maxQ; lv++) {
    h += '<tr><td class="vh-set-lv">' + (lv === 1 ? 'Craft' : '→ ' + lv) + '</td>';
    for (var pc = 0; pc < pieces.length; pc++) {
      var row = lvs[pc].levels[lv - 1];
      var cell = '';
      if (!row) cell = '<span class="vh-set-na">—</span>';
      else for (var mm = 0; mm < row.mats.length; mm++) cell += matChip(row.mats[mm].code, row.mats[mm].qty);
      h += '<td>' + (cell || '<span class="vh-set-na">—</span>') + '</td>';
    }
    h += '</tr>';
  }
  // totals per piece, across every level
  h += '<tr class="vh-set-total"><td class="vh-set-lv">Total</td>';
  for (var pt = 0; pt < pieces.length; pt++) {
    var sum = {}, ord = [];
    for (var L = 0; L < lvs[pt].levels.length; L++) {
      var ms = lvs[pt].levels[L].mats;
      for (var x = 0; x < ms.length; x++) {
        if (sum[ms[x].code] == null) { sum[ms[x].code] = 0; ord.push(ms[x].code); }
        sum[ms[x].code] += ms[x].qty;
      }
    }
    var cellT = '';
    for (var o = 0; o < ord.length; o++) cellT += matChip(ord[o], sum[ord[o]]);
    h += '<td>' + cellT + '</td>';
  }
  h += '</tr></tbody></table>';

  // what those totals cost in kills
  h += '<table class="vh-set-kills2"><thead><tr>'
    + '<th>Material</th><th>Need</th><th>Drops from</th><th>Kills</th></tr></thead><tbody>';
  for (var k = 0; k < rows.length; k++) {
    var m2 = rows[k];
    var icon = m2.hasIcon
      ? '<img src="/api/icon/' + encodeURIComponent(m2.code) + '.png" alt="" draggable="false">' : '';
    h += '<tr' + (farm && m2.src && m2.src.creature === farm.creature ? ' class="is-farm"' : '') + '>'
      + '<td class="vh-set-mat">' + icon + '<span>' + esc(m2.name) + '</span></td>'
      + '<td>' + m2.total + '</td>'
      + '<td>' + (m2.src
        ? esc(m2.src.creature) + ' <span class="vh-set-rate">(' + (Math.round(m2.src.per * 100) / 100) + '/kill)</span>'
        : '<span class="vh-set-gather">gathered, not a drop</span>') + '</td>'
      + '<td class="vh-set-kills">' + (m2.kills == null ? '—' : m2.kills) + '</td></tr>';
  }
  h += '</tbody></table>';

  return h + '<p class="vh-set-note">Totals are a full set at max quality. Upgrade cost climbs with '
    + 'level, so going 3→4 costs three times the per-level amount. Kills assume the creature that '
    + 'drops the most per kill, at 0★ and an average roll — starred creatures drop more.</p></div>';
}

// ── Comfort calculator ────────────────────────────────────────────
// `{comfortcalc}` renders a pick-one-per-category comfort calculator as a grid
// of icon cells — one cell per category, showing the piece currently counted.
// Tapping a cell opens an inline picker of that category's art; tapping the
// piece that is already chosen clears the category.
//
// Defaults come from COMFORT_SLOTS, the curated progression in biomeSheets.ts,
// because that is what the guide's max-per-biome table is derived from — so an
// untouched calculator always agrees with the table. The pieces offered in the
// picker come from items.json instead, so every comfort piece is selectable.
//
// The whole widget renders from state, so every interaction is a re-render and
// there is no DOM patching to keep in sync.

// items.json spells one group differently from COMFORT_SLOTS.
var CC_GROUP_KEY = { 'Item stand': 'ItemStand' };
// Category art, matching the sidebar tags in pageConfigs.tsx.
var CC_CAT_ICON = {
  Fire: 'hearth', Bed: 'piece_bed02', Seating: 'piece_throne01',
  Table: 'piece_table_round', Carpet: 'rug_wolf', Banner: 'piece_cloth_hanging_door',
  'Item stand': 'ArmorStand', Garland: 'piece_CelebrationGarland',
  Bathing: 'piece_bathtub', Lantern: 'piece_Lavalantern', Ornament: 'piece_pot2',
};

function ccPieces(group) {
  if (!allItems) return [];
  var key = CC_GROUP_KEY[group] || group, out = [];
  for (var i = 0; i < allItems.length; i++) {
    var it = allItems[i];
    if (!it.comfort || it.comfortGroup !== key) continue;
    var bi = itemBiomeIndex(it.code);
    out.push({
      code: it.code, name: it.name || it.code, comfort: it.comfort,
      bi: bi == null ? 0 : bi, seasonal: it.seasonal || '',
    });
  }
  out.sort(function (a, b) {
    return b.comfort - a.comfort || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  });
  return out;
}

function ccState() {
  if (!window.__vhCC) window.__vhCC = { picks: {}, auto: {}, shelter: true, stack: {}, open: '' };
  return window.__vhCC;
}

/** The default for a category: the curated progression pick, not the best row in
 *  items.json, so an untouched calculator matches the guide's table exactly. */
function ccBest(group, revealed) {
  for (var s = 0; s < COMFORT_SLOTS.length; s++) {
    if (COMFORT_SLOTS[s].group === group) return comfortPick(COMFORT_SLOTS[s], revealed - 1);
  }
  return null;
}

function ccUnlocked(group, revealed) {
  var list = ccPieces(group), out = [];
  for (var i = 0; i < list.length; i++) if (list[i].bi < revealed) out.push(list[i]);
  return out;
}

function ccFind(group, code) {
  if (!code) return null;
  var list = ccPieces(group);
  for (var i = 0; i < list.length; i++) if (list[i].code === code) return list[i];
  return null;
}

function ccIcon(code, cls) {
  return '<img class="' + (cls || '') + '" src="/api/icon/' + encodeURIComponent(code)
    + '.png" alt="" draggable="false">';
}

function ccCell(group, revealed, st) {
  var sel = ccFind(group, st.picks[group]);
  var on = !!sel;
  return '<button type="button" class="vh-cc-cell' + (on ? ' is-on' : '')
    + (st.open === group ? ' is-open' : '') + '"'
    + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
    + ' title="' + esc(group) + (sel ? ': ' + esc(sel.name) : '') + '"'
    + ' onclick="window.__vhCCOpen(\'' + esc(group) + '\')">'
    + ccIcon(sel ? sel.code : (CC_CAT_ICON[group] || 'hearth'), on ? '' : 'is-empty')
    + '<span class="vh-cc-name">' + esc(sel ? sel.name : group) + '</span>'
    + '<span class="vh-cc-plus">' + (on ? '+' + sel.comfort : '—') + '</span>'
    + '</button>';
}

function ccToggleCell(key, code, label, value, active) {
  return '<button type="button" class="vh-cc-cell' + (active ? ' is-on' : '') + '"'
    + ' aria-pressed="' + (active ? 'true' : 'false') + '" title="' + esc(label) + '"'
    + ' onclick="window.__vhCCToggle(\'' + key + '\',\'' + esc(code) + '\')">'
    + ccIcon(code, active ? '' : 'is-empty')
    + '<span class="vh-cc-name">' + esc(label) + '</span>'
    + '<span class="vh-cc-plus">' + (active ? '+' + value : '—') + '</span>'
    + '</button>';
}

function ccPicker(group, revealed, st) {
  var list = ccUnlocked(group, revealed);
  if (!list.length) return '';
  var h = '<div class="vh-cc-picker"><div class="vh-cc-picker-top">'
    + '<span class="vh-cc-picker-cat">' + esc(group) + '</span>'
    + '<button type="button" class="vh-cc-x" onclick="window.__vhCCOpen(\'\')">Close</button>'
    + '</div><div class="vh-cc-picker-grid">';
  for (var i = 0; i < list.length; i++) {
    var p = list[i], on = st.picks[group] === p.code;
    h += '<button type="button" class="vh-cc-opt' + (on ? ' is-on' : '') + '"'
      + ' title="' + esc(p.name) + (p.seasonal ? ' (' + esc(p.seasonal) + ')' : '') + '"'
      + ' onclick="window.__vhCCChoose(\'' + esc(group) + '\',\'' + esc(p.code) + '\')">'
      + ccIcon(p.code) + '<span class="vh-cc-opt-name">' + esc(p.name) + '</span>'
      + '<span class="vh-cc-opt-plus">+' + p.comfort + '</span></button>';
  }
  return h + '</div><div class="vh-cc-hint">Tap the chosen piece again to clear this category.</div></div>';
}

function renderComfortCalcHtml() {
  if (!allItems) return '';
  var revealed = getRevealedCount(), st = ccState();
  var total = st.shelter ? COMFORT_BASE : 0;
  var cells = '';

  if (st.shelter || true) {
    cells += ccToggleCell('shelter', 'se_shelter', 'Shelter', COMFORT_BASE, st.shelter);
  }
  for (var s = 0; s < COMFORT_SLOTS.length; s++) {
    var group = COMFORT_SLOTS[s].group;
    if (!ccUnlocked(group, revealed).length) continue;   // nothing unlocked here yet
    if (st.auto[group] !== false) {
      var b = ccBest(group, revealed);
      st.picks[group] = b ? b.code : '';
    }
    var sel = ccFind(group, st.picks[group]);
    if (sel) total += sel.comfort;
    cells += ccCell(group, revealed, st);
  }
  var stack = ccPieces('Standalone');
  for (var k = 0; k < stack.length; k++) {
    var sp = stack[k];
    if (sp.bi >= revealed) continue;
    if (st.stack[sp.code]) total += sp.comfort;
    cells += ccToggleCell('stack', sp.code, sp.name, sp.comfort, !!st.stack[sp.code]);
  }

  return '<div class="vh-cc" id="vh-cc" data-revealed="' + revealed + '">'
    + '<div class="vh-cc-top">'
    + '<span class="vh-cc-stat"><strong>' + total + '</strong>'
    + '<span class="vh-cc-unit">comfort</span></span>'
    + '<span class="vh-cc-stat">'
    + '<img class="vh-cc-rested-icon" src="/data/vh/rested.png" alt="">'
    + '<strong>' + restedMinutes(total) + '</strong>'
    + '<span class="vh-cc-unit">min rested</span></span>'
    + '<button type="button" class="vh-cc-reset" onclick="window.__vhCCReset()">Reset</button>'
    + '</div><div class="vh-cc-grid">' + cells + '</div>'
    + (st.open ? ccPicker(st.open, revealed, st) : '')
    + '</div>';
}

window.__vhCCRefresh = function () {
  var root = document.getElementById('vh-cc');
  if (!root) return;
  var holder = document.createElement('div');
  holder.innerHTML = renderComfortCalcHtml();
  if (holder.firstChild) root.parentNode.replaceChild(holder.firstChild, root);
};

window.__vhCCOpen = function (group) {
  var st = ccState();
  st.open = (st.open === group) ? '' : group;
  window.__vhCCRefresh();
};

window.__vhCCChoose = function (group, code) {
  var st = ccState();
  st.auto[group] = false;                       // stops following the default
  st.picks[group] = (st.picks[group] === code) ? '' : code;   // same piece = clear
  st.open = '';
  window.__vhCCRefresh();
};

window.__vhCCToggle = function (kind, code) {
  var st = ccState();
  if (kind === 'shelter') st.shelter = !st.shelter;
  else st.stack[code] = !st.stack[code];
  window.__vhCCRefresh();
};

window.__vhCCReset = function () {
  window.__vhCC = { picks: {}, auto: {}, shelter: true, stack: {}, open: '' };
  window.__vhCCRefresh();
};

// The slider only stamps `data-spoiler` on the guides root, so watch that
// attribute rather than subscribing — no import cycle, and it works wherever
// the calculator is rendered.
if (typeof document !== 'undefined' && !window.__vhCCBound) {
  window.__vhCCBound = true;
  var ccObserve = function () {
    var host = document.querySelector('.vh-guides[data-spoiler]');
    if (!host || host.__vhCCWatched) return;
    host.__vhCCWatched = true;
    new MutationObserver(function () {
      var root = document.getElementById('vh-cc');
      if (!root || String(getRevealedCount()) === root.getAttribute('data-revealed')) return;
      window.__vhCCRefresh();   // hand-picked categories survive; auto ones re-pick
    }).observe(host, { attributes: true, attributeFilter: ['data-spoiler'] });
  };
  setInterval(ccObserve, 1000);
  ccObserve();
}

// ── Creature type index ───────────────────────────────────────────
// `{creaturetypes}` renders every creature that drops a trophy as a grid of
// trophy tiles, grouped and linked to the creature's page.
//
// Grouping follows what the data actually marks. `faction: 'Boss'` is the seven
// altar bosses; `boss: true` without that faction is the miniboss set. Tameable
// is its own flag. Everything else falls back to biome, which is the axis the
// bestiary itself is organised by — and it keeps every group under the 9-tile
// cap without truncating anything today.
//
// There is no "passive" marker in the game data (Deer is filed under
// ForestMonsters, Hare under AnimalsVeg, and both carry damage values), so no
// passive group is invented here.

var CREATURE_GROUP_CAP = 9;

// Small groups that ride along in another group's row rather than taking a row
// of their own. The passenger gets a label cell inside the host's tile grid, so
// tiles stay exactly the width they are on every other row.
var ROW_PASSENGER = { Meadows: 'Ocean' };

// Corrections to what items.json marks. The extractor flags these three with
// `boss: true`, but they are ordinary Deep North creatures, not Hildir-style
// minibosses.
var NOT_MINIBOSS = {
  TrophyJotunWarrior: 1, TrophyJotunWitch: 1, TrophyElaking: 1, TrophyBonemawSerpent: 1,
};
// Frost Blob only exists because a player spawned it, so it is not part of the
// bestiary a reader can go and find.
var SKIP_CREATURE = { TrophyBlob_Frost: 1 };
// Lord Reto is a miniboss the extractor does not flag.
var EXTRA_MINIBOSS = { LordReto: 1 };
// Creatures the game gives no trophy at all, but which we have drawn art for so
// they are not missing from the index. Kall Fimbulbringer genuinely drops
// nothing — his CharacterDrop list is empty in the game files — so his tile
// uses the FrozenKingDrop relic art.
var SUPPLIED_TROPHY = { LordReto: 1, Bestiary_FrozenKing: 1 };
// Animals that flee rather than fight. The game data has no passive flag —
// Deer is filed under ForestMonsters and Hare under AnimalsVeg, and both carry
// damage values — so the set is explicit.
var PASSIVE = { TrophyDeer: 1, TrophyHare: 1, TrophySeal: 1 };

/** ` sp-fog sp-b<n>` — blurs and mutes until the reader reaches that biome.
 *  Unlike `sp-item` there is no lock plate; the fog is the whole message, and
 *  it also kills pointer events so a locked tile is not a working link. */
function itemSpoilerFog(code) {
  var idx = itemBiomeIndex(code);
  return idx == null ? '' : ' sp-fog sp-b' + idx;
}

/** Biome label a creature's tile is filed under, honouring itemBiome overrides. */
function creatureBiome(it) {
  var bi = itemBiomeIndex(it.code);
  return bi == null ? (it.subcategory || 'Unknown') : biomeLabel(bi);
}

function creatureTypeGroups() {
  if (!allItems) return [];
  var mobs = [];
  for (var i = 0; i < allItems.length; i++) {
    var it = allItems[i], td = it.trophyDrop;
    if (it.page !== 'bestiary' || !td || SKIP_CREATURE[it.code]) continue;
    // noTrophy creatures have no trophy art to show, so they are not tiles —
    // unless we have supplied art for one.
    if (td.noTrophy && !SUPPLIED_TROPHY[it.code]) continue;
    mobs.push(it);
  }
  var groups = [
    { label: 'Bosses', items: [] },
    { label: 'Minibosses', items: [] },
  ];
  var byBiome = {};
  for (var m = 0; m < mobs.length; m++) {
    var mob = mobs[m], d = mob.trophyDrop;
    if (d.faction === 'Boss') groups[0].items.push(mob);
    else if (EXTRA_MINIBOSS[mob.code] || (d.boss && !NOT_MINIBOSS[mob.code])) groups[1].items.push(mob);
    else {
      // Group on the resolved biome index, not the raw subcategory, so the
      // itemBiome overrides move a creature's tile and its fog together.
      (byBiome[creatureBiome(mob)] = byBiome[creatureBiome(mob)] || []).push(mob);
    }
  }
  // Biome groups in progression order so the grid reads as a run through the game.
  var order = [];
  for (var k in byBiome) order.push(k);
  order.sort(function (a, b) {
    var ai = biomeIndex(a), bi = biomeIndex(b);
    return (ai == null ? 99 : ai) - (bi == null ? 99 : bi);
  });
  for (var o = 0; o < order.length; o++) {
    groups.push({ label: order[o], items: byBiome[order[o]] });
  }
  // Within a group: earliest biome first, then the tougher creature first, so
  // the eye lands on the headline monster of each tier.
  for (var g = 0; g < groups.length; g++) {
    groups[g].items.sort(function (a, b) {
      var ai = itemBiomeIndex(a.code), bi2 = itemBiomeIndex(b.code);
      ai = ai == null ? 99 : ai; bi2 = bi2 == null ? 99 : bi2;
      return ai - bi2 || (b.trophyDrop.hp || 0) - (a.trophyDrop.hp || 0);
    });
    groups[g].items = groups[g].items.slice(0, CREATURE_GROUP_CAP);
  }
  groups = groups.filter(function (x) { return x.items.length; });

  // Fold each passenger into its host row when the combined tiles plus the
  // label cell still fit the column budget; otherwise leave it as its own row.
  var byLabel = {};
  for (var b = 0; b < groups.length; b++) byLabel[groups[b].label] = groups[b];
  var dropped = {};
  for (var host in ROW_PASSENGER) {
    var h = byLabel[host], pLabel = ROW_PASSENGER[host], pg = byLabel[pLabel];
    if (!h || !pg) continue;
    if (h.items.length + 1 + pg.items.length > CREATURE_GROUP_CAP) continue;
    h.extra = pg;
    dropped[pLabel] = 1;
  }
  return groups.filter(function (x) { return !dropped[x.label]; });
}

function creatureTile(it) {
  var td = it.trophyDrop || {};
  var name = td.creature || it.name;
  var path = '/guides/' + itemPagePath(it);
  var escPath = path.replace(/'/g, "\\'");
  // One badge slot, top-right: a heart if you can tame it, a peace sign if it
  // flees rather than fights. Nothing is both, and sharing the slot stops a
  // badge sitting beside its neighbour's and reading as a pair.
  var badge = td.tameable
    ? '<span class="vh-ct-badge is-tame" aria-hidden="true">♥</span>'
    : PASSIVE[it.code]
      ? '<span class="vh-ct-badge is-passive" aria-hidden="true">☮</span>' : '';
  return '<a class="vh-ct-tile' + itemSpoilerFog(it.code) + '" href="' + path + '"'
    + ' title="' + esc(name) + (td.tameable ? ' (tameable)' : '')
    + (PASSIVE[it.code] ? ' (passive)' : '') + '"'
    + ' onclick="if(window.__vhNavigate){event.preventDefault();window.__vhNavigate(\''
    + escPath + '\');}">'
    + '<img src="/api/icon/' + encodeURIComponent(it.code) + '.png" alt="" draggable="false">'
    + badge
    + '<span class="vh-ct-name">' + esc(name) + '</span></a>';
}

function renderCreatureTypesHtml() {
  var groups = creatureTypeGroups();
  if (!groups.length) return '';
  var h = '<div class="vh-ct">';
  for (var g = 0; g < groups.length; g++) {
    h += '<div class="vh-ct-row">'
      + '<div class="vh-ct-label">' + esc(groups[g].label) + '</div>'
      + '<div class="vh-ct-tiles">';
    for (var i = 0; i < groups[g].items.length; i++) h += creatureTile(groups[g].items[i]);
    var ex = groups[g].extra;
    if (ex) {
      h += '<div class="vh-ct-sublabel">' + esc(ex.label) + '</div>';
      for (var e = 0; e < ex.items.length; e++) h += creatureTile(ex.items[e]);
    }
    h += '</div></div>';
  }
  return h + '</div>';
}

// ── Trophy pity chart ─────────────────────────────────────────────
// `{trophypity}` renders a trophy picker plus the bad-luck-protection chart
// from docs/bestiary.md. Both curves are a pure function of the drop chance,
// so switching trophies is just a redraw — no data fetch.
//
// Only drops at PITY_MAX_RATE or below get a countdown from the game; above it
// every kill is an independent roll, so those trophies have no chart to show.

var PITY_MAX_RATE = 0.30;
var PITY_PICKS = 10;

/** The rare trophies the most recipes ask for — the ones players farm on
 *  purpose. Recipe count is the primary sort. Many trophies tie at one recipe,
 *  so ties break toward the earlier biome (keeps the list on creatures the
 *  reader has likely met), then the rarer drop, then the name. */
function trophyPityList() {
  if (!allItems) return [];
  var uses = {};
  for (var i = 0; i < allItems.length; i++) {
    var rec = allItems[i].recipe;
    var res = rec && rec.resources;
    if (!res) continue;
    for (var r = 0; r < res.length; r++) {
      if (res[r].item) uses[res[r].item] = (uses[res[r].item] || 0) + 1;
    }
  }
  var out = [];
  for (var j = 0; j < allItems.length; j++) {
    var it = allItems[j], td = it.trophyDrop;
    if (!td || typeof td.rate !== 'number') continue;
    if (!(td.rate > 0 && td.rate <= PITY_MAX_RATE)) continue;
    var bi = itemBiomeIndex(it.code);
    out.push({
      code: it.code, creature: td.creature || it.name, rate: td.rate,
      biome: td.biome || '', bi: (bi == null ? 99 : bi), uses: (uses[it.code] || 0),
    });
  }
  out.sort(function (a, b) {
    return (b.uses - a.uses) || (a.bi - b.bi) || (a.rate - b.rate)
      || (a.creature < b.creature ? -1 : a.creature > b.creature ? 1 : 0);
  });
  return out.slice(0, PITY_PICKS);
}

/** Kills the countdown is guaranteed to fire within, for drop chance p.
 *  The game draws 1..(int)(2/p), so this floors — matching the 5/10/15/30%
 *  guarantees of 40/20/13/6 kills in the docs table. */
function pityCap(p) { return Math.floor(2 / p); }

/** A tick step that divides the guarantee (so it lands on a label) and keeps
 *  the axis under ~10 ticks. Falls back to the guarantee itself. */
function pityTickStep(cap, xmax) {
  var nice = [1, 2, 5, 10, 20, 25, 50, 100];
  for (var i = 0; i < nice.length; i++) {
    if (xmax / nice[i] <= 10 && cap % nice[i] === 0) return nice[i];
  }
  return cap;
}

/** The chart. `pick` may be null, which draws a generic 10% example with no
 *  creature named — used when the reader's spoiler level reveals none of the
 *  trophies in the list.
 *
 *  Annotation geometry is deliberately rate-independent: the axis always spans
 *  2x the guarantee, so X(0.7 * cap) lands on the same pixel for every drop
 *  chance and the hazard callouts never need per-rate nudging. */
function pityChartSvg(pick) {
  var p = pick ? pick.rate : 0.10;
  var who = pick ? pick.creature : null;
  var cap = pityCap(p), xmax = cap * 2;
  var X0 = 64, X1 = 616, YTOP = 78, YBOT = 316;
  var sx = (X1 - X0) / xmax;
  function X(k) { return X0 + k * sx; }
  function Y(v) { return YBOT - v * (YBOT - YTOP); }
  function n1(v) { return Math.round(v * 10) / 10; }

  var luck = [], pity = [];
  for (var k = 0; k <= xmax; k++) {
    luck.push([n1(X(k)), n1(Y(Math.pow(1 - p, k)))]);
    pity.push([n1(X(k)), n1(Y(Math.max(0, (cap - k) / cap)))]);
  }
  var pts = function (a) { return a.map(function (q) { return q[0] + ',' + q[1]; }).join(' '); };
  var atCap = Math.pow(1 - p, cap), atEnd = Math.pow(1 - p, xmax);
  var yCap = Y(atCap), yEnd = Y(atEnd);

  // Shaded areas. Under the countdown line (0..cap) is the window where it is
  // still pending; under pure luck past the guarantee is the dry-streak tail
  // the countdown deletes outright.
  var pendArea = pts(pity.slice(0, cap + 1)) + ' ' + n1(X(cap)) + ',' + YBOT + ' ' + X0 + ',' + YBOT;
  var tailArea = pts(luck.slice(cap)) + ' ' + n1(X(xmax)) + ',' + YBOT + ' ' + n1(X(cap)) + ',' + YBOT;

  var grid = '';
  [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
    grid += '<line x1="64" x2="616" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="'
      + (v === 0 ? '#55556a' : '#31314a') + '" stroke-width="1"/>'
      + '<text x="56" y="' + (Y(v) + 4) + '" text-anchor="end" fill="#6f6f80" font-size="11">'
      + (v * 100) + '%</text>';
  });
  var step = pityTickStep(cap, xmax), xlab = '';
  for (var t = 0; t <= xmax; t += step) {
    xlab += '<text x="' + n1(X(t)) + '" y="334" text-anchor="middle" fill="#6f6f80" font-size="11">' + t + '</text>';
  }

  // ── Hazard stamps ──
  // Both hazards do the same thing — throw the countdown away and roll a new
  // one — so they share a single reset arrow and sit as two stamps beside it.
  var DANGER = '#ff5d6c';
  // Each badge is sized to its own text rather than sharing one width, both hung
  // off the same right edge so they stay aligned while the left edges step.
  // SPAD is the text inset: 1rem at the chart's natural size, where one user
  // unit is one pixel. It eats into the room the text has, so the widths below
  // are what clear the longest line in each (128.9px and 187.7px, measured) —
  // sequence-break is the tight one, ~4% headroom for platforms whose system
  // font runs wider than Segoe UI.
  // tx/sx override the default inset when a badge wants its two lines nudged
  // independently; omit them and both sit at SPAD.
  var SH = 34, SRIGHT = 610, SPAD = 28;
  function stamp(y, w, title, sub, tx, sx) {
    var x = SRIGHT - w;
    if (tx == null) tx = x + SPAD;
    if (sx == null) sx = x + SPAD;
    return '<g transform="rotate(-5 ' + (x + w / 2) + ' ' + (y + SH / 2) + ')">'
      + '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + SH + '" rx="6"'
      + ' fill="rgba(255,93,108,0.12)" stroke="rgba(255,93,108,0.55)" stroke-width="1.2"/>'
      + '<text x="' + tx + '" y="' + (y + 15) + '" fill="' + DANGER + '" font-size="12"'
      + ' font-weight="700" letter-spacing="0.09em">' + title + '</text>'
      + '<text x="' + sx + '" y="' + (y + 28) + '" fill="#c99aa2" font-size="10.5">' + sub + '</text>'
      + '</g>';
  }
  var stamps = stamp(86, 170, '⚠ DON’T LOG OUT', 'countdowns live in memory', 458, 460)
    + stamp(134, 224, '⚠ DON’T SEQUENCE BREAK', 'a different ★ level rerolls the countdown', 406, 406);

  // The reset arrow: land it on the 100% line, because that is literally where
  // a reset puts you — no progress, a fresh 1..cap draw.
  var ax = n1(X(cap * 0.7));
  var reset = '<line x1="' + ax + '" x2="' + ax + '" y1="242" y2="88" stroke="' + DANGER + '"'
    + ' stroke-width="1.6" stroke-dasharray="5 4" marker-end="url(#pity-arrow)" opacity="0.85"/>'
    + '<circle cx="' + ax + '" cy="242" r="3.5" fill="' + DANGER + '"/>'
    + '<text x="' + (ax + 10) + '" y="203" fill="' + DANGER + '" font-size="10.5"'
    + ' opacity="0.95">resets to a fresh 1–' + cap + ' roll</text>';

  var axis = who ? esc(who) + ' kills' : 'Kills';
  var alt = 'Chart: with pure luck, ' + Math.round(atCap * 100) + '% of players still have no '
    + (who ? esc(who) + ' trophy' : 'trophy') + ' after ' + cap + ' kills and ' + n1(atEnd * 100)
    + '% after ' + xmax + '. With the pity countdown, everyone has one by kill ' + cap
    + '. Two warnings are marked on the chart: logging out and switching star level both'
    + ' throw the countdown away and start a fresh one.';

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 68 640 302" width="640" height="302"'
    + ' font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"'
    + ' role="img" aria-label="' + alt + '" style="width:100%;max-width:640px;height:auto;display:block">'
    + '<defs>'
    + '<filter id="pity-glow" x="-20%" y="-20%" width="140%" height="140%">'
    + '<feGaussianBlur stdDeviation="2.6" result="b"/>'
    + '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
    + '<marker id="pity-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5.5"'
    + ' markerHeight="5.5" orient="auto-start-reverse">'
    + '<path d="M 0 1 L 8 5 L 0 9 z" fill="' + DANGER + '"/></marker>'
    + '</defs>'
    + grid + xlab
    + '<text x="340" y="362" text-anchor="middle" fill="#a9a9b8" font-size="12">' + axis + '</text>'
    + '<polygon points="' + pendArea + '" fill="#3987e5" fill-opacity="0.13"/>'
    + '<polygon points="' + tailArea + '" fill="#d95926" fill-opacity="0.20"/>'
    + '<g filter="url(#pity-glow)">'
    + '<polyline points="' + pts(luck) + '" fill="none" stroke="#d95926" stroke-width="2.5"'
    + ' stroke-dasharray="6 4" stroke-linejoin="round" stroke-linecap="round"/>'
    + '<polyline points="' + pts(pity) + '" fill="none" stroke="#3987e5" stroke-width="2.6"'
    + ' stroke-linejoin="round" stroke-linecap="round"/></g>'
    + stamps + reset
    + '<line x1="' + n1(X(cap)) + '" x2="' + n1(X(cap)) + '" y1="' + n1(yCap) + '" y2="316"'
    + ' stroke="#8a8a9e" stroke-dasharray="2 3"/>'
    + '<circle cx="' + n1(X(cap)) + '" cy="316" r="5" fill="#3987e5" stroke="#1e1e2e" stroke-width="2"/>'
    + '<text x="' + n1(X(cap)) + '" y="304" text-anchor="middle" fill="#eef" font-size="12"'
    + ' font-weight="600">Guaranteed by kill ' + cap + '</text>'
    + '<circle cx="' + n1(X(cap)) + '" cy="' + n1(yCap) + '" r="5" fill="#d95926" stroke="#1e1e2e" stroke-width="2"/>'
    + '<text x="' + n1(X(cap) + 10) + '" y="' + n1(yCap - 8) + '" fill="#e8e8ee" font-size="12">'
    + 'Pure luck: ' + Math.round(atCap * 100) + '% still waiting</text>'
    + '<circle cx="' + n1(X(xmax)) + '" cy="' + n1(yEnd) + '" r="5" fill="#d95926" stroke="#1e1e2e" stroke-width="2"/>'
    + '<text x="' + n1(X(xmax)) + '" y="' + n1(yEnd - 12) + '" text-anchor="end" fill="#a9a9b8"'
    + ' font-size="12">' + n1(atEnd * 100) + '% still waiting at ' + xmax + '</text>'
    + '</svg>';
}

function pityOptionHtml(pick, selCode) {
  var on = pick.code === selCode;
  return '<div class="vh-pity-optwrap spoiler-row sp-b' + pick.bi + '">'
    + '<div class="vh-pity-opt" role="option"'
    + ' aria-selected="' + (on ? 'true' : 'false') + '" tabindex="0"'
    + ' data-code="' + esc(pick.code) + '"'
    + ' onclick="window.__vhPityPick(&quot;' + esc(pick.code) + '&quot;)"'
    + ' onkeydown="window.__vhPityKey(event,&quot;' + esc(pick.code) + '&quot;)">'
    + '<img src="/api/icon/' + encodeURIComponent(pick.code) + '.png" alt="" draggable="false">'
    + '<span class="vh-pity-opt-name">' + esc(pick.creature) + '</span>'
    + '<span class="vh-pity-opt-meta">' + Math.round(pick.rate * 100) + '% · ' + esc(pick.biome)
    + ' · ' + pick.uses + (pick.uses === 1 ? ' recipe' : ' recipes') + '</span>'
    + '</div></div>';
}

function renderTrophyPityHtml() {
  var list = trophyPityList();
  if (!list.length) return '';
  // Gating mirrors the CSS: `data-spoiler="N"` reveals sp-b0 .. sp-b(N-1).
  // Default to the highest-ranked trophy the reader has actually reached, so
  // the button never names a creature the menu is hiding from them.
  var revealed = getRevealedCount();
  var sel = null;
  for (var i = 0; i < list.length; i++) {
    if (list[i].bi < revealed) { sel = list[i]; break; }
  }
  var opts = '';
  for (var j = 0; j < list.length; j++) opts += pityOptionHtml(list[j], sel ? sel.code : '');

  var legend = '<div class="vh-pity-legend">'
    + '<span class="vh-pity-key"><svg width="22" height="8" aria-hidden="true">'
    + '<line x1="0" y1="4" x2="22" y2="4" stroke="#d95926" stroke-width="2.5"'
    + ' stroke-dasharray="5 4"/></svg>Pure luck (no pity)</span>'
    + '<span class="vh-pity-key"><svg width="22" height="8" aria-hidden="true">'
    + '<line x1="0" y1="4" x2="22" y2="4" stroke="#3987e5" stroke-width="2.5"/></svg>'
    + 'Pity countdown (now)</span></div>';

  // The picker doubles as the chart's title and the legend sits opposite it, so
  // the whole thing reads as one panel: the svg draws no frame, heading or key.
  var head, note = '';
  if (sel) {
    head = '<div class="vh-pity-pick">'
      + '<button type="button" class="vh-pity-btn" id="vh-pity-btn" aria-haspopup="listbox"'
      + ' aria-expanded="false" title="Pick a different trophy" onclick="window.__vhPityToggle()">'
      + '<img src="/api/icon/' + encodeURIComponent(sel.code) + '.png" alt=""'
      + ' id="vh-pity-btn-img" class="vh-pity-trophy" draggable="false">'
      + '<span class="vh-pity-heading"><span id="vh-pity-btn-name">' + esc(sel.creature)
      + '</span> trophy</span>'
      + '<span class="vh-pity-btn-rate" id="vh-pity-btn-rate">'
      + Math.round(sel.rate * 100) + '% drop chance</span>'
      + '<span class="vh-pity-caret" aria-hidden="true">▾</span>'
      + '</button>'
      + '<div class="vh-pity-menu" id="vh-pity-menu" role="listbox" aria-label="Rare trophy" hidden>'
      + opts + '</div></div>' + legend;
  } else {
    // No trophy art here either — the icon alone would give the creature away.
    head = '<div class="vh-pity-pick">'
      + '<span class="vh-pity-heading vh-pity-heading-plain">Rare trophy</span>'
      + '<span class="vh-pity-btn-rate">10% drop chance</span></div>' + legend;
    // Outside the header row — it is a full-width notice, not a header item.
    note = '<div class="vh-pity-locked">🔒 Reach the Black Forest to pick a specific trophy.</div>';
  }

  return '<div class="vh-pity" id="vh-pity"><div class="vh-pity-head">' + head + '</div>' + note
    + '<div class="vh-pity-chart" id="vh-pity-chart">' + pityChartSvg(sel) + '</div>'
    + '</div>';
}

window.__vhPityToggle = function () {
  var menu = document.getElementById('vh-pity-menu');
  var btn = document.getElementById('vh-pity-btn');
  if (!menu || !btn) return;
  var open = menu.hidden;
  menu.hidden = !open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
};

window.__vhPityPick = function (code) {
  var list = trophyPityList(), pick = null;
  for (var i = 0; i < list.length; i++) if (list[i].code === code) pick = list[i];
  if (!pick) return;
  var chart = document.getElementById('vh-pity-chart');
  if (chart) chart.innerHTML = pityChartSvg(pick);
  var img = document.getElementById('vh-pity-btn-img');
  var nm = document.getElementById('vh-pity-btn-name');
  var rt = document.getElementById('vh-pity-btn-rate');
  if (img) img.src = '/api/icon/' + encodeURIComponent(pick.code) + '.png';
  if (nm) nm.textContent = pick.creature;
  if (rt) rt.textContent = Math.round(pick.rate * 100) + '% drop chance';
  var menu = document.getElementById('vh-pity-menu');
  if (menu) {
    var rows = menu.querySelectorAll('.vh-pity-opt');
    for (var r = 0; r < rows.length; r++) {
      rows[r].setAttribute('aria-selected', rows[r].getAttribute('data-code') === code ? 'true' : 'false');
    }
  }
  window.__vhPityToggle();
  var btn = document.getElementById('vh-pity-btn');
  if (btn) btn.focus();
};

window.__vhPityKey = function (e, code) {
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
    window.__vhPityPick(code);
  } else if (e.key === 'Escape') {
    window.__vhPityToggle();
    var btn = document.getElementById('vh-pity-btn');
    if (btn) btn.focus();
  }
};

// One document-level listener, not one per render: close the menu on an
// outside click or Escape.
if (typeof document !== 'undefined' && !window.__vhPityBound) {
  window.__vhPityBound = true;
  document.addEventListener('click', function (e) {
    var menu = document.getElementById('vh-pity-menu');
    if (!menu || menu.hidden) return;
    var wrap = document.getElementById('vh-pity');
    if (wrap && !wrap.contains(e.target)) window.__vhPityToggle();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var menu = document.getElementById('vh-pity-menu');
    if (menu && !menu.hidden) window.__vhPityToggle();
  });
}

export function renderSetInto(el: HTMLElement, slug: string) {
  el.innerHTML = renderSetPageHtml(slug);
}

export function renderMdToElement(md: string, el: HTMLElement) {
  var lines = md.split('\n');
  // While sheets are hidden, drop the heading that introduces one too —
  // every biome doc puts `{sheet:<biome>}` alone under `## At a glance`, and
  // the bare heading would otherwise read as a section that failed to load.
  if (SHEETS_HIDDEN) lines = dropEmptiedSheetHeadings(lines);
  var h = '';
  var inList = false;
  var inTable = false;
  var inSpoiler = false;
  var inRow = false;
  var inWarn = false;
  var rowCell = '';
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var trimmed = line.trim();
    // Image row fence: `:::row` … `:::` lays the <img> lines inside it out
    // side by side, stacking again on narrow screens. See `.vh-img-row`
    // in GuidesLayout.css. Nests inside a `:::biome` block fine — the
    // closing `:::` shuts the innermost fence first.
    // Callout fence: `:::warn` … `:::` boxes the content in an amber notice.
    // Body lines render normally, so paragraphs/lists/chips all work inside.
    if (trimmed.match(/^:::warn\b/i)) {
      if (inList) { h += '</ul>'; inList = false; }
      if (inTable) { h += '</table>'; inTable = false; }
      if (!inWarn) { h += '<div class="vh-callout" role="note">'; inWarn = true; }
      continue;
    }
    if (trimmed.match(/^:::row\b/i)) {
      if (inList) { h += '</ul>'; inList = false; }
      if (inTable) { h += '</table>'; inTable = false; }
      if (!inRow) { h += '<div class="vh-img-row">'; inRow = true; }
      continue;
    }
    // Spoiler fence: `:::biome <name>` … `:::` wraps content that stays hidden
    // (behind a lock bar) until the spoiler slider has revealed that biome.
    if (trimmed.match(/^:::biome\b/i)) {
      if (inList) { h += '</ul>'; inList = false; }
      if (inTable) { h += '</table>'; inTable = false; }
      var _bi = biomeIndex(trimmed.replace(/^:::biome/i, '').trim());
      if (_bi !== null) {
        if (inSpoiler) { h += '</div></div>'; }
        h += '<div class="spoiler-block sp-b' + _bi + '">'
           + '<div class="spoiler-lock" aria-hidden="true">🔒 ' + esc(biomeLabel(_bi)) + ' &mdash; keep playing to unlock</div>'
           + '<div class="spoiler-body">';
        inSpoiler = true;
      }
      continue;
    }
    if (trimmed === ':::') {
      if (inList) { h += '</ul>'; inList = false; }
      if (inTable) { h += '</table>'; inTable = false; }
      if (inRow) {
        if (rowCell) { h += '<div class="vh-img-cell">' + rowCell + '</div>'; rowCell = ''; }
        h += '</div>'; inRow = false;
      }
      else if (inWarn) { h += '</div>'; inWarn = false; }
      else if (inSpoiler) { h += '</div></div>'; inSpoiler = false; }
      continue;
    }
    // Inside a row, any non-image line becomes a caption above the next image.
    // Each image plus the captions collected before it is emitted as one cell,
    // so caption and image travel together when the row stacks on mobile.
    if (inRow) {
      if (trimmed.match(/^<img /)) {
        h += '<div class="vh-img-cell">' + rowCell + trimmed + '</div>';
        rowCell = '';
      } else if (trimmed) {
        rowCell += '<p class="vh-img-cap">' + mdInline(trimmed) + '</p>';
      }
      continue;
    }
    if (trimmed.match(/^\|/)) {
      if (inList) { h += '</ul>'; inList = false; }
      if (trimmed.match(/^\|[\s\-|:]+\|$/)) continue;
      if (!inTable) { h += '<table style="width:100%;border-collapse:collapse;font-size:12px;margin:8px 0">'; inTable = true; }
      // Row-level spoiler tag: a trailing `{biome:NAME}` gates just this row.
      var _rowCls = '';
      var _rowTag = trimmed.match(/\{biome:\s*([^}]+)\}/i);
      if (_rowTag) {
        trimmed = trimmed.replace(/\{biome:\s*[^}]+\}/i, '').trim();
        var _rbi = biomeIndex(_rowTag[1].trim());
        if (_rbi !== null) _rowCls = ' class="spoiler-row sp-b' + _rbi + '"';
      }
      var cells = trimmed.split('|').filter(function(_c, idx, arr) { return idx > 0 && idx < arr.length - 1; });
      var isHeader = i + 1 < lines.length && !!lines[i + 1].trim().match(/^\|[\s\-|:]+\|$/);
      var tag = isHeader ? 'th' : 'td';
      var style = isHeader ? 'color:#8cf;text-align:left;padding:4px 8px;border-bottom:1px solid #444' : 'color:#ccc;padding:3px 8px;border-bottom:1px solid #222';
      h += '<tr' + _rowCls + '>';
      cells.forEach(function(c) { h += '<' + tag + ' style="' + style + '">' + mdInline(c.trim()) + '</' + tag + '>'; });
      h += '</tr>';
      continue;
    }
    if (inTable) { h += '</table>'; inTable = false; }
    // `{sheet:<biome>}` is a block, not an inline chip — it must not land
    // inside a <p>, so it is handled here rather than in mdInline.
    var _sheet = trimmed.match(/^\{sheet:([^}]+)\}$/i);
    if (_sheet) {
      if (inList) { h += '</ul>'; inList = false; }
      h += renderBiomeSheetHtml(_sheet[1].trim());
      continue;
    }
    // `{trophypity}` is a block too: trophy picker + bad-luck-protection chart.
    if (trimmed.match(/^\{trophypity\}$/i)) {
      if (inList) { h += '</ul>'; inList = false; }
      h += renderTrophyPityHtml();
      continue;
    }
    // `{creaturetypes}` is a block too: the grouped trophy index.
    if (trimmed.match(/^\{creaturetypes\}$/i)) {
      if (inList) { h += '</ul>'; inList = false; }
      h += renderCreatureTypesHtml();
      continue;
    }
    // `{comfortcalc}` is a block too: the pick-per-category comfort calculator.
    if (trimmed.match(/^\{comfortcalc\}$/i)) {
      if (inList) { h += '</ul>'; inList = false; }
      h += renderComfortCalcHtml();
      continue;
    }
    if (trimmed.match(/^### /)) {
      if (inList) { h += '</ul>'; inList = false; }
      h += '<h4 id="' + slugify(trimmed.slice(4)) + '">' + esc(trimmed.slice(4)) + '</h4>';
    } else if (trimmed.match(/^## /)) {
      if (inList) { h += '</ul>'; inList = false; }
      h += '<h3 id="' + slugify(trimmed.slice(3)) + '">' + esc(trimmed.slice(3)) + '</h3>';
    } else if (trimmed.match(/^# /)) {
      if (inList) { h += '</ul>'; inList = false; }
      h += '<h2 id="' + slugify(trimmed.slice(2)) + '">' + esc(trimmed.slice(2)) + '</h2>';
    } else if (trimmed.match(/^\* /)) {
      if (!inList) { h += '<ul style="margin:4px 0;padding-left:20px;color:#ccc;font-size:13px;line-height:1.6">'; inList = true; }
      h += '<li>' + mdInline(trimmed.slice(2)) + '</li>';
    } else if (trimmed.match(/^<img /)) {
      if (inList) { h += '</ul>'; inList = false; }
      h += trimmed;
    } else if (trimmed === '') {
      if (inList) { h += '</ul>'; inList = false; }
    } else {
      if (inList) { h += '</ul>'; inList = false; }
      h += '<p style="color:#bbb;font-size:13px;line-height:1.6;margin:6px 0">' + mdInline(trimmed) + '</p>';
    }
  }
  if (inList) h += '</ul>';
  if (inTable) h += '</table>';
  if (inRow) {
    if (rowCell) h += '<div class="vh-img-cell">' + rowCell + '</div>';
    h += '</div>';
  }
  if (inWarn) h += '</div>';
  if (inSpoiler) h += '</div></div>';
  el.innerHTML = h;
}

export function renderListItemHTML(it: any, page: VhPageKey, maxStats: any): string {
  switch (page) {
    case 'craft': return renderCraftListItem(it, maxStats);
    case 'armor': return renderArmorListItem(it, maxStats);
    case 'food': return renderFoodListItem(it, maxStats);
    case 'bestiary': return renderBestiaryListItem(it, maxStats);
    case 'comfort': return renderComfortListItem(it, maxStats);
    default: return renderCraftListItem(it, maxStats);
  }
}

// ── Per-item detail markdown enhancement ───────────────────────────
// Each category has a single Markdown file. Sections are keyed to an
// item by an HTML comment containing the item code on the ### heading:
//   ### Iron Sword <!-- SwordIron -->
//   Notes here...
// ## headings are author-facing groupings and are not rendered on screen.

const itemDetailsCache: Record<string, Promise<Record<string, string>>> = {};

function parseItemDetails(md: string): Record<string, string> {
  const map: Record<string, string> = {};
  const lines = md.split('\n');
  let curCode: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (curCode) {
      const body = buf.join('\n').replace(/^\s+|\s+$/g, '');
      if (body) map[curCode] = body;
    }
    curCode = null;
    buf = [];
  };
  for (const raw of lines) {
    const m = /^###\s+.*?<!--\s*([A-Za-z0-9_\-]+)\s*-->/.exec(raw);
    if (m) { flush(); curCode = m[1]; continue; }
    if (curCode) {
      // New ## heading ends the current section
      if (/^##\s/.test(raw) && !/^###/.test(raw)) { flush(); continue; }
      buf.push(raw);
    }
  }
  flush();
  return map;
}

function loadItemDetails(docName: string): Promise<Record<string, string>> {
  const existing = itemDetailsCache[docName];
  if (existing) return existing;
  const p = fetch('/data/vh/docs/' + docName + '.md')
    .then(r => r.ok ? r.text() : '')
    .then(parseItemDetails)
    .catch(() => ({} as Record<string, string>));
  itemDetailsCache[docName] = p;
  return p;
}

export function pageToDetailsDoc(page: VhPageKey): string | null {
  switch (page) {
    case 'craft': return 'weapons_details';
    case 'armor': return 'gear_details';
    case 'comfort': return 'comfort_details';
    case 'bestiary': return 'bestiary_details';
    case 'food': return 'consumable_details';
    default: return null;
  }
}

export function invalidateItemDetails(page: VhPageKey) {
  const docName = pageToDetailsDoc(page);
  if (docName) delete itemDetailsCache[docName];
}

function injectItemDetailMd(detail: HTMLElement, code: string, page: VhPageKey) {
  const docName = pageToDetailsDoc(page);
  if (!docName) return;
  const placeholder = detail.querySelector('.detail-item-md') as HTMLElement | null;
  if (!placeholder || placeholder.getAttribute('data-code') !== code) return;
  loadItemDetails(docName).then(map => {
    // Bail if the user navigated away to a different item while we fetched
    const live = detail.querySelector('.detail-item-md') as HTMLElement | null;
    if (!live || live.getAttribute('data-code') !== code) return;
    const body = map[code];
    live.innerHTML = '';
    if (body) renderMdToElement(body, live);
  });
}

/** Renders the detail HTML into the given element (page's detail pane).
 *  Several ported detail renderers call document.getElementById('items-detail'),
 *  so we shim the element's id during the call. */
export function renderDetailInto(detail: HTMLElement, code: string, page: VhPageKey) {
  vhMobStop(); // stop any bestiary star-rotation from a previous selection
  detail.style.background = '';
  if (detail.parentElement) detail.parentElement.style.background = '';
  const prevId = detail.id;
  detail.id = 'items-detail';
  try {
    switch (page) {
      case 'craft': renderGenericDetail(code, detail); break;
      case 'armor': renderGenericDetail(code, detail); break;
      case 'food': renderFoodDetailFull(code); break;
      case 'bestiary': renderBestiaryDetailFull(code); break;
      case 'comfort': renderComfortDetailFull(code); break;
    }
  } finally {
    detail.id = prevId;
  }
  injectItemDetailMd(detail, code, page);
}
