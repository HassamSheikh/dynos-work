import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useParams, Link } from "react-router";
import { useState, useMemo, useEffect } from "react";
import { motion } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, FileText, GitBranch, Shield, DollarSign, Activity, Clock, Zap, FileX, ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertTriangle, Network, BookOpen, RefreshCw, } from "lucide-react";
import { usePollingData, useAutoRefresh, useProjectsSummary, useAuditSummary, useRepairLog, useHandoff, useAuditPlan, TERMINAL_STAGES, } from "@/data/hooks";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricCard } from "@/components/MetricCard";
import { Collapsible, CollapsibleTrigger, CollapsibleContent, } from "@/components/ui/collapsible";
// ---- Constants ----
const STAGE_COLORS = {
    DONE: "#2DD4A8",
    FAILED: "#FF3B3B",
    BLOCKED: "#FF3B3B",
};
const RISK_COLORS = {
    low: "#BDF000",
    medium: "#2DD4A8",
    high: "#B47AFF",
    critical: "#FF3B3B",
};
const EXECUTOR_COLORS = {
    ui: "#BDF000",
    backend: "#2DD4A8",
    ml: "#B47AFF",
    test: "#FF9F43",
    infra: "#FF3B3B",
    db: "#FF7043",
};
const SEVERITY_COLORS = {
    critical: "#FF3B3B",
    high: "#B47AFF",
    medium: "#FF9F43",
    low: "#BDF000",
};
const IN_PROGRESS_COLOR = "#FF9F43";
// AC 20 — rates per 1M tokens
const RATES_PER_MILLION = {
    haiku: { input: 0.80, output: 4.00 },
    sonnet: { input: 3.00, output: 15.00 },
    opus: { input: 15.00, output: 75.00 },
};
// ---- Pure helpers ----
function getStageColor(stage) {
    if (stage === "DONE")
        return STAGE_COLORS.DONE;
    if (stage.includes("FAIL"))
        return STAGE_COLORS.FAILED;
    if (stage.includes("BLOCKED"))
        return STAGE_COLORS.BLOCKED;
    return IN_PROGRESS_COLOR;
}
function getRiskColor(risk) {
    return RISK_COLORS[risk] ?? "#999";
}
function getExecutorColor(executor) {
    const lower = executor.toLowerCase();
    for (const [key, color] of Object.entries(EXECUTOR_COLORS)) {
        if (lower.includes(key))
            return color;
    }
    return "#999";
}
function getSeverityColor(severity) {
    return SEVERITY_COLORS[severity.toLowerCase()] ?? "#999";
}
function formatTokens(n) {
    if (n >= 1_000_000)
        return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000)
        return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}
function formatTime(iso) {
    try {
        const d = new Date(iso);
        return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }
    catch {
        return iso.slice(11, 19);
    }
}
function formatDate(iso) {
    try {
        return new Date(iso).toLocaleString("en-US", {
            month: "short", day: "numeric", year: "numeric",
            hour: "2-digit", minute: "2-digit", hour12: false,
        });
    }
    catch {
        return iso;
    }
}
function isTerminalStage(stage) {
    return stage != null && TERMINAL_STAGES.includes(stage);
}
function computeModelCostUsd(inputTokens, outputTokens, modelKey) {
    const rate = RATES_PER_MILLION[modelKey];
    if (!rate)
        return 0;
    return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
}
function formatUsd(usd) {
    if (usd === 0)
        return "$0.00";
    if (usd < 0.01)
        return "<$0.01";
    return `$${usd.toFixed(2)}`;
}
// ---- Shared UI primitives ----
function SectionCard({ title, icon, children }) {
    return (_jsxs(motion.div, { className: "border border-white/6 bg-gradient-to-b from-[#222222] to-[#141414] rounded-2xl p-5", initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.28, ease: "easeOut" }, children: [_jsxs("div", { className: "flex items-center gap-1.5 mb-4", children: [icon, _jsx("span", { className: "text-[10px] text-[#7A776E] tracking-[0.12em] uppercase font-medium", children: title })] }), children] }));
}
function NotAvailable({ label }) {
    return (_jsxs("div", { className: "flex items-center gap-2 py-6 justify-center text-[#5A574E]", children: [_jsx(FileX, { className: "w-4 h-4" }), _jsxs("span", { className: "text-xs font-mono", children: [label, " not available yet"] })] }));
}
function SectionSkeleton() {
    return (_jsxs("div", { className: "space-y-3", role: "status", "aria-label": "Loading", children: [_jsx(Skeleton, { className: "h-4 w-full" }), _jsx(Skeleton, { className: "h-4 w-3/4" }), _jsx(Skeleton, { className: "h-4 w-1/2" })] }));
}
function MarkdownBlock({ content }) {
    return (_jsx("div", { className: "prose prose-invert prose-sm max-w-none text-slate-300 [&_pre]:bg-black/30 [&_pre]:p-3 [&_pre]:rounded [&_code]:text-[#BDF000] [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-xs [&_table]:text-xs [&_a]:text-[#BDF000] [&_li]:text-xs [&_p]:text-xs", children: _jsx(ReactMarkdown, { remarkPlugins: [remarkGfm], skipHtml: true, children: content }) }));
}
/** AC 17 — raw preformatted text, NOT rendered markdown */
function PreformattedBlock({ content }) {
    return (_jsx("pre", { className: "text-[11px] text-slate-300 bg-black/30 rounded-lg p-4 max-h-[32rem] overflow-auto", style: { overflowX: "auto", whiteSpace: "pre", fontFamily: "'JetBrains Mono', monospace" }, children: content }));
}
function Badge({ label, color }) {
    return (_jsx("span", { className: "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0", style: { color, borderColor: color + "4D", backgroundColor: color + "1A", border: `1px solid ${color}4D` }, children: label }));
}
function KvRow({ label, value, mono }) {
    return (_jsxs("div", { className: "flex items-baseline gap-3 py-1.5 border-b border-white/5 last:border-0", children: [_jsx("span", { className: "text-[10px] text-[#7A776E] uppercase tracking-wider w-32 shrink-0", children: label }), _jsx("span", { className: `text-xs text-slate-300 ${mono ? "font-mono" : ""} break-all`, children: value })] }));
}
// ---- New 6-tab content components (slug-aware route) ----
/**
 * AC 16 — Overview tab
 * Shows: task ID, title, raw_input, stage badge, classification, fast-track flag,
 * created_at, completed_at (or "—"), blocked_reason (or "—"), snapshot branch/SHA (or "—").
 * All sourced from manifest.
 */
function NewOverviewTab({ manifest }) {
    return (_jsxs("div", { className: "space-y-5 mt-5", children: [_jsx(SectionCard, { title: "Task Identity", icon: _jsx(FileText, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-x-8", children: [_jsx(KvRow, { label: "Task ID", value: manifest.task_id, mono: true }), _jsx(KvRow, { label: "Title", value: manifest.title }), _jsx(KvRow, { label: "Stage", value: _jsx(Badge, { label: manifest.stage, color: getStageColor(manifest.stage) }) }), _jsx(KvRow, { label: "Fast Track", value: manifest.fast_track ? "Yes" : "No", mono: true }), _jsx(KvRow, { label: "Created", value: formatDate(manifest.created_at), mono: true }), _jsx(KvRow, { label: "Completed", value: manifest.completed_at ? formatDate(manifest.completed_at) : "—", mono: true }), _jsx(KvRow, { label: "Blocked Reason", value: manifest.blocked_reason ?? "—", mono: true }), _jsx(KvRow, { label: "Snapshot Branch", value: manifest.snapshot?.branch ?? "—", mono: true }), _jsx(KvRow, { label: "Snapshot SHA", value: manifest.snapshot?.head_sha ?? "—", mono: true })] }) }), _jsx(SectionCard, { title: "Classification", icon: _jsx(Shield, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-x-8", children: [_jsx(KvRow, { label: "Type", value: manifest.classification?.type ?? "—", mono: true }), _jsx(KvRow, { label: "Domains", value: manifest.classification?.domains?.length
                                ? manifest.classification.domains.join(", ")
                                : "—", mono: true }), _jsx(KvRow, { label: "Risk Level", value: manifest.classification?.risk_level
                                ? _jsx(Badge, { label: manifest.classification.risk_level, color: getRiskColor(manifest.classification.risk_level) })
                                : "—" })] }) }), _jsx(SectionCard, { title: "Raw Input", icon: _jsx(FileText, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: manifest.raw_input ? (_jsx(PreformattedBlock, { content: manifest.raw_input })) : (_jsx(NotAvailable, { label: "Raw input" })) })] }));
}
/**
 * AC 17 — Spec & Plan tab
 * Shows raw spec.md, raw plan.md, raw execution-graph.json as formatted JSON.
 * All as preformatted text, NOT rendered markdown.
 * When absent, shows "not yet available".
 */
function NewSpecPlanTab({ taskId, projectPath }) {
    const specUrl = `/api/tasks/${encodeURIComponent(taskId)}/spec?project=${encodeURIComponent(projectPath)}`;
    const planUrl = `/api/tasks/${encodeURIComponent(taskId)}/plan?project=${encodeURIComponent(projectPath)}`;
    const graphUrl = `/api/tasks/${encodeURIComponent(taskId)}/execution-graph?project=${encodeURIComponent(projectPath)}`;
    const { data: specData, loading: sLoading } = useAutoRefresh(specUrl, null);
    const { data: planData, loading: pLoading } = useAutoRefresh(planUrl, null);
    const { data: graphData, loading: gLoading } = useAutoRefresh(graphUrl, null);
    return (_jsxs("div", { className: "space-y-5 mt-5", children: [_jsxs(SectionCard, { title: "Spec (Acceptance Criteria)", icon: _jsx(FileText, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [sLoading && _jsx(SectionSkeleton, {}), !sLoading && specData?.content
                        ? _jsx(PreformattedBlock, { content: specData.content })
                        : !sLoading
                            ? _jsx(NotAvailable, { label: "Spec" })
                            : null] }), _jsxs(SectionCard, { title: "Implementation Plan", icon: _jsx(FileText, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [pLoading && _jsx(SectionSkeleton, {}), !pLoading && planData?.content
                        ? _jsx(PreformattedBlock, { content: planData.content })
                        : !pLoading
                            ? _jsx(NotAvailable, { label: "Plan" })
                            : null] }), _jsxs(SectionCard, { title: "Execution Graph (JSON)", icon: _jsx(GitBranch, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [gLoading && _jsx(SectionSkeleton, {}), !gLoading && graphData
                        ? _jsx(PreformattedBlock, { content: JSON.stringify(graphData, null, 2) })
                        : !gLoading
                            ? _jsx(NotAvailable, { label: "Execution graph" })
                            : null] })] }));
}
/**
 * AC 18 — Execution tab
 * Shows: execution graph segment list + execution-log.md as preformatted text.
 * When execution-log.md absent, shows "not yet available".
 */
function NewExecutionTab({ taskId, projectPath }) {
    const graphUrl = `/api/tasks/${encodeURIComponent(taskId)}/execution-graph?project=${encodeURIComponent(projectPath)}`;
    const logUrl = `/api/tasks/${encodeURIComponent(taskId)}/execution-log?project=${encodeURIComponent(projectPath)}`;
    const { data: graphData, loading: gLoading } = useAutoRefresh(graphUrl, null);
    const { data: logData, loading: lLoading } = useAutoRefresh(logUrl, null);
    return (_jsxs("div", { className: "space-y-5 mt-5", children: [_jsxs(SectionCard, { title: "Execution Segments", icon: _jsx(Network, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [gLoading && _jsx(SectionSkeleton, {}), !gLoading && graphData?.segments && graphData.segments.length > 0 ? (_jsx("div", { className: "space-y-3", children: graphData.segments.map((seg) => {
                            const exColor = getExecutorColor(seg.executor);
                            return (_jsxs("div", { className: "border rounded-xl p-4 space-y-2", style: { borderColor: exColor + "3D", backgroundColor: exColor + "08" }, children: [_jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsx("span", { className: "font-mono text-xs font-bold", style: { color: exColor }, children: seg.id }), _jsx(Badge, { label: seg.executor, color: exColor }), seg.parallelizable && _jsx(Badge, { label: "parallel", color: "#7A776E" })] }), seg.description && (_jsx("p", { className: "text-xs text-slate-400", children: seg.description })), seg.depends_on.length > 0 && (_jsxs("div", { className: "text-[10px] text-[#7A776E]", children: [_jsx("span", { className: "mr-1", children: "Depends on:" }), seg.depends_on.map((d) => (_jsx("span", { className: "font-mono text-slate-400 mr-1", children: d }, d)))] })), seg.files_expected.length > 0 && (_jsxs("div", { className: "text-[10px] text-[#7A776E]", children: [_jsx("span", { className: "block mb-0.5", children: "Files expected:" }), seg.files_expected.map((f) => (_jsx("span", { className: "font-mono text-slate-500 mr-1 block truncate", title: f, children: f }, f)))] }))] }, seg.id));
                        }) })) : !gLoading ? (_jsx(NotAvailable, { label: "Execution segments" })) : null] }), _jsxs(SectionCard, { title: "Execution Log", icon: _jsx(Clock, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [lLoading && _jsx(SectionSkeleton, {}), !lLoading && logData?.lines && logData.lines.length > 0
                        ? _jsx(PreformattedBlock, { content: logData.lines.join("\n") })
                        : !lLoading
                            ? _jsx(NotAvailable, { label: "Execution log" })
                            : null] })] }));
}
/**
 * AC 19 — Audit & Repair tab
 * Shows 4 optional-file subsections: audit-summary, repair-log, handoff, audit-plan.
 * For each where present=false, shows "not yet available". No error state for absent optional files.
 */
function NewAuditRepairTab({ taskId, projectPath }) {
    const auditSummaryResult = useAuditSummary(taskId, projectPath);
    const repairLogResult = useRepairLog(taskId, projectPath);
    const handoffResult = useHandoff(taskId, projectPath);
    const auditPlanResult = useAuditPlan(taskId, projectPath);
    function renderOptionalSection(title, icon, result, label) {
        const { data, loading } = result;
        const isPresent = data?.present === true;
        const content = isPresent ? data?.data : null;
        return (_jsxs(SectionCard, { title: title, icon: icon, children: [loading && _jsx(SectionSkeleton, {}), !loading && isPresent && content != null ? (_jsx(PreformattedBlock, { content: typeof content === "string" ? content : JSON.stringify(content, null, 2) })) : !loading ? (_jsx(NotAvailable, { label: label })) : null] }));
    }
    return (_jsxs("div", { className: "space-y-5 mt-5", children: [renderOptionalSection("Audit Summary", _jsx(Shield, { className: "w-3.5 h-3.5 text-[#7A776E]" }), auditSummaryResult, "Audit summary"), renderOptionalSection("Repair Log", _jsx(Zap, { className: "w-3.5 h-3.5 text-[#7A776E]" }), repairLogResult, "Repair log"), renderOptionalSection("Handoff", _jsx(FileText, { className: "w-3.5 h-3.5 text-[#7A776E]" }), handoffResult, "Handoff"), renderOptionalSection("Audit Plan", _jsx(BookOpen, { className: "w-3.5 h-3.5 text-[#7A776E]" }), auditPlanResult, "Audit plan")] }));
}
/**
 * AC 20 — Costs tab
 * Shows total token usage, input tokens, output tokens, token usage by agent (table),
 * token usage by model (table with USD cost per model using RATES_PER_MILLION).
 * Source: /api/tasks/:id/retrospective. If absent, all "—".
 */
function NewCostsTab({ taskId, projectPath, stage }) {
    const retroUrl = `/api/tasks/${encodeURIComponent(taskId)}/retrospective?project=${encodeURIComponent(projectPath)}`;
    const { data: retro, loading } = useAutoRefresh(retroUrl, stage);
    const totalCostUsd = useMemo(() => {
        if (!retro?.token_usage_by_model)
            return null;
        return Object.entries(retro.token_usage_by_model).reduce((sum, [model, info]) => {
            return sum + computeModelCostUsd(info.input_tokens ?? 0, info.output_tokens ?? 0, model);
        }, 0);
    }, [retro]);
    const dash = "—";
    return (_jsxs("div", { className: "space-y-5 mt-5", children: [_jsxs(SectionCard, { title: "Token Totals", icon: _jsx(DollarSign, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [loading && _jsx(SectionSkeleton, {}), !loading && retro ? (_jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-3", children: [_jsx(MetricCard, { label: "Total Tokens", value: retro.total_token_usage != null ? formatTokens(retro.total_token_usage) : dash, icon: _jsx(Activity, { className: "w-3 h-3 text-slate-400" }) }), _jsx(MetricCard, { label: "Input Tokens", value: retro.total_input_tokens != null ? formatTokens(retro.total_input_tokens) : dash, icon: _jsx(Activity, { className: "w-3 h-3 text-[#7C4DFF]" }) }), _jsx(MetricCard, { label: "Output Tokens", value: retro.total_output_tokens != null ? formatTokens(retro.total_output_tokens) : dash, icon: _jsx(Activity, { className: "w-3 h-3 text-[#00E5FF]" }) }), _jsx(MetricCard, { label: "Est. Total Cost", value: totalCostUsd != null ? formatUsd(totalCostUsd) : dash, icon: _jsx(DollarSign, { className: "w-3 h-3 text-[#BDF000]" }) })] })) : !loading ? (_jsx("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-3", children: ["Total Tokens", "Input Tokens", "Output Tokens", "Est. Total Cost"].map((label) => (_jsx(MetricCard, { label: label, value: dash }, label))) })) : null] }), _jsxs(SectionCard, { title: "Token Usage by Agent", icon: _jsx(Activity, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [loading && _jsx(SectionSkeleton, {}), !loading && retro?.token_usage_by_agent && Object.keys(retro.token_usage_by_agent).length > 0 ? (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full font-mono text-xs", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-white/10", children: [_jsx("th", { className: "text-left text-slate-500 py-1.5 pr-3 font-medium", children: "Agent" }), _jsx("th", { className: "text-right text-slate-500 py-1.5 pr-3 font-medium", children: "Input" }), _jsx("th", { className: "text-right text-slate-500 py-1.5 pr-3 font-medium", children: "Output" }), _jsx("th", { className: "text-right text-slate-500 py-1.5 font-medium", children: "Total" })] }) }), _jsx("tbody", { children: Object.entries(retro.token_usage_by_agent)
                                        .sort(([, a], [, b]) => b - a)
                                        .map(([agent, tokens]) => (_jsxs("tr", { className: "border-b border-white/5", children: [_jsx("td", { className: "text-slate-300 py-1.5 pr-3 max-w-[220px] truncate", title: agent, children: agent }), _jsx("td", { className: "text-right text-[#7C4DFF] py-1.5 pr-3", children: formatTokens(retro.input_tokens_by_agent?.[agent] ?? 0) }), _jsx("td", { className: "text-right text-[#00E5FF] py-1.5 pr-3", children: formatTokens(retro.output_tokens_by_agent?.[agent] ?? 0) }), _jsx("td", { className: "text-right text-slate-400 py-1.5", children: formatTokens(tokens) })] }, agent))) })] }) })) : !loading ? (_jsx(NotAvailable, { label: "Agent token breakdown" })) : null] }), _jsxs(SectionCard, { title: "Token Usage by Model", icon: _jsx(Network, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [loading && _jsx(SectionSkeleton, {}), !loading && retro?.token_usage_by_model && Object.keys(retro.token_usage_by_model).length > 0 ? (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full font-mono text-xs", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-white/10", children: [_jsx("th", { className: "text-left text-slate-500 py-1.5 pr-3 font-medium", children: "Model" }), _jsx("th", { className: "text-right text-slate-500 py-1.5 pr-3 font-medium", children: "Input" }), _jsx("th", { className: "text-right text-slate-500 py-1.5 pr-3 font-medium", children: "Output" }), _jsx("th", { className: "text-right text-slate-500 py-1.5 pr-3 font-medium", children: "Total" }), _jsx("th", { className: "text-right text-slate-500 py-1.5 font-medium", children: "Est. Cost (USD)" })] }) }), _jsx("tbody", { children: Object.entries(retro.token_usage_by_model)
                                        .sort(([, a], [, b]) => (b.tokens ?? 0) - (a.tokens ?? 0))
                                        .map(([model, info]) => {
                                        const costUsd = computeModelCostUsd(info.input_tokens ?? 0, info.output_tokens ?? 0, model);
                                        return (_jsxs("tr", { className: "border-b border-white/5", children: [_jsx("td", { className: "py-1.5 pr-3", children: _jsx("span", { className: "text-xs font-mono font-medium text-[#00E5FF]", children: model }) }), _jsx("td", { className: "text-right text-[#7C4DFF] py-1.5 pr-3", children: formatTokens(info.input_tokens ?? 0) }), _jsx("td", { className: "text-right text-[#00E5FF] py-1.5 pr-3", children: formatTokens(info.output_tokens ?? 0) }), _jsx("td", { className: "text-right text-slate-400 py-1.5 pr-3", children: formatTokens(info.tokens ?? 0) }), _jsx("td", { className: "text-right text-[#BDF000] py-1.5", children: formatUsd(costUsd) })] }, model));
                                    }) })] }) })) : !loading ? (_jsx(NotAvailable, { label: "Model token breakdown" })) : null] })] }));
}
/**
 * AC 21 — Postmortem tab
 * Shows quality score, cost score, efficiency score, task outcome,
 * findings by auditor (table), findings by category (table),
 * repair cycle count, spec review iterations, wasted spawns, executor zero-repair streak.
 * Source: retrospective. If absent, all "—".
 */
function NewPostmortemTab({ taskId, projectPath, stage }) {
    const retroUrl = `/api/tasks/${encodeURIComponent(taskId)}/retrospective?project=${encodeURIComponent(projectPath)}`;
    const { data: retro, loading } = useAutoRefresh(retroUrl, stage);
    const dash = "—";
    return (_jsxs("div", { className: "space-y-5 mt-5", children: [_jsxs(SectionCard, { title: "Quality Scores", icon: _jsx(CheckCircle2, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [loading && _jsx(SectionSkeleton, {}), !loading && retro ? (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-3 gap-4", children: [_jsx(MetricCard, { label: "Quality Score", value: retro.quality_score != null ? `${Math.round(retro.quality_score * 100)}%` : dash, icon: _jsx(CheckCircle2, { className: "w-3 h-3 text-[#BDF000]" }) }), _jsx(MetricCard, { label: "Cost Score", value: retro.cost_score != null ? `${Math.round(retro.cost_score * 100)}%` : dash, icon: _jsx(DollarSign, { className: "w-3 h-3 text-[#2DD4A8]" }) }), _jsx(MetricCard, { label: "Efficiency Score", value: retro.efficiency_score != null ? `${Math.round(retro.efficiency_score * 100)}%` : dash, icon: _jsx(Zap, { className: "w-3 h-3 text-[#FF9F43]" }) })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-x-8", children: [_jsx(KvRow, { label: "Task Outcome", value: retro.task_outcome ?? dash, mono: true }), _jsx(KvRow, { label: "Repair Cycles", value: retro.repair_cycle_count ?? dash, mono: true }), _jsx(KvRow, { label: "Spec Reviews", value: retro.spec_review_iterations ?? dash, mono: true }), _jsx(KvRow, { label: "Wasted Spawns", value: retro.wasted_spawns ?? dash, mono: true })] })] })) : !loading ? (_jsxs("div", { className: "space-y-4", children: [_jsx("div", { className: "grid grid-cols-3 gap-4", children: ["Quality Score", "Cost Score", "Efficiency Score"].map((label) => (_jsx(MetricCard, { label: label, value: dash }, label))) }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-x-8", children: ["Task Outcome", "Repair Cycles", "Spec Reviews", "Wasted Spawns"].map((label) => (_jsx(KvRow, { label: label, value: dash, mono: true }, label))) })] })) : null] }), _jsxs(SectionCard, { title: "Findings by Auditor", icon: _jsx(Shield, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [loading && _jsx(SectionSkeleton, {}), !loading && retro?.findings_by_auditor && Object.keys(retro.findings_by_auditor).length > 0 ? (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full font-mono text-xs", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-white/10", children: [_jsx("th", { className: "text-left text-slate-500 py-1.5 pr-3 font-medium", children: "Auditor" }), _jsx("th", { className: "text-right text-slate-500 py-1.5 font-medium", children: "Findings" })] }) }), _jsx("tbody", { children: Object.entries(retro.findings_by_auditor)
                                        .sort(([, a], [, b]) => b - a)
                                        .map(([auditor, count]) => (_jsxs("tr", { className: "border-b border-white/5", children: [_jsx("td", { className: "text-slate-300 py-1.5 pr-3 max-w-[280px] truncate", title: auditor, children: auditor }), _jsx("td", { className: "text-right text-slate-400 py-1.5 font-mono", children: count })] }, auditor))) })] }) })) : !loading ? (_jsx(NotAvailable, { label: "Findings by auditor" })) : null] }), _jsxs(SectionCard, { title: "Findings by Category", icon: _jsx(AlertTriangle, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [loading && _jsx(SectionSkeleton, {}), !loading && retro?.findings_by_category && Object.keys(retro.findings_by_category).length > 0 ? (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full font-mono text-xs", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-white/10", children: [_jsx("th", { className: "text-left text-slate-500 py-1.5 pr-3 font-medium", children: "Category" }), _jsx("th", { className: "text-right text-slate-500 py-1.5 font-medium", children: "Findings" })] }) }), _jsx("tbody", { children: Object.entries(retro.findings_by_category)
                                        .sort(([, a], [, b]) => b - a)
                                        .map(([category, count]) => (_jsxs("tr", { className: "border-b border-white/5", children: [_jsx("td", { className: "text-slate-300 py-1.5 pr-3 max-w-[280px] truncate", title: category, children: category }), _jsx("td", { className: "text-right text-slate-400 py-1.5 font-mono", children: count })] }, category))) })] }) })) : !loading ? (_jsx(NotAvailable, { label: "Findings by category" })) : null] }), _jsxs(SectionCard, { title: "Executor Zero-Repair Streak", icon: _jsx(Zap, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [loading && _jsx(SectionSkeleton, {}), !loading && retro?.executor_zero_repair_streak && Object.keys(retro.executor_zero_repair_streak).length > 0 ? (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full font-mono text-xs", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-white/10", children: [_jsx("th", { className: "text-left text-slate-500 py-1.5 pr-3 font-medium", children: "Executor" }), _jsx("th", { className: "text-right text-slate-500 py-1.5 font-medium", children: "Clean Streak" })] }) }), _jsx("tbody", { children: Object.entries(retro.executor_zero_repair_streak)
                                        .sort(([, a], [, b]) => b - a)
                                        .map(([executor, streak]) => (_jsxs("tr", { className: "border-b border-white/5", children: [_jsx("td", { className: "text-slate-300 py-1.5 pr-3 max-w-[280px] truncate", title: executor, children: executor }), _jsx("td", { className: "text-right py-1.5", children: _jsx("span", { className: "text-[#2DD4A8] font-mono", children: streak }) })] }, executor))) })] }) })) : !loading ? (_jsx(NotAvailable, { label: "Executor zero-repair streak" })) : null] })] }));
}
// ---- New 6-tab main component (slug-based route) ----
/**
 * TaskDetailWithSlug
 * AC 15–24: Full slug-aware task detail view with exactly 6 tabs.
 * Used by the /repo/:slug/task/:taskId route (registered by seg-navigation).
 */
function TaskDetailWithSlug({ slug, taskId }) {
    const [activeTab, setActiveTab] = useState("overview");
    // Resolve slug → project path
    const { data: projects, loading: projectsLoading } = useProjectsSummary(30000);
    const projectPath = useMemo(() => {
        if (!projects)
            return null;
        return projects.find((p) => p.slug === slug)?.path ?? null;
    }, [projects, slug]);
    // Fetch manifest with auto-refresh (stage-aware polling)
    const manifestUrl = projectPath
        ? `/api/tasks/${encodeURIComponent(taskId)}/manifest?project=${encodeURIComponent(projectPath)}`
        : null;
    // We need manifest stage to pass to useAutoRefresh. Use a separate state
    // that tracks resolved stage so we can re-render the hook.
    const [resolvedStage, setResolvedStage] = useState(null);
    const { data: manifest, loading: mLoading, error: mError, refetch: refetchManifest, } = useAutoRefresh(manifestUrl ?? "", resolvedStage, 5000);
    // Keep resolved stage in sync with manifest (useEffect — not useMemo — for side effects)
    useEffect(() => {
        if (manifest?.stage) {
            setResolvedStage(manifest.stage);
        }
    }, [manifest?.stage]);
    // Collect refetch functions from all secondary hooks through tab renders —
    // the Refresh button triggers refetchManifest which cascades via URL changes.
    // Each tab fetches its own data; we use window.location reload as a simple
    // global refresh mechanism supplemented by refetchManifest.
    const handleRefresh = () => {
        refetchManifest();
    };
    // Loading: resolving project or fetching manifest
    if (projectsLoading && !projects) {
        return (_jsx("div", { className: "min-h-screen bg-[#0a0a0a] flex items-center justify-center", children: _jsx("div", { className: "w-8 h-8 border-2 rounded-full animate-spin", style: { borderColor: "#222", borderTopColor: "#6ee7b7" }, role: "status", "aria-label": "Loading task" }) }));
    }
    // AC 23 — 404 view: slug doesn't match any project or task 404s
    if (!projectsLoading && !projectPath) {
        return (_jsxs("div", { className: "min-h-screen flex flex-col items-center justify-center gap-4", style: { backgroundColor: "#0a0a0a", color: "#e5e5e5" }, children: [_jsx(XCircle, { className: "w-10 h-10", style: { color: "#FF3B3B" } }), _jsx("h1", { className: "text-lg font-mono font-bold", children: "Task not found" }), _jsxs("p", { className: "text-sm font-mono", style: { color: "#7A776E" }, children: ["No project matches slug ", _jsx("span", { style: { color: "#6ee7b7" }, children: slug })] }), _jsxs(Link, { to: `/repo/${slug}`, className: "text-sm font-mono transition-colors", style: { color: "#6ee7b7" }, "aria-label": "Back to project", children: [_jsx(ArrowLeft, { className: "inline w-3 h-3 mr-1" }), "Back to ", slug] })] }));
    }
    // AC 23 — 404: manifest fetch finished with error (task directory missing)
    if (!mLoading && mError && !manifest) {
        return (_jsxs("div", { className: "min-h-screen flex flex-col items-center justify-center gap-4", style: { backgroundColor: "#0a0a0a", color: "#e5e5e5" }, children: [_jsx(XCircle, { className: "w-10 h-10", style: { color: "#FF3B3B" } }), _jsx("h1", { className: "text-lg font-mono font-bold", children: "Task not found" }), _jsxs("p", { className: "text-sm font-mono", style: { color: "#7A776E" }, children: ["Task ", _jsx("span", { style: { color: "#6ee7b7" }, children: taskId }), " does not exist in this project."] }), _jsxs(Link, { to: `/repo/${slug}`, className: "text-sm font-mono transition-colors", style: { color: "#6ee7b7" }, "aria-label": "Back to project", children: [_jsx(ArrowLeft, { className: "inline w-3 h-3 mr-1" }), "Back to ", slug] })] }));
    }
    const stage = manifest?.stage ?? null;
    const stageColor = stage ? getStageColor(stage) : "#999";
    const riskColor = manifest?.classification?.risk_level
        ? getRiskColor(manifest.classification.risk_level)
        : "#999";
    const terminal = isTerminalStage(stage);
    return (_jsx("div", { className: "min-h-screen pb-12", style: { backgroundColor: "#0a0a0a", color: "#e5e5e5" }, children: _jsxs("div", { className: "max-w-5xl mx-auto px-4 py-6 space-y-6", children: [_jsxs("nav", { "aria-label": "Breadcrumb", style: { fontFamily: "JetBrains Mono, monospace", fontSize: 13 }, children: [_jsx(Link, { to: "/", style: { color: "#6ee7b7", textDecoration: "none" }, "aria-label": "Back to repos list", children: "Repos" }), _jsx("span", { style: { color: "#888", margin: "0 6px" }, "aria-hidden": "true", children: ">" }), _jsx(Link, { to: `/repo/${slug}`, style: { color: "#6ee7b7", textDecoration: "none" }, "aria-label": `Back to ${projects?.find((p) => p.slug === slug)?.name ?? slug}`, children: projects?.find((p) => p.slug === slug)?.name ?? slug }), _jsx("span", { style: { color: "#888", margin: "0 6px" }, "aria-hidden": "true", children: ">" }), _jsx("span", { style: {
                                color: "#7A776E",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: "min(60vw, 480px)",
                                display: "inline-block",
                                verticalAlign: "bottom",
                            }, title: taskId, children: taskId })] }), _jsxs(motion.div, { className: "border rounded-2xl p-6 space-y-3", style: {
                        backgroundColor: "#111",
                        borderColor: "#222",
                        color: "#e5e5e5",
                    }, initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.28, ease: "easeOut" }, children: [mLoading && !manifest && (_jsxs("div", { className: "space-y-3", role: "status", "aria-label": "Loading task header", children: [_jsx(Skeleton, { className: "h-6 w-64" }), _jsx(Skeleton, { className: "h-4 w-96" }), _jsx(Skeleton, { className: "h-4 w-48" })] })), manifest && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex items-center gap-3 flex-wrap", children: [_jsx("h1", { className: "text-lg font-bold font-mono", style: { color: "#e5e5e5" }, children: manifest.task_id }), _jsx(Badge, { label: manifest.stage, color: stageColor }), manifest.fast_track && _jsx(Badge, { label: "FAST TRACK", color: "#6ee7b7" }), !terminal && (_jsx("span", { className: "text-[10px] font-mono animate-pulse", style: { color: IN_PROGRESS_COLOR }, "aria-label": "Auto-refreshing every 5 seconds", children: "live" }))] }), _jsx("p", { className: "text-sm", style: { color: "#b0b0a0" }, children: manifest.title }), _jsx("div", { className: "flex items-center gap-4 flex-wrap", children: manifest.classification && (_jsxs(_Fragment, { children: [_jsx(Badge, { label: manifest.classification.type, color: "#00E5FF" }), manifest.classification.domains?.map((d) => (_jsx(Badge, { label: d, color: "#B47AFF" }, d))), _jsx(Badge, { label: manifest.classification.risk_level, color: riskColor })] })) }), _jsxs("div", { className: "flex items-center gap-6 flex-wrap text-[11px] font-mono", style: { color: "#7A776E" }, children: [_jsxs("span", { children: ["Created: ", formatDate(manifest.created_at)] }), manifest.completed_at && (_jsxs("span", { children: ["Completed: ", formatDate(manifest.completed_at)] })), manifest.snapshot && (_jsxs("span", { children: ["Branch: ", manifest.snapshot.branch] }))] })] })), _jsx("div", { className: "flex justify-end", children: _jsxs("button", { onClick: handleRefresh, disabled: mLoading, className: "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors border", style: {
                                    backgroundColor: "#1a1a1a",
                                    borderColor: "#222",
                                    color: mLoading ? "#5A574E" : "#6ee7b7",
                                    cursor: mLoading ? "not-allowed" : "pointer",
                                }, "aria-label": "Refresh task data", children: [_jsx(RefreshCw, { className: `w-3 h-3 ${mLoading ? "animate-spin" : ""}` }), "Refresh"] }) })] }), projectPath && (_jsxs("div", { children: [_jsx("div", { className: "flex overflow-x-auto border-b", style: { borderColor: "#222" }, role: "tablist", "aria-label": "Task detail sections", children: ["overview", "spec-plan", "execution", "audit-repair", "costs", "postmortem"].map((tab) => {
                                const labels = {
                                    overview: "Overview",
                                    "spec-plan": "Spec & Plan",
                                    execution: "Execution",
                                    "audit-repair": "Audit & Repair",
                                    costs: "Costs",
                                    postmortem: "Postmortem",
                                };
                                const isActive = activeTab === tab;
                                return (_jsx("button", { role: "tab", "aria-selected": isActive, "aria-controls": `tabpanel-${tab}`, onClick: () => setActiveTab(tab), className: "px-4 py-2.5 text-xs font-mono whitespace-nowrap transition-colors shrink-0", style: {
                                        color: isActive ? "#6ee7b7" : "#7A776E",
                                        borderBottom: isActive ? "2px solid #6ee7b7" : "2px solid transparent",
                                        backgroundColor: "transparent",
                                        outline: "none",
                                    }, children: labels[tab] }, tab));
                            }) }), _jsxs("div", { children: [activeTab === "overview" && (_jsx("div", { role: "tabpanel", id: "tabpanel-overview", "aria-label": "Overview", children: manifest
                                        ? _jsx(NewOverviewTab, { manifest: manifest })
                                        : _jsx("div", { className: "mt-5", children: _jsx(SectionSkeleton, {}) }) })), activeTab === "spec-plan" && (_jsx("div", { role: "tabpanel", id: "tabpanel-spec-plan", "aria-label": "Spec and Plan", children: _jsx(NewSpecPlanTab, { taskId: taskId, projectPath: projectPath }) })), activeTab === "execution" && (_jsx("div", { role: "tabpanel", id: "tabpanel-execution", "aria-label": "Execution", children: _jsx(NewExecutionTab, { taskId: taskId, projectPath: projectPath }) })), activeTab === "audit-repair" && (_jsx("div", { role: "tabpanel", id: "tabpanel-audit-repair", "aria-label": "Audit and Repair", children: _jsx(NewAuditRepairTab, { taskId: taskId, projectPath: projectPath }) })), activeTab === "costs" && (_jsx("div", { role: "tabpanel", id: "tabpanel-costs", "aria-label": "Costs", children: _jsx(NewCostsTab, { taskId: taskId, projectPath: projectPath, stage: stage }) })), activeTab === "postmortem" && (_jsx("div", { role: "tabpanel", id: "tabpanel-postmortem", "aria-label": "Postmortem", children: _jsx(NewPostmortemTab, { taskId: taskId, projectPath: projectPath, stage: stage }) }))] })] }))] }) }));
}
// ---- Legacy sub-components (used by LegacyTaskDetail only) ----
function DiscoveryDesignTab({ taskId }) {
    const { data: discovery, loading: dLoading } = usePollingData(`/api/tasks/${taskId}/discovery-notes`, 30000);
    const { data: design, loading: ddLoading } = usePollingData(`/api/tasks/${taskId}/design-decisions`, 30000);
    return (_jsxs("div", { className: "space-y-5", children: [_jsxs(SectionCard, { title: "Discovery Notes", icon: _jsx(FileText, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [dLoading && _jsx(SectionSkeleton, {}), !dLoading && discovery?.content ? _jsx(MarkdownBlock, { content: discovery.content }) : !dLoading ? _jsx(NotAvailable, { label: "Discovery notes" }) : null] }), _jsxs(SectionCard, { title: "Design Decisions", icon: _jsx(FileText, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [ddLoading && _jsx(SectionSkeleton, {}), !ddLoading && design?.content ? _jsx(MarkdownBlock, { content: design.content }) : !ddLoading ? _jsx(NotAvailable, { label: "Design decisions" }) : null] })] }));
}
function LegacyOverviewTab({ taskId }) {
    const { data: rawInput, loading: riLoading } = usePollingData(`/api/tasks/${taskId}/raw-input`, 30000);
    const { data: retro, loading: retroLoading } = usePollingData(`/api/tasks/${taskId}/retrospective`, 30000);
    return (_jsxs("div", { className: "space-y-5", children: [_jsxs(SectionCard, { title: "Original Prompt", icon: _jsx(FileText, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [riLoading && _jsx(SectionSkeleton, {}), !riLoading && rawInput?.content ? (_jsx(MarkdownBlock, { content: rawInput.content })) : !riLoading ? (_jsx(NotAvailable, { label: "Raw input" })) : null] }), _jsxs(SectionCard, { title: "Quality Scores", icon: _jsx(Activity, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [retroLoading && _jsx(SectionSkeleton, {}), !retroLoading && retro ? (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-3 gap-4", children: [_jsx(MetricCard, { label: "Quality", value: `${Math.round(retro.quality_score * 100)}%`, icon: _jsx(CheckCircle2, { className: "w-3 h-3 text-[#BDF000]" }) }), _jsx(MetricCard, { label: "Cost", value: `${Math.round(retro.cost_score * 100)}%`, icon: _jsx(DollarSign, { className: "w-3 h-3 text-[#2DD4A8]" }) }), _jsx(MetricCard, { label: "Efficiency", value: `${Math.round(retro.efficiency_score * 100)}%`, icon: _jsx(Zap, { className: "w-3 h-3 text-[#FF9F43]" }) })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-x-6", children: [_jsx(KvRow, { label: "Outcome", value: retro.task_outcome || "UNKNOWN", mono: true }), _jsx(KvRow, { label: "Task Type", value: retro.task_type || "unknown", mono: true }), _jsx(KvRow, { label: "Risk Level", value: retro.task_risk_level || "unknown", mono: true }), _jsx(KvRow, { label: "Domains", value: Array.isArray(retro.task_domains) ? retro.task_domains.join(", ") : String(retro.task_domains ?? ""), mono: true })] })] })) : !retroLoading ? (_jsx(NotAvailable, { label: "Retrospective scores" })) : null] })] }));
}
function LegacySpecPlanTab({ taskId }) {
    const { data: spec, loading: sLoading } = usePollingData(`/api/tasks/${taskId}/spec`, 30000);
    const { data: plan, loading: pLoading } = usePollingData(`/api/tasks/${taskId}/plan`, 30000);
    const { data: graph, loading: gLoading } = usePollingData(`/api/tasks/${taskId}/execution-graph`, 30000);
    return (_jsxs("div", { className: "space-y-5", children: [_jsxs(SectionCard, { title: "Spec (Acceptance Criteria)", icon: _jsx(FileText, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [sLoading && _jsx(SectionSkeleton, {}), !sLoading && spec?.content ? _jsx(MarkdownBlock, { content: spec.content }) : !sLoading ? _jsx(NotAvailable, { label: "Spec" }) : null] }), _jsxs(SectionCard, { title: "Implementation Plan", icon: _jsx(FileText, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [pLoading && _jsx(SectionSkeleton, {}), !pLoading && plan?.content ? _jsx(MarkdownBlock, { content: plan.content }) : !pLoading ? _jsx(NotAvailable, { label: "Plan" }) : null] }), _jsxs(SectionCard, { title: "Execution Graph", icon: _jsx(GitBranch, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [gLoading && _jsx(SectionSkeleton, {}), !gLoading && graph?.segments && graph.segments.length > 0 ? (_jsx("div", { className: "space-y-3", children: graph.segments.map((seg) => {
                            const exColor = getExecutorColor(seg.executor);
                            return (_jsxs("div", { className: "border rounded-xl p-4 space-y-2", style: { borderColor: exColor + "3D", backgroundColor: exColor + "08" }, children: [_jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsx("span", { className: "font-mono text-xs font-bold", style: { color: exColor }, children: seg.id }), _jsx(Badge, { label: seg.executor, color: exColor }), seg.parallelizable && _jsx(Badge, { label: "parallel", color: "#7A776E" })] }), _jsx("p", { className: "text-xs text-slate-400", children: seg.description }), seg.depends_on.length > 0 && (_jsxs("div", { className: "text-[10px] text-[#7A776E]", children: ["Depends on: ", seg.depends_on.map((d) => _jsx("span", { className: "font-mono text-slate-400 mr-1", children: d }, d))] })), _jsxs("div", { className: "text-[10px] text-[#7A776E]", children: ["Criteria: ", seg.criteria_ids.map((c) => _jsxs("span", { className: "font-mono text-[#BDF000] mr-1", children: ["AC-", c] }, c))] }), seg.files_expected.length > 0 && (_jsxs("div", { className: "text-[10px] text-[#7A776E]", children: ["Files: ", seg.files_expected.map((f) => _jsx("span", { className: "font-mono text-slate-500 mr-1 block", children: f }, f))] }))] }, seg.id));
                        }) })) : !gLoading ? _jsx(NotAvailable, { label: "Execution graph" }) : null] })] }));
}
function WriteBoundaryEventRow({ evt }) {
    let color = "#2DD4A8";
    if (evt.event === "write_policy_denied")
        color = "#FF3B3B";
    else if (evt.event === "write_policy_wrapper_required")
        color = "#FF9F43";
    return (_jsxs("div", { className: "border border-white/6 rounded-lg p-3 bg-black/20 space-y-1.5", children: [_jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsx("span", { className: "text-[11px] font-mono text-[#B47AFF]", children: formatTime(evt.ts) }), _jsx(Badge, { label: evt.event.replace("write_policy_", ""), color: color }), evt.role && _jsx(Badge, { label: evt.role, color: "#7A776E" }), evt.operation && _jsx(Badge, { label: evt.operation, color: "#00E5FF" })] }), evt.path && _jsx("div", { className: "text-[11px] font-mono text-slate-300 break-all", children: evt.path }), evt.reason && _jsx("div", { className: "text-[11px] text-slate-400", children: evt.reason }), evt.wrapper_command && _jsx("div", { className: "text-[11px] font-mono text-[#BDF000] break-all", children: evt.wrapper_command })] }));
}
function EvidenceCollapsible({ name, content }) {
    const [open, setOpen] = useState(false);
    return (_jsxs(Collapsible, { open: open, onOpenChange: setOpen, children: [_jsx(CollapsibleTrigger, { asChild: true, children: _jsxs("button", { className: "flex items-center gap-2 text-slate-400 hover:text-slate-200 font-mono text-xs transition-colors w-full text-left py-1", children: [open ? _jsx(ChevronDown, { className: "w-3 h-3" }) : _jsx(ChevronRight, { className: "w-3 h-3" }), _jsx(FileText, { className: "w-3 h-3" }), name] }) }), _jsx(CollapsibleContent, { children: _jsx("div", { className: "mt-1 bg-black/30 rounded-lg p-3 max-h-64 overflow-auto", children: _jsx(MarkdownBlock, { content: content }) }) })] }));
}
function LegacyExecutionTab({ taskId }) {
    const { data: logData, loading: lLoading } = usePollingData(`/api/tasks/${taskId}/execution-log`, 10000);
    const { data: eventsData, loading: eLoading } = usePollingData(`/api/tasks/${taskId}/events`, 30000);
    const { data: evidenceData, loading: evLoading } = usePollingData(`/api/tasks/${taskId}/evidence`, 30000);
    const { data: boundaryData, loading: wbLoading } = usePollingData(`/api/tasks/${taskId}/write-boundary`, 30000);
    return (_jsxs("div", { className: "space-y-5", children: [_jsxs(SectionCard, { title: "Execution Log", icon: _jsx(Clock, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [lLoading && _jsx(SectionSkeleton, {}), !lLoading && logData?.lines && logData.lines.length > 0 ? (_jsx("div", { className: "max-h-96 overflow-y-auto bg-black/30 rounded-lg p-3", children: logData.lines.filter((l) => l.trim()).map((line, i) => {
                            const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s/);
                            return (_jsx("div", { className: "font-mono text-[11px] leading-relaxed py-0.5 border-b border-white/3 last:border-0", children: tsMatch ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "text-[#B47AFF]", children: tsMatch[1] }), _jsx("span", { className: "text-slate-400", children: line.slice(tsMatch[1].length) })] })) : (_jsx("span", { className: "text-slate-400", children: line })) }, i));
                        }) })) : !lLoading ? _jsx(NotAvailable, { label: "Execution log" }) : null] }), _jsxs(SectionCard, { title: "Event Stream", icon: _jsx(Activity, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [eLoading && _jsx(SectionSkeleton, {}), !eLoading && eventsData?.events && eventsData.events.length > 0 ? (_jsx("div", { className: "max-h-80 overflow-y-auto bg-black/30 rounded-lg p-3 space-y-0.5", children: eventsData.events.map((evt, i) => (_jsxs("div", { className: "flex items-center gap-2 py-1 border-b border-white/3 last:border-0 text-[11px] font-mono flex-wrap", children: [_jsx("span", { className: "text-[#B47AFF] shrink-0 w-[52px]", children: formatTime(evt.ts) }), _jsx(Badge, { label: String(evt.event), color: "#00E5FF" }), Object.entries(evt).filter(([k]) => !["ts", "event"].includes(k)).map(([k, v]) => (_jsxs("span", { className: "text-slate-500", children: [_jsxs("span", { className: "text-[#7A776E]", children: [k, "="] }), _jsx("span", { className: "text-slate-300", children: typeof v === "object" ? JSON.stringify(v) : String(v) })] }, k)))] }, i))) })) : !eLoading ? _jsx(NotAvailable, { label: "Events" }) : null] }), _jsxs(SectionCard, { title: "Write Boundary", icon: _jsx(AlertTriangle, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [wbLoading && _jsx(SectionSkeleton, {}), !wbLoading && boundaryData?.counts && boundaryData.counts.total > 0 ? (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-3", children: [_jsx(MetricCard, { label: "Denied", value: String(boundaryData.counts.denied), icon: _jsx(XCircle, { className: "w-3 h-3 text-[#FF3B3B]" }) }), _jsx(MetricCard, { label: "Wrapper", value: String(boundaryData.counts.wrapper_required), icon: _jsx(AlertTriangle, { className: "w-3 h-3 text-[#FF9F43]" }) }), _jsx(MetricCard, { label: "Allowed", value: String(boundaryData.counts.allowed), icon: _jsx(CheckCircle2, { className: "w-3 h-3 text-[#2DD4A8]" }) }), _jsx(MetricCard, { label: "Total", value: String(boundaryData.counts.total), icon: _jsx(Activity, { className: "w-3 h-3 text-[#00E5FF]" }) })] }), Object.keys(boundaryData.by_role ?? {}).length > 0 && (_jsxs("div", { children: [_jsx("span", { className: "text-[10px] text-[#7A776E] uppercase tracking-wider block mb-2", children: "Attempts by Role" }), _jsx("div", { className: "space-y-1", children: Object.entries(boundaryData.by_role).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([role, count]) => (_jsx(KvRow, { label: role, value: String(count), mono: true }, role))) })] })), boundaryData.top_denied_paths.length > 0 && (_jsxs("div", { children: [_jsx("span", { className: "text-[10px] text-[#7A776E] uppercase tracking-wider block mb-2", children: "Most Denied Paths" }), _jsx("div", { className: "space-y-1", children: boundaryData.top_denied_paths.map((item) => (_jsx(KvRow, { label: String(item.count), value: item.path, mono: true }, item.path))) })] })), boundaryData.top_wrapper_paths.length > 0 && (_jsxs("div", { children: [_jsx("span", { className: "text-[10px] text-[#7A776E] uppercase tracking-wider block mb-2", children: "Wrapper Required Paths" }), _jsx("div", { className: "space-y-1", children: boundaryData.top_wrapper_paths.map((item) => (_jsx(KvRow, { label: String(item.count), value: item.path, mono: true }, item.path))) })] })), _jsxs("div", { children: [_jsx("span", { className: "text-[10px] text-[#7A776E] uppercase tracking-wider block mb-2", children: "Recent Policy Events" }), _jsx("div", { className: "max-h-72 overflow-y-auto bg-black/30 rounded-lg p-3 space-y-2", children: boundaryData.events.slice().reverse().map((evt, index) => (_jsx(WriteBoundaryEventRow, { evt: evt }, `${evt.ts}-${evt.event}-${index}`))) })] })] })) : !wbLoading ? _jsx(NotAvailable, { label: "Write boundary diagnostics" }) : null] }), _jsxs(SectionCard, { title: "Segment Evidence", icon: _jsx(FileText, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [evLoading && _jsx(SectionSkeleton, {}), !evLoading && evidenceData?.files && evidenceData.files.length > 0 ? (_jsx("div", { className: "space-y-2", children: evidenceData.files.map((file) => (_jsx(EvidenceCollapsible, { name: file.name, content: file.content }, file.name))) })) : !evLoading ? _jsx(NotAvailable, { label: "Evidence files" }) : null] })] }));
}
function LegacyAuditQualityTab({ taskId }) {
    const { data: retro, loading: rLoading } = usePollingData(`/api/tasks/${taskId}/retrospective`, 30000);
    const { data: reports, loading: aLoading } = usePollingData(`/api/tasks/${taskId}/audit-reports`, 30000);
    const { data: receiptsData, loading: rcLoading } = usePollingData(`/api/tasks/${taskId}/receipts`, 30000);
    const { data: completion, loading: cLoading } = usePollingData(`/api/tasks/${taskId}/completion`, 30000);
    const allFindings = useMemo(() => {
        if (!reports)
            return [];
        return reports.flatMap((r) => r.findings ?? []);
    }, [reports]);
    const blockingCount = useMemo(() => allFindings.filter((f) => f.blocking).length, [allFindings]);
    const nonBlockingCount = allFindings.length - blockingCount;
    return (_jsxs("div", { className: "space-y-5", children: [_jsxs(SectionCard, { title: "Audit Summary", icon: _jsx(Shield, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [rLoading && _jsx(SectionSkeleton, {}), !rLoading && retro ? (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx("span", { className: "text-[10px] text-[#7A776E] uppercase tracking-wider", children: "Findings by Auditor" }), Object.entries(retro.findings_by_auditor ?? {}).map(([auditor, count]) => {
                                        const streak = retro.auditor_zero_finding_streaks?.[auditor];
                                        return (_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "text-xs text-slate-400 font-mono w-48 truncate", title: auditor, children: auditor }), _jsx("div", { className: "flex-1 h-2 bg-white/5 rounded-full overflow-hidden", children: _jsx("div", { className: "h-full rounded-full", style: {
                                                            width: `${Math.min(100, count * 10)}%`,
                                                            backgroundColor: count === 0 ? "#2DD4A8" : count > 5 ? "#FF3B3B" : "#FF9F43",
                                                        } }) }), _jsx("span", { className: "text-xs font-mono text-slate-300 w-8 text-right", children: count }), streak !== undefined && streak !== null && streak > 0 && (_jsxs("span", { className: "text-[10px] text-[#2DD4A8] font-mono", title: "Consecutive clean audits", children: [streak, " clean"] }))] }, auditor));
                                    })] }), _jsxs("div", { className: "flex gap-4", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(XCircle, { className: "w-3.5 h-3.5 text-[#FF3B3B]" }), _jsxs("span", { className: "text-xs text-slate-400", children: ["Blocking: ", _jsx("span", { className: "text-slate-200 font-mono", children: blockingCount })] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(AlertTriangle, { className: "w-3.5 h-3.5 text-[#FF9F43]" }), _jsxs("span", { className: "text-xs text-slate-400", children: ["Non-blocking: ", _jsx("span", { className: "text-slate-200 font-mono", children: nonBlockingCount })] })] })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-x-6", children: [_jsx(KvRow, { label: "Spec Reviews", value: retro.spec_review_iterations ?? 0, mono: true }), _jsx(KvRow, { label: "Repair Cycles", value: retro.repair_cycle_count ?? 0, mono: true })] })] })) : !rLoading ? _jsx(NotAvailable, { label: "Audit summary" }) : null] }), _jsxs(SectionCard, { title: "Findings by Category", icon: _jsx(AlertTriangle, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [rLoading && _jsx(SectionSkeleton, {}), !rLoading && retro && Object.keys(retro.findings_by_category ?? {}).length > 0 ? (_jsx("div", { className: "space-y-2", children: Object.entries(retro.findings_by_category ?? {})
                            .sort(([, a], [, b]) => b - a)
                            .map(([category, count]) => (_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "text-xs text-slate-400 font-mono w-32 truncate", title: category, children: category }), _jsx("div", { className: "flex-1 h-2 bg-white/5 rounded-full overflow-hidden", children: _jsx("div", { className: "h-full rounded-full bg-[#B47AFF]", style: { width: `${Math.min(100, count * 10)}%` } }) }), _jsx("span", { className: "text-xs font-mono text-slate-300 w-8 text-right", children: count })] }, category))) })) : !rLoading ? _jsx(NotAvailable, { label: "Category findings" }) : null] }), _jsxs(SectionCard, { title: "Repair Execution", icon: _jsx(Zap, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [rLoading && _jsx(SectionSkeleton, {}), !rLoading && retro ? (_jsx("div", { className: "space-y-4", children: Object.keys(retro.executor_repair_frequency ?? {}).length > 0 ? (_jsxs("div", { children: [_jsx("span", { className: "text-[10px] text-[#7A776E] uppercase tracking-wider block mb-2", children: "Executor Repair Frequency" }), _jsx("div", { className: "space-y-2", children: Object.entries(retro.executor_repair_frequency ?? {})
                                        .sort(([, a], [, b]) => b - a)
                                        .map(([executor, count]) => {
                                        const cleanStreak = retro.executor_zero_repair_streak?.[executor];
                                        return (_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "text-xs text-slate-400 font-mono w-48 truncate", title: executor, children: executor }), _jsx("div", { className: "flex-1 h-2 bg-white/5 rounded-full overflow-hidden", children: _jsx("div", { className: "h-full rounded-full", style: {
                                                            width: `${Math.min(100, count * 10)}%`,
                                                            backgroundColor: count > 5 ? "#FF3B3B" : "#00E5FF",
                                                        } }) }), _jsx("span", { className: "text-xs font-mono text-slate-300 w-8 text-right", children: count }), cleanStreak !== undefined && cleanStreak !== null && cleanStreak > 0 && (_jsxs("span", { className: "text-[10px] text-[#2DD4A8] font-mono", title: "Consecutive tasks without repairs", children: [cleanStreak, " clean"] }))] }, executor));
                                    }) })] })) : (_jsx(NotAvailable, { label: "Executor repair frequency" })) })) : !rLoading ? _jsx(NotAvailable, { label: "Repair execution" }) : null] }), _jsxs(SectionCard, { title: "Audit Findings", icon: _jsx(Shield, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [aLoading && _jsx(SectionSkeleton, {}), !aLoading && reports && reports.length > 0 ? (_jsx("div", { className: "space-y-4", children: reports.map((report) => (_jsxs("div", { children: [_jsxs("h4", { className: "text-xs font-mono text-slate-400 mb-2 flex items-center gap-2", children: [_jsx(Shield, { className: "w-3 h-3" }), report.auditor_name, _jsxs("span", { className: "text-[10px] text-[#7A776E]", children: ["(", report.scope, ")"] }), _jsxs("span", { className: "text-[10px] text-[#7A776E]", children: [report.findings?.length ?? 0, " findings"] })] }), (report.findings ?? []).length === 0 ? (_jsx("p", { className: "text-xs text-[#2DD4A8] font-mono pl-5", children: "No findings" })) : (_jsx("div", { className: "space-y-2 pl-5", children: report.findings.map((finding) => {
                                        const sevColor = getSeverityColor(finding.severity);
                                        return (_jsxs("div", { className: "border rounded-lg p-3 space-y-1.5", style: {
                                                borderColor: finding.blocking ? "#FF3B3B66" : sevColor + "3D",
                                                backgroundColor: finding.blocking ? "#FF3B3B08" : sevColor + "06",
                                            }, children: [_jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsx(Badge, { label: finding.severity, color: sevColor }), finding.blocking && _jsx(Badge, { label: "BLOCKING", color: "#FF3B3B" }), _jsx("span", { className: "text-[10px] text-[#7A776E] font-mono", children: finding.category })] }), _jsx("p", { className: "text-xs text-slate-200 font-medium", children: finding.title }), _jsx("p", { className: "text-[11px] text-slate-400", children: finding.description }), finding.location && _jsx("p", { className: "text-[10px] text-[#7A776E] font-mono", children: finding.location }), finding.evidence && finding.evidence.length > 0 && (_jsx("div", { className: "text-[10px] text-slate-500 font-mono space-y-0.5 bg-black/20 rounded p-2", children: finding.evidence.map((e, i) => _jsx("div", { children: e }, i)) })), finding.recommendation && _jsx("p", { className: "text-[10px] text-[#BDF000]", children: finding.recommendation })] }, finding.id));
                                    }) }))] }, report.auditor_name + report.timestamp))) })) : !aLoading ? _jsx(NotAvailable, { label: "Audit reports" }) : null] }), _jsxs(SectionCard, { title: "Receipts", icon: _jsx(FileText, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [rcLoading && _jsx(SectionSkeleton, {}), !rcLoading && receiptsData?.receipts && receiptsData.receipts.length > 0 ? (_jsx("div", { className: "space-y-2", children: receiptsData.receipts.map((receipt) => (_jsxs("div", { className: "border border-white/6 rounded-lg p-3 bg-black/20", children: [_jsx("span", { className: "text-xs font-mono text-[#BDF000] block mb-1", children: receipt.filename }), _jsx("div", { className: "text-[11px] text-slate-400 font-mono space-y-0.5", children: Object.entries(receipt.data).filter(([k]) => k !== "receipt_type").slice(0, 6).map(([k, v]) => (_jsxs("div", { children: [_jsxs("span", { className: "text-[#7A776E]", children: [k, ": "] }), _jsx("span", { className: "text-slate-300", children: typeof v === "object" ? JSON.stringify(v) : String(v) })] }, k))) })] }, receipt.filename))) })) : !rcLoading ? _jsx(NotAvailable, { label: "Receipts" }) : null] }), _jsxs(SectionCard, { title: "Completion", icon: _jsx(CheckCircle2, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [cLoading && _jsx(SectionSkeleton, {}), !cLoading && completion ? (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex items-center gap-3", children: [completion.audit_result === "pass" ? (_jsx(CheckCircle2, { className: "w-5 h-5 text-[#2DD4A8]" })) : (_jsx(XCircle, { className: "w-5 h-5 text-[#FF3B3B]" })), _jsx("span", { className: "text-sm font-mono", style: { color: completion.audit_result === "pass" ? "#2DD4A8" : "#FF3B3B" }, children: completion.audit_result?.toUpperCase() ?? "UNKNOWN" })] }), completion.files_changed && (_jsx(KvRow, { label: "Files Changed", value: Array.isArray(completion.files_changed) ? completion.files_changed.length : completion.files_changed, mono: true })), completion.tests_passed !== undefined && (_jsx(KvRow, { label: "Tests Passed", value: completion.tests_passed, mono: true })), completion.blocking_findings !== undefined && (_jsx(KvRow, { label: "Blocking", value: completion.blocking_findings, mono: true })), completion.segments_completed !== undefined && (_jsx(KvRow, { label: "Segments", value: `${completion.segments_completed}/${completion.segments_total}`, mono: true }))] })) : !cLoading ? _jsx(NotAvailable, { label: "Completion data" }) : null] })] }));
}
function LegacyCostTokensTab({ taskId }) {
    const { data: tokenUsage, loading: tLoading } = usePollingData(`/api/tasks/${taskId}/token-usage`, 30000);
    const { data: retro, loading: rLoading } = usePollingData(`/api/tasks/${taskId}/retrospective`, 30000);
    const MODEL_BADGE_COLORS = {
        opus: "#7C4DFF",
        sonnet: "#00E5FF",
        haiku: "#00BFA5",
        none: "#555",
    };
    const MODEL_RATES = {
        haiku: 0.25,
        sonnet: 3.0,
        opus: 15.0,
    };
    const estimateCost = (tokens, model) => (tokens / 1_000_000) * (MODEL_RATES[model] ?? 0);
    const fmtUsd = (usd) => usd < 0.01 && usd > 0 ? "<$0.01" : `$${usd.toFixed(2)}`;
    return (_jsxs("div", { className: "space-y-5", children: [_jsxs(SectionCard, { title: "Token Usage Ledger", icon: _jsx(DollarSign, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [tLoading && _jsx(SectionSkeleton, {}), !tLoading && tokenUsage ? (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-4 gap-3", children: [_jsx(MetricCard, { label: "Total Tokens", value: formatTokens(tokenUsage.total ?? 0), icon: _jsx(Activity, { className: "w-3 h-3 text-slate-400" }) }), _jsx(MetricCard, { label: "Input", value: formatTokens(tokenUsage.total_input_tokens ?? 0), icon: _jsx(Activity, { className: "w-3 h-3 text-[#7C4DFF]" }) }), _jsx(MetricCard, { label: "Output", value: formatTokens(tokenUsage.total_output_tokens ?? 0), icon: _jsx(Activity, { className: "w-3 h-3 text-[#00E5FF]" }) }), _jsx(MetricCard, { label: "Est. Cost", value: fmtUsd(tokenUsage.by_model
                                            ? Object.entries(tokenUsage.by_model).reduce((sum, [model, info]) => sum + estimateCost(info.tokens ?? 0, model), 0)
                                            : 0), icon: _jsx(DollarSign, { className: "w-3 h-3 text-[#BDF000]" }) })] }), tokenUsage.by_agent && Object.keys(tokenUsage.by_agent).length > 0 && (_jsxs("div", { children: [_jsx("span", { className: "text-[10px] text-[#7A776E] uppercase tracking-wider block mb-2", children: "By Agent" }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full font-mono text-xs", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-white/10", children: [_jsx("th", { className: "text-left text-slate-500 py-1.5 pr-3", children: "Agent" }), _jsx("th", { className: "text-left text-slate-500 py-1.5 pr-3", children: "Model" }), _jsx("th", { className: "text-right text-slate-500 py-1.5 pr-3", children: "Input" }), _jsx("th", { className: "text-right text-slate-500 py-1.5 pr-3", children: "Output" }), _jsx("th", { className: "text-right text-slate-500 py-1.5", children: "Total" })] }) }), _jsx("tbody", { children: Object.entries(tokenUsage.by_agent)
                                                        .sort(([, a], [, b]) => b.tokens - a.tokens)
                                                        .map(([agent, info]) => (_jsxs("tr", { className: "border-b border-white/5", children: [_jsx("td", { className: "text-slate-300 py-1.5 pr-3 max-w-[200px] truncate", title: agent, children: agent }), _jsx("td", { className: "py-1.5 pr-3", children: _jsx("span", { className: "text-[10px] font-mono font-medium", style: { color: MODEL_BADGE_COLORS[info.model] ?? "#999" }, children: info.model }) }), _jsx("td", { className: "text-right text-[#7C4DFF] py-1.5 pr-3", children: formatTokens(info.input_tokens) }), _jsx("td", { className: "text-right text-[#00E5FF] py-1.5 pr-3", children: formatTokens(info.output_tokens) }), _jsx("td", { className: "text-right text-slate-400 py-1.5", children: formatTokens(info.tokens) })] }, agent))) })] }) })] })), tokenUsage.by_model && Object.keys(tokenUsage.by_model).length > 0 && (_jsxs("div", { children: [_jsx("span", { className: "text-[10px] text-[#7A776E] uppercase tracking-wider block mb-2", children: "By Model" }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full font-mono text-xs", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-white/10", children: [_jsx("th", { className: "text-left text-slate-500 py-1.5 pr-3", children: "Model" }), _jsx("th", { className: "text-right text-slate-500 py-1.5 pr-3", children: "Input" }), _jsx("th", { className: "text-right text-slate-500 py-1.5 pr-3", children: "Output" }), _jsx("th", { className: "text-right text-slate-500 py-1.5 pr-3", children: "Total" }), _jsx("th", { className: "text-right text-slate-500 py-1.5", children: "Est. Cost" })] }) }), _jsx("tbody", { children: Object.entries(tokenUsage.by_model)
                                                        .sort(([, a], [, b]) => b.tokens - a.tokens)
                                                        .map(([model, info]) => (_jsxs("tr", { className: "border-b border-white/5", children: [_jsx("td", { className: "py-1.5 pr-3", children: _jsx("span", { className: "text-xs font-mono font-medium", style: { color: MODEL_BADGE_COLORS[model] ?? "#999" }, children: model }) }), _jsx("td", { className: "text-right text-[#7C4DFF] py-1.5 pr-3", children: formatTokens(info.input_tokens) }), _jsx("td", { className: "text-right text-[#00E5FF] py-1.5 pr-3", children: formatTokens(info.output_tokens) }), _jsx("td", { className: "text-right text-slate-400 py-1.5 pr-3", children: formatTokens(info.tokens) }), _jsx("td", { className: "text-right text-[#BDF000] py-1.5", children: formatUsd(estimateCost(info.tokens ?? 0, model)) })] }, model))) })] }) })] }))] })) : !tLoading ? _jsx(NotAvailable, { label: "Token usage" }) : null] }), _jsxs(SectionCard, { title: "Retrospective Token Summary", icon: _jsx(Activity, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [rLoading && _jsx(SectionSkeleton, {}), !rLoading && retro ? (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-3 gap-3", children: [_jsx(MetricCard, { label: "Total Tokens", value: formatTokens(retro.total_token_usage ?? 0) }), _jsx(MetricCard, { label: "Spawns", value: retro.subagent_spawn_count ?? 0 }), _jsx(MetricCard, { label: "Wasted Spawns", value: retro.wasted_spawns ?? 0, icon: _jsx(AlertTriangle, { className: "w-3 h-3 text-[#FF3B3B]" }) })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsx(MetricCard, { label: "Retro Input", value: formatTokens(retro.total_input_tokens ?? 0) }), _jsx(MetricCard, { label: "Retro Output", value: formatTokens(retro.total_output_tokens ?? 0) })] })] })) : !rLoading ? _jsx(NotAvailable, { label: "Retrospective token data" }) : null] })] }));
}
function mergeRouterDecisions(decisions) {
    const byRole = new Map();
    for (const dec of decisions) {
        const role = dec.role ?? "unknown";
        if (dec.event === "router_audit_plan") {
            const auditors = (dec.auditors ?? dec.auditor_count);
            if (Array.isArray(auditors)) {
                for (const aud of auditors) {
                    const key = aud.name;
                    const existing = byRole.get(key) ?? { role: key, task_type: dec.task_type };
                    existing.model = aud.model;
                    existing.mode = aud.action;
                    byRole.set(key, existing);
                }
            }
            continue;
        }
        const existing = byRole.get(role) ?? { role, task_type: dec.task_type };
        if (dec.event === "router_model_decision") {
            existing.model = dec.model;
            existing.model_source = dec.source;
        }
        else if (dec.event === "router_route_decision") {
            existing.mode = dec.mode;
            existing.agent_name = dec.agent_name;
            existing.composite_score = dec.composite_score;
            existing.route_source = dec.source;
        }
        byRole.set(role, existing);
    }
    return Array.from(byRole.values());
}
function LegacyRouterDecisionsTab({ taskId }) {
    const { data, loading } = usePollingData(`/api/tasks/${taskId}/router-decisions`, 30000);
    const { data: retro, loading: retroLoading } = usePollingData(`/api/tasks/${taskId}/retrospective`, 30000);
    const MODE_COLORS = {
        replace: "#BDF000", shadow: "#B47AFF", alongside: "#FF9F43",
        spawn: "#2DD4A8", skip: "#7A776E", default: "#7A776E",
    };
    const MODEL_COLORS = {
        opus: "#7C4DFF", sonnet: "#00E5FF", haiku: "#00BFA5",
    };
    const merged = useMemo(() => {
        if (!data?.decisions)
            return [];
        return mergeRouterDecisions(data.decisions);
    }, [data]);
    return (_jsxs("div", { className: "space-y-5", children: [_jsxs(SectionCard, { title: "Router Decisions", icon: _jsx(Network, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [loading && _jsx(SectionSkeleton, {}), !loading && merged.length > 0 ? (_jsx("div", { className: "space-y-2", children: merged.map((dec) => (_jsxs("div", { className: "border border-white/6 rounded-lg p-3 bg-black/20 space-y-1.5", children: [_jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsx("span", { className: "text-xs font-mono text-slate-200 font-medium", children: dec.role }), dec.mode && _jsx(Badge, { label: dec.mode, color: MODE_COLORS[dec.mode] ?? "#7A776E" }), dec.model && _jsx(Badge, { label: dec.model, color: MODEL_COLORS[dec.model] ?? "#999" })] }), _jsxs("div", { className: "text-[11px] font-mono space-y-0.5", children: [dec.model_source && _jsxs("div", { children: [_jsx("span", { className: "text-[#7A776E]", children: "model source: " }), _jsx("span", { className: "text-slate-400", children: dec.model_source })] }), dec.agent_name && _jsxs("div", { children: [_jsx("span", { className: "text-[#7A776E]", children: "agent: " }), _jsx("span", { className: "text-[#BDF000]", children: dec.agent_name })] }), dec.composite_score !== undefined && dec.composite_score > 0 && (_jsxs("div", { children: [_jsx("span", { className: "text-[#7A776E]", children: "score: " }), _jsx("span", { className: "text-slate-300", children: dec.composite_score.toFixed(4) })] })), dec.route_source && _jsxs("div", { children: [_jsx("span", { className: "text-[#7A776E]", children: "route: " }), _jsx("span", { className: "text-slate-400", children: dec.route_source })] }), dec.task_type && _jsxs("div", { children: [_jsx("span", { className: "text-[#7A776E]", children: "task_type: " }), _jsx("span", { className: "text-slate-400", children: dec.task_type })] })] })] }, dec.role))) })) : !loading ? _jsx(NotAvailable, { label: "Router decisions" }) : null] }), _jsxs(SectionCard, { title: "Recorded Routing Metadata", icon: _jsx(Network, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: [retroLoading && _jsx(SectionSkeleton, {}), !retroLoading && retro ? (_jsxs("div", { className: "space-y-4", children: [Object.keys(retro.model_used_by_agent ?? {}).length > 0 && (_jsxs("div", { children: [_jsx("span", { className: "text-[10px] text-[#7A776E] uppercase tracking-wider block mb-2", children: "Model Used by Agent" }), _jsx("div", { className: "space-y-1", children: Object.entries(retro.model_used_by_agent ?? {}).map(([agent, model]) => (_jsx(KvRow, { label: agent, value: String(model), mono: true }, agent))) })] })), Object.keys(retro.agent_source ?? {}).length > 0 && (_jsxs("div", { children: [_jsx("span", { className: "text-[10px] text-[#7A776E] uppercase tracking-wider block mb-2", children: "Agent Source" }), _jsx("div", { className: "space-y-1", children: Object.entries(retro.agent_source ?? {}).map(([agent, source]) => (_jsx(KvRow, { label: agent, value: String(source), mono: true }, agent))) })] })), !Object.keys(retro.model_used_by_agent ?? {}).length && !Object.keys(retro.agent_source ?? {}).length && (_jsx(NotAvailable, { label: "Recorded routing metadata" }))] })) : !retroLoading ? _jsx(NotAvailable, { label: "Recorded routing metadata" }) : null] })] }));
}
function LegacyPostmortemTab({ taskId }) {
    const { data, loading } = usePollingData(`/api/tasks/${taskId}/postmortem`, 30000);
    return (_jsxs("div", { className: "space-y-5", children: [loading && (_jsx(SectionCard, { title: "Postmortem", icon: _jsx(BookOpen, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: _jsx(SectionSkeleton, {}) })), !loading && data ? (_jsxs(_Fragment, { children: [data.json && (_jsx(SectionCard, { title: "Postmortem (JSON)", icon: _jsx(BookOpen, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: _jsx("div", { className: "space-y-1", children: Object.entries(data.json).map(([k, v]) => (_jsx(KvRow, { label: k, value: typeof v === "object" ? JSON.stringify(v, null, 2) : String(v), mono: true }, k))) }) })), data.markdown && (_jsx(SectionCard, { title: "Postmortem", icon: _jsx(BookOpen, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: _jsx(MarkdownBlock, { content: data.markdown }) })), !data.json && !data.markdown && _jsx(NotAvailable, { label: "Postmortem" })] })) : !loading ? (_jsx(SectionCard, { title: "Postmortem", icon: _jsx(BookOpen, { className: "w-3.5 h-3.5 text-[#7A776E]" }), children: _jsx(NotAvailable, { label: "Postmortem" }) })) : null] }));
}
// ---- Legacy main component (backward-compatible /tasks/:taskId route) ----
function LegacyTaskDetail({ taskId }) {
    const { data: manifest, loading: mLoading } = usePollingData(`/api/tasks/${taskId}/manifest`, 10000);
    const stageColor = manifest ? getStageColor(manifest.stage) : "#999";
    const riskColor = manifest ? getRiskColor(manifest.classification?.risk_level) : "#999";
    return (_jsxs("div", { className: "space-y-6 pb-12", children: [_jsxs("nav", { className: "flex items-center gap-2 text-xs font-mono", children: [_jsxs(Link, { to: "/tasks", className: "text-[#BDF000] hover:text-[#d4ff4d] transition-colors flex items-center gap-1", children: [_jsx(ArrowLeft, { className: "w-3 h-3" }), "Tasks"] }), _jsx("span", { className: "text-[#5A574E]", children: ">" }), _jsx("span", { className: "text-slate-400", children: taskId })] }), _jsxs(motion.div, { className: "border border-white/6 bg-gradient-to-b from-[#222222] to-[#141414] rounded-2xl p-6", initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.28, ease: "easeOut" }, children: [mLoading && _jsx(SectionSkeleton, {}), !mLoading && manifest && (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex items-center gap-3 flex-wrap", children: [_jsx("h1", { className: "text-lg font-bold text-[#F0F0E8] font-mono", children: taskId }), _jsx(Badge, { label: manifest.stage, color: stageColor }), manifest.fast_track && _jsx(Badge, { label: "FAST TRACK", color: "#BDF000" })] }), _jsx("p", { className: "text-sm text-slate-300", children: manifest.title }), _jsx("div", { className: "flex items-center gap-4 flex-wrap", children: manifest.classification && (_jsxs(_Fragment, { children: [_jsx(Badge, { label: manifest.classification.type, color: "#00E5FF" }), manifest.classification.domains?.map((d) => (_jsx(Badge, { label: d, color: "#B47AFF" }, d))), _jsx(Badge, { label: manifest.classification.risk_level, color: riskColor })] })) }), _jsxs("div", { className: "flex items-center gap-6 text-[11px] text-[#7A776E] font-mono", children: [_jsxs("span", { children: ["Created: ", formatDate(manifest.created_at)] }), manifest.completed_at && _jsxs("span", { children: ["Completed: ", formatDate(manifest.completed_at)] }), manifest.snapshot && _jsxs("span", { children: ["Branch: ", manifest.snapshot.branch] })] })] })), !mLoading && !manifest && _jsx(NotAvailable, { label: "Task manifest" })] }), _jsxs(Tabs, { defaultValue: "overview", children: [_jsxs(TabsList, { className: "bg-[#1a1a1a] border border-white/6 rounded-xl overflow-x-auto", children: [_jsx(TabsTrigger, { value: "overview", className: "text-xs font-mono", children: "Overview" }), _jsx(TabsTrigger, { value: "discovery", className: "text-xs font-mono", children: "Discovery & Design" }), _jsx(TabsTrigger, { value: "spec-plan", className: "text-xs font-mono", children: "Spec & Plan" }), _jsx(TabsTrigger, { value: "execution", className: "text-xs font-mono", children: "Execution" }), _jsx(TabsTrigger, { value: "audit", className: "text-xs font-mono", children: "Audit & Quality" }), _jsx(TabsTrigger, { value: "tokens", className: "text-xs font-mono", children: "Cost & Tokens" }), _jsx(TabsTrigger, { value: "router", className: "text-xs font-mono", children: "Router" }), _jsx(TabsTrigger, { value: "postmortem", className: "text-xs font-mono", children: "Postmortem" })] }), _jsx(TabsContent, { value: "overview", children: _jsx(LegacyOverviewTab, { taskId: taskId }) }), _jsx(TabsContent, { value: "discovery", children: _jsx(DiscoveryDesignTab, { taskId: taskId }) }), _jsx(TabsContent, { value: "spec-plan", children: _jsx(LegacySpecPlanTab, { taskId: taskId }) }), _jsx(TabsContent, { value: "execution", children: _jsx(LegacyExecutionTab, { taskId: taskId }) }), _jsx(TabsContent, { value: "audit", children: _jsx(LegacyAuditQualityTab, { taskId: taskId }) }), _jsx(TabsContent, { value: "tokens", children: _jsx(LegacyCostTokensTab, { taskId: taskId }) }), _jsx(TabsContent, { value: "router", children: _jsx(LegacyRouterDecisionsTab, { taskId: taskId }) }), _jsx(TabsContent, { value: "postmortem", children: _jsx(LegacyPostmortemTab, { taskId: taskId }) })] })] }));
}
// ---- Default export: routes to the right implementation based on URL params ----
export default function TaskDetail() {
    const { taskId, slug } = useParams();
    if (!taskId) {
        return (_jsx("div", { className: "flex items-center justify-center h-full", children: _jsx("p", { className: "text-red-400 font-mono text-sm", children: "Invalid task ID" }) }));
    }
    // New slug-based route: full 6-tab view with project resolution
    if (slug) {
        return _jsx(TaskDetailWithSlug, { slug: slug, taskId: taskId });
    }
    // Legacy route: /tasks/:taskId — unchanged behavior
    return _jsx(LegacyTaskDetail, { taskId: taskId });
}
