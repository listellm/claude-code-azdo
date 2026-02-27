import * as https from "https";
import { readFile } from "fs/promises";

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
`.trim();

/**
 * Reads the execution JSON array, finds the result entry, and parses
 * the terminal JSON block from the result text.
 * Returns [] if not found, malformed, or empty.
 */
export async function extractIssues(
  executionFile: string,
): Promise<ReviewIssue[]> {
  let raw: string;
  try {
    raw = await readFile(executionFile, "utf8");
  } catch {
    return [];
  }

  let entries: unknown[];
  try {
    entries = JSON.parse(raw) as unknown[];
  } catch {
    return [];
  }

  if (!Array.isArray(entries)) {
    return [];
  }

  const resultEntry = entries.find(
    (e): e is { type: string; result: string } =>
      typeof e === "object" &&
      e !== null &&
      (e as Record<string, unknown>)["type"] === "result" &&
      typeof (e as Record<string, unknown>)["result"] === "string",
  );

  if (!resultEntry) {
    return [];
  }

  const resultText: string = resultEntry.result;

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

  return parsed.filter(isReviewIssue);
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

type RequestFn = typeof https.request;

/**
 * Posts a single review issue as an ADO PR thread.
 * Uses inline threadContext when file + line are present.
 * @param requestFn - Injected for testing; defaults to https.request
 */
export function postIssueThread(
  config: PrConfig,
  issue: ReviewIssue,
  requestFn: RequestFn = https.request,
): Promise<void> {
  const org = config.collectionUri.replace(/\/$/, "");
  const url = `${org}/${encodeURIComponent(config.project)}/_apis/git/repositories/${encodeURIComponent(config.repoId)}/pullRequests/${config.prId}/threads?api-version=7.1`;

  const severityLabel = `[${issue.severity}]`;

  const thread: Record<string, unknown> = {
    comments: [
      {
        parentCommentId: 0,
        content: `${severityLabel} ${issue.description}`,
        commentType: 1,
      },
    ],
    status: 1, // active
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

  return new Promise((resolve, reject) => {
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
