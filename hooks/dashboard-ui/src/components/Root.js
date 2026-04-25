import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { Outlet, NavLink, useLocation } from "react-router";
import { House, Activity } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
const NAV_ITEMS = [
    { path: "/", icon: House, label: "REPOS" },
];
function formatElapsed(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}
function UptimeCounter() {
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setElapsed((prev) => prev + 1), 1000);
        return () => clearInterval(id);
    }, []);
    return (_jsxs("span", { className: "font-mono text-[10px] text-[#7A776E] tabular-nums whitespace-nowrap", role: "timer", "aria-label": `Uptime ${formatElapsed(elapsed)}`, children: ["UPTIME ", formatElapsed(elapsed)] }));
}
export default function Root() {
    const location = useLocation();
    return (_jsxs("div", { className: "min-h-screen bg-[#0F1114] text-[#F0F0E8] font-sans overflow-hidden flex flex-col relative selection:bg-[#BDF000]/30", children: [_jsx("div", { className: "cosmic-bg", "aria-hidden": "true" }), _jsxs("header", { className: "relative z-20 flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/6 bg-[#0F1114]/80 backdrop-blur-md", children: [_jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [_jsx(Activity, { className: "w-5 h-5 text-[#BDF000] shrink-0", "aria-hidden": "true" }), _jsx("span", { className: "font-mono text-xs font-semibold text-[#BDF000] tracking-widest whitespace-nowrap", children: "DYNOS-WORK" })] }), _jsx(UptimeCounter, {})] }), _jsxs("div", { className: "flex-1 flex relative z-10 overflow-hidden", children: [_jsx("nav", { className: "hidden md:flex flex-col items-center w-16 lg:w-20 border-r border-white/6 bg-[#0F1114]/60 backdrop-blur-sm py-6 gap-8 z-20 shrink-0", "aria-label": "Main navigation", children: NAV_ITEMS.map((item) => {
                            const active = item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path);
                            return (_jsxs(NavLink, { to: item.path, className: "relative group flex items-center justify-center w-full", "aria-label": item.label, end: item.path === "/", children: [_jsx("div", { className: `p-3 rounded-xl transition-all duration-300 ${active ? "bg-[#BDF000]/10 shadow-[0_0_15px_rgba(189,240,0,0.1)]" : "hover:bg-white/5"}`, children: _jsx(item.icon, { className: `w-5 h-5 transition-colors ${active ? "text-[#BDF000]" : "text-slate-500 group-hover:text-[#2DD4A8]"}`, "aria-hidden": "true" }) }), active && (_jsx(motion.div, { layoutId: "activeNav", className: "absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-[#BDF000] rounded-l shadow-[0_0_8px_rgba(189,240,0,0.8)]" }))] }, item.path));
                        }) }), _jsx("main", { className: "flex-1 overflow-x-hidden overflow-y-auto relative", children: _jsx(AnimatePresence, { mode: "wait", children: _jsx(motion.div, { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -12 }, transition: { duration: 0.28, ease: "easeOut" }, children: _jsx(Outlet, {}) }, location.pathname) }) })] })] }));
}
