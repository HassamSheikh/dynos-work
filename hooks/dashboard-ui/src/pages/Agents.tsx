/**
 * Agents page — displays learned agents in a responsive card grid.
 *
 * Card grid: grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6
 * Color coding by mode: cyan (replace), teal (alongside), purple (shadow).
 * Red text for demoted status.
 * States: skeleton loading, error with retry, empty, success.
 */

import { motion } from "motion/react";
import { Bot, Hexagon, TrendingUp, TrendingDown, Zap, ArrowUpCircle, AlertTriangle } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { usePollingData } from "@/data/hooks";
import { useProject } from "@/data/ProjectContext";
import type { LearnedAgent } from "@/data/types";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricCard } from "@/components/MetricCard";

/** Mode-to-color mapping per spec. */
const MODE_COLORS: Record<string, string> = {
  replace: "#BDF000",
  alongside: "#2DD4A8",
  shadow: "#B47AFF",
};

/** Fallback color for unknown modes. */
const DEFAULT_MODE_COLOR = "#999";

function getModeColor(mode: string): string {
  return MODE_COLORS[mode] ?? DEFAULT_MODE_COLOR;
}

/** Format delta as +X.XX or -X.XX. */
function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
}

// ---------------------------------------------------------------------------
// Skeleton loading state — matches card layout shape to prevent layout shift
// ---------------------------------------------------------------------------
function SkeletonCards() {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
      role="status"
      aria-label="Loading agents"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="border border-white/5 bg-[#0F1114]/60 backdrop-blur-md p-6 relative"
        >
          <div className="absolute top-0 right-0 w-8 h-8 border-t border-r border-white/5" />
          <div className="flex justify-between items-start mb-6">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-9 w-9 rounded" />
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-end border-b border-white/5 pb-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-8 w-16" />
            </div>
            <div className="flex justify-between items-center">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error state — human-readable message with retry action
// ---------------------------------------------------------------------------
function ErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="border border-red-500/30 bg-red-500/10 backdrop-blur-md p-8 text-center max-w-md mx-auto"
      role="alert"
    >
      <div className="text-red-400 font-mono text-sm mb-2">
        SYSTEM ERROR
      </div>
      <p className="text-slate-400 text-sm mb-6">{message}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-[#BDF000]/5 hover:bg-[#BDF000]/20 text-[#BDF000] border border-[#BDF000]/20 font-mono text-xs transition-colors"
        aria-label="Retry loading agents"
      >
        RETRY
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state — guides the user toward action
// ---------------------------------------------------------------------------
function EmptyState() {
  return (
    <div className="text-center py-16 max-w-md mx-auto" role="status">
      <Bot
        className="w-12 h-12 text-slate-600 mx-auto mb-4"
        aria-hidden="true"
      />
      <p className="text-slate-400 font-mono text-sm">
        No learned agents registered
      </p>
      <p className="text-slate-600 font-mono text-xs mt-2">
        Agents are created automatically when tasks complete and patterns are learned.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AC-16: Benchmark history sparkline
// ---------------------------------------------------------------------------
/** Sparkline data point shape. */
interface SparklinePoint {
  value: number;
}

/**
 * Renders a mini sparkline (40px tall, ~120px wide) showing the agent's
 * composite score over time. When only a single data point exists, a flat
 * line is shown so the chart is never empty.
 */
function BenchmarkSparkline({ score }: { score: number }) {
  // With only the current snapshot we have a single data point.
  // Duplicate it to produce a visible flat line.
  const data: SparklinePoint[] = [{ value: score }, { value: score }];

  return (
    <div
      className="mt-2"
      style={{ width: 120, height: 40 }}
      aria-label={`Benchmark trend: ${score.toFixed(2)}`}
      role="img"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="value"
            stroke="#BDF000"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AC-17: Promotion timeline
// ---------------------------------------------------------------------------

/** Color map for mode dots on the promotion timeline. */
const TIMELINE_DOT_COLORS: Record<string, string> = {
  shadow: "#B47AFF",
  alongside: "#2DD4A8",
  replace: "#BDF000",
  demoted: "#FF3B3B",
};

/**
 * Derives an ordered list of mode stages the agent has passed through.
 * The canonical promotion path is shadow -> alongside -> replace.
 * If the agent is demoted, that is appended as a final stage.
 * With only a snapshot (no history endpoint), we infer prior stages from
 * the current mode position in the canonical sequence.
 */
function deriveTimelineStages(mode: string, status: string): string[] {
  const canonical = ["shadow", "alongside", "replace"];
  const currentIndex = canonical.indexOf(mode);

  let stages: string[];
  if (currentIndex >= 0) {
    stages = canonical.slice(0, currentIndex + 1);
  } else {
    // Unknown mode — show just the current
    stages = [mode];
  }

  if (status === "demoted") {
    stages.push("demoted");
  }

  return stages;
}

/**
 * Small horizontal timeline of colored dots connected by a thin line.
 * Each dot represents a mode transition stage.
 */
function PromotionTimeline({
  mode,
  status,
}: {
  mode: string;
  status: string;
}) {
  const stages = deriveTimelineStages(mode, status);

  return (
    <div
      className="flex items-center gap-0 mt-2"
      aria-label={`Promotion timeline: ${stages.join(" then ")}`}
      role="img"
    >
      {stages.map((stage, idx) => {
        const color = TIMELINE_DOT_COLORS[stage] ?? DEFAULT_MODE_COLOR;
        return (
          <div key={`${stage}-${idx}`} className="flex items-center">
            {idx > 0 && (
              <div
                className="h-px w-4"
                style={{ backgroundColor: `${color}80` }}
                aria-hidden="true"
              />
            )}
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: color }}
              title={stage.toUpperCase()}
              aria-hidden="true"
            />
          </div>
        );
      })}
      <span className="ml-2 text-[10px] font-mono text-slate-600 uppercase">
        {stages[stages.length - 1]}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AC-18: Baseline vs candidate comparison bars
// ---------------------------------------------------------------------------

/**
 * Two small horizontal bars comparing baseline (gray) vs candidate (colored).
 * Only rendered when both benchmark_summary and baseline_summary exist.
 */
function BaselineCandidateBars({
  baselineScore,
  candidateScore,
  modeColor,
}: {
  baselineScore: number;
  candidateScore: number;
  modeColor: string;
}) {
  // Normalize bars relative to the higher score, minimum 0.1 to avoid zero-width
  const maxScore = Math.max(baselineScore, candidateScore, 0.01);
  const baseWidth = Math.max((baselineScore / maxScore) * 100, 5);
  const candWidth = Math.max((candidateScore / maxScore) * 100, 5);

  return (
    <div
      className="mt-3 space-y-1.5"
      aria-label={`Baseline ${baselineScore.toFixed(2)} vs Candidate ${candidateScore.toFixed(2)}`}
      role="group"
    >
      {/* Baseline bar */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-mono text-slate-500 w-8 shrink-0">
          BASE
        </span>
        <div className="flex-1 h-2 bg-white/5 rounded-sm overflow-hidden">
          <div
            className="h-full rounded-sm"
            style={{
              width: `${baseWidth}%`,
              backgroundColor: "#666",
            }}
          />
        </div>
        <span className="text-[9px] font-mono text-slate-500 w-8 text-right shrink-0">
          {baselineScore.toFixed(2)}
        </span>
      </div>
      {/* Candidate bar */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-mono text-slate-500 w-8 shrink-0">
          CAND
        </span>
        <div className="flex-1 h-2 bg-white/5 rounded-sm overflow-hidden">
          <div
            className="h-full rounded-sm"
            style={{
              width: `${candWidth}%`,
              backgroundColor: modeColor,
            }}
          />
        </div>
        <span className="text-[9px] font-mono text-slate-500 w-8 text-right shrink-0">
          {candidateScore.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent card — one card per learned agent
// ---------------------------------------------------------------------------
function AgentCard({
  agent,
  index,
}: {
  agent: LearnedAgent;
  index: number;
}) {
  const modeColor = getModeColor(agent.mode);
  const isDemoted = agent.status === "demoted";
  const hasBenchmark = agent.benchmark_summary != null;
  const hasEvaluation = agent.last_evaluation != null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      className="border border-white/5 bg-[#0F1114]/60 backdrop-blur-md p-6 relative group card-hover-glow"
      role="article"
      aria-label={`Agent: ${agent.agent_name}`}
    >
      {/* Top-right corner accent */}
      <div
        className="absolute top-0 right-0 w-8 h-8 border-t border-r transition-colors"
        style={{
          borderColor: `${modeColor}4D`,
        }}
        aria-hidden="true"
      />

      {/* Header: name + icon */}
      <div className="flex justify-between items-start mb-6">
        <div className="min-w-0 flex-1 mr-3">
          <div className="text-[10px] text-slate-500 font-mono tracking-widest mb-1 flex items-center gap-2">
            <Bot className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span className="uppercase truncate">
              {agent.item_kind} / {agent.task_type}
            </span>
          </div>
          <h2
            className="text-xl font-medium tracking-wide text-slate-200 truncate"
            title={agent.agent_name}
          >
            {agent.agent_name}
          </h2>
          <div className="text-xs text-slate-400 font-mono mt-1 truncate">
            ROLE: {agent.role.toUpperCase()}
          </div>
        </div>
        <div
          className="p-2 rounded bg-white/5 border border-white/5 shrink-0"
          style={{ color: modeColor }}
        >
          <Hexagon className="w-5 h-5" aria-hidden="true" />
        </div>
      </div>

      {/* Benchmark score or "NO BENCHMARK DATA" */}
      <div className="space-y-4">
        <div className="flex justify-between items-end border-b border-white/5 pb-2">
          <span className="text-xs font-mono text-slate-500">
            COMPOSITE SCORE
          </span>
          {hasBenchmark ? (
            <span
              className="text-2xl font-light font-mono"
              style={{ color: modeColor }}
            >
              {agent.benchmark_summary!.mean_composite.toFixed(2)}
            </span>
          ) : (
            <span className="text-sm font-mono text-slate-600">
              NO BENCHMARK DATA
            </span>
          )}
        </div>

        {/* AC-16: Benchmark sparkline — below composite score */}
        {hasBenchmark && (
          <BenchmarkSparkline
            score={agent.benchmark_summary!.mean_composite}
          />
        )}

        {/* AC-17: Promotion timeline */}
        <PromotionTimeline mode={agent.mode} status={agent.status} />

        {/* AC-18: Baseline vs candidate comparison */}
        {hasBenchmark && agent.baseline_summary != null && (
          <BaselineCandidateBars
            baselineScore={agent.baseline_summary.mean_composite}
            candidateScore={agent.benchmark_summary!.mean_composite}
            modeColor={modeColor}
          />
        )}

        {/* Mode */}
        <div className="flex justify-between items-center text-xs font-mono">
          <span className="text-slate-500">MODE</span>
          <span style={{ color: modeColor }}>
            {agent.mode.toUpperCase()}
          </span>
        </div>

        {/* Status */}
        <div className="flex justify-between items-center text-xs font-mono">
          <span className="text-slate-500">STATUS</span>
          <span className={isDemoted ? "text-[#FF3B3B]" : "text-slate-300"}>
            {agent.status.toUpperCase()}
          </span>
        </div>

        {/* Evaluation: recommendation badge + delta */}
        {hasEvaluation && (
          <div className="pt-4 mt-2 border-t border-white/5 flex items-center justify-between gap-2">
            <Badge
              variant="outline"
              className="font-mono text-[10px] uppercase"
            >
              {agent.last_evaluation!.recommendation}
            </Badge>
            <span
              className="text-sm font-mono flex items-center gap-1"
              style={{
                color:
                  agent.last_evaluation!.delta_composite >= 0
                    ? "#2DD4A8"
                    : "#FF3B3B",
              }}
            >
              {agent.last_evaluation!.delta_composite >= 0 ? (
                <TrendingUp className="w-3 h-3" aria-hidden="true" />
              ) : (
                <TrendingDown className="w-3 h-3" aria-hidden="true" />
              )}
              {formatDelta(agent.last_evaluation!.delta_composite)}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default function Agents() {
  const { selectedProject } = useProject();
  const { data, loading, error, refetch } = usePollingData<LearnedAgent[]>(
    "/api/agents",
  );

  const isInitialLoad = loading && data === null;
  const isError = error !== null && data === null;
  const isEmpty = !loading && !error && data !== null && data.length === 0;
  const hasData = data !== null && data.length > 0;
  const isStaleError = error !== null && data !== null;

  return (
    <div className="p-8 h-full flex flex-col">
      <header className="mb-8">
        <h1 className="text-3xl font-mono font-light tracking-[0.2em] text-[#BDF000]">
          AGENTS
        </h1>
        <p className="text-slate-500 font-mono text-xs mt-2">
          // LEARNED AGENTS &amp; BENCHMARK STATUS
        </p>
      </header>

      {/* AC-4: 4-card summary row */}
      {hasData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <MetricCard
            label="Total Agents"
            value={data!.length}
            trend={null}
            icon={<Bot className="w-3.5 h-3.5 text-[#7A776E]" aria-hidden="true" />}
            delay={0}
          />
          <MetricCard
            label="Active"
            value={data!.filter((a) => a.status.includes("active")).length}
            trend={null}
            icon={<Zap className="w-3.5 h-3.5 text-[#7A776E]" aria-hidden="true" />}
            delay={0.05}
          />
          <MetricCard
            label="Replace Mode"
            value={data!.filter((a) => a.mode === "replace").length}
            trend={null}
            icon={<ArrowUpCircle className="w-3.5 h-3.5 text-[#7A776E]" aria-hidden="true" />}
            delay={0.1}
          />
          <MetricCard
            label="Demoted"
            value={data!.filter((a) => a.status.includes("demoted")).length}
            trend={null}
            icon={<AlertTriangle className="w-3.5 h-3.5 text-[#7A776E]" aria-hidden="true" />}
            delay={0.15}
          />
        </div>
      )}

      {/* Stale-error banner: data visible but last poll failed */}
      {isStaleError && hasData && (
        <div
          className="mb-4 px-4 py-2 border border-red-500/30 bg-red-500/10 text-red-400 text-xs font-mono flex items-center justify-between"
          role="alert"
        >
          <span>Connection issue: displaying cached data</span>
          <button
            onClick={refetch}
            className="text-[#BDF000] hover:underline ml-4"
            aria-label="Retry connection"
          >
            RETRY
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {isInitialLoad && <SkeletonCards />}

      {/* Error state (no cached data) */}
      {isError && !hasData && (
        <ErrorCard
          message="Unable to load agent data. Check that the daemon is running."
          onRetry={refetch}
        />
      )}

      {/* Empty state */}
      {isEmpty && <EmptyState />}

      {/* Success: agent card grid */}
      {hasData && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 flex-1 overflow-auto">
          {data!.map((agent, idx) => (
            <AgentCard
              key={agent.agent_name}
              agent={agent}
              index={idx}
            />
          ))}
        </div>
      )}
    </div>
  );
}
