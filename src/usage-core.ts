import { readResultEntry } from "./execution-file";

export interface ClaudeUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface ModelUsageEntry {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUSD: number;
}

export interface UsageSummary {
  totalCostUSD: number;
  durationMs: number;
  durationApiMs: number;
  numTurns: number;
  usage: ClaudeUsage;
  modelUsage: ModelUsageEntry[];
}

/**
 * Reads the execution JSON array, finds the `type: "result"` entry,
 * and extracts token usage, cost, and timing data.
 * Returns null if file is missing, malformed, or has no result entry with usage data.
 * Non-throwing.
 */
export async function extractUsage(
  executionFile: string,
): Promise<UsageSummary | null> {
  const resultEntry = await readResultEntry(executionFile);
  if (!resultEntry) {
    return null;
  }

  const usageObj = resultEntry["usage"];
  if (typeof usageObj !== "object" || usageObj === null) {
    return null;
  }

  const usage = usageObj as Record<string, unknown>;

  const claudeUsage: ClaudeUsage = {
    inputTokens: toNumber(usage["input_tokens"]),
    outputTokens: toNumber(usage["output_tokens"]),
    cacheCreationInputTokens: toNumber(usage["cache_creation_input_tokens"]),
    cacheReadInputTokens: toNumber(usage["cache_read_input_tokens"]),
  };

  const modelUsage = parseModelUsage(resultEntry["modelUsage"]);

  return {
    totalCostUSD: toNumber(resultEntry["total_cost_usd"]),
    durationMs: toNumber(resultEntry["duration_ms"]),
    durationApiMs: toNumber(resultEntry["duration_api_ms"]),
    numTurns: toNumber(resultEntry["num_turns"]),
    usage: claudeUsage,
    modelUsage,
  };
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function parseModelUsage(raw: unknown): ModelUsageEntry[] {
  if (typeof raw !== "object" || raw === null) {
    return [];
  }

  const entries: ModelUsageEntry[] = [];
  // Assumes all keys in the modelUsage object are model identifiers.
  // If the CLI adds non-model metadata keys in future, they will appear
  // as entries with zeroed-out fields (harmless but worth noting).
  for (const [model, data] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof data !== "object" || data === null) continue;
    const d = data as Record<string, unknown>;
    entries.push({
      model,
      inputTokens: toNumber(d["inputTokens"]),
      outputTokens: toNumber(d["outputTokens"]),
      cacheReadInputTokens: toNumber(d["cacheReadInputTokens"]),
      cacheCreationInputTokens: toNumber(d["cacheCreationInputTokens"]),
      costUSD: toNumber(d["costUSD"]),
    });
  }
  return entries;
}

/**
 * Logs a formatted usage summary to the console.
 */
export function logUsageSummary(summary: UsageSummary): void {
  const sep = "─".repeat(50);
  console.log(`\n${sep}`);
  console.log("Claude Code — Usage Summary");
  console.log(sep);

  console.log(
    `  Cost:       $${summary.totalCostUSD.toFixed(4)} (reported by CLI — may differ from provider billing)`,
  );
  console.log(
    `  Duration:   ${(summary.durationMs / 1000).toFixed(1)}s total, ${(summary.durationApiMs / 1000).toFixed(1)}s API`,
  );
  console.log(`  Turns:      ${summary.numTurns}`);
  console.log(
    `  Input:      ${summary.usage.inputTokens.toLocaleString()} tokens`,
  );
  console.log(
    `  Output:     ${summary.usage.outputTokens.toLocaleString()} tokens`,
  );

  if (
    summary.usage.cacheReadInputTokens > 0 ||
    summary.usage.cacheCreationInputTokens > 0
  ) {
    console.log(
      `  Cache read: ${summary.usage.cacheReadInputTokens.toLocaleString()} tokens`,
    );
    console.log(
      `  Cache creation: ${summary.usage.cacheCreationInputTokens.toLocaleString()} tokens`,
    );
  }

  if (summary.modelUsage.length > 0) {
    console.log("");
    console.log("  Per-model breakdown:");
    for (const m of summary.modelUsage) {
      console.log(`    ${m.model}`);
      console.log(
        `      in=${m.inputTokens.toLocaleString()} out=${m.outputTokens.toLocaleString()} cost=$${m.costUSD.toFixed(4)}`,
      );
    }
  }

  console.log(sep);
}
