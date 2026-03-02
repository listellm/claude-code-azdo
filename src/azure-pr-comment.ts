import * as tl from "azure-pipelines-task-lib/task";
import {
  approvePullRequest,
  extractIssues,
  filterAcceptedIssues,
  issueFingerprint,
  postIssueThread,
  REVIEW_ATTRIBUTION,
  REVIEWER_VOTE,
  replyToThread,
  THREAD_STATUS,
  updateThreadStatus,
  type PrConfig,
  type ReviewIssue,
} from "./pr-comment-core";

export { REVIEWER_VOTE } from "./pr-comment-core";

export interface PostResult {
  posted: ReviewIssue[];
  threadMap: Record<string, number>;
}

/**
 * Azure DevOps adapter for posting PR review comments.
 * Reads AzDo pipeline variables, extracts issues from the execution file,
 * and posts one thread per issue. Non-throwing — a failed comment post does
 * not fail the pipeline task.
 *
 * @param acceptedFiles - Set of file paths where #accept has been issued.
 *   When provided, issues on these files are suppressed. When omitted,
 *   no file-level suppression is applied (caller is responsible).
 * @param postedFingerprints - Optional set of fingerprints already posted in
 *   previous runs. Issues matching these fingerprints are skipped.
 * @returns The issues that were actually posted and a map of fingerprint → thread ID.
 */
export async function postPrReviewComments(
  executionFile: string,
  accessToken: string,
  minimumSeverity: string = "WARNING",
  postedFingerprints?: Set<string>,
  acceptedFiles?: Set<string>,
): Promise<PostResult> {
  const prId = tl.getVariable("System.PullRequest.PullRequestId");
  if (!prId) {
    console.log("Not a PR run — skipping comment post");
    return { posted: [], threadMap: {} };
  }

  const collectionUri = tl.getVariable("System.CollectionUri");
  const project = tl.getVariable("System.TeamProject");
  const repoId = tl.getVariable("Build.Repository.ID");

  if (!collectionUri || !project || !repoId || !accessToken) {
    console.log(
      "Missing required pipeline variables for PR comment posting — skipping",
    );
    return { posted: [], threadMap: {} };
  }

  const config: PrConfig = {
    collectionUri,
    project,
    repoId,
    prId,
    accessToken,
  };

  const issues = await extractIssues(executionFile, minimumSeverity);
  const acceptedFiltered = acceptedFiles
    ? filterAcceptedIssues(issues, acceptedFiles)
    : issues;

  if (acceptedFiltered.length < issues.length) {
    console.log(
      `Suppressed ${issues.length - acceptedFiltered.length} issue(s) on accepted file(s)`,
    );
  }

  const deduped =
    postedFingerprints && postedFingerprints.size > 0
      ? acceptedFiltered.filter(
          (issue) => !postedFingerprints.has(issueFingerprint(issue)),
        )
      : acceptedFiltered;

  if (deduped.length < acceptedFiltered.length) {
    console.log(
      `Suppressed ${acceptedFiltered.length - deduped.length} issue(s) already posted in a previous run`,
    );
  }

  if (deduped.length === 0) {
    console.log("No issues to post — skipping comment post");
    return { posted: [], threadMap: {} };
  }

  console.log(`Posting ${deduped.length} review comment(s) to PR #${prId}`);

  const posted: ReviewIssue[] = [];
  const threadMap: Record<string, number> = {};

  for (const issue of deduped) {
    try {
      const threadId = await postIssueThread(config, issue);
      const fp = issueFingerprint(issue);
      threadMap[fp] = threadId;
      const location = issue.file
        ? `${issue.file}${issue.line !== undefined ? `:${issue.line}` : ""}`
        : "general";
      console.log(`  Posted [${issue.severity}] thread at ${location}`);
      posted.push(issue);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  Failed to post [${issue.severity}] thread: ${message}`);
    }
  }

  return { posted, threadMap };
}

/**
 * Verifies whether issues marked as #fixed have actually been resolved.
 *
 * For each fingerprint in pendingVerification:
 * - If no matching issue exists in newIssues → verified fixed:
 *   post "Verified fixed" reply + PATCH status=2 (fixed)
 * - If a matching issue still exists → not fixed:
 *   post "Issue still detected" reply
 *
 * Non-throwing — logs warnings on individual failures.
 *
 * @returns verified (fingerprints confirmed fixed) and stillPresent (fingerprints not fixed)
 */
export async function verifyFixedIssues(
  accessToken: string,
  pendingVerification: string[],
  threadMap: Record<string, number>,
  newIssues: ReviewIssue[],
): Promise<{ verified: string[]; stillPresent: string[] }> {
  const prId = tl.getVariable("System.PullRequest.PullRequestId");
  const collectionUri = tl.getVariable("System.CollectionUri");
  const project = tl.getVariable("System.TeamProject");
  const repoId = tl.getVariable("Build.Repository.ID");

  if (!prId || !collectionUri || !project || !repoId || !accessToken) {
    return { verified: [], stillPresent: [] };
  }

  const config: PrConfig = {
    collectionUri,
    project,
    repoId,
    prId,
    accessToken,
  };

  const newFingerprints = new Set(newIssues.map(issueFingerprint));
  const verified: string[] = [];
  const stillPresent: string[] = [];

  for (const fp of pendingVerification) {
    const threadId = threadMap[fp];
    if (!threadId) {
      // No thread ID — cannot act on this fingerprint, skip
      continue;
    }

    const issueStillExists = newFingerprints.has(fp);

    try {
      if (issueStillExists) {
        await replyToThread(
          config,
          threadId,
          `${REVIEW_ATTRIBUTION}\n\n⚠️ Issue still detected after changes.`,
        );
        stillPresent.push(fp);
        console.log(`  Thread ${threadId}: issue still present after changes`);
      } else {
        await replyToThread(
          config,
          threadId,
          `${REVIEW_ATTRIBUTION}\n\n✅ Verified fixed.`,
        );
        await updateThreadStatus(config, threadId, THREAD_STATUS.FIXED);
        verified.push(fp);
        console.log(`  Thread ${threadId}: verified fixed — resolved`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  Failed to verify thread ${threadId}: ${message}`);
    }
  }

  return { verified, stillPresent };
}

/**
 * Submits a reviewer vote on the current PR.
 * Non-throwing — logs a warning on failure.
 *
 * @param accessToken - PAT or System.AccessToken; must have Code (Read & Write) scope for votes.
 * @param vote - REVIEWER_VOTE.APPROVED (10) or REVIEWER_VOTE.WAITING_FOR_AUTHOR (-5).
 */
export async function votePr(
  accessToken: string,
  vote: 10 | -5,
): Promise<void> {
  const prId = tl.getVariable("System.PullRequest.PullRequestId");
  if (!prId) {
    console.log("Not a PR run — skipping reviewer vote");
    return;
  }

  const collectionUri = tl.getVariable("System.CollectionUri");
  const project = tl.getVariable("System.TeamProject");
  const repoId = tl.getVariable("Build.Repository.ID");

  if (!collectionUri || !project || !repoId || !accessToken) {
    console.warn(
      "Missing required pipeline variables for reviewer vote — skipping",
    );
    return;
  }

  const config: PrConfig = {
    collectionUri,
    project,
    repoId,
    prId,
    accessToken,
  };

  try {
    await approvePullRequest(config, vote);
    if (vote === REVIEWER_VOTE.APPROVED) {
      console.log(`Approved PR #${prId}`);
    } else {
      console.log(`Set PR #${prId} to waiting for author`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to submit reviewer vote for PR #${prId}: ${message}`);
  }
}
