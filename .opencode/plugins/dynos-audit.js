import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.resolve(__dirname, '../../skills');

const BOOTSTRAP = `<EXTREMELY_IMPORTANT>
dynos-audit is installed and active.

MANDATORY AUDIT RULES:

1. After brainstorming completes → invoke dynos-audit:spec-auditor
2. After writing-plans completes → invoke dynos-audit:spec-auditor
3. After each task in subagent-driven-development → invoke dynos-audit:audit-router
4. Before invoking finishing-a-development-branch → invoke dynos-audit:spec-auditor

dynos-audit:audit-router inspects files touched (git diff --name-only) and dispatches:
- UI files only (.tsx .jsx .css .html .vue .svelte) → spec-auditor + ui-auditor
- Logic files only (.ts .js .py .go .rs .java) → spec-auditor + code-quality-auditor
- Mixed → all three auditors

DO NOT claim any phase complete until the relevant auditors pass.
DO NOT skip audit because the work seems done.
DO NOT proceed to the next phase while any auditor has open gaps.
</EXTREMELY_IMPORTANT>`;

export const DynosAuditPlugin = async ({ client, directory }) => {
  return {
    // Register skills directory so OpenCode discovers dynos-audit skills
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      if (!config.skills.paths.includes(skillsDir)) {
        config.skills.paths.push(skillsDir);
      }
    },

    // Inject audit bootstrap via system prompt transform
    'experimental.chat.system.transform': async (_input, output) => {
      (output.system ||= []).push(BOOTSTRAP);
    }
  };
};
