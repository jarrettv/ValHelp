// Auto-ported from ValHelpTools vhcli/wwwroot/index.html (lines 427-479, 987-2167).
// Minimal adaptations: icon URLs rewritten to /data/vh/... and onclick handlers
// route through window.__vhItemClick / window.__vhToggleFav / window.__vhToggleSpd.
/* eslint-disable */
// @ts-nocheck

export type VhState = {
  allItems: any[] | null;
  craftItemsByCode: Record<string, any>;
  pageSelectedCode: string | null;
  pageMaxStats: any;
  craftFavorites: Record<string, true>;
  craftSpeedrun: Record<string, true>;
};

export const state: VhState = {
  allItems: null,
  craftItemsByCode: {},
  pageSelectedCode: null,
  pageMaxStats: null,
  craftFavorites: {},
  craftSpeedrun: {},
};

// Proxy the module-level globals the ported code expects
let allItems: any = null;
let craftItemsByCode: any = {};
let pageSelectedCode: any = null;
let pageMaxStats: any = null;
let craftFavorites: any = {};
let craftSpeedrun: any = {};

export function setState(s: Partial<VhState>) {
  Object.assign(state, s);
  allItems = state.allItems;
  craftItemsByCode = state.craftItemsByCode;
  pageSelectedCode = state.pageSelectedCode;
  pageMaxStats = state.pageMaxStats;
  craftFavorites = state.craftFavorites;
  craftSpeedrun = state.craftSpeedrun;
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

const COMFORT_GROUP_ORDER = ['Fire', 'Bed', 'Seating', 'Table', 'Carpet', 'Banner', 'Standalone'];
const COMFORT_GROUP_DESC = {
  Fire: 'Must be lit for comfort bonus.',
  Bed: 'Sets spawn point when you sleep.',
  Seating: 'Only the highest comfort chair counts.',
  Table: 'Only the highest comfort table counts.',
  Carpet: 'All rugs give the same comfort. Only one counts.',
  Banner: 'All banners give the same comfort. Only one counts.',
  Standalone: 'All standalone items stack with each other.',
};
const COMFORT_SEASONAL = { 'piece_maypole': 'Midsommar', 'piece_xmastree': 'Yule' };
const COMFORT_HIDDEN = { 'piece_barber': true, 'piece_blackwood_bench': true };

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
    ? '<img src="/data/vh/icons/' + encodeURIComponent(it.code) + '.png" alt="" draggable="false">'
    : '<div class="craft-item-icon-placeholder"></div>';
  var h = '<div class="craft-item' + sel + badgeBgClass(it.code) + '" data-code="' + esc(it.code) + '" onclick="selectPageItem(\'' + esc(it.code) + '\')">';
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
    if (resItem && resItem.hasIcon) h += '<img src="/data/vh/icons/' + encodeURIComponent(res.item) + '.png" style="width:14px;height:14px;image-rendering:pixelated">';
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
    ? '<img src="/data/vh/icons/' + encodeURIComponent(it.code) + '.png" alt="" draggable="false">'
    : '<div class="craft-item-icon-placeholder"></div>';
  var h = '<div class="craft-item' + sel + badgeBgClass(it.code) + '" data-code="' + esc(it.code) + '" onclick="selectPageItem(\'' + esc(it.code) + '\')">';
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
    ? '<img src="/data/vh/icons/' + encodeURIComponent(displayIcon) + '.png" alt="" draggable="false" style="width:32px;height:32px;image-rendering:pixelated;flex-shrink:0">'
    : '<div class="craft-item-icon-placeholder"></div>';
  var displayName = paired ? paired.name : it.name;
  var h = '<div class="craft-item' + sel + badgeBgClass(it.code) + '" data-code="' + esc(it.code) + '" onclick="selectPageItem(\'' + esc(it.code) + '\')">';
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
    ? '<img src="/data/vh/icons/' + encodeURIComponent(it.code) + '.png" alt="" draggable="false">'
    : '<div class="craft-item-icon-placeholder"></div>';
  var h = '<div class="craft-item' + sel + badgeBgClass(it.code) + '" data-code="' + esc(it.code) + '" onclick="selectPageItem(\'' + esc(it.code) + '\')">';
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
    ? '<img src="/data/vh/icons/' + encodeURIComponent(it.code) + '.png" alt="" draggable="false">'
    : '<div class="craft-item-icon-placeholder"></div>';
  var td = it.trophyDrop;
  var hp = td.hp || '?';
  var h = '<div class="craft-item' + sel + badgeBgClass(it.code) + '" data-code="' + esc(it.code) + '" onclick="selectPageItem(\'' + esc(it.code) + '\')">';
  h += '<div class="craft-item-badge">';
  if (craftFavorites[it.code]) h += ICON_STAR;
  if (craftSpeedrun[it.code]) h += ICON_RUNNER;
  h += '</div>';
  h += iconHtml;
  h += '<div class="craft-item-info"><div class="craft-item-name">' + esc(td.creature || it.name || it.code) + '</div>';
  h += '<div style="display:flex;gap:6px;align-items:center;font-size:11px;flex-wrap:wrap">';
  h += '<span style="color:#c55;font-weight:bold">' + hp + ' HP</span>';
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
    ? '<img src="/data/vh/icons/' + encodeURIComponent(it.code) + '.png" alt="" draggable="false">'
    : '<div class="craft-item-icon-placeholder"></div>';
  var h = '<div class="craft-item' + sel + badgeBgClass(it.code) + '" data-code="' + esc(it.code) + '" onclick="selectPageItem(\'' + esc(it.code) + '\')">';
  h += '<div class="craft-item-badge">';
  if (craftFavorites[it.code]) h += ICON_STAR;
  if (craftSpeedrun[it.code]) h += ICON_RUNNER;
  h += '</div>';
  h += iconHtml;
  h += '<div class="craft-item-info"><div class="craft-item-name">' + esc(it.name || it.code) + '</div>';
  h += '<div style="display:flex;align-items:center;gap:4px">';
  h += '<span style="color:#8cf;font-weight:bold;font-size:12px">+' + it.comfort + '</span>';
  h += '<span class="craft-item-cat" style="margin:0">' + esc(it.comfortGroup || '') + '</span>';
  if (COMFORT_SEASONAL[it.code]) h += '<span class="comfort-tag seasonal">' + COMFORT_SEASONAL[it.code] + '</span>';
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
  if (it.hasIcon) h += '<img class="detail-icon" src="/data/vh/icons/' + encodeURIComponent(it.code) + '.png" alt="">';
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
  if (COMFORT_SEASONAL[it.code]) h += '<div class="detail-stat-row"><span class="label">Availability</span><span class="val"><span class="comfort-tag seasonal">' + COMFORT_SEASONAL[it.code] + '</span></span></div>';
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

  // Header with icon and creature name
  h += '<div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">';
  if (it.hasIcon) h += '<img src="/data/vh/icons/' + encodeURIComponent(it.code) + '.png" style="width:64px;height:64px;image-rendering:pixelated">';
  h += '<div>';
  h += '<div style="font-size:22px;font-weight:bold;color:#fff">' + esc(td.creature || it.name || it.code) + '</div>';
  var tags = [];
  if (td.biome) tags.push(td.biome);
  if (td.boss) tags.push('Boss');
  if (td.flying) tags.push('Flying');
  if (td.tameable) tags.push('Tameable');
  h += '<div style="font-size:12px;color:#888">' + tags.join(' · ') + '</div>';
  h += '</div></div>';

  // Stat cards row
  h += '<div style="display:flex;gap:8px;margin:8px 0;flex-wrap:wrap">';
  if (td.hp) h += '<div class="food-stat hp"><div class="fs-val">' + td.hp + '</div><div class="fs-label">HP</div></div>';
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

  // Star scaling info
  if (td.hp && !td.boss) {
    h += '<div style="display:flex;gap:16px;margin:8px 0;font-size:11px;color:#888">';
    h += '<span>0★ ' + td.hp + ' HP</span>';
    h += '<span style="color:#aaa">1★ ' + (td.hp * 2) + ' HP</span>';
    h += '<span style="color:#ca0">2★ ' + (td.hp * 3) + ' HP</span>';
    h += '</div>';
  }

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
      var dIcon = d.code ? '<img src="/data/vh/icons/' + encodeURIComponent(d.code) + '.png" style="width:20px;height:20px;image-rendering:pixelated;vertical-align:middle" onerror="this.style.display=\'none\'">' : '';
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
}

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
      if (meadBase.hasIcon) hm += '<img src="/data/vh/icons/' + encodeURIComponent(meadBase.code) + '.png" style="width:24px;height:24px;image-rendering:pixelated">';
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
  if (source.hasIcon) h += '<img src="/data/vh/icons/' + encodeURIComponent(sourceCode) + '.png" style="width:32px;height:32px;image-rendering:pixelated">';
  h += '<div><div style="color:#fff;font-size:13px;font-weight:bold">' + esc(source.name || sourceCode) + '</div>';
  var stationLabel = (it.subcategory === 'IronCooking') ? 'Iron Cooking Station' : (it.subcategory === 'CookingStation' ? 'Cooking Station' : 'Prep Table \u2192 Stone Oven');
  h += '<div style="color:#888;font-size:11px">' + esc(stationLabel) + '</div></div></div>';
  if (source.recipe && source.recipe.resources) {
    h += renderRecipeCards(source);
  } else {
    h += '<div class="recipe-cards">';
    h += '<div class="recipe-card">';
    h += '<div class="recipe-card-name" style="font-size:' + scaleFontSize(source.name || sourceCode, 52) + 'px">' + esc(source.name || sourceCode) + '</div>';
    if (source.hasIcon) h += '<img src="/data/vh/icons/' + encodeURIComponent(sourceCode) + '.png" alt="">';
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
    if (paired.hasIcon) h += '<img src="/data/vh/icons/' + encodeURIComponent(paired.code) + '.png" style="width:32px;height:32px;image-rendering:pixelated">';
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
    h += '<div class="recipe-station-name">' + esc(stationItem ? stationItem.name : r.station) + '</div></div>';
  }
  (r.resources || []).forEach(function(res) {
    var resItem = craftItemsByCode[res.item];
    var resName = resItem ? (resItem.name || res.item) : res.item;
    var resHasIcon = resItem && resItem.hasIcon;
    h += '<div class="recipe-card">';
    h += '<div class="recipe-card-name" style="font-size:' + scaleFontSize(resName, 52) + 'px">' + esc(resName) + '</div>';
    if (resHasIcon) h += '<img src="/data/vh/icons/' + encodeURIComponent(res.item) + '.png" alt="">';
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
      if (resHasIcon) h += '<img src="/data/vh/icons/' + encodeURIComponent(res.item) + '.png" style="width:24px;height:24px;image-rendering:pixelated">';
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
  if (station.hasIcon) h += '<img src="/data/vh/icons/' + encodeURIComponent(stationCode) + '.png" style="width:32px;height:32px;image-rendering:pixelated">';
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
  if (it.hasIcon) h += '<img class="detail-icon" src="/data/vh/icons/' + encodeURIComponent(it.code) + '.png" alt="">';
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
  var iconHtml = hasIcon ? '<img src="/data/vh/icons/' + encodeURIComponent(code) + '.png" style="width:16px;height:16px;image-rendering:pixelated;vertical-align:middle">' : '';

  if (kind === 'icon2x') {
    var bigIcon = hasIcon ? '<img src="/data/vh/icons/' + encodeURIComponent(code) + '.png" style="width:32px;height:32px;image-rendering:pixelated;vertical-align:middle">' : '';
    return '<span class="md-item" title="' + esc(displayName) + '" style="display:inline-flex;align-items:center;vertical-align:middle">' + bigIcon + '</span>';
  }
  if (kind === 'icon') {
    return '<span class="md-item" title="' + esc(displayName) + '" style="display:inline-flex;align-items:center;vertical-align:middle">' + iconHtml + '</span>';
  }
  if (kind === 'link') {
    var linkLabel = value || displayName;
    var linkClick = it ? ' onclick="selectPageItem(\'' + code.replace(/'/g, "\\'") + '\')"' : '';
    return '<span class="md-item-link" title="' + esc(displayName) + '"' + linkClick
      + ' style="display:inline-flex;align-items:center;gap:3px;vertical-align:middle;color:#88bbff;text-decoration:underline;cursor:' + (it ? 'pointer' : 'default') + '">'
      + iconHtml + '<span>' + esc(linkLabel) + '</span></span>';
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

export function renderMdToElement(md: string, el: HTMLElement) {
  var lines = md.split('\n');
  var h = '';
  var inList = false;
  var inTable = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var trimmed = line.trim();
    if (trimmed.match(/^\|/)) {
      if (inList) { h += '</ul>'; inList = false; }
      if (trimmed.match(/^\|[\s\-|:]+\|$/)) continue;
      if (!inTable) { h += '<table style="width:100%;border-collapse:collapse;font-size:12px;margin:8px 0">'; inTable = true; }
      var cells = trimmed.split('|').filter(function(_c, idx, arr) { return idx > 0 && idx < arr.length - 1; });
      var isHeader = i + 1 < lines.length && !!lines[i + 1].trim().match(/^\|[\s\-|:]+\|$/);
      var tag = isHeader ? 'th' : 'td';
      var style = isHeader ? 'color:#8cf;text-align:left;padding:4px 8px;border-bottom:1px solid #444' : 'color:#ccc;padding:3px 8px;border-bottom:1px solid #222';
      h += '<tr>';
      cells.forEach(function(c) { h += '<' + tag + ' style="' + style + '">' + mdInline(c.trim()) + '</' + tag + '>'; });
      h += '</tr>';
      continue;
    }
    if (inTable) { h += '</table>'; inTable = false; }
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
