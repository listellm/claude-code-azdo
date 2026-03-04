import { describe, test, expect, vi, afterEach } from "vitest";
import { writeFile, unlink } from "fs/promises";
import * as os from "os";
import * as path from "path";
import {
  extractUsage,
  logUsageSummary,
  type UsageSummary,
} from "../src/usage-core";

const tmpFile = path.join(os.tmpdir(), `usage-core-test-${process.pid}.json`);

afterEach(async () => {
  try {
    await unlink(tmpFile);
  } catch {
    // Ignore
  }
});

function buildExecutionJson(resultEntry: Record<string, unknown>): string {
  return JSON.stringify([
    { type: "assistant", content: "thinking..." },
    { type: "result", ...resultEntry },
  ]);
}

const FULL_RESULT = {
  total_cost_usd: 0.0842,
  duration_ms: 45200,
  duration_api_ms: 32100,
  num_turns: 3,
  usage: {
    input_tokens: 12450,
    output_tokens: 3200,
    cache_creation_input_tokens: 1500,
    cache_read_input_tokens: 8200,
  },
  modelUsage: {
    "us.anthropic.claude-sonnet-4-5-20251001-v1:0": {
      inputTokens: 12450,
      outputTokens: 3200,
      cacheReadInputTokens: 8200,
      cacheCreationInputTokens: 1500,
      costUSD: 0.0842,
    },
  },
  result: "Review complete.",
};

// ---------------------------------------------------------------------------
// extractUsage — happy path
// ---------------------------------------------------------------------------

describe("extractUsage", () => {
  test("extracts all fields from a complete result entry", async () => {
    await writeFile(tmpFile, buildExecutionJson(FULL_RESULT));
    const summary = await extractUsage(tmpFile);

    expect(summary).not.toBeNull();
    expect(summary!.totalCostUSD).toBe(0.0842);
    expect(summary!.durationMs).toBe(45200);
    expect(summary!.durationApiMs).toBe(32100);
    expect(summary!.numTurns).toBe(3);
    expect(summary!.usage.inputTokens).toBe(12450);
    expect(summary!.usage.outputTokens).toBe(3200);
    expect(summary!.usage.cacheCreationInputTokens).toBe(1500);
    expect(summary!.usage.cacheReadInputTokens).toBe(8200);
  });

  test("parses modelUsage into array with correct model name", async () => {
    await writeFile(tmpFile, buildExecutionJson(FULL_RESULT));
    const summary = await extractUsage(tmpFile);

    expect(summary!.modelUsage).toHaveLength(1);
    expect(summary!.modelUsage[0]!.model).toBe(
      "us.anthropic.claude-sonnet-4-5-20251001-v1:0",
    );
    expect(summary!.modelUsage[0]!.inputTokens).toBe(12450);
    expect(summary!.modelUsage[0]!.outputTokens).toBe(3200);
    expect(summary!.modelUsage[0]!.cacheReadInputTokens).toBe(8200);
    expect(summary!.modelUsage[0]!.cacheCreationInputTokens).toBe(1500);
    expect(summary!.modelUsage[0]!.costUSD).toBe(0.0842);
  });

  // ---------------------------------------------------------------------------
  // null cases
  // ---------------------------------------------------------------------------

  test("returns null for missing file", async () => {
    const result = await extractUsage("/nonexistent/path.json");
    expect(result).toBeNull();
  });

  test("returns null for empty file", async () => {
    await writeFile(tmpFile, "");
    const result = await extractUsage(tmpFile);
    expect(result).toBeNull();
  });

  test("returns null for malformed JSON", async () => {
    await writeFile(tmpFile, "not json at all");
    const result = await extractUsage(tmpFile);
    expect(result).toBeNull();
  });

  test("returns null when entries is not an array", async () => {
    await writeFile(tmpFile, JSON.stringify({ type: "result" }));
    const result = await extractUsage(tmpFile);
    expect(result).toBeNull();
  });

  test("returns null when no result entry exists", async () => {
    await writeFile(
      tmpFile,
      JSON.stringify([{ type: "assistant", content: "hello" }]),
    );
    const result = await extractUsage(tmpFile);
    expect(result).toBeNull();
  });

  test("returns null when result entry has no usage object", async () => {
    await writeFile(
      tmpFile,
      buildExecutionJson({
        total_cost_usd: 0.01,
        duration_ms: 1000,
        result: "done",
      }),
    );
    const result = await extractUsage(tmpFile);
    expect(result).toBeNull();
  });

  test("returns null when usage is null", async () => {
    await writeFile(
      tmpFile,
      buildExecutionJson({
        total_cost_usd: 0.01,
        usage: null,
        result: "done",
      }),
    );
    const result = await extractUsage(tmpFile);
    expect(result).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // defaults / missing optional fields
  // ---------------------------------------------------------------------------

  test("missing cache fields default to 0", async () => {
    await writeFile(
      tmpFile,
      buildExecutionJson({
        total_cost_usd: 0.01,
        duration_ms: 1000,
        duration_api_ms: 800,
        num_turns: 1,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
        result: "done",
      }),
    );
    const summary = await extractUsage(tmpFile);

    expect(summary).not.toBeNull();
    expect(summary!.usage.cacheCreationInputTokens).toBe(0);
    expect(summary!.usage.cacheReadInputTokens).toBe(0);
  });

  test("missing modelUsage returns empty array", async () => {
    await writeFile(
      tmpFile,
      buildExecutionJson({
        total_cost_usd: 0.05,
        duration_ms: 2000,
        duration_api_ms: 1500,
        num_turns: 2,
        usage: {
          input_tokens: 500,
          output_tokens: 200,
        },
        result: "done",
      }),
    );
    const summary = await extractUsage(tmpFile);

    expect(summary).not.toBeNull();
    expect(summary!.modelUsage).toEqual([]);
  });

  test("total_cost_usd: 0 is valid", async () => {
    await writeFile(
      tmpFile,
      buildExecutionJson({
        total_cost_usd: 0,
        duration_ms: 500,
        duration_api_ms: 300,
        num_turns: 1,
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
        result: "done",
      }),
    );
    const summary = await extractUsage(tmpFile);

    expect(summary).not.toBeNull();
    expect(summary!.totalCostUSD).toBe(0);
  });

  test("missing top-level numeric fields default to 0", async () => {
    await writeFile(
      tmpFile,
      buildExecutionJson({
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
        result: "done",
      }),
    );
    const summary = await extractUsage(tmpFile);

    expect(summary).not.toBeNull();
    expect(summary!.totalCostUSD).toBe(0);
    expect(summary!.durationMs).toBe(0);
    expect(summary!.durationApiMs).toBe(0);
    expect(summary!.numTurns).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // multi-model
  // ---------------------------------------------------------------------------

  test("multi-model modelUsage maps both entries correctly", async () => {
    await writeFile(
      tmpFile,
      buildExecutionJson({
        total_cost_usd: 0.15,
        duration_ms: 60000,
        duration_api_ms: 45000,
        num_turns: 5,
        usage: {
          input_tokens: 20000,
          output_tokens: 5000,
        },
        modelUsage: {
          "us.anthropic.claude-sonnet-4-5-20251001-v1:0": {
            inputTokens: 15000,
            outputTokens: 3000,
            cacheReadInputTokens: 5000,
            cacheCreationInputTokens: 1000,
            costUSD: 0.1,
          },
          "us.anthropic.claude-haiku-4-5-20251001-v1:0": {
            inputTokens: 5000,
            outputTokens: 2000,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            costUSD: 0.05,
          },
        },
        result: "done",
      }),
    );
    const summary = await extractUsage(tmpFile);

    expect(summary!.modelUsage).toHaveLength(2);

    const sonnet = summary!.modelUsage.find((m) => m.model.includes("sonnet"));
    const haiku = summary!.modelUsage.find((m) => m.model.includes("haiku"));

    expect(sonnet).toBeDefined();
    expect(sonnet!.inputTokens).toBe(15000);
    expect(sonnet!.costUSD).toBe(0.1);

    expect(haiku).toBeDefined();
    expect(haiku!.inputTokens).toBe(5000);
    expect(haiku!.costUSD).toBe(0.05);
  });

  // ---------------------------------------------------------------------------
  // model_usage_json serialisation
  // ---------------------------------------------------------------------------

  test("modelUsage serialises to valid JSON string", async () => {
    await writeFile(tmpFile, buildExecutionJson(FULL_RESULT));
    const summary = await extractUsage(tmpFile);

    const json = JSON.stringify(summary!.modelUsage);
    const parsed = JSON.parse(json) as unknown[];
    expect(parsed).toHaveLength(1);
    expect((parsed[0] as Record<string, unknown>)["model"]).toBe(
      "us.anthropic.claude-sonnet-4-5-20251001-v1:0",
    );
  });
});

// ---------------------------------------------------------------------------
// logUsageSummary
// ---------------------------------------------------------------------------

describe("logUsageSummary", () => {
  test("logs formatted output with all fields", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const summary: UsageSummary = {
      totalCostUSD: 0.0842,
      durationMs: 45200,
      durationApiMs: 32100,
      numTurns: 3,
      usage: {
        inputTokens: 12450,
        outputTokens: 3200,
        cacheCreationInputTokens: 1500,
        cacheReadInputTokens: 8200,
      },
      modelUsage: [
        {
          model: "us.anthropic.claude-sonnet-4-5-20251001-v1:0",
          inputTokens: 12450,
          outputTokens: 3200,
          cacheReadInputTokens: 8200,
          cacheCreationInputTokens: 1500,
          costUSD: 0.0842,
        },
      ],
    };

    logUsageSummary(summary);

    const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");

    expect(output).toContain("$0.0842");
    expect(output).toContain("45.2s total");
    expect(output).toContain("32.1s API");
    expect(output).toContain("Turns:      3");
    expect(output).toContain("tokens");
    expect(output).toContain("may differ from provider billing");
    expect(output).toContain("Per-model breakdown");
    expect(output).toContain("us.anthropic.claude-sonnet-4-5-20251001-v1:0");

    consoleSpy.mockRestore();
  });

  test("omits cache lines when cache tokens are 0", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const summary: UsageSummary = {
      totalCostUSD: 0.01,
      durationMs: 1000,
      durationApiMs: 800,
      numTurns: 1,
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
      modelUsage: [],
    };

    logUsageSummary(summary);

    const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");

    expect(output).not.toContain("Cache read:");
    expect(output).not.toContain("Cache creation:");
    expect(output).not.toContain("Per-model breakdown");

    consoleSpy.mockRestore();
  });
});
