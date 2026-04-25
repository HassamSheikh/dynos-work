import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate } from "react-router";
import { useProjectsSummary } from "@/data/hooks";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatRelativeTime(isoString) {
    if (!isoString)
        return "—";
    try {
        const diff = Date.now() - new Date(isoString).getTime();
        const seconds = Math.floor(diff / 1000);
        if (seconds < 60)
            return `${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60)
            return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24)
            return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }
    catch {
        return "—";
    }
}
function formatQuality(score) {
    if (score === null)
        return "—";
    return score.toFixed(1);
}
function RepoCard({ project, onClick }) {
    const stage = project.active_task_stage ?? "idle";
    const daemonRunning = project.daemon_running;
    return (_jsxs("div", { role: "button", tabIndex: 0, "aria-label": `Open repo ${project.name}`, onClick: onClick, onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
            }
        }, className: "cursor-pointer rounded-lg border p-4 transition-colors focus:outline-none focus:ring-2 focus:ring-[#6ee7b7]/50", style: { backgroundColor: "#111", borderColor: "#222" }, onMouseEnter: (e) => {
            e.currentTarget.style.borderColor = "rgba(110,231,183,0.5)";
        }, onMouseLeave: (e) => {
            e.currentTarget.style.borderColor = "#222";
        }, children: [_jsxs("div", { className: "flex items-center justify-between gap-2 mb-1", children: [_jsx("div", { className: "font-semibold truncate", style: { color: "#e5e5e5", fontSize: "0.9375rem" }, title: project.name, children: project.name }), _jsxs("div", { className: "flex items-center gap-1.5 shrink-0", children: [_jsx("span", { className: "w-2 h-2 rounded-full", style: { backgroundColor: daemonRunning ? "#6ee7b7" : "#555" }, "aria-hidden": "true" }), _jsx("span", { className: "text-[10px] uppercase tracking-wider", style: {
                                    color: daemonRunning ? "#6ee7b7" : "#888",
                                    fontFamily: "JetBrains Mono, monospace",
                                }, children: daemonRunning ? "running" : "stopped" })] })] }), _jsx("div", { className: "truncate mb-3", style: {
                    color: "#888",
                    fontSize: "0.75rem",
                    fontFamily: "JetBrains Mono, monospace",
                }, title: project.path, children: project.path }), _jsxs("div", { className: "grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4", children: [_jsx(Metric, { label: "Last active", value: formatRelativeTime(project.last_active_at) }), _jsx(Metric, { label: "Tasks", value: String(project.task_count) }), _jsx(Metric, { label: "Avg quality", value: formatQuality(project.avg_quality_score) }), _jsx(Metric, { label: "Stage", value: stage, accent: stage !== "idle" })] })] }));
}
function Metric({ label, value, accent = false, }) {
    return (_jsxs("div", { children: [_jsx("div", { className: "uppercase tracking-wider", style: {
                    color: "#555",
                    fontSize: "0.625rem",
                    fontFamily: "JetBrains Mono, monospace",
                }, children: label }), _jsx("div", { style: {
                    color: accent ? "#6ee7b7" : "#e5e5e5",
                    fontSize: "0.8125rem",
                    fontFamily: "JetBrains Mono, monospace",
                }, children: value })] }));
}
// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------
function Spinner() {
    return (_jsx("div", { className: "flex items-center justify-center", style: { minHeight: "60vh" }, role: "status", "aria-label": "Loading repos", children: _jsx("div", { className: "w-8 h-8 rounded-full border-2 animate-spin", style: {
                borderColor: "rgba(110,231,183,0.3)",
                borderTopColor: "#6ee7b7",
            } }) }));
}
// ---------------------------------------------------------------------------
// Home page
// ---------------------------------------------------------------------------
export default function Home() {
    const navigate = useNavigate();
    const { data, loading, error, refetch } = useProjectsSummary();
    // Loading: data not yet arrived
    if (loading && data === null) {
        return (_jsxs("div", { style: { backgroundColor: "#0a0a0a", minHeight: "100%", padding: "1.5rem" }, children: [_jsx("h1", { className: "font-semibold mb-6", style: { color: "#e5e5e5", fontSize: "1.5rem", fontFamily: "Inter, sans-serif" }, children: "Repos" }), _jsx(Spinner, {})] }));
    }
    // Error: fetch failed before any data arrived
    if (error && data === null) {
        return (_jsxs("div", { style: { backgroundColor: "#0a0a0a", minHeight: "100%", padding: "1.5rem" }, children: [_jsx("h1", { className: "font-semibold mb-6", style: { color: "#e5e5e5", fontSize: "1.5rem", fontFamily: "Inter, sans-serif" }, children: "Repos" }), _jsxs("div", { className: "flex flex-col items-center justify-center gap-4", style: { minHeight: "40vh" }, role: "alert", children: [_jsx("p", { style: { color: "#e5e5e5", fontFamily: "Inter, sans-serif" }, children: "Failed to load data" }), _jsx("button", { onClick: refetch, className: "px-4 py-2 rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-[#6ee7b7]/50", style: {
                                backgroundColor: "rgba(110,231,183,0.1)",
                                borderColor: "rgba(110,231,183,0.3)",
                                color: "#6ee7b7",
                                fontFamily: "Inter, sans-serif",
                                fontSize: "0.875rem",
                            }, onMouseEnter: (e) => {
                                e.currentTarget.style.backgroundColor =
                                    "rgba(110,231,183,0.2)";
                            }, onMouseLeave: (e) => {
                                e.currentTarget.style.backgroundColor =
                                    "rgba(110,231,183,0.1)";
                            }, children: "Retry" })] })] }));
    }
    const projects = data ?? [];
    return (_jsxs("div", { style: { backgroundColor: "#0a0a0a", minHeight: "100%", padding: "1.5rem" }, children: [_jsx("h1", { className: "font-semibold mb-6", style: { color: "#e5e5e5", fontSize: "1.5rem", fontFamily: "Inter, sans-serif" }, children: "Repos" }), projects.length === 0 ? (
            /* Empty state */
            _jsxs("div", { className: "flex flex-col items-center justify-center gap-2", style: { minHeight: "40vh" }, children: [_jsx("p", { style: {
                            color: "#888",
                            fontFamily: "Inter, sans-serif",
                            fontSize: "0.9375rem",
                        }, children: "No repos registered" }), _jsx("p", { style: {
                            color: "#555",
                            fontFamily: "Inter, sans-serif",
                            fontSize: "0.8125rem",
                        }, children: "Add a repo to ~/.dynos/registry.json to get started." })] })) : (
            /* Success state: grid of cards */
            _jsx("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3", children: projects.map((project) => (_jsx(RepoCard, { project: project, onClick: () => navigate(`/repo/${project.slug}`) }, project.slug))) }))] }));
}
