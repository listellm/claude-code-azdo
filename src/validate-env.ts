import { validateConfig } from "./validate-env-core";

/**
 * Validates environment variables required for running Claude Code.
 * Reads from process.env and delegates to the shared validation core.
 */
export function validateEnvironmentVariables(): void {
  const errors = validateConfig({
    useBedrock: process.env.CLAUDE_CODE_USE_BEDROCK === "1",
    useVertex: process.env.CLAUDE_CODE_USE_VERTEX === "1",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    claudeCodeOAuthToken: process.env.CLAUDE_CODE_OAUTH_TOKEN,
    awsRegion: process.env.AWS_REGION,
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    vertexProjectId: process.env.ANTHROPIC_VERTEX_PROJECT_ID,
    vertexRegion: process.env.CLOUD_ML_REGION,
    // GOOGLE_APPLICATION_CREDENTIALS not checked in non-Azure usage
  });

  if (errors.length > 0) {
    const errorMessage = `Environment variable validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
    throw new Error(errorMessage);
  }
}
