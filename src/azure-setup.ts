import * as tl from "azure-pipelines-task-lib/task";
import { exec } from "child_process";
import { promisify } from "util";
import * as os from "os";
import * as path from "path";

const execAsync = promisify(exec);

const NPM_GLOBAL_PREFIX = path.join(os.homedir(), ".npm-global");
const NPM_GLOBAL_BIN = path.join(NPM_GLOBAL_PREFIX, "bin");

export async function setupAzureEnvironment(): Promise<void> {
  const agentTempDirectory =
    tl.getVariable("Agent.TempDirectory") ?? os.tmpdir();
  const agentBuildDirectory =
    tl.getVariable("Agent.BuildDirectory") ?? process.cwd();

  process.env.RUNNER_TEMP = agentTempDirectory;
  process.env.CLAUDE_WORKING_DIR = agentBuildDirectory;

  console.log(`Azure Agent Temp Directory: ${agentTempDirectory}`);
  console.log(`Azure Agent Build Directory: ${agentBuildDirectory}`);

  const installCli = tl.getBoolInput("install_claude_cli", false);

  if (installCli) {
    process.env.PATH = `${NPM_GLOBAL_BIN}${path.delimiter}${process.env.PATH}`;
    try {
      await execAsync("claude --version");
      console.log("Claude Code is already installed");
    } catch {
      console.log("Installing Claude Code...");
      await execAsync(
        `npm install -g --prefix ${NPM_GLOBAL_PREFIX} @anthropic-ai/claude-code@2.1.62`,
      );
      console.log("Claude Code installed successfully");
    }
  } else {
    console.log("Skipping Claude Code CLI install (install_claude_cli=false)");
  }
}
