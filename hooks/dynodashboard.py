#!/usr/bin/env python3
"""Generate and optionally serve the live dynos-work dashboard."""

from __future__ import annotations

import argparse
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from dynolineage import build_lineage
from dynoreport import build_report


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>dynos-work | Live Control Center</title>
  <style>
    :root {{
      --bg: hsl(210 30% 8%);
      --bg-soft: hsl(214 26% 12%);
      --panel: hsla(210 24% 16% / 0.88);
      --panel-2: hsla(214 22% 20% / 0.82);
      --line: hsla(210 40% 84% / 0.12);
      --text: hsl(210 30% 94%);
      --muted: hsl(212 18% 70%);
      --gold: hsl(42 94% 64%);
      --mint: hsl(156 63% 54%);
      --rose: hsl(352 84% 66%);
      --sky: hsl(198 88% 63%);
      --amber: hsl(33 94% 61%);
      --shadow: 0 20px 60px hsla(220 60% 2% / 0.45);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: "Segoe UI", ui-sans-serif, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, hsla(156 63% 54% / 0.14), transparent 32%),
        radial-gradient(circle at top right, hsla(42 94% 64% / 0.14), transparent 28%),
        linear-gradient(160deg, var(--bg), hsl(220 28% 10%));
      min-height: 100vh;
    }}
    .shell {{
      max-width: 1380px;
      margin: 0 auto;
      padding: 28px;
    }}
    .hero {{
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }}
    .panel {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 24px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
      padding: 22px;
    }}
    .headline {{
      font-size: 13px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--gold);
      margin-bottom: 12px;
      font-weight: 800;
    }}
    h1 {{
      margin: 0;
      font-size: clamp(2rem, 3vw, 4rem);
      line-height: 0.96;
    }}
    .sub {{
      color: var(--muted);
      margin-top: 16px;
      max-width: 58ch;
    }}
    .stats {{
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
      margin-top: 22px;
    }}
    .stat {{
      background: var(--panel-2);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 16px;
    }}
    .stat .label {{
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }}
    .stat .value {{
      font-size: 2rem;
      font-weight: 800;
      margin-top: 8px;
    }}
    .meta {{
      display: flex;
      justify-content: space-between;
      gap: 12px;
      color: var(--muted);
      font-size: 13px;
      margin-top: 20px;
      flex-wrap: wrap;
    }}
    .grid {{
      display: grid;
      grid-template-columns: 1.3fr 1fr;
      gap: 20px;
    }}
    .stack {{
      display: grid;
      gap: 20px;
    }}
    .barlist, .list {{
      display: grid;
      gap: 12px;
      margin-top: 16px;
    }}
    .bar {{
      display: grid;
      gap: 6px;
    }}
    .barhead {{
      display: flex;
      justify-content: space-between;
      gap: 10px;
      font-size: 13px;
    }}
    .track {{
      height: 10px;
      border-radius: 999px;
      background: hsla(210 20% 90% / 0.08);
      overflow: hidden;
    }}
    .fill {{
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--mint), var(--sky));
    }}
    .warning .fill {{ background: linear-gradient(90deg, var(--amber), var(--rose)); }}
    .row {{
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      border-radius: 16px;
      background: var(--panel-2);
      border: 1px solid var(--line);
      align-items: center;
    }}
    .mini {{
      font-size: 12px;
      color: var(--muted);
    }}
    .tag {{
      display: inline-flex;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      background: hsla(156 63% 54% / 0.14);
      color: var(--mint);
      border: 1px solid hsla(156 63% 54% / 0.24);
    }}
    .tag.warn {{
      background: hsla(33 94% 61% / 0.14);
      color: var(--amber);
      border-color: hsla(33 94% 61% / 0.24);
    }}
    .tag.danger {{
      background: hsla(352 84% 66% / 0.14);
      color: var(--rose);
      border-color: hsla(352 84% 66% / 0.24);
    }}
    .spark {{
      margin-top: 16px;
      width: 100%;
      height: 160px;
      border-radius: 18px;
      background: linear-gradient(180deg, hsla(198 88% 63% / 0.08), transparent);
      border: 1px solid var(--line);
      position: relative;
      overflow: hidden;
    }}
    .spark svg {{
      width: 100%;
      height: 100%;
      display: block;
    }}
    @media (max-width: 980px) {{
      .hero, .grid {{ grid-template-columns: 1fr; }}
      .stats {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
    }}
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="panel">
        <div class="headline">Real-Time Foundry Control</div>
        <h1>dynos-work live routing, regressions, and challenger flow</h1>
        <div class="sub">Live registry state, benchmark freshness, automation queue pressure, and promotion lineage, refreshed continuously from local runtime data.</div>
        <div class="stats" id="stats"></div>
        <div class="meta">
          <span id="updated"></span>
          <span id="lineage"></span>
        </div>
      </div>
      <div class="panel">
        <div class="headline">Control Actions</div>
        <div class="list">
          <div class="row"><span>Refresh dashboard data</span><code>python3 hooks/dynodashboard.py generate --root .</code></div>
          <div class="row"><span>Run challenger queue</span><code>python3 hooks/dynoauto.py run --root .</code></div>
          <div class="row"><span>Inspect route</span><code>python3 hooks/dynoroute.py backend-executor feature --root .</code></div>
          <div class="row"><span>Serve dashboard</span><code>python3 hooks/dynodashboard.py serve --root .</code></div>
        </div>
      </div>
    </section>
    <section class="grid">
      <div class="stack">
        <div class="panel">
          <div class="headline">Active Routes</div>
          <div class="barlist" id="routes"></div>
        </div>
        <div class="panel">
          <div class="headline">Automation Queue</div>
          <div class="list" id="queue"></div>
        </div>
        <div class="panel">
          <div class="headline">Recent Benchmark Composite</div>
          <div class="spark"><svg id="sparkline" viewBox="0 0 600 160" preserveAspectRatio="none"></svg></div>
        </div>
      </div>
      <div class="stack">
        <div class="panel">
          <div class="headline">Coverage Gaps</div>
          <div class="list" id="gaps"></div>
        </div>
        <div class="panel">
          <div class="headline">Demotions</div>
          <div class="list" id="demotions"></div>
        </div>
        <div class="panel">
          <div class="headline">Recent Runs</div>
          <div class="list" id="runs"></div>
        </div>
      </div>
    </section>
  </div>
  <script>
    const embedded = __EMBEDDED_DATA__;
    async function loadData() {{
      try {{
        const response = await fetch('dashboard-data.json?ts=' + Date.now(), {{ cache: 'no-store' }});
        if (!response.ok) throw new Error('fetch failed');
        return await response.json();
      }} catch (err) {{
        return embedded;
      }}
    }}
    function esc(value) {{
      return String(value ?? '').replace(/[&<>"]/g, (m) => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}}[m]));
    }}
    function renderStats(summary) {{
      const stats = [
        ['Learned Components', summary.learned_components],
        ['Active Routes', summary.active_routes],
        ['Queue Jobs', summary.queued_automation_jobs],
        ['Coverage Gaps', summary.coverage_gaps],
      ];
      document.getElementById('stats').innerHTML = stats.map(([label, value]) => `
        <div class="stat">
          <div class="label">${{esc(label)}}</div>
          <div class="value">${{esc(value)}}</div>
        </div>
      `).join('');
    }}
    function renderRoutes(items) {{
      const target = document.getElementById('routes');
      if (!items.length) {{
        target.innerHTML = `<div class="row"><span>No live learned routes</span><span class="tag warn">generic fallback</span></div>`;
        return;
      }}
      target.innerHTML = items.map((item) => `
        <div class="bar">
          <div class="barhead">
            <strong>${{esc(item.agent_name)}}</strong>
            <span>${{esc(item.mode)}} · ${{Number(item.composite || 0).toFixed(3)}}</span>
          </div>
          <div class="mini">${{esc(item.role)}} / ${{esc(item.task_type)}}</div>
          <div class="track"><div class="fill" style="width:${{Math.max(5, Math.min(100, (item.composite || 0) * 100))}}%"></div></div>
        </div>
      `).join('');
    }}
    function renderList(id, items, emptyText, formatter) {{
      const target = document.getElementById(id);
      if (!items.length) {{
        target.innerHTML = `<div class="row"><span>${{esc(emptyText)}}</span></div>`;
        return;
      }}
      target.innerHTML = items.map(formatter).join('');
    }}
    function renderRuns(runs) {{
      renderList('runs', runs, 'No benchmark runs yet.', (item) => `
        <div class="row">
          <div>
            <div><strong>${{esc(item.fixture_id || item.run_id)}}</strong></div>
            <div class="mini">${{esc(item.target_name || 'unknown')}} · ${{esc(item.role || 'n/a')}}</div>
          </div>
          <span class="tag">${{esc(item.evaluation?.recommendation || 'recorded')}}</span>
        </div>
      `);
      const svg = document.getElementById('sparkline');
      const values = runs.map((item) => Number(item.evaluation?.candidate?.mean_composite || 0));
      if (!values.length) {{
        svg.innerHTML = '';
        return;
      }}
      const max = Math.max(...values, 1);
      const min = Math.min(...values, 0);
      const points = values.map((value, index) => {{
        const x = values.length === 1 ? 300 : (index / (values.length - 1)) * 600;
        const y = 140 - ((value - min) / Math.max(0.0001, max - min || 1)) * 110;
        return `${{x}},${{y}}`;
      }}).join(' ');
      svg.innerHTML = `
        <polyline fill="none" stroke="hsl(198 88% 63%)" stroke-width="4" points="${{points}}" />
        <polyline fill="none" stroke="hsla(198 88% 63% / 0.18)" stroke-width="12" points="${{points}}" />
      `;
    }}
    function render(data) {{
      renderStats(data.summary || {{}});
      renderRoutes(data.active_routes || []);
      renderList('queue', data.automation_queue || [], 'No queued automation work.', (item) => `
        <div class="row">
          <div>
            <div><strong>${{esc(item.agent_name)}}</strong></div>
            <div class="mini">${{esc(item.reason || 'queued')}} · ${{esc(item.fixture_path || '')}}</div>
          </div>
          <span class="tag warn">${{esc(item.status || 'queued')}}</span>
        </div>
      `);
      renderList('gaps', data.coverage_gaps || [], 'No fixture coverage gaps.', (item) => `
        <div class="row">
          <div>
            <div><strong>${{esc(item.target_name)}}</strong></div>
            <div class="mini">${{esc(item.role)}} / ${{esc(item.task_type)}}</div>
          </div>
          <span class="tag danger">missing fixture</span>
        </div>
      `);
      renderList('demotions', data.demotions || [], 'No active regressions.', (item) => `
        <div class="row">
          <div>
            <div><strong>${{esc(item.agent_name)}}</strong></div>
            <div class="mini">${{esc(item.role)}} · ${{esc(item.last_evaluation?.recommendation || 'unknown')}}</div>
          </div>
          <span class="tag danger">demoted</span>
        </div>
      `);
      renderRuns(data.recent_runs || []);
      document.getElementById('updated').textContent = `Updated: ${{data.generated_at || data.registry_updated_at || 'unknown'}}`;
      document.getElementById('lineage').textContent = `Lineage: ${{data.lineage?.nodes || 0}} nodes / ${{data.lineage?.edges || 0}} edges`;
    }}
    async function tick() {{
      const data = await loadData();
      render(data);
    }}
    tick();
    setInterval(tick, 3000);
  </script>
</body>
</html>
"""


def build_dashboard_payload(root: Path) -> dict:
    report = build_report(root)
    lineage = build_lineage(root)
    report["generated_at"] = report.get("registry_updated_at")
    report["lineage"] = {"nodes": len(lineage.get("nodes", [])), "edges": len(lineage.get("edges", []))}
    report["lineage_graph"] = lineage
    return report


def write_dashboard(root: Path) -> dict:
    dynos_dir = root / ".dynos"
    dynos_dir.mkdir(parents=True, exist_ok=True)
    payload = build_dashboard_payload(root)
    data_path = dynos_dir / "dashboard-data.json"
    html_path = dynos_dir / "dashboard.html"
    data_path.write_text(json.dumps(payload, indent=2) + "\n")
    html = HTML_TEMPLATE.replace("__EMBEDDED_DATA__", json.dumps(payload))
    html_path.write_text(html)
    return {
        "html_path": str(html_path),
        "data_path": str(data_path),
        "summary": payload.get("summary", {}),
    }


def cmd_generate(args: argparse.Namespace) -> int:
    result = write_dashboard(Path(args.root).resolve())
    print(json.dumps(result, indent=2))
    return 0


def cmd_serve(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    write_dashboard(root)
    os.chdir(root / ".dynos")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), SimpleHTTPRequestHandler)
    print(json.dumps({"url": f"http://127.0.0.1:{args.port}/dashboard.html"}, indent=2))
    server.serve_forever()
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    generate = subparsers.add_parser("generate", help="Generate dashboard HTML and live JSON")
    generate.add_argument("--root", default=".")
    generate.set_defaults(func=cmd_generate)
    serve = subparsers.add_parser("serve", help="Serve live dashboard locally with refreshable JSON")
    serve.add_argument("--root", default=".")
    serve.add_argument("--port", type=int, default=8765)
    serve.set_defaults(func=cmd_serve)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
