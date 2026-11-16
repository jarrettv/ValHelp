import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router';
import { iconUrl } from './guides/vh/data';
import { BossProgress, DEMO_RUN, RunProgress } from './obsBosses';
import './components/ObsBosses.css';

// OBS browser source for speedruns: a compact strip of every boss, for the
// bottom of the stream, in the style of the game's HUD. Before a boss dies it
// shows whether it was found and the summon items; after, a green check.
// Data: the streamer's latest tracked character (api/obs/run/{code}), which
// moves when the game saves.

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2c-3.9 0-7 3-7 6.9 0 5 5.8 12.1 6.4 12.8.3.4.9.4 1.2 0 .6-.7 6.4-7.8 6.4-12.8C19 5 15.9 2 12 2z" fill="currentColor" />
      <circle cx="12" cy="9" r="2.8" fill="#111" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 12.5l5 5L19.5 6.5" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** What is left before the fight: the first summon step not done yet (or "Ready" when all are). */
function Summon({ boss }: { boss: BossProgress }) {
  const i = boss.steps.findIndex(s => !s.done);
  if (i < 0) {
    const last = boss.steps[boss.steps.length - 1];
    return (
      <span className="ob-step ready" title={`${last.label}: ready`}>
        <img src={iconUrl(last.item)} alt="" />Ready
      </span>
    );
  }
  const s = boss.steps[i];
  if (s.kind === 'gather' && boss.key === 'frozenking') {
    // Jotun invasions: one pip per Black Ice Core broken.
    return (
      <span className="ob-step" title={`${s.label}: ${s.have}/${s.need}`}>
        <span className="ob-pips">
          {Array.from({ length: s.need }, (_, k) => <i key={k} className={k < s.have ? 'on' : ''} />)}
        </span>
      </span>
    );
  }
  return (
    <span className={`ob-step${s.have > 0 ? ' some' : ''}`} title={`${s.label}: ${s.have}/${s.need}`}>
      <img src={iconUrl(s.item)} alt="" />{s.have}/{s.need}
    </span>
  );
}

export function BossTile({ boss }: { boss: BossProgress }) {
  return (
    <div className={`ob-boss${boss.found ? ' found' : ''}${boss.defeated ? ' defeated' : ''}`}>
      <div className="ob-portrait">
        <img src={iconUrl(boss.icon)} alt={boss.name} title={boss.name} />
      </div>
      <div className="ob-status">
        {boss.defeated
          ? <span className="ob-check" title="Defeated"><CheckIcon /></span>
          : <>
              <span className={`ob-pin${boss.found ? ' on' : ''}`} title={boss.found ? 'Found' : 'Not found yet'}><PinIcon /></span>
              <Summon boss={boss} />
            </>}
      </div>
    </div>
  );
}

export function BossesView({ run, params, fixed }: { run: RunProgress; params: URLSearchParams; fixed?: boolean }) {
  const style = {
    '--ob-bg': params.get('bg') ?? '#00000066',
    '--ob-accent': params.get('accent') ?? '#fcc400',
    '--ob-text': params.get('text') ?? '#ffffff',
    '--ob-check': params.get('check') ?? '#3ddc5a',
    '--ob-scale': params.get('scale') ?? '1',
  } as React.CSSProperties;

  return (
    <div className={`ob-root${fixed ? ' ob-fixed' : ''}`} style={style}>
      {run.bosses.map(b => <BossTile key={b.key} boss={b} />)}
    </div>
  );
}

export default function Obs2Bosses() {
  const { code } = useParams<{ code: string }>();
  const [sp] = useSearchParams();
  const demo = code === 'demo';
  const { data, isPending, isError } = useQuery<RunProgress>({
    queryKey: ['obs-run', code, sp.get('character')],
    queryFn: async () => {
      const q = sp.get('character') ? `?character=${encodeURIComponent(sp.get('character')!)}` : '';
      const res = await fetch(`/api/obs/run/${encodeURIComponent(code ?? '')}${q}`);
      if (!res.ok) throw new Error('No tracked run');
      return res.json();
    },
    enabled: !!code && !demo,
    refetchInterval: 10_000,
  });

  if (demo) return <BossesView run={DEMO_RUN} params={sp} fixed />;
  if (isPending) return null;
  if (isError || !data) return <div className="ob-root ob-fixed ob-empty">No tracked run yet</div>;
  return <BossesView run={data} params={sp} fixed />;
}
