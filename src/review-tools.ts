/**
 * Tool restriction logic for review mode.
 *
 * When reviewers are enabled and the user has not explicitly set allowed_tools,
 * we restrict Bash to read-only git commands and block web-access tools.
 * This reduces attack surface and aligns with the read-only nature of reviews.
 */

/** Default allowed tools applied when no reviewers are active and the user has not overridden. */
export const DEFAULT_ALLOWED_TOOLS = "Bash,Read,Glob,Grep";

/** Restricted tool set for review mode: Bash limited to read-only git commands. */
export const REVIEW_ALLOWED_TOOLS =
  "Read,Glob,Grep,Bash(git diff:*),Bash(git log:*),Bash(git show:*)";

/** Tools always disallowed in review mode. */
export const REVIEW_DISALLOWED_TOOLS = ["WebSearch", "WebFetch"] as const;

export type ToolRestrictionInput = {
  /** Whether any reviewers are enabled. */
  reviewersEnabled: boolean;
  /** Raw `allowed_tools` value from user input (undefined = not set). */
  userAllowedTools: string | undefined;
  /** Raw `disallowed_tools` value from user input (undefined = not set). */
  userDisallowedTools: string | undefined;
};

export type ToolRestrictionResult = {
  allowedTools: string | undefined;
  disallowedTools: string | undefined;
};

/**
 * Merges user-provided disallowed tools with review-mode disallowed tools,
 * deduplicating entries.
 */
function mergeDisallowedTools(
  userDisallowed: string | undefined,
  reviewDisallowed: readonly string[],
): string {
  const existing = userDisallowed
    ? userDisallowed
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const existingSet = new Set(existing);
  for (const tool of reviewDisallowed) {
    if (!existingSet.has(tool)) {
      existing.push(tool);
    }
  }

  return existing.join(",");
}

/**
 * Resolves the effective allowed_tools and disallowed_tools based on
 * reviewer state and user overrides.
 *
 * Pure function with no AzDo imports.
 */
export function resolveToolRestrictions(
  input: ToolRestrictionInput,
): ToolRestrictionResult {
  if (!input.reviewersEnabled) {
    return {
      allowedTools: input.userAllowedTools ?? DEFAULT_ALLOWED_TOOLS,
      disallowedTools: input.userDisallowedTools,
    };
  }

  // Review mode
  const allowedTools = input.userAllowedTools ?? REVIEW_ALLOWED_TOOLS;
  const disallowedTools = mergeDisallowedTools(
    input.userDisallowedTools,
    REVIEW_DISALLOWED_TOOLS,
  );

  return { allowedTools, disallowedTools };
}
