import { describe, test, expect, vi } from "vitest";
import {
  buildContextPreamble,
  MAX_CONTEXT_BYTES,
  type ContextDirOptions,
  type ContextPreambleResult,
} from "../src/context-dir";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FakeFile {
  content: string;
  readable?: boolean;
}

/**
 * Builds ContextDirOptions backed by an in-memory file map.
 * Keys are filenames; values describe content and readability.
 * Entries where `content` is `null` are treated as subdirectories.
 */
function makeFakeFs(files: Record<string, FakeFile | null>): ContextDirOptions {
  return {
    readDirFn: async () => Object.keys(files),
    readFileFn: async (filePath: string) => {
      const name = filePath.split("/").pop()!;
      const entry = files[name];
      if (!entry || entry.readable === false) {
        throw new Error(`EACCES: permission denied, open '${filePath}'`);
      }
      return entry.content;
    },
    statFn: async (filePath: string) => {
      const name = filePath.split("/").pop()!;
      const entry = files[name];
      if (!entry) {
        // null entry = subdirectory
        return {
          size: 0,
          isFile: () => false,
        } as any;
      }
      if (entry.readable === false) {
        throw new Error(`EACCES: permission denied, stat '${filePath}'`);
      }
      return {
        size: Buffer.byteLength(entry.content, "utf-8"),
        isFile: () => true,
      } as any;
    },
  };
}

// ---------------------------------------------------------------------------
// buildContextPreamble
// ---------------------------------------------------------------------------

describe("buildContextPreamble", () => {
  const EMPTY: ContextPreambleResult = {
    content: "",
    fileCount: 0,
    totalBytes: 0,
  };

  test("returns empty result when dirPath is empty string", async () => {
    expect(await buildContextPreamble("")).toEqual(EMPTY);
  });

  test("returns empty result when dirPath is undefined", async () => {
    expect(await buildContextPreamble(undefined)).toEqual(EMPTY);
  });

  test("returns empty result when dirPath is whitespace only", async () => {
    expect(await buildContextPreamble("   ")).toEqual(EMPTY);
  });

  test("returns empty result when directory cannot be read", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const opts: ContextDirOptions = {
      readDirFn: async () => {
        throw new Error("ENOENT: no such file or directory");
      },
    };

    const result = await buildContextPreamble("/nonexistent", opts);

    expect(result).toEqual(EMPTY);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("does not exist or is unreadable"),
    );
    warnSpy.mockRestore();
  });

  test("returns empty result when directory has no files (only subdirectories)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const opts = makeFakeFs({
      subdir_a: null,
      subdir_b: null,
    });

    const result = await buildContextPreamble("/some/dir", opts);

    expect(result).toEqual(EMPTY);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("contains no readable files"),
    );
    warnSpy.mockRestore();
  });

  test("returns empty result when directory is empty", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const opts: ContextDirOptions = {
      readDirFn: async () => [],
    };

    const result = await buildContextPreamble("/empty", opts);

    expect(result).toEqual(EMPTY);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("is empty"));
    warnSpy.mockRestore();
  });

  test("formats a single file with header and separators", async () => {
    const content = "key: value\n";
    const opts = makeFakeFs({
      "values.yaml": { content },
    });

    const result = await buildContextPreamble("/ctx", opts);

    expect(result.content).toBe(
      "Reference files (read-only context \u2014 do not modify):\n" +
        "---\n" +
        "# values.yaml\n" +
        "key: value\n" +
        "\n---\n\n",
    );
    expect(result.fileCount).toBe(1);
    expect(result.totalBytes).toBe(Buffer.byteLength(content, "utf-8"));
  });

  test("formats multiple files in alphabetical order", async () => {
    const files = {
      "zebra.yaml": { content: "z: 1" },
      "alpha.yaml": { content: "a: 1" },
      "middle.yaml": { content: "m: 1" },
    };
    const opts = makeFakeFs(files);

    const result = await buildContextPreamble("/ctx", opts);

    const lines = result.content.split("\n");
    // Header
    expect(lines[0]).toBe(
      "Reference files (read-only context \u2014 do not modify):",
    );
    // Files in alphabetical order
    expect(result.content).toContain("# alpha.yaml");
    expect(result.content).toContain("# middle.yaml");
    expect(result.content).toContain("# zebra.yaml");

    // Verify order: alpha before middle before zebra
    const alphaIdx = result.content.indexOf("# alpha.yaml");
    const middleIdx = result.content.indexOf("# middle.yaml");
    const zebraIdx = result.content.indexOf("# zebra.yaml");
    expect(alphaIdx).toBeLessThan(middleIdx);
    expect(middleIdx).toBeLessThan(zebraIdx);

    // Metadata
    expect(result.fileCount).toBe(3);
    const expectedBytes = Object.values(files).reduce(
      (sum, f) => sum + Buffer.byteLength(f.content, "utf-8"),
      0,
    );
    expect(result.totalBytes).toBe(expectedBytes);
  });

  test("skips unreadable files and continues with remaining", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const opts = makeFakeFs({
      "a-good.yaml": { content: "good: true" },
      "b-broken.yaml": { content: "broken", readable: false },
      "c-also-good.yaml": { content: "also: good" },
    });

    const result = await buildContextPreamble("/ctx", opts);

    expect(result.content).toContain("# a-good.yaml");
    expect(result.content).not.toContain("# b-broken.yaml");
    expect(result.content).toContain("# c-also-good.yaml");
    expect(result.fileCount).toBe(2);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipping unreadable"),
    );
    warnSpy.mockRestore();
  });

  test("enforces 50 KB limit — truncates at file boundary", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Create a file just under the cap
    const bigContent = "x".repeat(MAX_CONTEXT_BYTES - 100);
    const smallContent = "y".repeat(200); // This would push over

    const opts = makeFakeFs({
      "a-big.yaml": { content: bigContent },
      "b-small.yaml": { content: smallContent },
    });

    const result = await buildContextPreamble("/ctx", opts);

    expect(result.content).toContain("# a-big.yaml");
    expect(result.content).not.toContain("# b-small.yaml");
    expect(result.fileCount).toBe(1);
    expect(result.totalBytes).toBe(Buffer.byteLength(bigContent, "utf-8"));
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Context size cap reached"),
    );
    warnSpy.mockRestore();
  });

  test("includes all files when total is exactly at the limit", async () => {
    // Two files whose content totals exactly MAX_CONTEXT_BYTES
    const halfSize = MAX_CONTEXT_BYTES / 2;
    const opts = makeFakeFs({
      "a.txt": { content: "a".repeat(halfSize) },
      "b.txt": { content: "b".repeat(halfSize) },
    });

    const result = await buildContextPreamble("/ctx", opts);

    expect(result.content).toContain("# a.txt");
    expect(result.content).toContain("# b.txt");
    expect(result.fileCount).toBe(2);
    expect(result.totalBytes).toBe(MAX_CONTEXT_BYTES);
  });

  test("ends with trailing double newline for clean prompt concatenation", async () => {
    const opts = makeFakeFs({
      "test.yaml": { content: "hello: world" },
    });

    const result = await buildContextPreamble("/ctx", opts);

    expect(result.content).toMatch(/---\n\n$/);
  });

  test("skips subdirectories but includes files alongside them", async () => {
    const opts = makeFakeFs({
      "a-file.yaml": { content: "data: 1" },
      "b-subdir": null,
      "c-file.yaml": { content: "data: 2" },
    });

    const result = await buildContextPreamble("/ctx", opts);

    expect(result.content).toContain("# a-file.yaml");
    expect(result.content).not.toContain("# b-subdir");
    expect(result.content).toContain("# c-file.yaml");
    expect(result.fileCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// MAX_CONTEXT_BYTES constant
// ---------------------------------------------------------------------------

describe("MAX_CONTEXT_BYTES", () => {
  test("is 50 KB", () => {
    expect(MAX_CONTEXT_BYTES).toBe(50 * 1024);
  });
});
