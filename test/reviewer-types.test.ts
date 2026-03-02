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

  test("helm fileExtensions includes .yaml, .yml, and .tpl", () => {
    expect(REVIEWER_CONFIGS.helm.fileExtensions).toContain(".yaml");
    expect(REVIEWER_CONFIGS.helm.fileExtensions).toContain(".yml");
    expect(REVIEWER_CONFIGS.helm.fileExtensions).toContain(".tpl");
  });

  test("cilium fileExtensions includes .yaml and .yml", () => {
    expect(REVIEWER_CONFIGS.cilium.fileExtensions).toContain(".yaml");
    expect(REVIEWER_CONFIGS.cilium.fileExtensions).toContain(".yml");
  });

  test("dockerfile fileExtensions includes Dockerfile", () => {
    expect(REVIEWER_CONFIGS.dockerfile.fileExtensions).toContain("Dockerfile");
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

  test("helm prompt contains CHART STRUCTURE and ## Verdict", () => {
    const result = buildReviewerSystemPrompt(["helm"]);
    expect(result).not.toBe("");
    expect(result).toContain("CHART STRUCTURE");
    expect(result).toContain("TEMPLATE CORRECTNESS");
    expect(result).toContain("## Verdict");
  });

  test("cilium prompt contains SELECTOR CORRECTNESS and ## Verdict", () => {
    const result = buildReviewerSystemPrompt(["cilium"]);
    expect(result).not.toBe("");
    expect(result).toContain("SELECTOR CORRECTNESS");
    expect(result).toContain("DEFAULT-DENY POSTURE");
    expect(result).toContain("## Verdict");
  });

  test("dockerfile prompt contains BASE IMAGE HYGIENE and ## Verdict", () => {
    const result = buildReviewerSystemPrompt(["dockerfile"]);
    expect(result).not.toBe("");
    expect(result).toContain("BASE IMAGE HYGIENE");
    expect(result).toContain("MULTI-STAGE BUILDS");
    expect(result).toContain("## Verdict");
  });

  test("combined prompt contains content from all five reviewers", () => {
    const result = buildReviewerSystemPrompt([
      "terraform",
      "yaml",
      "helm",
      "cilium",
      "dockerfile",
    ]);
    expect(result).toContain("NAMING");
    expect(result).toContain("KUBERNETES");
    expect(result).toContain("CHART STRUCTURE");
    expect(result).toContain("SELECTOR CORRECTNESS");
    expect(result).toContain("BASE IMAGE HYGIENE");
    expect(result).toContain("## Verdict");
  });

  test("combined prompt sections are separated by double newline", () => {
    const terraform = buildReviewerSystemPrompt(["terraform"]);
    const yaml = buildReviewerSystemPrompt(["yaml"]);
    const combined = buildReviewerSystemPrompt(["terraform", "yaml"]);
    expect(combined).toBe(`${terraform}\n\n${yaml}`);
  });

  test("all five combined prompt preserves ordering", () => {
    const all = buildReviewerSystemPrompt([
      "terraform",
      "yaml",
      "helm",
      "cilium",
      "dockerfile",
    ]);
    const parts = [
      buildReviewerSystemPrompt(["terraform"]),
      buildReviewerSystemPrompt(["yaml"]),
      buildReviewerSystemPrompt(["helm"]),
      buildReviewerSystemPrompt(["cilium"]),
      buildReviewerSystemPrompt(["dockerfile"]),
    ];
    expect(all).toBe(parts.join("\n\n"));
  });
});
