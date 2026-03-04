import * as https from "https";
import { readResultEntry } from "./execution-file";

export const ACCEPT_KEYWORD = "#accept";

export const THREAD_STATUS = {
  ACTIVE: 1,
  FIXED: 2,
  WONT_FIX: 3,
  CLOSED: 4,
} as const;

export const REVIEWER_VOTE = {
  APPROVED: 10,
  WAITING_FOR_AUTHOR: -5,
  NO_VOTE: 0,
} as const;

export interface PrConfig {
  collectionUri: string;
  project: string;
  repoId: string;
  prId: string;
  accessToken: string;
}

export interface ReviewIssue {
  severity: "CRITICAL" | "WARNING" | "SUGGESTION";
  file?: string;
  line?: number;
  description: string;
}

/**
 * Appended to appendSystemPrompt when post_pr_comments is enabled.
 * Instructs Claude to emit a terminal JSON block of ReviewIssue[].
 * If no issues are found, emit [].
 */
export const PR_ISSUES_INSTRUCTION = `
After completing your review, you MUST end your response with a fenced JSON block containing all issues found.
The block must be the very last thing in your response, using exactly this format:

\`\`\`json
[
  {
    "severity": "CRITICAL" | "WARNING" | "SUGGESTION",
    "file": "path/to/file.tf",
    "line": 42,
    "description": "Clear description of the issue"
  }
]
\`\`\`

Rules:
- "file" and "line" are optional — only include when the issue maps to a specific location
- If no issues are found, emit an empty array: []
- Do not include any text after the closing \`\`\`
- If a line contains a \`claude-ignore\` annotation in a code comment (any syntax: \`// claude-ignore\`, \`# claude-ignore\`, \`<!-- claude-ignore -->\`, \`-- claude-ignore\`, \`/* claude-ignore */\` etc.), do not include any issue for that line in the JSON output.
`.trim();

export const REVIEW_ATTRIBUTION = "🤖 **Claude Code CI Review**";

const REVIEW_HELP_FILE =
  "---\n💡 Reply `#accept` to suppress all issues on this file in future runs · reply `#fixed` when you've addressed the issue — Claude will verify and resolve the thread · add `# claude-ignore` (or language equivalent) to the line to suppress permanently.";

const REVIEW_HELP_GENERAL =
  "---\n💡 Reply `#accept` to suppress this on future runs · reply `#fixed` when you've addressed the issue — Claude will verify and resolve the thread.";

const SEVERITY_RANK: Record<string, number> = {
  SUGGESTION: 1,
  WARNING: 2,
  CRITICAL: 3,
};

/**
 * Reads the execution JSON array, finds the result entry, and parses
 * the terminal JSON block from the result text.
 * Returns [] if not found, malformed, or empty.
 * Only returns issues at or above minimumSeverity rank.
 */
export async function extractIssues(
  executionFile: string,
  minimumSeverity: string = "WARNING",
): Promise<ReviewIssue[]> {
  const resultEntry = await readResultEntry(executionFile);
  if (!resultEntry) {
    return [];
  }

  if (typeof resultEntry["result"] !== "string") {
    return [];
  }
  const resultText: string = resultEntry["result"];

  // Find the last ```json ... ``` block in the result text
  const jsonBlockPattern = /```json\s*([\s\S]*?)\s*```/g;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;

  while ((match = jsonBlockPattern.exec(resultText)) !== null) {
    lastMatch = match;
  }

  const jsonBlock = lastMatch?.[1];
  if (!jsonBlock) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonBlock);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const minimumRank =
    SEVERITY_RANK[minimumSeverity] ?? SEVERITY_RANK["WARNING"]!;
  return parsed
    .filter(isReviewIssue)
    .filter((issue) => (SEVERITY_RANK[issue.severity] ?? 0) >= minimumRank);
}

function isReviewIssue(value: unknown): value is ReviewIssue {
  if (typeof value !== "object" || value === null) return false;

  const obj = value as Record<string, unknown>;

  const severity = obj["severity"];
  if (typeof severity !== "string") return false;
  if (!["CRITICAL", "WARNING", "SUGGESTION"].includes(severity)) return false;
  if (typeof obj["description"] !== "string") return false;
  if (obj["file"] !== undefined && typeof obj["file"] !== "string")
    return false;
  if (obj["line"] !== undefined && typeof obj["line"] !== "number")
    return false;

  return true;
}

export type RequestFn = typeof https.request;

/**
 * Posts a single review issue as an ADO PR thread.
 * Uses inline threadContext when file + line are present.
 * @param requestFn - Injected for testing; defaults to https.request
 */
export function postIssueThread(
  config: PrConfig,
  issue: ReviewIssue,
  requestFn: RequestFn = https.request,
): Promise<number> {
  const org = config.collectionUri.replace(/\/$/, "");
  const url = `${org}/${encodeURIComponent(config.project)}/_apis/git/repositories/${encodeURIComponent(config.repoId)}/pullRequests/${encodeURIComponent(config.prId)}/threads?api-version=7.1`;

  const severityLabel = `[${issue.severity}]`;

  const thread: Record<string, unknown> = {
    comments: [
      {
        parentCommentId: 0,
        content: `${REVIEW_ATTRIBUTION} | ${severityLabel}\n\n${issue.description}\n\n${issue.file ? REVIEW_HELP_FILE : REVIEW_HELP_GENERAL}`,
        commentType: 1,
      },
    ],
    status: THREAD_STATUS.ACTIVE,
  };

  if (issue.file && issue.line !== undefined) {
    thread["threadContext"] = {
      filePath: issue.file.startsWith("/") ? issue.file : `/${issue.file}`,
      rightFileStart: { line: issue.line, offset: 1 },
      rightFileEnd: { line: issue.line, offset: 1 },
    };
  }

  const body = JSON.stringify(thread);
  const token = Buffer.from(`:${config.accessToken}`).toString("base64");
  const parsedUrl = new URL(url);

  return new Promise<number>((resolve, reject) => {
    const req = requestFn(
      {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Authorization: `Basic ${token}`,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(data) as { id?: number };
              resolve(parsed.id ?? 0);
            } catch {
              resolve(0);
            }
          } else {
            reject(
              new Error(
                `ADO API returned ${res.statusCode}: ${data.slice(0, 200)}`,
              ),
            );
          }
        });
      },
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export function normalizeFilePath(p: string): string {
  return p.startsWith("/") ? p.slice(1) : p;
}

export interface ThreadComment {
  id?: number;
  content?: string;
  author?: { displayName?: string; id?: string };
  commentType?: number;
}

export interface PrThread {
  id?: number;
  status?: number;
  threadContext?: { filePath?: string };
  comments?: ThreadComment[];
}

export interface ThreadListResponse {
  value: PrThread[];
}

/**
 * GETs all threads on the PR.
 * Non-throwing — returns empty array on any error.
 */
export async function fetchThreads(
  config: PrConfig,
  requestFn: RequestFn = https.request,
): Promise<PrThread[]> {
  const org = config.collectionUri.replace(/\/$/, "");
  const url = `${org}/${encodeURIComponent(config.project)}/_apis/git/repositories/${encodeURIComponent(config.repoId)}/pullRequests/${encodeURIComponent(config.prId)}/threads?api-version=7.1`;
  const token = Buffer.from(`:${config.accessToken}`).toString("base64");
  const parsedUrl = new URL(url);

  return new Promise<PrThread[]>((resolve) => {
    const req = requestFn(
      {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "GET",
        headers: {
          Authorization: `Basic ${token}`,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data) as ThreadListResponse;
            resolve(parsed.value ?? []);
          } catch {
            console.warn("fetchThreads: failed to parse thread list response");
            resolve([]);
          }
        });
      },
    );

    req.on("error", (err: Error) => {
      console.warn(`fetchThreads: request failed — ${err.message}`);
      resolve([]);
    });
    req.end();
  });
}

/**
 * GETs all threads on the PR and returns the set of file paths for which
 * any thread comment contains the ACCEPT_KEYWORD (case-insensitive, trimmed).
 * File paths are normalised (no leading slash).
 * An empty string ("") represents general (no-file) threads.
 * Non-throwing — returns empty Set on any error.
 */
export async function fetchAcceptedFiles(
  config: PrConfig,
  requestFn: RequestFn = https.request,
): Promise<Set<string>> {
  const threads = await fetchThreads(config, requestFn);
  const accepted = new Set<string>();
  for (const thread of threads) {
    const hasAccept = thread.comments?.some((c) =>
      c.content?.trim().toLowerCase().includes(ACCEPT_KEYWORD.toLowerCase()),
    );
    if (hasAccept) {
      accepted.add(normalizeFilePath(thread.threadContext?.filePath ?? ""));
    }
  }
  return accepted;
}

/**
 * PATCHes the status of a PR thread.
 * Status values: 1=active, 2=fixed, 3=wontFix, 4=closed.
 */
export function updateThreadStatus(
  config: PrConfig,
  threadId: number,
  status: number,
  requestFn: RequestFn = https.request,
): Promise<void> {
  const org = config.collectionUri.replace(/\/$/, "");
  const url = `${org}/${encodeURIComponent(config.project)}/_apis/git/repositories/${encodeURIComponent(config.repoId)}/pullRequests/${encodeURIComponent(config.prId)}/threads/${threadId}?api-version=7.1`;
  const body = JSON.stringify({ status });
  const token = Buffer.from(`:${config.accessToken}`).toString("base64");
  const parsedUrl = new URL(url);

  return new Promise<void>((resolve, reject) => {
    const req = requestFn(
      {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Authorization: `Basic ${token}`,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(
              new Error(
                `ADO API returned ${res.statusCode}: ${data.slice(0, 200)}`,
              ),
            );
          }
        });
      },
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * Posts a reply comment to an existing PR thread.
 */
export function replyToThread(
  config: PrConfig,
  threadId: number,
  content: string,
  requestFn: RequestFn = https.request,
): Promise<void> {
  const org = config.collectionUri.replace(/\/$/, "");
  const url = `${org}/${encodeURIComponent(config.project)}/_apis/git/repositories/${encodeURIComponent(config.repoId)}/pullRequests/${encodeURIComponent(config.prId)}/threads/${threadId}/comments?api-version=7.1`;
  const body = JSON.stringify({
    content,
    parentCommentId: 0,
    commentType: 1,
  });
  const token = Buffer.from(`:${config.accessToken}`).toString("base64");
  const parsedUrl = new URL(url);

  return new Promise<void>((resolve, reject) => {
    const req = requestFn(
      {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Authorization: `Basic ${token}`,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(
              new Error(
                `ADO API returned ${res.statusCode}: ${data.slice(0, 200)}`,
              ),
            );
          }
        });
      },
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * Fetches the authenticated user's identity GUID from ADO connection data.
 * Required to submit a reviewer vote for the current token identity.
 */
export function getCurrentUserId(
  config: PrConfig,
  requestFn: RequestFn = https.request,
): Promise<string> {
  const org = config.collectionUri.replace(/\/$/, "");
  const url = `${org}/_apis/connectionData`;
  const token = Buffer.from(`:${config.accessToken}`).toString("base64");
  const parsedUrl = new URL(url);

  return new Promise<string>((resolve, reject) => {
    const req = requestFn(
      {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "GET",
        headers: {
          Authorization: `Basic ${token}`,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data) as {
              authenticatedUser?: { id?: string };
            };
            const userId = parsed.authenticatedUser?.id;
            if (!userId) {
              reject(
                new Error(
                  "connectionData response missing authenticatedUser.id",
                ),
              );
            } else {
              resolve(userId);
            }
          } catch {
            reject(
              new Error(
                `Failed to parse connectionData response: ${data.slice(0, 200)}`,
              ),
            );
          }
        });
      },
    );

    req.on("error", reject);
    req.end();
  });
}

/**
 * Submits a reviewer vote on the pull request.
 * vote=10 → Approved, vote=-5 → Waiting for author
 * Requires "Code (Read & Write)" PAT scope.
 */
export async function approvePullRequest(
  config: PrConfig,
  vote: 10 | -5,
  requestFn: RequestFn = https.request,
): Promise<void> {
  const userId = await getCurrentUserId(config, requestFn);
  const org = config.collectionUri.replace(/\/$/, "");
  const url = `${org}/${encodeURIComponent(config.project)}/_apis/git/repositories/${encodeURIComponent(config.repoId)}/pullRequests/${encodeURIComponent(config.prId)}/reviewers/${encodeURIComponent(userId)}?api-version=7.1`;
  const body = JSON.stringify({ vote });
  const token = Buffer.from(`:${config.accessToken}`).toString("base64");
  const parsedUrl = new URL(url);

  return new Promise<void>((resolve, reject) => {
    const req = requestFn(
      {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Authorization: `Basic ${token}`,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(
              new Error(
                `ADO API returned ${res.statusCode}: ${data.slice(0, 200)}`,
              ),
            );
          }
        });
      },
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export function filterAcceptedIssues(
  issues: ReviewIssue[],
  acceptedFiles: Set<string>,
): ReviewIssue[] {
  return issues.filter(
    (issue) => !acceptedFiles.has(normalizeFilePath(issue.file ?? "")),
  );
}

/**
 * Returns a stable fingerprint string uniquely identifying an issue.
 * Used for deduplication across PR review runs.
 */
export function issueFingerprint(issue: ReviewIssue): string {
  return `${issue.severity}|${issue.file ?? ""}|${issue.line ?? ""}|${issue.description}`;
}

/**
 * Extracts the file segment from a fingerprint string.
 * Uses indexOf (not split) so descriptions containing "|" are handled safely.
 */
export function fingerprintFile(fingerprint: string): string {
  const firstPipe = fingerprint.indexOf("|");
  if (firstPipe === -1) return "";
  const secondPipe = fingerprint.indexOf("|", firstPipe + 1);
  if (secondPipe === -1) return "";
  return fingerprint.slice(firstPipe + 1, secondPipe);
}
