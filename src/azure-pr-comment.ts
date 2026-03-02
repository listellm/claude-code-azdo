import * as tl from "azure-pipelines-task-lib/task";
import {
  extractIssues,
  fetchAcceptedFiles,
  filterAcceptedIssues,
  issueFingerprint,
  postIssueThread,
  type PrConfig,
  type ReviewIssue,
} from "./pr-comment-core";

/**
 * Azure DevOps adapter for posting PR review comments.
 * Reads AzDo pipeline variables, extracts issues from the execution file,
 * and posts one thread per issue. Non-throwing — a failed comment post does
 * not fail the pipeline task.
 *
 * @param postedFingerprints - Optional set of fingerprints already posted in
 *   previous runs. Issues matching these fingerprints are skipped.
 * @returns The issues that were actually posted in this call.
 */
export async function postPrReviewComments(
  executionFile: string,
  minimumSeverity: string = "WARNING",
  postedFingerprints?: Set<string>,
): Promise<ReviewIssue[]> {
  const prId = tl.getVariable("System.PullRequest.PullRequestId");
  if (!prId) {
    console.log("Not a PR run — skipping comment post");
    return [];
  }

  const collectionUri = tl.getVariable("System.CollectionUri");
  const project = tl.getVariable("System.TeamProject");
  const repoId = tl.getVariable("Build.Repository.ID");
  const accessToken = tl.getVariable("System.AccessToken");

  if (!collectionUri || !project || !repoId || !accessToken) {
    console.log(
      "Missing required pipeline variables for PR comment posting — skipping",
    );
    return [];
  }

  const config: PrConfig = {
    collectionUri,
    project,
    repoId,
    prId,
    accessToken,
  };

  const accepted = await fetchAcceptedFiles(config);

  const issues = await extractIssues(executionFile, minimumSeverity);
  const acceptedFiltered = filterAcceptedIssues(issues, accepted);

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
    return [];
  }

  console.log(`Posting ${deduped.length} review comment(s) to PR #${prId}`);

  const posted: ReviewIssue[] = [];

  for (const issue of deduped) {
    try {
      await postIssueThread(config, issue);
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

  return posted;
}
