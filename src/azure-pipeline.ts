#!/usr/bin/env node

import * as tl from "azure-pipelines-task-lib/task";
import { preparePrompt } from "./prepare-prompt";
import { runClaudeAzure } from "./azure-run-claude";
import { setupAzureEnvironment } from "./azure-setup";
import { setupClaudeCodeSettings } from "./setup-claude-code-settings";
import { validateEnvironmentVariablesAzure } from "./azure-validate-env";
import { postPrReviewComments } from "./azure-pr-comment";
import { PR_ISSUES_INSTRUCTION } from "./pr-comment-core";

async function run(): Promise<void> {
  try {
    await setupAzureEnvironment();
    validateEnvironmentVariablesAzure();
    await setupClaudeCodeSettings();

    const promptConfig = await preparePrompt({
      prompt: tl.getInput("prompt", false) ?? "",
      promptFile: tl.getInput("prompt_file", false) ?? "",
    });

    const postPrComments = tl.getBoolInput("post_pr_comments", false);
    const userAppendSystemPrompt =
      tl.getInput("append_system_prompt", false) ?? undefined;

    const appendSystemPrompt = postPrComments
      ? [userAppendSystemPrompt, PR_ISSUES_INSTRUCTION]
          .filter(Boolean)
          .join("\n\n")
      : userAppendSystemPrompt;

    const result = await runClaudeAzure(promptConfig.path, {
      allowedTools: tl.getInput("allowed_tools", false) ?? undefined,
      disallowedTools: tl.getInput("disallowed_tools", false) ?? undefined,
      maxTurns: tl.getInput("max_turns", false) ?? undefined,
      mcpConfig: tl.getInput("mcp_config", false) ?? undefined,
      systemPrompt: tl.getInput("system_prompt", false) ?? undefined,
      appendSystemPrompt,
      claudeEnv: tl.getInput("claude_env", false) ?? undefined,
      fallbackModel: tl.getInput("fallback_model", false) ?? undefined,
      timeoutMinutes: tl.getInput("timeout_minutes", false) ?? undefined,
    });

    if (postPrComments && result.executionFile) {
      await postPrReviewComments(result.executionFile);
    }

    if (result.conclusion === "success") {
      tl.setResult(
        tl.TaskResult.Succeeded,
        "Claude Code executed successfully",
      );
    } else {
      tl.setResult(
        tl.TaskResult.Failed,
        `Claude Code failed with exit code: ${result.exitCode}`,
      );
      process.exit(result.exitCode);
    }
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
