// Drives the seed finder's workers (seedFinderWorker.ts) through a prefix's seeds,
// fun0000000, fun0000001, …: each batch is screened first (a quick biome
// estimate), the lowest-scoring part of it is set aside, and the rest queue for
// the exact boss placement. Workers take queued seeds before screening more, so
// the queue stays short. A seed with at least one altar of every boss inside the
// corridor is a candidate.

import { BOSSES, inCorridor, seedName, seedSpace, type Altar, type Corridor, type SeedFinderMessage, type SeedFinderRequest } from './seedFinder';

export interface ScanSettings {
  prefix: string;
  corridor: Corridor;
  /** The fraction (0-1) of screened seeds with the lowest estimated chance that skip the exact pass. */
  screenOut: number;
  workers: number;
}

/** A seed waiting for the exact pass, with its screen estimate (chance all bosses are in the corridor). */
export interface QueuedSeed { name: string; chance: number }
/** Where a prefix's scan stands, to pick it up again later. */
export interface ScanProgress { next: number; queue: QueuedSeed[] }

export interface Candidate { name: string; altars: Altar[]; chance: number; corridor: Corridor; found: number }

export interface ScanStats {
  screened: number;
  screenRejected: number;
  exactDone: number;
  exactRejected: number;
  candidates: number;
  queued: number;
  exactRunning: number;
  /** Seeds decided (screened out, or through the exact pass) per second, over the last 30 s. */
  rate: number;
  /** Exact passes per second, over the last 30 s. */
  exactRate: number;
  /** Average worker time per seed (ms). */
  screenMs: number;
  exactMs: number;
  /** Per boss (BOSSES order): exact rejections that had no altar of it in the corridor. */
  missing: number[];
  next: number;
  elapsedMs: number;
}

const SCREEN_BATCH = 16;
const RATE_WINDOW_MS = 30_000;
/** The screen's cut-off is a percentile of this many recent estimates… */
const ESTIMATE_SAMPLE = 2000;
/** …and nothing is screened out before there are this many. */
const MIN_ESTIMATES = 64;

type Job = { worker: Worker } & ({ kind: 'screen'; start: number } | { kind: 'exact'; seed: QueuedSeed });

export class SeedScanner {
  private readonly workers: Worker[] = [];
  private readonly idle = new Set<Worker>();
  private readonly jobs = new Map<number, Job>();
  private jobId = 0;
  private next: number;
  private readonly queue: QueuedSeed[];
  private readonly queued: Set<string>;
  private readonly space: number;
  private readonly estimates: number[] = [];
  private cutoff = 0;
  private readonly events: { t: number; exact: boolean }[] = [];
  private readonly counts = { screened: 0, screenRejected: 0, exactDone: 0, exactRejected: 0, candidates: 0, screenMs: 0, exactMs: 0 };
  private readonly missing = BOSSES.map(() => 0);
  private started = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private stopped = false;

  constructor(
    private readonly settings: ScanSettings,
    progress: ScanProgress,
    private readonly on: {
      candidate(c: Candidate): void;
      /** A seed through the exact pass that isn't a candidate (the page refreshes a saved one it rechecked). */
      rejected?(name: string, altars: Altar[]): void;
      stats(s: ScanStats): void;
      error(message: string): void;
      done(): void;
    },
  ) {
    this.space = seedSpace(settings.prefix);
    this.next = progress.next;
    this.queue = [...progress.queue];
    this.queued = new Set(this.queue.map(q => q.name));
  }

  start() {
    this.started = performance.now();
    for (let i = 0; i < this.settings.workers; i++) {
      const w = new Worker(new URL('./seedFinderWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<SeedFinderMessage>) => this.received(w, e.data);
      w.onerror = e => this.fail(e.message || 'Worker failed (is /worldgen/ built? scripts/build_worldgen_wasm.sh)');
      this.workers.push(w);
      this.dispatch(w);
    }
    this.timer = setInterval(() => this.emit(), 500);
    this.emit();
  }

  /** Stop every worker (work in progress is dropped) and say where to resume. */
  stop(): ScanProgress {
    const progress = this.progress();
    if (!this.stopped) {
      this.stopped = true;
      this.workers.forEach(w => w.terminate());
      clearInterval(this.timer);
      this.emit();
    }
    return progress;
  }

  /** Where to resume: in-flight screens are redone, in-flight exact seeds go back on the queue. */
  progress(): ScanProgress {
    let next = this.next;
    const queue = [...this.queue];
    for (const j of this.jobs.values()) {
      if (j.kind === 'screen') next = Math.min(next, j.start);
      else queue.unshift(j.seed);
    }
    return { next, queue };
  }

  private post(w: Worker, req: SeedFinderRequest) { w.postMessage(req); }

  private dispatch(w: Worker) {
    if (this.stopped) return;
    const job = ++this.jobId;
    const seed = this.queue.shift();
    if (seed) {
      this.queued.delete(seed.name);
      this.jobs.set(job, { worker: w, kind: 'exact', seed });
      this.post(w, { type: 'exact', job, name: seed.name });
      return;
    }
    if (this.next >= this.space) {
      this.idle.add(w);
      if (this.jobs.size === 0) { this.stop(); this.on.done(); }
      return;
    }
    const start = this.next;
    this.next = Math.min(this.space, start + SCREEN_BATCH);
    const names: string[] = [];
    for (let n = start; n < this.next; n++) names.push(seedName(this.settings.prefix, n));
    this.jobs.set(job, { worker: w, kind: 'screen', start });
    this.post(w, { type: 'screen', job, names, corridor: this.settings.corridor });
  }

  private received(w: Worker, m: SeedFinderMessage) {
    if (this.stopped) return;
    const job = this.jobs.get(m.job);
    this.jobs.delete(m.job);
    if (m.type === 'error') { this.fail(m.message); return; }
    const now = performance.now();
    if (m.type === 'screened') {
      for (const r of m.results) {
        const chance = r.chance.reduce((a, b) => a * b, 1);
        this.counts.screened++;
        this.counts.screenMs += m.ms / m.results.length;
        if (this.settings.screenOut > 0 && this.estimates.length >= MIN_ESTIMATES && chance < this.cutoff) {
          this.counts.screenRejected++;
          this.events.push({ t: now, exact: false });
        } else if (!this.queued.has(r.name)) {
          this.queue.push({ name: r.name, chance });
          this.queued.add(r.name);
        }
        this.estimates.push(chance);
      }
      if (this.estimates.length > ESTIMATE_SAMPLE) this.estimates.splice(0, this.estimates.length - ESTIMATE_SAMPLE);
      const sorted = [...this.estimates].sort((a, b) => a - b);
      this.cutoff = sorted[Math.floor(this.settings.screenOut * (sorted.length - 1))];
      // Seeds queued before there were enough estimates (every worker screens at the start) meet the cut-off too.
      if (this.settings.screenOut > 0 && this.estimates.length >= MIN_ESTIMATES) {
        for (let i = this.queue.length - 1; i >= 0; i--) {
          if (this.queue[i].chance >= this.cutoff) continue;
          this.queued.delete(this.queue[i].name);
          this.queue.splice(i, 1);
          this.counts.screenRejected++;
          this.events.push({ t: now, exact: false });
        }
      }
    } else {
      this.counts.exactDone++;
      this.counts.exactMs += m.ms;
      this.events.push({ t: now, exact: true });
      const c = this.settings.corridor;
      const missing = BOSSES.map(b => !m.altars.some(([p, x, z]) => p === b.prefab && inCorridor(c, x, z)));
      if (missing.some(Boolean)) {
        this.counts.exactRejected++;
        missing.forEach((miss, i) => { if (miss) this.missing[i]++; });
        this.on.rejected?.(m.name, m.altars);
      } else {
        this.counts.candidates++;
        const chance = job?.kind === 'exact' ? job.seed.chance : 0;
        this.on.candidate({ name: m.name, altars: m.altars, chance, corridor: c, found: Date.now() });
      }
    }
    this.dispatch(w);
    // New queued seeds: wake any worker that ran out of seeds to screen.
    for (const idle of [...this.idle]) {
      if (this.queue.length === 0) break;
      this.idle.delete(idle);
      this.dispatch(idle);
    }
  }

  private fail(message: string) {
    if (this.stopped) return;
    this.stop();
    this.on.error(message);
  }

  private emit() {
    const now = performance.now();
    while (this.events.length && this.events[0].t < now - RATE_WINDOW_MS) this.events.shift();
    const window = Math.max(1, Math.min(RATE_WINDOW_MS, now - this.started)) / 1000;
    const exactRunning = [...this.jobs.values()].filter(j => j.kind === 'exact').length;
    const { screened, screenRejected, exactDone, exactRejected, candidates, screenMs, exactMs } = this.counts;
    this.on.stats({
      screened, screenRejected, exactDone, exactRejected, candidates,
      queued: this.queue.length, exactRunning,
      rate: this.events.length / window,
      exactRate: this.events.filter(e => e.exact).length / window,
      screenMs: screened ? screenMs / screened : 0,
      exactMs: exactDone ? exactMs / exactDone : 0,
      missing: [...this.missing],
      next: this.progress().next,
      elapsedMs: now - this.started,
    });
  }
}
