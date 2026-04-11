/**
 * POC: BVEC v3 decoder — delta-encoded + deflate-compressed vector map data.
 *
 * Decompresses v3 format and returns the same { layers, contours } shape
 * as the existing parseBinary() in vector-map.js.
 *
 * Uses the browser-native DecompressionStream API (Chrome 80+, Firefox 113+, Safari 16.4+).
 */

var COORD_SCALE = 32;
var TYPE_NAMES = ['depth', 'land', 'elevation', 'biome', 'forest', 'mist', 'lava'];

/**
 * Parse a BVEC v3 (compressed) ArrayBuffer.
 * Returns: { layers: [...], contours: [...] } — same shape as parseBinary().
 */
export async function parseBinaryV3(buf) {
  var dv = new DataView(buf);
  var off = 0;

  // Outer header
  var magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  off = 4;
  if (magic !== 'BVEC') throw new Error('Bad magic: ' + magic);

  var version = dv.getUint8(off); off += 1;
  if (version !== 3) throw new Error('Expected v3, got v' + version);

  var uncompressedSize = dv.getUint32(off, true); off += 4;

  // Inflate the compressed payload
  var compressed = new Uint8Array(buf, off);
  var inner = await inflate(compressed);

  // Parse the delta-encoded inner payload
  return decodeDeltaPayload(inner, uncompressedSize);
}

/**
 * Inflate a deflate-compressed Uint8Array using browser-native DecompressionStream.
 */
async function inflate(compressed) {
  var ds = new DecompressionStream('deflate-raw');
  var writer = ds.writable.getWriter();
  writer.write(compressed);
  writer.close();

  var reader = ds.readable.getReader();
  var chunks = [];
  var totalLen = 0;

  while (true) {
    var { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLen += value.length;
  }

  var result = new Uint8Array(totalLen);
  var offset = 0;
  for (var i = 0; i < chunks.length; i++) {
    result.set(chunks[i], offset);
    offset += chunks[i].length;
  }
  return result;
}

/**
 * Decode the delta-encoded inner payload into layers + contours.
 */
function decodeDeltaPayload(buf, expectedSize) {
  var pos = { v: 0 };
  var invScale = 1.0 / COORD_SCALE;

  var gridSize = readU16(buf, pos);
  var numLayers = readU16(buf, pos);

  var layers = [];
  for (var li = 0; li < numLayers; li++) {
    var typeId = buf[pos.v++];
    var r = buf[pos.v++];
    var g = buf[pos.v++];
    var b = buf[pos.v++];
    var numPolygons = readU16(buf, pos);

    var polygons = [];
    for (var pi = 0; pi < numPolygons; pi++) {
      var nv = readU16(buf, pos);
      var verts = new Float32Array(nv * 2);

      var prevX = 0, prevY = 0;
      for (var vi = 0; vi < nv; vi++) {
        var dx = zigzagDecode(readVarint(buf, pos));
        var dy = zigzagDecode(readVarint(buf, pos));
        prevX += dx;
        prevY += dy;
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
        prevX += dx;
        prevY += dy;
        verts[vi * 2] = prevX * invScale;
        verts[vi * 2 + 1] = prevY * invScale;
      }
      lines.push(verts);
    }

    contours.push({ major: major, lines: lines });
  }

  return { layers: layers, contours: contours };
}

// ── Zigzag decoding (unsigned → signed) ─────────────────────────────

function zigzagDecode(n) {
  return (n >>> 1) ^ -(n & 1);
}

// ── Varint decoding (protobuf-style, 7 bits/byte, MSB = continuation) ─

function readVarint(buf, pos) {
  var result = 0;
  var shift = 0;
  while (true) {
    var b = buf[pos.v++];
    result |= (b & 0x7F) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return result >>> 0; // ensure unsigned
}

// ── Helpers ─────────────────────────────────────────────────────────

function readU16(buf, pos) {
  var value = buf[pos.v] | (buf[pos.v + 1] << 8);
  pos.v += 2;
  return value;
}
