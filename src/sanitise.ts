/**
 * Content sanitisation module.
 *
 * Seven layers of sanitisation chained by sanitiseContent().
 * Pure synchronous functions with zero project dependencies.
 */

/** Layer 1: Strip HTML comments. */
export function stripHtmlComments(content: string): string {
  return content.replace(/<!--[\s\S]*?-->/g, "");
}

/** Layer 2: Strip invisible and control characters (preserving \t \n \r). */
export function stripInvisibleCharacters(content: string): string {
  // Zero-width and formatting chars, C0 controls (except \t \n \r), C1 controls
  return content.replace(
    // eslint-disable-next-line no-control-regex
    /[\u200B\u200C\u200D\uFEFF\u2060\u2061-\u2064\u180E\u00AD\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g,
    "",
  );
}

/** Layer 3: Strip alt text from Markdown images while preserving the image syntax. */
export function stripMarkdownImageAltText(content: string): string {
  // Match ![...](  allowing one level of nested brackets inside the alt text
  // so that ![inject[x]](url) is caught rather than bypassing the strip.
  return content.replace(/!\[((?:[^\[\]]*\[[^\]]*\])*[^\]]*)\]\(/g, "![](");
}

/** Layer 4: Strip title attributes from Markdown links. */
export function stripMarkdownLinkTitles(content: string): string {
  return content
    .replace(/(\[[^\]]*\]\([^\s)]+)\s+"[^"]*"/g, "$1")
    .replace(/(\[[^\]]*\]\([^\s)]+)\s+'[^']*'/g, "$1");
}

/** Layer 5: Strip hidden HTML attributes (alt, title, aria-*, data-*). */
export function stripHiddenHtmlAttributes(content: string): string {
  return content.replace(
    /(alt|title|aria-label|aria-description|data-[\w-]+)\s*=\s*("[^"]*"|'[^']*')/gi,
    "",
  );
}

const NAMED_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
};

/** Layer 6: Decode HTML entities to printable ASCII or strip them. */
export function normaliseHtmlEntities(content: string): string {
  let result = content;

  // Named entities
  for (const [entity, replacement] of Object.entries(NAMED_ENTITIES)) {
    result = result.split(entity).join(replacement);
  }

  // Decimal numeric entities
  result = result.replace(/&#(\d+);/g, (_match, digits: string) => {
    const code = parseInt(digits, 10);
    return code >= 32 && code <= 126 ? String.fromCharCode(code) : "";
  });

  // Hex numeric entities
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) => {
    const code = parseInt(hex, 16);
    return code >= 32 && code <= 126 ? String.fromCharCode(code) : "";
  });

  return result;
}

/** Layer 7: Redact known API token patterns. */
export function redactApiTokens(content: string): string {
  return content
    .replace(/github_pat_[A-Za-z0-9_]{22,}/g, "[GITHUB_TOKEN_REDACTED]")
    .replace(/gh[psor]_[A-Za-z0-9_]{36,}/g, "[GITHUB_TOKEN_REDACTED]")
    .replace(/sk-ant-[a-zA-Z0-9_-]{20,}/g, "[ANTHROPIC_KEY_REDACTED]")
    .replace(/AKIA[0-9A-Z]{16}/g, "[AWS_KEY_REDACTED]")
    .replace(
      /(password|token|authorization|pat)\s*[:=]\s*[a-z2-7]{52}\b/gi,
      "$1: [ADO_PAT_REDACTED]",
    );
}

/** Chain all 7 sanitisation layers. For user-controlled metadata and context files. */
export function sanitiseContent(content: string): string {
  let result = content;
  result = stripHtmlComments(result);
  result = stripInvisibleCharacters(result);
  result = stripMarkdownImageAltText(result);
  result = stripMarkdownLinkTitles(result);
  result = stripHiddenHtmlAttributes(result);
  result = normaliseHtmlEntities(result);
  result = redactApiTokens(result);
  return result;
}

/**
 * Sanitise diff content using only layers that preserve code semantics.
 * Skips markdown stripping (layers 3-4), HTML attribute stripping (layer 5),
 * and entity normalisation (layer 6) to avoid altering code content in diffs.
 */
export function sanitiseDiffContent(content: string): string {
  let result = content;
  result = stripHtmlComments(result);
  result = stripInvisibleCharacters(result);
  result = redactApiTokens(result);
  return result;
}
