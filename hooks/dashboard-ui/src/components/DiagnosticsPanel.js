import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * DiagnosticsPanel — shared component for surfacing operational issues.
 * Renders an empty/healthy state or a sorted, expandable list of issues.
 * AC 51, 52, 53, 54.
 */
import { useState, useCallback } from 'react';
// ---- Severity sort order ----
const SEVERITY_ORDER = {
    error: 0,
    warning: 1,
    info: 2,
};
// ---- Severity icon components ----
function ErrorIcon() {
    // Red octagon (⬡-inspired, via SVG polygon)
    return (_jsx("svg", { "aria-hidden": true, width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", className: "shrink-0 text-red", children: _jsx("polygon", { points: "4.5,1 9.5,1 13,4.5 13,9.5 9.5,13 4.5,13 1,9.5 1,4.5", fill: "currentColor", fillOpacity: "0.2", stroke: "currentColor", strokeWidth: "1.2" }) }));
}
function WarningIcon() {
    // Amber triangle
    return (_jsx("svg", { "aria-hidden": true, width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", className: "shrink-0 text-amber", children: _jsx("polygon", { points: "7,1 13,13 1,13", fill: "currentColor", fillOpacity: "0.2", stroke: "currentColor", strokeWidth: "1.2" }) }));
}
function InfoIcon() {
    // Neutral circle
    return (_jsx("svg", { "aria-hidden": true, width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", className: "shrink-0 text-sand", children: _jsx("circle", { cx: "7", cy: "7", r: "5.5", fill: "currentColor", fillOpacity: "0.2", stroke: "currentColor", strokeWidth: "1.2" }) }));
}
function SeverityIcon({ severity }) {
    if (severity === 'error')
        return _jsx(ErrorIcon, {});
    if (severity === 'warning')
        return _jsx(WarningIcon, {});
    return _jsx(InfoIcon, {});
}
// ---- IssueRow ----
function IssueRow({ issue }) {
    const inner = (_jsxs("div", { className: "flex items-start gap-2 py-1.5", children: [_jsx("span", { className: "mt-0.5", children: _jsx(SeverityIcon, { severity: issue.severity }) }), _jsx("span", { className: "font-sans text-ash text-sm leading-snug", children: issue.description })] }));
    if (issue.href) {
        return (_jsx("a", { href: issue.href, className: "block hover:underline decoration-ash/40 underline-offset-2 cursor-pointer", "aria-label": `${issue.severity}: ${issue.description}`, children: inner }));
    }
    return _jsx("div", { "aria-label": `${issue.severity}: ${issue.description}`, children: inner });
}
// ---- ChevronIcon ----
function ChevronIcon({ open }) {
    return (_jsx("svg", { "aria-hidden": true, width: "12", height: "12", viewBox: "0 0 12 12", fill: "none", className: `transition-transform duration-200 shrink-0 text-sand ${open ? 'rotate-180' : 'rotate-0'}`, children: _jsx("path", { d: "M2 4L6 8L10 4", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }) }));
}
export function DiagnosticsPanel({ issues }) {
    const hasIssues = issues.length > 0;
    // AC 53: expanded by default when issues present; user toggle preserved within mount
    const [expanded, setExpanded] = useState(hasIssues);
    const handleToggle = useCallback(() => {
        setExpanded(prev => !prev);
    }, []);
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
        }
    }, [handleToggle]);
    // AC 52: sort errors > warnings > info
    const sortedIssues = [...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    return (_jsxs("section", { className: "bg-iron border border-iron-light rounded-lg p-4 my-4", "aria-label": "Diagnostics panel", children: [!hasIssues && (_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("svg", { "aria-hidden": true, width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", className: "shrink-0 text-green", children: [_jsx("circle", { cx: "7", cy: "7", r: "5.5", fill: "currentColor", fillOpacity: "0.15", stroke: "currentColor", strokeWidth: "1.2" }), _jsx("path", { d: "M4.5 7L6.2 8.8L9.5 5.5", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" })] }), _jsx("span", { className: "font-sans text-sm text-ash", children: "System healthy \u2014 no issues detected." })] })), hasIssues && (_jsxs(_Fragment, { children: [_jsxs("div", { role: "button", tabIndex: 0, "aria-expanded": expanded, "aria-label": `Diagnostics — ${issues.length} issue${issues.length !== 1 ? 's' : ''}. Press Enter or Space to ${expanded ? 'collapse' : 'expand'}.`, className: "flex items-center justify-between cursor-pointer select-none", onClick: handleToggle, onKeyDown: handleKeyDown, children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "font-mono text-[10px] text-sand uppercase tracking-widest", children: "Diagnostics" }), _jsxs("span", { className: "font-mono text-[10px] text-sand", children: ["(", issues.length, ")"] }), sortedIssues.filter(i => i.severity === 'error').length > 0 && (_jsxs("span", { className: "font-mono text-[9px] text-red bg-red/10 border border-red/20 px-1.5 py-0.5 rounded", children: [sortedIssues.filter(i => i.severity === 'error').length, " error", sortedIssues.filter(i => i.severity === 'error').length !== 1 ? 's' : ''] })), sortedIssues.filter(i => i.severity === 'warning').length > 0 && (_jsxs("span", { className: "font-mono text-[9px] text-amber bg-amber/10 border border-amber/20 px-1.5 py-0.5 rounded", children: [sortedIssues.filter(i => i.severity === 'warning').length, " warn", sortedIssues.filter(i => i.severity === 'warning').length !== 1 ? 's' : ''] }))] }), _jsx(ChevronIcon, { open: expanded })] }), expanded && (_jsx("div", { className: "mt-3 space-y-0.5 border-t border-iron-light pt-3", children: sortedIssues.map((issue, idx) => (_jsx(IssueRow, { issue: issue }, idx))) }))] }))] }));
}
// AC 54: named AND default export
export default DiagnosticsPanel;
