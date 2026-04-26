/**
 * RepoPage — per-repository mission control board.
 * Route: /repo/:slug
 *
 * Resolves slug → projectPath via /api/projects-summary, then renders
 * tabbed sections (Overview / Tasks / Events / Agents) with:
 *   - breadcrumb + page header (eyebrow + title + daemon chip + refresh)
 *   - 4-tile stats bar (active / done / failed / avg quality)
 *   - alert bar when any non-terminal task is stalled (>2h since created)
 *
 * Styling uses ONLY the index.css design system classes; no Tailwind.
 */

import { useState } from 'react';
import { useParams, Link } from 'react-router';
import { usePollingData, useProjectsSummary, TERMINAL_STAGES } from '../data/hooks';
import type {
  TaskManifest,
  LearnedAgent,
  EventsFeedEntry,
  TaskRetrospective,
  MaintainerStatus,
} from '../data/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const STALL_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
const TERMINAL_SET = new Set<string>(TERMINAL_STAGES as readonly string[]);
const TITLE_TRUNCATE_MAX = 80;
const DETAIL_TRUNCATE_MAX = 100;
const RECENT_TASKS_LIMIT = 8;
const RECENT_EVENTS_LIMIT = 10;
const EVENTS_TAB_LIMIT = 50;

const PATH_NOISE_PARTS = new Set([
  'users', 'hassam', 'documents', 'home', 'library', 'local',
]);

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function shortName(slug: string): string {
  if (!slug) return '—';
  const parts = slug.split('-').filter(p => p.length > 0 && !PATH_NOISE_PARTS.has(p.toLowerCase()));
  if (parts.length === 0) return slug;
  return parts.join('-');
}

function shortPath(p: string): string {
  if (!p) return '—';
  return p.replace(/^\/?Users\/[^/]+\/Documents\//, '~/');
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${mo}/${day} ${hh}:${mm}`;
  } catch {
    return '—';
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return (
      `${d.getFullYear()}-` +
      `${String(d.getMonth() + 1).padStart(2, '0')}-` +
      `${String(d.getDate()).padStart(2, '0')}`
    );
  } catch {
    return '—';
  }
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const diffMs = Date.now() - d.getTime();
    const sec = Math.round(diffMs / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const days = Math.round(hr / 24);
    return `${days}d ago`;
  } catch {
    return '—';
  }
}

function formatCost(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  return `$${val.toFixed(2)}`;
}

function formatQuality(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  return val.toFixed(3);
}

function truncate(s: string | null | undefined, max: number): string {
  if (!s) return '—';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function stageBadgeClass(stage: string | null | undefined): string {
  const s = (stage ?? '').toUpperCase();
  if (s === 'DONE' || s === 'CALIBRATED')        return 'badge ok';
  if (s.includes('FAIL'))                          return 'badge err';
  if (s.includes('AUDIT'))                         return 'badge info';
  if (s.startsWith('REPAIR'))                      return 'badge warn';
  if (s === 'PLANNING' || s.startsWith('SPEC'))    return 'badge idle';
  return 'badge active';
}

function eventChipClass(event: string | null | undefined): string {
  const e = (event ?? '').toLowerCase();
  if (e.includes('denied') || e.includes('deny'))            return 'event-chip denied';
  if (e.includes('postmortem') || e.includes('post-mortem')) return 'event-chip post';
  if (e.includes('repair'))                                  return 'event-chip repair';
  if (e.includes('stage') || e.includes('transition'))       return 'event-chip stage';
  return 'event-chip';
}

function eventChipLabel(event: string | null | undefined): string {
  const e = (event ?? '').toLowerCase();
  if (e.includes('denied') || e.includes('deny'))            return 'denied';
  if (e.includes('postmortem') || e.includes('post-mortem')) return 'postmortem';
  if (e.includes('repair'))                                  return 'repair';
  if (e.includes('stage') || e.includes('transition'))       return 'stage';
  return 'event';
}

function healthFillColor(active: number, failed: number, total: number): string {
  if (total === 0) return 'lime';
  const failRatio = failed / Math.max(total, 1);
  if (failRatio >= 0.25) return 'red';
  if (failRatio >= 0.10) return 'orange';
  if (active > 0)        return 'lime';
  return 'teal';
}

function healthFillPercent(done: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}

// ─── Stall detection ──────────────────────────────────────────────────────────

function stalledTaskCount(tasks: TaskManifest[]): number {
  const now = Date.now();
  let n = 0;
  for (const t of tasks) {
    if (TERMINAL_SET.has(t.stage)) continue;
    try {
      const ts = new Date(t.created_at).getTime();
      if (!isNaN(ts) && now - ts > STALL_THRESHOLD_MS) n += 1;
    } catch {
      /* ignore */
    }
  }
  return n;
}

// ─── 404 view ─────────────────────────────────────────────────────────────────

function NotFoundView({ slug }: { slug: string }) {
  return (
    <div role="main" aria-label="Repository not found">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">home</Link>
        <span className="breadcrumb-sep" aria-hidden="true">/</span>
        <span className="breadcrumb-cur">not found</span>
      </nav>
      <div className="card">
        <div className="card-body">
          <div className="empty-state" role="status">
            <div style={{ marginBottom: 12, fontSize: 14, color: 'var(--bone)', fontWeight: 600 }}>
              Repository not found
            </div>
            <div style={{ marginBottom: 16 }}>
              No registered project matches the slug <code>{slug || '(empty)'}</code>.
            </div>
            <Link to="/" className="btn btn--ghost btn--sm" aria-label="Back to home">
              ← back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Daemon status chip ───────────────────────────────────────────────────────

function DaemonChip({ projectPath }: { projectPath: string }) {
  const result = usePollingData<MaintainerStatus>(
    projectPath ? `/api/maintainer-status?project=${encodeURIComponent(projectPath)}` : '',
    15000,
    { globalScope: true },
  );

  if (result.loading && !result.data) {
    return <span className="badge idle" aria-label="Daemon status loading">…</span>;
  }
  if (result.error && !result.data) {
    return <span className="badge warn" aria-label="Daemon status unavailable">unknown</span>;
  }
  const running = result.data?.running === true;
  return (
    <span
      className={running ? 'badge ok' : 'badge idle'}
      aria-label={running ? 'Daemon running' : 'Daemon stopped'}
    >
      {running ? 'RUNNING' : 'STOPPED'}
    </span>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type TabKey = 'overview' | 'tasks' | 'events' | 'agents';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'tasks',    label: 'Tasks' },
  { key: 'events',   label: 'Events' },
  { key: 'agents',   label: 'Agents' },
];

// ─── Reusable section helpers ─────────────────────────────────────────────────

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="loading-row" role="status" aria-label={label}>
      {label}
    </div>
  );
}

function ErrorBlock({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="alert-bar alert-bar--crit" role="alert">
      <span className="alert-dot" aria-hidden="true" />
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry && (
        <button
          className="btn btn--ghost btn--sm"
          onClick={onRetry}
          aria-label="Retry"
        >
          retry
        </button>
      )}
    </div>
  );
}

function EmptyBlock({ message }: { message: string }) {
  return (
    <div className="empty-state" role="status">
      {message}
    </div>
  );
}

// ─── Tasks data shaping ───────────────────────────────────────────────────────

interface TasksShape {
  tasks: TaskManifest[];
}

function normalizeTasks(raw: unknown): TaskManifest[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw as TaskManifest[];
  const maybe = raw as TasksShape;
  if (Array.isArray(maybe.tasks)) return maybe.tasks;
  return null;
}

function sortTasksByCreatedDesc(tasks: TaskManifest[]): TaskManifest[] {
  return [...tasks].sort((a, b) => {
    const ta = new Date(a.created_at).getTime() || 0;
    const tb = new Date(b.created_at).getTime() || 0;
    return tb - ta;
  });
}

// ─── Stats from retrospectives ────────────────────────────────────────────────

interface RetroAggregate {
  qualityScores: number[];
  costByTask: Map<string, number>;
  qualityByTask: Map<string, number>;
}

function aggregateRetros(retros: TaskRetrospective[] | null): RetroAggregate {
  const qualityScores: number[] = [];
  const costByTask = new Map<string, number>();
  const qualityByTask = new Map<string, number>();
  if (!retros) return { qualityScores, costByTask, qualityByTask };
  for (const r of retros) {
    if (typeof r.quality_score === 'number' && !Number.isNaN(r.quality_score)) {
      qualityScores.push(r.quality_score);
      qualityByTask.set(r.task_id, r.quality_score);
    }
    if (typeof r.cost_score === 'number' && !Number.isNaN(r.cost_score)) {
      costByTask.set(r.task_id, r.cost_score);
    }
  }
  return { qualityScores, costByTask, qualityByTask };
}

function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return sum / nums.length;
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

interface StatsBarProps {
  tasks: TaskManifest[] | null;
  loading: boolean;
  avgQuality: number | null;
}

function StatsBar({ tasks, loading, avgQuality }: StatsBarProps) {
  const active = tasks ? tasks.filter(t => !TERMINAL_SET.has(t.stage)).length : null;
  const done   = tasks ? tasks.filter(t => t.stage === 'DONE' || t.stage === 'CALIBRATED').length : null;
  const failed = tasks ? tasks.filter(t => (t.stage || '').toUpperCase().includes('FAIL')).length : null;

  const fmt = (n: number | null) => loading && n === null ? '…' : (n === null ? '—' : String(n));

  return (
    <div className="stats-bar" role="region" aria-label="Repository stats">
      <div className="stat-tile lime">
        <div className="stat-label">Active Tasks</div>
        <div className="stat-value lime" aria-label={`Active tasks: ${active ?? 'unknown'}`}>{fmt(active)}</div>
        <div className="stat-sub">non-terminal</div>
      </div>
      <div className="stat-tile teal">
        <div className="stat-label">Done Tasks</div>
        <div className="stat-value teal" aria-label={`Done tasks: ${done ?? 'unknown'}`}>{fmt(done)}</div>
        <div className="stat-sub">DONE + CALIBRATED</div>
      </div>
      <div className="stat-tile red">
        <div className="stat-label">Failed Tasks</div>
        <div className="stat-value red" aria-label={`Failed tasks: ${failed ?? 'unknown'}`}>{fmt(failed)}</div>
        <div className="stat-sub">includes *FAIL*</div>
      </div>
      <div className="stat-tile orange">
        <div className="stat-label">Avg Quality</div>
        <div
          className={
            'stat-value ' +
            (avgQuality === null
              ? ''
              : avgQuality >= 0.8 ? 'teal'
              : avgQuality >= 0.5 ? 'orange'
              : 'red')
          }
          aria-label={`Average quality: ${avgQuality === null ? 'unknown' : avgQuality.toFixed(3)}`}
        >
          {avgQuality === null ? '—' : avgQuality.toFixed(2)}
        </div>
        <div className="stat-sub">from retrospectives</div>
      </div>
    </div>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

interface OverviewProps {
  slug: string;
  projectPath: string;
  tasks: TaskManifest[] | null;
  tasksLoading: boolean;
  tasksError: string | null;
  avgQuality: number | null;
  qualityByTask: Map<string, number>;
  retroLoading: boolean;
  retroError: string | null;
  events: EventsFeedEntry[] | null;
  eventsLoading: boolean;
  eventsError: string | null;
  onRetryTasks: () => void;
  onRetryEvents: () => void;
}

function OverviewTab(p: OverviewProps) {
  const total  = p.tasks?.length ?? 0;
  const active = p.tasks ? p.tasks.filter(t => !TERMINAL_SET.has(t.stage)).length : 0;
  const done   = p.tasks ? p.tasks.filter(t => t.stage === 'DONE' || t.stage === 'CALIBRATED').length : 0;
  const failed = p.tasks ? p.tasks.filter(t => (t.stage || '').toUpperCase().includes('FAIL')).length : 0;
  const lastUpdated = p.tasks && p.tasks.length
    ? sortTasksByCreatedDesc(p.tasks)[0].created_at
    : null;
  const recent = p.tasks ? sortTasksByCreatedDesc(p.tasks).slice(0, RECENT_TASKS_LIMIT) : null;
  const trustScore = p.avgQuality;

  const healthCls = healthFillColor(active, failed, total);
  const healthPct = healthFillPercent(done, total);

  return (
    <>
      {/* Repo summary */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Repo Summary</span>
        </div>
        <div className="card-body">
          {/* health bar */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="stat-label" style={{ marginBottom: 0 }}>Health</span>
              <span className="stat-sub" style={{ marginTop: 0 }}>
                {done}/{total} done · {failed} failed
              </span>
            </div>
            <div className="health-track" aria-label={`Health ${healthPct}%`}>
              <div
                className={`health-fill ${healthCls}`}
                style={{ width: `${healthPct}%` }}
                role="progressbar"
                aria-valuenow={healthPct}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>

          {/* kv grid */}
          <div className="kv">
            <div className="kv-key">Path</div>
            <div className="kv-val" title={p.projectPath}>{shortPath(p.projectPath)}</div>
            <div className="kv-key">Active tasks</div>
            <div className="kv-val">{p.tasksLoading && !p.tasks ? '…' : active}</div>
            <div className="kv-key">Last updated</div>
            <div className="kv-val">{formatRelative(lastUpdated)}</div>
            <div className="kv-key">Trust score</div>
            <div className="kv-val">
              {p.retroLoading && trustScore === null
                ? '…'
                : trustScore === null
                ? '—'
                : formatQuality(trustScore)}
            </div>
          </div>
        </div>
      </div>

      {/* Recent tasks */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent Tasks</span>
        </div>
        {p.tasksLoading && !p.tasks && (
          <div className="card-body"><LoadingBlock label="Loading tasks…" /></div>
        )}
        {p.tasksError && !p.tasks && (
          <div className="card-body">
            <ErrorBlock
              message={`Failed to load tasks: ${p.tasksError}.`}
              onRetry={p.onRetryTasks}
            />
          </div>
        )}
        {recent && recent.length === 0 && (
          <div className="card-body"><EmptyBlock message="No tasks yet for this repository." /></div>
        )}
        {recent && recent.length > 0 && (
          <div className="card-body--flush">
            <div className="table-wrap">
              <table className="dt" aria-label="Recent tasks">
                <thead>
                  <tr>
                    <th scope="col">Task ID</th>
                    <th scope="col">Title</th>
                    <th scope="col">Stage</th>
                    <th scope="col">Quality</th>
                    <th scope="col">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map(task => {
                    const q = p.qualityByTask.get(task.task_id);
                    return (
                      <tr key={task.task_id}>
                        <td className="col-id">
                          <Link to={`/repo/${slugUriPart(p.slug)}/task/${task.task_id}`}>
                            {task.task_id}
                          </Link>
                        </td>
                        <td className="col-bone" title={task.title}>
                          {truncate(task.title, TITLE_TRUNCATE_MAX)}
                        </td>
                        <td><span className={stageBadgeClass(task.stage)}>{task.stage}</span></td>
                        <td className="col-mono col-dim">{formatQuality(q)}</td>
                        <td className="col-mono col-dim">{formatRelative(task.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Recent events */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent Events</span>
        </div>
        {p.eventsLoading && !p.events && (
          <div className="card-body"><LoadingBlock label="Loading events…" /></div>
        )}
        {p.eventsError && !p.events && (
          <div className="card-body">
            <ErrorBlock
              message={`Failed to load events: ${p.eventsError}.`}
              onRetry={p.onRetryEvents}
            />
          </div>
        )}
        {p.events && p.events.length === 0 && (
          <div className="card-body"><EmptyBlock message="No recent events for this repository." /></div>
        )}
        {p.events && p.events.length > 0 && (
          <div className="card-body--flush">
            <div className="table-wrap">
              <table className="dt" aria-label="Recent events">
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Type</th>
                    <th scope="col">Event</th>
                    <th scope="col">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {p.events.slice(0, RECENT_EVENTS_LIMIT).map((ev, i) => (
                    <tr key={`${ev.ts}-${i}`}>
                      <td className="col-mono col-dim">{formatDateShort(ev.ts)}</td>
                      <td><span className={eventChipClass(ev.event)}>{eventChipLabel(ev.event)}</span></td>
                      <td className="col-mono col-bone" title={ev.event}>
                        {truncate(ev.event, 40)}
                      </td>
                      <td className="col-mono col-dim" title={summarizeEventDetail(ev)}>
                        {truncate(summarizeEventDetail(ev), DETAIL_TRUNCATE_MAX)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function summarizeEventDetail(ev: EventsFeedEntry): string {
  // pick a few common payload fields without exposing huge JSON
  const keys = ['stage', 'task_id', 'agent', 'role', 'reason', 'path', 'mode', 'status'];
  const parts: string[] = [];
  for (const k of keys) {
    const v = ev[k];
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      parts.push(`${k}=${String(v)}`);
    }
  }
  return parts.length ? parts.join(' · ') : '—';
}

// Encode the slug for URL inclusion only — keep it stable across links.
function slugUriPart(slug: string): string {
  return encodeURIComponent(slug);
}

// ─── Tasks tab ────────────────────────────────────────────────────────────────

interface TasksTabProps {
  slug: string;
  tasks: TaskManifest[] | null;
  loading: boolean;
  error: string | null;
  costByTask: Map<string, number>;
  qualityByTask: Map<string, number>;
  onRetry: () => void;
}

function TasksTab(p: TasksTabProps) {
  const [stageFilter, setStageFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  const stageOptions = p.tasks
    ? Array.from(new Set(p.tasks.map(t => t.stage))).filter(Boolean).sort()
    : [];

  const filtered = (() => {
    if (!p.tasks) return null;
    let list = p.tasks;
    if (stageFilter) list = list.filter(t => t.stage === stageFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(t =>
        (t.task_id || '').toLowerCase().includes(q) ||
        (t.title || '').toLowerCase().includes(q),
      );
    }
    return sortTasksByCreatedDesc(list);
  })();

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">
          Tasks{filtered !== null ? ` (${filtered.length})` : ''}
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            className="search-input"
            style={{ width: 160, paddingLeft: 14 }}
            value={stageFilter}
            onChange={e => setStageFilter(e.target.value)}
            aria-label="Filter by stage"
          >
            <option value="">All stages</option>
            {stageOptions.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <div className="search-box">
            <span className="search-icon" aria-hidden="true">⌕</span>
            <input
              className="search-input"
              placeholder="Search tasks…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search tasks"
            />
          </div>
        </div>
      </div>

      {p.loading && !p.tasks && (
        <div className="card-body"><LoadingBlock label="Loading tasks…" /></div>
      )}
      {p.error && !p.tasks && (
        <div className="card-body">
          <ErrorBlock message={`Failed to load tasks: ${p.error}.`} onRetry={p.onRetry} />
        </div>
      )}
      {filtered && filtered.length === 0 && (
        <div className="card-body">
          <EmptyBlock
            message={
              stageFilter || search
                ? `No tasks match the current filter.`
                : 'No tasks yet for this repository.'
            }
          />
        </div>
      )}
      {filtered && filtered.length > 0 && (
        <div className="card-body--flush">
          <div className="table-wrap">
            <table className="dt" aria-label="Tasks">
              <thead>
                <tr>
                  <th scope="col">Task ID</th>
                  <th scope="col">Title</th>
                  <th scope="col">Stage</th>
                  <th scope="col">Quality</th>
                  <th scope="col">Est. Cost</th>
                  <th scope="col">Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(task => {
                  const q = p.qualityByTask.get(task.task_id);
                  const c = p.costByTask.get(task.task_id);
                  return (
                    <tr key={task.task_id}>
                      <td className="col-id">
                        <Link
                          to={`/repo/${slugUriPart(p.slug)}/task/${task.task_id}`}
                          aria-label={`View task ${task.task_id}`}
                        >
                          {task.task_id}
                        </Link>
                      </td>
                      <td className="col-bone" title={task.title}>
                        {truncate(task.title, TITLE_TRUNCATE_MAX)}
                      </td>
                      <td><span className={stageBadgeClass(task.stage)}>{task.stage}</span></td>
                      <td className="col-mono col-dim">{formatQuality(q)}</td>
                      <td className="col-mono">
                        {c === undefined
                          ? <span className="col-dim">—</span>
                          : <span className="cost-val">{formatCost(c)}</span>}
                      </td>
                      <td className="col-mono col-dim">{formatDateShort(task.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Events tab ───────────────────────────────────────────────────────────────

interface EventsTabProps {
  slug: string;
  projectPath: string;
}

interface EventsResp { events: EventsFeedEntry[]; }

function EventsTab({ slug, projectPath }: EventsTabProps) {
  const result = usePollingData<EventsResp>(
    projectPath
      ? `/api/events-feed?limit=${EVENTS_TAB_LIMIT}&project=${encodeURIComponent(projectPath)}`
      : '',
    10000,
    { globalScope: true },
  );

  const events: EventsFeedEntry[] | null = (() => {
    const raw = result.data;
    if (!raw) return null;
    if (Array.isArray(raw)) return raw as unknown as EventsFeedEntry[];
    if (Array.isArray(raw.events)) return raw.events;
    return null;
  })();

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">
          Events{events !== null ? ` (${events.length})` : ''}
        </span>
      </div>
      {result.loading && !events && (
        <div className="card-body"><LoadingBlock label="Loading events…" /></div>
      )}
      {result.error && !events && (
        <div className="card-body">
          <ErrorBlock message={`Failed to load events: ${result.error}.`} onRetry={result.refetch} />
        </div>
      )}
      {events && events.length === 0 && (
        <div className="card-body"><EmptyBlock message="No recent events for this repository." /></div>
      )}
      {events && events.length > 0 && (
        <div className="card-body--flush">
          <div className="table-wrap">
            <table className="dt" aria-label="Events">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Type</th>
                  <th scope="col">Event</th>
                  <th scope="col">Repo</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev, i) => (
                  <tr key={`${ev.ts}-${i}`}>
                    <td className="col-mono col-dim">{formatDateShort(ev.ts)}</td>
                    <td><span className={eventChipClass(ev.event)}>{eventChipLabel(ev.event)}</span></td>
                    <td className="col-mono col-bone" title={ev.event}>
                      {ev.task_id
                        ? <Link to={`/repo/${slugUriPart(slug)}/task/${ev.task_id}`}>{truncate(ev.event, 40)}</Link>
                        : truncate(ev.event, 40)}
                    </td>
                    <td className="col-mono col-dim" title={ev.repo_slug}>
                      {truncate(ev.repo_slug, 32)}
                    </td>
                    <td className="col-mono col-dim" title={summarizeEventDetail(ev)}>
                      {truncate(summarizeEventDetail(ev), DETAIL_TRUNCATE_MAX)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Agents tab ───────────────────────────────────────────────────────────────

function AgentsTab({ projectPath }: { projectPath: string }) {
  const result = usePollingData<LearnedAgent[]>(
    projectPath ? `/api/agents?project=${encodeURIComponent(projectPath)}` : '',
    15000,
    { globalScope: true },
  );

  const agents: LearnedAgent[] | null = Array.isArray(result.data) ? result.data : null;

  const sorted = agents
    ? [...agents].sort((a, b) =>
        (b.benchmark_summary?.mean_composite ?? -Infinity) -
        (a.benchmark_summary?.mean_composite ?? -Infinity))
    : null;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">
          Learned Agents{sorted !== null ? ` (${sorted.length})` : ''}
        </span>
      </div>
      {result.loading && !agents && (
        <div className="card-body"><LoadingBlock label="Loading agents…" /></div>
      )}
      {result.error && !agents && (
        <div className="card-body">
          <ErrorBlock message={`Failed to load agents: ${result.error}.`} onRetry={result.refetch} />
        </div>
      )}
      {sorted && sorted.length === 0 && (
        <div className="card-body">
          <EmptyBlock message="No learned agents registered for this repository." />
        </div>
      )}
      {sorted && sorted.length > 0 && (
        <div className="card-body--flush">
          <div className="table-wrap">
            <table className="dt" aria-label="Learned agents">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Role</th>
                  <th scope="col">Score</th>
                  <th scope="col">Benchmark</th>
                  <th scope="col">Last Eval</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(agent => {
                  const score = agent.benchmark_summary?.mean_composite;
                  const samples = agent.benchmark_summary?.sample_count;
                  const evalAt = agent.last_evaluation?.evaluated_at;
                  const scoreCls =
                    score === undefined || score === null ? 'col-dim'
                    : score >= 0.8 ? ''
                    : score >= 0.5 ? ''
                    : '';
                  return (
                    <tr key={`${agent.agent_name}:${agent.task_type}`}>
                      <td className="col-mono col-bone" title={agent.agent_name}>
                        {truncate(agent.agent_name, 40)}
                      </td>
                      <td className="col-dim">{agent.role || '—'}</td>
                      <td className={`col-mono ${scoreCls}`}>
                        {score !== undefined && score !== null ? score.toFixed(3) : '—'}
                      </td>
                      <td className="col-mono col-dim">
                        {samples !== undefined ? `${samples} runs` : '—'}
                      </td>
                      <td className="col-mono col-dim">{formatRelative(evalAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Inner page ───────────────────────────────────────────────────────────────

interface InnerProps {
  slug: string;
  projectPath: string;
}

function RepoPageInner({ slug, projectPath }: InnerProps) {
  const [tab, setTab] = useState<TabKey>('overview');

  // Top-level tasks fetch — shared across stats bar, alert bar, overview, tasks
  const tasksResult = usePollingData<TasksShape>(
    projectPath ? `/api/tasks?project=${encodeURIComponent(projectPath)}` : '',
    10000,
    { globalScope: true },
  );

  // Retrospectives — for avg quality + per-task quality/cost overlay
  const retrosResult = usePollingData<TaskRetrospective[]>(
    projectPath ? `/api/retrospectives?project=${encodeURIComponent(projectPath)}` : '',
    30000,
    { globalScope: true },
  );

  // Recent events — used by overview tab
  const eventsResult = usePollingData<EventsResp>(
    projectPath
      ? `/api/events-feed?limit=${RECENT_EVENTS_LIMIT}&project=${encodeURIComponent(projectPath)}`
      : '',
    10000,
    { globalScope: true },
  );

  const tasks = normalizeTasks(tasksResult.data);
  const stalled = tasks ? stalledTaskCount(tasks) : 0;

  const retros = Array.isArray(retrosResult.data) ? retrosResult.data : null;
  const aggregate = aggregateRetros(retros);
  const avgQuality = average(aggregate.qualityScores);

  const events: EventsFeedEntry[] | null = (() => {
    const raw = eventsResult.data;
    if (!raw) return null;
    if (Array.isArray(raw)) return raw as unknown as EventsFeedEntry[];
    if (Array.isArray(raw.events)) return raw.events;
    return null;
  })();

  const handleRefreshAll = () => {
    tasksResult.refetch();
    retrosResult.refetch();
    eventsResult.refetch();
  };

  const display = shortName(slug);

  return (
    <div role="main" aria-label={`Repository ${display}`}>
      {/* Breadcrumb */}
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">home</Link>
        <span className="breadcrumb-sep" aria-hidden="true">/</span>
        <span
          className="breadcrumb-cur"
          title={slug}
          style={{
            maxWidth: 'min(60vw, 480px)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'inline-block',
            verticalAlign: 'bottom',
          }}
        >
          {display}
        </span>
      </nav>

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-eyebrow">Repository</div>
          <h1
            className="page-title"
            title={slug}
            style={{
              maxWidth: 'min(70vw, 720px)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {display}
          </h1>
        </div>
        <div className="page-header-actions">
          <DaemonChip projectPath={projectPath} />
          <button
            className="btn btn--ghost btn--sm"
            onClick={handleRefreshAll}
            disabled={tasksResult.loading && !tasks}
            aria-label="Refresh repository data"
          >
            {tasksResult.loading && !tasks ? 'refreshing…' : '↺ refresh'}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <StatsBar
        tasks={tasks}
        loading={tasksResult.loading}
        avgQuality={avgQuality}
      />

      {/* Stall alert */}
      {stalled > 0 && (
        <div className="alert-bar alert-bar--warn" role="alert" aria-live="polite">
          <span className="alert-dot" aria-hidden="true" />
          <span>
            {stalled} task{stalled !== 1 ? 's' : ''} may be stalled — non-terminal for over 2 hours.
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="page-tabs" role="tablist" aria-label="Repository sections">
        {TABS.map(t => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            id={`tab-${t.key}`}
            className={`page-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' && (
          <OverviewTab
            slug={slug}
            projectPath={projectPath}
            tasks={tasks}
            tasksLoading={tasksResult.loading}
            tasksError={tasksResult.error}
            avgQuality={avgQuality}
            qualityByTask={aggregate.qualityByTask}
            retroLoading={retrosResult.loading}
            retroError={retrosResult.error}
            events={events}
            eventsLoading={eventsResult.loading}
            eventsError={eventsResult.error}
            onRetryTasks={tasksResult.refetch}
            onRetryEvents={eventsResult.refetch}
          />
        )}
        {tab === 'tasks' && (
          <TasksTab
            slug={slug}
            tasks={tasks}
            loading={tasksResult.loading}
            error={tasksResult.error}
            costByTask={aggregate.costByTask}
            qualityByTask={aggregate.qualityByTask}
            onRetry={tasksResult.refetch}
          />
        )}
        {tab === 'events' && (
          <EventsTab slug={slug} projectPath={projectPath} />
        )}
        {tab === 'agents' && (
          <AgentsTab projectPath={projectPath} />
        )}
      </div>
    </div>
  );
}

// ─── Top-level export ─────────────────────────────────────────────────────────

export default function RepoPage() {
  const { slug: rawSlug } = useParams<{ slug: string }>();
  const slug = rawSlug ?? '';
  const projects = useProjectsSummary();

  // Initial registry load
  if (projects.loading && !projects.data) {
    return (
      <div role="main" aria-label="Loading repository">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/">home</Link>
          <span className="breadcrumb-sep" aria-hidden="true">/</span>
          <span className="breadcrumb-cur">{shortName(slug) || '…'}</span>
        </nav>
        <div className="card">
          <div className="card-body">
            <LoadingBlock label="Loading repository…" />
          </div>
        </div>
      </div>
    );
  }

  // Registry fetch failed and no cached data
  if (projects.error && !projects.data) {
    return (
      <div role="main" aria-label="Error loading repository">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/">home</Link>
          <span className="breadcrumb-sep" aria-hidden="true">/</span>
          <span className="breadcrumb-cur">error</span>
        </nav>
        <ErrorBlock
          message={`Unable to load project registry: ${projects.error}.`}
          onRetry={projects.refetch}
        />
        <div style={{ marginTop: 12 }}>
          <Link to="/" className="btn btn--ghost btn--sm" aria-label="Back to home">
            ← back to home
          </Link>
        </div>
      </div>
    );
  }

  // Resolve slug → project entry
  const project = (projects.data ?? []).find(p => p.slug === slug);
  if (!project) {
    return <NotFoundView slug={slug} />;
  }

  return <RepoPageInner slug={slug} projectPath={project.path} />;
}
