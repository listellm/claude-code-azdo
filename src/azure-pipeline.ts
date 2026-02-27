#!/usr/bin/env node

import * as tl from "azure-pipelines-task-lib/task";
import { preparePrompt } from "./prepare-prompt";
import { runClaudeAzure } from "./azure-run-claude";
import { setupAzureEnvironment } from "./azure-setup";
import { setupClaudeCodeSettings } from "./setup-claude-code-settings";
import { validateEnvironmentVariablesAzure } from "./azure-validate-env";

async function run(): Promise<void> {
  try {
    await setupAzureEnvironment();
    validateEnvironmentVariablesAzure();
    await setupClaudeCodeSettings();

    const promptConfig = await preparePrompt({
      prompt: tl.getInput("prompt", false) ?? "",
      promptFile: tl.getInput("prompt_file", false) ?? "",
    });

    await runClaudeAzure(promptConfig.path, {
      allowedTools: tl.getInput("allowed_tools", false) ?? undefined,
      disallowedTools: tl.getInput("disallowed_tools", false) ?? undefined,
      maxTurns: tl.getInput("max_turns", false) ?? undefined,
      mcpConfig: tl.getInput("mcp_config", false) ?? undefined,
      systemPrompt: tl.getInput("system_prompt", false) ?? undefined,
      appendSystemPrompt:
        tl.getInput("append_system_prompt", false) ?? undefined,
      claudeEnv: tl.getInput("claude_env", false) ?? undefined,
      fallbackModel: tl.getInput("fallback_model", false) ?? undefined,
      timeoutMinutes: tl.getInput("timeout_minutes", false) ?? undefined,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    tl.setResult(
      tl.TaskResult.Failed,
      `Task failed with error: ${errorMessage}`,
    );
    tl.setVariable("conclusion", "failure");
    process.exit(1);
  }
}

run();
