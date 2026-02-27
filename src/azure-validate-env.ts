import * as tl from "azure-pipelines-task-lib/task";
import { validateConfig } from "./validate-env-core";

/**
 * Validates task inputs required for running Claude Code.
 * Reads from Azure DevOps task inputs and delegates to the shared validation core.
 */
export function validateEnvironmentVariablesAzure(): void {
  const errors = validateConfig({
    useBedrock: tl.getBoolInput("use_bedrock", false),
    useVertex: tl.getBoolInput("use_vertex", false),
    anthropicApiKey:
      tl.getInput("anthropic_api_key", false) ??
      tl.getVariable("ANTHROPIC_API_KEY") ??
      undefined,
    claudeCodeOAuthToken:
      tl.getInput("claude_code_oauth_token", false) ?? undefined,
    awsRegion: tl.getInput("aws_region", false) ?? undefined,
    awsAccessKeyId: tl.getVariable("AWS_ACCESS_KEY_ID") ?? "",
    awsSecretAccessKey: tl.getVariable("AWS_SECRET_ACCESS_KEY") ?? "",
    vertexProjectId: tl.getInput("gcp_project_id", false) ?? undefined,
    vertexRegion: tl.getInput("gcp_region", false) ?? undefined,
    googleApplicationCredentials:
      tl.getVariable("GOOGLE_APPLICATION_CREDENTIALS") ?? "",
    prompt: tl.getInput("prompt", false) ?? undefined,
    promptFile: tl.getInput("prompt_file", false) ?? undefined,
  });

  if (errors.length > 0) {
    const errorMessage = `Task input validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
    throw new Error(errorMessage);
  }
}
