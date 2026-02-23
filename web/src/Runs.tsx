import './Runs.css';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Spinner from './components/Spinner';
import { useAuth } from './contexts/AuthContext';
import type { RunDetails, RunEvent, RunRecord, RunRow, RunUpsert } from './domain/run';
import { useRun, useRuns } from './hooks/useRuns';

type DataItem = {
  code: string;
  type: string;
  name: string;
  image: string;
  source?: string;
};

type UiEvent = RunEvent & {
  id: string;
  image?: string;
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const formatTime = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const STATUS_LABEL: Record<number, string> = { [-1]: 'Rejected', 0: 'Unverified', 1: 'Verified' };
const STATUS_COLOR: Record<number, string> = { [-1]: '#c0392b', 0: '#888', 1: '#27ae60' };

function RecordBadge({ record }: { record: RunRecord }) {
  const label = STATUS_LABEL[record.status] ?? 'Unknown';
  const color = STATUS_COLOR[record.status] ?? '#888';
  return (
    <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ color, fontWeight: 600 }}>{label}</span>
      {record.world && <span title="World record">🌍 WR</span>}
      {record.personal && <span title="Personal best">⭐ PB</span>}
      {record.verifiedAt && <span className="small">verified {new Date(record.verifiedAt).toLocaleDateString()}</span>}
    </span>
  );
}

const fetchItems = async (): Promise<DataItem[]> => {
  const res = await fetch('/data.json');
  if (!res.ok) throw new Error('Failed to load item data');
  return res.json();
};

export default function Runs() {
  const { status } = useAuth();
  const queryClient = useQueryClient();

  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const runQuery = useRun(selectedRunId, !!status);
  const runsQuery = useRuns(!!status);

  const [items, setItems] = useState<DataItem[]>([]);
  const [itemsError, setItemsError] = useState<string>('');

  const [name, setName] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [durationSeconds, setDurationSeconds] = useState<number>(7200);
  const [events, setEvents] = useState<UiEvent[]>([]);

  const [tab, setTab] = useState<'Food' | 'Gear' | 'Stations'>('Food');
  const [search, setSearch] = useState<string>('');

  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchItems()
      .then((data) => {
        if (!mounted) return;
        setItems(data);
        setItemsError('');
      })
      .catch((e) => {
        if (!mounted) return;
        setItemsError((e as Error).message ?? 'Failed to load items');
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Hydrate editor when a run is loaded
  useEffect(() => {
    const d = runQuery.data as RunDetails | undefined;
    if (!d) return;

    setName(d.name ?? '');
    setCategory(d.category ?? '');
    setDurationSeconds(d.durationSeconds ?? 7200);
    setEvents(
      (d.events ?? []).map((e, idx) => ({
        ...e,
        id: `${d.id}-${idx}-${crypto.randomUUID()}`,
        image: items.find((x) => x.code === e.code)?.image,
      }))
    );
    setSelectedEventId(null);
  }, [runQuery.data, items]);

  const stations = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) {
      if (i.source && i.source.trim()) set.add(i.source.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredPalette = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (tab === 'Stations') {
      const list = stations
        .filter((s) => (q ? s.toLowerCase().includes(q) : true))
        .map((s) => ({
          code: s,
          type: 'Station',
          name: s,
          image: '',
          source: s,
        }));
      return list;
    }

    const gearTypes = new Set([
      'Accessory',
      'Armor',
      'Axe',
      'Bow',
      'Club',
      'Crossbow',
      'Fists',
      'Knife',
      'Pickaxe',
      'Polearm',
      'Shield',
      'Spear',
      'Sword',
      'Arrow',
      'Bolt',
      'Bomb',
      'Missile',
      'Misc',
      'Blood magic',
      'Elemental magic',
    ]);

    return items
      .filter((i) => {
        if (tab === 'Food') return i.type === 'Food';
        return gearTypes.has(i.type);
      })
      .filter((i) => (q ? i.name.toLowerCase().includes(q) : true))
      .slice(0, 250);
  }, [items, search, stations, tab]);

  const saveMutation = useMutation({
    mutationFn: async (payload: { id: number | null; body: RunUpsert }): Promise<RunDetails> => {
      const { id, body } = payload;
      const res = await fetch(id === null ? '/api/runs' : `/api/runs/${id}`, {
        method: id === null ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save run');
      return res.json();
    },
    onSuccess: async (saved) => {
      setSelectedRunId(saved.id);
      await queryClient.invalidateQueries({ queryKey: ['runs'] });
      await queryClient.invalidateQueries({ queryKey: ['run', saved.id] });
    },
  });

  const resetNew = () => {
    setSelectedRunId(null);
    setName('');
    setCategory('');
    setDurationSeconds(7200);
    setEvents([]);
    setSelectedEventId(null);
  };

  const handleDragStartItem = (item: DataItem) => (e: React.DragEvent) => {
    const payload = {
      kind: tab === 'Stations' ? 'station' : 'item',
      label: tab === 'Stations' ? item.name : item.name,
      code: tab === 'Stations' ? undefined : item.code,
      type: tab,
      image: item.image,
    };
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const timeFromClientX = (clientX: number) => {
    const el = timelineRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, rect.width);
    const ratio = rect.width <= 0 ? 0 : x / rect.width;
    const t = Math.round(ratio * durationSeconds);
    // snap to 5s for easy placement
    return Math.round(t / 5) * 5;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const t = timeFromClientX(e.clientX);

    const newEvent: UiEvent = {
      id: crypto.randomUUID(),
      time: t,
      kind: parsed.kind === 'station' ? 'station' : 'item',
      label: String(parsed.label ?? ''),
      code: parsed.code ? String(parsed.code) : undefined,
      type: parsed.type ? String(parsed.type) : undefined,
      image: parsed.image ? String(parsed.image) : undefined,
    };

    setEvents((prev) => [...prev, newEvent].sort((a, b) => a.time - b.time));
    setSelectedEventId(newEvent.id);
  };

  const startDragMarker = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setSelectedEventId(id);
    setDraggingEventId(id);
  };

  useEffect(() => {
    if (!draggingEventId) return;

    const onMove = (e: MouseEvent) => {
      const t = timeFromClientX(e.clientX);
      setEvents((prev) =>
        prev
          .map((ev) => (ev.id === draggingEventId ? { ...ev, t } : ev))
          .sort((a, b) => a.time - b.time)
      );
    };

    const onUp = () => {
      setDraggingEventId(null);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [draggingEventId, durationSeconds]);

  const deleteSelected = () => {
    if (!selectedEventId) return;
    setEvents((prev) => prev.filter((e) => e.id !== selectedEventId));
    setSelectedEventId(null);
  };

  const save = () => {
    const body: RunUpsert = {
      name,
      category,
      durationSeconds,
      events: events.map(({ id, image, ...rest }) => rest),
    };
    saveMutation.mutate({ id: selectedRunId, body });
  };

  if (!status) {
    return (
      <div className="card" style={{ marginTop: '1rem' }}>
        <div style={{ fontSize: '1.2rem' }}>Login required</div>
        <div className="small">This tool saves runs to your account.</div>
      </div>
    );
  }

  const isBusy = runsQuery.isPending || runQuery.isPending || saveMutation.isPending;

  return (
    <div className="runs">
      <h2>Speedrun Timeline</h2>

      <div className="toolbar">
        <select
          value={selectedRunId ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            setSelectedRunId(v ? parseInt(v, 10) : null);
          }}
        >
          <option value="">(New run)</option>
          {(runsQuery.data as RunRow[] | undefined)?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name || `Run #${r.id}`}
            </option>
          ))}
        </select>

        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Run name (optional)" />
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (e.g., Any%, 7box)" />

        <button className="secondary" type="button" onClick={resetNew}>
          New
        </button>
        <button type="button" onClick={save} disabled={saveMutation.isPending}>
          {selectedRunId === null ? 'Save' : 'Save changes'}
        </button>
      </div>

      {runQuery.data && (
        <div className="small" style={{ marginBottom: '0.4rem' }}>
          <RecordBadge record={(runQuery.data as RunDetails).record} />
        </div>
      )}

      <div className="small" style={{ marginBottom: '0.8rem' }}>
        Duration:{' '}
        <input
          style={{ width: '110px' }}
          type="number"
          min={300}
          max={21600}
          value={durationSeconds}
          onChange={(e) => setDurationSeconds(parseInt(e.target.value || '0', 10) || 0)}
        />
        <span style={{ marginLeft: '0.6rem' }}>{formatTime(durationSeconds)}</span>
      </div>

      {isBusy && (
        <section className="loading">
          <Spinner />
        </section>
      )}

      {itemsError && <div className="alert error">{itemsError}</div>}
      {saveMutation.isError && <div className="alert error">{(saveMutation.error as Error)?.message}</div>}

      <div className="grid">
        <div className="palette">
          <div className="tabs">
            <button type="button" className={tab === 'Food' ? 'active' : ''} onClick={() => setTab('Food')}>
              Food
            </button>
            <button type="button" className={tab === 'Gear' ? 'active' : ''} onClick={() => setTab('Gear')}>
              Gear
            </button>
            <button type="button" className={tab === 'Stations' ? 'active' : ''} onClick={() => setTab('Stations')}>
              Stations
            </button>
          </div>

          <input
            className="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
          />

          <div className="list">
            {filteredPalette.map((i) => (
              <div
                key={`${tab}-${i.code}`}
                className="item"
                draggable
                onDragStart={handleDragStartItem(i)}
                title="Drag onto timeline"
              >
                {i.image ? <img src={i.image} alt="" /> : <div />}
                <div>
                  <div>{i.name}</div>
                  {i.source && tab !== 'Stations' && <div className="small">{i.source}</div>}
                </div>
              </div>
            ))}
            {!filteredPalette.length && <div className="small">No matches</div>}
          </div>
        </div>

        <div className="timeline">
          <div className="hint">Drag items here. Drag markers to adjust time.</div>

          <div
            className="bar"
            ref={timelineRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onMouseDown={() => setSelectedEventId(null)}
          >
            {events.map((ev) => {
              const left = durationSeconds > 0 ? (ev.time / durationSeconds) * 100 : 0;
              return (
                <div
                  key={ev.id}
                  className={`marker ${selectedEventId === ev.id ? 'selected' : ''}`}
                  style={{ left: `${left}%` }}
                  onMouseDown={startDragMarker(ev.id)}
                >
                  {ev.image ? <img src={ev.image} alt="" /> : null}
                  <span>{ev.label}</span>
                  <span className="small">{formatTime(ev.time)}</span>
                </div>
              );
            })}
          </div>

          <div className="ticks">
            <span>0:00</span>
            <span>{formatTime(Math.round(durationSeconds * 0.25))}</span>
            <span>{formatTime(Math.round(durationSeconds * 0.5))}</span>
            <span>{formatTime(Math.round(durationSeconds * 0.75))}</span>
            <span>{formatTime(durationSeconds)}</span>
          </div>

          <div className="actions">
            <button type="button" className="danger" onClick={deleteSelected} disabled={!selectedEventId}>
              Delete selected
            </button>
          </div>

          <div className="small" style={{ marginTop: '0.6rem' }}>
            Tip: dropping snaps to 5 seconds.
          </div>
        </div>
      </div>
    </div>
  );
}
