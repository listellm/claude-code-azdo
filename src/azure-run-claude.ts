import * as tl from "azure-pipelines-task-lib/task";
import * as os from "os";
import { runClaude, type ClaudeOptions, type RunResult } from "./run-claude";

export type { RunResult };

/**
 * Azure DevOps adapter for runClaude.
 * Reads provider credentials from task inputs, delegates execution to the
 * shared run-claude core, then sets AzDo output variables.
 * setResult and process.exit are the caller's responsibility.
 */
export async function runClaudeAzure(
  promptPath: string,
  options: ClaudeOptions,
): Promise<RunResult> {
  const tmpDir = tl.getVariable("Agent.TempDirectory") ?? os.tmpdir();

  const extraEnv: Record<string, string> = {
    CLAUDE_CODE_AZURE_TASK: "1",
    ANTHROPIC_MODEL: tl.getInput("model", false) ?? "",
    ANTHROPIC_API_KEY:
      tl.getInput("anthropic_api_key", false) ??
      tl.getVariable("ANTHROPIC_API_KEY") ??
      "",
    CLAUDE_CODE_OAUTH_TOKEN:
      tl.getInput("claude_code_oauth_token", false) ?? "",
    CLAUDE_CODE_USE_BEDROCK: tl.getBoolInput("use_bedrock", false) ? "1" : "",
    CLAUDE_CODE_USE_VERTEX: tl.getBoolInput("use_vertex", false) ? "1" : "",
    AWS_REGION:
      tl.getInput("aws_region", false) ?? tl.getVariable("AWS_REGION") ?? "",
    ANTHROPIC_VERTEX_PROJECT_ID: tl.getInput("gcp_project_id", false) ?? "",
    CLOUD_ML_REGION: tl.getInput("gcp_region", false) ?? "",
  };

  const result = await runClaude(promptPath, options, { extraEnv, tmpDir });

  tl.setVariable("conclusion", result.conclusion);

  if (result.executionFile) {
    tl.setVariable("execution_file", result.executionFile);
  }

  return result;
}
