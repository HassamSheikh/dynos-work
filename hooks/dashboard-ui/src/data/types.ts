/**
 * TypeScript interfaces for dynos-work dashboard data layer.
 * Matches exact JSON shapes from the API endpoints.
 */

// ---- Task Pipeline ----

export interface TaskClassification {
  type: string;
  domains: string[];
  risk_level: string;
  notes: string;
}

export interface TaskSnapshot {
  head_sha: string;
  branch: string;
}

export interface TaskManifest {
  task_id: string;
  created_at: string;
  title: string;
  raw_input: string;
  input_type: string;
  stage: string;
  classification: TaskClassification;
  fast_track: boolean;
  snapshot?: TaskSnapshot;
  retry_counts: Record<string, number>;
  blocked_reason: string | null;
  completed_at?: string;
  task_dir?: string;
  project_path?: string;
}

// ---- Retrospective / Analytics ----

export interface TaskRetrospective {
  task_id: string;
  task_outcome: string;
  task_type: string;
  task_domains: string[];
  task_risk_level: string;
  findings_by_auditor: Record<string, number>;
  findings_by_category: Record<string, number>;
  executor_repair_frequency: Record<string, number>;
  spec_review_iterations: number;
  repair_cycle_count: number;
  subagent_spawn_count: number;
  wasted_spawns: number;
  auditor_zero_finding_streaks: Record<string, number>;
  executor_zero_repair_streak: Record<string, number>;
  token_usage_by_agent: Record<string, number>;
  total_token_usage: number;
  total_input_tokens: number;
  total_output_tokens: number;
  input_tokens_by_agent: Record<string, number>;
  output_tokens_by_agent: Record<string, number>;
  token_usage_by_model: Record<string, { input_tokens: number; output_tokens: number; tokens: number }>;
  model_used_by_agent: Record<string, string>;
  agent_source: Record<string, string>;
  alongside_overlap: Record<string, unknown>;
  quality_score: number;
  cost_score: number;
  efficiency_score: number;
}

// ---- Execution Graph ----

export interface ExecutionSegment {
  id: string;
  title?: string;
  executor: string;
  depends_on: string[];
  parallelizable: boolean;
  criteria_ids: string[];
  files_expected: string[];
  description: string;
}

export interface ExecutionGraph {
  task_id: string;
  segments: ExecutionSegment[];
}

// ---- Learned Agents ----

export interface BenchmarkSummary {
  sample_count: number;
  mean_quality: number;
  mean_cost: number;
  mean_efficiency: number;
  mean_composite: number;
}

export interface AgentEvaluation {
  evaluated_at: string;
  delta_quality: number;
  delta_composite: number;
  recommendation: string;
  blocked_by_category: string | null;
  fixture_id: string;
  fixture_path: string;
  run_id: string;
  source_tasks: string[];
}

export interface LearnedAgent {
  item_kind: string;
  agent_name: string;
  role: string;
  task_type: string;
  source: string;
  path: string;
  generated_from: string;
  generated_at: string;
  mode: string;
  status: string;
  benchmark_summary?: BenchmarkSummary;
  baseline_summary?: BenchmarkSummary;
  last_evaluation?: AgentEvaluation;
  last_benchmarked_task_offset: number;
  route_allowed: boolean;
  project_path?: string;
}

// ---- Proactive / Autofix ----

export interface ProactiveFinding {
  finding_id: string;
  severity: string;
  category: string;
  description: string;
  evidence: Record<string, unknown>;
  status: string;
  found_at: string;
  processed_at: string | null;
  attempt_count: number;
  pr_number?: number;
  issue_number?: number;
  suppressed_until?: string;
  fail_reason?: string;
  pr_state?: string;
  pr_url?: string;
  merge_outcome?: string;
  merged_at?: string;
}

export interface AutofixCategoryStats {
  mode: string;
  enabled: boolean;
  confidence: number;
  merged: number;
  closed_unmerged: number;
  reverted: number;
  issues_opened: number;
  verification_failed: number;
}

export interface AutofixRateLimits {
  prs_today: number;
  max_prs_per_day: number;
  open_prs: number;
  max_open_prs: number;
}

export interface AutofixTotals {
  findings: number;
  open_prs: number;
  prs_today: number;
  recent_failures: number;
  suppression_count: number;
  merged: number;
  closed_unmerged: number;
  reverted: number;
  issues_opened: number;
}

export interface AutofixMetrics {
  generated_at: string;
  totals: AutofixTotals;
  rate_limits: AutofixRateLimits;
  categories: Record<string, AutofixCategoryStats>;
}

// ---- Policy / Settings ----

export interface PolicyConfig {
  freshness_task_window: number;
  active_rebenchmark_task_window: number;
  shadow_rebenchmark_task_window: number;
  maintainer_autostart: boolean;
  maintainer_poll_seconds: number;
  fast_track_skip_plan_audit: boolean;
  token_budget_multiplier: number;
}

export interface AutofixCategoryConfig {
  enabled: boolean;
  mode: string;
  min_confidence_autofix?: number;
  confidence?: number;
  stats?: Record<string, unknown>;
}

export interface AutofixPolicyConfig {
  max_prs_per_day: number;
  max_open_prs: number;
  cooldown_after_failures: number;
  allow_dependency_file_changes: boolean;
  suppressions?: Record<string, unknown>;
  categories: Record<string, AutofixCategoryConfig>;
}

// ---- Project Registry ----

export interface ProjectRegistryEntry {
  path: string;
  registered_at: string;
  last_active_at: string;
  status: string;
}

export interface ProjectRegistry {
  version: number;
  projects: ProjectRegistryEntry[];
  checksum: string;
}

// ---- Audit Reports ----

export interface AuditFinding {
  id: string;
  severity: string;
  blocking: boolean;
  category: string;
  title: string;
  description: string;
  location: string;
  evidence: string[];
  recommendation: string;
}

export interface AuditReport {
  auditor_name: string;
  timestamp: string;
  scope: string;
  task_id: string;
  task_type: string;
  files_audited: string[];
  findings: AuditFinding[];
}

// ---- Token / Cost Tracking ----

export interface TokenUsage {
  agents: Record<string, number>;
  by_agent: Record<string, { input_tokens: number; output_tokens: number; tokens: number; model: string }>;
  by_model: Record<string, { input_tokens: number; output_tokens: number; tokens: number }>;
  total: number;
  total_input_tokens: number;
  total_output_tokens: number;
}

export interface CostSummary {
  by_model: Record<string, {
    input_tokens: number;
    output_tokens: number;
    estimated_usd: number;
  }>;
  total_estimated_usd: number;
}

// ---- Generic API Response ----

export interface ApiResponse {
  ok: boolean;
  stdout?: string;
  stderr?: string;
}
