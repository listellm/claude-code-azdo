import * as path from "path";
import { readdir, readFile, stat } from "fs/promises";
import type { Stats } from "fs";
import { sanitiseContent } from "./sanitise";

/** Maximum total bytes of file content before truncation. */
export const MAX_CONTEXT_BYTES = 50 * 1024;

/** Reads directory entries (non-recursive). */
export type ReadDirFn = (dirPath: string) => Promise<string[]>;

/** Reads a file's content as UTF-8. */
export type ReadFileFn = (filePath: string) => Promise<string>;

/** Stats a file path. */
export type StatFn = (filePath: string) => Promise<Stats>;

export interface ContextDirOptions {
  readDirFn?: ReadDirFn;
  readFileFn?: ReadFileFn;
  statFn?: StatFn;
}

export interface ContextPreambleResult {
  content: string;
  fileCount: number;
  totalBytes: number;
}

const defaultReadDir: ReadDirFn = (dirPath) => readdir(dirPath);
const defaultReadFile: ReadFileFn = (filePath) => readFile(filePath, "utf-8");
const defaultStat: StatFn = (filePath) => stat(filePath);

/**
 * Reads all files from a directory and formats them as read-only context
 * suitable for prompt injection.
 *
 * Files are read non-recursively and sorted alphabetically for determinism.
 * Returns `{ content: "", fileCount: 0, totalBytes: 0 }` when the directory
 * is missing, empty, or the path is blank/undefined.
 */
export async function buildContextPreamble(
  dirPath: string | undefined,
  options?: ContextDirOptions,
): Promise<ContextPreambleResult> {
  const EMPTY: ContextPreambleResult = {
    content: "",
    fileCount: 0,
    totalBytes: 0,
  };

  if (!dirPath || dirPath.trim().length === 0) {
    return EMPTY;
  }

  const readDirFn = options?.readDirFn ?? defaultReadDir;
  const readFileFn = options?.readFileFn ?? defaultReadFile;
  const statFn = options?.statFn ?? defaultStat;

  // Attempt to list the directory; bail out if it doesn't exist
  let entries: string[];
  try {
    entries = await readDirFn(dirPath);
  } catch {
    console.warn(
      `Context directory does not exist or is unreadable: ${dirPath}`,
    );
    return EMPTY;
  }

  if (entries.length === 0) {
    console.warn(`Context directory is empty: ${dirPath}`);
    return EMPTY;
  }

  // Sort alphabetically for deterministic output
  entries.sort();

  // Filter to regular files only
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    try {
      const stats = await statFn(fullPath);
      if (stats.isFile()) {
        files.push(entry);
      }
    } catch {
      console.warn(`Skipping unreadable entry: ${fullPath}`);
    }
  }

  if (files.length === 0) {
    console.warn(`Context directory contains no readable files: ${dirPath}`);
    return EMPTY;
  }

  // Build formatted output with size guard
  const sections: string[] = [];
  let totalBytes = 0;

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    let content: string;
    try {
      content = await readFileFn(fullPath);
    } catch {
      console.warn(`Skipping unreadable file: ${fullPath}`);
      continue;
    }

    content = sanitiseContent(content);
    const contentBytes = Buffer.byteLength(content, "utf-8");
    if (totalBytes + contentBytes > MAX_CONTEXT_BYTES) {
      console.warn(
        `Context size cap reached (${MAX_CONTEXT_BYTES} bytes). ` +
          `Skipping ${file} and all remaining files.`,
      );
      break;
    }

    totalBytes += contentBytes;
    sections.push(`# ${file}\n${content}`);
  }

  if (sections.length === 0) {
    return EMPTY;
  }

  const content =
    "Reference files (read-only context \u2014 do not modify):\n" +
    "---\n" +
    sections.join("\n---\n") +
    "\n---\n\n";

  return { content, fileCount: sections.length, totalBytes };
}
