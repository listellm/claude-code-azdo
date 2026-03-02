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

  test("dotnet_core fileExtensions includes .cs and .csproj", () => {
    expect(REVIEWER_CONFIGS.dotnet_core.fileExtensions).toContain(".cs");
    expect(REVIEWER_CONFIGS.dotnet_core.fileExtensions).toContain(".csproj");
  });

  test("golang fileExtensions includes .go", () => {
    expect(REVIEWER_CONFIGS.golang.fileExtensions).toContain(".go");
  });

  test("java fileExtensions includes .java", () => {
    expect(REVIEWER_CONFIGS.java.fileExtensions).toContain(".java");
  });

  test("javascript fileExtensions includes .js, .mjs, and .cjs", () => {
    expect(REVIEWER_CONFIGS.javascript.fileExtensions).toContain(".js");
    expect(REVIEWER_CONFIGS.javascript.fileExtensions).toContain(".mjs");
    expect(REVIEWER_CONFIGS.javascript.fileExtensions).toContain(".cjs");
  });

  test("nextjs fileExtensions includes .tsx and .ts", () => {
    expect(REVIEWER_CONFIGS.nextjs.fileExtensions).toContain(".tsx");
    expect(REVIEWER_CONFIGS.nextjs.fileExtensions).toContain(".ts");
  });

  test("php fileExtensions includes .php", () => {
    expect(REVIEWER_CONFIGS.php.fileExtensions).toContain(".php");
  });

  test("powershell_core fileExtensions includes .ps1, .psm1, and .psd1", () => {
    expect(REVIEWER_CONFIGS.powershell_core.fileExtensions).toContain(".ps1");
    expect(REVIEWER_CONFIGS.powershell_core.fileExtensions).toContain(".psm1");
    expect(REVIEWER_CONFIGS.powershell_core.fileExtensions).toContain(".psd1");
  });

  test("python fileExtensions includes .py", () => {
    expect(REVIEWER_CONFIGS.python.fileExtensions).toContain(".py");
  });

  test("rust fileExtensions includes .rs", () => {
    expect(REVIEWER_CONFIGS.rust.fileExtensions).toContain(".rs");
  });

  test("sql fileExtensions includes .sql", () => {
    expect(REVIEWER_CONFIGS.sql.fileExtensions).toContain(".sql");
  });

  test("typescript fileExtensions includes .ts and .tsx", () => {
    expect(REVIEWER_CONFIGS.typescript.fileExtensions).toContain(".ts");
    expect(REVIEWER_CONFIGS.typescript.fileExtensions).toContain(".tsx");
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

  test("dotnet_core prompt contains ASYNC PATTERNS, DEPENDENCY INJECTION, and ## Verdict", () => {
    const result = buildReviewerSystemPrompt(["dotnet_core"]);
    expect(result).not.toBe("");
    expect(result).toContain("ASYNC PATTERNS");
    expect(result).toContain("DEPENDENCY INJECTION");
    expect(result).toContain("## Verdict");
  });

  test("golang prompt contains ERROR HANDLING, CONCURRENCY, and ## Verdict", () => {
    const result = buildReviewerSystemPrompt(["golang"]);
    expect(result).not.toBe("");
    expect(result).toContain("ERROR HANDLING");
    expect(result).toContain("CONCURRENCY");
    expect(result).toContain("## Verdict");
  });

  test("java prompt contains NULL SAFETY, RESOURCE MANAGEMENT, and ## Verdict", () => {
    const result = buildReviewerSystemPrompt(["java"]);
    expect(result).not.toBe("");
    expect(result).toContain("NULL SAFETY");
    expect(result).toContain("RESOURCE MANAGEMENT");
    expect(result).toContain("## Verdict");
  });

  test("javascript prompt contains LANGUAGE PATTERNS, MODULE STRUCTURE, and ## Verdict", () => {
    const result = buildReviewerSystemPrompt(["javascript"]);
    expect(result).not.toBe("");
    expect(result).toContain("LANGUAGE PATTERNS");
    expect(result).toContain("MODULE STRUCTURE");
    expect(result).toContain("## Verdict");
  });

  test("nextjs prompt contains APP ROUTER, DATA FETCHING, and ## Verdict", () => {
    const result = buildReviewerSystemPrompt(["nextjs"]);
    expect(result).not.toBe("");
    expect(result).toContain("APP ROUTER");
    expect(result).toContain("DATA FETCHING");
    expect(result).toContain("## Verdict");
  });

  test("php prompt contains TYPE SAFETY, PSR-12, and ## Verdict", () => {
    const result = buildReviewerSystemPrompt(["php"]);
    expect(result).not.toBe("");
    expect(result).toContain("TYPE SAFETY");
    expect(result).toContain("PSR-12");
    expect(result).toContain("## Verdict");
  });

  test("powershell_core prompt contains PARAMETER HANDLING, CmdletBinding, and ## Verdict", () => {
    const result = buildReviewerSystemPrompt(["powershell_core"]);
    expect(result).not.toBe("");
    expect(result).toContain("PARAMETER HANDLING");
    expect(result).toContain("CmdletBinding");
    expect(result).toContain("## Verdict");
  });

  test("python prompt contains RESOURCE MANAGEMENT, SECURITY, and ## Verdict", () => {
    const result = buildReviewerSystemPrompt(["python"]);
    expect(result).not.toBe("");
    expect(result).toContain("RESOURCE MANAGEMENT");
    expect(result).toContain("SECURITY");
    expect(result).toContain("## Verdict");
  });

  test("rust prompt contains OWNERSHIP AND BORROWING, ERROR HANDLING, and ## Verdict", () => {
    const result = buildReviewerSystemPrompt(["rust"]);
    expect(result).not.toBe("");
    expect(result).toContain("OWNERSHIP AND BORROWING");
    expect(result).toContain("ERROR HANDLING");
    expect(result).toContain("## Verdict");
  });

  test("sql prompt contains QUERY CORRECTNESS, SCHEMA DESIGN, and ## Verdict", () => {
    const result = buildReviewerSystemPrompt(["sql"]);
    expect(result).not.toBe("");
    expect(result).toContain("QUERY CORRECTNESS");
    expect(result).toContain("SCHEMA DESIGN");
    expect(result).toContain("## Verdict");
  });

  test("typescript prompt contains TYPE SAFETY, ASYNC PATTERNS, and ## Verdict", () => {
    const result = buildReviewerSystemPrompt(["typescript"]);
    expect(result).not.toBe("");
    expect(result).toContain("TYPE SAFETY");
    expect(result).toContain("ASYNC PATTERNS");
    expect(result).toContain("## Verdict");
  });

  test("combined prompt contains content from all sixteen reviewers", () => {
    const result = buildReviewerSystemPrompt([
      "terraform",
      "yaml",
      "helm",
      "cilium",
      "dockerfile",
      "dotnet_core",
      "golang",
      "java",
      "javascript",
      "nextjs",
      "php",
      "powershell_core",
      "python",
      "rust",
      "sql",
      "typescript",
    ]);
    expect(result).toContain("NAMING");
    expect(result).toContain("KUBERNETES");
    expect(result).toContain("CHART STRUCTURE");
    expect(result).toContain("SELECTOR CORRECTNESS");
    expect(result).toContain("BASE IMAGE HYGIENE");
    expect(result).toContain("DEPENDENCY INJECTION");
    expect(result).toContain("CONCURRENCY");
    expect(result).toContain("NULL SAFETY");
    expect(result).toContain("LANGUAGE PATTERNS");
    expect(result).toContain("APP ROUTER");
    expect(result).toContain("PSR-12");
    expect(result).toContain("CmdletBinding");
    expect(result).toContain("OWNERSHIP AND BORROWING");
    expect(result).toContain("QUERY CORRECTNESS");
    expect(result).toContain("## Verdict");
  });

  test("combined prompt sections are separated by double newline", () => {
    const terraform = buildReviewerSystemPrompt(["terraform"]);
    const yaml = buildReviewerSystemPrompt(["yaml"]);
    const combined = buildReviewerSystemPrompt(["terraform", "yaml"]);
    expect(combined).toBe(`${terraform}\n\n${yaml}`);
  });

  test("all sixteen combined prompt preserves ordering", () => {
    const allKeys = [
      "terraform",
      "yaml",
      "helm",
      "cilium",
      "dockerfile",
      "dotnet_core",
      "golang",
      "java",
      "javascript",
      "nextjs",
      "php",
      "powershell_core",
      "python",
      "rust",
      "sql",
      "typescript",
    ] as const;
    const all = buildReviewerSystemPrompt([...allKeys]);
    const parts = allKeys.map((k) => buildReviewerSystemPrompt([k]));
    expect(all).toBe(parts.join("\n\n"));
  });
});
