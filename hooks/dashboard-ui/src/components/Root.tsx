import { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router';

function Uptime() {
  const [s, setS] = useState(0);
  useEffect(() => { const id = setInterval(() => setS(p => p + 1), 1000); return () => clearInterval(id); }, []);
  const fmt = (n: number) => String(n).padStart(2, '0');
  return <span className="uptime-chip">{fmt(Math.floor(s/3600))}:{fmt(Math.floor((s%3600)/60))}:{fmt(s%60)}</span>;
}

function IconHome() {
  return <svg viewBox="0 0 16 16" fill="none"><path d="M2 7L8 2l6 5v6a1 1 0 01-1 1H3a1 1 0 01-1-1V7z" stroke="currentColor" strokeWidth="1.3"/><path d="M5.5 14V9.5h5V14" stroke="currentColor" strokeWidth="1.3"/></svg>;
}
function LogoMark() {
  return <svg viewBox="0 0 20 22" fill="none" width="18" height="18">
    <rect x="2"  y="8"  width="4" height="12" rx="1" fill="rgba(189,240,0,0.7)"/>
    <rect x="8"  y="2"  width="4" height="18" rx="1" fill="#BDF000"/>
    <rect x="14" y="10" width="4" height="10" rx="1" fill="rgba(189,240,0,0.4)"/>
  </svg>;
}

export default function Root() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark"><LogoMark /></div>
          <div>
            <div className="sidebar-logo-name">dynos</div>
            <div className="sidebar-logo-sub">operator</div>
          </div>
        </div>
        <div className="sidebar-section">
          <div className="sidebar-section-label">Monitor</div>
          <NavLink to="/" end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <IconHome /><span>Home</span>
          </NavLink>
        </div>
        <div style={{ marginTop: 'auto' }}>
          <div className="sidebar-footer"><Uptime /></div>
        </div>
      </aside>
      <div className="page-wrap">
        <div className="page-body"><Outlet /></div>
      </div>
    </div>
  );
}
