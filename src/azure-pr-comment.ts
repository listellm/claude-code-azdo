import * as tl from "azure-pipelines-task-lib/task";
import {
  extractIssues,
  postIssueThread,
  type PrConfig,
} from "./pr-comment-core";

/**
 * Azure DevOps adapter for posting PR review comments.
 * Reads AzDo pipeline variables, extracts issues from the execution file,
 * and posts one thread per issue. Non-throwing — a failed comment post does
 * not fail the pipeline task.
 */
export async function postPrReviewComments(
  executionFile: string,
): Promise<void> {
  const prId = tl.getVariable("System.PullRequest.PullRequestId");
  if (!prId) {
    console.log("Not a PR run — skipping comment post");
    return;
  }

  const collectionUri = tl.getVariable("System.CollectionUri");
  const project = tl.getVariable("System.TeamProject");
  const repoId = tl.getVariable("Build.Repository.ID");
  const accessToken = tl.getVariable("System.AccessToken");

  if (!collectionUri || !project || !repoId || !accessToken) {
    console.log(
      "Missing required pipeline variables for PR comment posting — skipping",
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

  const issues = await extractIssues(executionFile);

  if (issues.length === 0) {
    console.log("No issues found — skipping comment post");
    return;
  }

  console.log(`Posting ${issues.length} review comment(s) to PR #${prId}`);

  for (const issue of issues) {
    try {
      await postIssueThread(config, issue);
      const location = issue.file
        ? `${issue.file}${issue.line !== undefined ? `:${issue.line}` : ""}`
        : "general";
      console.log(`  Posted [${issue.severity}] thread at ${location}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  Failed to post [${issue.severity}] thread: ${message}`);
    }
  }
}
