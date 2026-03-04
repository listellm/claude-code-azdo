import { readFile } from "fs/promises";

/**
 * Reads the execution JSON array written by the Claude CLI and returns
 * the first entry with `type: "result"` as a raw record, or null if
 * the file is missing, malformed, or contains no result entry.
 * Non-throwing.
 */
export async function readResultEntry(
  executionFile: string,
): Promise<Record<string, unknown> | null> {
  let raw: string;
  try {
    raw = await readFile(executionFile, "utf8");
  } catch {
    return null;
  }

  let entries: unknown[];
  try {
    entries = JSON.parse(raw) as unknown[];
  } catch {
    return null;
  }

  if (!Array.isArray(entries)) {
    return null;
  }

  const resultEntry = entries.find(
    (e): e is Record<string, unknown> =>
      typeof e === "object" &&
      e !== null &&
      (e as Record<string, unknown>)["type"] === "result",
  );

  return resultEntry ?? null;
}
