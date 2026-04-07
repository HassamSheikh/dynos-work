import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Activity, Shield, Bot, Clock, Terminal, MonitorDot, RefreshCw, CheckCircle2 } from "lucide-react";
import { usePollingData } from "@/data/hooks";
import { useProject } from "@/data/ProjectContext";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricCard } from "@/components/MetricCard";
import { LineChart, Line, ResponsiveContainer } from "recharts";
// ---- Utility helpers ----
function formatTimestamp(iso) {
    try {
        const d = new Date(iso);
        return d.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }
    catch {
        return iso;
    }
}
function isDaemonActive(lines) {
    if (lines.length === 0)
        return false;
    // Extract timestamp from the last log line (format: "2026-04-06T10:07:00Z [INFO] ...")
    const lastLine = lines[lines.length - 1];
    const match = lastLine.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/);
    if (!match)
        return false;
    const ts = new Date(match[1]).getTime();
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    return ts > oneHourAgo;
}
function getMeanQuality(retros) {
    if (retros.length === 0)
        return null;
    const sum = retros.reduce((acc, r) => acc + r.quality_score, 0);
    return Math.round((sum / retros.length) * 100);
}
function getLatestQuality(retros) {
    if (retros.length === 0)
        return null;
    // retros assumed sorted newest-first by API; take first
    return Math.round(retros[0].quality_score * 100);
}
// ---- Skeleton / Loading states ----
function LeftPanelSkeleton() {
    return (_jsx("div", { className: "space-y-3", role: "status", "aria-label": "Loading log feed", children: Array.from({ length: 5 }).map((_, i) => (_jsx(Skeleton, { className: "h-4 bg-[#BDF000]/5", style: { width: `${70 + i * 5}%` } }, i))) }));
}
function RightPanelSkeleton() {
    return (_jsxs("div", { role: "status", "aria-label": "Loading quality data", children: [_jsx(Skeleton, { className: "h-16 w-32 bg-[#B47AFF]/10 mb-4" }), _jsx(Skeleton, { className: "h-1 w-full bg-[#B47AFF]/10 mb-6" }), _jsx("div", { className: "space-y-3", children: Array.from({ length: 5 }).map((_, i) => (_jsx(Skeleton, { className: "h-4 bg-white/5" }, i))) })] }));
}
function CenterPanelSkeleton() {
    return (_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4", role: "status", "aria-label": "Loading dashboard", children: [Array.from({ length: 6 }).map((_, i) => (_jsxs("div", { className: "border border-white/6 bg-gradient-to-b from-[#222222] to-[#141414] rounded-2xl p-5", children: [_jsx(Skeleton, { className: "h-3 w-24 mb-4" }), _jsx(Skeleton, { className: "h-8 w-16 mb-2" }), _jsx(Skeleton, { className: "h-2 w-32" })] }, i))), _jsxs("div", { className: "md:col-span-2 xl:col-span-3 border border-white/6 bg-gradient-to-b from-[#222222] to-[#141414] rounded-2xl p-5", children: [_jsx(Skeleton, { className: "h-3 w-32 mb-4" }), Array.from({ length: 4 }).map((_, i) => (_jsx(Skeleton, { className: "h-4 mb-2", style: { width: `${60 + i * 10}%` } }, i)))] })] }));
}
// ---- Error state ----
function ErrorCard({ message, onRetry }) {
    return (_jsxs("div", { className: "p-4 border border-red-500/30 bg-red-500/5 rounded", role: "alert", children: [_jsxs("div", { className: "flex items-center gap-2 mb-2", children: [_jsx(Shield, { className: "w-4 h-4 text-red-400", "aria-hidden": "true" }), _jsx("span", { className: "text-xs font-mono text-red-400", children: "CONNECTION ERROR" })] }), _jsx("p", { className: "text-sm text-slate-400 mb-3", children: message }), _jsx("button", { onClick: onRetry, className: "px-3 py-1 text-xs font-mono border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors rounded", "aria-label": "Retry loading data", children: "RETRY" })] }));
}
// ---- Empty states ----
function EmptyLogState() {
    return (_jsxs("div", { className: "flex flex-col items-start gap-2 py-4", children: [_jsx(Terminal, { className: "w-5 h-5 text-slate-600", "aria-hidden": "true" }), _jsx("p", { className: "text-xs text-slate-500 font-mono", children: "No task data available." }), _jsx("p", { className: "text-xs text-slate-600 font-mono", children: "Start a task to see real-time execution logs." })] }));
}
function EmptyQualityState() {
    return (_jsxs("div", { className: "flex flex-col items-start gap-2 py-4", children: [_jsx(Shield, { className: "w-5 h-5 text-slate-600", "aria-hidden": "true" }), _jsx("p", { className: "text-xs text-slate-500 font-mono", children: "No retrospective data yet." }), _jsx("p", { className: "text-xs text-slate-600 font-mono", children: "Complete a task to generate quality metrics." })] }));
}
// ---- Sub-components ----
function LogFeed({ lines, isGlobal, globalEntries, }) {
    const displayLines = isGlobal ? globalEntries : lines.map((l) => ({ line: l, project: "" }));
    const last5 = displayLines.slice(-5);
    if (last5.length === 0) {
        return _jsx(EmptyLogState, {});
    }
    return (_jsxs("div", { className: "font-mono text-sm space-y-2", children: [_jsx(AnimatePresence, { mode: "popLayout", children: last5.map((entry, idx) => (_jsxs(motion.div, { initial: { opacity: 0, x: -10 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -10 }, transition: { duration: 0.3 }, className: "text-[#2DD4A8]/80 flex gap-2 items-start", children: [_jsx("span", { className: "text-slate-600 shrink-0", "aria-hidden": "true", children: ">" }), _jsxs("span", { className: "break-all line-clamp-2", children: [isGlobal && entry.project && (_jsxs("span", { className: "text-[#B47AFF]/60 mr-1", children: ["[", entry.project, "]"] })), entry.line] })] }, `${entry.line}-${idx}`))) }), _jsxs("div", { className: "text-[#BDF000] flex gap-2 animate-pulse", "aria-hidden": "true", children: [_jsx("span", { className: "text-slate-600", children: ">" }), "_"] })] }));
}
function QualityRings({ percentage, }) {
    if (percentage === null) {
        return _jsx(EmptyQualityState, {});
    }
    const SIZE = 140;
    const OUTER_R = 60;
    const INNER_R = 46;
    const STROKE_W = 6;
    const outerCircumference = 2 * Math.PI * OUTER_R;
    const innerCircumference = 2 * Math.PI * INNER_R;
    const outerOffset = outerCircumference * (1 - Math.min(percentage, 100) / 100);
    const innerOffset = innerCircumference * (1 - Math.min(percentage, 100) / 100);
    return (_jsx("div", { className: "flex flex-col items-center", children: _jsxs("div", { className: "relative", style: { width: SIZE, height: SIZE }, role: "img", "aria-label": `Quality score: ${percentage}%`, children: [_jsxs("svg", { width: SIZE, height: SIZE, viewBox: `0 0 ${SIZE} ${SIZE}`, className: "absolute inset-0", children: [_jsx("circle", { cx: SIZE / 2, cy: SIZE / 2, r: OUTER_R, fill: "none", stroke: "rgba(189, 240, 0, 0.1)", strokeWidth: STROKE_W }), _jsx(motion.circle, { cx: SIZE / 2, cy: SIZE / 2, r: OUTER_R, fill: "none", stroke: "#BDF000", strokeWidth: STROKE_W, strokeLinecap: "round", strokeDasharray: outerCircumference, initial: { strokeDashoffset: outerCircumference }, animate: { strokeDashoffset: outerOffset }, transition: { duration: 1.2, ease: "easeOut" }, style: {
                                transformOrigin: "center",
                                filter: "drop-shadow(0 0 4px rgba(189, 240, 0, 0.5))",
                            } }), _jsx("animateTransform", { xlinkHref: "#outer-ring-rotate", attributeName: "transform", type: "rotate", from: `0 ${SIZE / 2} ${SIZE / 2}`, to: `360 ${SIZE / 2} ${SIZE / 2}`, dur: "60s", repeatCount: "indefinite" }), _jsx("circle", { cx: SIZE / 2, cy: SIZE / 2, r: INNER_R, fill: "none", stroke: "rgba(180, 122, 255, 0.1)", strokeWidth: STROKE_W }), _jsx(motion.circle, { cx: SIZE / 2, cy: SIZE / 2, r: INNER_R, fill: "none", stroke: "#B47AFF", strokeWidth: STROKE_W, strokeLinecap: "round", strokeDasharray: innerCircumference, initial: { strokeDashoffset: innerCircumference }, animate: { strokeDashoffset: innerOffset }, transition: { duration: 1.2, ease: "easeOut", delay: 0.2 }, style: {
                                transformOrigin: "center",
                                filter: "drop-shadow(0 0 4px rgba(180, 122, 255, 0.5))",
                            } })] }), _jsx("svg", { width: SIZE, height: SIZE, viewBox: `0 0 ${SIZE} ${SIZE}`, className: "absolute inset-0", style: { animation: "qualityOuterRotate 60s linear infinite" }, "aria-hidden": "true", children: _jsx("circle", { cx: SIZE / 2, cy: SIZE / 2, r: OUTER_R, fill: "none", stroke: "#BDF000", strokeWidth: 1, strokeDasharray: "2 12", opacity: 0.3 }) }), _jsx("svg", { width: SIZE, height: SIZE, viewBox: `0 0 ${SIZE} ${SIZE}`, className: "absolute inset-0", style: { animation: "qualityInnerRotate 90s linear infinite" }, "aria-hidden": "true", children: _jsx("circle", { cx: SIZE / 2, cy: SIZE / 2, r: INNER_R, fill: "none", stroke: "#B47AFF", strokeWidth: 1, strokeDasharray: "2 8", opacity: 0.3 }) }), _jsx("div", { className: "absolute inset-0 flex items-center justify-center", children: _jsxs("div", { className: "text-center", children: [_jsx("span", { className: "text-3xl font-light text-slate-100", children: percentage }), _jsx("span", { className: "text-xs text-[#2DD4A8] ml-0.5", children: "%" })] }) })] }) }));
}
function MiniSparkline({ data, color }) {
    if (data.length < 2)
        return null;
    const points = data.map((v, i) => ({ v, i }));
    return (_jsx("div", { className: "w-12 h-[30px] shrink-0", "aria-hidden": "true", children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsx(LineChart, { data: points, children: _jsx(Line, { type: "monotone", dataKey: "v", stroke: color, strokeWidth: 1.5, dot: false, isAnimationActive: false }) }) }) }));
}
function DiagnosticRow({ label, value, icon: Icon, sparkData, sparkColor }) {
    return (_jsxs("div", { className: "flex justify-between items-center pb-2 border-b border-white/5 gap-2", children: [_jsxs("span", { className: "text-slate-400 flex items-center gap-1.5 shrink-0", children: [_jsx(Icon, { className: "w-3 h-3 shrink-0", "aria-hidden": "true" }), label] }), _jsxs("div", { className: "flex items-center gap-2", children: [sparkData && sparkData.length >= 2 && (_jsx("div", { className: "border border-white/6 bg-gradient-to-b from-[#222222] to-[#141414] rounded-lg px-1.5 py-0.5", children: _jsx(MiniSparkline, { data: sparkData, color: sparkColor ?? "#BDF000" }) })), _jsx("span", { className: value === "ACTIVE" ? "text-[#2DD4A8]" :
                            value === "IDLE" ? "text-amber-400" :
                                "text-[#BDF000]", children: value })] })] }));
}
// ---- Daemon heartbeat pulse (AC-9) ----
function DaemonHeartbeat({ active, isLoading: loading }) {
    if (loading) {
        return _jsx(Skeleton, { className: "h-8 w-24 bg-[#B47AFF]/10" });
    }
    return (_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(motion.div, { className: "w-3 h-3 rounded-full shrink-0", style: {
                    backgroundColor: active ? "#2DD4A8" : "#F59E0B",
                    boxShadow: active
                        ? "0 0 8px rgba(45, 212, 168, 0.6)"
                        : "0 0 4px rgba(245, 158, 11, 0.3)",
                }, animate: active
                    ? { scale: [1, 1.4, 1], boxShadow: [
                            "0 0 8px rgba(45, 212, 168, 0.6)",
                            "0 0 20px rgba(45, 212, 168, 0.9)",
                            "0 0 8px rgba(45, 212, 168, 0.6)",
                        ] }
                    : { opacity: [1, 0.4, 1] }, transition: active
                    ? { duration: 0.4, repeat: Infinity, repeatDelay: 1.6, ease: "easeOut" }
                    : { duration: 2, repeat: Infinity, ease: "easeInOut" }, "aria-hidden": "true" }), _jsx("span", { className: "text-2xl font-light text-slate-200", children: active ? "ACTIVE" : "IDLE" })] }));
}
// ---- Sparkline data derivation helpers ----
function deriveQualitySparkData(retros) {
    if (retros.length === 0)
        return [];
    // Take last 10 retros in chronological order, extract quality scores
    return retros.slice(-10).map((r) => Math.round(r.quality_score * 100));
}
function deriveTaskCountSparkData(tasks) {
    if (tasks.length === 0)
        return [];
    // Group tasks by day, count per day, last 7 days
    const dayCounts = new Map();
    for (const t of tasks) {
        const day = t.created_at.slice(0, 10);
        dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    }
    const sorted = [...dayCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return sorted.slice(-7).map(([, count]) => count);
}
function deriveAgentSparkData(retros) {
    if (retros.length === 0)
        return [];
    // Subagent spawn counts over last 10 retros
    return retros.slice(-10).map((r) => r.subagent_spawn_count);
}
function deriveFindingsSparkData(retros) {
    if (retros.length === 0)
        return [];
    // Total findings per retro over last 10
    return retros.slice(-10).map((r) => {
        const counts = Object.values(r.findings_by_category);
        return counts.reduce((sum, c) => sum + c, 0);
    });
}
// ---- Health Check Card ----
const HEALTH_ENDPOINTS = [
    "/api/tasks",
    "/api/agents",
    "/api/findings",
    "/api/autofix-metrics",
    "/api/policy",
    "/api/registry",
    "/api/retrospectives",
    "/api/cost-summary",
];
const HEALTH_PING_TIMEOUT_MS = 5000;
const HEALTH_POLL_INTERVAL_MS = 10000;
function HealthCheckCard() {
    const [results, setResults] = useState([]);
    const [lastChecked, setLastChecked] = useState(null);
    const [isPinging, setIsPinging] = useState(false);
    const pingAll = useCallback(async () => {
        setIsPinging(true);
        const newResults = await Promise.all(HEALTH_ENDPOINTS.map(async (endpoint) => {
            const start = performance.now();
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), HEALTH_PING_TIMEOUT_MS);
                const res = await fetch(endpoint, { signal: controller.signal });
                clearTimeout(timeoutId);
                const elapsed = Math.round(performance.now() - start);
                return { endpoint, ok: res.ok, ms: elapsed };
            }
            catch {
                const elapsed = performance.now() - start;
                if (elapsed >= HEALTH_PING_TIMEOUT_MS) {
                    return { endpoint, ok: false, ms: null };
                }
                return { endpoint, ok: false, ms: Math.round(elapsed) };
            }
        }));
        setResults(newResults);
        setLastChecked(new Date());
        setIsPinging(false);
    }, []);
    useEffect(() => {
        pingAll();
        const interval = setInterval(pingAll, HEALTH_POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [pingAll]);
    const isLoading = results.length === 0 && !lastChecked;
    return (_jsxs(motion.div, { className: "md:col-span-2 xl:col-span-3 border border-white/6 bg-gradient-to-b from-[#222222] to-[#141414] rounded-2xl p-5 card-hover-glow", initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.3 }, role: "region", "aria-label": "API health check status", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx(motion.div, { className: "section-label", animate: isPinging ? { opacity: [1, 0.5, 1] } : { opacity: 1 }, transition: isPinging ? { duration: 1, repeat: Infinity, ease: "easeInOut" } : {}, children: "API HEALTH CHECK" }), _jsxs("button", { onClick: pingAll, disabled: isPinging, className: "flex items-center gap-1.5 px-3 py-1 text-[10px] font-mono tracking-wider rounded-full border border-white/10 text-[#D4D0C8] hover:border-[#BDF000]/40 hover:text-[#BDF000] hover:bg-[#BDF000]/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed", "aria-label": "Refresh health check", children: [_jsx(RefreshCw, { className: `w-3 h-3 ${isPinging ? "animate-spin" : ""}`, "aria-hidden": "true" }), "REFRESH"] })] }), isLoading ? (_jsx("div", { className: "space-y-3", role: "status", "aria-label": "Loading health check data", children: Array.from({ length: HEALTH_ENDPOINTS.length }).map((_, i) => (_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(Skeleton, { className: "h-2.5 w-2.5 rounded-full bg-white/5" }), _jsx(Skeleton, { className: "h-3 flex-1 bg-white/5", style: { maxWidth: `${140 + i * 10}px` } }), _jsx(Skeleton, { className: "h-3 w-10 bg-white/5" })] }, i))) })) : results.length === 0 ? (_jsxs("div", { className: "flex flex-col items-start gap-2 py-4", children: [_jsx(Shield, { className: "w-5 h-5 text-slate-600", "aria-hidden": "true" }), _jsx("p", { className: "text-xs text-slate-500 font-mono", children: "No health data available." }), _jsx("p", { className: "text-xs text-slate-600 font-mono", children: "Click REFRESH to check endpoint status." })] })) : (_jsx("div", { className: "space-y-2 font-mono text-xs", children: results.map((r) => (_jsxs("div", { className: "flex items-center gap-3 py-1 border-b border-white/5 last:border-b-0", children: [_jsx("span", { className: "w-2.5 h-2.5 rounded-full shrink-0", style: {
                                backgroundColor: r.ok ? "#BDF000" : "#FF3B3B",
                                boxShadow: r.ok
                                    ? "0 0 6px rgba(189, 240, 0, 0.5)"
                                    : "0 0 6px rgba(255, 59, 59, 0.5)",
                            }, "aria-hidden": "true" }), _jsx("span", { className: "text-[#D4D0C8] flex-1 truncate", title: r.endpoint, children: r.endpoint }), _jsx("span", { className: `shrink-0 tabular-nums ${r.ok ? "text-[#BDF000]" : "text-[#FF3B3B]"}`, "aria-label": r.ms === null
                                ? `${r.endpoint} timed out`
                                : `${r.endpoint} responded in ${r.ms} milliseconds`, children: r.ms === null ? "timeout" : `${r.ms}ms` })] }, r.endpoint))) })), lastChecked && (_jsxs("div", { className: "mt-4 pt-3 border-t border-white/5 flex items-center gap-2", children: [_jsx(Clock, { className: "w-3 h-3 text-[#7A776E]", "aria-hidden": "true" }), _jsxs("span", { className: "text-[10px] text-[#7A776E] tracking-wider font-mono", children: ["Last checked ", lastChecked.toLocaleTimeString(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                            })] })] }))] }));
}
// ---- Relative time helper ----
function relativeTime(iso) {
    try {
        const now = Date.now();
        const then = new Date(iso).getTime();
        const diffMs = now - then;
        if (diffMs < 0)
            return "just now";
        const seconds = Math.floor(diffMs / 1000);
        if (seconds < 60)
            return "just now";
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60)
            return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24)
            return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 30)
            return `${days}d ago`;
        const months = Math.floor(days / 30);
        return `${months}mo ago`;
    }
    catch {
        return "unknown";
    }
}
function truncateTitle(title, max) {
    if (title.length <= max)
        return title;
    return title.slice(0, max - 1) + "\u2026";
}
// ---- Last Task Card ----
function LastTaskCard({ task, qualityScore, isLoading: loading, }) {
    if (loading) {
        return (_jsxs(motion.div, { className: "border border-white/6 bg-gradient-to-b from-[#222222] to-[#141414] rounded-2xl p-4 card-hover-glow", initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.22 }, role: "status", "aria-label": "Loading last completed task", children: [_jsx(Skeleton, { className: "h-3 w-28 mb-3 bg-white/5" }), _jsx(Skeleton, { className: "h-5 w-40 mb-2 bg-white/5" }), _jsx(Skeleton, { className: "h-3 w-full mb-2 bg-white/5" }), _jsx(Skeleton, { className: "h-3 w-20 bg-white/5" })] }));
    }
    if (!task) {
        return (_jsxs(motion.div, { className: "border border-white/6 bg-gradient-to-b from-[#222222] to-[#141414] rounded-2xl p-4 card-hover-glow", initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.22 }, role: "region", "aria-label": "Last completed task", children: [_jsx("div", { className: "section-label mb-3", children: "LAST COMPLETED TASK" }), _jsxs("div", { className: "flex flex-col items-start gap-2 py-2", children: [_jsx(CheckCircle2, { className: "w-5 h-5 text-slate-600", "aria-hidden": "true" }), _jsx("p", { className: "text-xs text-slate-500 font-mono", children: "No completed tasks" }), _jsx("p", { className: "text-xs text-slate-600 font-mono", children: "Tasks will appear here once they reach DONE." })] })] }));
    }
    const displayTitle = truncateTitle(task.title, 60);
    const completedAgo = task.completed_at ? relativeTime(task.completed_at) : "unknown";
    return (_jsxs(motion.div, { className: "border border-white/6 bg-gradient-to-b from-[#222222] to-[#141414] rounded-2xl p-4 card-hover-glow", initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.22 }, role: "region", "aria-label": "Last completed task", children: [_jsx("div", { className: "section-label mb-3", children: "LAST COMPLETED TASK" }), _jsxs("div", { className: "flex items-start gap-3", children: [_jsx(CheckCircle2, { className: "w-4 h-4 text-[#2DD4A8] shrink-0 mt-0.5", "aria-hidden": "true" }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex items-center gap-2 mb-1 flex-wrap", children: [_jsx("span", { className: "text-[10px] font-mono text-[#B47AFF] tracking-wider shrink-0", children: task.task_id }), qualityScore !== null && (_jsxs("span", { className: "text-[10px] font-mono text-[#BDF000] shrink-0", children: [qualityScore, "%"] }))] }), _jsx("p", { className: "text-sm text-[#D4D0C8] font-mono leading-snug break-words", title: task.title.length > 60 ? task.title : undefined, children: displayTitle }), _jsxs("div", { className: "flex items-center gap-1.5 mt-2", children: [_jsx(Clock, { className: "w-3 h-3 text-[#7A776E]", "aria-hidden": "true" }), _jsx("span", { className: "text-[10px] text-[#7A776E] tracking-wider font-mono", children: completedAgo })] })] })] })] }));
}
// ---- Main Dashboard ----
export default function Dashboard() {
    const { isGlobal } = useProject();
    // Data fetching
    const tasks = usePollingData("/api/tasks");
    const retros = usePollingData("/api/retrospectives");
    const agents = usePollingData("/api/agents");
    const metrics = usePollingData("/api/autofix-metrics");
    // Find most recent task
    const mostRecentTask = useMemo(() => {
        if (!tasks.data || tasks.data.length === 0)
            return null;
        return [...tasks.data].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    }, [tasks.data]);
    // Fetch execution log for most recent task
    const logUrl = mostRecentTask
        ? `/api/tasks/${mostRecentTask.task_id}/execution-log`
        : "";
    const execLog = usePollingData(logUrl || "/api/tasks/__none__/execution-log", logUrl ? 5000 : 999999);
    // Computed values
    const logLines = execLog.data?.lines ?? [];
    const qualityPercentage = isGlobal
        ? getMeanQuality(retros.data ?? [])
        : getLatestQuality(retros.data ?? []);
    // Most recent DONE task and its quality score
    const lastDoneTask = useMemo(() => {
        if (!tasks.data || tasks.data.length === 0)
            return null;
        const doneTasks = tasks.data
            .filter((t) => t.stage === "DONE")
            .sort((a, b) => {
            const aTime = a.completed_at ? new Date(a.completed_at).getTime() : new Date(a.created_at).getTime();
            const bTime = b.completed_at ? new Date(b.completed_at).getTime() : new Date(b.created_at).getTime();
            return bTime - aTime;
        });
        return doneTasks.length > 0 ? doneTasks[0] : null;
    }, [tasks.data]);
    const lastDoneQuality = useMemo(() => {
        if (!lastDoneTask || !retros.data)
            return null;
        const match = retros.data.find((r) => r.task_id === lastDoneTask.task_id);
        return match ? Math.round(match.quality_score * 100) : null;
    }, [lastDoneTask, retros.data]);
    const activeTasks = useMemo(() => (tasks.data ?? []).filter((t) => t.stage !== "DONE").length, [tasks.data]);
    const agentCount = agents.data?.length ?? 0;
    const findingsCount = metrics.data?.totals?.findings ?? 0;
    const lastScan = metrics.data?.generated_at ?? null;
    const daemonActive = isDaemonActive(logLines);
    // Sparkline data derived from retrospectives (AC-10)
    const taskCountSpark = useMemo(() => deriveTaskCountSparkData(tasks.data ?? []), [tasks.data]);
    const agentSpark = useMemo(() => deriveAgentSparkData(retros.data ?? []), [retros.data]);
    const findingsSpark = useMemo(() => deriveFindingsSparkData(retros.data ?? []), [retros.data]);
    const qualitySpark = useMemo(() => deriveQualitySparkData(retros.data ?? []), [retros.data]);
    // Trend computation: compare latest retro values to previous retro
    const trends = useMemo(() => {
        const retroData = retros.data ?? [];
        const taskData = tasks.data ?? [];
        // Tasks trend: compare active count to what it was in the previous retro period
        // Use task count spark data for a simpler approach: compare last two day-counts
        const tasksTrend = (() => {
            if (taskCountSpark.length < 2)
                return null;
            const curr = taskCountSpark[taskCountSpark.length - 1];
            const prev = taskCountSpark[taskCountSpark.length - 2];
            if (prev === 0)
                return curr > 0 ? 100 : 0;
            return ((curr - prev) / prev) * 100;
        })();
        // Agents trend: compare last two retro subagent spawn counts
        const agentsTrend = (() => {
            if (agentSpark.length < 2)
                return null;
            const curr = agentSpark[agentSpark.length - 1];
            const prev = agentSpark[agentSpark.length - 2];
            if (prev === 0)
                return curr > 0 ? 100 : 0;
            return ((curr - prev) / prev) * 100;
        })();
        // Findings trend: compare last two retro finding totals
        const findingsTrend = (() => {
            if (findingsSpark.length < 2)
                return null;
            const curr = findingsSpark[findingsSpark.length - 1];
            const prev = findingsSpark[findingsSpark.length - 2];
            if (prev === 0)
                return curr > 0 ? 100 : 0;
            return ((curr - prev) / prev) * 100;
        })();
        return { tasksTrend, agentsTrend, findingsTrend };
    }, [taskCountSpark, agentSpark, findingsSpark, retros.data, tasks.data]);
    // Global mode: interleaved log entries with project tags
    const globalLogEntries = useMemo(() => {
        if (!isGlobal || !execLog.data?.lines)
            return [];
        // In global mode the API returns lines from all projects;
        // parse project tag if present, otherwise label as unknown
        return execLog.data.lines.map((line) => {
            const tagMatch = line.match(/^\[([^\]]+)\]\s*(.*)$/);
            if (tagMatch) {
                return { project: tagMatch[1], line: tagMatch[2] };
            }
            const project = mostRecentTask?.project_path?.split("/").pop() ?? "";
            return { project, line };
        });
    }, [isGlobal, execLog.data, mostRecentTask]);
    // Unified error state
    const hasError = tasks.error || retros.error;
    const errorMessage = tasks.error ?? retros.error ?? "Unable to connect to the daemon.";
    const isLoading = tasks.loading || retros.loading;
    return (_jsxs("div", { className: "flex h-full relative", children: [_jsxs("aside", { className: "hidden lg:flex lg:w-80 flex-col border-r border-white/6 p-5 overflow-y-auto shrink-0", children: [_jsx("div", { className: "section-label mb-4", children: "REAL-TIME MONITOR" }), _jsx("div", { className: "border border-white/6 bg-gradient-to-b from-[#222222] to-[#141414] rounded-2xl p-4 card-hover-glow mb-4 flex-1 min-h-0 overflow-y-auto", children: execLog.loading ? (_jsx(LeftPanelSkeleton, {})) : execLog.error ? (_jsx(ErrorCard, { message: "Unable to load execution logs.", onRetry: () => execLog.refetch() })) : (_jsx(LogFeed, { lines: logLines, isGlobal: isGlobal, globalEntries: globalLogEntries })) }), _jsxs("div", { className: "border border-white/6 bg-gradient-to-b from-[#222222] to-[#141414] rounded-2xl p-4 card-hover-glow mb-4", children: [_jsx("div", { className: "text-[10px] text-[#7A776E] tracking-[0.12em] uppercase mb-2", children: "Daemon" }), _jsx(DaemonHeartbeat, { active: daemonActive, isLoading: execLog.loading })] }), _jsxs("div", { className: "flex items-center gap-2 px-1 mt-auto pt-3 border-t border-white/6", children: [_jsx(MonitorDot, { className: "w-3 h-3 text-[#7A776E]", "aria-hidden": "true" }), _jsx("span", { className: "text-[10px] text-[#7A776E] tracking-[0.15em] uppercase", children: isGlobal ? "GLOBAL MODE" : "PROJECT MODE" })] })] }), _jsxs("main", { className: "flex-1 flex flex-col p-6 overflow-y-auto relative z-10", children: [_jsxs("div", { className: "flex items-center gap-3 mb-5", children: [_jsx("span", { className: "text-[10px] text-[#7A776E] tracking-[0.15em] uppercase", children: isGlobal ? "GLOBAL OVERVIEW" : "PROJECT DASHBOARD" }), _jsx("div", { className: "h-px flex-1 bg-white/6" })] }), _jsx("div", { className: "absolute inset-0 flex items-center justify-center pointer-events-none", "aria-hidden": "true", children: _jsxs("svg", { width: "240", height: "240", viewBox: "0 0 240 240", className: "opacity-[0.04]", children: [_jsx("circle", { cx: "120", cy: "120", r: "100", fill: "none", stroke: "#BDF000", strokeWidth: "1", strokeDasharray: "4 12", style: { animation: "qualityOuterRotate 60s linear infinite" } }), _jsx("circle", { cx: "120", cy: "120", r: "75", fill: "none", stroke: "#B47AFF", strokeWidth: "1", strokeDasharray: "3 10", style: { animation: "qualityInnerRotate 90s linear infinite" } }), _jsx("circle", { cx: "120", cy: "120", r: "50", fill: "none", stroke: "#2DD4A8", strokeWidth: "0.5", strokeDasharray: "2 8", style: { animation: "qualityOuterRotate 120s linear infinite" } })] }) }), _jsx("div", { className: "relative z-10", children: isLoading ? (_jsx(CenterPanelSkeleton, {})) : hasError ? (_jsx(ErrorCard, { message: errorMessage, onRetry: () => { tasks.refetch(); retros.refetch(); } })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5", children: [_jsx(MetricCard, { label: "Active Tasks", value: activeTasks, trend: trends.tasksTrend, trendLabel: `of ${tasks.data?.length ?? 0} total`, icon: _jsx(Activity, { className: "w-3 h-3 text-[#BDF000]" }), delay: 0.05 }), _jsx(MetricCard, { label: "Agents", value: agentCount, trend: trends.agentsTrend, trendLabel: "in registry", icon: _jsx(Bot, { className: "w-3 h-3 text-[#B47AFF]" }), delay: 0.1 }), _jsx(MetricCard, { label: "Findings", value: findingsCount, trend: trends.findingsTrend, trendLabel: "tracked", icon: _jsx(Shield, { className: "w-3 h-3 text-[#2DD4A8]" }), delay: 0.15 })] }), _jsx(motion.div, { className: "border border-white/6 bg-gradient-to-b from-[#222222] to-[#141414] rounded-2xl p-4 card-hover-glow mb-5", initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.2 }, children: _jsxs("div", { className: "flex items-center justify-between gap-4 flex-wrap", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(Clock, { className: "w-3 h-3 text-[#2DD4A8]", "aria-hidden": "true" }), _jsx("span", { className: "text-[10px] text-[#7A776E] tracking-[0.12em] uppercase", children: "Last Scan" }), _jsx("span", { className: "text-sm font-mono text-[#D4D0C8]", children: lastScan ? formatTimestamp(lastScan) : "No scans yet" })] }), _jsx(MiniSparkline, { data: qualitySpark, color: "#2DD4A8" })] }) }), _jsx("div", { className: "mt-5", children: _jsx(LastTaskCard, { task: lastDoneTask, qualityScore: lastDoneQuality, isLoading: tasks.loading }) }), _jsx("div", { className: "lg:hidden", children: _jsxs(motion.div, { className: "border border-white/6 bg-gradient-to-b from-[#222222] to-[#141414] rounded-2xl p-4 card-hover-glow", initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.25 }, children: [_jsx("div", { className: "section-label mb-3", children: "RECENT ACTIVITY" }), _jsx(LogFeed, { lines: logLines, isGlobal: isGlobal, globalEntries: globalLogEntries })] }) }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-5", children: _jsx(HealthCheckCard, {}) })] })) })] }), _jsxs("aside", { className: "hidden lg:flex lg:w-80 flex-col border-l border-white/6 p-5 overflow-y-auto shrink-0", children: [_jsxs("div", { className: "flex items-center gap-3 mb-6", children: [_jsxs("svg", { viewBox: "0 0 80 100", className: "w-[32px] h-[40px] shrink-0", "aria-hidden": "true", children: [_jsx("rect", { x: "16", y: "22", width: "12", height: "56", rx: "3", fill: "#BDF000" }), _jsx("rect", { x: "34", y: "10", width: "12", height: "80", rx: "3", fill: "#BDF000" }), _jsx("rect", { x: "52", y: "30", width: "12", height: "42", rx: "3", fill: "#BDF000", opacity: "0.55" })] }), _jsxs("div", { children: [_jsx("div", { className: "text-lg font-semibold text-[#F0F0E8] tracking-wider leading-none", children: "dynos" }), _jsx("div", { className: "text-[9px] text-[#BDF000]/40 tracking-[0.15em] uppercase mt-0.5", children: "autonomous dev" })] })] }), _jsx("div", { className: "section-label mb-4", children: "QUALITY COEFFICIENT" }), _jsx("div", { className: "border border-white/6 bg-gradient-to-b from-[#222222] to-[#141414] rounded-2xl p-5 card-hover-glow mb-6", children: retros.loading ? (_jsx(RightPanelSkeleton, {})) : retros.error ? (_jsx(ErrorCard, { message: "Unable to load quality data.", onRetry: () => retros.refetch() })) : (_jsxs("div", { className: "flex flex-col items-center", children: [_jsx(QualityRings, { percentage: qualityPercentage }), _jsx("div", { className: "mt-3 text-center", children: _jsx("span", { className: "text-[10px] text-[#7A776E] tracking-[0.12em]", children: isGlobal ? "MEAN ACROSS PROJECTS" : "LATEST RETROSPECTIVE" }) })] })) }), _jsx("div", { className: "section-label mb-4", children: "SYSTEM DIAGNOSTICS" }), _jsx("div", { className: "border border-white/6 bg-gradient-to-b from-[#222222] to-[#141414] rounded-2xl p-4 card-hover-glow", children: isLoading ? (_jsx(RightPanelSkeleton, {})) : hasError ? (_jsx(ErrorCard, { message: "Unable to load diagnostics.", onRetry: () => { tasks.refetch(); retros.refetch(); } })) : (_jsxs("div", { className: "text-xs font-mono space-y-3", children: [_jsx(DiagnosticRow, { label: "Tasks", value: `${activeTasks} active`, icon: Activity, sparkData: taskCountSpark, sparkColor: "#BDF000" }), _jsx(DiagnosticRow, { label: "Agents", value: `${agentCount}`, icon: Bot, sparkData: agentSpark, sparkColor: "#B47AFF" }), _jsx(DiagnosticRow, { label: "Findings", value: `${findingsCount}`, icon: Shield, sparkData: findingsSpark, sparkColor: "#2DD4A8" }), _jsx(DiagnosticRow, { label: "Daemon", value: daemonActive ? "ACTIVE" : "IDLE", icon: MonitorDot }), _jsx(DiagnosticRow, { label: "Last Scan", value: lastScan ? formatTimestamp(lastScan) : "None", icon: Clock, sparkData: qualitySpark, sparkColor: "#2DD4A8" })] })) })] })] }));
}
