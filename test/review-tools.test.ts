import { describe, test, expect } from "vitest";
import {
  DEFAULT_ALLOWED_TOOLS,
  REVIEW_ALLOWED_TOOLS,
  REVIEW_DISALLOWED_TOOLS,
  resolveToolRestrictions,
} from "../src/review-tools";

describe("resolveToolRestrictions", () => {
  test("no reviewers, no user override returns DEFAULT_ALLOWED_TOOLS", () => {
    const result = resolveToolRestrictions({
      reviewersEnabled: false,
      userAllowedTools: undefined,
      userDisallowedTools: undefined,
    });
    expect(result.allowedTools).toBe(DEFAULT_ALLOWED_TOOLS);
    expect(result.disallowedTools).toBeUndefined();
  });

  test("no reviewers, user sets allowed_tools passes through", () => {
    const result = resolveToolRestrictions({
      reviewersEnabled: false,
      userAllowedTools: "Read,Glob",
      userDisallowedTools: undefined,
    });
    expect(result.allowedTools).toBe("Read,Glob");
    expect(result.disallowedTools).toBeUndefined();
  });

  test("no reviewers, user sets disallowed_tools passes through", () => {
    const result = resolveToolRestrictions({
      reviewersEnabled: false,
      userAllowedTools: undefined,
      userDisallowedTools: "Bash",
    });
    expect(result.allowedTools).toBe(DEFAULT_ALLOWED_TOOLS);
    expect(result.disallowedTools).toBe("Bash");
  });

  test("reviewers enabled, no user override returns REVIEW_ALLOWED_TOOLS", () => {
    const result = resolveToolRestrictions({
      reviewersEnabled: true,
      userAllowedTools: undefined,
      userDisallowedTools: undefined,
    });
    expect(result.allowedTools).toBe(REVIEW_ALLOWED_TOOLS);
  });

  test("reviewers enabled, no user override disallows WebSearch and WebFetch", () => {
    const result = resolveToolRestrictions({
      reviewersEnabled: true,
      userAllowedTools: undefined,
      userDisallowedTools: undefined,
    });
    expect(result.disallowedTools).toContain("WebSearch");
    expect(result.disallowedTools).toContain("WebFetch");
  });

  test("reviewers enabled, user overrides allowed_tools respects user value", () => {
    const result = resolveToolRestrictions({
      reviewersEnabled: true,
      userAllowedTools: "Bash,Read",
      userDisallowedTools: undefined,
    });
    expect(result.allowedTools).toBe("Bash,Read");
  });

  test("reviewers enabled, user overrides allowed_tools still merges review disallowed", () => {
    const result = resolveToolRestrictions({
      reviewersEnabled: true,
      userAllowedTools: "Bash,Read",
      userDisallowedTools: undefined,
    });
    expect(result.disallowedTools).toContain("WebSearch");
    expect(result.disallowedTools).toContain("WebFetch");
  });

  test("reviewers enabled, user sets disallowed_tools merges without duplicates", () => {
    const result = resolveToolRestrictions({
      reviewersEnabled: true,
      userAllowedTools: undefined,
      userDisallowedTools: "Edit,Write",
    });
    const tools = result.disallowedTools!.split(",");
    expect(tools).toContain("Edit");
    expect(tools).toContain("Write");
    expect(tools).toContain("WebSearch");
    expect(tools).toContain("WebFetch");
  });

  test("reviewers enabled, user disallowed already has WebSearch produces no duplicate", () => {
    const result = resolveToolRestrictions({
      reviewersEnabled: true,
      userAllowedTools: undefined,
      userDisallowedTools: "WebSearch,Edit",
    });
    const tools = result.disallowedTools!.split(",");
    const webSearchCount = tools.filter((t) => t === "WebSearch").length;
    expect(webSearchCount).toBe(1);
    expect(tools).toContain("WebFetch");
    expect(tools).toContain("Edit");
  });
});

describe("constants", () => {
  test("DEFAULT_ALLOWED_TOOLS matches previous task.json default", () => {
    expect(DEFAULT_ALLOWED_TOOLS).toBe("Bash,Read,Glob,Grep");
  });

  test("REVIEW_ALLOWED_TOOLS restricts Bash to git read commands", () => {
    expect(REVIEW_ALLOWED_TOOLS).toContain("Read");
    expect(REVIEW_ALLOWED_TOOLS).toContain("Glob");
    expect(REVIEW_ALLOWED_TOOLS).toContain("Grep");
    expect(REVIEW_ALLOWED_TOOLS).toContain("Bash(git diff:*)");
    expect(REVIEW_ALLOWED_TOOLS).toContain("Bash(git log:*)");
    expect(REVIEW_ALLOWED_TOOLS).toContain("Bash(git show:*)");
    expect(REVIEW_ALLOWED_TOOLS).not.toMatch(/^Bash,/);
    expect(REVIEW_ALLOWED_TOOLS).not.toMatch(/,Bash,/);
  });

  test("REVIEW_DISALLOWED_TOOLS contains WebSearch and WebFetch", () => {
    expect(REVIEW_DISALLOWED_TOOLS).toContain("WebSearch");
    expect(REVIEW_DISALLOWED_TOOLS).toContain("WebFetch");
  });
});
