// Messages between the page and worldgenWorker.ts.

import type { PoiMarker } from '../components/poiIcons';

export type WorldgenStage = 'runtime' | 'generator' | 'textures' | 'vectors' | 'mask' | 'locations' | 'contents';

export const STAGE_LABELS: Record<WorldgenStage, string> = {
  runtime: 'Loading worldgen',
  generator: 'Lakes, rivers and streams',
  textures: 'Height, biomes and forest',
  vectors: 'Vector map',
  mask: 'Forest texture',
  locations: 'Locations',
  contents: 'Contents',
};

export type WorldgenRequest = { type: 'generate'; seed: string };

export type WorldgenMessage =
  | { type: 'progress'; stage: WorldgenStage; fraction: number; detail?: string }
  | { type: 'done'; seed: string; seedHash: number; bvec: ArrayBuffer; mask: Blob; timings: Partial<Record<WorldgenStage, number>>;
      /** The POIs as seedgen serves them (names, types, contents, vegvisirs, marks); rulesVersion:
       *  the game version the placement rules are from. */
      pois: PoiMarker[]; rulesVersion: string;
      /** Biome variants as seedgen serves them: the sectors (JSON) and the gzipped sector grid. */
      altBiomes: string; altBiomeGrid: Blob }
  | { type: 'error'; message: string };
