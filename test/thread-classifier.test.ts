import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  classifyThreadReplies,
  createAnthropicClient,
  type ClassifierConfig,
} from "../src/thread-classifier";
import { REVIEW_ATTRIBUTION, type PrThread } from "../src/pr-comment-core";

// Mock the Anthropic SDK — store reference for per-test control
const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  // Use a real function (not arrow) so it's constructable with `new`
  function MockAnthropic() {
    return { messages: { create: mockCreate } };
  }
  return { default: MockAnthropic };
});

beforeEach(() => {
  mockCreate.mockReset();
});

const baseConfig: ClassifierConfig = {
  apiKey: "test-key", // pragma: allowlist secret
  model: "claude-haiku-4-5-20251001",
};

function buildThread(
  id: number,
  filePath: string | undefined,
  comments: Array<{ content: string; commentType?: number }>,
): PrThread {
  return {
    id,
    status: 1,
    ...(filePath ? { threadContext: { filePath } } : {}),
    comments: comments.map((c, i) => ({
      id: i + 1,
      content: c.content,
      commentType: c.commentType,
    })),
  };
}

// ---------------------------------------------------------------------------
// Explicit keyword matching (deterministic path)
// ---------------------------------------------------------------------------

describe("classifyThreadReplies — explicit keywords", () => {
  test("matches #accept keyword deterministically", async () => {
    const threads: PrThread[] = [
      buildThread(1, "/foo.tf", [
        { content: "Issue found", commentType: 1 },
        { content: "#accept" },
      ]),
    ];

    const results = await classifyThreadReplies(threads, baseConfig);
    expect(results).toHaveLength(1);
    expect(results[0]!.intent).toBe("accept");
    expect(results[0]!.threadId).toBe(1);
    expect(results[0]!.filePath).toBe("foo.tf");
    // No API call needed for explicit keywords
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("matches #fixed keyword deterministically", async () => {
    const threads: PrThread[] = [
      buildThread(2, "/bar.tf", [
        { content: "Issue found", commentType: 1 },
        { content: "#fixed" },
      ]),
    ];

    const results = await classifyThreadReplies(threads, baseConfig);
    expect(results).toHaveLength(1);
    expect(results[0]!.intent).toBe("fixed");
    expect(results[0]!.threadId).toBe(2);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("matches #ACCEPT case-insensitively", async () => {
    const threads: PrThread[] = [
      buildThread(3, "/baz.tf", [
        { content: "Issue", commentType: 1 },
        { content: "#ACCEPT this" },
      ]),
    ];

    const results = await classifyThreadReplies(threads, baseConfig);
    expect(results).toHaveLength(1);
    expect(results[0]!.intent).toBe("accept");
  });

  test("matches #FIXED case-insensitively", async () => {
    const threads: PrThread[] = [
      buildThread(4, "/qux.tf", [
        { content: "Issue", commentType: 1 },
        { content: "#Fixed in latest commit" },
      ]),
    ];

    const results = await classifyThreadReplies(threads, baseConfig);
    expect(results).toHaveLength(1);
    expect(results[0]!.intent).toBe("fixed");
  });
});

// ---------------------------------------------------------------------------
// Threads with no replies
// ---------------------------------------------------------------------------

describe("classifyThreadReplies — no replies", () => {
  test("skips threads with only root comment", async () => {
    const threads: PrThread[] = [
      buildThread(1, "/foo.tf", [{ content: "Issue found", commentType: 1 }]),
    ];

    const results = await classifyThreadReplies(threads, baseConfig);
    expect(results).toHaveLength(0);
  });

  test("skips threads with no id", async () => {
    const thread: PrThread = {
      status: 1,
      threadContext: { filePath: "/foo.tf" },
      comments: [{ content: "Issue", commentType: 1 }, { content: "fixed" }],
    };

    const results = await classifyThreadReplies([thread], baseConfig);
    expect(results).toHaveLength(0);
  });

  test("returns empty array for empty threads list", async () => {
    const results = await classifyThreadReplies([], baseConfig);
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Ambiguous replies (API path)
// ---------------------------------------------------------------------------

describe("classifyThreadReplies — ambiguous replies via API", () => {
  test("calls API for non-keyword replies and parses response", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '[{ "id": 10, "intent": "fixed" }]',
        },
      ],
    });

    const threads: PrThread[] = [
      buildThread(10, "/foo.tf", [
        { content: "Issue found", commentType: 1 },
        { content: "done, resolved in abc123" },
      ]),
    ];

    const results = await classifyThreadReplies(threads, baseConfig);
    expect(results).toHaveLength(1);
    expect(results[0]!.intent).toBe("fixed");
    expect(results[0]!.threadId).toBe(10);
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  test("returns none for all threads on API failure", async () => {
    mockCreate.mockRejectedValue(new Error("API error"));

    const threads: PrThread[] = [
      buildThread(10, "/foo.tf", [
        { content: "Issue", commentType: 1 },
        { content: "I fixed this" },
      ]),
    ];

    const results = await classifyThreadReplies(threads, baseConfig);
    expect(results).toHaveLength(1);
    expect(results[0]!.intent).toBe("none");
  });

  test("handles mixed explicit and ambiguous threads", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '[{ "id": 20, "intent": "accept" }]',
        },
      ],
    });

    const threads: PrThread[] = [
      // Explicit #fixed
      buildThread(10, "/a.tf", [
        { content: "Issue", commentType: 1 },
        { content: "#fixed" },
      ]),
      // Ambiguous — sent to API
      buildThread(20, "/b.tf", [
        { content: "Issue", commentType: 1 },
        { content: "this is by design" },
      ]),
    ];

    const results = await classifyThreadReplies(threads, baseConfig);
    expect(results).toHaveLength(2);

    const thread10 = results.find((r) => r.threadId === 10);
    const thread20 = results.find((r) => r.threadId === 20);
    expect(thread10!.intent).toBe("fixed");
    expect(thread20!.intent).toBe("accept");
    // Only one API call (for the ambiguous thread)
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  test("handles API response wrapped in code block", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '```json\n[{ "id": 10, "intent": "none" }]\n```',
        },
      ],
    });

    const threads: PrThread[] = [
      buildThread(10, "/foo.tf", [
        { content: "Issue", commentType: 1 },
        { content: "interesting, thanks" },
      ]),
    ];

    const results = await classifyThreadReplies(threads, baseConfig);
    expect(results).toHaveLength(1);
    expect(results[0]!.intent).toBe("none");
  });

  test("treats invalid intent values as none", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '[{ "id": 10, "intent": "banana" }]',
        },
      ],
    });

    const threads: PrThread[] = [
      buildThread(10, "/foo.tf", [
        { content: "Issue", commentType: 1 },
        { content: "some random reply" },
      ]),
    ];

    const results = await classifyThreadReplies(threads, baseConfig);
    expect(results).toHaveLength(1);
    expect(results[0]!.intent).toBe("none");
  });

  test("drops hallucinated thread IDs not in the input set", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '[{ "id": 10, "intent": "fixed" }, { "id": 999, "intent": "accept" }]',
        },
      ],
    });

    const threads: PrThread[] = [
      buildThread(10, "/foo.tf", [
        { content: "Issue", commentType: 1 },
        { content: "resolved this" },
      ]),
    ];

    const results = await classifyThreadReplies(threads, baseConfig);
    // Only thread 10 should appear — 999 was not in the input
    expect(results).toHaveLength(1);
    expect(results[0]!.threadId).toBe(10);
    expect(results[0]!.intent).toBe("fixed");
  });

  test("uses system prompt for classification instruction", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '[{ "id": 10, "intent": "none" }]',
        },
      ],
    });

    const threads: PrThread[] = [
      buildThread(10, "/foo.tf", [
        { content: "Issue", commentType: 1 },
        { content: "some reply" },
      ]),
    ];

    await classifyThreadReplies(threads, baseConfig);
    expect(mockCreate).toHaveBeenCalledOnce();

    const callArgs = mockCreate.mock.calls[0]![0] as {
      system?: string;
      messages: Array<{ content: string }>;
    };
    // Classification instruction should be in system prompt, not user message
    expect(callArgs.system).toBeDefined();
    expect(callArgs.system).toContain("classifier");
    // User message should contain thread data wrapped in delimiters
    expect(callArgs.messages[0]!.content).toContain("<threads>");
  });
});

// ---------------------------------------------------------------------------
// createAnthropicClient
// ---------------------------------------------------------------------------

describe("createAnthropicClient", () => {
  test("creates default client for direct Anthropic", () => {
    const client = createAnthropicClient({
      apiKey: "sk-test", // pragma: allowlist secret
      model: "claude-haiku-4-5-20251001",
    });
    expect(client).toBeDefined();
    expect(client.messages).toBeDefined();
  });

  test("creates Bedrock client with region-based URL", () => {
    const client = createAnthropicClient({
      apiKey: "bedrock-key", // pragma: allowlist secret
      useBedrock: true,
      awsRegion: "eu-west-1",
      model: "anthropic.claude-haiku",
    });
    expect(client).toBeDefined();
  });

  test("creates Vertex client with project/region URL", () => {
    const client = createAnthropicClient({
      apiKey: "vertex-key", // pragma: allowlist secret
      useVertex: true,
      gcpProjectId: "my-project",
      gcpRegion: "europe-west4",
      model: "claude-haiku",
    });
    expect(client).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// File path normalisation
// ---------------------------------------------------------------------------

describe("classifyThreadReplies — file path handling", () => {
  test("normalises file path (strips leading slash)", async () => {
    const threads: PrThread[] = [
      buildThread(1, "/modules/vpc/main.tf", [
        { content: "Issue", commentType: 1 },
        { content: "#accept" },
      ]),
    ];

    const results = await classifyThreadReplies(threads, baseConfig);
    expect(results[0]!.filePath).toBe("modules/vpc/main.tf");
  });

  test("returns empty string for general thread (no threadContext)", async () => {
    const threads: PrThread[] = [
      buildThread(1, undefined, [
        { content: "General issue", commentType: 1 },
        { content: "#fixed" },
      ]),
    ];

    const results = await classifyThreadReplies(threads, baseConfig);
    expect(results[0]!.filePath).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Bedrock/Vertex keyword-only mode (C1)
// ---------------------------------------------------------------------------

describe("classifyThreadReplies — Bedrock/Vertex keyword-only", () => {
  const bedrockConfig: ClassifierConfig = {
    apiKey: "bedrock-key", // pragma: allowlist secret
    useBedrock: true,
    awsRegion: "eu-west-1",
    model: "anthropic.claude-haiku",
  };

  const vertexConfig: ClassifierConfig = {
    apiKey: "vertex-key", // pragma: allowlist secret
    useVertex: true,
    gcpProjectId: "my-project",
    gcpRegion: "europe-west4",
    model: "claude-haiku",
  };

  test("explicit #fixed works with Bedrock", async () => {
    const threads: PrThread[] = [
      buildThread(1, "/foo.tf", [
        { content: "Issue found", commentType: 1 },
        { content: "#fixed" },
      ]),
    ];

    const results = await classifyThreadReplies(threads, bedrockConfig);
    expect(results).toHaveLength(1);
    expect(results[0]!.intent).toBe("fixed");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("explicit #accept works with Vertex", async () => {
    const threads: PrThread[] = [
      buildThread(1, "/foo.tf", [
        { content: "Issue found", commentType: 1 },
        { content: "#accept" },
      ]),
    ];

    const results = await classifyThreadReplies(threads, vertexConfig);
    expect(results).toHaveLength(1);
    expect(results[0]!.intent).toBe("accept");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("ambiguous replies return empty with Bedrock — no API call", async () => {
    const threads: PrThread[] = [
      buildThread(10, "/foo.tf", [
        { content: "Issue", commentType: 1 },
        { content: "done, resolved in abc123" },
      ]),
    ];

    const results = await classifyThreadReplies(threads, bedrockConfig);
    expect(results).toHaveLength(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("ambiguous replies return empty with Vertex — no API call", async () => {
    const threads: PrThread[] = [
      buildThread(10, "/foo.tf", [
        { content: "Issue", commentType: 1 },
        { content: "I fixed this already" },
      ]),
    ];

    const results = await classifyThreadReplies(threads, vertexConfig);
    expect(results).toHaveLength(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Bot reply filtering (W5)
// ---------------------------------------------------------------------------

describe("classifyThreadReplies — bot reply filtering", () => {
  test("thread with only bot verification reply (commentType 1) has no user replies", async () => {
    const threads: PrThread[] = [
      buildThread(1, "/foo.tf", [
        {
          content: `${REVIEW_ATTRIBUTION} | [WARNING]\n\nSome issue`,
          commentType: 1,
        },
        {
          content: `${REVIEW_ATTRIBUTION}\n\n✅ Verified fixed.`,
          commentType: 1,
        },
      ]),
    ];

    const results = await classifyThreadReplies(threads, baseConfig);
    expect(results).toHaveLength(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("thread with bot reply and user reply processes user reply only", async () => {
    const threads: PrThread[] = [
      buildThread(1, "/foo.tf", [
        {
          content: `${REVIEW_ATTRIBUTION} | [WARNING]\n\nSome issue`,
          commentType: 1,
        },
        {
          content: `${REVIEW_ATTRIBUTION}\n\n⚠️ Issue still detected after changes.`,
          commentType: 1,
        },
        { content: "#fixed" },
      ]),
    ];

    const results = await classifyThreadReplies(threads, baseConfig);
    expect(results).toHaveLength(1);
    expect(results[0]!.intent).toBe("fixed");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("human comment containing attribution text (commentType 0) is NOT filtered", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '[{ "id": 1, "intent": "none" }]',
        },
      ],
    });

    const threads: PrThread[] = [
      buildThread(1, "/foo.tf", [
        {
          content: `${REVIEW_ATTRIBUTION} | [WARNING]\n\nSome issue`,
          commentType: 1,
        },
        {
          content: `${REVIEW_ATTRIBUTION} — spoofed by a human`,
          commentType: 0,
        },
      ]),
    ];

    const results = await classifyThreadReplies(threads, baseConfig);
    // The spoofed comment is NOT filtered — it's treated as a user reply
    expect(results).toHaveLength(1);
    // It went through API classification (not filtered out)
    expect(mockCreate).toHaveBeenCalledOnce();
  });
});
