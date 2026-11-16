import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Spinner from './components/Spinner';
import TimeAgo from './components/TimeAgo';
import { useAuth } from './contexts/AuthContext';
import { iconUrl } from './guides/vh/data';
import { BossesView } from './Obs2Bosses';
import { BossProgress, RunProgress } from './obsBosses';

// Admin: drive a run's speedrun boss overlay by hand when the game's saves lag
// behind the stream (api/admin/obs/runs). Manual values are a floor over the
// save: they push a boss ahead, and later saves only move it further.

interface RunItem { id: number; name: string; userId: number; username: string; avatarUrl: string; latestFileTime: string; manual: boolean }
interface BossOverride { found?: boolean | null; defeated?: boolean | null; steps?: (number | null)[] | null }
interface ObsOverride { bosses: Record<string, BossOverride> }
interface RunDetail { auto: RunProgress; effective: RunProgress; override: ObsOverride; username: string }

const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(url, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  if (res.status === 403) throw new Error('Admin access required');
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
};

const btn: React.CSSProperties = { padding: '0.2rem 0.55rem', borderRadius: '0.35rem', minWidth: '2rem' };

export default function AdminObsRuns() {
  const { status } = useAuth();
  const qc = useQueryClient();
  const isAdmin = status?.id === 1;
  const [runId, setRunId] = useState<number | null>(null);

  const runs = useQuery<RunItem[]>({
    queryKey: ['admin-obs-runs'],
    queryFn: () => api('/api/admin/obs/runs'),
    enabled: isAdmin,
    refetchInterval: 60_000,
  });
  useEffect(() => {
    if (runId == null && runs.data?.length) setRunId(runs.data[0].id);
  }, [runs.data, runId]);

  const detail = useQuery<RunDetail>({
    queryKey: ['admin-obs-run', runId],
    queryFn: () => api(`/api/admin/obs/runs/${runId}`),
    enabled: isAdmin && runId != null,
    refetchInterval: 10_000,
  });

  const save = useMutation({
    mutationFn: (ov: ObsOverride | null) => ov
      ? api<RunDetail>(`/api/admin/obs/runs/${runId}`, { method: 'PUT', body: JSON.stringify(ov) })
      : api<RunDetail>(`/api/admin/obs/runs/${runId}`, { method: 'DELETE' }),
    onSuccess: d => {
      qc.setQueryData(['admin-obs-run', runId], d);
      qc.invalidateQueries({ queryKey: ['admin-obs-runs'] });
    },
  });

  if (!isAdmin) return <div style={{ padding: '1rem' }}>Admin access required.</div>;
  if (runs.isLoading) return <Spinner />;
  if (runs.isError) return <div style={{ padding: '1rem', color: '#c66' }}>Error: {(runs.error as Error).message}</div>;

  const d = detail.data;
  const ov: ObsOverride = d?.override ?? { bosses: {} };
  const setBoss = (key: string, o: BossOverride | null) => {
    const bosses = { ...ov.bosses };
    if (o) bosses[key] = o; else delete bosses[key];
    save.mutate({ bosses });
  };

  return (
    <div style={{ padding: '1rem', maxWidth: '60rem' }}>
      <h2 style={{ marginTop: 0 }}>Speedrun overlay control</h2>
      <p style={{ opacity: 0.8, marginTop: 0 }}>
        Push a run's boss overlay ahead of its last save. Manual values only add to what the save says; once
        a save catches up nothing changes. The overlay picks changes up within about 10 seconds.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={runId ?? ''} onChange={e => setRunId(Number(e.target.value))} style={{ flex: '1', minWidth: '16rem' }}>
          {(runs.data ?? []).map(r => (
            <option key={r.id} value={r.id}>
              {r.username} — {r.name}{r.manual ? ' (manual)' : ''} · {new Date(r.latestFileTime).toLocaleString()}
            </option>
          ))}
        </select>
        <button style={btn} disabled={!d || Object.keys(ov.bosses).length === 0 || save.isPending}
          onClick={() => { if (confirm('Clear all manual progress for this run?')) save.mutate(null); }}>
          Reset all to saves
        </button>
      </div>

      {detail.isLoading && <Spinner />}
      {detail.isError && <div style={{ color: '#c66', marginTop: '1rem' }}>Error: {(detail.error as Error).message}</div>}
      {save.isError && <div style={{ color: '#c66', marginTop: '0.5rem' }}>Save failed: {(save.error as Error).message}</div>}

      {d && (
        <>
          <div style={{ margin: '1rem 0 0.25rem', fontSize: 'smaller', opacity: 0.8 }}>
            Last save <TimeAgo targetTime={new Date(d.auto.savedAt)} /> · what the overlay shows now:
          </div>
          <div style={{ overflowX: 'auto', padding: '0.5rem', borderRadius: '0.5rem', background: 'repeating-conic-gradient(#3a3a3a 0 25%, #2a2a2a 0 50%) 0 0 / 20px 20px' }}>
            <BossesView run={d.effective} params={new URLSearchParams()} />
          </div>

          <div style={{ display: 'grid', gap: '0.4rem', marginTop: '1rem' }}>
            {d.effective.bosses.map((b, i) => (
              <BossRow key={b.key} eff={b} auto={d.auto.bosses[i]} o={ov.bosses[b.key]}
                busy={save.isPending} onChange={o => setBoss(b.key, o)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BossRow({ eff, auto, o, busy, onChange }: {
  eff: BossProgress; auto: BossProgress; o?: BossOverride; busy: boolean; onChange: (o: BossOverride | null) => void;
}) {
  const cur: BossOverride = o ?? {};
  // Set one field; drop the boss's entry when nothing manual is left.
  const set = (patch: BossOverride) => {
    const next = { ...cur, ...patch };
    const steps = next.steps?.some(s => s != null) ? next.steps : null;
    const empty = !next.found && !next.defeated && !steps;
    onChange(empty ? null : { found: next.found || null, defeated: next.defeated || null, steps });
  };
  const setStep = (i: number, v: number) => {
    const steps = eff.steps.map((_, k) => cur.steps?.[k] ?? null);
    const need = eff.steps[i].need;
    const n = Math.max(0, Math.min(need, v));
    steps[i] = n > auto.steps[i].have ? n : null;
    set({ steps });
  };
  // One click: the next stage not done yet.
  const next = () => {
    if (!eff.found) return set({ found: true });
    const i = eff.steps.findIndex(s => !s.done);
    if (i >= 0) return setStep(i, eff.steps[i].need);
    set({ defeated: true });
  };

  const toggle = (on: boolean, fromSave: boolean, label: string, flip: () => void) => (
    <button style={{ ...btn, background: on ? (fromSave ? '#2d5a37' : '#7a5d00') : undefined }} disabled={busy || fromSave}
      onClick={flip} title={fromSave ? `${label}: from the save` : on ? `${label}: set by hand (click to undo)` : `Mark ${label.toLowerCase()}`}>
      {on ? '✓ ' : ''}{label}
    </button>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', padding: '0.4rem 0.6rem',
      borderRadius: '0.5rem', background: o ? '#3a3215' : '#ffffff0a' }}>
      <img src={iconUrl(eff.icon)} alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} />
      <strong style={{ width: '9rem' }}>{eff.name}</strong>
      {toggle(eff.found, auto.found, 'Found', () => set({ found: !cur.found }))}
      {eff.steps.map((s, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          title={`${s.label}: save says ${auto.steps[i].have}/${s.need}`}>
          <img src={iconUrl(s.item)} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
          <button style={btn} disabled={busy || s.have <= auto.steps[i].have} onClick={() => setStep(i, s.have - 1)}>−</button>
          <span style={{ minWidth: '2.6rem', textAlign: 'center', color: s.done ? '#3ddc5a' : cur.steps?.[i] != null ? '#fcc400' : undefined }}>
            {s.have}/{s.need}
          </span>
          <button style={btn} disabled={busy || s.have >= s.need} onClick={() => setStep(i, s.have + 1)}>+</button>
        </span>
      ))}
      {toggle(eff.defeated, auto.defeated, 'Defeated', () => set({ defeated: !cur.defeated }))}
      <span style={{ flex: 1 }} />
      <button style={{ ...btn, fontWeight: 'bold' }} disabled={busy || eff.defeated} onClick={next}>Next ▶</button>
      <button style={btn} disabled={busy || !o} onClick={() => onChange(null)} title="Back to what the save says">Reset</button>
    </div>
  );
}
