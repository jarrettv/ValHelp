import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { formatPlay } from './CharTimeline';
import { mapThumb } from './mapThumb';
import { Bars, Foods, Inventory, exploredKm2, pctOfWorld, useItemIndex, type RunLatest } from './RunParts';

// One run in the runs list, laid out like the game's inventory screen (the
// pieces are in RunParts); beside it the world as explored so far.

export interface RunItem {
  id: number; name: string; latestFileTime: string; snapshots: number; sessions: number; playSeconds: number;
  worlds: { id: number; name: string | null; seed: string | null; needsSeed: boolean }[];
  latest: RunLatest | null;
}

const THUMB = 148;

export default function RunCard({ run }: { run: RunItem }) {
  const items = useItemIndex();
  const l = run.latest;
  const world = run.worlds.find(w => w.id === l?.worldId) ?? run.worlds[0];
  const [thumb, setThumb] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!l || !world?.seed || l.worldId == null) { setThumb(null); return; }
    let alive = true;
    mapThumb({
      characterId: run.id, worldId: l.worldId, seed: world.seed, snapshotId: l.snapshotId,
      at: l.x != null && l.z != null ? { x: l.x, z: l.z } : null, size: THUMB,
    }).then(url => { if (alive) setThumb(url); });
    return () => { alive = false; };
  }, [run.id, l, world?.seed]);

  const km2 = exploredKm2(l?.explored);

  return (
    <Link to={`/runs/${run.id}${world ? `?world=${world.id}` : ''}`} className="run-card">
      <div className="run-thumb" style={{ width: THUMB, height: THUMB }}>
        {thumb ? <img src={thumb} alt={`${run.name}'s explored map`} width={THUMB} height={THUMB} />
          : <span>{thumb === undefined ? 'Loading map…' : world?.needsSeed ? 'Seed unknown' : 'No map yet'}</span>}
      </div>

      <div className="run-info">
        <div className="run-name">{run.name}</div>
        <div className="run-meta">
          <span>{world?.name ?? 'Unnamed world'}</span>
          <span>{formatPlay(run.playSeconds)} played</span>
          {km2 != null && <span>{km2.toFixed(1)} km² explored ({pctOfWorld(km2)})</span>}
          <span>{run.sessions} session{run.sessions === 1 ? '' : 's'}</span>
        </div>
        {l && (
          <>
            <Bars l={l} />
            <Foods l={l} items={items} />
          </>
        )}
      </div>

      {l && <Inventory l={l} items={items} />}
    </Link>
  );
}

