import { describe, test, expect } from "vitest";
import {
  validateConfig,
  type ValidationConfig,
} from "../src/validate-env-core";

describe("validateConfig", () => {
  describe("Direct Anthropic API", () => {
    test("passes when ANTHROPIC_API_KEY is provided", () => {
      const errors = validateConfig({
        useBedrock: false,
        useVertex: false,
        anthropicApiKey: "sk-test",
      });
      expect(errors).toHaveLength(0);
    });

    test("passes when claudeCodeOAuthToken is provided", () => {
      const errors = validateConfig({
        useBedrock: false,
        useVertex: false,
        claudeCodeOAuthToken: "oauth-token",
      });
      expect(errors).toHaveLength(0);
    });

    test("fails when neither API key nor OAuth token is provided", () => {
      const errors = validateConfig({ useBedrock: false, useVertex: false });
      expect(errors).toContain(
        "Either ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN is required when using direct Anthropic API.",
      );
    });
  });

  describe("AWS Bedrock", () => {
    const validBedrock: ValidationConfig = {
      useBedrock: true,
      useVertex: false,
      awsRegion: "eu-west-1",
      awsAccessKeyId: "AKIAIOSFODNN7EXAMPLE",
      awsSecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    };

    test("passes when all required Bedrock fields are provided", () => {
      expect(validateConfig(validBedrock)).toHaveLength(0);
    });

    test("fails when awsRegion is missing", () => {
      const errors = validateConfig({ ...validBedrock, awsRegion: undefined });
      expect(errors).toContain(
        "AWS_REGION is required when using AWS Bedrock.",
      );
    });

    test("fails when awsAccessKeyId is missing", () => {
      const errors = validateConfig({
        ...validBedrock,
        awsAccessKeyId: undefined,
      });
      expect(errors).toContain(
        "AWS_ACCESS_KEY_ID is required when using AWS Bedrock.",
      );
    });

    test("fails when awsSecretAccessKey is missing", () => {
      const errors = validateConfig({
        ...validBedrock,
        awsSecretAccessKey: undefined,
      });
      expect(errors).toContain(
        "AWS_SECRET_ACCESS_KEY is required when using AWS Bedrock.",
      );
    });

    test("reports all missing Bedrock fields at once", () => {
      const errors = validateConfig({ useBedrock: true, useVertex: false });
      expect(errors).toContain(
        "AWS_REGION is required when using AWS Bedrock.",
      );
      expect(errors).toContain(
        "AWS_ACCESS_KEY_ID is required when using AWS Bedrock.",
      );
      expect(errors).toContain(
        "AWS_SECRET_ACCESS_KEY is required when using AWS Bedrock.",
      );
    });
  });

  describe("Google Vertex AI", () => {
    const validVertex: ValidationConfig = {
      useBedrock: false,
      useVertex: true,
      vertexProjectId: "my-gcp-project",
      vertexRegion: "us-central1",
    };

    test("passes when all required Vertex fields are provided", () => {
      expect(validateConfig(validVertex)).toHaveLength(0);
    });

    test("passes when googleApplicationCredentials is set", () => {
      const errors = validateConfig({
        ...validVertex,
        googleApplicationCredentials: "/path/to/creds.json",
      });
      expect(errors).toHaveLength(0);
    });

    test("fails when vertexProjectId is missing", () => {
      const errors = validateConfig({
        ...validVertex,
        vertexProjectId: undefined,
      });
      expect(errors).toContain(
        "ANTHROPIC_VERTEX_PROJECT_ID is required when using Google Vertex AI.",
      );
    });

    test("fails when vertexRegion is missing", () => {
      const errors = validateConfig({
        ...validVertex,
        vertexRegion: undefined,
      });
      expect(errors).toContain(
        "CLOUD_ML_REGION is required when using Google Vertex AI.",
      );
    });

    test("fails when googleApplicationCredentials is empty string", () => {
      const errors = validateConfig({
        ...validVertex,
        googleApplicationCredentials: "",
      });
      expect(errors).toContain(
        "GOOGLE_APPLICATION_CREDENTIALS must be configured as a pipeline variable when using Google Vertex AI.",
      );
    });

    test("skips GOOGLE_APPLICATION_CREDENTIALS check when field is undefined", () => {
      // Non-Azure callers omit this field entirely — should not trigger the error
      const errors = validateConfig({
        ...validVertex,
        googleApplicationCredentials: undefined,
      });
      expect(errors).not.toContain(
        "GOOGLE_APPLICATION_CREDENTIALS must be configured as a pipeline variable when using Google Vertex AI.",
      );
    });

    test("reports all missing Vertex fields at once", () => {
      const errors = validateConfig({
        useBedrock: false,
        useVertex: true,
        googleApplicationCredentials: "",
      });
      expect(errors).toContain(
        "ANTHROPIC_VERTEX_PROJECT_ID is required when using Google Vertex AI.",
      );
      expect(errors).toContain(
        "CLOUD_ML_REGION is required when using Google Vertex AI.",
      );
      expect(errors).toContain(
        "GOOGLE_APPLICATION_CREDENTIALS must be configured as a pipeline variable when using Google Vertex AI.",
      );
    });
  });

  describe("Mutual exclusion", () => {
    test("fails when both Bedrock and Vertex are enabled", () => {
      const errors = validateConfig({
        useBedrock: true,
        useVertex: true,
        awsRegion: "eu-west-1",
        awsAccessKeyId: "key",
        awsSecretAccessKey: "secret",
        vertexProjectId: "project",
        vertexRegion: "us-central1",
      });
      expect(errors).toContain(
        "Cannot use both Bedrock and Vertex AI simultaneously. Please set only one provider.",
      );
      // Should return early — no branch-specific errors
      expect(errors).toHaveLength(1);
    });
  });

  describe("Prompt validation", () => {
    const baseConfig: ValidationConfig = {
      useBedrock: false,
      useVertex: false,
      anthropicApiKey: "sk-test",
    };

    test("skips prompt checks when neither field is passed", () => {
      const errors = validateConfig(baseConfig);
      expect(errors).toHaveLength(0);
    });

    test("passes when only prompt is provided", () => {
      const errors = validateConfig({
        ...baseConfig,
        prompt: "Do something",
        promptFile: undefined,
      });
      expect(errors).toHaveLength(0);
    });

    test("passes when only promptFile is provided", () => {
      const errors = validateConfig({
        ...baseConfig,
        prompt: undefined,
        promptFile: "/path/to/prompt.txt",
      });
      expect(errors).toHaveLength(0);
    });

    test("fails when both prompt and promptFile are provided", () => {
      const errors = validateConfig({
        ...baseConfig,
        prompt: "Do something",
        promptFile: "/path/to/prompt.txt",
      });
      expect(errors).toContain(
        "Both 'prompt' and 'prompt_file' inputs were provided. Please specify only one.",
      );
    });

    test("fails when prompt field is present but empty", () => {
      const errors = validateConfig({
        ...baseConfig,
        prompt: "   ",
        promptFile: undefined,
      });
      expect(errors).toContain(
        "Either 'prompt' or 'prompt_file' input is required.",
      );
    });

    test("fails when promptFile field is present but empty string", () => {
      const errors = validateConfig({
        ...baseConfig,
        prompt: undefined,
        promptFile: "",
      });
      expect(errors).toContain(
        "Either 'prompt' or 'prompt_file' input is required.",
      );
    });
  });
});
