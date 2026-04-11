// vector-map.js — WebGL vector map renderer
// Parses BVEC binary → triangle-fan GPU buffers → stencil-based polygon fill + GL_LINES contours.
// Forest overlay uses the actual tiled forest texture sampled on the GPU.
// Pan/zoom updates a projection matrix uniform — GPU renders everything in <1ms.

(function() {
'use strict';

var gl;
var canvas;
var gridSize = 1024;
var _ready = false;

// ── Flat-color shader ────────────────────────────────────────────────
var prog;
var u_mvp, u_color;
var a_pos;

// ── Forest texture shader ────────────────────────────────────────────
var forestProg;
var fu_mvp, fu_forestTex, fu_maskTex, fu_gridSize, fu_tileScale;
var fa_pos;

// ── Fog shader ───────────────────────────────────────────────────────
var fogProg;
var fogu_mvp, fogu_fogTex, fogu_opacity, fogu_gridSize;
var foga_pos;

// ── Textures ─────────────────────────────────────────────────────────
var forestTex = null;  // tiled forest pattern
var maskTex = null;    // forestMaskTexCache (R=forest, G=mist, B=lava)
var fogTex = null;     // fog of war overlay (alpha = fogged)
var _texturesReady = false;
var _fogOpacity = 1.0;

// GPU buffers
var fillLayers = [];
var contourLayers = [];
var quadVBO;      // grid-space quad for stencil color pass
var mapQuadVBO;   // exact [0,gridSize] quad for textured forest

// ── Shader sources ───────────────────────────────────────────────────

var VERT_SRC = [
  'attribute vec2 a_pos;',
  'uniform mat3 u_mvp;',
  'void main() {',
  '  vec2 p = (u_mvp * vec3(a_pos, 1.0)).xy;',
  '  gl_Position = vec4(p, 0.0, 1.0);',
  '}'
].join('\n');

var FRAG_SRC = [
  'precision mediump float;',
  'uniform vec4 u_color;',
  'void main() {',
  '  gl_FragColor = u_color;',
  '}'
].join('\n');

// Forest texture shader — samples tiled forest tex modulated by mask density
var FOREST_VERT_SRC = [
  'precision mediump float;',
  'attribute vec2 a_pos;',
  'uniform mat3 u_mvp;',
  'uniform float u_gridSize;',
  'varying vec2 v_uv;',
  'varying vec2 v_gridPos;',
  'void main() {',
  '  vec2 p = (u_mvp * vec3(a_pos, 1.0)).xy;',
  '  gl_Position = vec4(p, 0.0, 1.0);',
  '  v_uv = a_pos / u_gridSize;',
  '  v_gridPos = a_pos;',
  '}'
].join('\n');

var FOREST_FRAG_SRC = [
  'precision mediump float;',
  'uniform sampler2D u_forestTex;',
  'uniform sampler2D u_maskTex;',
  'uniform float u_tileScale;',
  'uniform float u_gridSize;',
  'varying vec2 v_uv;',
  'varying vec2 v_gridPos;',
  'void main() {',
  // Sample mask: R = forest density
  '  float density = texture2D(u_maskTex, v_uv).r;',
  '  if (density < 0.01) discard;',
  // Sample tiled forest texture
  '  vec2 tileUV = v_gridPos / u_gridSize * u_tileScale;',
  '  vec4 fSample = texture2D(u_forestTex, tileUV);',
  // Luminance from forest texture (use max channel like topo renderer)
  '  float fLum = max(max(fSample.r, fSample.g), fSample.b);',
  // Posterize to 8 levels (matches topo renderer)
  '  fLum = floor(fLum * 7.0 + 0.5) / 7.0;',
  // Forest color (0.919, 0.822, 0.676) * 0.8
  '  vec3 forestColor = vec3(0.7352, 0.6576, 0.5408) * fLum;',
  // Blend factor: density * texAlpha * 0.5 (matches topo renderer)
  '  float blend = density * fSample.a * 0.5;',
  '  gl_FragColor = vec4(forestColor, blend);',
  '}'
].join('\n');

// Fog shader — draws dark overlay using fog texture alpha
var FOG_VERT_SRC = [
  'precision mediump float;',
  'attribute vec2 a_pos;',
  'uniform mat3 u_mvp;',
  'uniform float u_gridSize;',
  'varying vec2 v_uv;',
  'void main() {',
  '  vec2 p = (u_mvp * vec3(a_pos, 1.0)).xy;',
  '  gl_Position = vec4(p, 0.0, 1.0);',
  '  v_uv = a_pos / u_gridSize;',
  '}'
].join('\n');

var FOG_FRAG_SRC = [
  'precision mediump float;',
  'uniform sampler2D u_fogTex;',
  'uniform float u_opacity;',
  'uniform float u_gridSize;',
  'varying vec2 v_uv;',
  'void main() {',
  '  float center = texture2D(u_fogTex, v_uv).a;',
  // If this pixel is explored (alpha ~0), keep it fully clear
  '  if (center < 0.5) discard;',
  // Sample neighbours to detect fog edge — soften only on the fog side
  '  float texel = 1.0 / u_gridSize;',
  '  float n1 = texture2D(u_fogTex, v_uv + vec2(texel * 3.0, 0.0)).a;',
  '  float n2 = texture2D(u_fogTex, v_uv + vec2(-texel * 3.0, 0.0)).a;',
  '  float n3 = texture2D(u_fogTex, v_uv + vec2(0.0, texel * 3.0)).a;',
  '  float n4 = texture2D(u_fogTex, v_uv + vec2(0.0, -texel * 3.0)).a;',
  '  float neighbours = (n1 + n2 + n3 + n4) * 0.25;',
  // Edge fog pixels (near explored boundary) get reduced alpha for soft fade
  '  float edge = smoothstep(0.3, 1.0, neighbours);',
  '  gl_FragColor = vec4(0.0, 0.0, 0.0, edge * u_opacity);',
  '}'
].join('\n');

// ── Type constants ───────────────────────────────────────────────────

var TYPE_NAMES = ['depth', 'land', 'elevation', 'biome', 'forest', 'mist', 'lava'];
var COORD_SCALE = 32;
var EVENODD_TYPES = { biome: true, land: true, elevation: true };
var OVERLAY_ALPHA = { mist: 0.6, lava: 0.5 };
// forest no longer here — rendered with texture shader

// ── Public API ───────────────────────────────────────────────────────

function init(canvasEl, worldName, baseUrl) {
  canvas = canvasEl;

  gl = canvas.getContext('webgl', { stencil: true, antialias: false, alpha: false });
  if (!gl) return Promise.reject(new Error('WebGL not available'));

  if (!initShaders()) return Promise.reject(new Error('Shader compilation failed'));
  initQuad();

  var base = baseUrl || ('/api/map-data/' + encodeURIComponent(worldName));

  // Fetch binary geometry + textures in parallel
  var biomesP = fetch(base + '/biomes?v=9')
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); });

  var forestP = loadImage(base + '/forest');
  var maskP = loadImage(base + '/mask');

  return Promise.all([biomesP, forestP, maskP])
    .then(function(results) {
      var buf = results[0];
      var forestImg = results[1];
      var maskImg = results[2];

      return parseBinaryAuto(buf).then(function(data) {
        return { data: data, forestImg: forestImg, maskImg: maskImg, bufSize: buf.byteLength };
      });
    })
    .then(function(r) {
      var data = r.data, forestImg = r.forestImg, maskImg = r.maskImg;
      buildGPUBuffers(data);

      // Upload textures
      if (forestImg) {
        forestTex = createTexture(forestImg, true);  // tiled → repeat wrap
        console.log('[VectorMap] forest texture: ' + forestImg.width + 'x' + forestImg.height);
      }
      if (maskImg) {
        maskTex = createTexture(maskImg, false);  // mask → clamp
        console.log('[VectorMap] mask texture: ' + maskImg.width + 'x' + maskImg.height);
      }
      _texturesReady = !!(forestTex && maskTex);

      // Build the exact map quad now that gridSize is known
      initMapQuad();

      _ready = true;

      var typeCounts = {};
      fillLayers.forEach(function(l) { typeCounts[l.type] = (typeCounts[l.type] || 0) + 1; });
      console.log('[VectorMap/WebGL] ' + fillLayers.length + ' fill layers, ' +
        contourLayers.length + ' contour levels, grid=' + gridSize,
        'types:', JSON.stringify(typeCounts),
        'textures:', _texturesReady ? 'ready' : 'unavailable',
        'binary: ' + (r.bufSize / 1024).toFixed(0) + 'KB');
    });
}

function render(viewScale, panX, panY, canvasW, canvasH) {
  if (!_ready || !gl) return;

  var dpr = window.devicePixelRatio || 1;
  var pw = Math.round(canvasW * dpr);
  var ph = Math.round(canvasH * dpr);

  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }

  gl.viewport(0, 0, pw, ph);

  // Build orthographic projection: grid coords → clip space
  var sx = 2.0 * viewScale * dpr / pw;
  var sy = 2.0 * viewScale * dpr / ph;
  var tx = 2.0 * panX * dpr / pw - 1.0;
  var ty = -(2.0 * panY * dpr / ph - 1.0);
  sy = -sy;

  var mvp = new Float32Array([sx, 0, 0,  0, sy, 0,  tx, ty, 1]);

  // Clear to ocean background
  gl.clearColor(0x12/255, 0x2e/255, 0x4e/255, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST);

  // ── Fill layers (stencil-based) ──────────────────────────────────
  gl.useProgram(prog);
  gl.uniformMatrix3fv(u_mvp, false, mvp);
  gl.enable(gl.STENCIL_TEST);
  gl.enableVertexAttribArray(a_pos);

  for (var i = 0; i < fillLayers.length; i++) {
    var layer = fillLayers[i];

    // Skip forest — rendered with texture shader below
    if (layer.type === 'forest') continue;

    var evenodd = EVENODD_TYPES[layer.type] || false;
    var alpha = OVERLAY_ALPHA[layer.type];
    var a = alpha !== undefined ? alpha : 1.0;

    // Pass 1: write stencil (no color)
    gl.colorMask(false, false, false, false);
    gl.stencilFunc(gl.ALWAYS, 0, 0xFF);

    if (evenodd) {
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
    } else {
      gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP);
      gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, layer.vbo);
    gl.vertexAttribPointer(a_pos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, layer.ibo);
    gl.drawElements(gl.TRIANGLES, layer.indexCount, layer.indexType, 0);

    // Pass 2: fill color where stencil != 0
    gl.colorMask(true, true, true, true);
    if (evenodd) {
      gl.stencilFunc(gl.NOTEQUAL, 0, 0x01);
    } else {
      gl.stencilFunc(gl.NOTEQUAL, 0, 0xFF);
    }
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);

    if (a < 1.0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    gl.uniform4f(u_color, layer.r, layer.g, layer.b, a);

    gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
    gl.vertexAttribPointer(a_pos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    if (a < 1.0) gl.disable(gl.BLEND);

    gl.clear(gl.STENCIL_BUFFER_BIT);
  }

  gl.disable(gl.STENCIL_TEST);

  // ── Forest texture overlay ────────────────────────────────────────
  if (_texturesReady) {
    gl.useProgram(forestProg);
    gl.uniformMatrix3fv(fu_mvp, false, mvp);
    gl.uniform1f(fu_gridSize, gridSize);
    gl.uniform1f(fu_tileScale, 150.0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, forestTex);
    gl.uniform1i(fu_forestTex, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.uniform1i(fu_maskTex, 1);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.enableVertexAttribArray(fa_pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, mapQuadVBO);
    gl.vertexAttribPointer(fa_pos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(fa_pos);

    gl.disable(gl.BLEND);
  } else {
    // Fallback: draw forest as flat stencil fill if textures unavailable
    renderForestFallback(mvp);
  }

  // ── Contour lines ────────────────────────────────────────────────
  gl.useProgram(prog);
  gl.uniformMatrix3fv(u_mvp, false, mvp);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.enableVertexAttribArray(a_pos);

  for (var ci = 0; ci < contourLayers.length; ci++) {
    var c = contourLayers[ci];
    gl.uniform4f(u_color, 0, 0, 0, c.major ? 0.40 : 0.18);
    gl.bindBuffer(gl.ARRAY_BUFFER, c.vbo);
    gl.vertexAttribPointer(a_pos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.LINES, 0, c.vertexCount);
  }

  gl.disable(gl.BLEND);
  gl.disableVertexAttribArray(a_pos);

  // ── Fog of war overlay ──────────────────────────────────────────
  if (fogTex && _fogOpacity > 0) {
    gl.useProgram(fogProg);
    gl.uniformMatrix3fv(fogu_mvp, false, mvp);
    gl.uniform1f(fogu_gridSize, gridSize);
    gl.uniform1f(fogu_opacity, _fogOpacity);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fogTex);
    gl.uniform1i(fogu_fogTex, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.enableVertexAttribArray(foga_pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, mapQuadVBO);
    gl.vertexAttribPointer(foga_pos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(foga_pos);

    gl.disable(gl.BLEND);
  }
}

// Flat-color forest fallback when textures aren't loaded
function renderForestFallback(mvp) {
  gl.useProgram(prog);
  gl.uniformMatrix3fv(u_mvp, false, mvp);
  gl.enable(gl.STENCIL_TEST);
  gl.enableVertexAttribArray(a_pos);

  for (var i = 0; i < fillLayers.length; i++) {
    var layer = fillLayers[i];
    if (layer.type !== 'forest') continue;

    gl.colorMask(false, false, false, false);
    gl.stencilFunc(gl.ALWAYS, 0, 0xFF);
    gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP);
    gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);

    gl.bindBuffer(gl.ARRAY_BUFFER, layer.vbo);
    gl.vertexAttribPointer(a_pos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, layer.ibo);
    gl.drawElements(gl.TRIANGLES, layer.indexCount, layer.indexType, 0);

    gl.colorMask(true, true, true, true);
    gl.stencilFunc(gl.NOTEQUAL, 0, 0xFF);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform4f(u_color, layer.r, layer.g, layer.b, 0.4);

    gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
    gl.vertexAttribPointer(a_pos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.disable(gl.BLEND);
    gl.clear(gl.STENCIL_BUFFER_BIT);
  }

  gl.disable(gl.STENCIL_TEST);
  gl.disableVertexAttribArray(a_pos);
}

function getGridSize() { return gridSize; }

function destroy() {
  _ready = false;
  _texturesReady = false;
  for (var i = 0; i < fillLayers.length; i++) {
    if (gl) { gl.deleteBuffer(fillLayers[i].vbo); gl.deleteBuffer(fillLayers[i].ibo); }
  }
  for (var i = 0; i < contourLayers.length; i++) {
    if (gl) gl.deleteBuffer(contourLayers[i].vbo);
  }
  if (gl) {
    if (quadVBO) gl.deleteBuffer(quadVBO);
    if (mapQuadVBO) gl.deleteBuffer(mapQuadVBO);
    if (forestTex) gl.deleteTexture(forestTex);
    if (maskTex) gl.deleteTexture(maskTex);
    if (fogTex) gl.deleteTexture(fogTex);
    if (prog) gl.deleteProgram(prog);
    if (forestProg) gl.deleteProgram(forestProg);
    if (fogProg) gl.deleteProgram(fogProg);
  }
  fillLayers = [];
  contourLayers = [];
  quadVBO = null;
  mapQuadVBO = null;
  forestTex = null;
  maskTex = null;
  fogTex = null;
  _fogOpacity = 1.0;
  prog = null;
  forestProg = null;
  fogProg = null;
  gl = null;
}

// Set fog of war from an <img> element. Pass null to clear.
function setFog(imgEl, opacity) {
  _fogOpacity = (opacity !== undefined) ? opacity : 1.0;
  if (!gl) return;

  if (!imgEl) {
    if (fogTex) { gl.deleteTexture(fogTex); fogTex = null; }
    return;
  }

  if (fogTex) gl.deleteTexture(fogTex);
  fogTex = createTexture(imgEl, false);
  console.log('[VectorMap] fog texture loaded, opacity=' + _fogOpacity);
}

function setFogOpacity(opacity) {
  _fogOpacity = opacity;
}

// initFromData — same as init() but accepts pre-parsed data (same shape as parseBinary output)
// + texture images, instead of fetching from URLs. All rendering code is identical.
// data = { layers: [{ type: 'biome'|'land'|..., r, g, b, polygons: [Float32Array, ...] }, ...],
//          contours: [{ major: bool, lines: [Float32Array, ...] }, ...] }
function initFromData(canvasEl, data, forestImg, maskImg) {
  canvas = canvasEl;

  gl = canvas.getContext('webgl', { stencil: true, antialias: false, alpha: false });
  if (!gl) throw new Error('WebGL not available');

  if (!initShaders()) throw new Error('Shader compilation failed');
  initQuad();

  gridSize = data.gridSize || 512;
  buildGPUBuffers(data);

  if (forestImg) {
    forestTex = createTexture(forestImg, true);
  }
  if (maskImg) {
    maskTex = createTexture(maskImg, false);
  }
  _texturesReady = !!(forestTex && maskTex);

  initMapQuad();
  _ready = true;
}

window.VectorMap = {
  init: init,
  initFromData: initFromData,
  render: render,
  getGridSize: getGridSize,
  setFog: setFog,
  setFogOpacity: setFogOpacity,
  destroy: destroy,
  get ready() { return _ready; }
};

// ── Shader compilation ───────────────────────────────────────────────

function initShaders() {
  // Flat-color program
  prog = linkProgram(VERT_SRC, FRAG_SRC);
  if (!prog) return false;
  u_mvp = gl.getUniformLocation(prog, 'u_mvp');
  u_color = gl.getUniformLocation(prog, 'u_color');
  a_pos = gl.getAttribLocation(prog, 'a_pos');

  // Forest texture program
  forestProg = linkProgram(FOREST_VERT_SRC, FOREST_FRAG_SRC);
  if (!forestProg) return false;
  fu_mvp = gl.getUniformLocation(forestProg, 'u_mvp');
  fu_forestTex = gl.getUniformLocation(forestProg, 'u_forestTex');
  fu_maskTex = gl.getUniformLocation(forestProg, 'u_maskTex');
  fu_gridSize = gl.getUniformLocation(forestProg, 'u_gridSize');
  fu_tileScale = gl.getUniformLocation(forestProg, 'u_tileScale');
  fa_pos = gl.getAttribLocation(forestProg, 'a_pos');

  // Fog program
  fogProg = linkProgram(FOG_VERT_SRC, FOG_FRAG_SRC);
  if (!fogProg) return false;
  fogu_mvp = gl.getUniformLocation(fogProg, 'u_mvp');
  fogu_fogTex = gl.getUniformLocation(fogProg, 'u_fogTex');
  fogu_opacity = gl.getUniformLocation(fogProg, 'u_opacity');
  fogu_gridSize = gl.getUniformLocation(fogProg, 'u_gridSize');
  foga_pos = gl.getAttribLocation(fogProg, 'a_pos');

  return true;
}

function linkProgram(vSrc, fSrc) {
  var vs = compileShader(gl.VERTEX_SHADER, vSrc);
  var fs = compileShader(gl.FRAGMENT_SHADER, fSrc);
  if (!vs || !fs) return null;

  var p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error('[VectorMap] program link:', gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

function compileShader(type, src) {
  var s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('[VectorMap] shader:', gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

// ── Quad buffers ─────────────────────────────────────────────────────

function initQuad() {
  // Large grid-space quad for stencil color passes (oversized to cover any pan)
  quadVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-512,-512, 4096,-512, -512,4096, 4096,4096]), gl.STATIC_DRAW);
}

function initMapQuad() {
  // Exact [0, gridSize] quad for textured forest overlay
  var g = gridSize;
  mapQuadVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, mapQuadVBO);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0, g,0, 0,g, g,g]), gl.STATIC_DRAW);
}

// ── Texture loading ──────────────────────────────────────────────────

function loadImage(url) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() { resolve(img); };
    img.onerror = function() {
      console.warn('[VectorMap] failed to load texture:', url);
      resolve(null);
    };
    img.src = url;
  });
}

function createTexture(img, repeat) {
  var tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

  // Forest texture needs repeat wrap for tiling; mask needs clamp
  if (repeat && isPowerOf2(img.width) && isPowerOf2(img.height)) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  return tex;
}

function isPowerOf2(v) { return (v & (v - 1)) === 0 && v > 0; }

// ── Binary parsing ───────────────────────────────────────────────────

// Auto-detect v2 vs v3 format and parse accordingly.
// v2 is synchronous, v3 is async (DecompressionStream). Always returns a Promise.
function parseBinaryAuto(buf) {
  var dv = new DataView(buf);
  var version = dv.getUint8(4);
  if (version === 3) return parseBinaryV3(buf);
  return Promise.resolve(parseBinary(buf));
}

// ── v3: delta-encoded + deflate-raw ─────────────────────────────────

function parseBinaryV3(buf) {
  var dv = new DataView(buf);
  var off = 5; // skip magic + version
  var uncompressedSize = dv.getUint32(off, true); off += 4;

  var compressed = new Uint8Array(buf, off);
  return inflateRaw(compressed).then(function(inner) {
    return decodeDelta(inner);
  });
}

function inflateRaw(compressed) {
  var ds = new DecompressionStream('deflate-raw');
  var writer = ds.writable.getWriter();
  writer.write(compressed);
  writer.close();
  var reader = ds.readable.getReader();
  var chunks = [], totalLen = 0;
  function pump() {
    return reader.read().then(function(result) {
      if (result.done) {
        var out = new Uint8Array(totalLen);
        var offset = 0;
        for (var i = 0; i < chunks.length; i++) {
          out.set(chunks[i], offset);
          offset += chunks[i].length;
        }
        return out;
      }
      chunks.push(result.value);
      totalLen += result.value.length;
      return pump();
    });
  }
  return pump();
}

function decodeDelta(buf) {
  var pos = { v: 0 };
  var invScale = 1.0 / COORD_SCALE;

  gridSize = readU16(buf, pos);
  var numLayers = readU16(buf, pos);

  var layers = [];
  for (var li = 0; li < numLayers; li++) {
    var typeId = buf[pos.v++];
    var r = buf[pos.v++], g = buf[pos.v++], b = buf[pos.v++];
    var numPolygons = readU16(buf, pos);
    var polygons = [];
    for (var pi = 0; pi < numPolygons; pi++) {
      var nv = readU16(buf, pos);
      var verts = new Float32Array(nv * 2);
      var prevX = 0, prevY = 0;
      for (var vi = 0; vi < nv; vi++) {
        var dx = zigzagDecode(readVarint(buf, pos));
        var dy = zigzagDecode(readVarint(buf, pos));
        prevX += dx; prevY += dy;
        verts[vi * 2] = prevX * invScale;
        verts[vi * 2 + 1] = prevY * invScale;
      }
      polygons.push(verts);
    }
    layers.push({
      type: TYPE_NAMES[typeId] || ('type' + typeId),
      r: r / 255, g: g / 255, b: b / 255,
      polygons: polygons
    });
  }

  var numContours = readU16(buf, pos);
  var contours = [];
  for (var ci = 0; ci < numContours; ci++) {
    pos.v += 4; // skip height (f32)
    var flags = buf[pos.v++];
    var major = (flags & 1) !== 0;
    var numLines = readU16(buf, pos);
    var lines = [];
    for (var pli = 0; pli < numLines; pli++) {
      var nv = readU16(buf, pos);
      var verts = new Float32Array(nv * 2);
      var prevX = 0, prevY = 0;
      for (var vi = 0; vi < nv; vi++) {
        var dx = zigzagDecode(readVarint(buf, pos));
        var dy = zigzagDecode(readVarint(buf, pos));
        prevX += dx; prevY += dy;
        verts[vi * 2] = prevX * invScale;
        verts[vi * 2 + 1] = prevY * invScale;
      }
      lines.push(verts);
    }
    contours.push({ major: major, lines: lines });
  }

  return { layers: layers, contours: contours };
}

function zigzagDecode(n) { return (n >>> 1) ^ -(n & 1); }

function readVarint(buf, pos) {
  var result = 0, shift = 0;
  while (true) {
    var b = buf[pos.v++];
    result |= (b & 0x7F) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return result >>> 0;
}

function readU16(buf, pos) {
  var v = buf[pos.v] | (buf[pos.v + 1] << 8);
  pos.v += 2;
  return v;
}

// ── v2: absolute coordinates (original format) ──────────────────────

function parseBinary(buf) {
  var dv = new DataView(buf);
  var off = 0;

  var magic = String.fromCharCode(dv.getUint8(off), dv.getUint8(off+1), dv.getUint8(off+2), dv.getUint8(off+3));
  off += 4;
  if (magic !== 'BVEC') throw new Error('Bad magic: ' + magic);

  var version = dv.getUint8(off); off += 1;
  gridSize = dv.getUint16(off, true); off += 2;
  var numLayers = dv.getUint16(off, true); off += 2;

  var invScale = 1.0 / COORD_SCALE;
  var layers = [];

  for (var li = 0; li < numLayers; li++) {
    var typeId = dv.getUint8(off); off += 1;
    var r = dv.getUint8(off); off += 1;
    var g = dv.getUint8(off); off += 1;
    var b = dv.getUint8(off); off += 1;
    var numPolygons = dv.getUint16(off, true); off += 2;

    var polygons = [];
    for (var pi = 0; pi < numPolygons; pi++) {
      var nv = dv.getUint16(off, true); off += 2;
      var verts = new Float32Array(nv * 2);
      for (var vi = 0; vi < nv; vi++) {
        verts[vi * 2] = dv.getUint16(off, true) * invScale; off += 2;
        verts[vi * 2 + 1] = dv.getUint16(off, true) * invScale; off += 2;
      }
      polygons.push(verts);
    }

    layers.push({
      type: TYPE_NAMES[typeId] || ('type' + typeId),
      r: r / 255, g: g / 255, b: b / 255,
      polygons: polygons
    });
  }

  var numContours = dv.getUint16(off, true); off += 2;
  var contours = [];
  for (var ci = 0; ci < numContours; ci++) {
    off += 4; // skip height
    var flags = dv.getUint8(off); off += 1;
    var major = (flags & 1) !== 0;
    var numLines = dv.getUint16(off, true); off += 2;

    var lines = [];
    for (var pli = 0; pli < numLines; pli++) {
      var nv = dv.getUint16(off, true); off += 2;
      var verts = new Float32Array(nv * 2);
      for (var vi = 0; vi < nv; vi++) {
        verts[vi * 2] = dv.getUint16(off, true) * invScale; off += 2;
        verts[vi * 2 + 1] = dv.getUint16(off, true) * invScale; off += 2;
      }
      lines.push(verts);
    }

    contours.push({ major: major, lines: lines });
  }

  return { layers: layers, contours: contours };
}

// ── GPU buffer construction ──────────────────────────────────────────

function buildGPUBuffers(data) {
  var ext = gl.getExtension('OES_element_index_uint');

  fillLayers = [];
  contourLayers = [];

  for (var li = 0; li < data.layers.length; li++) {
    var layer = data.layers[li];

    var totalVerts = 0;
    var totalIndices = 0;
    for (var pi = 0; pi < layer.polygons.length; pi++) {
      var nv = layer.polygons[pi].length / 2;
      if (nv < 3) continue;
      totalVerts += nv;
      totalIndices += (nv - 2) * 3;
    }

    if (totalVerts === 0) continue;

    var verts = new Float32Array(totalVerts * 2);
    var indices = ext ? new Uint32Array(totalIndices) : new Uint16Array(totalIndices);
    var vOff = 0, iOff = 0, baseVert = 0;

    for (var pi = 0; pi < layer.polygons.length; pi++) {
      var poly = layer.polygons[pi];
      var nv = poly.length / 2;
      if (nv < 3) continue;

      verts.set(poly, vOff);
      vOff += poly.length;

      for (var ti = 0; ti < nv - 2; ti++) {
        indices[iOff++] = baseVert;
        indices[iOff++] = baseVert + ti + 1;
        indices[iOff++] = baseVert + ti + 2;
      }

      baseVert += nv;
    }

    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

    var ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    fillLayers.push({
      type: layer.type,
      r: layer.r, g: layer.g, b: layer.b,
      vbo: vbo,
      ibo: ibo,
      indexCount: iOff,
      indexType: ext ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT
    });
  }

  for (var ci = 0; ci < data.contours.length; ci++) {
    var contour = data.contours[ci];
    var totalSegVerts = 0;
    for (var li = 0; li < contour.lines.length; li++) {
      var nv = contour.lines[li].length / 2;
      if (nv < 2) continue;
      totalSegVerts += (nv - 1) * 2;
    }

    if (totalSegVerts === 0) continue;

    var segVerts = new Float32Array(totalSegVerts * 2);
    var sOff = 0;

    for (var li = 0; li < contour.lines.length; li++) {
      var line = contour.lines[li];
      var nv = line.length / 2;
      if (nv < 2) continue;

      for (var si = 0; si < nv - 1; si++) {
        segVerts[sOff++] = line[si * 2];
        segVerts[sOff++] = line[si * 2 + 1];
        segVerts[sOff++] = line[(si + 1) * 2];
        segVerts[sOff++] = line[(si + 1) * 2 + 1];
      }
    }

    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, segVerts, gl.STATIC_DRAW);

    contourLayers.push({
      major: contour.major,
      vbo: vbo,
      vertexCount: totalSegVerts
    });
  }

  console.log('[VectorMap/WebGL] GPU buffers: ' + fillLayers.length + ' fill layers, ' +
    contourLayers.length + ' contour levels');
}

})();
