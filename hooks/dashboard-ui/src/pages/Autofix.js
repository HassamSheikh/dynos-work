import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Autofix page — /autofix
 *
 * Displays autofix metrics, category bar chart, and findings table
 * with client-side pagination.
 */
import { useState, useMemo } from "react";
import { motion } from "motion/react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Cell, Treemap, AreaChart, Area, } from "recharts";
import { Bug, CheckCircle2, XCircle, AlertTriangle, ExternalLink, } from "lucide-react";
import { usePollingData } from "@/data/hooks";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell, } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TimeRangeFilter, filterByTimeRange } from "@/components/TimeRangeFilter";
import { ChartCard } from "@/components/ChartCard";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PAGE_SIZE = 25;
const CARD_BASE = "border border-white/5 bg-[#0F1114]/60 backdrop-blur-md p-6 rounded-xl";
const GRADIENT_PALETTE = [
    "#BDF000",
    "#2DD4A8",
    "#B47AFF",
    "#FF6D00",
    "#F50057",
    "#64FFDA",
    "#EEFF41",
    "#448AFF",
];
/** Maps a status string to a Tailwind color class for badges. */
const STATUS_COLOR_MAP = {
    fixed: "bg-green-500/20 text-green-400 border-green-500/30",
    merged: "bg-green-500/20 text-green-400 border-green-500/30",
    failed: "bg-red-500/20 text-red-400 border-red-500/30",
    "issue-opened": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    new: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    "already-exists": "bg-gray-500/20 text-gray-400 border-gray-500/30",
    suppressed: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};
const DEFAULT_STATUS_COLOR = "bg-gray-500/20 text-gray-400 border-gray-500/30";
/** Maps severity to a small colored dot indicator. */
const SEVERITY_DOT_COLOR = {
    critical: "bg-red-500",
    high: "bg-orange-500",
    medium: "bg-yellow-500",
    low: "bg-green-500",
    info: "bg-blue-400",
};
/** PR timeline stage definitions with colors and labels. */
const PR_TIMELINE_STAGES = [
    { key: "created", color: "#EAB308", label: "Created" },
    { key: "reviewed", color: "#22D3EE", label: "Reviewed" },
    { key: "merged", color: "#22C55E", label: "Merged" },
    { key: "closed", color: "#EF4444", label: "Closed" },
];
const METRIC_CARDS = [
    {
        label: "Total Findings",
        getValue: (t) => String(t.findings),
        icon: Bug,
        accent: "text-[#BDF000]",
    },
    {
        label: "Fix Rate",
        getValue: (t) => {
            if (t.findings === 0)
                return "0%";
            const rate = (t.merged / t.findings) * 100;
            return `${Math.round(rate * 10) / 10}%`;
        },
        icon: CheckCircle2,
        accent: "text-[#2DD4A8]",
    },
    {
        label: "PRs Merged",
        getValue: (t) => String(t.merged),
        icon: CheckCircle2,
        accent: "text-green-400",
    },
    {
        label: "Open PRs",
        getValue: (t) => String(t.open_prs),
        icon: AlertTriangle,
        accent: "text-yellow-400",
    },
    {
        label: "Recent Failures",
        getValue: (t) => String(t.recent_failures),
        icon: XCircle,
        accent: "text-red-400",
    },
];
// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function MetricCardSkeleton() {
    return (_jsxs("div", { className: CARD_BASE, "aria-hidden": "true", children: [_jsx(Skeleton, { className: "h-4 w-24 mb-3" }), _jsx(Skeleton, { className: "h-8 w-16" })] }));
}
function MetricCard({ def, totals }) {
    const Icon = def.icon;
    return (_jsxs(motion.div, { className: `${CARD_BASE} card-hover-glow`, initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3 }, children: [_jsxs("div", { className: "flex items-center gap-2 mb-2", children: [_jsx(Icon, { className: `w-4 h-4 ${def.accent}`, "aria-hidden": "true" }), _jsx("span", { className: "text-xs font-mono text-slate-400 uppercase tracking-wider", children: def.label })] }), _jsx("p", { className: `text-2xl font-mono font-bold ${def.accent}`, children: def.getValue(totals) })] }));
}
function StatusBadge({ status }) {
    const colorClass = STATUS_COLOR_MAP[status] ?? DEFAULT_STATUS_COLOR;
    return (_jsx(Badge, { variant: "outline", className: `${colorClass} rounded-full px-2.5 py-0.5 text-[10px] font-medium font-mono uppercase`, children: status }));
}
/** Small colored dot indicating severity level. */
function SeverityDot({ severity }) {
    const dotColor = SEVERITY_DOT_COLOR[severity.toLowerCase()] ?? "bg-gray-500";
    return (_jsxs("span", { className: "inline-flex items-center gap-1.5", children: [_jsx("span", { className: `inline-block w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`, "aria-hidden": "true" }), _jsx("span", { children: severity })] }));
}
function ChartSkeleton() {
    return (_jsxs("div", { className: `${CARD_BASE} h-72`, "aria-hidden": "true", children: [_jsx(Skeleton, { className: "h-5 w-48 mb-4" }), _jsx(Skeleton, { className: "h-52 w-full" })] }));
}
/** Mini PR timeline showing colored dots connected by a thin line. */
function PrTimeline({ finding }) {
    if (!finding.pr_url)
        return null;
    const stages = [
        {
            active: Boolean(finding.found_at),
            color: PR_TIMELINE_STAGES[0].color,
            label: PR_TIMELINE_STAGES[0].label,
            timestamp: finding.found_at ?? null,
        },
        {
            active: Boolean(finding.processed_at),
            color: PR_TIMELINE_STAGES[1].color,
            label: PR_TIMELINE_STAGES[1].label,
            timestamp: finding.processed_at ?? null,
        },
        {
            active: finding.pr_state === "merged" || Boolean(finding.merged_at),
            color: PR_TIMELINE_STAGES[2].color,
            label: PR_TIMELINE_STAGES[2].label,
            timestamp: finding.merged_at ?? null,
        },
        {
            active: finding.pr_state === "closed" && !finding.merged_at,
            color: PR_TIMELINE_STAGES[3].color,
            label: PR_TIMELINE_STAGES[3].label,
            timestamp: finding.processed_at ?? null,
        },
    ];
    return (_jsx("div", { className: "flex items-center gap-0", role: "img", "aria-label": `PR timeline: ${stages.filter((s) => s.active).map((s) => s.label).join(", ")}`, children: stages.map((stage, idx) => (_jsxs("div", { className: "flex items-center", children: [idx > 0 && (_jsx("div", { className: "w-3 h-[2px]", style: { backgroundColor: stage.active ? stage.color : "#334155" } })), _jsx("div", { className: "w-2 h-2 rounded-full flex-shrink-0", style: { backgroundColor: stage.active ? stage.color : "#334155" }, title: stage.active && stage.timestamp
                        ? `${stage.label}: ${new Date(stage.timestamp).toLocaleString()}`
                        : stage.label, "aria-hidden": "true" })] }, stage.label))) }));
}
/** Custom content renderer for category treemap rectangles. */
function TreemapContent(props) {
    const { x, y, width, height, name, count, fill } = props;
    if (width < 4 || height < 4)
        return null;
    const showLabel = width > 50 && height > 30;
    return (_jsxs("g", { children: [_jsx("rect", { x: x, y: y, width: width, height: height, rx: 4, fill: fill, stroke: "#0F1114", strokeWidth: 2, style: { opacity: 0.85 } }), showLabel && (_jsxs(_Fragment, { children: [_jsx("text", { x: x + width / 2, y: y + height / 2 - 6, textAnchor: "middle", dominantBaseline: "central", fill: "#fff", fontFamily: "'JetBrains Mono', monospace", fontSize: Math.min(11, width / 8), style: { pointerEvents: "none" }, children: name && name.length > 16 ? `${name.slice(0, 14)}...` : name }), _jsx("text", { x: x + width / 2, y: y + height / 2 + 10, textAnchor: "middle", dominantBaseline: "central", fill: "rgba(255,255,255,0.7)", fontFamily: "'JetBrains Mono', monospace", fontSize: Math.min(10, width / 10), style: { pointerEvents: "none" }, children: count })] }))] }));
}
/** Derives weekly fix-rate trend data from findings. */
function deriveFixRateTrend(findings) {
    if (findings.length === 0)
        return [];
    const buckets = new Map();
    for (const f of findings) {
        const dateStr = f.processed_at ?? f.found_at;
        if (!dateStr)
            continue;
        const date = new Date(dateStr);
        // ISO week start (Monday)
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const weekStart = new Date(date);
        weekStart.setDate(diff);
        const key = weekStart.toISOString().slice(0, 10);
        const bucket = buckets.get(key) ?? { total: 0, merged: 0 };
        bucket.total++;
        if (f.pr_state === "merged" || f.merged_at) {
            bucket.merged++;
        }
        buckets.set(key, bucket);
    }
    return Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, { total, merged }]) => ({
        week,
        rate: total > 0 ? Math.round((merged / total) * 1000) / 10 : 0,
    }));
}
function TableSkeleton() {
    return (_jsxs("div", { className: CARD_BASE, "aria-hidden": "true", children: [_jsx(Skeleton, { className: "h-5 w-40 mb-4" }), Array.from({ length: 5 }).map((_, i) => (_jsx(Skeleton, { className: "h-8 w-full mb-2" }, i)))] }));
}
// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------
export default function Autofix() {
    const { data: metrics, loading: metricsLoading, error: metricsError, refetch: refetchMetrics, } = usePollingData("/api/autofix-metrics");
    const { data: findings, loading: findingsLoading, error: findingsError, refetch: refetchFindings, } = usePollingData("/api/findings");
    const [page, setPage] = useState(1);
    const [timeRange, setTimeRange] = useState("All");
    // Time-range filtered findings for charts
    const filteredFindings = useMemo(() => {
        if (!findings)
            return [];
        return filterByTimeRange(findings, (f) => f.found_at, timeRange);
    }, [findings, timeRange]);
    // Derive category chart data from filtered findings (time-range aware)
    const categoryData = useMemo(() => {
        if (filteredFindings.length === 0 && metrics?.categories && timeRange === "All") {
            // Fall back to metrics when no time filter is applied
            return Object.entries(metrics.categories).map(([name, cat]) => ({
                name,
                count: cat.merged +
                    cat.closed_unmerged +
                    cat.reverted +
                    cat.verification_failed +
                    cat.issues_opened,
            }));
        }
        // Aggregate from filtered findings
        const counts = new Map();
        for (const f of filteredFindings) {
            counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
        }
        return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
    }, [filteredFindings, metrics, timeRange]);
    // Derive treemap data from category chart data
    const treemapData = useMemo(() => {
        if (categoryData.length === 0)
            return [];
        return categoryData.map((item, idx) => ({
            name: item.name,
            count: item.count,
            fill: GRADIENT_PALETTE[idx % GRADIENT_PALETTE.length],
        }));
    }, [categoryData]);
    // Derive fix rate trend from filtered findings
    const fixRateTrend = useMemo(() => {
        if (filteredFindings.length === 0)
            return [];
        return deriveFixRateTrend(filteredFindings);
    }, [filteredFindings]);
    // Pagination
    const totalFindings = findings?.length ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalFindings / PAGE_SIZE));
    const clampedPage = Math.min(page, totalPages);
    const paginatedFindings = useMemo(() => {
        if (!findings)
            return [];
        const start = (clampedPage - 1) * PAGE_SIZE;
        return findings.slice(start, start + PAGE_SIZE);
    }, [findings, clampedPage]);
    const isLoading = metricsLoading || findingsLoading;
    const hasError = metricsError || findingsError;
    // ---------------------------------------------------------------------------
    // Loading state
    // ---------------------------------------------------------------------------
    if (isLoading) {
        return (_jsxs("div", { className: "p-4 sm:p-6 space-y-6", "aria-busy": "true", "aria-label": "Loading autofix data", children: [_jsx("h1", { className: "text-lg font-mono font-semibold text-[#BDF000] tracking-wider uppercase", children: "Autofix" }), _jsx("div", { className: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4", children: Array.from({ length: 5 }).map((_, i) => (_jsx(MetricCardSkeleton, {}, i))) }), _jsx(ChartSkeleton, {}), _jsx(ChartSkeleton, {}), _jsx(ChartSkeleton, {}), _jsx(TableSkeleton, {})] }));
    }
    // ---------------------------------------------------------------------------
    // Error state
    // ---------------------------------------------------------------------------
    if (hasError && !metrics && !findings) {
        return (_jsxs("div", { className: "p-4 sm:p-6 space-y-6", children: [_jsx("h1", { className: "text-lg font-mono font-semibold text-[#BDF000] tracking-wider uppercase", children: "Autofix" }), _jsxs("div", { className: `${CARD_BASE} flex flex-col items-center justify-center py-16 gap-4`, role: "alert", children: [_jsx(XCircle, { className: "w-10 h-10 text-red-400", "aria-hidden": "true" }), _jsx("p", { className: "text-sm font-mono text-slate-400 text-center max-w-md", children: "Unable to load autofix data. Please check that the daemon is running and try again." }), _jsx(Button, { variant: "outline", size: "sm", onClick: () => {
                                refetchMetrics();
                                refetchFindings();
                            }, "aria-label": "Retry loading autofix data", children: "Retry" })] })] }));
    }
    // ---------------------------------------------------------------------------
    // Success / Empty states
    // ---------------------------------------------------------------------------
    return (_jsxs("div", { className: "p-4 sm:p-6 space-y-6", children: [_jsx("h1", { className: "text-lg font-mono font-semibold text-[#BDF000] tracking-wider uppercase", children: "Autofix" }), metrics && (_jsx("div", { className: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4", children: METRIC_CARDS.map((def) => (_jsx(MetricCard, { def: def, totals: metrics.totals }, def.label))) })), categoryData.length > 0 && (_jsx(motion.div, { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, delay: 0.1 }, children: _jsx(ChartCard, { title: "Category Breakdown", action: _jsx(TimeRangeFilter, { value: timeRange, onChange: setTimeRange }), children: _jsx("div", { className: "h-64", children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(BarChart, { data: categoryData, margin: { top: 8, right: 16, bottom: 8, left: 0 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "#333", vertical: false }), _jsx(XAxis, { dataKey: "name", tick: { fill: "#999", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }, axisLine: { stroke: "#333" }, tickLine: false }), _jsx(YAxis, { tick: { fill: "#999", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }, axisLine: { stroke: "#333" }, tickLine: false, allowDecimals: false }), _jsx(Tooltip, { contentStyle: {
                                            background: "#0D1321",
                                            border: "1px solid rgba(189, 240, 0, 0.15)",
                                            borderRadius: "8px",
                                            fontFamily: "'JetBrains Mono', monospace",
                                            fontSize: "12px",
                                            color: "#E2E8F0",
                                        }, cursor: { fill: "rgba(189, 240, 0, 0.05)" } }), _jsx(Bar, { dataKey: "count", radius: [4, 4, 0, 0], children: categoryData.map((_, idx) => (_jsx(Cell, { fill: GRADIENT_PALETTE[idx % GRADIENT_PALETTE.length] }, idx))) })] }) }) }) }) })), treemapData.length > 0 && (_jsx(motion.div, { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, delay: 0.15 }, children: _jsx(ChartCard, { title: "Category Treemap", children: _jsx("div", { className: "h-64", children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsx(Treemap, { data: treemapData, dataKey: "count", nameKey: "name", content: _jsx(TreemapContent, { x: 0, y: 0, width: 0, height: 0 }), children: _jsx(Tooltip, { contentStyle: {
                                        background: "#0D1321",
                                        border: "1px solid rgba(189, 240, 0, 0.15)",
                                        borderRadius: "8px",
                                        fontFamily: "'JetBrains Mono', monospace",
                                        fontSize: "12px",
                                        color: "#E2E8F0",
                                    }, formatter: (value, _name, props) => [
                                        `${value} findings`,
                                        props.payload?.name ?? "Category",
                                    ] }) }) }) }) }) })), fixRateTrend.length > 0 && (_jsx(motion.div, { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, delay: 0.2 }, children: _jsx(ChartCard, { title: "Success Rate Trend", action: _jsx(TimeRangeFilter, { value: timeRange, onChange: setTimeRange }), children: _jsx("div", { className: "h-64", children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(AreaChart, { data: fixRateTrend, margin: { top: 8, right: 16, bottom: 8, left: 0 }, children: [_jsx("defs", { children: _jsxs("linearGradient", { id: "fixRateGradient", x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "5%", stopColor: "#BDF000", stopOpacity: 0.3 }), _jsx("stop", { offset: "95%", stopColor: "#BDF000", stopOpacity: 0.02 })] }) }), _jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "#333", vertical: false }), _jsx(XAxis, { dataKey: "week", tick: { fill: "#999", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }, axisLine: { stroke: "#333" }, tickLine: false }), _jsx(YAxis, { tick: { fill: "#999", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }, axisLine: { stroke: "#333" }, tickLine: false, domain: [0, 100], unit: "%" }), _jsx(Tooltip, { contentStyle: {
                                            background: "#0D1321",
                                            border: "1px solid rgba(189, 240, 0, 0.15)",
                                            borderRadius: "8px",
                                            fontFamily: "'JetBrains Mono', monospace",
                                            fontSize: "12px",
                                            color: "#E2E8F0",
                                        }, formatter: (value) => [`${value}%`, "Fix Rate"], cursor: { stroke: "rgba(189, 240, 0, 0.3)" } }), _jsx(Area, { type: "monotone", dataKey: "rate", stroke: "#BDF000", strokeWidth: 2, fill: "url(#fixRateGradient)", dot: { fill: "#BDF000", r: 3, strokeWidth: 0 }, activeDot: { fill: "#BDF000", r: 5, strokeWidth: 2, stroke: "#0F1114" } })] }) }) }) }) })), _jsxs(motion.div, { className: CARD_BASE, initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, delay: 0.3 }, children: [_jsx("h2", { className: "text-sm font-mono font-semibold text-slate-300 uppercase tracking-wider mb-4", children: "Findings" }), totalFindings === 0 ? (
                    /* Empty state */
                    _jsxs("div", { className: "flex flex-col items-center justify-center py-16 gap-3", role: "status", children: [_jsx(Bug, { className: "w-10 h-10 text-slate-600", "aria-hidden": "true" }), _jsx("p", { className: "text-sm font-mono text-slate-500 text-center", children: "No findings recorded" }), _jsx("p", { className: "text-xs font-mono text-slate-600 text-center max-w-sm", children: "When the autofix scanner detects issues in your codebase, they will appear here." })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "overflow-x-auto", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { className: "border-white/5", children: [_jsx(TableHead, { className: "text-slate-400 font-mono text-xs", children: "Finding ID" }), _jsx(TableHead, { className: "text-slate-400 font-mono text-xs", children: "Category" }), _jsx(TableHead, { className: "text-slate-400 font-mono text-xs", children: "Severity" }), _jsx(TableHead, { className: "text-slate-400 font-mono text-xs", children: "Status" }), _jsx(TableHead, { className: "text-slate-400 font-mono text-xs", children: "PR" }), _jsx(TableHead, { className: "text-slate-400 font-mono text-xs", children: "Timeline" }), _jsx(TableHead, { className: "text-slate-400 font-mono text-xs", children: "Attempts" })] }) }), _jsx(TableBody, { children: paginatedFindings.map((finding, idx) => (_jsxs(TableRow, { className: `border-white/5 transition-colors hover:bg-white/[0.04] ${idx % 2 === 0 ? "bg-white/[0.02]" : ""}`, children: [_jsx(TableCell, { className: "font-mono text-xs text-slate-300 max-w-[200px] truncate", children: finding.finding_id }), _jsx(TableCell, { className: "font-mono text-xs text-slate-400 max-w-[150px] truncate", children: finding.category }), _jsx(TableCell, { className: "font-mono text-xs text-slate-400", children: _jsx(SeverityDot, { severity: finding.severity }) }), _jsx(TableCell, { children: _jsx(StatusBadge, { status: finding.status }) }), _jsx(TableCell, { children: finding.pr_url ? (_jsxs("a", { href: finding.pr_url, target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center gap-1 text-[#BDF000] hover:text-[#BDF000]/80 transition-colors font-mono text-xs", "aria-label": `Open pull request ${finding.pr_number ?? ""}`, children: ["#", finding.pr_number, _jsx(ExternalLink, { className: "w-3 h-3", "aria-hidden": "true" })] })) : (_jsx("span", { className: "text-slate-600 font-mono text-xs", "aria-label": "No pull request", children: "--" })) }), _jsx(TableCell, { children: finding.pr_url ? (_jsx(PrTimeline, { finding: finding })) : (_jsx("span", { className: "text-slate-600 font-mono text-xs", "aria-label": "No timeline", children: "--" })) }), _jsx(TableCell, { className: "font-mono text-xs text-slate-400 text-center", children: finding.attempt_count })] }, finding.finding_id))) })] }) }), _jsxs("div", { className: "flex items-center justify-between mt-4 pt-4 border-t border-white/5", children: [_jsxs("span", { className: "text-xs font-mono text-slate-500", children: ["Page ", clampedPage, " of ", totalPages] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Button, { variant: "outline", size: "sm", onClick: () => setPage((p) => Math.max(1, p - 1)), disabled: clampedPage <= 1, "aria-label": "Previous page", children: "Prev" }), _jsx(Button, { variant: "outline", size: "sm", onClick: () => setPage((p) => Math.min(totalPages, p + 1)), disabled: clampedPage >= totalPages, "aria-label": "Next page", children: "Next" })] })] })] }))] })] }));
}
