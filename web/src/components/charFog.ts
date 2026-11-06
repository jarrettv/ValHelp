// A tracked character's fog of war, rebuilt in the browser from the tiles its
// saves changed (api CharRead: GET api/char/{id}/worlds/{worldId}/tiles).
//
// The game's explored map is 2048 x 2048 cells of 12 m, row-major with row 0 at
// the south edge, one bit a cell (LSB first). The site stores it as 32 x 32
// tiles of 64 x 64 cells; each save lists the tiles it changed, whole. Applying
// every tile up to a save gives the fog at that save.

export const FOG_SIZE = 2048;
const TILE = 64;
const PER_SIDE = FOG_SIZE / TILE;
const TILE_BYTES = TILE * TILE / 8;
const CELL_M = 12;

export interface FogTile { snapshotId: number; tile: number; explored: Uint8Array; others: Uint8Array | null }

export function parseTiles(buf: ArrayBuffer): FogTile[] {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'VHT1') throw new Error('Unexpected fog data');
  const count = dv.getInt32(4, true);
  const tiles: FogTile[] = [];
  let off = 8;
  for (let i = 0; i < count; i++) {
    const snapshotId = Number(dv.getBigInt64(off, true));
    const tile = dv.getInt16(off + 8, true);
    const hasOthers = dv.getUint8(off + 10) === 1;
    off += 11;
    const explored = new Uint8Array(buf, off, TILE_BYTES);
    off += TILE_BYTES;
    let others: Uint8Array | null = null;
    if (hasOthers) { others = new Uint8Array(buf, off, TILE_BYTES); off += TILE_BYTES; }
    tiles.push({ snapshotId, tile, explored, others });
  }
  return tiles;
}

/** Cell of a world position (Minimap.WorldToPixel: round half up of x / 12 + 1024). */
export function cellOf(x: number, z: number): [number, number] {
  return [Math.floor(x / CELL_M + FOG_SIZE / 2 + 0.5), Math.floor(z / CELL_M + FOG_SIZE / 2 + 0.5)];
}

/** World position of a cell's centre. */
export function worldOf(cx: number, cy: number): [number, number] {
  return [(cx - FOG_SIZE / 2) * CELL_M, (cy - FOG_SIZE / 2) * CELL_M];
}

export class Fog {
  readonly explored = new Uint8Array(FOG_SIZE * FOG_SIZE / 8);
  readonly others = new Uint8Array(FOG_SIZE * FOG_SIZE / 8);
  private next = 0;           // index of the first tile not applied
  private at = -1;            // snapshot id the fog is at
  private readonly tiles: FogTile[];

  constructor(tiles: FogTile[]) {
    this.tiles = tiles;
  }

  get snapshotId() { return this.at; }

  /** The fog after the save with this id (and every one before it). */
  seek(snapshotId: number) {
    if (snapshotId === this.at) return;
    if (snapshotId < this.at) {
      this.explored.fill(0);
      this.others.fill(0);
      this.next = 0;
    }
    while (this.next < this.tiles.length && this.tiles[this.next].snapshotId <= snapshotId)
      this.apply(this.tiles[this.next++]);
    this.at = snapshotId;
  }

  private apply(t: FogTile) {
    const tx = t.tile % PER_SIDE, ty = Math.floor(t.tile / PER_SIDE);
    for (let row = 0; row < TILE; row++) {
      const dst = ((ty * TILE + row) * FOG_SIZE + tx * TILE) / 8;
      this.explored.set(t.explored.subarray(row * 8, row * 8 + 8), dst);
      if (t.others) this.others.set(t.others.subarray(row * 8, row * 8 + 8), dst);
      else this.others.fill(0, dst, dst + 8);
    }
  }

  /** World-space box around everything explored so far, or null. */
  bounds(): { x0: number; z0: number; x1: number; z1: number } | null {
    let minX = FOG_SIZE, minY = FOG_SIZE, maxX = -1, maxY = -1;
    const rowBytes = FOG_SIZE / 8;
    for (let cy = 0; cy < FOG_SIZE; cy++) {
      const row = cy * rowBytes;
      for (let b = 0; b < rowBytes; b++) {
        if (!this.explored[row + b]) continue;
        const x = b * 8;
        if (x < minX) minX = x;
        if (x + 7 > maxX) maxX = x + 7;
        if (cy < minY) minY = cy;
        maxY = cy;
      }
    }
    if (maxX < 0) return null;
    const [x0, z0] = worldOf(minX, minY), [x1, z1] = worldOf(maxX, maxY);
    return { x0, z0, x1, z1 };
  }

  isExplored(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= FOG_SIZE || cy >= FOG_SIZE) return false;
    const i = cy * FOG_SIZE + cx;
    return ((this.explored[i >> 3] | this.others[i >> 3]) >> (i & 7) & 1) === 1;
  }

  isExploredAt(x: number, z: number): boolean {
    const [cx, cy] = cellOf(x, z);
    return this.isExplored(cx, cy);
  }

  /**
   * The fog as an image for VectorMap.setFog, north up: clear where explored,
   * half dark where only seen on a shared map (cartography table), dark elsewhere.
   */
  paint(canvas: HTMLCanvasElement) {
    canvas.width = FOG_SIZE;
    canvas.height = FOG_SIZE;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(FOG_SIZE, FOG_SIZE);
    const px = new Uint32Array(img.data.buffer);
    // Little-endian RGBA: alpha is the top byte.
    const FOGGED = 0xff000000, SHARED = 0x99000000;
    for (let cy = 0; cy < FOG_SIZE; cy++) {
      const src = cy * FOG_SIZE / 8, dst = (FOG_SIZE - 1 - cy) * FOG_SIZE;
      for (let b = 0; b < FOG_SIZE / 8; b++) {
        const e = this.explored[src + b], o = this.others[src + b];
        const base = dst + b * 8;
        if (e === 0xff) continue;                 // all explored: leave clear
        if (e === 0 && o === 0) { px.fill(FOGGED, base, base + 8); continue; }
        for (let bit = 0; bit < 8; bit++)
          if (!(e >> bit & 1)) px[base + bit] = (o >> bit & 1) ? SHARED : FOGGED;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
}
