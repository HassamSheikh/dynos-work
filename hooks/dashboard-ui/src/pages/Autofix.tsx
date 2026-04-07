/**
 * Autofix page — /autofix
 *
 * Displays autofix metrics, category bar chart, and findings table
 * with client-side pagination.
 */
import { useState, useMemo } from "react";
import { motion } from "motion/react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Cell,
  Treemap,
  AreaChart,
  Area,
} from "recharts";
import {
  Bug,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { usePollingData } from "@/data/hooks";
import type { ProactiveFinding, AutofixMetrics } from "@/data/types";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TimeRangeFilter, filterByTimeRange } from "@/components/TimeRangeFilter";
import type { TimeRange } from "@/components/TimeRangeFilter";
import { ChartCard } from "@/components/ChartCard";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;

const CARD_BASE =
  "border border-white/5 bg-[#0F1114]/60 backdrop-blur-md p-6 rounded-xl";

const GRADIENT_PALETTE = [
  "#BDF000",
  "#2DD4A8",
  "#B47AFF",
  "#FF6D00",
  "#F50057",
  "#64FFDA",
  "#EEFF41",
  "#448AFF",
];

/** Maps a status string to a Tailwind color class for badges. */
const STATUS_COLOR_MAP: Record<string, string> = {
  fixed: "bg-green-500/20 text-green-400 border-green-500/30",
  merged: "bg-green-500/20 text-green-400 border-green-500/30",
  failed: "bg-red-500/20 text-red-400 border-red-500/30",
  "issue-opened": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  new: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "already-exists": "bg-gray-500/20 text-gray-400 border-gray-500/30",
  suppressed: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const DEFAULT_STATUS_COLOR = "bg-gray-500/20 text-gray-400 border-gray-500/30";

/** Maps severity to a small colored dot indicator. */
const SEVERITY_DOT_COLOR: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-green-500",
  info: "bg-blue-400",
};

/** PR timeline stage definitions with colors and labels. */
const PR_TIMELINE_STAGES = [
  { key: "created", color: "#EAB308", label: "Created" },
  { key: "reviewed", color: "#22D3EE", label: "Reviewed" },
  { key: "merged", color: "#22C55E", label: "Merged" },
  { key: "closed", color: "#EF4444", label: "Closed" },
] as const;

// ---------------------------------------------------------------------------
// Metric card definitions
// ---------------------------------------------------------------------------

interface MetricCardDef {
  label: string;
  getValue: (totals: AutofixMetrics["totals"]) => string;
  icon: React.ElementType;
  accent: string;
}

const METRIC_CARDS: MetricCardDef[] = [
  {
    label: "Total Findings",
    getValue: (t) => String(t.findings),
    icon: Bug,
    accent: "text-[#BDF000]",
  },
  {
    label: "Fix Rate",
    getValue: (t) => {
      if (t.findings === 0) return "0%";
      const rate = (t.merged / t.findings) * 100;
      return `${Math.round(rate * 10) / 10}%`;
    },
    icon: CheckCircle2,
    accent: "text-[#2DD4A8]",
  },
  {
    label: "PRs Merged",
    getValue: (t) => String(t.merged),
    icon: CheckCircle2,
    accent: "text-green-400",
  },
  {
    label: "Open PRs",
    getValue: (t) => String(t.open_prs),
    icon: AlertTriangle,
    accent: "text-yellow-400",
  },
  {
    label: "Recent Failures",
    getValue: (t) => String(t.recent_failures),
    icon: XCircle,
    accent: "text-red-400",
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricCardSkeleton() {
  return (
    <div className={CARD_BASE} aria-hidden="true">
      <Skeleton className="h-4 w-24 mb-3" />
      <Skeleton className="h-8 w-16" />
    </div>
  );
}

function MetricCard({ def, totals }: { def: MetricCardDef; totals: AutofixMetrics["totals"] }) {
  const Icon = def.icon;
  return (
    <motion.div
      className={`${CARD_BASE} card-hover-glow`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${def.accent}`} aria-hidden="true" />
        <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
          {def.label}
        </span>
      </div>
      <p className={`text-2xl font-mono font-bold ${def.accent}`}>
        {def.getValue(totals)}
      </p>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorClass = STATUS_COLOR_MAP[status] ?? DEFAULT_STATUS_COLOR;
  return (
    <Badge variant="outline" className={`${colorClass} rounded-full px-2.5 py-0.5 text-[10px] font-medium font-mono uppercase`}>
      {status}
    </Badge>
  );
}

/** Small colored dot indicating severity level. */
function SeverityDot({ severity }: { severity: string }) {
  const dotColor = SEVERITY_DOT_COLOR[severity.toLowerCase()] ?? "bg-gray-500";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`}
        aria-hidden="true"
      />
      <span>{severity}</span>
    </span>
  );
}

function ChartSkeleton() {
  return (
    <div className={`${CARD_BASE} h-72`} aria-hidden="true">
      <Skeleton className="h-5 w-48 mb-4" />
      <Skeleton className="h-52 w-full" />
    </div>
  );
}

/** Mini PR timeline showing colored dots connected by a thin line. */
function PrTimeline({ finding }: { finding: ProactiveFinding }) {
  if (!finding.pr_url) return null;

  const stages: { active: boolean; color: string; label: string; timestamp: string | null }[] = [
    {
      active: Boolean(finding.found_at),
      color: PR_TIMELINE_STAGES[0].color,
      label: PR_TIMELINE_STAGES[0].label,
      timestamp: finding.found_at ?? null,
    },
    {
      active: Boolean(finding.processed_at),
      color: PR_TIMELINE_STAGES[1].color,
      label: PR_TIMELINE_STAGES[1].label,
      timestamp: finding.processed_at ?? null,
    },
    {
      active: finding.pr_state === "merged" || Boolean(finding.merged_at),
      color: PR_TIMELINE_STAGES[2].color,
      label: PR_TIMELINE_STAGES[2].label,
      timestamp: finding.merged_at ?? null,
    },
    {
      active: finding.pr_state === "closed" && !finding.merged_at,
      color: PR_TIMELINE_STAGES[3].color,
      label: PR_TIMELINE_STAGES[3].label,
      timestamp: finding.processed_at ?? null,
    },
  ];

  return (
    <div className="flex items-center gap-0" role="img" aria-label={`PR timeline: ${stages.filter((s) => s.active).map((s) => s.label).join(", ")}`}>
      {stages.map((stage, idx) => (
        <div key={stage.label} className="flex items-center">
          {idx > 0 && (
            <div
              className="w-3 h-[2px]"
              style={{ backgroundColor: stage.active ? stage.color : "#334155" }}
            />
          )}
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: stage.active ? stage.color : "#334155" }}
            title={
              stage.active && stage.timestamp
                ? `${stage.label}: ${new Date(stage.timestamp).toLocaleString()}`
                : stage.label
            }
            aria-hidden="true"
          />
        </div>
      ))}
    </div>
  );
}

/** Custom content renderer for category treemap rectangles. */
function TreemapContent(props: {
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
  count?: number;
  fill?: string;
}) {
  const { x, y, width, height, name, count, fill } = props;
  if (width < 4 || height < 4) return null;
  const showLabel = width > 50 && height > 30;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={4}
        fill={fill}
        stroke="#0F1114"
        strokeWidth={2}
        style={{ opacity: 0.85 }}
      />
      {showLabel && (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 - 6}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#fff"
            fontFamily="'JetBrains Mono', monospace"
            fontSize={Math.min(11, width / 8)}
            style={{ pointerEvents: "none" }}
          >
            {name && name.length > 16 ? `${name.slice(0, 14)}...` : name}
          </text>
          <text
            x={x + width / 2}
            y={y + height / 2 + 10}
            textAnchor="middle"
            dominantBaseline="central"
            fill="rgba(255,255,255,0.7)"
            fontFamily="'JetBrains Mono', monospace"
            fontSize={Math.min(10, width / 10)}
            style={{ pointerEvents: "none" }}
          >
            {count}
          </text>
        </>
      )}
    </g>
  );
}

/** Derives weekly fix-rate trend data from findings. */
function deriveFixRateTrend(findings: ProactiveFinding[]): { week: string; rate: number }[] {
  if (findings.length === 0) return [];

  const buckets = new Map<string, { total: number; merged: number }>();
  for (const f of findings) {
    const dateStr = f.processed_at ?? f.found_at;
    if (!dateStr) continue;
    const date = new Date(dateStr);
    // ISO week start (Monday)
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(date);
    weekStart.setDate(diff);
    const key = weekStart.toISOString().slice(0, 10);
    const bucket = buckets.get(key) ?? { total: 0, merged: 0 };
    bucket.total++;
    if (f.pr_state === "merged" || f.merged_at) {
      bucket.merged++;
    }
    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, { total, merged }]) => ({
      week,
      rate: total > 0 ? Math.round((merged / total) * 1000) / 10 : 0,
    }));
}

function TableSkeleton() {
  return (
    <div className={CARD_BASE} aria-hidden="true">
      <Skeleton className="h-5 w-40 mb-4" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full mb-2" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function Autofix() {
  const {
    data: metrics,
    loading: metricsLoading,
    error: metricsError,
    refetch: refetchMetrics,
  } = usePollingData<AutofixMetrics>("/api/autofix-metrics");

  const {
    data: findings,
    loading: findingsLoading,
    error: findingsError,
    refetch: refetchFindings,
  } = usePollingData<ProactiveFinding[]>("/api/findings");

  const [page, setPage] = useState(1);
  const [timeRange, setTimeRange] = useState<TimeRange>("All");

  // Time-range filtered findings for charts
  const filteredFindings = useMemo(() => {
    if (!findings) return [];
    return filterByTimeRange(findings, (f) => f.found_at, timeRange);
  }, [findings, timeRange]);

  // Derive category chart data from filtered findings (time-range aware)
  const categoryData = useMemo(() => {
    if (filteredFindings.length === 0 && metrics?.categories && timeRange === "All") {
      // Fall back to metrics when no time filter is applied
      return Object.entries(metrics.categories).map(([name, cat]) => ({
        name,
        count:
          cat.merged +
          cat.closed_unmerged +
          cat.reverted +
          cat.verification_failed +
          cat.issues_opened,
      }));
    }
    // Aggregate from filtered findings
    const counts = new Map<string, number>();
    for (const f of filteredFindings) {
      counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  }, [filteredFindings, metrics, timeRange]);

  // Derive treemap data from category chart data
  const treemapData = useMemo(() => {
    if (categoryData.length === 0) return [];
    return categoryData.map((item, idx) => ({
      name: item.name,
      count: item.count,
      fill: GRADIENT_PALETTE[idx % GRADIENT_PALETTE.length],
    }));
  }, [categoryData]);

  // Derive fix rate trend from filtered findings
  const fixRateTrend = useMemo(() => {
    if (filteredFindings.length === 0) return [];
    return deriveFixRateTrend(filteredFindings);
  }, [filteredFindings]);

  // Pagination
  const totalFindings = findings?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalFindings / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const paginatedFindings = useMemo(() => {
    if (!findings) return [];
    const start = (clampedPage - 1) * PAGE_SIZE;
    return findings.slice(start, start + PAGE_SIZE);
  }, [findings, clampedPage]);

  const isLoading = metricsLoading || findingsLoading;
  const hasError = metricsError || findingsError;

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-6" aria-busy="true" aria-label="Loading autofix data">
        <h1 className="text-lg font-mono font-semibold text-[#BDF000] tracking-wider uppercase">
          Autofix
        </h1>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>
        <ChartSkeleton />
        <ChartSkeleton />
        <ChartSkeleton />
        <TableSkeleton />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------
  if (hasError && !metrics && !findings) {
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <h1 className="text-lg font-mono font-semibold text-[#BDF000] tracking-wider uppercase">
          Autofix
        </h1>
        <div
          className={`${CARD_BASE} flex flex-col items-center justify-center py-16 gap-4`}
          role="alert"
        >
          <XCircle className="w-10 h-10 text-red-400" aria-hidden="true" />
          <p className="text-sm font-mono text-slate-400 text-center max-w-md">
            Unable to load autofix data. Please check that the daemon is running and try again.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchMetrics();
              refetchFindings();
            }}
            aria-label="Retry loading autofix data"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Success / Empty states
  // ---------------------------------------------------------------------------
  return (
    <div className="p-4 sm:p-6 space-y-6">
      <h1 className="text-lg font-mono font-semibold text-[#BDF000] tracking-wider uppercase">
        Autofix
      </h1>

      {/* ---- Metric Cards ---- */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {METRIC_CARDS.map((def) => (
            <MetricCard key={def.label} def={def} totals={metrics.totals} />
          ))}
        </div>
      )}

      {/* ---- Category Bar Chart ---- */}
      {categoryData.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <ChartCard
            title="Category Breakdown"
            action={<TimeRangeFilter value={timeRange} onChange={setTimeRange} />}
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#999", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
                    axisLine={{ stroke: "#333" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#999", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
                    axisLine={{ stroke: "#333" }}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0D1321",
                      border: "1px solid rgba(189, 240, 0, 0.15)",
                      borderRadius: "8px",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "12px",
                      color: "#E2E8F0",
                    }}
                    cursor={{ fill: "rgba(189, 240, 0, 0.05)" }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {categoryData.map((_, idx) => (
                      <Cell
                        key={idx}
                        fill={GRADIENT_PALETTE[idx % GRADIENT_PALETTE.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </motion.div>
      )}

      {/* ---- Category Treemap ---- */}
      {treemapData.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          <ChartCard title="Category Treemap">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <Treemap
                  data={treemapData}
                  dataKey="count"
                  nameKey="name"
                  content={<TreemapContent x={0} y={0} width={0} height={0} />}
                >
                  <Tooltip
                    contentStyle={{
                      background: "#0D1321",
                      border: "1px solid rgba(189, 240, 0, 0.15)",
                      borderRadius: "8px",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "12px",
                      color: "#E2E8F0",
                    }}
                    formatter={(value: number, _name: string, props: { payload?: { name?: string } }) => [
                      `${value} findings`,
                      props.payload?.name ?? "Category",
                    ]}
                  />
                </Treemap>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </motion.div>
      )}

      {/* ---- Success Rate Trend ---- */}
      {fixRateTrend.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <ChartCard
            title="Success Rate Trend"
            action={<TimeRangeFilter value={timeRange} onChange={setTimeRange} />}
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={fixRateTrend} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <defs>
                    <linearGradient id="fixRateGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#BDF000" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#BDF000" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis
                    dataKey="week"
                    tick={{ fill: "#999", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
                    axisLine={{ stroke: "#333" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#999", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
                    axisLine={{ stroke: "#333" }}
                    tickLine={false}
                    domain={[0, 100]}
                    unit="%"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0D1321",
                      border: "1px solid rgba(189, 240, 0, 0.15)",
                      borderRadius: "8px",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "12px",
                      color: "#E2E8F0",
                    }}
                    formatter={(value: number) => [`${value}%`, "Fix Rate"]}
                    cursor={{ stroke: "rgba(189, 240, 0, 0.3)" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="rate"
                    stroke="#BDF000"
                    strokeWidth={2}
                    fill="url(#fixRateGradient)"
                    dot={{ fill: "#BDF000", r: 3, strokeWidth: 0 }}
                    activeDot={{ fill: "#BDF000", r: 5, strokeWidth: 2, stroke: "#0F1114" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </motion.div>
      )}

      {/* ---- Findings Table ---- */}
      <motion.div
        className={CARD_BASE}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
      >
        <h2 className="text-sm font-mono font-semibold text-slate-300 uppercase tracking-wider mb-4">
          Findings
        </h2>

        {totalFindings === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16 gap-3" role="status">
            <Bug className="w-10 h-10 text-slate-600" aria-hidden="true" />
            <p className="text-sm font-mono text-slate-500 text-center">
              No findings recorded
            </p>
            <p className="text-xs font-mono text-slate-600 text-center max-w-sm">
              When the autofix scanner detects issues in your codebase, they will appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5">
                    <TableHead className="text-slate-400 font-mono text-xs">Finding ID</TableHead>
                    <TableHead className="text-slate-400 font-mono text-xs">Category</TableHead>
                    <TableHead className="text-slate-400 font-mono text-xs">Severity</TableHead>
                    <TableHead className="text-slate-400 font-mono text-xs">Status</TableHead>
                    <TableHead className="text-slate-400 font-mono text-xs">PR</TableHead>
                    <TableHead className="text-slate-400 font-mono text-xs">Timeline</TableHead>
                    <TableHead className="text-slate-400 font-mono text-xs">Attempts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedFindings.map((finding, idx) => (
                    <TableRow
                      key={finding.finding_id}
                      className={`border-white/5 transition-colors hover:bg-white/[0.04] ${idx % 2 === 0 ? "bg-white/[0.02]" : ""}`}
                    >
                      <TableCell className="font-mono text-xs text-slate-300 max-w-[200px] truncate">
                        {finding.finding_id}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-400 max-w-[150px] truncate">
                        {finding.category}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-400">
                        <SeverityDot severity={finding.severity} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={finding.status} />
                      </TableCell>
                      <TableCell>
                        {finding.pr_url ? (
                          <a
                            href={finding.pr_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[#BDF000] hover:text-[#BDF000]/80 transition-colors font-mono text-xs"
                            aria-label={`Open pull request ${finding.pr_number ?? ""}`}
                          >
                            #{finding.pr_number}
                            <ExternalLink className="w-3 h-3" aria-hidden="true" />
                          </a>
                        ) : (
                          <span className="text-slate-600 font-mono text-xs" aria-label="No pull request">
                            --
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {finding.pr_url ? (
                          <PrTimeline finding={finding} />
                        ) : (
                          <span className="text-slate-600 font-mono text-xs" aria-label="No timeline">
                            --
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-400 text-center">
                        {finding.attempt_count}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
              <span className="text-xs font-mono text-slate-500">
                Page {clampedPage} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={clampedPage <= 1}
                  aria-label="Previous page"
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={clampedPage >= totalPages}
                  aria-label="Next page"
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
