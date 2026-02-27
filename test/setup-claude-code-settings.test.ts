import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { setupClaudeCodeSettings } from "../src/setup-claude-code-settings";
import { readFile, rm, mkdir } from "fs/promises";
import { existsSync } from "fs";
import * as path from "path";
import * as os from "os";

describe("setupClaudeCodeSettings", () => {
  const testHome = path.join(
    os.tmpdir(),
    `claude-settings-test-${process.pid}`,
  );
  const settingsDir = path.join(testHome, ".claude");
  const settingsPath = path.join(settingsDir, "settings.json");

  // Redirect homedir to our test directory
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;

  beforeEach(async () => {
    await mkdir(testHome, { recursive: true });
    process.env.HOME = testHome;
    process.env.USERPROFILE = testHome;
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;
    await rm(testHome, { recursive: true, force: true });
  });

  test("creates settings file with enableAllProjectMcpServers when none exists", async () => {
    await setupClaudeCodeSettings();

    expect(existsSync(settingsPath)).toBe(true);
    const content = JSON.parse(await readFile(settingsPath, "utf-8")) as Record<
      string,
      unknown
    >;
    expect(content.enableAllProjectMcpServers).toBe(true);
  });

  test("merges enableAllProjectMcpServers into existing settings", async () => {
    await mkdir(settingsDir, { recursive: true });
    const existing = { someOtherSetting: "value", anotherKey: 42 };
    const { writeFile } = await import("fs/promises");
    await writeFile(settingsPath, JSON.stringify(existing));

    await setupClaudeCodeSettings();

    const content = JSON.parse(await readFile(settingsPath, "utf-8")) as Record<
      string,
      unknown
    >;
    expect(content.enableAllProjectMcpServers).toBe(true);
    expect(content.someOtherSetting).toBe("value");
    expect(content.anotherKey).toBe(42);
  });

  test("handles empty settings file gracefully", async () => {
    await mkdir(settingsDir, { recursive: true });
    const { writeFile } = await import("fs/promises");
    await writeFile(settingsPath, "   ");

    await setupClaudeCodeSettings();

    const content = JSON.parse(await readFile(settingsPath, "utf-8")) as Record<
      string,
      unknown
    >;
    expect(content.enableAllProjectMcpServers).toBe(true);
  });

  test("handles corrupted settings file gracefully", async () => {
    await mkdir(settingsDir, { recursive: true });
    const { writeFile } = await import("fs/promises");
    await writeFile(settingsPath, "{ invalid json {{");

    // Should not throw — falls back to empty settings
    await expect(setupClaudeCodeSettings()).resolves.not.toThrow();

    const content = JSON.parse(await readFile(settingsPath, "utf-8")) as Record<
      string,
      unknown
    >;
    expect(content.enableAllProjectMcpServers).toBe(true);
  });

  test("creates .claude directory if it does not exist", async () => {
    expect(existsSync(settingsDir)).toBe(false);

    await setupClaudeCodeSettings();

    expect(existsSync(settingsDir)).toBe(true);
    expect(existsSync(settingsPath)).toBe(true);
  });
});
