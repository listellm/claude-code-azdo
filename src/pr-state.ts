import { createHash } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { issueFingerprint, type ReviewIssue } from "./pr-comment-core";

const execFileAsync = promisify(execFile);

const SCHEMA_VERSION = 1;
const MAX_FINGERPRINTS = 500;

export interface PrStateFile {
  contentHash: string;
  issues: ReviewIssue[];
}

export interface PrState {
  schemaVersion: number;
  prId: string;
  org: string;
  project: string;
  lastRunAt: string;
  modelId: string;
  promptHash: string;
  postedFingerprints: string[];
  files: Record<string, PrStateFile>;
}

export interface S3Config {
  bucket: string;
  prefix: string;
  region: string;
}

/** SHA-256 hex digest prefixed with "sha256:" */
export function hashContent(content: string): string {
  return "sha256:" + createHash("sha256").update(content).digest("hex");
}

/** SHA-256 of the full appendSystemPrompt string */
export function hashPrompt(prompt: string): string {
  return hashContent(prompt);
}

function stateKey(
  prefix: string,
  org: string,
  project: string,
  prId: string,
): string {
  return `${prefix}/${org}/${project}/${prId}/state.json`;
}

/**
 * Reads PR state from S3.
 * Returns null on any error — callers treat null as "all files dirty".
 */
export async function readPrState(
  config: S3Config,
  org: string,
  project: string,
  prId: string,
): Promise<PrState | null> {
  const client = new S3Client({ region: config.region });
  const key = stateKey(config.prefix, org, project, prId);

  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    const body = await response.Body?.transformToString();
    if (!body) return null;
    const parsed = JSON.parse(body) as PrState;
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      console.log(
        `S3 state schema version mismatch (got ${parsed.schemaVersion}, expected ${SCHEMA_VERSION}) — full cache bust`,
      );
      return null;
    }
    return parsed;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `S3 state read failed — treating all files as dirty: ${message}`,
    );
    return null;
  }
}

/**
 * Writes PR state to S3.
 * Non-blocking — logs a warning on failure but does not throw.
 */
export async function writePrState(
  config: S3Config,
  state: PrState,
): Promise<void> {
  const client = new S3Client({ region: config.region });
  const key = stateKey(config.prefix, state.org, state.project, state.prId);

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: JSON.stringify(state, null, 2),
        ContentType: "application/json",
      }),
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`S3 state write failed (non-blocking): ${message}`);
  }
}

export interface DirtyFileResult {
  dirtyFiles: string[];
  fileHashes: Record<string, string>;
}

export type ExecFn = (cmd: string, args: string[]) => Promise<string>;

const defaultExecFn: ExecFn = async (cmd, args) => {
  const { stdout } = await execFileAsync(cmd, args);
  return stdout;
};

/**
 * Computes which files in the current diff are "dirty" relative to cached state.
 *
 * Dirty means either:
 *   - content hash differs from cached state, OR
 *   - full cache bust triggered (model or prompt changed, or no prior state)
 *
 * Falls back to returning all changed files as dirty if git commands fail.
 */
export async function computeDirtyFiles(
  targetBranch: string,
  state: PrState | null,
  modelId: string,
  promptHash: string,
  execFn: ExecFn = defaultExecFn,
): Promise<DirtyFileResult> {
  const fullBust =
    state === null ||
    state.modelId !== modelId ||
    state.promptHash !== promptHash;

  let changedFiles: string[];
  try {
    const stdout = await execFn("git", [
      "diff",
      "--name-only",
      `origin/${targetBranch}...HEAD`,
    ]);
    changedFiles = stdout
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`git diff failed — treating all files as dirty: ${message}`);
    return { dirtyFiles: [], fileHashes: {} };
  }

  const fileHashes: Record<string, string> = {};
  await Promise.all(
    changedFiles.map(async (file) => {
      try {
        const content = await execFn("git", ["show", `HEAD:${file}`]);
        fileHashes[file] = hashContent(content);
      } catch {
        // Deleted or unreadable file — treat as dirty with empty hash
        fileHashes[file] = hashContent("");
      }
    }),
  );

  if (fullBust) {
    return { dirtyFiles: changedFiles, fileHashes };
  }

  const dirtyFiles = changedFiles.filter((file) => {
    const cached = state.files[file];
    return !cached || cached.contentHash !== fileHashes[file];
  });

  return { dirtyFiles, fileHashes };
}

/**
 * Builds a preamble injected into the prompt when unchanged files exist.
 * Returns empty string when all files are dirty or there is no prior state.
 */
export function buildCachePreamble(
  dirtyFiles: string[],
  allChangedFiles: string[],
  state: PrState | null,
): string {
  if (!state || allChangedFiles.length === 0) return "";

  const unchangedFiles = allChangedFiles.filter((f) => !dirtyFiles.includes(f));
  if (unchangedFiles.length === 0) return "";

  const focusTarget =
    dirtyFiles.length > 0
      ? dirtyFiles.join(", ")
      : "(all files unchanged — review for context only)";

  return [
    "Cache context from previous review run:",
    `The following files are unchanged from the previous review and their issues are already captured. Focus your review on: ${focusTarget}.`,
    "You may still read unchanged files for context.",
    `Unchanged files (already reviewed): ${unchangedFiles.join(", ")}`,
    "",
    "",
  ].join("\n");
}

/**
 * Merges cached issues from unchanged files with newly found issues.
 */
export function mergeIssues(
  state: PrState | null,
  dirtyFiles: string[],
  newIssues: ReviewIssue[],
): ReviewIssue[] {
  if (!state) return newIssues;

  const dirtyFileSet = new Set(dirtyFiles);
  const cachedIssues: ReviewIssue[] = [];

  for (const [file, fileState] of Object.entries(state.files)) {
    if (!dirtyFileSet.has(file)) {
      cachedIssues.push(...fileState.issues);
    }
  }

  return [...cachedIssues, ...newIssues];
}

/**
 * Removes issues whose fingerprints are already in postedFingerprints.
 */
export function deduplicateByFingerprints(
  issues: ReviewIssue[],
  postedFingerprints: Set<string>,
): ReviewIssue[] {
  return issues.filter(
    (issue) => !postedFingerprints.has(issueFingerprint(issue)),
  );
}

/**
 * Builds the updated PrState after a run completes.
 *
 * - Carries forward unchanged files from existing state
 * - Updates dirty files with new content hashes and issues
 * - Appends newly posted fingerprints, capped at MAX_FINGERPRINTS
 */
export function buildUpdatedState(
  existing: PrState | null,
  prId: string,
  org: string,
  project: string,
  modelId: string,
  promptHash: string,
  fileHashes: Record<string, string>,
  dirtyFiles: string[],
  newIssues: ReviewIssue[],
  newlyPostedIssues: ReviewIssue[],
): PrState {
  const dirtyFileSet = new Set(dirtyFiles);

  const files: Record<string, PrStateFile> = {};

  // Carry forward unchanged files from existing state
  if (existing) {
    for (const [file, fileState] of Object.entries(existing.files)) {
      if (!dirtyFileSet.has(file)) {
        files[file] = fileState;
      }
    }
  }

  // Update dirty files with issues from this run
  for (const file of dirtyFiles) {
    files[file] = {
      contentHash: fileHashes[file] ?? hashContent(""),
      issues: newIssues.filter((i) => i.file === file),
    };
  }

  // Append newly posted fingerprints, rotate oldest if over cap
  const existingFingerprints = existing?.postedFingerprints ?? [];
  const newFingerprints = newlyPostedIssues.map(issueFingerprint);
  const allFingerprints = [...existingFingerprints, ...newFingerprints];
  const cappedFingerprints =
    allFingerprints.length > MAX_FINGERPRINTS
      ? allFingerprints.slice(allFingerprints.length - MAX_FINGERPRINTS)
      : allFingerprints;

  return {
    schemaVersion: SCHEMA_VERSION,
    prId,
    org,
    project,
    lastRunAt: new Date().toISOString(),
    modelId,
    promptHash,
    postedFingerprints: cappedFingerprints,
    files,
  };
}
