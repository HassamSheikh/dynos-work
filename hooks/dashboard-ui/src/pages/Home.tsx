import { useState, useMemo } from 'react';
import { Link } from 'react-router';
import { usePaletteIndex, useMachineSummary } from '../data/hooks';
import type { MachineSummary } from '../data/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const PATH_NOISE = /^(users|hassam|documents|home|library|local|workspace|projects|src|repos|code)$/i;

// Deterministic gradient palette — chosen to match the dynos color system.
// Each entry is [start, end] used in a 145° linear-gradient on the avatar.
const AVATAR_GRADIENTS: ReadonlyArray<readonly [string, string]> = [
  ['#4DA6FF', '#2DD4A8'], // blue → teal
  ['#7C3AED', '#4DA6FF'], // purple → blue
  ['#BDF000', '#2DD4A8'], // lime → teal
  ['#FF9F43', '#FF3B3B'], // orange → red
  ['#2DD4A8', '#BDF000'], // teal → lime
  ['#4DA6FF', '#7C3AED'], // blue → purple
  ['#FF9F43', '#BDF000'], // orange → lime
  ['#FF3B3B', '#FF9F43'], // red → orange
  ['#2DD4A8', '#4DA6FF'], // teal → blue
  ['#A78BFA', '#4DA6FF'], // violet → blue
  ['#34D399', '#BDF000'], // emerald → lime
  ['#F472B6', '#7C3AED'], // pink → purple
];

type SortKey = 'active' | 'failed' | 'risk' | 'name';

interface RepoStats {
  slug: string;
  displayName: string;
  initials: string;
  gradient: readonly [string, string];
  activeTasks: number;
  doneTasks: number;
  failedTasks: number;
  totalTasks: number;
  health: number;            // 0..100
  riskScore: number;         // for By Risk sort: failures + stalled
  latestStage: string | null;
  latestUpdatedIso: string | null;
}

// ─── Slug → identity helpers (deterministic) ──────────────────────────────────

function slugTokens(slug: string): string[] {
  return slug
    .split(/[-_/\\.]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0 && !PATH_NOISE.test(t));
}

function slugDisplayName(slug: string): string {
  const tokens = slugTokens(slug);
  if (tokens.length === 0) return slug;
  return tokens.join('-');
}

function slugInitials(slug: string): string {
  const tokens = slugTokens(slug);
  if (tokens.length >= 2) {
    const a = tokens[tokens.length - 2];
    const b = tokens[tokens.length - 1];
    return ((a[0] ?? '') + (b[0] ?? '')).toUpperCase() || slug.slice(0, 2).toUpperCase();
  }
  if (tokens.length === 1) {
    const t = tokens[0];
    return (t.length >= 2 ? t.slice(0, 2) : (t + t)).toUpperCase();
  }
  return slug.slice(0, 2).toUpperCase() || '··';
}

function slugHash(slug: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function slugGradient(slug: string): readonly [string, string] {
  return AVATAR_GRADIENTS[slugHash(slug) % AVATAR_GRADIENTS.length];
}

// ─── Stage → presentation helpers ─────────────────────────────────────────────

const TERMINAL_DONE = new Set(['DONE', 'CALIBRATED']);

function isFailedStage(stage: string): boolean {
  return stage.includes('FAIL');
}

function isActiveStage(stage: string): boolean {
  return !TERMINAL_DONE.has(stage) && !isFailedStage(stage);
}

type BadgeKind = 'ok' | 'err' | 'warn' | 'active' | 'info' | 'idle';

function stageBadgeKind(stage: string | null): BadgeKind {
  if (!stage) return 'idle';
  if (TERMINAL_DONE.has(stage)) return 'ok';
  if (isFailedStage(stage)) return 'err';
  if (stage.startsWith('REPAIR') || stage.includes('AUDIT')) return 'warn';
  if (stage === 'PLANNING' || stage.startsWith('SPEC')) return 'info';
  return 'active';
}

function statusBadgeForRepo(s: RepoStats): { kind: BadgeKind; label: string } {
  if (s.failedTasks > 0) return { kind: 'err', label: 'failing' };
  if (s.activeTasks > 0) return { kind: 'active', label: 'live' };
  if (s.totalTasks > 0)  return { kind: 'ok',     label: 'idle' };
  return { kind: 'idle', label: 'empty' };
}

function healthColor(h: number): 'lime' | 'teal' | 'orange' | 'red' {
  if (h > 80) return 'lime';
  if (h > 60) return 'teal';
  if (h > 40) return 'orange';
  return 'red';
}

function statTileColor(h: number): '' | 'lime' | 'teal' | 'orange' | 'red' {
  if (h > 80) return 'lime';
  if (h > 60) return 'teal';
  if (h > 40) return 'orange';
  return 'red';
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const sec = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (sec < 60)        return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60)        return `${min}m ago`;
  const hr  = Math.round(min / 60);
  if (hr  < 24)        return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30)        return `${day}d ago`;
  const mo  = Math.round(day / 30);
  if (mo  < 12)        return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatTile({
  label, value, tone, sub,
}: {
  label: string;
  value: string | number;
  tone?: '' | 'lime' | 'teal' | 'red' | 'orange' | 'blue';
  sub?: string;
}) {
  const toneCls = tone ? ` ${tone}` : '';
  const valTone = tone === 'lime' || tone === 'teal' || tone === 'red' || tone === 'orange'
    ? ` ${tone}`
    : '';
  return (
    <div className={`stat-tile${toneCls}`}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value${valTone}`}>{value}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </div>
  );
}

function RepoCard({ stats }: { stats: RepoStats }) {
  const [g0, g1] = stats.gradient;
  const status = statusBadgeForRepo(stats);
  const healthCls = healthColor(stats.health);

  const activeTone = stats.activeTasks > 0 ? 'teal' : '';
  const doneTone   = stats.doneTasks   > 0 ? 'teal' : '';
  const failedTone = stats.failedTasks > 0 ? 'red'  : '';

  return (
    <Link
      to={`/repo/${encodeURIComponent(stats.slug)}`}
      className="repo-card"
      aria-label={`Open ${stats.displayName}: ${stats.activeTasks} active, ${stats.failedTasks} failed, ${stats.doneTasks} done`}
    >
      <div className="repo-card-head">
        <div
          className="repo-avatar"
          aria-hidden="true"
          style={{
            background: `linear-gradient(145deg, ${g0} 0%, ${g1} 100%)`,
            color: '#0F1114',
          }}
        >
          {stats.initials}
        </div>
        <div className="repo-info">
          <div className="repo-name" title={stats.displayName}>{stats.displayName}</div>
          <div className="repo-slug" title={stats.slug}>{stats.slug}</div>
        </div>
        <span className={`badge ${status.kind}`} aria-label={`status: ${status.label}`}>
          {status.label}
        </span>
      </div>

      <div className="repo-card-stats">
        <div className="mini-stat">
          <div className="mini-label">Active</div>
          <div className={`mini-value${activeTone ? ` ${activeTone}` : ''}`}>{stats.activeTasks}</div>
        </div>
        <div className="mini-stat">
          <div className="mini-label">Done</div>
          <div className={`mini-value${doneTone ? ` ${doneTone}` : ''}`}>{stats.doneTasks}</div>
        </div>
        <div className="mini-stat">
          <div className="mini-label">Failed</div>
          <div className={`mini-value${failedTone ? ` ${failedTone}` : ''}`}>{stats.failedTasks}</div>
        </div>
      </div>

      <div
        className="health-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(stats.health)}
        aria-label={`health ${Math.round(stats.health)} percent`}
        style={{ margin: '0 18px' }}
      >
        <div
          className={`health-fill ${healthCls}`}
          style={{ width: `${Math.max(2, Math.min(100, stats.health))}%` }}
        />
      </div>

      <div className="repo-card-foot">
        {stats.latestStage ? (
          <span className={`badge ${stageBadgeKind(stats.latestStage)}`}>
            {stats.latestStage.toLowerCase()}
          </span>
        ) : (
          <span className="badge idle">no stage</span>
        )}
        <span className="repo-updated">{relativeTime(stats.latestUpdatedIso)}</span>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const palette = usePaletteIndex();
  const machine = useMachineSummary();
  const [sort, setSort] = useState<SortKey>('active');
  const [search, setSearch] = useState('');

  const repoStats = useMemo<RepoStats[]>(() => {
    const repos = palette.data?.repos ?? [];
    const tasks = palette.data?.tasks ?? [];
    return repos.map(repo => {
      const rt = tasks.filter(t => t.repo_slug === repo.slug);
      const active = rt.filter(t => isActiveStage(t.stage));
      const done   = rt.filter(t => TERMINAL_DONE.has(t.stage));
      const failed = rt.filter(t => isFailedStage(t.stage));
      const denominator = active.length + done.length + failed.length || 1;
      const health = (done.length / denominator) * 100;
      const latest = active[0] ?? failed[0] ?? rt[0] ?? null;
      return {
        slug: repo.slug,
        displayName: slugDisplayName(repo.name || repo.slug),
        initials: slugInitials(repo.name || repo.slug),
        gradient: slugGradient(repo.slug),
        activeTasks: active.length,
        doneTasks: done.length,
        failedTasks: failed.length,
        totalTasks: rt.length,
        health,
        riskScore: failed.length * 3 + active.length,
        latestStage: latest?.stage ?? null,
        latestUpdatedIso: null,
      };
    });
  }, [palette.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = repoStats;
    if (q) {
      list = list.filter(
        r => r.slug.toLowerCase().includes(q) || r.displayName.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'active': return b.activeTasks - a.activeTasks || a.displayName.localeCompare(b.displayName);
        case 'failed': return b.failedTasks - a.failedTasks || b.activeTasks - a.activeTasks;
        case 'risk':   return b.riskScore   - a.riskScore   || b.failedTasks - a.failedTasks;
        case 'name':
        default:       return a.displayName.localeCompare(b.displayName);
      }
    });
  }, [repoStats, sort, search]);

  // ─── Aggregate metrics for header tiles ─────────────────────────────────────
  const m: MachineSummary | null = machine.data;
  const totalRepos = palette.data?.repos.length ?? 0;
  const totalTasks = palette.data?.tasks.length ?? 0;
  const doneTotal  = repoStats.reduce((s, r) => s + r.doneTasks, 0);
  const activeTotal = m?.active_tasks ?? repoStats.reduce((s, r) => s + r.activeTasks, 0);
  const failedTotal = repoStats.reduce((s, r) => s + r.failedTasks, 0);
  const avgHealth = totalTasks > 0 ? (doneTotal / totalTasks) * 100 : 0;
  const stalled = m?.stalled_agents?.length ?? 0;
  const errRate = m?.error_rate ?? 0;
  const tokensPerMin = m?.token_burn_rate_per_min ?? 0;

  const isCriticalAlert = stalled > 3 || errRate > 0.1;
  const isWarningAlert  = !isCriticalAlert && (stalled > 0 || errRate > 0);

  const initialLoading = palette.loading && !palette.data;
  const hasError = !!palette.error && !palette.data;

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-eyebrow">Foundry · Control Room</div>
          <div className="page-title">Repositories</div>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => { palette.refetch(); machine.refetch(); }}
            aria-label="Refresh repository data"
          >
            refresh
          </button>
        </div>
      </div>

      {/* Global summary header */}
      <div className="stats-bar" role="group" aria-label="Machine summary">
        <StatTile
          label="Total Repos"
          value={totalRepos}
          tone="lime"
          sub={totalRepos === 0 ? 'none registered' : `${totalTasks} tasks tracked`}
        />
        <StatTile
          label="Active Tasks"
          value={activeTotal}
          tone={activeTotal > 0 ? 'teal' : ''}
          sub={activeTotal > 0 ? 'in flight' : 'idle'}
        />
        <StatTile
          label="Failing Tasks"
          value={failedTotal}
          tone={failedTotal > 0 ? 'red' : ''}
          sub={failedTotal > 0 ? 'needs attention' : 'clean'}
        />
        <StatTile
          label="Avg Health"
          value={`${Math.round(avgHealth)}%`}
          tone={statTileColor(avgHealth)}
          sub={totalTasks === 0 ? 'no signal' : `${doneTotal}/${totalTasks} done`}
        />
        <StatTile
          label="Tokens / min"
          value={tokensPerMin.toLocaleString()}
          sub={m ? `${m.active_agents} agents` : '—'}
        />
      </div>

      {/* Alert bar */}
      {isCriticalAlert && (
        <div className="alert-bar alert-bar--crit" role="alert">
          <div className="alert-dot" />
          <span>
            {stalled > 0 ? `${stalled} stalled task${stalled === 1 ? '' : 's'}` : null}
            {stalled > 0 && errRate > 0 ? ' · ' : null}
            {errRate > 0 ? `error rate ${(errRate * 100).toFixed(1)}%` : null}
          </span>
        </div>
      )}
      {!isCriticalAlert && isWarningAlert && (
        <div className="alert-bar alert-bar--warn" role="status">
          <div className="alert-dot" />
          <span>
            {stalled > 0 ? `${stalled} stalled task${stalled === 1 ? '' : 's'}` : null}
            {stalled > 0 && errRate > 0 ? ' · ' : null}
            {errRate > 0 ? `error rate ${(errRate * 100).toFixed(1)}%` : null}
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-tabs" role="tablist" aria-label="Sort repositories">
          {([
            ['active', 'Most Active'],
            ['failed', 'Has Failures'],
            ['risk',   'By Risk'],
            ['name',   'A–Z'],
          ] as ReadonlyArray<readonly [SortKey, string]>).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={sort === key}
              className={`tab-pill${sort === key ? ' active' : ''}`}
              onClick={() => setSort(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <div className="search-box">
            <span className="search-icon" aria-hidden="true">⌕</span>
            <input
              className="search-input"
              type="search"
              placeholder="Search repos…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search repositories by name or slug"
            />
          </div>
        </div>
      </div>

      {/* Body states */}
      {initialLoading && (
        <div className="loading-row">loading repositories…</div>
      )}

      {hasError && (
        <div className="alert-bar alert-bar--crit" role="alert">
          <div className="alert-dot" />
          <span>Failed to load repositories: {palette.error}</span>
        </div>
      )}

      {!initialLoading && !hasError && filtered.length === 0 && (
        <div className="empty-state">
          {search.trim()
            ? `No repositories match "${search.trim()}". Try a different query.`
            : totalRepos === 0
              ? 'No repositories registered yet. Run a task in any repo to populate the foundry.'
              : 'No repositories match the current filter.'}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="repo-grid">
          {filtered.map(repo => <RepoCard key={repo.slug} stats={repo} />)}
        </div>
      )}
    </>
  );
}
