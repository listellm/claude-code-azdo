#!/usr/bin/env node

import * as tl from "azure-pipelines-task-lib/task";
import { preparePrompt } from "./prepare-prompt";
import { runClaudeAzure } from "./azure-run-claude";
import { setupAzureEnvironment } from "./azure-setup";
import { setupClaudeCodeSettings } from "./setup-claude-code-settings";
import { validateEnvironmentVariablesAzure } from "./azure-validate-env";
import {
  postPrReviewComments,
  REVIEWER_VOTE,
  verifyFixedIssues,
  votePr,
} from "./azure-pr-comment";
import {
  extractIssues,
  fetchThreads,
  fingerprintFile,
  PR_ISSUES_INSTRUCTION,
  REVIEW_ATTRIBUTION,
  type PrConfig,
} from "./pr-comment-core";
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
import {
  classifyThreadReplies,
  type ClassifierConfig,
} from "./thread-classifier";
import { buildContextPreamble } from "./context-dir";

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

/**
 * Inverts a fingerprint → threadId map to threadId → fingerprint.
 */
function invertThreadMap(
  threadMap: Record<string, number>,
): Map<number, string> {
  const inverted = new Map<number, string>();
  for (const [fp, threadId] of Object.entries(threadMap)) {
    inverted.set(threadId, fp);
  }
  return inverted;
}

async function run(): Promise<void> {
  try {
    await setupAzureEnvironment();
    validateEnvironmentVariablesAzure();
    await setupClaudeCodeSettings();

    let rawPrompt = tl.getInput("prompt", false) ?? "";
    const promptFile = tl.getInput("prompt_file", false) ?? "";
    const contextDir = tl.getInput("context_dir", false) ?? "";
    const preamble = buildPrPreamble(!!promptFile);

    const enabledReviewers: ReviewerTypeKey[] = [];
    if (tl.getBoolInput("reviewer_terraform", false))
      enabledReviewers.push("terraform");
    if (tl.getBoolInput("reviewer_yaml", false)) enabledReviewers.push("yaml");
    if (tl.getBoolInput("reviewer_helm", false)) enabledReviewers.push("helm");
    if (tl.getBoolInput("reviewer_cilium", false))
      enabledReviewers.push("cilium");
    if (tl.getBoolInput("reviewer_dockerfile", false))
      enabledReviewers.push("dockerfile");
    if (tl.getBoolInput("reviewer_dotnet_core", false))
      enabledReviewers.push("dotnet_core");
    if (tl.getBoolInput("reviewer_golang", false))
      enabledReviewers.push("golang");
    if (tl.getBoolInput("reviewer_java", false)) enabledReviewers.push("java");
    if (tl.getBoolInput("reviewer_javascript", false))
      enabledReviewers.push("javascript");
    if (tl.getBoolInput("reviewer_nextjs", false))
      enabledReviewers.push("nextjs");
    if (tl.getBoolInput("reviewer_php", false)) enabledReviewers.push("php");
    if (tl.getBoolInput("reviewer_powershell_core", false))
      enabledReviewers.push("powershell_core");
    if (tl.getBoolInput("reviewer_python", false))
      enabledReviewers.push("python");
    if (tl.getBoolInput("reviewer_rust", false)) enabledReviewers.push("rust");
    if (tl.getBoolInput("reviewer_sql", false)) enabledReviewers.push("sql");
    if (tl.getBoolInput("reviewer_typescript", false))
      enabledReviewers.push("typescript");
    const reviewerSystemPrompt = buildReviewerSystemPrompt(enabledReviewers);

    if (enabledReviewers.length > 0 && rawPrompt === "" && promptFile === "") {
      rawPrompt = "Perform the review.";
    }

    const postPrComments = tl.getBoolInput("post_pr_comments", false);
    const approvePrOnNoIssues = tl.getBoolInput(
      "approve_pr_on_no_issues",
      false,
    );
    const minimumSeverity = (
      tl.getInput("minimum_severity", false) ?? "WARNING"
    ).toUpperCase();
    const prCommentToken =
      tl.getInput("pr_review_token", false) ||
      tl.getVariable("System.AccessToken") ||
      "";
    const userAppendSystemPrompt =
      tl.getInput("append_system_prompt", false) ?? undefined;

    // --- Context directory injection (into system prompt) ---
    const contextResult = await buildContextPreamble(contextDir);
    if (contextResult.content) {
      console.log(
        `context_dir: injected ${contextResult.fileCount} file(s) (${contextResult.totalBytes.toLocaleString()} bytes) from '${contextDir}'`,
      );
    }

    const appendSystemPrompt =
      [
        reviewerSystemPrompt,
        contextResult.content,
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

    // --- Thread classification (reply intent detection) ---
    const classificationModel =
      tl.getInput("reply_classification_model", false) || modelId;
    const anthropicApiKey = tl.getInput("anthropic_api_key", false) ?? "";
    const useBedrock = tl.getBoolInput("use_bedrock", false);
    const useVertex = tl.getBoolInput("use_vertex", false);
    const awsRegionInput = tl.getInput("aws_region", false) ?? "";
    const gcpProjectId = tl.getInput("gcp_project_id", false) ?? "";
    const gcpRegion = tl.getInput("gcp_region", false) ?? "";

    const classifierConfig: ClassifierConfig = {
      apiKey: anthropicApiKey,
      useBedrock,
      useVertex,
      awsRegion: awsRegionInput,
      gcpProjectId,
      gcpRegion,
      model: classificationModel,
    };

    let acceptedFiles = new Set<string>();
    let pendingVerification = [...(state?.pendingVerification ?? [])];
    let existingThreadMap = { ...(state?.threadMap ?? {}) };

    const repoId = tl.getVariable("Build.Repository.ID") ?? "";
    if (postPrComments && prId && collectionUri && project && repoId) {
      const prConfig: PrConfig = {
        collectionUri,
        project,
        repoId,
        prId,
        accessToken: prCommentToken,
      };

      // Fetch all threads and classify replies (Claude-originated only)
      // Dual check: commentType 1 (system/bot) + attribution content prevents spoofing
      const allThreads = await fetchThreads(prConfig);
      const threads = allThreads.filter((t) => {
        const root = t.comments?.[0];
        return (
          root?.commentType === 1 && root?.content?.includes(REVIEW_ATTRIBUTION)
        );
      });

      if (threads.length > 0) {
        const classifications = await classifyThreadReplies(
          threads,
          classifierConfig,
        );

        // Process #accept intents (file-level suppression)
        for (const c of classifications) {
          if (c.intent === "accept") {
            acceptedFiles.add(c.filePath);
          }
        }

        // Process #fixed intents
        const reverseThreadMap = invertThreadMap(existingThreadMap);
        for (const c of classifications) {
          if (c.intent === "fixed") {
            const fp = reverseThreadMap.get(c.threadId);
            if (fp && !pendingVerification.includes(fp)) {
              pendingVerification.push(fp);
            }
          }
        }

        if (acceptedFiles.size > 0) {
          console.log(
            `Thread classification: ${acceptedFiles.size} file(s) accepted`,
          );
        }
        const newFixed = classifications.filter(
          (c) => c.intent === "fixed",
        ).length;
        if (newFixed > 0) {
          console.log(
            `Thread classification: ${newFixed} thread(s) marked as fixed`,
          );
          if (!s3Config) {
            console.warn(
              "Warning: #fixed verification requires S3 state caching (s3_state_bucket). Fixed intents will not be verified without it.",
            );
          }
        }
      }
    }
    // --- end thread classification ---

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
    let newThreadMap: Record<string, number> = {};

    if (postPrComments && result.executionFile) {
      const postedFingerprints = state
        ? new Set(state.postedFingerprints)
        : undefined;
      const postResult = await postPrReviewComments(
        result.executionFile,
        prCommentToken,
        minimumSeverity,
        postedFingerprints,
        acceptedFiles.size > 0 ? acceptedFiles : undefined,
      );
      postedIssues = postResult.posted;
      newThreadMap = postResult.threadMap;

      if (approvePrOnNoIssues && prId) {
        if (postedIssues.length === 0) {
          await votePr(prCommentToken, REVIEWER_VOTE.APPROVED);
        } else {
          await votePr(prCommentToken, REVIEWER_VOTE.WAITING_FOR_AUTHOR);
        }
      }
    }

    // Merge thread maps (existing + newly posted)
    const mergedThreadMap = { ...existingThreadMap, ...newThreadMap };

    // Extract all issues once for both verification and S3 state
    const allNewIssues =
      postPrComments && result.executionFile
        ? await extractIssues(result.executionFile, "SUGGESTION")
        : [];

    // --- Verify fixed issues ---
    let verifiedFingerprints: string[] = [];
    let remainingPending: string[] = [];

    if (postPrComments && pendingVerification.length > 0 && allNewIssues) {
      // Only verify fingerprints whose files were actually re-reviewed (dirty)
      const dirtyFileSet = new Set(dirtyFiles);
      const canVerify: string[] = [];
      const deferVerification: string[] = [];

      for (const fp of pendingVerification) {
        const file = fingerprintFile(fp);
        if (file === "" || dirtyFileSet.has(file)) {
          canVerify.push(fp);
        } else {
          deferVerification.push(fp);
        }
      }

      if (canVerify.length > 0) {
        const { verified, stillPresent } = await verifyFixedIssues(
          prCommentToken,
          canVerify,
          mergedThreadMap,
          allNewIssues,
        );
        verifiedFingerprints = verified;

        // Still-present issues: remove from pending (they've been checked)
        const checkedSet = new Set([...verified, ...stillPresent]);
        remainingPending = [
          ...deferVerification,
          ...canVerify.filter((fp) => !checkedSet.has(fp)),
        ];
      } else {
        remainingPending = pendingVerification;
      }
    } else {
      remainingPending = pendingVerification;
    }
    // --- end verification ---

    // Write updated S3 state after run
    if (
      s3Config &&
      prId &&
      org &&
      project &&
      repoName &&
      result.executionFile
    ) {
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
        mergedThreadMap,
        verifiedFingerprints,
        remainingPending,
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
