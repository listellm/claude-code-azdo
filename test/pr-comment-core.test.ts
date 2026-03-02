import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFile, unlink } from "fs/promises";
import * as os from "os";
import * as path from "path";
import { EventEmitter } from "events";
import {
  ACCEPT_KEYWORD,
  approvePullRequest,
  extractIssues,
  fetchAcceptedFiles,
  fetchThreads,
  filterAcceptedIssues,
  fingerprintFile,
  getCurrentUserId,
  issueFingerprint,
  normalizeFilePath,
  postIssueThread,
  REVIEW_ATTRIBUTION,
  REVIEWER_VOTE,
  replyToThread,
  THREAD_STATUS,
  updateThreadStatus,
  type PrConfig,
  type RequestFn,
  type ReviewIssue,
} from "../src/pr-comment-core";

// ---------------------------------------------------------------------------
// ACCEPT_KEYWORD
// ---------------------------------------------------------------------------

test("ACCEPT_KEYWORD is #accept", () => {
  expect(ACCEPT_KEYWORD).toBe("#accept");
});

// ---------------------------------------------------------------------------
// THREAD_STATUS
// ---------------------------------------------------------------------------

describe("THREAD_STATUS", () => {
  test("has expected values", () => {
    expect(THREAD_STATUS.ACTIVE).toBe(1);
    expect(THREAD_STATUS.FIXED).toBe(2);
    expect(THREAD_STATUS.WONT_FIX).toBe(3);
    expect(THREAD_STATUS.CLOSED).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// REVIEW_ATTRIBUTION
// ---------------------------------------------------------------------------

test("REVIEW_ATTRIBUTION contains expected marker", () => {
  expect(REVIEW_ATTRIBUTION).toContain("Claude Code CI Review");
});

// ---------------------------------------------------------------------------
// fingerprintFile
// ---------------------------------------------------------------------------

describe("fingerprintFile", () => {
  test("extracts file from standard fingerprint", () => {
    const fp = issueFingerprint({
      severity: "WARNING",
      file: "modules/vpc/main.tf",
      line: 42,
      description: "Missing tag",
    });
    expect(fingerprintFile(fp)).toBe("modules/vpc/main.tf");
  });

  test("returns empty string for fingerprint with empty file", () => {
    const fp = issueFingerprint({
      severity: "CRITICAL",
      description: "General issue",
    });
    expect(fingerprintFile(fp)).toBe("");
  });

  test("returns empty string for malformed fingerprint (no pipes)", () => {
    expect(fingerprintFile("nopipes")).toBe("");
  });

  test("returns empty string for fingerprint with single pipe", () => {
    expect(fingerprintFile("one|pipe")).toBe("");
  });

  test("handles description containing pipes", () => {
    const fp = issueFingerprint({
      severity: "WARNING",
      file: "foo.tf",
      line: 10,
      description: "Use A | B | C pattern",
    });
    expect(fingerprintFile(fp)).toBe("foo.tf");
  });
});

// ---------------------------------------------------------------------------
// normalizeFilePath
// ---------------------------------------------------------------------------

describe("normalizeFilePath", () => {
  test("strips leading slash", () => {
    expect(normalizeFilePath("/foo/bar.tf")).toBe("foo/bar.tf");
  });

  test("returns unchanged when no leading slash", () => {
    expect(normalizeFilePath("foo/bar.tf")).toBe("foo/bar.tf");
  });

  test("returns empty string for empty input", () => {
    expect(normalizeFilePath("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// extractIssues
// ---------------------------------------------------------------------------

describe("extractIssues", () => {
  const tmpFile = path.join(os.tmpdir(), `pr-comment-test-${process.pid}.json`);

  afterEach(async () => {
    try {
      await unlink(tmpFile);
    } catch {
      // Ignore
    }
  });

  function buildExecutionJson(resultText: string): string {
    return JSON.stringify([
      { type: "assistant", content: "thinking..." },
      { type: "result", result: resultText },
    ]);
  }

  test("returns [] when file does not exist", async () => {
    const issues = await extractIssues("/nonexistent/path.json");
    expect(issues).toEqual([]);
  });

  test("returns [] when file is not valid JSON", async () => {
    await writeFile(tmpFile, "not json at all");
    const issues = await extractIssues(tmpFile);
    expect(issues).toEqual([]);
  });

  test("returns [] when no result entry is present", async () => {
    await writeFile(
      tmpFile,
      JSON.stringify([{ type: "assistant", content: "hello" }]),
    );
    const issues = await extractIssues(tmpFile);
    expect(issues).toEqual([]);
  });

  test("returns [] when result entry has no JSON block", async () => {
    await writeFile(
      tmpFile,
      buildExecutionJson("Looks good, no issues found."),
    );
    const issues = await extractIssues(tmpFile);
    expect(issues).toEqual([]);
  });

  test("returns [] when JSON block contains empty array", async () => {
    await writeFile(
      tmpFile,
      buildExecutionJson("All clear!\n\n```json\n[]\n```"),
    );
    const issues = await extractIssues(tmpFile);
    expect(issues).toEqual([]);
  });

  test("parses a single issue with file and line", async () => {
    const resultText = `Found one issue.

\`\`\`json
[
  {
    "severity": "CRITICAL",
    "file": "modules/vpc/main.tf",
    "line": 12,
    "description": "Missing required tag"
  }
]
\`\`\``;
    await writeFile(tmpFile, buildExecutionJson(resultText));
    const issues = await extractIssues(tmpFile);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      severity: "CRITICAL",
      file: "modules/vpc/main.tf",
      line: 12,
      description: "Missing required tag",
    });
  });

  test("parses multiple issues", async () => {
    const resultText = `\`\`\`json
[
  { "severity": "WARNING", "file": "main.tf", "line": 5, "description": "Hardcoded region" },
  { "severity": "SUGGESTION", "description": "Consider using a module" }
]
\`\`\``;
    await writeFile(tmpFile, buildExecutionJson(resultText));
    const issues = await extractIssues(tmpFile, "SUGGESTION");
    expect(issues).toHaveLength(2);
    expect(issues[0]?.severity).toBe("WARNING");
    expect(issues[1]?.severity).toBe("SUGGESTION");
    expect(issues[1]?.file).toBeUndefined();
  });

  test("uses the last JSON block when multiple are present", async () => {
    const resultText = `First block:
\`\`\`json
[{ "severity": "WARNING", "description": "old" }]
\`\`\`

Final block:
\`\`\`json
[{ "severity": "CRITICAL", "description": "new" }]
\`\`\``;
    await writeFile(tmpFile, buildExecutionJson(resultText));
    const issues = await extractIssues(tmpFile);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("CRITICAL");
    expect(issues[0]?.description).toBe("new");
  });

  test("filters out entries with invalid severity", async () => {
    const resultText = `\`\`\`json
[
  { "severity": "INVALID", "description": "bad entry" },
  { "severity": "WARNING", "description": "good entry" }
]
\`\`\``;
    await writeFile(tmpFile, buildExecutionJson(resultText));
    const issues = await extractIssues(tmpFile);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("WARNING");
  });

  test("returns [] when JSON block contains non-array", async () => {
    const resultText = `\`\`\`json\n{ "severity": "WARNING" }\n\`\`\``;
    await writeFile(tmpFile, buildExecutionJson(resultText));
    const issues = await extractIssues(tmpFile);
    expect(issues).toEqual([]);
  });

  describe("severity filtering", () => {
    const allThreeSeverities = `\`\`\`json
[
  { "severity": "CRITICAL", "description": "Critical issue" },
  { "severity": "WARNING", "description": "Warning issue" },
  { "severity": "SUGGESTION", "description": "Suggestion issue" }
]
\`\`\``;

    test("SUGGESTION threshold — returns all three severities", async () => {
      await writeFile(tmpFile, buildExecutionJson(allThreeSeverities));
      const issues = await extractIssues(tmpFile, "SUGGESTION");
      expect(issues).toHaveLength(3);
    });

    test("WARNING threshold (default) — returns CRITICAL and WARNING, drops SUGGESTION", async () => {
      await writeFile(tmpFile, buildExecutionJson(allThreeSeverities));
      const issues = await extractIssues(tmpFile, "WARNING");
      expect(issues).toHaveLength(2);
      expect(issues.map((i) => i.severity)).toEqual(["CRITICAL", "WARNING"]);
    });

    test("CRITICAL threshold — returns only CRITICAL", async () => {
      await writeFile(tmpFile, buildExecutionJson(allThreeSeverities));
      const issues = await extractIssues(tmpFile, "CRITICAL");
      expect(issues).toHaveLength(1);
      expect(issues[0]?.severity).toBe("CRITICAL");
    });

    test("unknown threshold — falls back to WARNING rank, keeps WARNING and CRITICAL", async () => {
      await writeFile(tmpFile, buildExecutionJson(allThreeSeverities));
      const issues = await extractIssues(tmpFile, "BOGUS");
      expect(issues).toHaveLength(2);
      expect(issues.map((i) => i.severity)).toEqual(["CRITICAL", "WARNING"]);
    });

    test("no-arg call uses WARNING default", async () => {
      await writeFile(tmpFile, buildExecutionJson(allThreeSeverities));
      const issues = await extractIssues(tmpFile);
      expect(issues).toHaveLength(2);
      expect(issues.map((i) => i.severity)).toEqual(["CRITICAL", "WARNING"]);
    });
  });
});

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

type MockRequest = ReturnType<typeof vi.fn> & {
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
};

function buildMockRequest(
  statusCode: number,
  responseBody = "{}",
): { requestFn: RequestFn; requestMock: MockRequest } {
  const responseMock = new EventEmitter() as EventEmitter & {
    statusCode: number;
  };
  responseMock.statusCode = statusCode;

  const requestMock = Object.assign(new EventEmitter(), {
    write: vi.fn(),
    end: vi.fn(() => {
      setImmediate(() => {
        responseMock.emit("data", Buffer.from(responseBody));
        responseMock.emit("end");
      });
    }),
  }) as unknown as MockRequest;

  const requestFn = ((_options: unknown, callback?: (res: unknown) => void) => {
    if (callback) callback(responseMock);
    return requestMock;
  }) as unknown as RequestFn;

  return { requestFn, requestMock };
}

function buildGetMock(
  statusCode: number,
  responseBody: string,
): { requestFn: RequestFn } {
  const responseMock = new EventEmitter() as EventEmitter & {
    statusCode: number;
  };
  responseMock.statusCode = statusCode;

  const requestMock = Object.assign(new EventEmitter(), {
    end: vi.fn(() => {
      setImmediate(() => {
        responseMock.emit("data", Buffer.from(responseBody));
        responseMock.emit("end");
      });
    }),
  });

  const requestFn = ((_options: unknown, callback?: (res: unknown) => void) => {
    if (callback) callback(responseMock);
    return requestMock;
  }) as unknown as RequestFn;

  return { requestFn };
}

function buildErrorMock(): { requestFn: RequestFn } {
  const requestMock = Object.assign(new EventEmitter(), {
    end: vi.fn(() => {
      setImmediate(() => {
        requestMock.emit("error", new Error("Network failure"));
      });
    }),
  });

  const requestFn = ((_options: unknown, _callback?: unknown) => {
    return requestMock;
  }) as unknown as RequestFn;

  return { requestFn };
}

// ---------------------------------------------------------------------------
// postIssueThread
// ---------------------------------------------------------------------------

describe("postIssueThread", () => {
  const config: PrConfig = {
    collectionUri: "https://dev.azure.com/myorg/",
    project: "Platform",
    repoId: "repo-abc",
    prId: "42",
    accessToken: "secret-token",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("returns thread ID from response", async () => {
    const { requestFn } = buildMockRequest(200, '{"id": 123}');

    const issue: ReviewIssue = {
      severity: "WARNING",
      description: "Consider using a remote state backend",
    };

    const threadId = await postIssueThread(config, issue, requestFn);
    expect(threadId).toBe(123);
  });

  test("returns 0 when response has no id", async () => {
    const { requestFn } = buildMockRequest(200, "{}");

    const issue: ReviewIssue = {
      severity: "WARNING",
      description: "Test issue",
    };

    const threadId = await postIssueThread(config, issue, requestFn);
    expect(threadId).toBe(0);
  });

  test("posts a general thread when no file/line provided", async () => {
    const { requestFn, requestMock } = buildMockRequest(200, '{"id": 1}');

    const issue: ReviewIssue = {
      severity: "WARNING",
      description: "Consider using a remote state backend",
    };

    await postIssueThread(config, issue, requestFn);

    expect(requestMock.write).toHaveBeenCalledOnce();
    const body = JSON.parse(requestMock.write.mock.calls[0]![0] as string) as {
      comments: Array<{ content: string }>;
      threadContext?: unknown;
    };
    expect(body.comments[0]!.content).toContain("[WARNING]");
    expect(body.comments[0]!.content).toContain(
      "Consider using a remote state backend",
    );
    expect(body.comments[0]!.content).toContain("Claude Code CI Review");
    // General thread (no file) → shows #accept and #fixed help, no claude-ignore
    expect(body.comments[0]!.content).toContain("#accept");
    expect(body.comments[0]!.content).toContain("#fixed");
    expect(body.comments[0]!.content).not.toContain("claude-ignore");
    expect(body.threadContext).toBeUndefined();
  });

  test("includes threadContext when file and line are provided", async () => {
    const { requestFn, requestMock } = buildMockRequest(200, '{"id": 5}');

    const issue: ReviewIssue = {
      severity: "CRITICAL",
      file: "modules/rds/main.tf",
      line: 88,
      description: "Password stored in plaintext",
    };

    await postIssueThread(config, issue, requestFn);

    const body = JSON.parse(requestMock.write.mock.calls[0]![0] as string) as {
      threadContext: {
        filePath: string;
        rightFileStart: { line: number };
        rightFileEnd: { line: number };
      };
    };
    expect(body.threadContext.filePath).toBe("/modules/rds/main.tf");
    expect(body.threadContext.rightFileStart.line).toBe(88);
    expect(body.threadContext.rightFileEnd.line).toBe(88);
    // File thread → help text includes #accept, #fixed, and claude-ignore
    const content = (
      JSON.parse(requestMock.write.mock.calls[0]![0] as string) as {
        comments: Array<{ content: string }>;
      }
    ).comments[0]!.content;
    expect(content).toContain("#accept");
    expect(content).toContain("#fixed");
    expect(content).toContain("claude-ignore");
  });

  test("prefixes file path with / if not already present", async () => {
    const { requestFn, requestMock } = buildMockRequest(200, '{"id": 1}');

    const issue: ReviewIssue = {
      severity: "SUGGESTION",
      file: "no-leading-slash.tf",
      line: 1,
      description: "Style suggestion",
    };

    await postIssueThread(config, issue, requestFn);

    const body = JSON.parse(requestMock.write.mock.calls[0]![0] as string) as {
      threadContext: { filePath: string };
    };
    expect(body.threadContext.filePath).toBe("/no-leading-slash.tf");
  });

  test("preserves leading slash on file path", async () => {
    const { requestFn, requestMock } = buildMockRequest(200, '{"id": 1}');

    const issue: ReviewIssue = {
      severity: "WARNING",
      file: "/already/absolute.tf",
      line: 10,
      description: "Already absolute",
    };

    await postIssueThread(config, issue, requestFn);

    const body = JSON.parse(requestMock.write.mock.calls[0]![0] as string) as {
      threadContext: { filePath: string };
    };
    expect(body.threadContext.filePath).toBe("/already/absolute.tf");
  });

  test("rejects when API returns non-2xx", async () => {
    const { requestFn } = buildMockRequest(403, '{"message":"Forbidden"}');

    const issue: ReviewIssue = {
      severity: "WARNING",
      description: "Test failure",
    };

    await expect(postIssueThread(config, issue, requestFn)).rejects.toThrow(
      "ADO API returned 403",
    );
  });

  test("sends Basic auth header with base64-encoded token", async () => {
    const capturedOptions: unknown[] = [];
    const { requestFn, requestMock } = buildMockRequest(201, '{"id": 99}');

    // Wrap requestFn to capture options
    const capturingFn = ((options: unknown, callback?: unknown) => {
      capturedOptions.push(options);
      return (requestFn as unknown as (o: unknown, c?: unknown) => unknown)(
        options,
        callback,
      );
    }) as unknown as RequestFn;

    await postIssueThread(
      config,
      { severity: "SUGGESTION", description: "Auth test" },
      capturingFn,
    );

    const callOptions = capturedOptions[0] as {
      headers: Record<string, string>;
    };
    const expectedToken = Buffer.from(":secret-token").toString("base64");
    expect(callOptions.headers["Authorization"]).toBe(`Basic ${expectedToken}`);
    expect(requestMock.end).toHaveBeenCalledOnce();
  });

  test("encodes prId in URL path", async () => {
    const capturedOptions: unknown[] = [];
    const { requestFn } = buildMockRequest(200, '{"id": 1}');

    const capturingFn = ((options: unknown, callback?: unknown) => {
      capturedOptions.push(options);
      return (requestFn as unknown as (o: unknown, c?: unknown) => unknown)(
        options,
        callback,
      );
    }) as unknown as RequestFn;

    await postIssueThread(
      config,
      { severity: "SUGGESTION", description: "Encoding test" },
      capturingFn,
    );

    const callOptions = capturedOptions[0] as { path: string };
    expect(callOptions.path).toContain(
      `/pullRequests/${encodeURIComponent(config.prId)}/`,
    );
  });
});

// ---------------------------------------------------------------------------
// fetchThreads
// ---------------------------------------------------------------------------

describe("fetchThreads", () => {
  const config: PrConfig = {
    collectionUri: "https://dev.azure.com/myorg/",
    project: "Platform",
    repoId: "repo-abc",
    prId: "42",
    accessToken: "secret-token",
  };

  function threadList(
    threads: Array<{
      id?: number;
      filePath?: string;
      comments: Array<{ content: string; commentType?: number }>;
    }>,
  ): string {
    return JSON.stringify({
      value: threads.map((t, i) => ({
        id: t.id ?? i + 1,
        ...(t.filePath ? { threadContext: { filePath: t.filePath } } : {}),
        comments: t.comments.map((c) => ({
          content: c.content,
          ...(c.commentType !== undefined
            ? { commentType: c.commentType }
            : {}),
        })),
      })),
    });
  }

  test("returns empty array on network error", async () => {
    const { requestFn } = buildErrorMock();
    const result = await fetchThreads(config, requestFn);
    expect(result).toEqual([]);
  });

  test("returns empty array on invalid JSON", async () => {
    const { requestFn } = buildGetMock(200, "not json");
    const result = await fetchThreads(config, requestFn);
    expect(result).toEqual([]);
  });

  test("returns thread objects", async () => {
    const { requestFn } = buildGetMock(
      200,
      threadList([
        {
          id: 10,
          filePath: "/foo.tf",
          comments: [{ content: "issue" }],
        },
        {
          id: 20,
          comments: [{ content: "general" }],
        },
      ]),
    );
    const result = await fetchThreads(config, requestFn);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe(10);
    expect(result[1]!.id).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// fetchAcceptedFiles
// ---------------------------------------------------------------------------

describe("fetchAcceptedFiles", () => {
  const config: PrConfig = {
    collectionUri: "https://dev.azure.com/myorg/",
    project: "Platform",
    repoId: "repo-abc",
    prId: "42",
    accessToken: "secret-token",
  };

  function threadList(
    threads: Array<{
      filePath?: string;
      comments: string[];
    }>,
  ): string {
    return JSON.stringify({
      value: threads.map((t) => ({
        ...(t.filePath ? { threadContext: { filePath: t.filePath } } : {}),
        comments: t.comments.map((c) => ({ content: c })),
      })),
    });
  }

  test("returns empty Set when GET request fails with network error", async () => {
    const { requestFn } = buildErrorMock();
    const result = await fetchAcceptedFiles(config, requestFn);
    expect(result.size).toBe(0);
  });

  test("returns empty Set when response is not valid JSON", async () => {
    const { requestFn } = buildGetMock(200, "not json");
    const result = await fetchAcceptedFiles(config, requestFn);
    expect(result.size).toBe(0);
  });

  test("returns empty Set when no thread has #accept reply", async () => {
    const { requestFn } = buildGetMock(
      200,
      threadList([
        { filePath: "/modules/vpc/main.tf", comments: ["LGTM", "Nice work"] },
      ]),
    );
    const result = await fetchAcceptedFiles(config, requestFn);
    expect(result.size).toBe(0);
  });

  test("returns normalised file path when root comment contains #accept", async () => {
    const { requestFn } = buildGetMock(
      200,
      threadList([{ filePath: "/modules/vpc/main.tf", comments: ["#accept"] }]),
    );
    const result = await fetchAcceptedFiles(config, requestFn);
    expect(result).toContain("modules/vpc/main.tf");
  });

  test("returns file path when a reply comment (non-root) contains #accept", async () => {
    const { requestFn } = buildGetMock(
      200,
      threadList([
        {
          filePath: "/modules/rds/main.tf",
          comments: ["[WARNING] Plaintext password", "Agreed, #accept this"],
        },
      ]),
    );
    const result = await fetchAcceptedFiles(config, requestFn);
    expect(result).toContain("modules/rds/main.tf");
  });

  test("#accept matching is case-insensitive", async () => {
    const { requestFn } = buildGetMock(
      200,
      threadList([{ filePath: "/foo.tf", comments: ["#ACCEPT"] }]),
    );
    const result = await fetchAcceptedFiles(config, requestFn);
    expect(result).toContain("foo.tf");
  });

  test("returns empty string for general thread (no threadContext) with #accept", async () => {
    const { requestFn } = buildGetMock(
      200,
      threadList([{ comments: ["#accept — acknowledged"] }]),
    );
    const result = await fetchAcceptedFiles(config, requestFn);
    expect(result).toContain("");
  });

  test("returns multiple accepted file paths", async () => {
    const { requestFn } = buildGetMock(
      200,
      threadList([
        { filePath: "/a.tf", comments: ["#accept"] },
        { filePath: "/b.tf", comments: ["looks fine"] },
        { filePath: "/c.tf", comments: ["#accept"] },
      ]),
    );
    const result = await fetchAcceptedFiles(config, requestFn);
    expect(result.size).toBe(2);
    expect(result).toContain("a.tf");
    expect(result).toContain("c.tf");
  });
});

// ---------------------------------------------------------------------------
// updateThreadStatus
// ---------------------------------------------------------------------------

describe("updateThreadStatus", () => {
  const config: PrConfig = {
    collectionUri: "https://dev.azure.com/myorg/",
    project: "Platform",
    repoId: "repo-abc",
    prId: "42",
    accessToken: "secret-token",
  };

  test("sends PATCH request with status in body", async () => {
    const { requestFn, requestMock } = buildMockRequest(200);

    await updateThreadStatus(config, 99, 2, requestFn);

    expect(requestMock.write).toHaveBeenCalledOnce();
    const body = JSON.parse(requestMock.write.mock.calls[0]![0] as string) as {
      status: number;
    };
    expect(body.status).toBe(2);
  });

  test("rejects on non-2xx response", async () => {
    const { requestFn } = buildMockRequest(404, '{"message":"Not found"}');

    await expect(updateThreadStatus(config, 99, 2, requestFn)).rejects.toThrow(
      "ADO API returned 404",
    );
  });
});

// ---------------------------------------------------------------------------
// replyToThread
// ---------------------------------------------------------------------------

describe("replyToThread", () => {
  const config: PrConfig = {
    collectionUri: "https://dev.azure.com/myorg/",
    project: "Platform",
    repoId: "repo-abc",
    prId: "42",
    accessToken: "secret-token",
  };

  test("sends POST request with comment content", async () => {
    const { requestFn, requestMock } = buildMockRequest(200);

    await replyToThread(config, 99, "Verified fixed", requestFn);

    expect(requestMock.write).toHaveBeenCalledOnce();
    const body = JSON.parse(requestMock.write.mock.calls[0]![0] as string) as {
      content: string;
      parentCommentId: number;
      commentType: number;
    };
    expect(body.content).toBe("Verified fixed");
    expect(body.parentCommentId).toBe(0);
    expect(body.commentType).toBe(1);
  });

  test("rejects on non-2xx response", async () => {
    const { requestFn } = buildMockRequest(403, '{"message":"Forbidden"}');

    await expect(
      replyToThread(config, 99, "test reply", requestFn),
    ).rejects.toThrow("ADO API returned 403");
  });
});

// ---------------------------------------------------------------------------
// filterAcceptedIssues
// ---------------------------------------------------------------------------

describe("filterAcceptedIssues", () => {
  const baseIssue = (file?: string): ReviewIssue => ({
    severity: "WARNING",
    description: "test issue",
    ...(file !== undefined ? { file } : {}),
  });

  test("returns all issues when accepted set is empty", () => {
    const issues = [baseIssue("foo.tf"), baseIssue("bar.tf")];
    expect(filterAcceptedIssues(issues, new Set())).toHaveLength(2);
  });

  test("filters out issue whose file is in accepted set", () => {
    const issues = [baseIssue("foo.tf"), baseIssue("bar.tf")];
    const result = filterAcceptedIssues(issues, new Set(["foo.tf"]));
    expect(result).toHaveLength(1);
    expect(result[0]?.file).toBe("bar.tf");
  });

  test("filters issue with leading slash when normalised path is in set", () => {
    const issues = [baseIssue("/foo.tf")];
    const result = filterAcceptedIssues(issues, new Set(["foo.tf"]));
    expect(result).toHaveLength(0);
  });

  test("filters no-file issue when empty string is in accepted set", () => {
    const issues = [baseIssue()];
    const result = filterAcceptedIssues(issues, new Set([""]));
    expect(result).toHaveLength(0);
  });

  test("keeps no-file issue when empty string is not in accepted set", () => {
    const issues = [baseIssue()];
    const result = filterAcceptedIssues(issues, new Set(["foo.tf"]));
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// REVIEWER_VOTE
// ---------------------------------------------------------------------------

describe("REVIEWER_VOTE", () => {
  test("has expected values", () => {
    expect(REVIEWER_VOTE.APPROVED).toBe(10);
    expect(REVIEWER_VOTE.WAITING_FOR_AUTHOR).toBe(-5);
    expect(REVIEWER_VOTE.NO_VOTE).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getCurrentUserId
// ---------------------------------------------------------------------------

describe("getCurrentUserId", () => {
  const config: PrConfig = {
    collectionUri: "https://dev.azure.com/myorg/",
    project: "Platform",
    repoId: "repo-abc",
    prId: "42",
    accessToken: "secret-token",
  };

  test("returns authenticatedUser.id on success", async () => {
    const { requestFn } = buildGetMock(
      200,
      JSON.stringify({ authenticatedUser: { id: "user-guid-abc" } }),
    );
    const userId = await getCurrentUserId(config, requestFn);
    expect(userId).toBe("user-guid-abc");
  });

  test("rejects when authenticatedUser.id is missing", async () => {
    const { requestFn } = buildGetMock(
      200,
      JSON.stringify({ authenticatedUser: {} }),
    );
    await expect(getCurrentUserId(config, requestFn)).rejects.toThrow(
      "connectionData response missing authenticatedUser.id",
    );
  });

  test("rejects when authenticatedUser is missing entirely", async () => {
    const { requestFn } = buildGetMock(200, JSON.stringify({}));
    await expect(getCurrentUserId(config, requestFn)).rejects.toThrow(
      "connectionData response missing authenticatedUser.id",
    );
  });

  test("rejects when response is not valid JSON", async () => {
    const { requestFn } = buildGetMock(200, "not json");
    await expect(getCurrentUserId(config, requestFn)).rejects.toThrow(
      "Failed to parse connectionData response",
    );
  });

  test("rejects on network error", async () => {
    const { requestFn } = buildErrorMock();
    await expect(getCurrentUserId(config, requestFn)).rejects.toThrow(
      "Network failure",
    );
  });

  test("sends GET to /_apis/connectionData with Basic auth", async () => {
    const capturedOptions: unknown[] = [];
    const { requestFn } = buildGetMock(
      200,
      JSON.stringify({ authenticatedUser: { id: "user-guid-abc" } }),
    );

    const capturingFn = ((options: unknown, callback?: unknown) => {
      capturedOptions.push(options);
      return (requestFn as unknown as (o: unknown, c?: unknown) => unknown)(
        options,
        callback,
      );
    }) as unknown as RequestFn;

    await getCurrentUserId(config, capturingFn);

    const callOptions = capturedOptions[0] as {
      path: string;
      method: string;
      headers: Record<string, string>;
    };
    expect(callOptions.path).toContain("/_apis/connectionData");
    expect(callOptions.method).toBe("GET");
    const expectedToken = Buffer.from(":secret-token").toString("base64");
    expect(callOptions.headers["Authorization"]).toBe(`Basic ${expectedToken}`);
  });
});

// ---------------------------------------------------------------------------
// approvePullRequest
// ---------------------------------------------------------------------------

describe("approvePullRequest", () => {
  const config: PrConfig = {
    collectionUri: "https://dev.azure.com/myorg/",
    project: "Platform",
    repoId: "repo-abc",
    prId: "42",
    accessToken: "secret-token",
  };

  /**
   * Builds a requestFn that returns a different response for each sequential
   * call. Calls beyond the provided responses will reject.
   */
  function buildSequentialMock(
    responses: Array<{
      statusCode: number;
      body: string;
      hasWrite?: boolean;
    }>,
  ): {
    requestFn: RequestFn;
    capturedOptions: unknown[];
    capturedBodies: string[];
  } {
    let callIndex = 0;
    const capturedOptions: unknown[] = [];
    const capturedBodies: string[] = [];

    const requestFn = ((
      options: unknown,
      callback?: (res: unknown) => void,
    ) => {
      const idx = callIndex++;
      const resp = responses[idx];
      capturedOptions.push(options);

      if (!resp) {
        const reqMock = Object.assign(new EventEmitter(), {
          write: vi.fn(),
          end: vi.fn(() => {
            setImmediate(() => {
              reqMock.emit("error", new Error("No more mock responses"));
            });
          }),
        });
        return reqMock;
      }

      const responseMock = new EventEmitter() as EventEmitter & {
        statusCode: number;
      };
      responseMock.statusCode = resp.statusCode;

      const reqMock = Object.assign(new EventEmitter(), {
        write: vi.fn((data: string) => {
          capturedBodies.push(data);
        }),
        end: vi.fn(() => {
          setImmediate(() => {
            responseMock.emit("data", Buffer.from(resp.body));
            responseMock.emit("end");
          });
        }),
      });

      if (callback) callback(responseMock);
      return reqMock;
    }) as unknown as RequestFn;

    return { requestFn, capturedOptions, capturedBodies };
  }

  test("sends PUT with vote in body to reviewers endpoint", async () => {
    const { requestFn, capturedBodies } = buildSequentialMock([
      {
        statusCode: 200,
        body: JSON.stringify({ authenticatedUser: { id: "user-guid" } }),
      },
      { statusCode: 200, body: "{}", hasWrite: true },
    ]);

    await approvePullRequest(config, 10, requestFn);

    expect(capturedBodies).toHaveLength(1);
    const body = JSON.parse(capturedBodies[0]!) as { vote: number };
    expect(body.vote).toBe(10);
  });

  test("includes userId in URL path", async () => {
    const { requestFn, capturedOptions } = buildSequentialMock([
      {
        statusCode: 200,
        body: JSON.stringify({ authenticatedUser: { id: "user-guid" } }),
      },
      { statusCode: 200, body: "{}", hasWrite: true },
    ]);

    await approvePullRequest(config, -5, requestFn);

    const putOptions = capturedOptions[1] as { path: string };
    expect(putOptions.path).toContain("/reviewers/user-guid");
  });

  test("rejects when PUT returns non-2xx", async () => {
    const { requestFn } = buildSequentialMock([
      {
        statusCode: 200,
        body: JSON.stringify({ authenticatedUser: { id: "user-guid" } }),
      },
      { statusCode: 403, body: '{"message":"Forbidden"}' },
    ]);

    await expect(approvePullRequest(config, 10, requestFn)).rejects.toThrow(
      "ADO API returned 403",
    );
  });

  test("rejects when getCurrentUserId fails", async () => {
    const { requestFn } = buildSequentialMock([
      { statusCode: 200, body: JSON.stringify({ authenticatedUser: {} }) },
    ]);

    await expect(approvePullRequest(config, 10, requestFn)).rejects.toThrow(
      "connectionData response missing authenticatedUser.id",
    );
  });
});
