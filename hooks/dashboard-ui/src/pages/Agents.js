import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Agents page — displays learned agents in a responsive card grid.
 *
 * Card grid: grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6
 * Color coding by mode: cyan (replace), teal (alongside), purple (shadow).
 * Red text for demoted status.
 * States: skeleton loading, error with retry, empty, success.
 */
import { motion } from "motion/react";
import { Bot, Hexagon, TrendingUp, TrendingDown, Zap, ArrowUpCircle, AlertTriangle } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { usePollingData } from "@/data/hooks";
import { useProject } from "@/data/ProjectContext";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricCard } from "@/components/MetricCard";
/** Mode-to-color mapping per spec. */
const MODE_COLORS = {
    replace: "#BDF000",
    alongside: "#2DD4A8",
    shadow: "#B47AFF",
};
/** Fallback color for unknown modes. */
const DEFAULT_MODE_COLOR = "#999";
function getModeColor(mode) {
    return MODE_COLORS[mode] ?? DEFAULT_MODE_COLOR;
}
/** Format delta as +X.XX or -X.XX. */
function formatDelta(delta) {
    return delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
}
// ---------------------------------------------------------------------------
// Skeleton loading state — matches card layout shape to prevent layout shift
// ---------------------------------------------------------------------------
function SkeletonCards() {
    return (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6", role: "status", "aria-label": "Loading agents", children: Array.from({ length: 6 }).map((_, i) => (_jsxs("div", { className: "border border-white/5 bg-[#0F1114]/60 backdrop-blur-md p-6 relative", children: [_jsx("div", { className: "absolute top-0 right-0 w-8 h-8 border-t border-r border-white/5" }), _jsxs("div", { className: "flex justify-between items-start mb-6", children: [_jsxs("div", { className: "space-y-2 flex-1", children: [_jsx(Skeleton, { className: "h-3 w-20" }), _jsx(Skeleton, { className: "h-6 w-48" }), _jsx(Skeleton, { className: "h-3 w-32" })] }), _jsx(Skeleton, { className: "h-9 w-9 rounded" })] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex justify-between items-end border-b border-white/5 pb-2", children: [_jsx(Skeleton, { className: "h-3 w-28" }), _jsx(Skeleton, { className: "h-8 w-16" })] }), _jsxs("div", { className: "flex justify-between items-center", children: [_jsx(Skeleton, { className: "h-3 w-16" }), _jsx(Skeleton, { className: "h-5 w-20" })] })] })] }, i))) }));
}
// ---------------------------------------------------------------------------
// Error state — human-readable message with retry action
// ---------------------------------------------------------------------------
function ErrorCard({ message, onRetry, }) {
    return (_jsxs("div", { className: "border border-red-500/30 bg-red-500/10 backdrop-blur-md p-8 text-center max-w-md mx-auto", role: "alert", children: [_jsx("div", { className: "text-red-400 font-mono text-sm mb-2", children: "SYSTEM ERROR" }), _jsx("p", { className: "text-slate-400 text-sm mb-6", children: message }), _jsx("button", { onClick: onRetry, className: "px-4 py-2 bg-[#BDF000]/5 hover:bg-[#BDF000]/20 text-[#BDF000] border border-[#BDF000]/20 font-mono text-xs transition-colors", "aria-label": "Retry loading agents", children: "RETRY" })] }));
}
// ---------------------------------------------------------------------------
// Empty state — guides the user toward action
// ---------------------------------------------------------------------------
function EmptyState() {
    return (_jsxs("div", { className: "text-center py-16 max-w-md mx-auto", role: "status", children: [_jsx(Bot, { className: "w-12 h-12 text-slate-600 mx-auto mb-4", "aria-hidden": "true" }), _jsx("p", { className: "text-slate-400 font-mono text-sm", children: "No learned agents registered" }), _jsx("p", { className: "text-slate-600 font-mono text-xs mt-2", children: "Agents are created automatically when tasks complete and patterns are learned." })] }));
}
/**
 * Renders a mini sparkline (40px tall, ~120px wide) showing the agent's
 * composite score over time. When only a single data point exists, a flat
 * line is shown so the chart is never empty.
 */
function BenchmarkSparkline({ score }) {
    // With only the current snapshot we have a single data point.
    // Duplicate it to produce a visible flat line.
    const data = [{ value: score }, { value: score }];
    return (_jsx("div", { className: "mt-2", style: { width: 120, height: 40 }, "aria-label": `Benchmark trend: ${score.toFixed(2)}`, role: "img", children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsx(LineChart, { data: data, children: _jsx(Line, { type: "monotone", dataKey: "value", stroke: "#BDF000", strokeWidth: 1.5, dot: false, isAnimationActive: false }) }) }) }));
}
// ---------------------------------------------------------------------------
// AC-17: Promotion timeline
// ---------------------------------------------------------------------------
/** Color map for mode dots on the promotion timeline. */
const TIMELINE_DOT_COLORS = {
    shadow: "#B47AFF",
    alongside: "#2DD4A8",
    replace: "#BDF000",
    demoted: "#FF3B3B",
};
/**
 * Derives an ordered list of mode stages the agent has passed through.
 * The canonical promotion path is shadow -> alongside -> replace.
 * If the agent is demoted, that is appended as a final stage.
 * With only a snapshot (no history endpoint), we infer prior stages from
 * the current mode position in the canonical sequence.
 */
function deriveTimelineStages(mode, status) {
    const canonical = ["shadow", "alongside", "replace"];
    const currentIndex = canonical.indexOf(mode);
    let stages;
    if (currentIndex >= 0) {
        stages = canonical.slice(0, currentIndex + 1);
    }
    else {
        // Unknown mode — show just the current
        stages = [mode];
    }
    if (status === "demoted") {
        stages.push("demoted");
    }
    return stages;
}
/**
 * Small horizontal timeline of colored dots connected by a thin line.
 * Each dot represents a mode transition stage.
 */
function PromotionTimeline({ mode, status, }) {
    const stages = deriveTimelineStages(mode, status);
    return (_jsxs("div", { className: "flex items-center gap-0 mt-2", "aria-label": `Promotion timeline: ${stages.join(" then ")}`, role: "img", children: [stages.map((stage, idx) => {
                const color = TIMELINE_DOT_COLORS[stage] ?? DEFAULT_MODE_COLOR;
                return (_jsxs("div", { className: "flex items-center", children: [idx > 0 && (_jsx("div", { className: "h-px w-4", style: { backgroundColor: `${color}80` }, "aria-hidden": "true" })), _jsx("div", { className: "w-2 h-2 rounded-full shrink-0", style: { backgroundColor: color }, title: stage.toUpperCase(), "aria-hidden": "true" })] }, `${stage}-${idx}`));
            }), _jsx("span", { className: "ml-2 text-[10px] font-mono text-slate-600 uppercase", children: stages[stages.length - 1] })] }));
}
// ---------------------------------------------------------------------------
// AC-18: Baseline vs candidate comparison bars
// ---------------------------------------------------------------------------
/**
 * Two small horizontal bars comparing baseline (gray) vs candidate (colored).
 * Only rendered when both benchmark_summary and baseline_summary exist.
 */
function BaselineCandidateBars({ baselineScore, candidateScore, modeColor, }) {
    // Normalize bars relative to the higher score, minimum 0.1 to avoid zero-width
    const maxScore = Math.max(baselineScore, candidateScore, 0.01);
    const baseWidth = Math.max((baselineScore / maxScore) * 100, 5);
    const candWidth = Math.max((candidateScore / maxScore) * 100, 5);
    return (_jsxs("div", { className: "mt-3 space-y-1.5", "aria-label": `Baseline ${baselineScore.toFixed(2)} vs Candidate ${candidateScore.toFixed(2)}`, role: "group", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-[9px] font-mono text-slate-500 w-8 shrink-0", children: "BASE" }), _jsx("div", { className: "flex-1 h-2 bg-white/5 rounded-sm overflow-hidden", children: _jsx("div", { className: "h-full rounded-sm", style: {
                                width: `${baseWidth}%`,
                                backgroundColor: "#666",
                            } }) }), _jsx("span", { className: "text-[9px] font-mono text-slate-500 w-8 text-right shrink-0", children: baselineScore.toFixed(2) })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-[9px] font-mono text-slate-500 w-8 shrink-0", children: "CAND" }), _jsx("div", { className: "flex-1 h-2 bg-white/5 rounded-sm overflow-hidden", children: _jsx("div", { className: "h-full rounded-sm", style: {
                                width: `${candWidth}%`,
                                backgroundColor: modeColor,
                            } }) }), _jsx("span", { className: "text-[9px] font-mono text-slate-500 w-8 text-right shrink-0", children: candidateScore.toFixed(2) })] })] }));
}
// ---------------------------------------------------------------------------
// Agent card — one card per learned agent
// ---------------------------------------------------------------------------
function AgentCard({ agent, index, }) {
    const modeColor = getModeColor(agent.mode);
    const isDemoted = agent.status === "demoted";
    const hasBenchmark = agent.benchmark_summary != null;
    const hasEvaluation = agent.last_evaluation != null;
    return (_jsxs(motion.div, { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { delay: index * 0.1, duration: 0.5 }, className: "border border-white/5 bg-[#0F1114]/60 backdrop-blur-md p-6 relative group card-hover-glow", role: "article", "aria-label": `Agent: ${agent.agent_name}`, children: [_jsx("div", { className: "absolute top-0 right-0 w-8 h-8 border-t border-r transition-colors", style: {
                    borderColor: `${modeColor}4D`,
                }, "aria-hidden": "true" }), _jsxs("div", { className: "flex justify-between items-start mb-6", children: [_jsxs("div", { className: "min-w-0 flex-1 mr-3", children: [_jsxs("div", { className: "text-[10px] text-slate-500 font-mono tracking-widest mb-1 flex items-center gap-2", children: [_jsx(Bot, { className: "w-3 h-3 shrink-0", "aria-hidden": "true" }), _jsxs("span", { className: "uppercase truncate", children: [agent.item_kind, " / ", agent.task_type] })] }), _jsx("h2", { className: "text-xl font-medium tracking-wide text-slate-200 truncate", title: agent.agent_name, children: agent.agent_name }), _jsxs("div", { className: "text-xs text-slate-400 font-mono mt-1 truncate", children: ["ROLE: ", agent.role.toUpperCase()] })] }), _jsx("div", { className: "p-2 rounded bg-white/5 border border-white/5 shrink-0", style: { color: modeColor }, children: _jsx(Hexagon, { className: "w-5 h-5", "aria-hidden": "true" }) })] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex justify-between items-end border-b border-white/5 pb-2", children: [_jsx("span", { className: "text-xs font-mono text-slate-500", children: "COMPOSITE SCORE" }), hasBenchmark ? (_jsx("span", { className: "text-2xl font-light font-mono", style: { color: modeColor }, children: agent.benchmark_summary.mean_composite.toFixed(2) })) : (_jsx("span", { className: "text-sm font-mono text-slate-600", children: "NO BENCHMARK DATA" }))] }), hasBenchmark && (_jsx(BenchmarkSparkline, { score: agent.benchmark_summary.mean_composite })), _jsx(PromotionTimeline, { mode: agent.mode, status: agent.status }), hasBenchmark && agent.baseline_summary != null && (_jsx(BaselineCandidateBars, { baselineScore: agent.baseline_summary.mean_composite, candidateScore: agent.benchmark_summary.mean_composite, modeColor: modeColor })), _jsxs("div", { className: "flex justify-between items-center text-xs font-mono", children: [_jsx("span", { className: "text-slate-500", children: "MODE" }), _jsx("span", { style: { color: modeColor }, children: agent.mode.toUpperCase() })] }), _jsxs("div", { className: "flex justify-between items-center text-xs font-mono", children: [_jsx("span", { className: "text-slate-500", children: "STATUS" }), _jsx("span", { className: isDemoted ? "text-[#FF3B3B]" : "text-slate-300", children: agent.status.toUpperCase() })] }), hasEvaluation && (_jsxs("div", { className: "pt-4 mt-2 border-t border-white/5 flex items-center justify-between gap-2", children: [_jsx(Badge, { variant: "outline", className: "font-mono text-[10px] uppercase", children: agent.last_evaluation.recommendation }), _jsxs("span", { className: "text-sm font-mono flex items-center gap-1", style: {
                                    color: agent.last_evaluation.delta_composite >= 0
                                        ? "#2DD4A8"
                                        : "#FF3B3B",
                                }, children: [agent.last_evaluation.delta_composite >= 0 ? (_jsx(TrendingUp, { className: "w-3 h-3", "aria-hidden": "true" })) : (_jsx(TrendingDown, { className: "w-3 h-3", "aria-hidden": "true" })), formatDelta(agent.last_evaluation.delta_composite)] })] }))] })] }));
}
// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default function Agents() {
    const { selectedProject } = useProject();
    const { data, loading, error, refetch } = usePollingData("/api/agents");
    const isInitialLoad = loading && data === null;
    const isError = error !== null && data === null;
    const isEmpty = !loading && !error && data !== null && data.length === 0;
    const hasData = data !== null && data.length > 0;
    const isStaleError = error !== null && data !== null;
    return (_jsxs("div", { className: "p-8 h-full flex flex-col", children: [_jsxs("header", { className: "mb-8", children: [_jsx("h1", { className: "text-3xl font-mono font-light tracking-[0.2em] text-[#BDF000]", children: "AGENTS" }), _jsx("p", { className: "text-slate-500 font-mono text-xs mt-2", children: "// LEARNED AGENTS & BENCHMARK STATUS" })] }), hasData && (_jsxs("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6", children: [_jsx(MetricCard, { label: "Total Agents", value: data.length, trend: null, icon: _jsx(Bot, { className: "w-3.5 h-3.5 text-[#7A776E]", "aria-hidden": "true" }), delay: 0 }), _jsx(MetricCard, { label: "Active", value: data.filter((a) => a.status.includes("active")).length, trend: null, icon: _jsx(Zap, { className: "w-3.5 h-3.5 text-[#7A776E]", "aria-hidden": "true" }), delay: 0.05 }), _jsx(MetricCard, { label: "Replace Mode", value: data.filter((a) => a.mode === "replace").length, trend: null, icon: _jsx(ArrowUpCircle, { className: "w-3.5 h-3.5 text-[#7A776E]", "aria-hidden": "true" }), delay: 0.1 }), _jsx(MetricCard, { label: "Demoted", value: data.filter((a) => a.status.includes("demoted")).length, trend: null, icon: _jsx(AlertTriangle, { className: "w-3.5 h-3.5 text-[#7A776E]", "aria-hidden": "true" }), delay: 0.15 })] })), isStaleError && hasData && (_jsxs("div", { className: "mb-4 px-4 py-2 border border-red-500/30 bg-red-500/10 text-red-400 text-xs font-mono flex items-center justify-between", role: "alert", children: [_jsx("span", { children: "Connection issue: displaying cached data" }), _jsx("button", { onClick: refetch, className: "text-[#BDF000] hover:underline ml-4", "aria-label": "Retry connection", children: "RETRY" })] })), isInitialLoad && _jsx(SkeletonCards, {}), isError && !hasData && (_jsx(ErrorCard, { message: "Unable to load agent data. Check that the daemon is running.", onRetry: refetch })), isEmpty && _jsx(EmptyState, {}), hasData && (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 flex-1 overflow-auto", children: data.map((agent, idx) => (_jsx(AgentCard, { agent: agent, index: idx }, agent.agent_name))) }))] }));
}
