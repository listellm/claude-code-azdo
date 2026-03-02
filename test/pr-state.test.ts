import { describe, test, expect } from "vitest";
import {
  buildCachePreamble,
  buildUpdatedState,
  computeDirtyFiles,
  deduplicateByFingerprints,
  hashContent,
  hashPrompt,
  mergeIssues,
  type ExecFn,
  type PrState,
} from "../src/pr-state";
import { issueFingerprint, type ReviewIssue } from "../src/pr-comment-core";

// ---------------------------------------------------------------------------
// hashContent / hashPrompt
// ---------------------------------------------------------------------------

describe("hashContent", () => {
  test("returns a sha256: prefixed hex string", () => {
    const h = hashContent("hello");
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test("same input produces same hash", () => {
    expect(hashContent("hello")).toBe(hashContent("hello"));
  });

  test("different inputs produce different hashes", () => {
    expect(hashContent("foo")).not.toBe(hashContent("bar"));
  });

  test("empty string produces consistent hash", () => {
    const h = hashContent("");
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(h).toBe(hashContent(""));
  });
});

describe("hashPrompt", () => {
  test("delegates to hashContent — same result", () => {
    const prompt = "You are a terraform reviewer.";
    expect(hashPrompt(prompt)).toBe(hashContent(prompt));
  });
});

// ---------------------------------------------------------------------------
// issueFingerprint
// ---------------------------------------------------------------------------

describe("issueFingerprint", () => {
  test("encodes severity|file|line|description", () => {
    const issue: ReviewIssue = {
      severity: "WARNING",
      file: "modules/vpc/main.tf",
      line: 42,
      description: "Password stored in plaintext",
    };
    expect(issueFingerprint(issue)).toBe(
      "WARNING|modules/vpc/main.tf|42|Password stored in plaintext",
    );
  });

  test("uses empty string for missing file", () => {
    const issue: ReviewIssue = {
      severity: "SUGGESTION",
      description: "Consider using a module",
    };
    expect(issueFingerprint(issue)).toBe(
      "SUGGESTION|||Consider using a module",
    );
  });

  test("uses empty string for missing line", () => {
    const issue: ReviewIssue = {
      severity: "CRITICAL",
      file: "main.tf",
      description: "No encryption",
    };
    expect(issueFingerprint(issue)).toBe("CRITICAL|main.tf||No encryption");
  });
});

// ---------------------------------------------------------------------------
// computeDirtyFiles
// ---------------------------------------------------------------------------

function buildExecFn(
  diffOutput: string,
  fileContents: Record<string, string> = {},
): ExecFn {
  return async (cmd, args) => {
    if (args.includes("--name-only")) {
      return diffOutput;
    }
    // git show HEAD:{file}
    const showArg = args.find((a) => a.startsWith("HEAD:"));
    if (showArg) {
      const file = showArg.slice("HEAD:".length);
      if (file in fileContents) return fileContents[file]!;
      throw new Error(`File not found: ${file}`);
    }
    throw new Error(`Unexpected exec call: ${cmd} ${args.join(" ")}`);
  };
}

describe("computeDirtyFiles", () => {
  const baseState: PrState = {
    schemaVersion: 1,
    prId: "42",
    org: "my-org",
    project: "my-project",
    lastRunAt: "2026-03-01T10:00:00Z",
    modelId: "claude-sonnet-4-6",
    promptHash: hashContent("my-prompt"),
    postedFingerprints: [],
    files: {
      "modules/vpc/main.tf": {
        contentHash: hashContent("vpc content"),
        issues: [],
      },
      "modules/rds/main.tf": {
        contentHash: hashContent("rds content"),
        issues: [],
      },
    },
  };

  test("returns all files as dirty when state is null", async () => {
    const execFn = buildExecFn("a.tf\nb.tf\n", {
      "a.tf": "content-a",
      "b.tf": "content-b",
    });
    const result = await computeDirtyFiles(
      "main",
      null,
      "claude-sonnet-4-6",
      hashContent("prompt"),
      execFn,
    );
    expect(result.dirtyFiles).toEqual(["a.tf", "b.tf"]);
    expect(Object.keys(result.fileHashes)).toEqual(["a.tf", "b.tf"]);
  });

  test("returns all files as dirty when modelId differs", async () => {
    const execFn = buildExecFn("modules/vpc/main.tf\n", {
      "modules/vpc/main.tf": "vpc content",
    });
    const result = await computeDirtyFiles(
      "main",
      baseState,
      "claude-opus-4-6",
      baseState.promptHash,
      execFn,
    );
    expect(result.dirtyFiles).toEqual(["modules/vpc/main.tf"]);
  });

  test("returns all files as dirty when promptHash differs", async () => {
    const execFn = buildExecFn("modules/rds/main.tf\n", {
      "modules/rds/main.tf": "rds content",
    });
    const result = await computeDirtyFiles(
      "main",
      baseState,
      baseState.modelId,
      hashContent("different-prompt"),
      execFn,
    );
    expect(result.dirtyFiles).toEqual(["modules/rds/main.tf"]);
  });

  test("returns only files whose content changed", async () => {
    const execFn = buildExecFn("modules/vpc/main.tf\nmodules/rds/main.tf\n", {
      "modules/vpc/main.tf": "vpc content", // unchanged
      "modules/rds/main.tf": "rds content CHANGED", // changed
    });
    const result = await computeDirtyFiles(
      "main",
      baseState,
      baseState.modelId,
      baseState.promptHash,
      execFn,
    );
    expect(result.dirtyFiles).toEqual(["modules/rds/main.tf"]);
    expect(Object.keys(result.fileHashes)).toContain("modules/vpc/main.tf");
    expect(Object.keys(result.fileHashes)).toContain("modules/rds/main.tf");
  });

  test("returns empty arrays when git diff fails", async () => {
    const execFn: ExecFn = async () => {
      throw new Error("git not found");
    };
    const result = await computeDirtyFiles(
      "main",
      null,
      "claude-sonnet-4-6",
      hashContent("prompt"),
      execFn,
    );
    expect(result.dirtyFiles).toEqual([]);
    expect(result.fileHashes).toEqual({});
  });

  test("uses empty hash for deleted files (git show fails)", async () => {
    const execFn: ExecFn = async (_cmd, args) => {
      if (args.includes("--name-only")) return "deleted.tf\n";
      throw new Error("File not found");
    };
    const result = await computeDirtyFiles(
      "main",
      null,
      "claude-sonnet-4-6",
      hashContent("prompt"),
      execFn,
    );
    expect(result.fileHashes["deleted.tf"]).toBe(hashContent(""));
    expect(result.dirtyFiles).toContain("deleted.tf");
  });
});

// ---------------------------------------------------------------------------
// buildCachePreamble
// ---------------------------------------------------------------------------

describe("buildCachePreamble", () => {
  const state: PrState = {
    schemaVersion: 1,
    prId: "1",
    org: "my-org",
    project: "my-project",
    lastRunAt: "",
    modelId: "m",
    promptHash: "p",
    postedFingerprints: [],
    files: {},
  };

  test("returns empty string when state is null", () => {
    expect(buildCachePreamble(["a.tf"], ["a.tf"], null)).toBe("");
  });

  test("returns empty string when allChangedFiles is empty", () => {
    expect(buildCachePreamble([], [], state)).toBe("");
  });

  test("returns empty string when all files are dirty", () => {
    expect(buildCachePreamble(["a.tf", "b.tf"], ["a.tf", "b.tf"], state)).toBe(
      "",
    );
  });

  test("mentions unchanged files when some are clean", () => {
    const preamble = buildCachePreamble(["a.tf"], ["a.tf", "b.tf"], state);
    expect(preamble).toContain("b.tf");
    expect(preamble).toContain("a.tf");
    expect(preamble).toContain("unchanged");
  });

  test("handles no dirty files (all unchanged)", () => {
    const preamble = buildCachePreamble([], ["a.tf", "b.tf"], state);
    expect(preamble).toContain("all files unchanged");
    expect(preamble).toContain("a.tf");
    expect(preamble).toContain("b.tf");
  });
});

// ---------------------------------------------------------------------------
// mergeIssues
// ---------------------------------------------------------------------------

describe("mergeIssues", () => {
  const cachedIssue: ReviewIssue = {
    severity: "WARNING",
    file: "unchanged.tf",
    line: 1,
    description: "cached issue",
  };

  const newIssue: ReviewIssue = {
    severity: "CRITICAL",
    file: "changed.tf",
    line: 5,
    description: "new issue",
  };

  const state: PrState = {
    schemaVersion: 1,
    prId: "1",
    org: "my-org",
    project: "my-project",
    lastRunAt: "",
    modelId: "m",
    promptHash: "p",
    postedFingerprints: [],
    files: {
      "unchanged.tf": {
        contentHash: hashContent("unchanged"),
        issues: [cachedIssue],
      },
      "changed.tf": {
        contentHash: hashContent("old"),
        issues: [],
      },
    },
  };

  test("returns newIssues unchanged when state is null", () => {
    expect(mergeIssues(null, ["changed.tf"], [newIssue])).toEqual([newIssue]);
  });

  test("merges cached issues from unchanged files with new issues", () => {
    const result = mergeIssues(state, ["changed.tf"], [newIssue]);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual(cachedIssue);
    expect(result).toContainEqual(newIssue);
  });

  test("does not include cached issues for dirty files", () => {
    const result = mergeIssues(
      state,
      ["unchanged.tf", "changed.tf"],
      [newIssue],
    );
    expect(result).not.toContainEqual(cachedIssue);
    expect(result).toContainEqual(newIssue);
  });
});

// ---------------------------------------------------------------------------
// deduplicateByFingerprints
// ---------------------------------------------------------------------------

describe("deduplicateByFingerprints", () => {
  const issue1: ReviewIssue = {
    severity: "WARNING",
    file: "a.tf",
    line: 1,
    description: "issue one",
  };
  const issue2: ReviewIssue = {
    severity: "CRITICAL",
    file: "b.tf",
    line: 2,
    description: "issue two",
  };

  test("returns all issues when fingerprints set is empty", () => {
    const result = deduplicateByFingerprints([issue1, issue2], new Set());
    expect(result).toHaveLength(2);
  });

  test("removes issue whose fingerprint is in the set", () => {
    const fp = issueFingerprint(issue1);
    const result = deduplicateByFingerprints([issue1, issue2], new Set([fp]));
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(issue2);
  });

  test("returns empty array when all issues are already posted", () => {
    const fps = new Set([issueFingerprint(issue1), issueFingerprint(issue2)]);
    expect(deduplicateByFingerprints([issue1, issue2], fps)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildUpdatedState
// ---------------------------------------------------------------------------

describe("buildUpdatedState", () => {
  const existingState: PrState = {
    schemaVersion: 1,
    prId: "10",
    org: "my-org",
    project: "my-project",
    lastRunAt: "2026-03-01T10:00:00Z",
    modelId: "claude-sonnet-4-6",
    promptHash: hashContent("old-prompt"),
    postedFingerprints: ["WARNING||1|existing issue"],
    files: {
      "stable.tf": {
        contentHash: hashContent("stable content"),
        issues: [
          { severity: "SUGGESTION", file: "stable.tf", description: "minor" },
        ],
      },
      "changed.tf": {
        contentHash: hashContent("old content"),
        issues: [],
      },
    },
  };

  const newIssue: ReviewIssue = {
    severity: "CRITICAL",
    file: "changed.tf",
    line: 3,
    description: "new critical",
  };

  const postedIssue: ReviewIssue = { ...newIssue };

  test("carries forward unchanged file from existing state", () => {
    const updated = buildUpdatedState(
      existingState,
      "10",
      "my-org",
      "my-project",
      "claude-sonnet-4-6",
      hashContent("new-prompt"),
      { "changed.tf": hashContent("new content") },
      ["changed.tf"],
      [newIssue],
      [postedIssue],
    );
    expect(updated.files["stable.tf"]).toEqual(
      existingState.files["stable.tf"],
    );
  });

  test("updates dirty file with new hash and issues", () => {
    const newHash = hashContent("new content");
    const updated = buildUpdatedState(
      existingState,
      "10",
      "my-org",
      "my-project",
      "claude-sonnet-4-6",
      hashContent("new-prompt"),
      { "changed.tf": newHash },
      ["changed.tf"],
      [newIssue],
      [postedIssue],
    );
    expect(updated.files["changed.tf"]).toEqual({
      contentHash: newHash,
      issues: [newIssue],
    });
  });

  test("appends newly posted fingerprints to postedFingerprints", () => {
    const updated = buildUpdatedState(
      existingState,
      "10",
      "my-org",
      "my-project",
      "claude-sonnet-4-6",
      hashContent("new-prompt"),
      { "changed.tf": hashContent("new content") },
      ["changed.tf"],
      [newIssue],
      [postedIssue],
    );
    expect(updated.postedFingerprints).toContain("WARNING||1|existing issue");
    expect(updated.postedFingerprints).toContain(issueFingerprint(postedIssue));
  });

  test("builds fresh state when existing is null", () => {
    const updated = buildUpdatedState(
      null,
      "5",
      "my-org",
      "my-project",
      "claude-sonnet-4-6",
      hashContent("prompt"),
      { "a.tf": hashContent("content") },
      ["a.tf"],
      [newIssue],
      [],
    );
    expect(updated.prId).toBe("5");
    expect(updated.org).toBe("my-org");
    expect(updated.project).toBe("my-project");
    expect(updated.postedFingerprints).toHaveLength(0);
    expect(Object.keys(updated.files)).toEqual(["a.tf"]);
  });

  test("caps postedFingerprints at 500, rotating oldest", () => {
    const existingWith500: PrState = {
      ...existingState,
      postedFingerprints: Array.from({ length: 500 }, (_, i) => `fp-${i}`),
    };
    const updated = buildUpdatedState(
      existingWith500,
      "10",
      "my-org",
      "my-project",
      "claude-sonnet-4-6",
      hashContent("prompt"),
      {},
      [],
      [],
      [{ severity: "WARNING", description: "new posted" }],
    );
    expect(updated.postedFingerprints).toHaveLength(500);
    // Oldest entry (fp-0) should be rotated out
    expect(updated.postedFingerprints).not.toContain("fp-0");
    expect(updated.postedFingerprints).toContain("fp-1");
  });

  test("sets schemaVersion to 1 and updates lastRunAt", () => {
    const before = Date.now();
    const updated = buildUpdatedState(
      null,
      "1",
      "my-org",
      "my-project",
      "m",
      "p",
      {},
      [],
      [],
      [],
    );
    const after = Date.now();
    expect(updated.schemaVersion).toBe(1);
    const runAt = new Date(updated.lastRunAt).getTime();
    expect(runAt).toBeGreaterThanOrEqual(before);
    expect(runAt).toBeLessThanOrEqual(after);
  });
});
