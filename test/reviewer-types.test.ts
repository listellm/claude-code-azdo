import { describe, test, expect } from "vitest";
import {
  REVIEWER_CONFIGS,
  buildReviewerSystemPrompt,
} from "../src/reviewer-types";

describe("REVIEWER_CONFIGS", () => {
  test("terraform fileExtensions includes .tf and .tfvars", () => {
    expect(REVIEWER_CONFIGS.terraform.fileExtensions).toContain(".tf");
    expect(REVIEWER_CONFIGS.terraform.fileExtensions).toContain(".tfvars");
  });

  test("yaml fileExtensions includes .yaml and .yml", () => {
    expect(REVIEWER_CONFIGS.yaml.fileExtensions).toContain(".yaml");
    expect(REVIEWER_CONFIGS.yaml.fileExtensions).toContain(".yml");
  });
});

describe("buildReviewerSystemPrompt", () => {
  test("returns empty string when no types enabled", () => {
    expect(buildReviewerSystemPrompt([])).toBe("");
  });

  test("terraform prompt contains NAMING, SECURITY, and ## Verdict", () => {
    const result = buildReviewerSystemPrompt(["terraform"]);
    expect(result).not.toBe("");
    expect(result).toContain("NAMING");
    expect(result).toContain("SECURITY");
    expect(result).toContain("## Verdict");
  });

  test("yaml prompt contains YAML references and ## Verdict", () => {
    const result = buildReviewerSystemPrompt(["yaml"]);
    expect(result).not.toBe("");
    expect(result).toContain("YAML");
    expect(result).toContain("## Verdict");
  });

  test("combined prompt contains content from both reviewers", () => {
    const result = buildReviewerSystemPrompt(["terraform", "yaml"]);
    expect(result).toContain("NAMING");
    expect(result).toContain("YAML");
    expect(result).toContain("## Verdict");
  });

  test("combined prompt sections are separated by double newline", () => {
    const terraform = buildReviewerSystemPrompt(["terraform"]);
    const yaml = buildReviewerSystemPrompt(["yaml"]);
    const combined = buildReviewerSystemPrompt(["terraform", "yaml"]);
    expect(combined).toBe(`${terraform}\n\n${yaml}`);
  });
});
