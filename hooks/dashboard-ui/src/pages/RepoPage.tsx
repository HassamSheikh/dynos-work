import { useMemo, useRef, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useProjectsSummary, usePollingData, useAutoRefresh, TERMINAL_STAGES } from "@/data/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import type { TaskManifest, TaskRetrospective, ExecutionLogResponse } from "@/data/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatQuality(score: number | null | undefined): string {
  if (score === null || score === undefined) return "—";
  return score.toFixed(1);
}

function formatLeadTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  return `${Math.round(seconds)}s`;
}

function formatChangeFailureRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

function formatRecoveryTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  return `${Math.round(seconds)}s`;
}

function truncateTitle(title: string, max = 80): string {
  return title.length > max ? `${title.slice(0, max - 3)}...` : title;
}

// ---------------------------------------------------------------------------
// Cost computation helpers
// ---------------------------------------------------------------------------

const RATES = {
  haiku: { in: 0.80, out: 4.00 },
  sonnet: { in: 3.00, out: 15.00 },
  opus: { in: 15.00, out: 75.00 },
};

function getRate(model: string): { in: number; out: number } | null {
  const m = model.toLowerCase();
  if (m.includes("haiku")) return RATES.haiku;
  if (m.includes("sonnet")) return RATES.sonnet;
  if (m.includes("opus")) return RATES.opus;
  return null;
}

function computeCost(retro: TaskRetrospective): number {
  const tum = retro.token_usage_by_model;
  if (!tum) return 0;
  return Object.entries(tum).reduce((sum, [model, usage]) => {
    const rate = getRate(model);
    if (!rate) return sum;
    return sum + (usage.input_tokens / 1e6 * rate.in) + (usage.output_tokens / 1e6 * rate.out);
  }, 0);
}

function formatCostUsd(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

function modelBreakdown(retro: TaskRetrospective): string {
  const tum = retro.token_usage_by_model;
  if (!tum) return "—";
  const models = Object.keys(tum).filter((m) => getRate(m) !== null);
  if (models.length === 0) return "—";
  return models.join(", ");
}

// ---------------------------------------------------------------------------
// Section heading style (reused for all 4 analytics sections)
// ---------------------------------------------------------------------------

const sectionHeadingStyle: React.CSSProperties = {
  color: "#555",
  fontSize: "11px",
  fontFamily: "JetBrains Mono, monospace",
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  marginBottom: "12px",
  margin: "0 0 12px",
  fontWeight: 400,
};

// ---------------------------------------------------------------------------
// Stage pill
// ---------------------------------------------------------------------------

const STAGE_COLORS: Record<string, string> = {
  DONE: "#6ee7b7",
  FAILED: "#ff6b6b",
  CALIBRATED: "#b47aff",
  PLANNING: "#6ea8fe",
  EXECUTING: "#ffd166",
  AUDITING: "#ff9f43",
  REPAIRING: "#ff9f43",
};

function stagePillStyle(stage: string): React.CSSProperties {
  const color = STAGE_COLORS[stage] ?? "#888";
  return {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 9999,
    fontSize: 10,
    fontFamily: "JetBrains Mono, monospace",
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color,
    border: `1px solid ${color}44`,
    backgroundColor: `${color}11`,
    whiteSpace: "nowrap" as const,
  };
}

// ---------------------------------------------------------------------------
// Breadcrumb
// ---------------------------------------------------------------------------

function Breadcrumb({ name }: { name: string }) {
  return (
    <nav aria-label="Breadcrumb" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>
      <Link
        to="/"
        style={{ color: "#6ee7b7", textDecoration: "none" }}
        aria-label="Back to repos list"
      >
        Repos
      </Link>
      <span style={{ color: "#888", margin: "0 6px" }} aria-hidden="true">&gt;</span>
      <span
        style={{
          color: "#e5e5e5",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "min(60vw, 480px)",
          display: "inline-block",
          verticalAlign: "bottom",
        }}
        title={name}
      >
        {name}
      </span>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// 404 view
// ---------------------------------------------------------------------------

function NotFoundView() {
  return (
    <div
      style={{
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
      }}
      role="main"
      aria-label="Repo not found"
    >
      <div style={{ fontSize: 48, color: "#333", lineHeight: 1 }}>404</div>
      <div style={{ fontSize: 20, color: "#e5e5e5" }}>Repo not found</div>
      <p style={{ color: "#888", fontSize: 13, maxWidth: 360 }}>
        This repository slug is not registered. Check the URL or return to the repos list.
      </p>
      <Link
        to="/"
        style={{
          color: "#6ee7b7",
          textDecoration: "none",
          border: "1px solid #6ee7b744",
          borderRadius: 8,
          padding: "8px 20px",
          fontSize: 12,
          fontFamily: "JetBrains Mono, monospace",
          letterSpacing: "0.08em",
          backgroundColor: "#6ee7b711",
        }}
        aria-label="Go back to repos list"
      >
        Back to Repos
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task table skeleton
// ---------------------------------------------------------------------------

function TaskTableSkeleton() {
  return (
    <div role="status" aria-label="Loading tasks">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 3fr 1fr 1fr 1fr 1.2fr",
          gap: "0 16px",
          padding: "8px 0",
          borderBottom: "1px solid #222",
          marginBottom: 4,
        }}
      >
        {["ID", "TITLE", "STAGE", "QUALITY", "COST", "CREATED"].map((h) => (
          <div
            key={h}
            style={{
              fontSize: 10,
              fontFamily: "JetBrains Mono, monospace",
              color: "#555",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              padding: "4px 0",
            }}
          >
            {h}
          </div>
        ))}
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 3fr 1fr 1fr 1fr 1.2fr",
            gap: "0 16px",
            padding: "10px 0",
            borderBottom: "1px solid #1a1a1a",
          }}
        >
          <Skeleton className="h-3 bg-white/5" style={{ width: "70%" }} />
          <Skeleton className="h-3 bg-white/5" style={{ width: "90%" }} />
          <Skeleton className="h-3 bg-white/5" style={{ width: "60%" }} />
          <Skeleton className="h-3 bg-white/5" style={{ width: "50%" }} />
          <Skeleton className="h-3 bg-white/5" style={{ width: "50%" }} />
          <Skeleton className="h-3 bg-white/5" style={{ width: "65%" }} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DORA metrics section
// ---------------------------------------------------------------------------

interface DoraMetricsProps {
  loading: boolean;
  leadTime: string;
  cfr: string;
  recoveryTime: string;
}

function DoraMetrics({ loading, leadTime, cfr, recoveryTime }: DoraMetricsProps) {
  return (
    <section aria-label="DORA metrics">
      <h2
        style={{
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 11,
          color: "#555",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          margin: "0 0 12px",
        }}
      >
        DORA Metrics
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
        }}
      >
        {[
          { label: "Lead Time", value: leadTime, detail: "Most recent DONE task" },
          { label: "Change Failure Rate", value: cfr, detail: "As % of changes" },
          { label: "Recovery Time", value: recoveryTime, detail: "Mean time to recover" },
        ].map(({ label, value, detail }) => (
          <div
            key={label}
            style={{
              background: "#111",
              border: "1px solid #222",
              borderRadius: 12,
              padding: "16px",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontFamily: "JetBrains Mono, monospace",
                color: "#555",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 8,
              }}
            >
              {label}
            </div>
            {loading ? (
              <Skeleton className="h-6 bg-white/5" style={{ width: "60%" }} />
            ) : (
              <div
                style={{
                  fontSize: 22,
                  fontFamily: "JetBrains Mono, monospace",
                  color: value === "—" ? "#444" : "#6ee7b7",
                  lineHeight: 1,
                  marginBottom: 4,
                }}
                aria-label={`${label}: ${value}`}
              >
                {value}
              </div>
            )}
            <div
              style={{
                fontSize: 11,
                fontFamily: "Inter, sans-serif",
                color: "#555",
                marginTop: 6,
              }}
            >
              {detail}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Project meta section (prevention rules + learned routes)
// ---------------------------------------------------------------------------

interface ProjectMetaProps {
  preventionRuleCount: number | null;
  learnedRoutesCount: number | null;
}

function ProjectMeta({ preventionRuleCount, learnedRoutesCount }: ProjectMetaProps) {
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

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        flexWrap: "wrap" as const,
      }}
    >
      {items.map(({ label, value }) => (
        <div
          key={label}
          style={{
            background: "#111",
            border: "1px solid #222",
            borderRadius: 12,
            padding: "12px 20px",
            minWidth: 140,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontFamily: "JetBrains Mono, monospace",
              color: "#555",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 6,
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontSize: 20,
              fontFamily: "JetBrains Mono, monospace",
              color: value === "—" ? "#444" : "#e5e5e5",
            }}
            aria-label={`${label}: ${value}`}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task table row
// ---------------------------------------------------------------------------

interface TaskRowProps {
  task: TaskManifest;
  slug: string;
  retro: TaskRetrospective | undefined;
}

function TaskRow({ task, slug, retro }: TaskRowProps) {
  const navigate = useNavigate();

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigate(`/repo/${slug}/task/${task.task_id}`);
    }
  }

  const qualityDisplay = retro?.quality_score != null ? retro.quality_score.toFixed(1) : "—";
  const costDisplay = retro != null ? formatCostUsd(computeCost(retro)) : "—";

  return (
    <tr
      style={{ cursor: "pointer" }}
      onClick={() => navigate(`/repo/${slug}/task/${task.task_id}`)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="row"
      aria-label={`Task ${task.task_id}: ${task.title}, stage ${task.stage}`}
    >
      <td
        style={{
          padding: "10px 12px 10px 0",
          borderBottom: "1px solid #1a1a1a",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 11,
          color: "#6ee7b7",
          whiteSpace: "nowrap",
          verticalAlign: "top",
        }}
      >
        {task.task_id}
      </td>
      <td
        style={{
          padding: "10px 12px 10px 0",
          borderBottom: "1px solid #1a1a1a",
          fontFamily: "Inter, sans-serif",
          fontSize: 13,
          color: "#e5e5e5",
          maxWidth: 0,
          width: "100%",
          verticalAlign: "top",
        }}
      >
        <span
          style={{
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={task.title}
        >
          {truncateTitle(task.title)}
        </span>
      </td>
      <td
        style={{
          padding: "10px 12px 10px 0",
          borderBottom: "1px solid #1a1a1a",
          verticalAlign: "top",
          whiteSpace: "nowrap",
        }}
      >
        <span style={stagePillStyle(task.stage)}>{task.stage}</span>
      </td>
      <td
        style={{
          padding: "10px 12px 10px 0",
          borderBottom: "1px solid #1a1a1a",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 12,
          color: qualityDisplay === "—" ? "#888" : "#e5e5e5",
          whiteSpace: "nowrap",
          verticalAlign: "top",
        }}
        aria-label={`Quality: ${qualityDisplay}`}
      >
        {qualityDisplay}
      </td>
      <td
        style={{
          padding: "10px 12px 10px 0",
          borderBottom: "1px solid #1a1a1a",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 12,
          color: costDisplay === "—" ? "#888" : "#e5e5e5",
          whiteSpace: "nowrap",
          verticalAlign: "top",
        }}
        aria-label={`Cost: ${costDisplay}`}
      >
        {costDisplay}
      </td>
      <td
        style={{
          padding: "10px 0 10px 0",
          borderBottom: "1px solid #1a1a1a",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 11,
          color: "#666",
          whiteSpace: "nowrap",
          verticalAlign: "top",
        }}
      >
        {formatDate(task.created_at)}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Task Timeline section
// ---------------------------------------------------------------------------

interface TaskTimelineProps {
  tasks: TaskManifest[] | null;
  loading: boolean;
  slug: string;
}

function timelineBlockColor(stage: string): string {
  if (stage === "DONE" || stage === "CALIBRATED") return "rgba(110,231,183,0.15)";
  if (stage === "FAILED" || stage === "FAIL") return "rgba(255,107,107,0.15)";
  return "rgba(255,209,102,0.15)";
}

function formatDuration(startIso: string, endIso: string): string | null {
  try {
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    if (isNaN(start) || isNaN(end) || end < start) return null;
    const totalSeconds = Math.round((end - start) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  } catch {
    return null;
  }
}

function TaskTimeline({ tasks, loading, slug }: TaskTimelineProps) {
  return (
    <section
      aria-label="Task timeline"
      style={{
        background: "#111",
        border: "1px solid #222",
        borderRadius: 16,
        padding: "24px",
        marginBottom: 32,
      }}
    >
      <p style={sectionHeadingStyle}>TASK TIMELINE</p>

      {/* Loading state */}
      {loading && !tasks && (
        <div role="status" aria-label="Loading timeline" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 bg-white/5" style={{ width: 80, borderRadius: 6 }} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && tasks !== null && tasks.length === 0 && (
        <p
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 13,
            color: "#555",
            margin: 0,
          }}
        >
          No tasks yet
        </p>
      )}

      {/* Populated timeline — chronological (oldest first) */}
      {tasks !== null && tasks.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {[...tasks]
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            .map((task) => {
              const isTerminal = (TERMINAL_STAGES as readonly string[]).includes(task.stage);
              const showDuration =
                isTerminal &&
                (task.stage === "DONE" || task.stage === "CALIBRATED") &&
                task.completed_at != null;
              const duration =
                showDuration && task.completed_at
                  ? formatDuration(task.created_at, task.completed_at)
                  : null;

              return (
                <Link
                  key={task.task_id}
                  to={`/repo/${slug}/task/${task.task_id}`}
                  title={task.title}
                  aria-label={`Task ${task.task_id}: ${task.title}, stage ${task.stage}`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 2,
                    padding: "6px 10px",
                    borderRadius: 6,
                    backgroundColor: timelineBlockColor(task.stage),
                    border: "1px solid transparent",
                    textDecoration: "none",
                    minWidth: 72,
                    maxWidth: 140,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 10,
                      color: "#e5e5e5",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "100%",
                    }}
                  >
                    {task.task_id}
                  </span>
                  {duration && (
                    <span
                      style={{
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: 9,
                        color: "#888",
                      }}
                    >
                      {duration}
                    </span>
                  )}
                </Link>
              );
            })}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Quality Trend section
// ---------------------------------------------------------------------------

interface QualityTrendProps {
  tasks: TaskManifest[] | null;
  retroMap: Map<string, TaskRetrospective>;
  loading: boolean;
}

function QualityTrend({ tasks, retroMap, loading }: QualityTrendProps) {
  const chartData = useMemo(() => {
    if (!tasks) return null;
    return tasks
      .filter((t) => {
        const retro = retroMap.get(t.task_id);
        return retro !== undefined && typeof retro.quality_score === "number";
      })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((t) => {
        const retro = retroMap.get(t.task_id)!;
        return {
          taskId: t.task_id,
          date: new Date(t.created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          score: retro.quality_score,
        };
      });
  }, [tasks, retroMap]);

  const hasEnoughData = chartData !== null && chartData.length >= 2;

  return (
    <section
      aria-label="Quality trend"
      style={{
        background: "#111",
        border: "1px solid #222",
        borderRadius: 16,
        padding: "24px",
        marginBottom: 32,
      }}
    >
      <p style={sectionHeadingStyle}>QUALITY TREND</p>

      {/* Loading state */}
      {loading && !tasks && (
        <div role="status" aria-label="Loading quality trend">
          <Skeleton className="h-48 bg-white/5" style={{ borderRadius: 8 }} />
        </div>
      )}

      {/* Insufficient data */}
      {!loading && !hasEnoughData && (
        <p
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 22,
            color: "#555",
            margin: 0,
          }}
        >
          —
        </p>
      )}

      {/* Chart */}
      {hasEnoughData && chartData && (
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
              <XAxis
                dataKey="date"
                tick={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fill: "#555" }}
                axisLine={{ stroke: "#333" }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 1]}
                ticks={[0, 0.25, 0.5, 0.75, 1]}
                tick={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fill: "#555" }}
                axisLine={{ stroke: "#333" }}
                tickLine={false}
                width={36}
              />
              <Tooltip
                contentStyle={{
                  background: "#111",
                  border: "1px solid #1a1a1a",
                  borderRadius: 8,
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 11,
                  color: "#e5e5e5",
                }}
                formatter={(value: number, _name: string, props: { payload?: { taskId?: string } }) => [
                  value.toFixed(2),
                  props.payload?.taskId ?? "score",
                ]}
                labelStyle={{ color: "#888" }}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#6ee7b7"
                strokeWidth={2}
                dot={{ fill: "#6ee7b7", r: 4, strokeWidth: 0 }}
                activeDot={{ fill: "#6ee7b7", r: 5, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Active Task section
// ---------------------------------------------------------------------------

interface ActiveTaskSectionProps {
  activeTask: TaskManifest;
  projectPath: string;
}

function ActiveTaskSection({ activeTask, projectPath }: ActiveTaskSectionProps) {
  const logRef = useRef<HTMLDivElement>(null);

  const logUrl = `/api/tasks/${activeTask.task_id}/execution-log?project=${encodeURIComponent(projectPath)}&tail=50`;

  const logResult = useAutoRefresh<ExecutionLogResponse>(
    logUrl,
    activeTask.stage,
    3000,
  );

  const logData = logResult.data;

  // Auto-scroll to bottom on lines change
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logData?.lines]);

  return (
    <section
      aria-label="Active task progress"
      style={{
        background: "#111",
        border: "1px solid #222",
        borderRadius: 16,
        padding: "24px",
        marginBottom: 32,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <p style={{ ...sectionHeadingStyle, marginBottom: 0 }}>ACTIVE TASK</p>
        <span style={stagePillStyle(activeTask.stage)}>{activeTask.stage}</span>
      </div>

      <p
        style={{
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 11,
          color: "#888",
          margin: "0 0 12px",
          wordBreak: "break-word",
        }}
      >
        {activeTask.task_id}
      </p>

      {/* Log pane */}
      <div
        ref={logRef}
        style={{
          background: "#0a0a0a",
          border: "1px solid #1a1a1a",
          borderRadius: 8,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 11,
          color: "#e5e5e5",
          maxHeight: 280,
          overflowY: "auto",
          padding: "12px 16px",
        }}
        aria-label="Execution log"
        role="log"
        aria-live="polite"
      >
        {/* Loading state */}
        {logResult.loading && !logData && (
          <p style={{ color: "#555", margin: 0 }}>Loading...</p>
        )}

        {/* Error state */}
        {logResult.error && !logData && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ color: "#ff6b6b", margin: 0 }}>{logResult.error}</p>
            <button
              onClick={logResult.refetch}
              style={{
                alignSelf: "flex-start",
                background: "transparent",
                border: "1px solid #333",
                borderRadius: 6,
                padding: "4px 12px",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10,
                color: "#888",
                cursor: "pointer",
                letterSpacing: "0.08em",
              }}
              aria-label="Retry loading execution log"
            >
              Retry
            </button>
          </div>
        )}

        {/* Log lines */}
        {logData && logData.lines.map((line, i) => (
          <div key={i} style={{ lineHeight: 1.6 }}>
            {line}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Cost Breakdown section
// ---------------------------------------------------------------------------

interface CostBreakdownProps {
  retros: TaskRetrospective[] | null;
  loading: boolean;
  slug: string;
}

function CostBreakdown({ retros, loading, slug }: CostBreakdownProps) {
  const costRows = useMemo(() => {
    if (!retros) return null;
    return retros
      .map((r) => ({
        task_id: r.task_id,
        cost: computeCost(r),
        modelBreakdown: modelBreakdown(r),
      }))
      .sort((a, b) => b.cost - a.cost);
  }, [retros]);

  const totalCost = useMemo(() => {
    if (!costRows) return null;
    return costRows.reduce((sum, r) => sum + r.cost, 0);
  }, [costRows]);

  const hasData = costRows !== null && costRows.length > 0;

  return (
    <section
      aria-label="Cost breakdown"
      style={{
        background: "#111",
        border: "1px solid #222",
        borderRadius: 16,
        padding: "24px",
        marginBottom: 32,
      }}
    >
      <p style={sectionHeadingStyle}>COST BREAKDOWN</p>

      {/* Loading state */}
      {loading && !retros && (
        <div role="status" aria-label="Loading cost breakdown">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <Skeleton className="h-4 bg-white/5" style={{ width: `${70 + i * 10}%`, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && retros !== null && retros.length === 0 && (
        <p
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 13,
            color: "#555",
            margin: 0,
          }}
        >
          No cost data available
        </p>
      )}

      {/* Populated */}
      {hasData && costRows && totalCost !== null && (
        <>
          {/* Total cost */}
          <div
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 22,
              color: "#6ee7b7",
              marginBottom: 20,
            }}
            aria-label={`Total cost: ${formatCostUsd(totalCost)}`}
          >
            {formatCostUsd(totalCost)}
          </div>

          {/* Cost table */}
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table
              style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}
              role="table"
              aria-label="Cost breakdown by task"
            >
              <thead>
                <tr role="row">
                  {["Task ID", "Cost USD", "Model Breakdown"].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      style={{
                        textAlign: "left",
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: 10,
                        color: "#555",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        padding: "6px 12px 6px 0",
                        borderBottom: "1px solid #222",
                        fontWeight: 400,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {costRows.map((row) => (
                  <tr key={row.task_id} role="row">
                    <td
                      style={{
                        padding: "8px 12px 8px 0",
                        borderBottom: "1px solid #1a1a1a",
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: 11,
                        whiteSpace: "nowrap",
                        verticalAlign: "top",
                      }}
                    >
                      <Link
                        to={`/repo/${slug}/task/${row.task_id}`}
                        style={{
                          color: "#6ee7b7",
                          textDecoration: "none",
                        }}
                        aria-label={`View task ${row.task_id}`}
                      >
                        {row.task_id}
                      </Link>
                    </td>
                    <td
                      style={{
                        padding: "8px 12px 8px 0",
                        borderBottom: "1px solid #1a1a1a",
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: 11,
                        color: "#e5e5e5",
                        whiteSpace: "nowrap",
                        verticalAlign: "top",
                      }}
                    >
                      {formatCostUsd(row.cost)}
                    </td>
                    <td
                      style={{
                        padding: "8px 0 8px 0",
                        borderBottom: "1px solid #1a1a1a",
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: 11,
                        color: "#e5e5e5",
                        verticalAlign: "top",
                        wordBreak: "break-word",
                      }}
                    >
                      {row.modelBreakdown}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Inner page — rendered once project is confirmed to exist
// ---------------------------------------------------------------------------

interface RepoPageInnerProps {
  slug: string;
  name: string;
  projectPath: string;
  preventionRuleCount: number | null;
  learnedRoutesCount: number | null;
}

function RepoPageInner({
  slug,
  name,
  projectPath,
  preventionRuleCount,
  learnedRoutesCount,
}: RepoPageInnerProps) {
  // Task list — usePollingData appends &project=<context> automatically;
  // the explicit project param in the URL ensures correct scoping regardless.
  const tasksResult = usePollingData<TaskManifest[]>(
    `/api/tasks?project=${encodeURIComponent(projectPath)}`,
  );

  const tasks = tasksResult.data;

  // All retrospectives for this project — single call, reused by QualityTrend and CostBreakdown.
  const retrosResult = usePollingData<TaskRetrospective[]>(`/api/retrospectives?project=${encodeURIComponent(projectPath)}`);

  // O(1) lookup map: task_id → retrospective
  const retroMap = useMemo(() => {
    const map = new Map<string, TaskRetrospective>();
    if (retrosResult.data) {
      for (const r of retrosResult.data) {
        map.set(r.task_id, r);
      }
    }
    return map;
  }, [retrosResult.data]);

  // Sort newest-first; memoized to avoid re-sort on every render.
  const sortedTasks = useMemo(() => {
    if (!tasks) return null;
    return [...tasks].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [tasks]);

  // Active task: first task whose stage is not terminal.
  const activeTask = useMemo(
    () => tasks?.find((t) => !(TERMINAL_STAGES as readonly string[]).includes(t.stage)) ?? null,
    [tasks],
  );

  // Most recently completed task — used for DORA metrics.
  const mostRecentDoneTask = useMemo(() => {
    if (!tasks) return null;
    const done = tasks.filter((t) => t.stage === "DONE");
    if (done.length === 0) return null;
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

  const retroResult = usePollingData<TaskRetrospective>(retroUrl);

  const retro = mostRecentDoneTask ? retroResult.data : null;

  const doraValues = {
    leadTime: formatLeadTime(retro?.lead_time_seconds),
    cfr: formatChangeFailureRate(retro?.change_failure_rate),
    recoveryTime: formatRecoveryTime(retro?.recovery_time_seconds),
  };

  const doraLoading = Boolean(mostRecentDoneTask) && retroResult.loading;

  return (
    <div
      style={{
        background: "#0a0a0a",
        minHeight: "100vh",
        padding: "32px 24px",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Breadcrumb name={name} />
        <h1
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: "clamp(22px, 5vw, 32px)",
            fontWeight: 600,
            color: "#e5e5e5",
            margin: "16px 0 0",
            lineHeight: 1.2,
            wordBreak: "break-word",
          }}
        >
          {name}
        </h1>
      </div>

      {/* Project meta: prevention rules + learned routes */}
      <div style={{ marginBottom: 32 }}>
        <ProjectMeta
          preventionRuleCount={preventionRuleCount}
          learnedRoutesCount={learnedRoutesCount}
        />
      </div>

      {/* Active Task — only present when a non-terminal task exists */}
      {activeTask && (
        <ActiveTaskSection activeTask={activeTask} projectPath={projectPath} />
      )}

      {/* DORA metrics */}
      <div
        style={{
          background: "#111",
          border: "1px solid #222",
          borderRadius: 16,
          padding: "24px",
          marginBottom: 32,
        }}
      >
        <DoraMetrics
          loading={doraLoading}
          leadTime={doraValues.leadTime}
          cfr={doraValues.cfr}
          recoveryTime={doraValues.recoveryTime}
        />
      </div>

      {/* Task Timeline */}
      <TaskTimeline
        tasks={sortedTasks}
        loading={tasksResult.loading}
        slug={slug}
      />

      {/* Quality Trend */}
      <QualityTrend
        tasks={tasks}
        retroMap={retroMap}
        loading={tasksResult.loading || retrosResult.loading}
      />

      {/* Cost Breakdown */}
      <CostBreakdown
        retros={retrosResult.data}
        loading={retrosResult.loading}
        slug={slug}
      />

      {/* Task list */}
      <section aria-label="Task list">
        <h2
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11,
            color: "#555",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            margin: "0 0 12px",
          }}
        >
          Tasks
          {sortedTasks !== null && (
            <span
              style={{
                marginLeft: 8,
                color: "#444",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 11,
              }}
            >
              ({sortedTasks.length})
            </span>
          )}
        </h2>

        {/* Loading state */}
        {tasksResult.loading && !tasks && <TaskTableSkeleton />}

        {/* Error state */}
        {tasksResult.error && !tasks && (
          <div
            style={{
              background: "#111",
              border: "1px solid #2a1a1a",
              borderRadius: 12,
              padding: 24,
              display: "flex",
              flexDirection: "column" as const,
              gap: 12,
            }}
            role="alert"
          >
            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 14,
                color: "#e5e5e5",
                margin: 0,
              }}
            >
              Failed to load tasks
            </p>
            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 12,
                color: "#888",
                margin: 0,
              }}
            >
              {tasksResult.error}
            </p>
            <button
              onClick={tasksResult.refetch}
              style={{
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
              }}
              aria-label="Retry loading tasks"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!tasksResult.loading && !tasksResult.error && sortedTasks !== null && sortedTasks.length === 0 && (
          <div
            style={{
              background: "#111",
              border: "1px solid #222",
              borderRadius: 12,
              padding: "48px 24px",
              textAlign: "center",
            }}
            role="status"
            aria-label="No tasks"
          >
            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 14,
                color: "#666",
                margin: 0,
              }}
            >
              No tasks yet
            </p>
            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 12,
                color: "#444",
                margin: "8px 0 0",
              }}
            >
              Tasks will appear here once work is queued for this project.
            </p>
          </div>
        )}

        {/* Populated task table */}
        {sortedTasks !== null && sortedTasks.length > 0 && (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                tableLayout: "fixed",
              }}
              role="table"
              aria-label="Task list"
            >
              <thead>
                <tr role="row">
                  {[
                    { label: "ID", style: { width: "14%" } },
                    { label: "Title", style: { width: "auto" } },
                    { label: "Stage", style: { width: "10%" } },
                    { label: "Quality", style: { width: "8%" } },
                    { label: "Cost", style: { width: "8%" } },
                    { label: "Created", style: { width: "12%" } },
                  ].map(({ label, style }) => (
                    <th
                      key={label}
                      scope="col"
                      style={{
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
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedTasks.map((task) => (
                  <TaskRow key={task.task_id} task={task} slug={slug} retro={retroMap.get(task.task_id)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RepoPage — top-level; resolves slug → project, then delegates
// ---------------------------------------------------------------------------

export default function RepoPage() {
  const { slug } = useParams<{ slug: string }>();
  const projects = useProjectsSummary();

  // Loading state: waiting for projects list
  if (projects.loading && !projects.data) {
    return (
      <div
        style={{
          background: "#0a0a0a",
          minHeight: "100vh",
          padding: "32px 24px",
          maxWidth: 1200,
          margin: "0 auto",
        }}
        role="status"
        aria-label="Loading project"
      >
        {/* Breadcrumb skeleton */}
        <Skeleton className="h-4 bg-white/5" style={{ width: 180, marginBottom: 20 }} />
        {/* Heading skeleton */}
        <Skeleton className="h-8 bg-white/5" style={{ width: 320, marginBottom: 32 }} />
        {/* Meta cards skeleton */}
        <div style={{ display: "flex", gap: 12, marginBottom: 32 }}>
          <Skeleton className="h-16 bg-white/5" style={{ width: 140, borderRadius: 12 }} />
          <Skeleton className="h-16 bg-white/5" style={{ width: 140, borderRadius: 12 }} />
        </div>
        {/* DORA skeleton */}
        <div
          style={{
            background: "#111",
            border: "1px solid #222",
            borderRadius: 16,
            padding: 24,
            marginBottom: 32,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
          }}
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ padding: 16, border: "1px solid #222", borderRadius: 12 }}>
              <Skeleton className="h-3 bg-white/5" style={{ width: "60%", marginBottom: 12 }} />
              <Skeleton className="h-6 bg-white/5" style={{ width: "50%" }} />
            </div>
          ))}
        </div>
        {/* Table skeleton */}
        <TaskTableSkeleton />
      </div>
    );
  }

  // Projects fetch error (with no prior data) — still attempt slug match
  // but if we have no data at all, show a generic error
  if (projects.error && !projects.data) {
    return (
      <div
        style={{
          minHeight: "60vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: "48px 24px",
          textAlign: "center",
        }}
        role="alert"
        aria-label="Projects failed to load"
      >
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 14,
            color: "#e5e5e5",
          }}
        >
          Unable to load project data
        </p>
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 12,
            color: "#888",
            maxWidth: 360,
          }}
        >
          {projects.error}
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={projects.refetch}
            style={{
              background: "#6ee7b711",
              border: "1px solid #6ee7b744",
              borderRadius: 8,
              padding: "8px 20px",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 11,
              color: "#6ee7b7",
              cursor: "pointer",
              letterSpacing: "0.08em",
            }}
            aria-label="Retry loading project"
          >
            Retry
          </button>
          <Link
            to="/"
            style={{
              color: "#888",
              textDecoration: "none",
              border: "1px solid #333",
              borderRadius: 8,
              padding: "8px 20px",
              fontSize: 12,
              fontFamily: "JetBrains Mono, monospace",
              letterSpacing: "0.08em",
            }}
            aria-label="Back to repos list"
          >
            Back to Repos
          </Link>
        </div>
      </div>
    );
  }

  // Slug resolution: find project in the fetched list
  const project = (projects.data ?? []).find((p) => p.slug === slug);

  // 404: data loaded but slug not matched
  if (!project) {
    return <NotFoundView />;
  }

  return (
    <RepoPageInner
      slug={slug!}
      name={project.name}
      projectPath={project.path}
      preventionRuleCount={project.prevention_rule_count}
      learnedRoutesCount={project.learned_routes_count}
    />
  );
}
