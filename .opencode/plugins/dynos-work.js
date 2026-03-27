import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.resolve(__dirname, '../../skills');

const BOOTSTRAP = `<EXTREMELY_IMPORTANT>
dynos-work is installed and active.

To start any task: invoke dynos-work:start with your task description.

Core guarantee: No task is complete until independent auditors verify it with evidence.
Agent self-reports of completion are untrusted.

Power-user commands:
- dynos-work:audit — trigger audit on existing work
- dynos-work:status — show current task state
- dynos-work:repair — manually trigger repair on a finding
- dynos-work:resume — resume an interrupted task
</EXTREMELY_IMPORTANT>`;

export const DynosWorkPlugin = async ({ client, directory }) => {
  return {
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      if (!config.skills.paths.includes(skillsDir)) {
        config.skills.paths.push(skillsDir);
      }
    },
    'experimental.chat.system.transform': async (_input, output) => {
      (output.system ||= []).push(BOOTSTRAP);
    }
  };
};
