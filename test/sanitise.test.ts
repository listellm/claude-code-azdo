import { describe, it, expect } from "vitest";
import {
  sanitiseContent,
  sanitiseDiffContent,
  stripHtmlComments,
  stripInvisibleCharacters,
  stripMarkdownImageAltText,
  stripMarkdownLinkTitles,
  stripHiddenHtmlAttributes,
  normaliseHtmlEntities,
  redactApiTokens,
} from "../src/sanitise";

describe("stripHtmlComments", () => {
  it("removes a single-line comment", () => {
    expect(stripHtmlComments("before <!-- hidden --> after")).toBe(
      "before  after",
    );
  });

  it("removes a multi-line comment", () => {
    const input = "before <!-- line1\nline2\nline3 --> after";
    expect(stripHtmlComments(input)).toBe("before  after");
  });

  it("removes multiple comments in one string", () => {
    const input = "<!-- a -->keep<!-- b -->this<!-- c -->";
    expect(stripHtmlComments(input)).toBe("keepthis");
  });

  it("preserves text that is not a comment", () => {
    const input = "no comments here";
    expect(stripHtmlComments(input)).toBe("no comments here");
  });
});

describe("stripInvisibleCharacters", () => {
  it.each([
    ["\u200B", "ZERO WIDTH SPACE"],
    ["\u200C", "ZERO WIDTH NON-JOINER"],
    ["\u200D", "ZERO WIDTH JOINER"],
    ["\uFEFF", "BOM / ZERO WIDTH NO-BREAK SPACE"],
    ["\u2060", "WORD JOINER"],
    ["\u2061", "FUNCTION APPLICATION"],
    ["\u180E", "MONGOLIAN VOWEL SEPARATOR"],
    ["\u00AD", "SOFT HYPHEN"],
  ])("removes %s (%s)", (char) => {
    expect(stripInvisibleCharacters(`a${char}b`)).toBe("ab");
  });

  it("preserves tab, newline, and carriage return", () => {
    expect(stripInvisibleCharacters("a\tb\nc\r")).toBe("a\tb\nc\r");
  });

  it("removes C0 control characters", () => {
    expect(stripInvisibleCharacters(`a\u0001b\u0002c`)).toBe("abc");
  });

  it("removes C1 control characters", () => {
    expect(stripInvisibleCharacters(`a\u0080b\u009Fc`)).toBe("abc");
  });
});

describe("stripMarkdownImageAltText", () => {
  it("strips alt text from a markdown image", () => {
    expect(
      stripMarkdownImageAltText(
        "![hidden injection](https://example.com/img.png)",
      ),
    ).toBe("![](https://example.com/img.png)");
  });

  it("preserves an image with empty alt text", () => {
    expect(stripMarkdownImageAltText("![](https://example.com/img.png)")).toBe(
      "![](https://example.com/img.png)",
    );
  });

  it("strips alt text from multiple images in one string", () => {
    const input = "![alt1](url1) text ![alt2](url2)";
    expect(stripMarkdownImageAltText(input)).toBe("![](url1) text ![](url2)");
  });

  it("strips alt text containing nested brackets", () => {
    expect(stripMarkdownImageAltText("![inject[x]](url)")).toBe("![](url)");
  });

  it("does not touch regular markdown links", () => {
    const input = "[link text](https://example.com)";
    expect(stripMarkdownImageAltText(input)).toBe(
      "[link text](https://example.com)",
    );
  });
});

describe("stripMarkdownLinkTitles", () => {
  it("strips a double-quoted title from a link", () => {
    expect(stripMarkdownLinkTitles('[text](https://example.com "title")')).toBe(
      "[text](https://example.com)",
    );
  });

  it("strips a single-quoted title from a link", () => {
    expect(stripMarkdownLinkTitles("[text](https://example.com 'title')")).toBe(
      "[text](https://example.com)",
    );
  });

  it("preserves links without titles", () => {
    expect(stripMarkdownLinkTitles("[text](https://example.com)")).toBe(
      "[text](https://example.com)",
    );
  });
});

describe("stripHiddenHtmlAttributes", () => {
  it("strips alt attribute", () => {
    expect(stripHiddenHtmlAttributes('<img alt="secret" src="x">')).toBe(
      '<img  src="x">',
    );
  });

  it("strips title attribute", () => {
    expect(stripHiddenHtmlAttributes('<a title="hidden">link</a>')).toBe(
      "<a >link</a>",
    );
  });

  it("strips aria-label attribute", () => {
    expect(
      stripHiddenHtmlAttributes('<div aria-label="inject">text</div>'),
    ).toBe("<div >text</div>");
  });

  it("strips data-* attribute", () => {
    expect(stripHiddenHtmlAttributes('<span data-foo="bar">text</span>')).toBe(
      "<span >text</span>",
    );
  });

  it("is case insensitive", () => {
    expect(stripHiddenHtmlAttributes('<img ALT="secret" SRC="x">')).toBe(
      '<img  SRC="x">',
    );
  });

  it("preserves class, id, and href attributes", () => {
    const input = '<a class="link" id="main" href="url">text</a>';
    expect(stripHiddenHtmlAttributes(input)).toBe(input);
  });
});

describe("normaliseHtmlEntities", () => {
  it("decodes decimal entity &#65; to A", () => {
    expect(normaliseHtmlEntities("&#65;")).toBe("A");
  });

  it("decodes hex entity &#x41; to A", () => {
    expect(normaliseHtmlEntities("&#x41;")).toBe("A");
  });

  it("strips non-printable decimal entity &#0;", () => {
    expect(normaliseHtmlEntities("&#0;")).toBe("");
  });

  it("strips control code entity &#7;", () => {
    expect(normaliseHtmlEntities("&#7;")).toBe("");
  });

  it("decodes &amp; to &", () => {
    expect(normaliseHtmlEntities("&amp;")).toBe("&");
  });

  it("decodes &lt; to <", () => {
    expect(normaliseHtmlEntities("&lt;")).toBe("<");
  });

  it("decodes &gt; to >", () => {
    expect(normaliseHtmlEntities("&gt;")).toBe(">");
  });

  it('decodes &quot; to "', () => {
    expect(normaliseHtmlEntities("&quot;")).toBe('"');
  });

  it("passes through text without entities", () => {
    const input = "nothing special here";
    expect(normaliseHtmlEntities(input)).toBe(input);
  });
});

describe("redactApiTokens", () => {
  it("redacts a GitHub personal access token (ghp_)", () => {
    const token = "ghp_" + "A".repeat(36);
    expect(redactApiTokens(`key: ${token}`)).toBe(
      "key: [GITHUB_TOKEN_REDACTED]",
    );
  });

  it("redacts a GitHub fine-grained token (github_pat_)", () => {
    const token = "github_pat_" + "B".repeat(22);
    expect(redactApiTokens(`key: ${token}`)).toBe(
      "key: [GITHUB_TOKEN_REDACTED]",
    );
  });

  it("redacts an Anthropic API key (sk-ant-)", () => {
    const token = "sk-ant-" + "C".repeat(20);
    expect(redactApiTokens(`key: ${token}`)).toBe(
      "key: [ANTHROPIC_KEY_REDACTED]",
    );
  });

  it("redacts an AWS access key (AKIA)", () => {
    const token = "AKIA" + "D".repeat(16);
    expect(redactApiTokens(`key: ${token}`)).toBe("key: [AWS_KEY_REDACTED]");
  });

  it('redacts an ADO PAT with "token: " context', () => {
    const pat = "a".repeat(52);
    expect(redactApiTokens(`token: ${pat}`)).toBe("token: [ADO_PAT_REDACTED]");
  });

  it('redacts an ADO PAT with "password=" context', () => {
    const pat = "b".repeat(52);
    expect(redactApiTokens(`password=${pat}`)).toBe(
      "password: [ADO_PAT_REDACTED]",
    );
  });

  it("does not false-positive on a bare 52-char base32 string without keyword context", () => {
    const bare = "a".repeat(52);
    expect(redactApiTokens(bare)).toBe(bare);
  });
});

describe("sanitiseContent (integration)", () => {
  it("returns empty string for empty input", () => {
    expect(sanitiseContent("")).toBe("");
  });

  it("passes plain text through unchanged", () => {
    const input = "just some normal text";
    expect(sanitiseContent(input)).toBe("just some normal text");
  });

  it("sanitises a string with an HTML comment, invisible char, and GitHub token in one pass", () => {
    const token = "ghp_" + "X".repeat(36);
    const input = `<!-- secret -->hello\u200Bworld ${token}`;
    expect(sanitiseContent(input)).toBe("helloworld [GITHUB_TOKEN_REDACTED]");
  });
});

describe("sanitiseDiffContent", () => {
  it("strips HTML comments", () => {
    expect(sanitiseDiffContent("before <!-- hidden --> after")).toBe(
      "before  after",
    );
  });

  it("strips invisible characters", () => {
    expect(sanitiseDiffContent("a\u200Bb")).toBe("ab");
  });

  it("redacts API tokens", () => {
    const token = "ghp_" + "A".repeat(36);
    expect(sanitiseDiffContent(`key: ${token}`)).toBe(
      "key: [GITHUB_TOKEN_REDACTED]",
    );
  });

  it("preserves HTML entities in diff content", () => {
    expect(sanitiseDiffContent("+  if (a &amp;&amp; b &lt; c) {")).toBe(
      "+  if (a &amp;&amp; b &lt; c) {",
    );
  });

  it("preserves markdown image alt text in diff content", () => {
    expect(sanitiseDiffContent("+  // See ![diagram](url)")).toBe(
      "+  // See ![diagram](url)",
    );
  });

  it("preserves markdown link titles in diff content", () => {
    expect(sanitiseDiffContent('+  // See [docs](url "API reference")')).toBe(
      '+  // See [docs](url "API reference")',
    );
  });

  it("preserves HTML attributes in diff content", () => {
    expect(sanitiseDiffContent('+  <img alt="photo" src="x">')).toBe(
      '+  <img alt="photo" src="x">',
    );
  });
});
