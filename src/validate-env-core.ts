/**
 * Shared validation logic for Claude Code provider configuration.
 * Accepts a plain config object and returns a list of error strings.
 * Callers are responsible for reading inputs from their respective sources
 * (process.env or Azure DevOps task inputs) and formatting the final error.
 */

export type ValidationConfig = {
  useBedrock: boolean;
  useVertex: boolean;
  anthropicApiKey?: string;
  claudeCodeOAuthToken?: string;
  // AWS Bedrock
  awsRegion?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  // Google Vertex AI
  vertexProjectId?: string;
  vertexRegion?: string;
  // Pass undefined to skip this check (non-Azure callers), empty string to fail
  googleApplicationCredentials?: string;
  // Prompt validation — only checked when at least one field is non-undefined
  prompt?: string;
  promptFile?: string;
};

export function validateConfig(config: ValidationConfig): string[] {
  const errors: string[] = [];

  if (config.useBedrock && config.useVertex) {
    errors.push(
      "Cannot use both Bedrock and Vertex AI simultaneously. Please set only one provider.",
    );
    // Return early — the branch-specific checks below would both fire and produce noise
    return errors;
  }

  if (!config.useBedrock && !config.useVertex) {
    if (!config.anthropicApiKey && !config.claudeCodeOAuthToken) {
      errors.push(
        "Either ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN is required when using direct Anthropic API.",
      );
    }
  } else if (config.useBedrock) {
    if (!config.awsRegion) {
      errors.push("AWS_REGION is required when using AWS Bedrock.");
    }
    if (!config.awsAccessKeyId) {
      errors.push("AWS_ACCESS_KEY_ID is required when using AWS Bedrock.");
    }
    if (!config.awsSecretAccessKey) {
      errors.push("AWS_SECRET_ACCESS_KEY is required when using AWS Bedrock.");
    }
  } else if (config.useVertex) {
    if (!config.vertexProjectId) {
      errors.push(
        "ANTHROPIC_VERTEX_PROJECT_ID is required when using Google Vertex AI.",
      );
    }
    if (!config.vertexRegion) {
      errors.push("CLOUD_ML_REGION is required when using Google Vertex AI.");
    }
    // Only validate when the caller explicitly passes this field (Azure only)
    if (
      config.googleApplicationCredentials !== undefined &&
      !config.googleApplicationCredentials
    ) {
      errors.push(
        "GOOGLE_APPLICATION_CREDENTIALS must be configured as a pipeline variable when using Google Vertex AI.",
      );
    }
  }

  // Prompt validation — only run when the caller passes these fields
  if (config.prompt !== undefined || config.promptFile !== undefined) {
    const hasPrompt = !!(config.prompt && config.prompt.trim());
    const hasPromptFile = !!config.promptFile;

    if (!hasPrompt && !hasPromptFile) {
      errors.push("Either 'prompt' or 'prompt_file' input is required.");
    } else if (hasPrompt && hasPromptFile) {
      errors.push(
        "Both 'prompt' and 'prompt_file' inputs were provided. Please specify only one.",
      );
    }
  }

  return errors;
}
