import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router";
import { useProjectsSummary, usePollingData } from "@/data/hooks";
import { Skeleton } from "@/components/ui/skeleton";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(iso) {
    if (!iso)
        return "—";
    try {
        return new Date(iso).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    }
    catch {
        return iso;
    }
}
function formatQuality(score) {
    if (score === null || score === undefined)
        return "—";
    return score.toFixed(1);
}
function formatLeadTime(seconds) {
    if (seconds === null || seconds === undefined)
        return "—";
    return `${Math.round(seconds)}s`;
}
function formatChangeFailureRate(rate) {
    if (rate === null || rate === undefined)
        return "—";
    return `${(rate * 100).toFixed(1)}%`;
}
function formatRecoveryTime(seconds) {
    if (seconds === null || seconds === undefined)
        return "—";
    return `${Math.round(seconds)}s`;
}
function truncateTitle(title, max = 80) {
    return title.length > max ? `${title.slice(0, max - 3)}...` : title;
}
// ---------------------------------------------------------------------------
// Stage pill
// ---------------------------------------------------------------------------
const STAGE_COLORS = {
    DONE: "#6ee7b7",
    FAILED: "#ff6b6b",
    CALIBRATED: "#b47aff",
    PLANNING: "#6ea8fe",
    EXECUTING: "#ffd166",
    AUDITING: "#ff9f43",
    REPAIRING: "#ff9f43",
};
function stagePillStyle(stage) {
    const color = STAGE_COLORS[stage] ?? "#888";
    return {
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 9999,
        fontSize: 10,
        fontFamily: "JetBrains Mono, monospace",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color,
        border: `1px solid ${color}44`,
        backgroundColor: `${color}11`,
        whiteSpace: "nowrap",
    };
}
// ---------------------------------------------------------------------------
// Breadcrumb
// ---------------------------------------------------------------------------
function Breadcrumb({ name }) {
    return (_jsxs("nav", { "aria-label": "Breadcrumb", style: { fontFamily: "JetBrains Mono, monospace", fontSize: 13 }, children: [_jsx(Link, { to: "/", style: { color: "#6ee7b7", textDecoration: "none" }, "aria-label": "Back to repos list", children: "Repos" }), _jsx("span", { style: { color: "#888", margin: "0 6px" }, "aria-hidden": "true", children: ">" }), _jsx("span", { style: {
                    color: "#e5e5e5",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "min(60vw, 480px)",
                    display: "inline-block",
                    verticalAlign: "bottom",
                }, title: name, children: name })] }));
}
// ---------------------------------------------------------------------------
// 404 view
// ---------------------------------------------------------------------------
function NotFoundView() {
    return (_jsxs("div", { style: {
            minHeight: "60vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            fontFamily: "JetBrains Mono, monospace",
            color: "#e5e5e5",
            padding: "48px 24px",
            textAlign: "center",
        }, role: "main", "aria-label": "Repo not found", children: [_jsx("div", { style: { fontSize: 48, color: "#333", lineHeight: 1 }, children: "404" }), _jsx("div", { style: { fontSize: 20, color: "#e5e5e5" }, children: "Repo not found" }), _jsx("p", { style: { color: "#888", fontSize: 13, maxWidth: 360 }, children: "This repository slug is not registered. Check the URL or return to the repos list." }), _jsx(Link, { to: "/", style: {
                    color: "#6ee7b7",
                    textDecoration: "none",
                    border: "1px solid #6ee7b744",
                    borderRadius: 8,
                    padding: "8px 20px",
                    fontSize: 12,
                    fontFamily: "JetBrains Mono, monospace",
                    letterSpacing: "0.08em",
                    backgroundColor: "#6ee7b711",
                }, "aria-label": "Go back to repos list", children: "Back to Repos" })] }));
}
// ---------------------------------------------------------------------------
// Task table skeleton
// ---------------------------------------------------------------------------
function TaskTableSkeleton() {
    return (_jsxs("div", { role: "status", "aria-label": "Loading tasks", children: [_jsx("div", { style: {
                    display: "grid",
                    gridTemplateColumns: "2fr 3fr 1fr 1fr 1fr 1.2fr",
                    gap: "0 16px",
                    padding: "8px 0",
                    borderBottom: "1px solid #222",
                    marginBottom: 4,
                }, children: ["ID", "TITLE", "STAGE", "QUALITY", "COST", "CREATED"].map((h) => (_jsx("div", { style: {
                        fontSize: 10,
                        fontFamily: "JetBrains Mono, monospace",
                        color: "#555",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        padding: "4px 0",
                    }, children: h }, h))) }), Array.from({ length: 5 }).map((_, i) => (_jsxs("div", { style: {
                    display: "grid",
                    gridTemplateColumns: "2fr 3fr 1fr 1fr 1fr 1.2fr",
                    gap: "0 16px",
                    padding: "10px 0",
                    borderBottom: "1px solid #1a1a1a",
                }, children: [_jsx(Skeleton, { className: "h-3 bg-white/5", style: { width: "70%" } }), _jsx(Skeleton, { className: "h-3 bg-white/5", style: { width: "90%" } }), _jsx(Skeleton, { className: "h-3 bg-white/5", style: { width: "60%" } }), _jsx(Skeleton, { className: "h-3 bg-white/5", style: { width: "50%" } }), _jsx(Skeleton, { className: "h-3 bg-white/5", style: { width: "50%" } }), _jsx(Skeleton, { className: "h-3 bg-white/5", style: { width: "65%" } })] }, i)))] }));
}
function DoraMetrics({ loading, leadTime, cfr, recoveryTime }) {
    return (_jsxs("section", { "aria-label": "DORA metrics", children: [_jsx("h2", { style: {
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 11,
                    color: "#555",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    margin: "0 0 12px",
                }, children: "DORA Metrics" }), _jsx("div", { style: {
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 12,
                }, children: [
                    { label: "Lead Time", value: leadTime, detail: "Most recent DONE task" },
                    { label: "Change Failure Rate", value: cfr, detail: "As % of changes" },
                    { label: "Recovery Time", value: recoveryTime, detail: "Mean time to recover" },
                ].map(({ label, value, detail }) => (_jsxs("div", { style: {
                        background: "#111",
                        border: "1px solid #222",
                        borderRadius: 12,
                        padding: "16px",
                    }, children: [_jsx("div", { style: {
                                fontSize: 10,
                                fontFamily: "JetBrains Mono, monospace",
                                color: "#555",
                                textTransform: "uppercase",
                                letterSpacing: "0.1em",
                                marginBottom: 8,
                            }, children: label }), loading ? (_jsx(Skeleton, { className: "h-6 bg-white/5", style: { width: "60%" } })) : (_jsx("div", { style: {
                                fontSize: 22,
                                fontFamily: "JetBrains Mono, monospace",
                                color: value === "—" ? "#444" : "#6ee7b7",
                                lineHeight: 1,
                                marginBottom: 4,
                            }, "aria-label": `${label}: ${value}`, children: value })), _jsx("div", { style: {
                                fontSize: 11,
                                fontFamily: "Inter, sans-serif",
                                color: "#555",
                                marginTop: 6,
                            }, children: detail })] }, label))) })] }));
}
function ProjectMeta({ preventionRuleCount, learnedRoutesCount }) {
    const items = [
        {
            label: "Prevention Rules",
            value: preventionRuleCount !== null ? String(preventionRuleCount) : "—",
        },
        {
            label: "Learned Routes",
            value: learnedRoutesCount !== null ? String(learnedRoutesCount) : "—",
        },
    ];
    return (_jsx("div", { style: {
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
        }, children: items.map(({ label, value }) => (_jsxs("div", { style: {
                background: "#111",
                border: "1px solid #222",
                borderRadius: 12,
                padding: "12px 20px",
                minWidth: 140,
            }, children: [_jsx("div", { style: {
                        fontSize: 10,
                        fontFamily: "JetBrains Mono, monospace",
                        color: "#555",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        marginBottom: 6,
                    }, children: label }), _jsx("div", { style: {
                        fontSize: 20,
                        fontFamily: "JetBrains Mono, monospace",
                        color: value === "—" ? "#444" : "#e5e5e5",
                    }, "aria-label": `${label}: ${value}`, children: value })] }, label))) }));
}
function TaskRow({ task, slug, retro }) {
    const navigate = useNavigate();
    function handleKeyDown(e) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(`/repo/${slug}/task/${task.task_id}`);
        }
    }
    const qualityDisplay = retro?.quality_score != null ? retro.quality_score.toFixed(1) : "—";
    return (_jsxs("tr", { style: { cursor: "pointer" }, onClick: () => navigate(`/repo/${slug}/task/${task.task_id}`), onKeyDown: handleKeyDown, tabIndex: 0, role: "row", "aria-label": `Task ${task.task_id}: ${task.title}, stage ${task.stage}`, children: [_jsx("td", { style: {
                    padding: "10px 12px 10px 0",
                    borderBottom: "1px solid #1a1a1a",
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 11,
                    color: "#6ee7b7",
                    whiteSpace: "nowrap",
                    verticalAlign: "top",
                }, children: task.task_id }), _jsx("td", { style: {
                    padding: "10px 12px 10px 0",
                    borderBottom: "1px solid #1a1a1a",
                    fontFamily: "Inter, sans-serif",
                    fontSize: 13,
                    color: "#e5e5e5",
                    maxWidth: 0,
                    width: "100%",
                    verticalAlign: "top",
                }, children: _jsx("span", { style: {
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }, title: task.title, children: truncateTitle(task.title) }) }), _jsx("td", { style: {
                    padding: "10px 12px 10px 0",
                    borderBottom: "1px solid #1a1a1a",
                    verticalAlign: "top",
                    whiteSpace: "nowrap",
                }, children: _jsx("span", { style: stagePillStyle(task.stage), children: task.stage }) }), _jsx("td", { style: {
                    padding: "10px 12px 10px 0",
                    borderBottom: "1px solid #1a1a1a",
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 12,
                    color: qualityDisplay === "—" ? "#888" : "#e5e5e5",
                    whiteSpace: "nowrap",
                    verticalAlign: "top",
                }, "aria-label": `Quality: ${qualityDisplay}`, children: qualityDisplay }), _jsx("td", { style: {
                    padding: "10px 12px 10px 0",
                    borderBottom: "1px solid #1a1a1a",
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 12,
                    color: "#888",
                    whiteSpace: "nowrap",
                    verticalAlign: "top",
                }, children: "\u2014" }), _jsx("td", { style: {
                    padding: "10px 0 10px 0",
                    borderBottom: "1px solid #1a1a1a",
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 11,
                    color: "#666",
                    whiteSpace: "nowrap",
                    verticalAlign: "top",
                }, children: formatDate(task.created_at) })] }));
}
function RepoPageInner({ slug, name, projectPath, preventionRuleCount, learnedRoutesCount, }) {
    // Task list — usePollingData appends &project=<context> automatically;
    // the explicit project param in the URL ensures correct scoping regardless.
    const tasksResult = usePollingData(`/api/tasks?project=${encodeURIComponent(projectPath)}`);
    const tasks = tasksResult.data;
    // All retrospectives for this project — usePollingData appends ?project= automatically.
    const retrosResult = usePollingData("/api/retrospectives");
    // O(1) lookup map: task_id → retrospective
    const retroMap = useMemo(() => {
        const map = new Map();
        if (retrosResult.data) {
            for (const r of retrosResult.data) {
                map.set(r.task_id, r);
            }
        }
        return map;
    }, [retrosResult.data]);
    // Sort newest-first; memoized to avoid re-sort on every render.
    const sortedTasks = useMemo(() => {
        if (!tasks)
            return null;
        return [...tasks].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }, [tasks]);
    // Most recently completed task — used for DORA metrics.
    const mostRecentDoneTask = useMemo(() => {
        if (!tasks)
            return null;
        const done = tasks.filter((t) => t.stage === "DONE");
        if (done.length === 0)
            return null;
        return done.reduce((latest, t) => {
            const latestTime = new Date(latest.completed_at ?? latest.created_at).getTime();
            const tTime = new Date(t.completed_at ?? t.created_at).getTime();
            return tTime > latestTime ? t : latest;
        });
    }, [tasks]);
    // DORA: fetch retrospective for the most recently done task only.
    // Fall back to a sentinel URL that will 404 gracefully when there's no done task.
    const retroUrl = mostRecentDoneTask
        ? `/api/tasks/${encodeURIComponent(mostRecentDoneTask.task_id)}/retrospective?project=${encodeURIComponent(projectPath)}`
        : `/api/tasks/__none__/retrospective?project=${encodeURIComponent(projectPath)}`;
    const retroResult = usePollingData(retroUrl);
    const retro = mostRecentDoneTask ? retroResult.data : null;
    const doraValues = {
        leadTime: formatLeadTime(retro?.lead_time_seconds),
        cfr: formatChangeFailureRate(retro?.change_failure_rate),
        recoveryTime: formatRecoveryTime(retro?.recovery_time_seconds),
    };
    const doraLoading = Boolean(mostRecentDoneTask) && retroResult.loading;
    return (_jsxs("div", { style: {
            background: "#0a0a0a",
            minHeight: "100vh",
            padding: "32px 24px",
            maxWidth: 1200,
            margin: "0 auto",
        }, children: [_jsxs("div", { style: { marginBottom: 24 }, children: [_jsx(Breadcrumb, { name: name }), _jsx("h1", { style: {
                            fontFamily: "Inter, sans-serif",
                            fontSize: "clamp(22px, 5vw, 32px)",
                            fontWeight: 600,
                            color: "#e5e5e5",
                            margin: "16px 0 0",
                            lineHeight: 1.2,
                            wordBreak: "break-word",
                        }, children: name })] }), _jsx("div", { style: { marginBottom: 32 }, children: _jsx(ProjectMeta, { preventionRuleCount: preventionRuleCount, learnedRoutesCount: learnedRoutesCount }) }), _jsx("div", { style: {
                    background: "#111",
                    border: "1px solid #222",
                    borderRadius: 16,
                    padding: "24px",
                    marginBottom: 32,
                }, children: _jsx(DoraMetrics, { loading: doraLoading, leadTime: doraValues.leadTime, cfr: doraValues.cfr, recoveryTime: doraValues.recoveryTime }) }), _jsxs("section", { "aria-label": "Task list", children: [_jsxs("h2", { style: {
                            fontFamily: "JetBrains Mono, monospace",
                            fontSize: 11,
                            color: "#555",
                            textTransform: "uppercase",
                            letterSpacing: "0.12em",
                            margin: "0 0 12px",
                        }, children: ["Tasks", sortedTasks !== null && (_jsxs("span", { style: {
                                    marginLeft: 8,
                                    color: "#444",
                                    fontFamily: "JetBrains Mono, monospace",
                                    fontSize: 11,
                                }, children: ["(", sortedTasks.length, ")"] }))] }), tasksResult.loading && !tasks && _jsx(TaskTableSkeleton, {}), tasksResult.error && !tasks && (_jsxs("div", { style: {
                            background: "#111",
                            border: "1px solid #2a1a1a",
                            borderRadius: 12,
                            padding: 24,
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                        }, role: "alert", children: [_jsx("p", { style: {
                                    fontFamily: "Inter, sans-serif",
                                    fontSize: 14,
                                    color: "#e5e5e5",
                                    margin: 0,
                                }, children: "Failed to load tasks" }), _jsx("p", { style: {
                                    fontFamily: "Inter, sans-serif",
                                    fontSize: 12,
                                    color: "#888",
                                    margin: 0,
                                }, children: tasksResult.error }), _jsx("button", { onClick: tasksResult.refetch, style: {
                                    alignSelf: "flex-start",
                                    background: "#6ee7b711",
                                    border: "1px solid #6ee7b744",
                                    borderRadius: 8,
                                    padding: "6px 16px",
                                    fontFamily: "JetBrains Mono, monospace",
                                    fontSize: 11,
                                    color: "#6ee7b7",
                                    cursor: "pointer",
                                    letterSpacing: "0.08em",
                                }, "aria-label": "Retry loading tasks", children: "Retry" })] })), !tasksResult.loading && !tasksResult.error && sortedTasks !== null && sortedTasks.length === 0 && (_jsxs("div", { style: {
                            background: "#111",
                            border: "1px solid #222",
                            borderRadius: 12,
                            padding: "48px 24px",
                            textAlign: "center",
                        }, role: "status", "aria-label": "No tasks", children: [_jsx("p", { style: {
                                    fontFamily: "Inter, sans-serif",
                                    fontSize: 14,
                                    color: "#666",
                                    margin: 0,
                                }, children: "No tasks yet" }), _jsx("p", { style: {
                                    fontFamily: "Inter, sans-serif",
                                    fontSize: 12,
                                    color: "#444",
                                    margin: "8px 0 0",
                                }, children: "Tasks will appear here once work is queued for this project." })] })), sortedTasks !== null && sortedTasks.length > 0 && (_jsx("div", { style: { overflowX: "auto", WebkitOverflowScrolling: "touch" }, children: _jsxs("table", { style: {
                                width: "100%",
                                borderCollapse: "collapse",
                                tableLayout: "fixed",
                            }, role: "table", "aria-label": "Task list", children: [_jsx("thead", { children: _jsx("tr", { role: "row", children: [
                                            { label: "ID", style: { width: "14%" } },
                                            { label: "Title", style: { width: "auto" } },
                                            { label: "Stage", style: { width: "10%" } },
                                            { label: "Quality", style: { width: "8%" } },
                                            { label: "Cost", style: { width: "8%" } },
                                            { label: "Created", style: { width: "12%" } },
                                        ].map(({ label, style }) => (_jsx("th", { scope: "col", style: {
                                                ...style,
                                                textAlign: "left",
                                                fontFamily: "JetBrains Mono, monospace",
                                                fontSize: 10,
                                                color: "#555",
                                                textTransform: "uppercase",
                                                letterSpacing: "0.1em",
                                                padding: "8px 12px 8px 0",
                                                borderBottom: "1px solid #222",
                                                fontWeight: 400,
                                            }, children: label }, label))) }) }), _jsx("tbody", { children: sortedTasks.map((task) => (_jsx(TaskRow, { task: task, slug: slug, retro: retroMap.get(task.task_id) }, task.task_id))) })] }) }))] })] }));
}
// ---------------------------------------------------------------------------
// RepoPage — top-level; resolves slug → project, then delegates
// ---------------------------------------------------------------------------
export default function RepoPage() {
    const { slug } = useParams();
    const projects = useProjectsSummary();
    // Loading state: waiting for projects list
    if (projects.loading && !projects.data) {
        return (_jsxs("div", { style: {
                background: "#0a0a0a",
                minHeight: "100vh",
                padding: "32px 24px",
                maxWidth: 1200,
                margin: "0 auto",
            }, role: "status", "aria-label": "Loading project", children: [_jsx(Skeleton, { className: "h-4 bg-white/5", style: { width: 180, marginBottom: 20 } }), _jsx(Skeleton, { className: "h-8 bg-white/5", style: { width: 320, marginBottom: 32 } }), _jsxs("div", { style: { display: "flex", gap: 12, marginBottom: 32 }, children: [_jsx(Skeleton, { className: "h-16 bg-white/5", style: { width: 140, borderRadius: 12 } }), _jsx(Skeleton, { className: "h-16 bg-white/5", style: { width: 140, borderRadius: 12 } })] }), _jsx("div", { style: {
                        background: "#111",
                        border: "1px solid #222",
                        borderRadius: 16,
                        padding: 24,
                        marginBottom: 32,
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: 12,
                    }, children: Array.from({ length: 3 }).map((_, i) => (_jsxs("div", { style: { padding: 16, border: "1px solid #222", borderRadius: 12 }, children: [_jsx(Skeleton, { className: "h-3 bg-white/5", style: { width: "60%", marginBottom: 12 } }), _jsx(Skeleton, { className: "h-6 bg-white/5", style: { width: "50%" } })] }, i))) }), _jsx(TaskTableSkeleton, {})] }));
    }
    // Projects fetch error (with no prior data) — still attempt slug match
    // but if we have no data at all, show a generic error
    if (projects.error && !projects.data) {
        return (_jsxs("div", { style: {
                minHeight: "60vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                padding: "48px 24px",
                textAlign: "center",
            }, role: "alert", "aria-label": "Projects failed to load", children: [_jsx("p", { style: {
                        fontFamily: "Inter, sans-serif",
                        fontSize: 14,
                        color: "#e5e5e5",
                    }, children: "Unable to load project data" }), _jsx("p", { style: {
                        fontFamily: "Inter, sans-serif",
                        fontSize: 12,
                        color: "#888",
                        maxWidth: 360,
                    }, children: projects.error }), _jsxs("div", { style: { display: "flex", gap: 12 }, children: [_jsx("button", { onClick: projects.refetch, style: {
                                background: "#6ee7b711",
                                border: "1px solid #6ee7b744",
                                borderRadius: 8,
                                padding: "8px 20px",
                                fontFamily: "JetBrains Mono, monospace",
                                fontSize: 11,
                                color: "#6ee7b7",
                                cursor: "pointer",
                                letterSpacing: "0.08em",
                            }, "aria-label": "Retry loading project", children: "Retry" }), _jsx(Link, { to: "/", style: {
                                color: "#888",
                                textDecoration: "none",
                                border: "1px solid #333",
                                borderRadius: 8,
                                padding: "8px 20px",
                                fontSize: 12,
                                fontFamily: "JetBrains Mono, monospace",
                                letterSpacing: "0.08em",
                            }, "aria-label": "Back to repos list", children: "Back to Repos" })] })] }));
    }
    // Slug resolution: find project in the fetched list
    const project = (projects.data ?? []).find((p) => p.slug === slug);
    // 404: data loaded but slug not matched
    if (!project) {
        return _jsx(NotFoundView, {});
    }
    return (_jsx(RepoPageInner, { slug: slug, name: project.name, projectPath: project.path, preventionRuleCount: project.prevention_rule_count, learnedRoutesCount: project.learned_routes_count }));
}
