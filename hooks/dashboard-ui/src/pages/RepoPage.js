import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
// ─── Constants ────────────────────────────────────────────────────────────────
const STALL_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
const TERMINAL_SET = new Set(TERMINAL_STAGES);
const TITLE_TRUNCATE_MAX = 80;
const DETAIL_TRUNCATE_MAX = 100;
const RECENT_TASKS_LIMIT = 8;
const RECENT_EVENTS_LIMIT = 10;
const EVENTS_TAB_LIMIT = 50;
const PATH_NOISE_PARTS = new Set([
    'users', 'hassam', 'documents', 'home', 'library', 'local',
]);
// ─── Pure helpers ─────────────────────────────────────────────────────────────
function shortName(slug) {
    if (!slug)
        return '—';
    const parts = slug.split('-').filter(p => p.length > 0 && !PATH_NOISE_PARTS.has(p.toLowerCase()));
    if (parts.length === 0)
        return slug;
    return parts.join('-');
}
function shortPath(p) {
    if (!p)
        return '—';
    return p.replace(/^\/?Users\/[^/]+\/Documents\//, '~/');
}
function formatDateShort(iso) {
    if (!iso)
        return '—';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime()))
            return '—';
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${mo}/${day} ${hh}:${mm}`;
    }
    catch {
        return '—';
    }
}
function formatDate(iso) {
    if (!iso)
        return '—';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime()))
            return '—';
        return (`${d.getFullYear()}-` +
            `${String(d.getMonth() + 1).padStart(2, '0')}-` +
            `${String(d.getDate()).padStart(2, '0')}`);
    }
    catch {
        return '—';
    }
}
function formatRelative(iso) {
    if (!iso)
        return '—';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime()))
            return '—';
        const diffMs = Date.now() - d.getTime();
        const sec = Math.round(diffMs / 1000);
        if (sec < 60)
            return `${sec}s ago`;
        const min = Math.round(sec / 60);
        if (min < 60)
            return `${min}m ago`;
        const hr = Math.round(min / 60);
        if (hr < 24)
            return `${hr}h ago`;
        const days = Math.round(hr / 24);
        return `${days}d ago`;
    }
    catch {
        return '—';
    }
}
function formatCost(val) {
    if (val === null || val === undefined || Number.isNaN(val))
        return '—';
    return `$${val.toFixed(2)}`;
}
function formatQuality(val) {
    if (val === null || val === undefined || Number.isNaN(val))
        return '—';
    return val.toFixed(3);
}
function truncate(s, max) {
    if (!s)
        return '—';
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
function stageBadgeClass(stage) {
    const s = (stage ?? '').toUpperCase();
    if (s === 'DONE' || s === 'CALIBRATED')
        return 'badge ok';
    if (s.includes('FAIL'))
        return 'badge err';
    if (s.includes('AUDIT'))
        return 'badge info';
    if (s.startsWith('REPAIR'))
        return 'badge warn';
    if (s === 'PLANNING' || s.startsWith('SPEC'))
        return 'badge idle';
    return 'badge active';
}
function eventChipClass(event) {
    const e = (event ?? '').toLowerCase();
    if (e.includes('denied') || e.includes('deny'))
        return 'event-chip denied';
    if (e.includes('postmortem') || e.includes('post-mortem'))
        return 'event-chip post';
    if (e.includes('repair'))
        return 'event-chip repair';
    if (e.includes('stage') || e.includes('transition'))
        return 'event-chip stage';
    return 'event-chip';
}
function eventChipLabel(event) {
    const e = (event ?? '').toLowerCase();
    if (e.includes('denied') || e.includes('deny'))
        return 'denied';
    if (e.includes('postmortem') || e.includes('post-mortem'))
        return 'postmortem';
    if (e.includes('repair'))
        return 'repair';
    if (e.includes('stage') || e.includes('transition'))
        return 'stage';
    return 'event';
}
function healthFillColor(active, failed, total) {
    if (total === 0)
        return 'lime';
    const failRatio = failed / Math.max(total, 1);
    if (failRatio >= 0.25)
        return 'red';
    if (failRatio >= 0.10)
        return 'orange';
    if (active > 0)
        return 'lime';
    return 'teal';
}
function healthFillPercent(done, total) {
    if (total === 0)
        return 0;
    return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}
// ─── Stall detection ──────────────────────────────────────────────────────────
function stalledTaskCount(tasks) {
    const now = Date.now();
    let n = 0;
    for (const t of tasks) {
        if (TERMINAL_SET.has(t.stage))
            continue;
        try {
            const ts = new Date(t.created_at).getTime();
            if (!isNaN(ts) && now - ts > STALL_THRESHOLD_MS)
                n += 1;
        }
        catch {
            /* ignore */
        }
    }
    return n;
}
// ─── 404 view ─────────────────────────────────────────────────────────────────
function NotFoundView({ slug }) {
    return (_jsxs("div", { role: "main", "aria-label": "Repository not found", children: [_jsxs("nav", { className: "breadcrumb", "aria-label": "Breadcrumb", children: [_jsx(Link, { to: "/", children: "home" }), _jsx("span", { className: "breadcrumb-sep", "aria-hidden": "true", children: "/" }), _jsx("span", { className: "breadcrumb-cur", children: "not found" })] }), _jsx("div", { className: "card", children: _jsx("div", { className: "card-body", children: _jsxs("div", { className: "empty-state", role: "status", children: [_jsx("div", { style: { marginBottom: 12, fontSize: 14, color: 'var(--bone)', fontWeight: 600 }, children: "Repository not found" }), _jsxs("div", { style: { marginBottom: 16 }, children: ["No registered project matches the slug ", _jsx("code", { children: slug || '(empty)' }), "."] }), _jsx(Link, { to: "/", className: "btn btn--ghost btn--sm", "aria-label": "Back to home", children: "\u2190 back to home" })] }) }) })] }));
}
// ─── Daemon status chip ───────────────────────────────────────────────────────
function DaemonChip({ projectPath }) {
    const result = usePollingData(projectPath ? `/api/maintainer-status?project=${encodeURIComponent(projectPath)}` : '', 15000, { globalScope: true });
    if (result.loading && !result.data) {
        return _jsx("span", { className: "badge idle", "aria-label": "Daemon status loading", children: "\u2026" });
    }
    if (result.error && !result.data) {
        return _jsx("span", { className: "badge warn", "aria-label": "Daemon status unavailable", children: "unknown" });
    }
    const running = result.data?.running === true;
    return (_jsx("span", { className: running ? 'badge ok' : 'badge idle', "aria-label": running ? 'Daemon running' : 'Daemon stopped', children: running ? 'RUNNING' : 'STOPPED' }));
}
const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'events', label: 'Events' },
    { key: 'agents', label: 'Agents' },
];
// ─── Reusable section helpers ─────────────────────────────────────────────────
function LoadingBlock({ label }) {
    return (_jsx("div", { className: "loading-row", role: "status", "aria-label": label, children: label }));
}
function ErrorBlock({ message, onRetry, }) {
    return (_jsxs("div", { className: "alert-bar alert-bar--crit", role: "alert", children: [_jsx("span", { className: "alert-dot", "aria-hidden": "true" }), _jsx("span", { style: { flex: 1 }, children: message }), onRetry && (_jsx("button", { className: "btn btn--ghost btn--sm", onClick: onRetry, "aria-label": "Retry", children: "retry" }))] }));
}
function EmptyBlock({ message }) {
    return (_jsx("div", { className: "empty-state", role: "status", children: message }));
}
function normalizeTasks(raw) {
    if (!raw)
        return null;
    if (Array.isArray(raw))
        return raw;
    const maybe = raw;
    if (Array.isArray(maybe.tasks))
        return maybe.tasks;
    return null;
}
function sortTasksByCreatedDesc(tasks) {
    return [...tasks].sort((a, b) => {
        const ta = new Date(a.created_at).getTime() || 0;
        const tb = new Date(b.created_at).getTime() || 0;
        return tb - ta;
    });
}
function aggregateRetros(retros) {
    const qualityScores = [];
    const costByTask = new Map();
    const qualityByTask = new Map();
    if (!retros)
        return { qualityScores, costByTask, qualityByTask };
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
function average(nums) {
    if (nums.length === 0)
        return null;
    const sum = nums.reduce((a, b) => a + b, 0);
    return sum / nums.length;
}
function StatsBar({ tasks, loading, avgQuality }) {
    const active = tasks ? tasks.filter(t => !TERMINAL_SET.has(t.stage)).length : null;
    const done = tasks ? tasks.filter(t => t.stage === 'DONE' || t.stage === 'CALIBRATED').length : null;
    const failed = tasks ? tasks.filter(t => (t.stage || '').toUpperCase().includes('FAIL')).length : null;
    const fmt = (n) => loading && n === null ? '…' : (n === null ? '—' : String(n));
    return (_jsxs("div", { className: "stats-bar", role: "region", "aria-label": "Repository stats", children: [_jsxs("div", { className: "stat-tile lime", children: [_jsx("div", { className: "stat-label", children: "Active Tasks" }), _jsx("div", { className: "stat-value lime", "aria-label": `Active tasks: ${active ?? 'unknown'}`, children: fmt(active) }), _jsx("div", { className: "stat-sub", children: "non-terminal" })] }), _jsxs("div", { className: "stat-tile teal", children: [_jsx("div", { className: "stat-label", children: "Done Tasks" }), _jsx("div", { className: "stat-value teal", "aria-label": `Done tasks: ${done ?? 'unknown'}`, children: fmt(done) }), _jsx("div", { className: "stat-sub", children: "DONE + CALIBRATED" })] }), _jsxs("div", { className: "stat-tile red", children: [_jsx("div", { className: "stat-label", children: "Failed Tasks" }), _jsx("div", { className: "stat-value red", "aria-label": `Failed tasks: ${failed ?? 'unknown'}`, children: fmt(failed) }), _jsx("div", { className: "stat-sub", children: "includes *FAIL*" })] }), _jsxs("div", { className: "stat-tile orange", children: [_jsx("div", { className: "stat-label", children: "Avg Quality" }), _jsx("div", { className: 'stat-value ' +
                            (avgQuality === null
                                ? ''
                                : avgQuality >= 0.8 ? 'teal'
                                    : avgQuality >= 0.5 ? 'orange'
                                        : 'red'), "aria-label": `Average quality: ${avgQuality === null ? 'unknown' : avgQuality.toFixed(3)}`, children: avgQuality === null ? '—' : avgQuality.toFixed(2) }), _jsx("div", { className: "stat-sub", children: "from retrospectives" })] })] }));
}
function OverviewTab(p) {
    const total = p.tasks?.length ?? 0;
    const active = p.tasks ? p.tasks.filter(t => !TERMINAL_SET.has(t.stage)).length : 0;
    const done = p.tasks ? p.tasks.filter(t => t.stage === 'DONE' || t.stage === 'CALIBRATED').length : 0;
    const failed = p.tasks ? p.tasks.filter(t => (t.stage || '').toUpperCase().includes('FAIL')).length : 0;
    const lastUpdated = p.tasks && p.tasks.length
        ? sortTasksByCreatedDesc(p.tasks)[0].created_at
        : null;
    const recent = p.tasks ? sortTasksByCreatedDesc(p.tasks).slice(0, RECENT_TASKS_LIMIT) : null;
    const trustScore = p.avgQuality;
    const healthCls = healthFillColor(active, failed, total);
    const healthPct = healthFillPercent(done, total);
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsx("span", { className: "card-title", children: "Repo Summary" }) }), _jsxs("div", { className: "card-body", children: [_jsxs("div", { style: { marginBottom: 18 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 6 }, children: [_jsx("span", { className: "stat-label", style: { marginBottom: 0 }, children: "Health" }), _jsxs("span", { className: "stat-sub", style: { marginTop: 0 }, children: [done, "/", total, " done \u00B7 ", failed, " failed"] })] }), _jsx("div", { className: "health-track", "aria-label": `Health ${healthPct}%`, children: _jsx("div", { className: `health-fill ${healthCls}`, style: { width: `${healthPct}%` }, role: "progressbar", "aria-valuenow": healthPct, "aria-valuemin": 0, "aria-valuemax": 100 }) })] }), _jsxs("div", { className: "kv", children: [_jsx("div", { className: "kv-key", children: "Path" }), _jsx("div", { className: "kv-val", title: p.projectPath, children: shortPath(p.projectPath) }), _jsx("div", { className: "kv-key", children: "Active tasks" }), _jsx("div", { className: "kv-val", children: p.tasksLoading && !p.tasks ? '…' : active }), _jsx("div", { className: "kv-key", children: "Last updated" }), _jsx("div", { className: "kv-val", children: formatRelative(lastUpdated) }), _jsx("div", { className: "kv-key", children: "Trust score" }), _jsx("div", { className: "kv-val", children: p.retroLoading && trustScore === null
                                            ? '…'
                                            : trustScore === null
                                                ? '—'
                                                : formatQuality(trustScore) })] })] })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsx("span", { className: "card-title", children: "Recent Tasks" }) }), p.tasksLoading && !p.tasks && (_jsx("div", { className: "card-body", children: _jsx(LoadingBlock, { label: "Loading tasks\u2026" }) })), p.tasksError && !p.tasks && (_jsx("div", { className: "card-body", children: _jsx(ErrorBlock, { message: `Failed to load tasks: ${p.tasksError}.`, onRetry: p.onRetryTasks }) })), recent && recent.length === 0 && (_jsx("div", { className: "card-body", children: _jsx(EmptyBlock, { message: "No tasks yet for this repository." }) })), recent && recent.length > 0 && (_jsx("div", { className: "card-body--flush", children: _jsx("div", { className: "table-wrap", children: _jsxs("table", { className: "dt", "aria-label": "Recent tasks", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Task ID" }), _jsx("th", { scope: "col", children: "Title" }), _jsx("th", { scope: "col", children: "Stage" }), _jsx("th", { scope: "col", children: "Quality" }), _jsx("th", { scope: "col", children: "Created" })] }) }), _jsx("tbody", { children: recent.map(task => {
                                            const q = p.qualityByTask.get(task.task_id);
                                            return (_jsxs("tr", { children: [_jsx("td", { className: "col-id", children: _jsx(Link, { to: `/repo/${slugUriPart(p.slug)}/task/${task.task_id}`, children: task.task_id }) }), _jsx("td", { className: "col-bone", title: task.title, children: truncate(task.title, TITLE_TRUNCATE_MAX) }), _jsx("td", { children: _jsx("span", { className: stageBadgeClass(task.stage), children: task.stage }) }), _jsx("td", { className: "col-mono col-dim", children: formatQuality(q) }), _jsx("td", { className: "col-mono col-dim", children: formatRelative(task.created_at) })] }, task.task_id));
                                        }) })] }) }) }))] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsx("span", { className: "card-title", children: "Recent Events" }) }), p.eventsLoading && !p.events && (_jsx("div", { className: "card-body", children: _jsx(LoadingBlock, { label: "Loading events\u2026" }) })), p.eventsError && !p.events && (_jsx("div", { className: "card-body", children: _jsx(ErrorBlock, { message: `Failed to load events: ${p.eventsError}.`, onRetry: p.onRetryEvents }) })), p.events && p.events.length === 0 && (_jsx("div", { className: "card-body", children: _jsx(EmptyBlock, { message: "No recent events for this repository." }) })), p.events && p.events.length > 0 && (_jsx("div", { className: "card-body--flush", children: _jsx("div", { className: "table-wrap", children: _jsxs("table", { className: "dt", "aria-label": "Recent events", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Time" }), _jsx("th", { scope: "col", children: "Type" }), _jsx("th", { scope: "col", children: "Event" }), _jsx("th", { scope: "col", children: "Detail" })] }) }), _jsx("tbody", { children: p.events.slice(0, RECENT_EVENTS_LIMIT).map((ev, i) => (_jsxs("tr", { children: [_jsx("td", { className: "col-mono col-dim", children: formatDateShort(ev.ts) }), _jsx("td", { children: _jsx("span", { className: eventChipClass(ev.event), children: eventChipLabel(ev.event) }) }), _jsx("td", { className: "col-mono col-bone", title: ev.event, children: truncate(ev.event, 40) }), _jsx("td", { className: "col-mono col-dim", title: summarizeEventDetail(ev), children: truncate(summarizeEventDetail(ev), DETAIL_TRUNCATE_MAX) })] }, `${ev.ts}-${i}`))) })] }) }) }))] })] }));
}
function summarizeEventDetail(ev) {
    // pick a few common payload fields without exposing huge JSON
    const keys = ['stage', 'task_id', 'agent', 'role', 'reason', 'path', 'mode', 'status'];
    const parts = [];
    for (const k of keys) {
        const v = ev[k];
        if (v === undefined || v === null)
            continue;
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            parts.push(`${k}=${String(v)}`);
        }
    }
    return parts.length ? parts.join(' · ') : '—';
}
// Encode the slug for URL inclusion only — keep it stable across links.
function slugUriPart(slug) {
    return encodeURIComponent(slug);
}
function TasksTab(p) {
    const [stageFilter, setStageFilter] = useState('');
    const [search, setSearch] = useState('');
    const stageOptions = p.tasks
        ? Array.from(new Set(p.tasks.map(t => t.stage))).filter(Boolean).sort()
        : [];
    const filtered = (() => {
        if (!p.tasks)
            return null;
        let list = p.tasks;
        if (stageFilter)
            list = list.filter(t => t.stage === stageFilter);
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            list = list.filter(t => (t.task_id || '').toLowerCase().includes(q) ||
                (t.title || '').toLowerCase().includes(q));
        }
        return sortTasksByCreatedDesc(list);
    })();
    return (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "card-header", children: [_jsxs("span", { className: "card-title", children: ["Tasks", filtered !== null ? ` (${filtered.length})` : ''] }), _jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center' }, children: [_jsxs("select", { className: "search-input", style: { width: 160, paddingLeft: 14 }, value: stageFilter, onChange: e => setStageFilter(e.target.value), "aria-label": "Filter by stage", children: [_jsx("option", { value: "", children: "All stages" }), stageOptions.map(s => (_jsx("option", { value: s, children: s }, s)))] }), _jsxs("div", { className: "search-box", children: [_jsx("span", { className: "search-icon", "aria-hidden": "true", children: "\u2315" }), _jsx("input", { className: "search-input", placeholder: "Search tasks\u2026", value: search, onChange: e => setSearch(e.target.value), "aria-label": "Search tasks" })] })] })] }), p.loading && !p.tasks && (_jsx("div", { className: "card-body", children: _jsx(LoadingBlock, { label: "Loading tasks\u2026" }) })), p.error && !p.tasks && (_jsx("div", { className: "card-body", children: _jsx(ErrorBlock, { message: `Failed to load tasks: ${p.error}.`, onRetry: p.onRetry }) })), filtered && filtered.length === 0 && (_jsx("div", { className: "card-body", children: _jsx(EmptyBlock, { message: stageFilter || search
                        ? `No tasks match the current filter.`
                        : 'No tasks yet for this repository.' }) })), filtered && filtered.length > 0 && (_jsx("div", { className: "card-body--flush", children: _jsx("div", { className: "table-wrap", children: _jsxs("table", { className: "dt", "aria-label": "Tasks", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Task ID" }), _jsx("th", { scope: "col", children: "Title" }), _jsx("th", { scope: "col", children: "Stage" }), _jsx("th", { scope: "col", children: "Quality" }), _jsx("th", { scope: "col", children: "Est. Cost" }), _jsx("th", { scope: "col", children: "Created" })] }) }), _jsx("tbody", { children: filtered.map(task => {
                                    const q = p.qualityByTask.get(task.task_id);
                                    const c = p.costByTask.get(task.task_id);
                                    return (_jsxs("tr", { children: [_jsx("td", { className: "col-id", children: _jsx(Link, { to: `/repo/${slugUriPart(p.slug)}/task/${task.task_id}`, "aria-label": `View task ${task.task_id}`, children: task.task_id }) }), _jsx("td", { className: "col-bone", title: task.title, children: truncate(task.title, TITLE_TRUNCATE_MAX) }), _jsx("td", { children: _jsx("span", { className: stageBadgeClass(task.stage), children: task.stage }) }), _jsx("td", { className: "col-mono col-dim", children: formatQuality(q) }), _jsx("td", { className: "col-mono", children: c === undefined
                                                    ? _jsx("span", { className: "col-dim", children: "\u2014" })
                                                    : _jsx("span", { className: "cost-val", children: formatCost(c) }) }), _jsx("td", { className: "col-mono col-dim", children: formatDateShort(task.created_at) })] }, task.task_id));
                                }) })] }) }) }))] }));
}
function EventsTab({ slug, projectPath }) {
    const result = usePollingData(projectPath
        ? `/api/events-feed?limit=${EVENTS_TAB_LIMIT}&project=${encodeURIComponent(projectPath)}`
        : '', 10000, { globalScope: true });
    const events = (() => {
        const raw = result.data;
        if (!raw)
            return null;
        if (Array.isArray(raw))
            return raw;
        if (Array.isArray(raw.events))
            return raw.events;
        return null;
    })();
    return (_jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsxs("span", { className: "card-title", children: ["Events", events !== null ? ` (${events.length})` : ''] }) }), result.loading && !events && (_jsx("div", { className: "card-body", children: _jsx(LoadingBlock, { label: "Loading events\u2026" }) })), result.error && !events && (_jsx("div", { className: "card-body", children: _jsx(ErrorBlock, { message: `Failed to load events: ${result.error}.`, onRetry: result.refetch }) })), events && events.length === 0 && (_jsx("div", { className: "card-body", children: _jsx(EmptyBlock, { message: "No recent events for this repository." }) })), events && events.length > 0 && (_jsx("div", { className: "card-body--flush", children: _jsx("div", { className: "table-wrap", children: _jsxs("table", { className: "dt", "aria-label": "Events", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Time" }), _jsx("th", { scope: "col", children: "Type" }), _jsx("th", { scope: "col", children: "Event" }), _jsx("th", { scope: "col", children: "Repo" }), _jsx("th", { scope: "col", children: "Detail" })] }) }), _jsx("tbody", { children: events.map((ev, i) => (_jsxs("tr", { children: [_jsx("td", { className: "col-mono col-dim", children: formatDateShort(ev.ts) }), _jsx("td", { children: _jsx("span", { className: eventChipClass(ev.event), children: eventChipLabel(ev.event) }) }), _jsx("td", { className: "col-mono col-bone", title: ev.event, children: ev.task_id
                                                ? _jsx(Link, { to: `/repo/${slugUriPart(slug)}/task/${ev.task_id}`, children: truncate(ev.event, 40) })
                                                : truncate(ev.event, 40) }), _jsx("td", { className: "col-mono col-dim", title: ev.repo_slug, children: truncate(ev.repo_slug, 32) }), _jsx("td", { className: "col-mono col-dim", title: summarizeEventDetail(ev), children: truncate(summarizeEventDetail(ev), DETAIL_TRUNCATE_MAX) })] }, `${ev.ts}-${i}`))) })] }) }) }))] }));
}
// ─── Agents tab ───────────────────────────────────────────────────────────────
function AgentsTab({ projectPath }) {
    const result = usePollingData(projectPath ? `/api/agents?project=${encodeURIComponent(projectPath)}` : '', 15000, { globalScope: true });
    const agents = Array.isArray(result.data) ? result.data : null;
    const sorted = agents
        ? [...agents].sort((a, b) => (b.benchmark_summary?.mean_composite ?? -Infinity) -
            (a.benchmark_summary?.mean_composite ?? -Infinity))
        : null;
    return (_jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsxs("span", { className: "card-title", children: ["Learned Agents", sorted !== null ? ` (${sorted.length})` : ''] }) }), result.loading && !agents && (_jsx("div", { className: "card-body", children: _jsx(LoadingBlock, { label: "Loading agents\u2026" }) })), result.error && !agents && (_jsx("div", { className: "card-body", children: _jsx(ErrorBlock, { message: `Failed to load agents: ${result.error}.`, onRetry: result.refetch }) })), sorted && sorted.length === 0 && (_jsx("div", { className: "card-body", children: _jsx(EmptyBlock, { message: "No learned agents registered for this repository." }) })), sorted && sorted.length > 0 && (_jsx("div", { className: "card-body--flush", children: _jsx("div", { className: "table-wrap", children: _jsxs("table", { className: "dt", "aria-label": "Learned agents", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Name" }), _jsx("th", { scope: "col", children: "Role" }), _jsx("th", { scope: "col", children: "Score" }), _jsx("th", { scope: "col", children: "Benchmark" }), _jsx("th", { scope: "col", children: "Last Eval" })] }) }), _jsx("tbody", { children: sorted.map(agent => {
                                    const score = agent.benchmark_summary?.mean_composite;
                                    const samples = agent.benchmark_summary?.sample_count;
                                    const evalAt = agent.last_evaluation?.evaluated_at;
                                    const scoreCls = score === undefined || score === null ? 'col-dim'
                                        : score >= 0.8 ? ''
                                            : score >= 0.5 ? ''
                                                : '';
                                    return (_jsxs("tr", { children: [_jsx("td", { className: "col-mono col-bone", title: agent.agent_name, children: truncate(agent.agent_name, 40) }), _jsx("td", { className: "col-dim", children: agent.role || '—' }), _jsx("td", { className: `col-mono ${scoreCls}`, children: score !== undefined && score !== null ? score.toFixed(3) : '—' }), _jsx("td", { className: "col-mono col-dim", children: samples !== undefined ? `${samples} runs` : '—' }), _jsx("td", { className: "col-mono col-dim", children: formatRelative(evalAt) })] }, `${agent.agent_name}:${agent.task_type}`));
                                }) })] }) }) }))] }));
}
function RepoPageInner({ slug, projectPath }) {
    const [tab, setTab] = useState('overview');
    // Top-level tasks fetch — shared across stats bar, alert bar, overview, tasks
    const tasksResult = usePollingData(projectPath ? `/api/tasks?project=${encodeURIComponent(projectPath)}` : '', 10000, { globalScope: true });
    // Retrospectives — for avg quality + per-task quality/cost overlay
    const retrosResult = usePollingData(projectPath ? `/api/retrospectives?project=${encodeURIComponent(projectPath)}` : '', 30000, { globalScope: true });
    // Recent events — used by overview tab
    const eventsResult = usePollingData(projectPath
        ? `/api/events-feed?limit=${RECENT_EVENTS_LIMIT}&project=${encodeURIComponent(projectPath)}`
        : '', 10000, { globalScope: true });
    const tasks = normalizeTasks(tasksResult.data);
    const stalled = tasks ? stalledTaskCount(tasks) : 0;
    const retros = Array.isArray(retrosResult.data) ? retrosResult.data : null;
    const aggregate = aggregateRetros(retros);
    const avgQuality = average(aggregate.qualityScores);
    const events = (() => {
        const raw = eventsResult.data;
        if (!raw)
            return null;
        if (Array.isArray(raw))
            return raw;
        if (Array.isArray(raw.events))
            return raw.events;
        return null;
    })();
    const handleRefreshAll = () => {
        tasksResult.refetch();
        retrosResult.refetch();
        eventsResult.refetch();
    };
    const display = shortName(slug);
    return (_jsxs("div", { role: "main", "aria-label": `Repository ${display}`, children: [_jsxs("nav", { className: "breadcrumb", "aria-label": "Breadcrumb", children: [_jsx(Link, { to: "/", children: "home" }), _jsx("span", { className: "breadcrumb-sep", "aria-hidden": "true", children: "/" }), _jsx("span", { className: "breadcrumb-cur", title: slug, style: {
                            maxWidth: 'min(60vw, 480px)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            display: 'inline-block',
                            verticalAlign: 'bottom',
                        }, children: display })] }), _jsxs("div", { className: "page-header", children: [_jsxs("div", { className: "page-header-left", children: [_jsx("div", { className: "page-eyebrow", children: "Repository" }), _jsx("h1", { className: "page-title", title: slug, style: {
                                    maxWidth: 'min(70vw, 720px)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }, children: display })] }), _jsxs("div", { className: "page-header-actions", children: [_jsx(DaemonChip, { projectPath: projectPath }), _jsx("button", { className: "btn btn--ghost btn--sm", onClick: handleRefreshAll, disabled: tasksResult.loading && !tasks, "aria-label": "Refresh repository data", children: tasksResult.loading && !tasks ? 'refreshing…' : '↺ refresh' })] })] }), _jsx(StatsBar, { tasks: tasks, loading: tasksResult.loading, avgQuality: avgQuality }), stalled > 0 && (_jsxs("div", { className: "alert-bar alert-bar--warn", role: "alert", "aria-live": "polite", children: [_jsx("span", { className: "alert-dot", "aria-hidden": "true" }), _jsxs("span", { children: [stalled, " task", stalled !== 1 ? 's' : '', " may be stalled \u2014 non-terminal for over 2 hours."] })] })), _jsx("div", { className: "page-tabs", role: "tablist", "aria-label": "Repository sections", children: TABS.map(t => (_jsx("button", { role: "tab", "aria-selected": tab === t.key, "aria-controls": `panel-${t.key}`, id: `tab-${t.key}`, className: `page-tab${tab === t.key ? ' active' : ''}`, onClick: () => setTab(t.key), children: t.label }, t.key))) }), _jsxs("div", { role: "tabpanel", id: `panel-${tab}`, "aria-labelledby": `tab-${tab}`, children: [tab === 'overview' && (_jsx(OverviewTab, { slug: slug, projectPath: projectPath, tasks: tasks, tasksLoading: tasksResult.loading, tasksError: tasksResult.error, avgQuality: avgQuality, qualityByTask: aggregate.qualityByTask, retroLoading: retrosResult.loading, retroError: retrosResult.error, events: events, eventsLoading: eventsResult.loading, eventsError: eventsResult.error, onRetryTasks: tasksResult.refetch, onRetryEvents: eventsResult.refetch })), tab === 'tasks' && (_jsx(TasksTab, { slug: slug, tasks: tasks, loading: tasksResult.loading, error: tasksResult.error, costByTask: aggregate.costByTask, qualityByTask: aggregate.qualityByTask, onRetry: tasksResult.refetch })), tab === 'events' && (_jsx(EventsTab, { slug: slug, projectPath: projectPath })), tab === 'agents' && (_jsx(AgentsTab, { projectPath: projectPath }))] })] }));
}
// ─── Top-level export ─────────────────────────────────────────────────────────
export default function RepoPage() {
    const { slug: rawSlug } = useParams();
    const slug = rawSlug ?? '';
    const projects = useProjectsSummary();
    // Initial registry load
    if (projects.loading && !projects.data) {
        return (_jsxs("div", { role: "main", "aria-label": "Loading repository", children: [_jsxs("nav", { className: "breadcrumb", "aria-label": "Breadcrumb", children: [_jsx(Link, { to: "/", children: "home" }), _jsx("span", { className: "breadcrumb-sep", "aria-hidden": "true", children: "/" }), _jsx("span", { className: "breadcrumb-cur", children: shortName(slug) || '…' })] }), _jsx("div", { className: "card", children: _jsx("div", { className: "card-body", children: _jsx(LoadingBlock, { label: "Loading repository\u2026" }) }) })] }));
    }
    // Registry fetch failed and no cached data
    if (projects.error && !projects.data) {
        return (_jsxs("div", { role: "main", "aria-label": "Error loading repository", children: [_jsxs("nav", { className: "breadcrumb", "aria-label": "Breadcrumb", children: [_jsx(Link, { to: "/", children: "home" }), _jsx("span", { className: "breadcrumb-sep", "aria-hidden": "true", children: "/" }), _jsx("span", { className: "breadcrumb-cur", children: "error" })] }), _jsx(ErrorBlock, { message: `Unable to load project registry: ${projects.error}.`, onRetry: projects.refetch }), _jsx("div", { style: { marginTop: 12 }, children: _jsx(Link, { to: "/", className: "btn btn--ghost btn--sm", "aria-label": "Back to home", children: "\u2190 back to home" }) })] }));
    }
    // Resolve slug → project entry
    const project = (projects.data ?? []).find(p => p.slug === slug);
    if (!project) {
        return _jsx(NotFoundView, { slug: slug });
    }
    return _jsx(RepoPageInner, { slug: slug, projectPath: project.path });
}
