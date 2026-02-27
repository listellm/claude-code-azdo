import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFile, unlink } from "fs/promises";
import * as os from "os";
import * as path from "path";
import type * as https from "https";
import { EventEmitter } from "events";
import {
  extractIssues,
  postIssueThread,
  type PrConfig,
  type ReviewIssue,
} from "../src/pr-comment-core";

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
    const issues = await extractIssues(tmpFile);
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
});

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

  type MockRequest = ReturnType<typeof vi.fn> & {
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };

  function buildMockRequest(
    statusCode: number,
    responseBody = "{}",
  ): { requestFn: typeof https.request; requestMock: MockRequest } {
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

    const requestFn = ((
      _options: unknown,
      callback?: (res: unknown) => void,
    ) => {
      if (callback) callback(responseMock);
      return requestMock;
    }) as unknown as typeof https.request;

    return { requestFn, requestMock };
  }

  test("posts a general thread when no file/line provided", async () => {
    const { requestFn, requestMock } = buildMockRequest(200);

    const issue: ReviewIssue = {
      severity: "WARNING",
      description: "Consider using a remote state backend",
    };

    await expect(
      postIssueThread(config, issue, requestFn),
    ).resolves.toBeUndefined();

    expect(requestMock.write).toHaveBeenCalledOnce();
    const body = JSON.parse(requestMock.write.mock.calls[0]![0] as string) as {
      comments: Array<{ content: string }>;
      threadContext?: unknown;
    };
    expect(body.comments[0]!.content).toContain("[WARNING]");
    expect(body.comments[0]!.content).toContain(
      "Consider using a remote state backend",
    );
    expect(body.threadContext).toBeUndefined();
  });

  test("includes threadContext when file and line are provided", async () => {
    const { requestFn, requestMock } = buildMockRequest(200);

    const issue: ReviewIssue = {
      severity: "CRITICAL",
      file: "modules/rds/main.tf",
      line: 88,
      description: "Password stored in plaintext",
    };

    await expect(
      postIssueThread(config, issue, requestFn),
    ).resolves.toBeUndefined();

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
  });

  test("prefixes file path with / if not already present", async () => {
    const { requestFn, requestMock } = buildMockRequest(200);

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
    const { requestFn, requestMock } = buildMockRequest(200);

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
    const { requestFn, requestMock } = buildMockRequest(201);

    // Wrap requestFn to capture options
    const capturingFn = ((options: unknown, callback?: unknown) => {
      capturedOptions.push(options);
      return (requestFn as unknown as (o: unknown, c?: unknown) => unknown)(
        options,
        callback,
      );
    }) as unknown as typeof https.request;

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
});
