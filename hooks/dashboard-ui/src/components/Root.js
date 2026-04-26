import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router';
function Uptime() {
    const [s, setS] = useState(0);
    useEffect(() => { const id = setInterval(() => setS(p => p + 1), 1000); return () => clearInterval(id); }, []);
    const fmt = (n) => String(n).padStart(2, '0');
    return _jsxs("span", { className: "uptime-chip", children: [fmt(Math.floor(s / 3600)), ":", fmt(Math.floor((s % 3600) / 60)), ":", fmt(s % 60)] });
}
function IconHome() {
    return _jsxs("svg", { viewBox: "0 0 16 16", fill: "none", children: [_jsx("path", { d: "M2 7L8 2l6 5v6a1 1 0 01-1 1H3a1 1 0 01-1-1V7z", stroke: "currentColor", strokeWidth: "1.3" }), _jsx("path", { d: "M5.5 14V9.5h5V14", stroke: "currentColor", strokeWidth: "1.3" })] });
}
function LogoMark() {
    return _jsxs("svg", { viewBox: "0 0 20 22", fill: "none", width: "18", height: "18", children: [_jsx("rect", { x: "2", y: "8", width: "4", height: "12", rx: "1", fill: "rgba(189,240,0,0.7)" }), _jsx("rect", { x: "8", y: "2", width: "4", height: "18", rx: "1", fill: "#BDF000" }), _jsx("rect", { x: "14", y: "10", width: "4", height: "10", rx: "1", fill: "rgba(189,240,0,0.4)" })] });
}
export default function Root() {
    return (_jsxs("div", { className: "shell", children: [_jsxs("aside", { className: "sidebar", children: [_jsxs("div", { className: "sidebar-logo", children: [_jsx("div", { className: "sidebar-logo-mark", children: _jsx(LogoMark, {}) }), _jsxs("div", { children: [_jsx("div", { className: "sidebar-logo-name", children: "dynos" }), _jsx("div", { className: "sidebar-logo-sub", children: "operator" })] })] }), _jsxs("div", { className: "sidebar-section", children: [_jsx("div", { className: "sidebar-section-label", children: "Monitor" }), _jsxs(NavLink, { to: "/", end: true, className: ({ isActive }) => `nav-item${isActive ? ' active' : ''}`, children: [_jsx(IconHome, {}), _jsx("span", { children: "Home" })] })] }), _jsx("div", { style: { marginTop: 'auto' }, children: _jsx("div", { className: "sidebar-footer", children: _jsx(Uptime, {}) }) })] }), _jsx("div", { className: "page-wrap", children: _jsx("div", { className: "page-body", children: _jsx(Outlet, {}) }) })] }));
}
