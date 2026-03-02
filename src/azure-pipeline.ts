#!/usr/bin/env node

import * as tl from "azure-pipelines-task-lib/task";
import { preparePrompt } from "./prepare-prompt";
import { runClaudeAzure } from "./azure-run-claude";
import { setupAzureEnvironment } from "./azure-setup";
import { setupClaudeCodeSettings } from "./setup-claude-code-settings";
import { validateEnvironmentVariablesAzure } from "./azure-validate-env";
import { postPrReviewComments } from "./azure-pr-comment";
import { extractIssues, PR_ISSUES_INSTRUCTION } from "./pr-comment-core";
import {
  buildReviewerSystemPrompt,
  type ReviewerTypeKey,
} from "./reviewer-types";
import {
  buildCachePreamble,
  buildUpdatedState,
  computeDirtyFiles,
  hashPrompt,
  readPrState,
  writePrState,
  type PrState,
  type S3Config,
} from "./pr-state";

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

    const postPrComments = tl.getBoolInput("post_pr_comments", false);
    const minimumSeverity = (
      tl.getInput("minimum_severity", false) ?? "WARNING"
    ).toUpperCase();
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

    // --- S3 state caching (opt-in via s3_state_bucket) ---
    const s3StateBucket = tl.getInput("s3_state_bucket", false) ?? "";
    const s3StatePrefix =
      tl.getInput("s3_state_prefix", false) || "claude-pr-state";
    const prId = tl.getVariable("System.PullRequest.PullRequestId") ?? "";
    const collectionUri = tl.getVariable("System.CollectionUri") ?? "";
    const org = collectionUri.replace(/\/$/, "").split("/").pop() ?? "";
    const project = tl.getVariable("System.TeamProject") ?? "";
    const repoName = tl.getVariable("Build.Repository.Name") ?? "";
    const targetBranch =
      tl.getVariable("System.PullRequest.TargetBranchName") ?? "";
    const modelId = tl.getInput("model", false) || "claude-sonnet-4-6";

    let s3Config: S3Config | null = null;
    let state: PrState | null = null;
    let dirtyFiles: string[] = [];
    let fileHashes: Record<string, string> = {};
    let promptHashValue = "";
    let cachePreamble = "";

    if (s3StateBucket && prId && org && project && repoName) {
      const awsRegion =
        tl.getInput("aws_region", false) ??
        tl.getVariable("AWS_REGION") ??
        "us-east-1";

      s3Config = {
        bucket: s3StateBucket,
        prefix: s3StatePrefix,
        region: awsRegion,
      };

      state = await readPrState(s3Config, org, project, repoName, prId);
      promptHashValue = hashPrompt(appendSystemPrompt ?? "");

      const dirtyResult = await computeDirtyFiles(
        targetBranch,
        state,
        modelId,
        promptHashValue,
      );
      dirtyFiles = dirtyResult.dirtyFiles;
      fileHashes = dirtyResult.fileHashes;

      const allChangedFiles = Object.keys(fileHashes);
      cachePreamble = buildCachePreamble(dirtyFiles, allChangedFiles, state);

      if (cachePreamble) {
        console.log(
          `S3 cache: ${allChangedFiles.length - dirtyFiles.length} unchanged file(s), ${dirtyFiles.length} dirty`,
        );
      }
    }
    // --- end S3 state caching setup ---

    const promptConfig = await preparePrompt({
      prompt: preamble + cachePreamble + rawPrompt,
      promptFile,
    });

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

    let postedIssues: import("./pr-comment-core").ReviewIssue[] = [];

    if (postPrComments && result.executionFile) {
      const postedFingerprints = state
        ? new Set(state.postedFingerprints)
        : undefined;
      postedIssues = await postPrReviewComments(
        result.executionFile,
        minimumSeverity,
        postedFingerprints,
      );
    }

    // Write updated S3 state after run
    if (
      s3Config &&
      prId &&
      org &&
      project &&
      repoName &&
      result.executionFile
    ) {
      const allNewIssues = await extractIssues(
        result.executionFile,
        "SUGGESTION",
      );
      const updatedState = buildUpdatedState(
        state,
        prId,
        org,
        project,
        repoName,
        modelId,
        promptHashValue,
        fileHashes,
        dirtyFiles,
        allNewIssues,
        postedIssues,
      );
      await writePrState(s3Config, updatedState);
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
