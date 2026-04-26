import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * TaskDetail.tsx — single-task forensic view.
 * Route: /repo/:slug/task/:taskId
 *
 * Styling: design-system classes only. No Tailwind.
 */
import { useState } from 'react';
import { useParams, Link } from 'react-router';
import { usePollingData, useProjectsSummary } from '../data/hooks';
// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
function fmt(iso) {
    if (!iso)
        return '—';
    try {
        return new Date(iso).toLocaleString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false,
        });
    }
    catch {
        return iso;
    }
}
function fmtTime(iso) {
    if (!iso)
        return '—';
    try {
        return new Date(iso).toLocaleTimeString(undefined, {
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        });
    }
    catch {
        return iso;
    }
}
function fmtCost(val, digits = 2) {
    if (val == null || Number.isNaN(val))
        return '—';
    return `$${val.toFixed(digits)}`;
}
function fmtNum(val) {
    if (val == null || Number.isNaN(val))
        return '—';
    return val.toLocaleString();
}
function shortRepoName(slug) {
    if (!slug)
        return '—';
    const parts = slug.split('/');
    return parts[parts.length - 1] || slug;
}
// ---------------------------------------------------------------------------
// Stage badge mapping
// ---------------------------------------------------------------------------
function stageBadgeClass(stage) {
    const s = stage.toUpperCase();
    if (s === 'DONE')
        return 'badge ok';
    if (s.includes('FAIL') || s === 'ABORTED')
        return 'badge err';
    if (s.startsWith('REPAIR'))
        return 'badge warn';
    if (s.includes('AUDIT'))
        return 'badge info';
    if (s === 'PLANNING' || s.startsWith('SPEC_') || s === 'PLAN_REVIEW')
        return 'badge active';
    if (s === 'IDLE' || s === 'FOUNDRY_INITIALIZED')
        return 'badge idle';
    return 'badge active';
}
// ---------------------------------------------------------------------------
// Event-type chip mapping
// ---------------------------------------------------------------------------
function eventChipClass(event) {
    const e = event.toLowerCase();
    if (e.includes('denied') || e.includes('fail') || e.includes('error'))
        return 'event-chip denied';
    if (e.includes('repair'))
        return 'event-chip repair';
    if (e.includes('post') || e.includes('audit'))
        return 'event-chip post';
    if (e.includes('stage') || e.includes('transition'))
        return 'event-chip stage';
    return 'event-chip';
}
// ---------------------------------------------------------------------------
// Canonical 15-stage ordering
// ---------------------------------------------------------------------------
const STAGE_ORDER = [
    'FOUNDRY_INITIALIZED',
    'DISCOVERY',
    'SPEC_NORMALIZATION',
    'SPEC_REVIEW',
    'PLANNING',
    'PLAN_REVIEW',
    'PLAN_AUDIT',
    'PRE_EXECUTION_SNAPSHOT',
    'EXECUTION',
    'TEST_EXECUTION',
    'CHECKPOINT_AUDIT',
    'REPAIR_PLANNING',
    'REPAIR_EXECUTION',
    'FINAL_AUDIT',
    'DONE',
];
// ---------------------------------------------------------------------------
// Quality score color
// ---------------------------------------------------------------------------
function qualityColor(score) {
    if (score == null)
        return 'var(--dim)';
    if (score > 0.8)
        return 'var(--lime)';
    if (score > 0.6)
        return 'var(--teal)';
    if (score > 0.4)
        return 'var(--orange)';
    return 'var(--red)';
}
// ---------------------------------------------------------------------------
// Page-level loading skeleton
// ---------------------------------------------------------------------------
function PageLoadingSkeleton() {
    return (_jsxs("div", { role: "status", "aria-label": "Loading task details", children: [_jsx("nav", { className: "breadcrumb", "aria-label": "Breadcrumb", children: _jsx("span", { className: "breadcrumb-cur", style: { color: 'var(--dim)' }, children: "\u2026" }) }), _jsx("div", { className: "page-header", children: _jsxs("div", { className: "page-header-left", children: [_jsx("div", { className: "page-eyebrow", children: "Task" }), _jsx("div", { className: "page-title", style: {
                                width: 320,
                                height: 28,
                                background: 'var(--glass-b)',
                                borderRadius: 4,
                            }, "aria-hidden": "true" })] }) }), _jsx("div", { className: "card", children: _jsx("div", { className: "card-body", children: _jsx("div", { className: "loading-row", children: "Loading task\u2026" }) }) })] }));
}
function PageError({ message, slug, onRetry }) {
    return (_jsxs("div", { role: "alert", children: [_jsxs("div", { className: "alert-bar --crit", children: [_jsx("span", { className: "alert-dot", "aria-hidden": "true" }), _jsx("span", { style: { flex: 1 }, children: message }), onRetry && (_jsx("button", { className: "btn --ghost --sm", onClick: onRetry, "aria-label": "Retry loading task", style: { marginLeft: 12, flexShrink: 0 }, children: "Retry" }))] }), _jsxs(Link, { to: slug ? `/repo/${slug}` : '/', className: "btn --ghost --sm", "aria-label": slug ? `Back to ${slug}` : 'Back to home', style: { marginTop: 12, display: 'inline-block' }, children: ["\u2190 ", slug ? `Back to ${shortRepoName(slug)}` : 'Back to home'] })] }));
}
// ---------------------------------------------------------------------------
// 404 not-found state
// ---------------------------------------------------------------------------
function TaskNotFound({ taskId, slug }) {
    return (_jsxs("div", { role: "main", "aria-label": "Task not found", style: {
            minHeight: '60vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: 48,
            textAlign: 'center',
        }, children: [_jsx("div", { style: {
                    fontFamily: 'var(--font-mono)',
                    fontSize: 48,
                    color: 'var(--dim)',
                    letterSpacing: '0.05em',
                }, children: "404" }), _jsx("p", { style: { margin: 0, fontSize: 18, fontWeight: 500 }, children: "Task not found" }), _jsx("p", { style: {
                    margin: 0,
                    color: 'var(--dim)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    wordBreak: 'break-all',
                    maxWidth: 480,
                }, children: taskId || '(no task id)' }), _jsx("p", { style: { margin: 0, color: 'var(--dim)', fontSize: 13, maxWidth: 360 }, children: "No manifest exists for this task ID in this repository." }), _jsxs(Link, { to: `/repo/${slug}`, className: "btn --ghost --sm", "aria-label": `Back to ${slug}`, children: ["\u2190 Back to ", shortRepoName(slug)] })] }));
}
// ---------------------------------------------------------------------------
// Alert bar — conditional based on stage
// ---------------------------------------------------------------------------
function AlertBar({ stage, failureReason }) {
    const s = stage.toUpperCase();
    if (s.includes('FAIL') || s === 'ABORTED') {
        return (_jsxs("div", { className: "alert-bar --crit", role: "alert", children: [_jsx("span", { className: "alert-dot", "aria-hidden": "true" }), _jsxs("span", { children: ["Task failed", failureReason && (_jsxs(_Fragment, { children: [' — ', _jsx("span", { style: { fontFamily: 'var(--font-mono)', fontSize: 12 }, children: failureReason })] }))] })] }));
    }
    if (s === 'DONE') {
        return (_jsxs("div", { className: "alert-bar --ok", role: "status", children: [_jsx("span", { className: "alert-dot", "aria-hidden": "true" }), _jsx("span", { children: "Task completed successfully" })] }));
    }
    if (s.startsWith('REPAIR')) {
        return (_jsxs("div", { className: "alert-bar --warn", role: "status", children: [_jsx("span", { className: "alert-dot", "aria-hidden": "true" }), _jsx("span", { children: "Repair cycle in progress" })] }));
    }
    return null;
}
// ---------------------------------------------------------------------------
// 4-tile stats bar
// ---------------------------------------------------------------------------
function StatsBar({ manifest }) {
    const quality = manifest.quality_score;
    const cost = manifest.total_cost_usd;
    const taskType = manifest.classification?.task_type || manifest.task_type || '—';
    return (_jsxs("div", { className: "stats-bar", role: "region", "aria-label": "Task summary", children: [_jsxs("div", { className: "stat-tile", children: [_jsx("span", { className: "stat-label", children: "Stage" }), _jsx("span", { className: "stat-value", children: _jsx("span", { className: stageBadgeClass(manifest.stage), children: manifest.stage }) })] }), _jsxs("div", { className: "stat-tile", children: [_jsx("span", { className: "stat-label", children: "Quality Score" }), _jsx("span", { className: "stat-value", style: { color: qualityColor(quality), fontFamily: 'var(--font-mono)' }, "aria-label": `Quality score: ${quality != null ? quality.toFixed(3) : 'unavailable'}`, children: quality != null ? quality.toFixed(3) : '—' })] }), _jsxs("div", { className: "stat-tile", children: [_jsx("span", { className: "stat-label", children: "Est. Cost" }), _jsx("span", { className: "stat-value cost-val", style: { color: 'var(--lime)', fontFamily: 'var(--font-mono)' }, "aria-label": `Estimated cost: ${cost != null ? fmtCost(cost) : 'unavailable'}`, children: cost != null ? fmtCost(cost) : '—' })] }), _jsxs("div", { className: "stat-tile", children: [_jsx("span", { className: "stat-label", children: "Task Type" }), _jsx("span", { className: "stat-value", style: {
                            fontFamily: 'var(--font-mono)',
                            fontSize: 14,
                            color: 'var(--bone)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '100%',
                        }, title: taskType, children: taskType })] })] }));
}
const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'receipts', label: 'Receipts' },
    { id: 'audit', label: 'Audit' },
    { id: 'events', label: 'Events' },
    { id: 'raw', label: 'Raw' },
];
function PageTabs({ active, onChange }) {
    return (_jsx("div", { className: "page-tabs", role: "tablist", "aria-label": "Task sections", children: TABS.map((t) => (_jsx("button", { role: "tab", "aria-selected": active === t.id, "aria-controls": `panel-${t.id}`, id: `tab-${t.id}`, className: 'page-tab' + (active === t.id ? ' active' : ''), onClick: () => onChange(t.id), children: t.label }, t.id))) }));
}
// ---------------------------------------------------------------------------
// Overview tab — Metadata + Stage Timeline + Cost Breakdown
// ---------------------------------------------------------------------------
function MetadataCard({ manifest }) {
    const quality = manifest.quality_score;
    const cost = manifest.total_cost_usd;
    const taskType = manifest.classification?.task_type || manifest.task_type || '—';
    return (_jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsx("span", { className: "card-title", children: "Metadata" }) }), _jsx("div", { className: "card-body", children: _jsxs("div", { className: "kv", children: [_jsx("div", { className: "kv-key", children: "task_id" }), _jsx("div", { className: "kv-val", style: { fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }, children: manifest.task_id }), _jsx("div", { className: "kv-key", children: "title" }), _jsx("div", { className: "kv-val", style: { wordBreak: 'break-word' }, children: manifest.title || '—' }), _jsx("div", { className: "kv-key", children: "stage" }), _jsx("div", { className: "kv-val", children: _jsx("span", { className: stageBadgeClass(manifest.stage), children: manifest.stage }) }), _jsx("div", { className: "kv-key", children: "created" }), _jsx("div", { className: "kv-val", style: { fontFamily: 'var(--font-mono)' }, children: fmt(manifest.created_at) }), _jsx("div", { className: "kv-key", children: "quality" }), _jsx("div", { className: "kv-val", style: { fontFamily: 'var(--font-mono)', color: qualityColor(quality) }, children: quality != null ? quality.toFixed(3) : '—' }), _jsx("div", { className: "kv-key", children: "cost" }), _jsx("div", { className: "kv-val cost-val", style: { fontFamily: 'var(--font-mono)', color: 'var(--lime)' }, children: cost != null ? fmtCost(cost, 4) : '—' }), _jsx("div", { className: "kv-key", children: "type" }), _jsx("div", { className: "kv-val", style: { fontFamily: 'var(--font-mono)' }, children: taskType }), _jsx("div", { className: "kv-key", children: "task_type" }), _jsx("div", { className: "kv-val", style: { fontFamily: 'var(--font-mono)' }, children: manifest.task_type || '—' })] }) })] }));
}
function StageTimelineCard({ manifest, events, eventsLoading, }) {
    const currentStage = manifest.stage.toUpperCase();
    const isFailed = currentStage.includes('FAIL') || currentStage === 'ABORTED';
    // Map of stage_name → ts from stage_transition events
    const timestamps = {};
    for (const ev of events?.events ?? []) {
        if (ev.event === 'stage_transition' && typeof ev.to === 'string') {
            timestamps[ev.to] = ev.ts;
        }
    }
    const currentIdx = STAGE_ORDER.indexOf(currentStage);
    return (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "card-header", children: [_jsx("span", { className: "card-title", children: "Stage Timeline" }), eventsLoading && !events && (_jsx("span", { style: {
                            fontSize: 11,
                            color: 'var(--dim)',
                            fontFamily: 'var(--font-mono)',
                        }, children: "loading\u2026" }))] }), _jsx("div", { className: "card-body", children: _jsx("ol", { className: "stage-timeline", style: { listStyle: 'none', margin: 0, padding: 0 }, children: STAGE_ORDER.map((stage, idx) => {
                        const isPast = currentIdx >= 0 && idx < currentIdx;
                        const isCurrent = stage === currentStage;
                        const isFailedHere = isFailed && isCurrent;
                        let dotClass = 'stage-dot';
                        if (isFailedHere)
                            dotClass = 'stage-dot failed';
                        else if (isCurrent)
                            dotClass = 'stage-dot current';
                        else if (isPast)
                            dotClass = 'stage-dot done';
                        const ts = timestamps[stage];
                        return (_jsxs("li", { className: "stage-row", children: [_jsx("span", { className: dotClass, "aria-hidden": "true" }), _jsx("span", { className: "stage-name", style: {
                                        color: isFailedHere
                                            ? 'var(--red)'
                                            : isCurrent
                                                ? 'var(--bone)'
                                                : isPast
                                                    ? 'var(--bone)'
                                                    : 'var(--dim)',
                                        fontWeight: isCurrent ? 600 : 400,
                                    }, children: stage.replace(/_/g, ' ') }), _jsx("span", { className: "stage-ts", style: {
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: 11,
                                        color: 'var(--dim)',
                                    }, children: ts ? fmtTime(ts) : (isPast || isCurrent) ? '—' : '' })] }, stage));
                    }) }) })] }));
}
function CostBreakdownCard({ manifest }) {
    const rows = manifest.cost_breakdown ?? [];
    return (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "card-header", children: [_jsx("span", { className: "card-title", children: "Cost Breakdown" }), rows.length > 0 && (_jsxs("span", { style: {
                            fontSize: 12,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--dim)',
                        }, children: [rows.length, " model", rows.length !== 1 ? 's' : ''] }))] }), rows.length === 0 ? (_jsx("div", { className: "card-body", children: _jsx("div", { className: "empty-state", role: "status", children: "No cost breakdown recorded for this task yet." }) })) : (_jsx("div", { className: "card-body--flush", children: _jsx("div", { className: "table-wrap", children: _jsxs("table", { className: "dt", "aria-label": "Cost breakdown by model", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Model" }), _jsx("th", { scope: "col", style: { textAlign: 'right' }, children: "Input tok" }), _jsx("th", { scope: "col", style: { textAlign: 'right' }, children: "Output tok" }), _jsx("th", { scope: "col", style: { textAlign: 'right' }, children: "Est. USD" })] }) }), _jsx("tbody", { children: rows.map((row, idx) => (_jsxs("tr", { children: [_jsx("td", { className: "col-mono", children: row.model || '—' }), _jsx("td", { className: "col-mono col-dim", style: { textAlign: 'right' }, children: fmtNum(row.input_tokens) }), _jsx("td", { className: "col-mono col-dim", style: { textAlign: 'right' }, children: fmtNum(row.output_tokens) }), _jsx("td", { className: "col-mono cost-val", style: { textAlign: 'right', color: 'var(--lime)' }, children: row.estimated_usd != null ? fmtCost(row.estimated_usd, 4) : '—' })] }, `${row.model ?? 'unknown'}-${idx}`))) })] }) }) }))] }));
}
// ---------------------------------------------------------------------------
// Receipts tab
// ---------------------------------------------------------------------------
function ReceiptsCard({ receipts, loading, error, onRetry, }) {
    const list = receipts?.receipts ?? [];
    const expected = receipts?.expected ?? [];
    const presentSet = new Set(list.map((r) => r.filename.toLowerCase()));
    const allNames = [
        ...list.map((r) => r.filename),
        ...expected.filter((e) => !presentSet.has(e.toLowerCase())),
    ];
    const presentCount = list.length;
    const expectedCount = Math.max(allNames.length, expected.length);
    return (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "card-header", children: [_jsx("span", { className: "card-title", children: "Trust Receipts" }), receipts != null && (_jsxs("span", { style: {
                            fontSize: 12,
                            fontFamily: 'var(--font-mono)',
                            color: presentCount < expectedCount ? 'var(--red)' : 'var(--lime)',
                        }, children: [presentCount, " present / ", expectedCount, " expected"] }))] }), loading && !receipts && (_jsx("div", { className: "card-body", children: _jsx("div", { className: "loading-row", children: "Loading receipts\u2026" }) })), error && !receipts && (_jsx("div", { className: "card-body", role: "alert", children: _jsxs("div", { className: "alert-bar --crit", style: { marginBottom: 0 }, children: [_jsx("span", { className: "alert-dot", "aria-hidden": "true" }), _jsxs("span", { style: { flex: 1 }, children: ["Failed to load receipts: ", error] }), _jsx("button", { className: "btn --ghost --sm", onClick: onRetry, "aria-label": "Retry loading receipts", children: "Retry" })] }) })), receipts != null && allNames.length === 0 && (_jsx("div", { className: "card-body", children: _jsx("div", { className: "empty-state", role: "status", children: "No receipts expected for this task." }) })), receipts != null && allNames.length > 0 && (_jsx("div", { className: "card-body--flush", children: _jsx("div", { className: "table-wrap", children: _jsxs("table", { className: "dt", "aria-label": "Trust receipts", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Name" }), _jsx("th", { scope: "col", style: { width: 80, textAlign: 'center' }, children: "Status" })] }) }), _jsx("tbody", { children: allNames.map((name) => {
                                    const present = presentSet.has(name.toLowerCase());
                                    return (_jsxs("tr", { children: [_jsx("td", { className: "col-mono", children: name }), _jsx("td", { style: { textAlign: 'center' }, children: _jsx("span", { "aria-label": present ? 'Present' : 'Missing', style: {
                                                        fontFamily: 'var(--font-mono)',
                                                        fontWeight: 700,
                                                        fontSize: 14,
                                                        color: present ? 'var(--teal)' : 'var(--red)',
                                                    }, children: present ? '✓' : '✗' }) })] }, name));
                                }) })] }) }) }))] }));
}
// ---------------------------------------------------------------------------
// Audit tab
// ---------------------------------------------------------------------------
function AuditTab({ auditSummary, loading, error, onRetry, }) {
    const reports = auditSummary?.reports ?? [];
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "section-label", children: "\u2500\u2500 AUDIT REPORTS" }), loading && !auditSummary && (_jsx("div", { className: "card", children: _jsx("div", { className: "card-body", children: _jsx("div", { className: "loading-row", children: "Loading audit reports\u2026" }) }) })), error && !auditSummary && (_jsx("div", { role: "alert", children: _jsxs("div", { className: "alert-bar --crit", children: [_jsx("span", { className: "alert-dot", "aria-hidden": "true" }), _jsxs("span", { style: { flex: 1 }, children: ["Failed to load audit reports: ", error] }), _jsx("button", { className: "btn --ghost --sm", onClick: onRetry, "aria-label": "Retry loading audit reports", children: "Retry" })] }) })), auditSummary != null && reports.length === 0 && (_jsx("div", { className: "card", children: _jsx("div", { className: "card-body", children: _jsx("div", { className: "empty-state", role: "status", children: "No audit reports generated yet." }) }) })), auditSummary != null && reports.length > 0 && (_jsx("div", { className: "card", children: _jsx("div", { className: "card-body", children: reports.map((report, idx) => {
                        const name = report.auditor_name ?? `Report ${idx + 1}`;
                        const findings = report.findings ?? [];
                        const blockingCount = findings.filter((f) => f.blocking).length;
                        const totalCount = findings.length;
                        const color = blockingCount > 0
                            ? 'var(--red)'
                            : totalCount > 0
                                ? 'var(--orange)'
                                : 'var(--lime)';
                        const raw = report.raw ?? JSON.stringify(report, null, 2);
                        return (_jsxs("details", { className: "collapse", children: [_jsxs("summary", { children: [_jsx("span", { style: { flex: 1 }, children: name }), _jsxs("span", { style: {
                                                color,
                                                fontSize: 11,
                                                marginLeft: 8,
                                                fontFamily: 'var(--font-mono)',
                                            }, children: [totalCount, " finding", totalCount !== 1 ? 's' : '', blockingCount > 0 && ` (${blockingCount} blocking)`] })] }), _jsx("pre", { children: raw })] }, idx));
                    }) }) }))] }));
}
// ---------------------------------------------------------------------------
// Events tab
// ---------------------------------------------------------------------------
function EventsTab({ events, loading, error, onRetry, }) {
    const list = events?.events ?? [];
    return (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "card-header", children: [_jsx("span", { className: "card-title", children: "Events" }), events != null && (_jsxs("span", { style: {
                            fontSize: 12,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--dim)',
                        }, children: [list.length, " event", list.length !== 1 ? 's' : ''] }))] }), loading && !events && (_jsx("div", { className: "card-body", children: _jsx("div", { className: "loading-row", children: "Loading events\u2026" }) })), error && !events && (_jsx("div", { className: "card-body", role: "alert", children: _jsxs("div", { className: "alert-bar --crit", style: { marginBottom: 0 }, children: [_jsx("span", { className: "alert-dot", "aria-hidden": "true" }), _jsxs("span", { style: { flex: 1 }, children: ["Failed to load events: ", error] }), _jsx("button", { className: "btn --ghost --sm", onClick: onRetry, "aria-label": "Retry loading events", children: "Retry" })] }) })), events != null && list.length === 0 && (_jsx("div", { className: "card-body", children: _jsx("div", { className: "empty-state", role: "status", "aria-live": "polite", children: "No events recorded yet." }) })), events != null && list.length > 0 && (_jsx("div", { className: "card-body--flush", children: _jsx("div", { className: "table-wrap", style: { maxHeight: 540, overflowY: 'auto' }, role: "log", "aria-label": "Task events", "aria-live": "polite", children: _jsxs("table", { className: "dt", "aria-label": "Events table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", style: { width: 90 }, children: "Time" }), _jsx("th", { scope: "col", style: { width: 130 }, children: "Type" }), _jsx("th", { scope: "col", children: "Event" }), _jsx("th", { scope: "col", children: "Detail" })] }) }), _jsx("tbody", { children: list.map((ev, idx) => {
                                    const detail = ev.detail != null ? String(ev.detail) : '—';
                                    return (_jsxs("tr", { children: [_jsx("td", { className: "col-mono col-dim", style: { whiteSpace: 'nowrap', fontSize: 11 }, children: fmtTime(ev.ts) }), _jsx("td", { children: _jsx("span", { className: eventChipClass(ev.event), children: ev.event.replace(/_/g, ' ') }) }), _jsx("td", { className: "col-mono", style: {
                                                    maxWidth: 260,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }, title: ev.event, children: ev.event }), _jsx("td", { className: "col-mono col-dim", style: {
                                                    maxWidth: 360,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                    fontSize: 11,
                                                }, title: detail !== '—' ? detail : undefined, children: detail })] }, `${ev.ts}-${idx}`));
                                }) })] }) }) }))] }));
}
function rawString(file) {
    if (!file)
        return '';
    if (typeof file.raw === 'string' && file.raw.length > 0)
        return file.raw;
    if (file.data != null)
        return JSON.stringify(file.data, null, 2);
    return '';
}
function fileExists(file) {
    if (!file)
        return false;
    if (file.exists === false)
        return false;
    return file.data != null || (typeof file.raw === 'string' && file.raw.length > 0);
}
function RawTab({ manifest, repairLog, executionGraph, repairLoading, executionGraphLoading, }) {
    const manifestText = JSON.stringify(manifest, null, 2);
    const repairExists = fileExists(repairLog);
    const graphExists = fileExists(executionGraph);
    return (_jsx("div", { className: "card", children: _jsxs("div", { className: "card-body", children: [_jsx("div", { className: "section-label", children: "\u2500\u2500 manifest.json" }), _jsxs("details", { className: "collapse", children: [_jsxs("summary", { children: ["manifest.json (", manifestText.length.toLocaleString(), " bytes)"] }), _jsx("pre", { children: manifestText })] }), _jsx("div", { className: "divider" }), _jsx("div", { className: "section-label", children: "\u2500\u2500 repair-log.json" }), repairLoading && !repairLog ? (_jsx("div", { className: "loading-row", children: "Loading repair log\u2026" })) : repairExists ? (_jsxs("details", { className: "collapse", children: [_jsx("summary", { children: "repair-log.json" }), _jsx("pre", { children: rawString(repairLog) })] })) : (_jsx("div", { className: "empty-state", role: "status", children: "No repair log for this task." })), _jsx("div", { className: "divider" }), _jsx("div", { className: "section-label", children: "\u2500\u2500 execution-graph.json" }), executionGraphLoading && !executionGraph ? (_jsx("div", { className: "loading-row", children: "Loading execution graph\u2026" })) : graphExists ? (_jsxs("details", { className: "collapse", children: [_jsx("summary", { children: "execution-graph.json" }), _jsx("pre", { children: rawString(executionGraph) })] })) : (_jsx("div", { className: "empty-state", role: "status", children: "No execution graph for this task." }))] }) }));
}
// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function TaskDetail() {
    const { slug, taskId } = useParams();
    const [activeTab, setActiveTab] = useState('overview');
    // Step 1 — resolve slug to project path
    const { data: projects, loading: projLoading, error: projError, refetch: projRefetch, } = useProjectsSummary(30000);
    const projectPath = projects && slug ? projects.find((p) => p.slug === slug)?.path ?? null : null;
    function taskUrl(endpoint, extra = '') {
        if (!projectPath || !taskId)
            return '';
        return `/api/${endpoint}?project=${encodeURIComponent(projectPath)}&task=${encodeURIComponent(taskId)}${extra}`;
    }
    // Manifest — 5s polling
    const { data: manifest, loading: manifestLoading, error: manifestError, refetch: manifestRefetch, } = usePollingData(taskUrl('task-manifest'), 5000, { globalScope: true });
    // Audit summary — 10s
    const { data: auditSummary, loading: auditLoading, error: auditError, refetch: auditRefetch, } = usePollingData(taskUrl('audit-summary'), 10000, {
        globalScope: true,
    });
    // Receipts — 10s
    const { data: receipts, loading: receiptsLoading, error: receiptsError, refetch: receiptsRefetch, } = usePollingData(taskUrl('receipts'), 10000, {
        globalScope: true,
    });
    // Events — 5s, limit 100
    const { data: events, loading: eventsLoading, error: eventsError, refetch: eventsRefetch, } = usePollingData(taskUrl('events', '&limit=100'), 5000, {
        globalScope: true,
    });
    // Repair log — 30s (only used in Raw tab)
    const { data: repairLog, loading: repairLogLoading, } = usePollingData(taskUrl('repair-log'), 30000, {
        globalScope: true,
    });
    // Execution graph — 30s (only used in Raw tab)
    const { data: executionGraph, loading: executionGraphLoading, } = usePollingData(taskUrl('execution-graph'), 30000, {
        globalScope: true,
    });
    // -------------------------------------------------------------------------
    // Guards
    // -------------------------------------------------------------------------
    if (projLoading && !projects) {
        return _jsx(PageLoadingSkeleton, {});
    }
    if (projError && !projects) {
        return (_jsx(PageError, { message: `Unable to load project registry: ${projError}`, slug: slug, onRetry: projRefetch }));
    }
    if (!projLoading && projects && !projectPath) {
        return (_jsx(PageError, { message: `No project found for slug: ${slug ?? '(none)'}`, slug: undefined }));
    }
    if (manifestError && !manifest) {
        return (_jsx(PageError, { message: `Failed to load task manifest: ${manifestError}`, slug: slug, onRetry: manifestRefetch }));
    }
    if (manifestLoading && !manifest) {
        return _jsx(PageLoadingSkeleton, {});
    }
    if (!manifest) {
        return _jsx(TaskNotFound, { taskId: taskId ?? '', slug: slug ?? '' });
    }
    // -------------------------------------------------------------------------
    // Happy path
    // -------------------------------------------------------------------------
    function refreshAll() {
        manifestRefetch();
        eventsRefetch();
        auditRefetch();
        receiptsRefetch();
    }
    return (_jsxs("div", { role: "main", "aria-label": `Task ${manifest.task_id}`, children: [_jsxs("nav", { className: "breadcrumb", "aria-label": "Breadcrumb", children: [_jsx(Link, { to: "/", "aria-label": "Home", children: "home" }), _jsx("span", { className: "breadcrumb-sep", "aria-hidden": "true", children: "/" }), _jsx(Link, { to: `/repo/${slug}`, "aria-label": `Repository ${slug}`, children: shortRepoName(slug) }), _jsx("span", { className: "breadcrumb-sep", "aria-hidden": "true", children: "/" }), _jsx("span", { className: "breadcrumb-cur", "aria-current": "page", title: manifest.task_id, style: {
                            fontFamily: 'var(--font-mono)',
                            maxWidth: 'min(50vw, 320px)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            display: 'inline-block',
                            verticalAlign: 'bottom',
                        }, children: manifest.task_id })] }), _jsxs("div", { className: "page-header", children: [_jsxs("div", { className: "page-header-left", children: [_jsx("span", { className: "page-eyebrow", children: "Task" }), _jsx("h1", { className: "page-title", title: manifest.task_id, style: {
                                    fontFamily: 'var(--font-mono)',
                                    letterSpacing: '-0.01em',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: 'min(70vw, 720px)',
                                }, children: manifest.task_id }), manifest.title && (_jsx("div", { style: {
                                    marginTop: 4,
                                    fontSize: 13,
                                    color: 'var(--gray)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: 'min(80vw, 720px)',
                                }, title: manifest.title, children: manifest.title }))] }), _jsxs("div", { className: "page-header-actions", children: [_jsx("span", { className: stageBadgeClass(manifest.stage), children: manifest.stage }), _jsx("button", { className: "btn --ghost --sm", onClick: refreshAll, disabled: manifestLoading, "aria-label": "Refresh task data", children: manifestLoading ? 'Refreshing…' : '↺ Refresh' })] })] }), _jsx(AlertBar, { stage: manifest.stage, failureReason: manifest.failure_reason }), _jsx(StatsBar, { manifest: manifest }), _jsx(PageTabs, { active: activeTab, onChange: setActiveTab }), activeTab === 'overview' && (_jsxs("div", { role: "tabpanel", id: "panel-overview", "aria-labelledby": "tab-overview", children: [_jsx(MetadataCard, { manifest: manifest }), _jsx(StageTimelineCard, { manifest: manifest, events: events, eventsLoading: eventsLoading }), _jsx(CostBreakdownCard, { manifest: manifest })] })), activeTab === 'receipts' && (_jsx("div", { role: "tabpanel", id: "panel-receipts", "aria-labelledby": "tab-receipts", children: _jsx(ReceiptsCard, { receipts: receipts, loading: receiptsLoading, error: receiptsError, onRetry: receiptsRefetch }) })), activeTab === 'audit' && (_jsx("div", { role: "tabpanel", id: "panel-audit", "aria-labelledby": "tab-audit", children: _jsx(AuditTab, { auditSummary: auditSummary, loading: auditLoading, error: auditError, onRetry: auditRefetch }) })), activeTab === 'events' && (_jsx("div", { role: "tabpanel", id: "panel-events", "aria-labelledby": "tab-events", children: _jsx(EventsTab, { events: events, loading: eventsLoading, error: eventsError, onRetry: eventsRefetch }) })), activeTab === 'raw' && (_jsx("div", { role: "tabpanel", id: "panel-raw", "aria-labelledby": "tab-raw", children: _jsx(RawTab, { manifest: manifest, repairLog: repairLog, executionGraph: executionGraph, repairLoading: repairLogLoading, executionGraphLoading: executionGraphLoading }) }))] }));
}
