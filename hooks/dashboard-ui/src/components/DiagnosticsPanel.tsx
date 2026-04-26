/**
 * DiagnosticsPanel — shared component for surfacing operational issues.
 * Renders an empty/healthy state or a sorted, expandable list of issues.
 * AC 51, 52, 53, 54.
 */

import { useState, useCallback } from 'react';
import type { Issue } from '../data/types';

// ---- Severity sort order ----
const SEVERITY_ORDER: Record<Issue['severity'], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

// ---- Severity icon components ----

function ErrorIcon() {
  // Red octagon (⬡-inspired, via SVG polygon)
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className="shrink-0 text-red"
    >
      <polygon
        points="4.5,1 9.5,1 13,4.5 13,9.5 9.5,13 4.5,13 1,9.5 1,4.5"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function WarningIcon() {
  // Amber triangle
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className="shrink-0 text-amber"
    >
      <polygon
        points="7,1 13,13 1,13"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function InfoIcon() {
  // Neutral circle
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className="shrink-0 text-sand"
    >
      <circle
        cx="7"
        cy="7"
        r="5.5"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function SeverityIcon({ severity }: { severity: Issue['severity'] }) {
  if (severity === 'error') return <ErrorIcon />;
  if (severity === 'warning') return <WarningIcon />;
  return <InfoIcon />;
}

// ---- IssueRow ----

function IssueRow({ issue }: { issue: Issue }) {
  const inner = (
    <div className="flex items-start gap-2 py-1.5">
      <span className="mt-0.5">
        <SeverityIcon severity={issue.severity} />
      </span>
      <span className="font-sans text-ash text-sm leading-snug">{issue.description}</span>
    </div>
  );

  if (issue.href) {
    return (
      <a
        href={issue.href}
        className="block hover:underline decoration-ash/40 underline-offset-2 cursor-pointer"
        aria-label={`${issue.severity}: ${issue.description}`}
      >
        {inner}
      </a>
    );
  }

  return <div aria-label={`${issue.severity}: ${issue.description}`}>{inner}</div>;
}

// ---- ChevronIcon ----

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={`transition-transform duration-200 shrink-0 text-sand ${open ? 'rotate-180' : 'rotate-0'}`}
    >
      <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---- Main component ----

interface DiagnosticsPanelProps {
  issues: Issue[];
}

export function DiagnosticsPanel({ issues }: DiagnosticsPanelProps) {
  const hasIssues = issues.length > 0;

  // AC 53: expanded by default when issues present; user toggle preserved within mount
  const [expanded, setExpanded] = useState(hasIssues);

  const handleToggle = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  }, [handleToggle]);

  // AC 52: sort errors > warnings > info
  const sortedIssues = [...issues].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  return (
    <section
      className="bg-iron border border-iron-light rounded-lg p-4 my-4"
      aria-label="Diagnostics panel"
    >
      {/* AC 51: empty / healthy state — compact, no chevron */}
      {!hasIssues && (
        <div className="flex items-center gap-2">
          {/* Green check */}
          <svg
            aria-hidden
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="shrink-0 text-green"
          >
            <circle cx="7" cy="7" r="5.5" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2" />
            <path d="M4.5 7L6.2 8.8L9.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-sans text-sm text-ash">
            System healthy — no issues detected.
          </span>
        </div>
      )}

      {/* Non-empty: header row with chevron toggle */}
      {hasIssues && (
        <>
          {/* AC 53: keyboard-accessible toggle */}
          <div
            role="button"
            tabIndex={0}
            aria-expanded={expanded}
            aria-label={`Diagnostics — ${issues.length} issue${issues.length !== 1 ? 's' : ''}. Press Enter or Space to ${expanded ? 'collapse' : 'expand'}.`}
            className="flex items-center justify-between cursor-pointer select-none"
            onClick={handleToggle}
            onKeyDown={handleKeyDown}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-sand uppercase tracking-widest">
                Diagnostics
              </span>
                <span className="font-mono text-[10px] text-sand">
                  ({issues.length})
                </span>
              {/* Severity summary chips */}
              {sortedIssues.filter(i => i.severity === 'error').length > 0 && (
                <span className="font-mono text-[9px] text-red bg-red/10 border border-red/20 px-1.5 py-0.5 rounded">
                  {sortedIssues.filter(i => i.severity === 'error').length} error{sortedIssues.filter(i => i.severity === 'error').length !== 1 ? 's' : ''}
                </span>
              )}
              {sortedIssues.filter(i => i.severity === 'warning').length > 0 && (
                <span className="font-mono text-[9px] text-amber bg-amber/10 border border-amber/20 px-1.5 py-0.5 rounded">
                  {sortedIssues.filter(i => i.severity === 'warning').length} warn{sortedIssues.filter(i => i.severity === 'warning').length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <ChevronIcon open={expanded} />
          </div>

          {/* AC 52: issue list */}
          {expanded && (
            <div className="mt-3 space-y-0.5 border-t border-iron-light pt-3">
              {sortedIssues.map((issue, idx) => (
                <IssueRow key={idx} issue={issue} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// AC 54: named AND default export
export default DiagnosticsPanel;
