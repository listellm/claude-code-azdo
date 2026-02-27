#!/usr/bin/env node

import * as tl from "azure-pipelines-task-lib/task";
import { preparePrompt } from "./prepare-prompt";
import { runClaudeAzure } from "./azure-run-claude";
import { setupAzureEnvironment } from "./azure-setup";
import { setupClaudeCodeSettings } from "./setup-claude-code-settings";
import { validateEnvironmentVariablesAzure } from "./azure-validate-env";
import { postPrReviewComments } from "./azure-pr-comment";
import { PR_ISSUES_INSTRUCTION } from "./pr-comment-core";
import {
  buildReviewerSystemPrompt,
  type ReviewerTypeKey,
} from "./reviewer-types";

/**
 * Builds a PR context preamble from AzDo pipeline variables.
 * Returns an empty string when not running in a PR context, or when
 * prompt_file is used (caller controls the file content).
 */
function buildPrPreamble(usingPromptFile: boolean): string {
  if (usingPromptFile) return "";

  const prId = tl.getVariable("System.PullRequest.PullRequestId");
  if (!prId) return "";

  const repoName = tl.getVariable("Build.Repository.Name") ?? "";
  const prTitle = tl.getVariable("System.PullRequest.PullRequestTitle") ?? "";
  const sourceBranch =
    tl.getVariable("System.PullRequest.SourceBranchName") ?? "";
  const targetBranch =
    tl.getVariable("System.PullRequest.TargetBranchName") ?? "";

  const lines: string[] = ["Pipeline context:"];
  if (repoName) lines.push(`Repository: ${repoName}`);
  if (prTitle) lines.push(`PR: ${prTitle}`);
  if (sourceBranch || targetBranch) {
    lines.push(`Source branch: ${sourceBranch} → Target: ${targetBranch}`);
  }

  if (targetBranch) {
    lines.push(
      "",
      "Steps:",
      `1. Run: git fetch origin ${targetBranch} 2>/dev/null || true`,
      `2. Run: git diff origin/${targetBranch}...HEAD to see all changes`,
    );
  }

  return lines.join("\n") + "\n\n";
}

async function run(): Promise<void> {
  try {
    await setupAzureEnvironment();
    validateEnvironmentVariablesAzure();
    await setupClaudeCodeSettings();

    let rawPrompt = tl.getInput("prompt", false) ?? "";
    const promptFile = tl.getInput("prompt_file", false) ?? "";
    const preamble = buildPrPreamble(!!promptFile);

    const enabledReviewers: ReviewerTypeKey[] = [];
    if (tl.getBoolInput("reviewer_terraform", false))
      enabledReviewers.push("terraform");
    if (tl.getBoolInput("reviewer_yaml", false)) enabledReviewers.push("yaml");
    const reviewerSystemPrompt = buildReviewerSystemPrompt(enabledReviewers);

    if (enabledReviewers.length > 0 && rawPrompt === "" && promptFile === "") {
      rawPrompt = "Perform the review.";
    }

    const promptConfig = await preparePrompt({
      prompt: preamble + rawPrompt,
      promptFile,
    });

    const postPrComments = tl.getBoolInput("post_pr_comments", false);
    const userAppendSystemPrompt =
      tl.getInput("append_system_prompt", false) ?? undefined;

    const appendSystemPrompt =
      [
        reviewerSystemPrompt,
        userAppendSystemPrompt,
        postPrComments ? PR_ISSUES_INSTRUCTION : "",
      ]
        .filter(Boolean)
        .join("\n\n") || undefined;

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
