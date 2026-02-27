import * as tl from "azure-pipelines-task-lib/task";
import { exec } from "child_process";
import { promisify } from "util";
import * as os from "os";

const execAsync = promisify(exec);

export async function setupAzureEnvironment(): Promise<void> {
  const agentTempDirectory =
    tl.getVariable("Agent.TempDirectory") ?? os.tmpdir();
  const agentBuildDirectory =
    tl.getVariable("Agent.BuildDirectory") ?? process.cwd();

  process.env.RUNNER_TEMP = agentTempDirectory;
  process.env.CLAUDE_WORKING_DIR = agentBuildDirectory;

  console.log(`Azure Agent Temp Directory: ${agentTempDirectory}`);
  console.log(`Azure Agent Build Directory: ${agentBuildDirectory}`);

  try {
    await execAsync("claude --version");
    console.log("Claude Code is already installed");
  } catch {
    console.log("Installing Claude Code...");
    await execAsync("npm install -g @anthropic-ai/claude-code@2.1.62");
    console.log("Claude Code installed successfully");
  }
}
