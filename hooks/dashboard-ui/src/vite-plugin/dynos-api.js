import * as fs from "node:fs";
import * as path from "node:path";
import { exec } from "node:child_process";
import { homedir } from "node:os";
import { URL } from "node:url";
const TASK_ID_PATTERN = /^task-\d{8}-\d{3}$/;
function computeSlug(projectPath) {
    return projectPath.replace(/^\//, "").replace(/\//g, "-");
}
function jsonResponse(res, statusCode, data) {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
}
function readJsonFile(filePath) {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
}
function readTextFile(filePath) {
    return fs.readFileSync(filePath, "utf-8");
}
function getRegistry() {
    const registryPath = path.join(homedir(), ".dynos", "registry.json");
    return readJsonFile(registryPath);
}
function persistentDir(slug) {
    return path.join(homedir(), ".dynos", "projects", slug);
}
function localDynosDir(projectPath) {
    return path.join(projectPath, ".dynos");
}
function listTaskDirs(projectPath) {
    try {
        const entries = fs.readdirSync(localDynosDir(projectPath));
        return entries.filter((e) => TASK_ID_PATTERN.test(e));
    }
    catch {
        return [];
    }
}
function collectFromAllProjects(collector) {
    try {
        const registry = getRegistry();
        const results = [];
        for (const proj of registry.projects) {
            try {
                const slug = computeSlug(proj.path);
                results.push(...collector(proj.path, slug));
            }
            catch {
                // skip projects that fail
            }
        }
        return results;
    }
    catch {
        return [];
    }
}
const MAX_BODY_SIZE = 1024 * 1024; // 1MB
function parseBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let totalSize = 0;
        req.on("data", (chunk) => {
            if (chunk) {
                totalSize += chunk.length;
                if (totalSize > MAX_BODY_SIZE) {
                    reject(new Error("Request body too large"));
                    return;
                }
                chunks.push(chunk);
            }
        });
        req.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf-8");
            try {
                resolve(JSON.parse(raw));
            }
            catch {
                reject(new Error("Invalid JSON body"));
            }
        });
        req.on("error", (err) => {
            reject(err ?? new Error("Request read error"));
        });
    });
}
function atomicWriteJson(filePath, data) {
    const dir = path.dirname(filePath);
    try {
        fs.mkdirSync(dir, { recursive: true });
    }
    catch {
        // directory may already exist
    }
    const tmpPath = filePath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    fs.renameSync(tmpPath, filePath);
}
function notNull(val) {
    return val !== null;
}
function isRegisteredProject(projectPath) {
    try {
        const registry = getRegistry();
        const normalized = path.resolve(projectPath);
        return registry.projects.some((p) => path.resolve(p.path) === normalized);
    }
    catch {
        return false;
    }
}
/**
 * Reconcile manifest stage with execution log.
 * If the log shows a later stage than the manifest, use the log's stage.
 * This handles cases where the skill forgot to update the manifest.
 */
function reconcileStage(taskDir, manifest) {
    const stage = manifest.stage;
    if (stage === "DONE" || (typeof stage === "string" && stage.includes("FAIL")))
        return manifest;
    try {
        const logPath = path.join(taskDir, "execution-log.md");
        const logContent = fs.readFileSync(logPath, "utf-8");
        if (logContent.includes("→ DONE") || logContent.includes("[ADVANCE] EXECUTION → DONE") || logContent.includes("[ADVANCE] AUDITING → DONE")) {
            return { ...manifest, stage: "DONE" };
        }
        // Check for last [STAGE] or [ADVANCE] line to get the real stage
        const stageLines = logContent.split("\n").filter((l) => l.includes("[STAGE]") || l.includes("[ADVANCE]"));
        if (stageLines.length > 0) {
            const last = stageLines[stageLines.length - 1];
            const match = last.match(/→\s*(\S+)/);
            if (match) {
                const logStage = match[1];
                // Only override if the log stage is "later" than manifest
                const STAGE_ORDER = {
                    FOUNDRY_INITIALIZED: 0, DISCOVERY: 1, SPEC_NORMALIZATION: 2,
                    SPEC_REVIEW: 3, PLANNING: 4, PLAN_REVIEW: 5, PLAN_AUDIT: 6,
                    PRE_EXECUTION_SNAPSHOT: 7, EXECUTION: 8, TEST_EXECUTION: 9,
                    CHECKPOINT_AUDIT: 10, AUDITING: 11, FINAL_AUDIT: 12, DONE: 13,
                };
                if ((STAGE_ORDER[logStage] ?? 0) > (STAGE_ORDER[stage] ?? 0)) {
                    return { ...manifest, stage: logStage };
                }
            }
        }
    }
    catch {
        // No log or unreadable — keep manifest stage
    }
    return manifest;
}
function findRepoRoot(startDir) {
    let dir = path.resolve(startDir);
    while (dir !== path.dirname(dir)) {
        // A repo root has both .dynos/ and .git/ (or at least .git)
        if (fs.existsSync(path.join(dir, ".dynos")) && fs.existsSync(path.join(dir, ".git")))
            return dir;
        dir = path.dirname(dir);
    }
    // Fallback: walk again looking for .dynos only
    dir = path.resolve(startDir);
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, ".dynos")))
            return dir;
        dir = path.dirname(dir);
    }
    return path.resolve(startDir);
}
export function dynosApi() {
    // Walk up from cwd to find the repo root (directory containing .dynos/)
    const repoRoot = findRepoRoot(process.cwd());
    const dynosctlPath = path.resolve(repoRoot, "hooks", "dynosctl.py");
    return {
        name: "dynos-api",
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const rawUrl = req.url ?? "/";
                const method = (req.method ?? "GET").toUpperCase();
                // Only handle /api/ routes
                if (!rawUrl.startsWith("/api/")) {
                    next();
                    return;
                }
                const parsed = new URL(rawUrl, "http://localhost");
                const pathname = parsed.pathname;
                const projectParam = parsed.searchParams.get("project");
                const isGlobal = projectParam === "__global__";
                // Validate project param against registry whitelist
                let projectPath;
                if (projectParam && !isGlobal) {
                    const decoded = decodeURIComponent(projectParam);
                    if (!isRegisteredProject(decoded)) {
                        jsonResponse(res, 400, { error: "Project not in registry" });
                        return;
                    }
                    projectPath = path.resolve(decoded);
                }
                else {
                    projectPath = repoRoot;
                }
                const slug = computeSlug(projectPath);
                // ---- GET routes ----
                if (method === "GET") {
                    // GET /api/tasks
                    if (pathname === "/api/tasks") {
                        try {
                            if (isGlobal) {
                                const tasks = collectFromAllProjects((pp) => {
                                    const taskDirs = listTaskDirs(pp);
                                    return taskDirs.map((td) => {
                                        try {
                                            const taskPath = path.join(localDynosDir(pp), td);
                                            const manifest = readJsonFile(path.join(taskPath, "manifest.json"));
                                            return { ...reconcileStage(taskPath, manifest), task_dir: td, project_path: pp };
                                        }
                                        catch {
                                            return null;
                                        }
                                    }).filter(notNull);
                                });
                                jsonResponse(res, 200, tasks);
                            }
                            else {
                                const taskDirs = listTaskDirs(projectPath);
                                const tasks = taskDirs.map((td) => {
                                    try {
                                        const taskPath = path.join(localDynosDir(projectPath), td);
                                        const manifest = readJsonFile(path.join(taskPath, "manifest.json"));
                                        return { ...reconcileStage(taskPath, manifest), task_dir: td, project_path: projectPath };
                                    }
                                    catch {
                                        return null;
                                    }
                                }).filter(notNull);
                                jsonResponse(res, 200, tasks);
                            }
                        }
                        catch (err) {
                            handleFsError(res, err);
                        }
                        return;
                    }
                    // GET /api/tasks/:taskId/retrospective
                    const retroMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/retrospective$/);
                    if (retroMatch) {
                        const taskId = retroMatch[1];
                        if (!TASK_ID_PATTERN.test(taskId)) {
                            jsonResponse(res, 400, { error: "Invalid task ID" });
                            return;
                        }
                        try {
                            const data = readJsonFile(path.join(localDynosDir(projectPath), taskId, "task-retrospective.json"));
                            jsonResponse(res, 200, data);
                        }
                        catch (err) {
                            handleFsError(res, err);
                        }
                        return;
                    }
                    // GET /api/tasks/:taskId/execution-log
                    const logMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/execution-log$/);
                    if (logMatch) {
                        const taskId = logMatch[1];
                        if (!TASK_ID_PATTERN.test(taskId)) {
                            jsonResponse(res, 400, { error: "Invalid task ID" });
                            return;
                        }
                        try {
                            const raw = readTextFile(path.join(localDynosDir(projectPath), taskId, "execution-log.md"));
                            const lines = raw.split("\n").filter((l) => l.trim());
                            jsonResponse(res, 200, { lines });
                        }
                        catch (err) {
                            handleFsError(res, err);
                        }
                        return;
                    }
                    // GET /api/tasks/:taskId/execution-graph
                    const graphMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/execution-graph$/);
                    if (graphMatch) {
                        const taskId = graphMatch[1];
                        if (!TASK_ID_PATTERN.test(taskId)) {
                            jsonResponse(res, 400, { error: "Invalid task ID" });
                            return;
                        }
                        try {
                            const data = readJsonFile(path.join(localDynosDir(projectPath), taskId, "execution-graph.json"));
                            jsonResponse(res, 200, data);
                        }
                        catch (err) {
                            handleFsError(res, err);
                        }
                        return;
                    }
                    // GET /api/agents (G)
                    if (pathname === "/api/agents") {
                        try {
                            if (isGlobal) {
                                const agents = collectFromAllProjects((pp, s) => {
                                    try {
                                        const data = readJsonFile(path.join(persistentDir(s), "learned-agents", "registry.json"));
                                        return (data.agents ?? []).map((a) => ({ ...a, project_path: pp }));
                                    }
                                    catch {
                                        return [];
                                    }
                                });
                                jsonResponse(res, 200, agents);
                            }
                            else {
                                const data = readJsonFile(path.join(persistentDir(slug), "learned-agents", "registry.json"));
                                jsonResponse(res, 200, data.agents ?? []);
                            }
                        }
                        catch (err) {
                            handleFsError(res, err);
                        }
                        return;
                    }
                    // GET /api/findings (G)
                    if (pathname === "/api/findings") {
                        try {
                            if (isGlobal) {
                                const findings = collectFromAllProjects((pp) => {
                                    try {
                                        const data = readJsonFile(path.join(localDynosDir(pp), "proactive-findings.json"));
                                        return (data.findings ?? []).map((f) => ({ ...f, project_path: pp }));
                                    }
                                    catch {
                                        return [];
                                    }
                                });
                                jsonResponse(res, 200, findings);
                            }
                            else {
                                const data = readJsonFile(path.join(localDynosDir(projectPath), "proactive-findings.json"));
                                jsonResponse(res, 200, data.findings ?? []);
                            }
                        }
                        catch (err) {
                            handleFsError(res, err);
                        }
                        return;
                    }
                    // GET /api/autofix-metrics (G)
                    if (pathname === "/api/autofix-metrics") {
                        try {
                            if (isGlobal) {
                                const allMetrics = collectFromAllProjects((_, s) => {
                                    try {
                                        const data = readJsonFile(path.join(persistentDir(s), "autofix-metrics.json"));
                                        return [data];
                                    }
                                    catch {
                                        return [];
                                    }
                                });
                                if (allMetrics.length === 0) {
                                    jsonResponse(res, 200, { totals: {} });
                                }
                                else {
                                    const merged = {};
                                    for (const m of allMetrics) {
                                        const totals = (m.totals ?? {});
                                        for (const [key, val] of Object.entries(totals)) {
                                            if (typeof val === "number") {
                                                merged[key] = (merged[key] ?? 0) + val;
                                            }
                                        }
                                    }
                                    jsonResponse(res, 200, { totals: merged });
                                }
                            }
                            else {
                                const data = readJsonFile(path.join(persistentDir(slug), "autofix-metrics.json"));
                                jsonResponse(res, 200, data);
                            }
                        }
                        catch (err) {
                            handleFsError(res, err);
                        }
                        return;
                    }
                    // GET /api/policy
                    if (pathname === "/api/policy") {
                        try {
                            const data = readJsonFile(path.join(persistentDir(slug), "policy.json"));
                            jsonResponse(res, 200, data);
                        }
                        catch (err) {
                            handleFsError(res, err);
                        }
                        return;
                    }
                    // GET /api/model-policy
                    if (pathname === "/api/model-policy") {
                        try {
                            const data = readJsonFile(path.join(persistentDir(slug), "model-policy.json"));
                            jsonResponse(res, 200, data);
                        }
                        catch (err) {
                            handleFsError(res, err);
                        }
                        return;
                    }
                    // GET /api/route-policy
                    if (pathname === "/api/route-policy") {
                        try {
                            const data = readJsonFile(path.join(persistentDir(slug), "route-policy.json"));
                            jsonResponse(res, 200, data);
                        }
                        catch (err) {
                            handleFsError(res, err);
                        }
                        return;
                    }
                    // GET /api/autofix-policy
                    if (pathname === "/api/autofix-policy") {
                        try {
                            const data = readJsonFile(path.join(persistentDir(slug), "autofix-policy.json"));
                            jsonResponse(res, 200, data);
                        }
                        catch (err) {
                            handleFsError(res, err);
                        }
                        return;
                    }
                    // GET /api/skip-policy
                    if (pathname === "/api/skip-policy") {
                        try {
                            const data = readJsonFile(path.join(persistentDir(slug), "skip-policy.json"));
                            jsonResponse(res, 200, data);
                        }
                        catch (err) {
                            handleFsError(res, err);
                        }
                        return;
                    }
                    // GET /api/registry
                    if (pathname === "/api/registry") {
                        try {
                            const data = readJsonFile(path.join(homedir(), ".dynos", "registry.json"));
                            jsonResponse(res, 200, data);
                        }
                        catch (err) {
                            handleFsError(res, err);
                        }
                        return;
                    }
                    // GET /api/retrospectives (G)
                    if (pathname === "/api/retrospectives") {
                        try {
                            if (isGlobal) {
                                const retros = collectFromAllProjects((pp) => {
                                    const taskDirs = listTaskDirs(pp);
                                    return taskDirs.map((td) => {
                                        try {
                                            const data = readJsonFile(path.join(localDynosDir(pp), td, "task-retrospective.json"));
                                            return { ...data, task_id: td, project_path: pp };
                                        }
                                        catch {
                                            return null;
                                        }
                                    }).filter(notNull);
                                });
                                jsonResponse(res, 200, retros);
                            }
                            else {
                                const taskDirs = listTaskDirs(projectPath);
                                const retros = taskDirs.map((td) => {
                                    try {
                                        const data = readJsonFile(path.join(localDynosDir(projectPath), td, "task-retrospective.json"));
                                        return { ...data, task_id: td, project_path: projectPath };
                                    }
                                    catch {
                                        return null;
                                    }
                                }).filter(notNull);
                                jsonResponse(res, 200, retros);
                            }
                        }
                        catch (err) {
                            handleFsError(res, err);
                        }
                        return;
                    }
                    // GET /api/tasks/:taskId/spec
                    const specMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/spec$/);
                    if (specMatch) {
                        const taskId = specMatch[1];
                        if (!TASK_ID_PATTERN.test(taskId)) {
                            jsonResponse(res, 400, { error: "Invalid task ID" });
                            return;
                        }
                        try {
                            const content = readTextFile(path.join(localDynosDir(projectPath), taskId, "spec.md"));
                            jsonResponse(res, 200, { content });
                        }
                        catch (err) {
                            handleFsError(res, err);
                        }
                        return;
                    }
                    // GET /api/tasks/:taskId/plan
                    const planMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/plan$/);
                    if (planMatch) {
                        const taskId = planMatch[1];
                        if (!TASK_ID_PATTERN.test(taskId)) {
                            jsonResponse(res, 400, { error: "Invalid task ID" });
                            return;
                        }
                        try {
                            const content = readTextFile(path.join(localDynosDir(projectPath), taskId, "plan.md"));
                            jsonResponse(res, 200, { content });
                        }
                        catch (err) {
                            handleFsError(res, err);
                        }
                        return;
                    }
                    // GET /api/tasks/:taskId/audit-reports
                    const auditReportsMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/audit-reports$/);
                    if (auditReportsMatch) {
                        const taskId = auditReportsMatch[1];
                        if (!TASK_ID_PATTERN.test(taskId)) {
                            jsonResponse(res, 400, { error: "Invalid task ID" });
                            return;
                        }
                        try {
                            const dirPath = path.join(localDynosDir(projectPath), taskId, "audit-reports");
                            let entries;
                            try {
                                entries = fs.readdirSync(dirPath).filter((e) => e.endsWith(".json"));
                            }
                            catch {
                                jsonResponse(res, 200, []);
                                return;
                            }
                            const reports = [];
                            for (const entry of entries) {
                                try {
                                    const data = readJsonFile(path.join(dirPath, entry));
                                    reports.push(data);
                                }
                                catch {
                                    // skip malformed files
                                }
                            }
                            jsonResponse(res, 200, reports);
                        }
                        catch (err) {
                            handleFsError(res, err);
                        }
                        return;
                    }
                    // GET /api/tasks/:taskId/token-usage
                    const tokenUsageMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/token-usage$/);
                    if (tokenUsageMatch) {
                        const taskId = tokenUsageMatch[1];
                        if (!TASK_ID_PATTERN.test(taskId)) {
                            jsonResponse(res, 400, { error: "Invalid task ID" });
                            return;
                        }
                        try {
                            const data = readJsonFile(path.join(localDynosDir(projectPath), taskId, "token-usage.json"));
                            jsonResponse(res, 200, data);
                        }
                        catch (err) {
                            handleFsError(res, err);
                        }
                        return;
                    }
                    // GET /api/cost-summary
                    if (pathname === "/api/cost-summary") {
                        try {
                            const RATES_PER_MILLION = {
                                haiku: { input: 0.80, output: 4.00 },
                                sonnet: { input: 3.00, output: 15.00 },
                                opus: { input: 15.00, output: 75.00 },
                            };
                            const byModel = {};
                            const byAgent = {};
                            let totalTokens = 0;
                            let totalInputTokens = 0;
                            let totalOutputTokens = 0;
                            let totalUsd = 0;
                            const taskDirs = listTaskDirs(projectPath);
                            for (const td of taskDirs) {
                                let usage;
                                try {
                                    usage = readJsonFile(path.join(localDynosDir(projectPath), td, "token-usage.json"));
                                }
                                catch {
                                    continue;
                                }
                                // Aggregate by model
                                const models = (usage.by_model ?? {});
                                for (const [model, info] of Object.entries(models)) {
                                    const inputTok = typeof info.input_tokens === "number" ? info.input_tokens : 0;
                                    const outputTok = typeof info.output_tokens === "number" ? info.output_tokens : 0;
                                    const tokens = typeof info.tokens === "number" ? info.tokens : (inputTok + outputTok);
                                    const key = model.toLowerCase();
                                    if (!byModel[key]) {
                                        byModel[key] = { input_tokens: 0, output_tokens: 0, tokens: 0, estimated_usd: 0 };
                                    }
                                    byModel[key].input_tokens += inputTok;
                                    byModel[key].output_tokens += outputTok;
                                    byModel[key].tokens += tokens;
                                    const rates = RATES_PER_MILLION[key] ?? { input: 3.00, output: 15.00 };
                                    const cost = (inputTok / 1_000_000) * rates.input + (outputTok / 1_000_000) * rates.output;
                                    byModel[key].estimated_usd += cost;
                                    totalTokens += tokens;
                                    totalInputTokens += inputTok;
                                    totalOutputTokens += outputTok;
                                    totalUsd += cost;
                                }
                                // Aggregate by agent
                                const agents = (usage.by_agent ?? {});
                                for (const [agent, info] of Object.entries(agents)) {
                                    const inputTok = typeof info.input_tokens === "number" ? info.input_tokens : 0;
                                    const outputTok = typeof info.output_tokens === "number" ? info.output_tokens : 0;
                                    const tokens = typeof info.tokens === "number" ? info.tokens : (inputTok + outputTok);
                                    if (!byAgent[agent]) {
                                        byAgent[agent] = { input_tokens: 0, output_tokens: 0, tokens: 0 };
                                    }
                                    byAgent[agent].input_tokens += inputTok;
                                    byAgent[agent].output_tokens += outputTok;
                                    byAgent[agent].tokens += tokens;
                                }
                            }
                            jsonResponse(res, 200, {
                                by_model: byModel,
                                by_agent: byAgent,
                                total_tokens: totalTokens,
                                total_input_tokens: totalInputTokens,
                                total_output_tokens: totalOutputTokens,
                                total_estimated_usd: Math.round(totalUsd * 100) / 100,
                            });
                        }
                        catch (err) {
                            handleFsError(res, err);
                        }
                        return;
                    }
                }
                // ---- POST routes ----
                if (method === "POST") {
                    // Block global writes
                    if (isGlobal) {
                        jsonResponse(res, 400, { error: "Global mode not supported for this endpoint" });
                        return;
                    }
                    // POST /api/policy
                    if (pathname === "/api/policy") {
                        parseBody(req).then((body) => {
                            try {
                                atomicWriteJson(path.join(persistentDir(slug), "policy.json"), body);
                                jsonResponse(res, 200, { ok: true });
                            }
                            catch (err) {
                                handleFsError(res, err);
                            }
                        }).catch(() => {
                            jsonResponse(res, 400, { error: "Invalid JSON body" });
                        });
                        return;
                    }
                    // POST /api/autofix-policy
                    if (pathname === "/api/autofix-policy") {
                        parseBody(req).then((body) => {
                            try {
                                atomicWriteJson(path.join(persistentDir(slug), "autofix-policy.json"), body);
                                jsonResponse(res, 200, { ok: true });
                            }
                            catch (err) {
                                handleFsError(res, err);
                            }
                        }).catch(() => {
                            jsonResponse(res, 400, { error: "Invalid JSON body" });
                        });
                        return;
                    }
                    // POST /api/daemon/:action
                    const daemonMatch = pathname.match(/^\/api\/daemon\/([^/]+)$/);
                    if (daemonMatch) {
                        const action = daemonMatch[1];
                        let command;
                        if (action === "status") {
                            command = `python3 "${dynosctlPath}" active-task --root .`;
                        }
                        else if (action === "validate") {
                            parseBody(req).then((body) => {
                                const taskDir = body?.taskDir;
                                if (!taskDir || !TASK_ID_PATTERN.test(taskDir)) {
                                    jsonResponse(res, 400, { error: "Invalid or missing taskDir" });
                                    return;
                                }
                                const cmd = `python3 "${dynosctlPath}" validate-task ${taskDir}`;
                                exec(cmd, { cwd: projectPath, timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
                                    if (err) {
                                        jsonResponse(res, 500, { ok: false, error: err.message, stdout: stdout ?? "", stderr: stderr ?? "" });
                                        return;
                                    }
                                    jsonResponse(res, 200, { ok: true, stdout, stderr });
                                });
                            }).catch(() => {
                                jsonResponse(res, 400, { error: "Invalid JSON body" });
                            });
                            return;
                        }
                        else {
                            jsonResponse(res, 400, { error: `Unknown daemon action: ${action}` });
                            return;
                        }
                        exec(command, { cwd: projectPath, timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
                            if (err) {
                                jsonResponse(res, 500, { ok: false, error: err.message, stdout: stdout ?? "", stderr: stderr ?? "" });
                                return;
                            }
                            jsonResponse(res, 200, { ok: true, stdout, stderr });
                        });
                        return;
                    }
                }
                // Unknown /api/ route - pass through
                next();
            });
        },
    };
}
function handleFsError(res, err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
        jsonResponse(res, 404, { error: "Not found" });
    }
    else if (err instanceof SyntaxError) {
        jsonResponse(res, 500, { error: "Invalid JSON in file" });
    }
    else {
        jsonResponse(res, 500, { error: "Internal server error" });
    }
}
export default dynosApi;
