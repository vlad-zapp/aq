/**
 * Generic line-based comment extraction for structured data formats.
 *
 * Supports quote-aware scanning for formats where the comment marker
 * can appear inside string values (YAML, TOML, JSONC).
 */

export interface ExtractedComment {
  line: number;
  text: string;
  inline: boolean;
}

/**
 * Find the position of the first unquoted occurrence of `marker` in `line`.
 * Returns -1 if not found or if all occurrences are inside quotes.
 */
export function findUnquotedMarker(line: string, marker: string): number {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      if (i > 0 && line[i - 1] === "\\") continue;
      inDouble = !inDouble;
    } else if (!inSingle && !inDouble) {
      if (line.startsWith(marker, i)) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Extract comments from source text using a hash-style marker (#, ;).
 * Returns extracted comments with line numbers and inline flag.
 */
export function extractHashComments(
  source: string,
  marker: string = "#",
): ExtractedComment[] {
  const lines = source.split(/\r?\n/);
  const result: ExtractedComment[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Full-line comment: line starts with the marker (after optional whitespace)
    if (trimmed.startsWith(marker)) {
      const text = trimmed.slice(marker.length).replace(/^\s?/, "");
      result.push({ line: i, text, inline: false });
      continue;
    }

    // Skip blank lines and document separators
    if (trimmed === "" || /^---\s*$/.test(trimmed) || /^\.\.\.\s*$/.test(trimmed)) {
      continue;
    }

    // Inline comment: marker appears after data on the same line
    const pos = findUnquotedMarker(line, marker);
    if (pos > 0) {
      const text = line.slice(pos + marker.length).replace(/^\s?/, "");
      result.push({ line: i, text, inline: true });
    }
  }

  return result;
}

/**
 * Extract XML-style comments (<!-- ... -->) from source text.
 * Handles both single-line and multi-line comments.
 */
export function extractXmlComments(source: string): ExtractedComment[] {
  const result: ExtractedComment[] = [];
  const lines = source.split(/\r?\n/);
  let inComment = false;
  let commentText = "";
  let commentStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inComment) {
      const endIdx = line.indexOf("-->");
      if (endIdx >= 0) {
        commentText += line.slice(0, endIdx).trim();
        const trimmedLine = line.trim();
        const isFullLine = trimmedLine.startsWith("<!--") || !trimmedLine.replace(/.*-->/, "").trim();
        result.push({
          line: commentStartLine,
          text: commentText.trim(),
          inline: !isFullLine,
        });
        commentText = "";
        inComment = false;
      } else {
        commentText += line.trim() + "\n";
      }
      continue;
    }

    // Check for comment start
    const startIdx = line.indexOf("<!--");
    if (startIdx >= 0) {
      const endIdx = line.indexOf("-->", startIdx + 4);
      if (endIdx >= 0) {
        // Single-line comment
        const text = line.slice(startIdx + 4, endIdx).trim();
        const beforeComment = line.slice(0, startIdx).trim();
        result.push({
          line: i,
          text,
          inline: beforeComment.length > 0,
        });
      } else {
        // Multi-line comment starts
        inComment = true;
        commentStartLine = i;
        commentText = line.slice(startIdx + 4).trim() + "\n";
      }
    }
  }

  return result;
}

export interface JsoncComment {
  line: number;
  text: string;
  inline: boolean;
  type: "line" | "block";
}

/**
 * Extract JSONC comments (// and /* ... * /) from source text.
 * Uses a state machine to correctly handle strings.
 */
export function extractJsoncComments(source: string): JsoncComment[] {
  const result: JsoncComment[] = [];
  const lines = source.split(/\r?\n/);

  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let commentText = "";
  let commentStartLine = 0;
  let lineIndex = 0;
  let colIndex = 0;
  let hasDataBeforeComment = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === "\n") {
      if (inLineComment) {
        result.push({
          line: commentStartLine,
          text: commentText.trim(),
          inline: hasDataBeforeComment,
          type: "line",
        });
        commentText = "";
        inLineComment = false;
      }
      lineIndex++;
      colIndex = 0;
      hasDataBeforeComment = false;
      continue;
    }

    colIndex++;

    if (inLineComment) {
      commentText += ch;
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        result.push({
          line: commentStartLine,
          text: commentText.trim(),
          inline: hasDataBeforeComment,
          type: "block",
        });
        commentText = "";
        inBlockComment = false;
        i++; // skip /
        colIndex++;
      } else {
        commentText += ch;
      }
      continue;
    }

    if (inString) {
      if (ch === "\\") {
        i++; // skip escaped char
        colIndex++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    // Normal mode
    if (ch === '"') {
      inString = true;
      hasDataBeforeComment = true;
    } else if (ch === "/" && next === "/") {
      hasDataBeforeComment =
        lines[lineIndex].slice(0, colIndex - 1).trim().length > 0;
      inLineComment = true;
      commentStartLine = lineIndex;
      i++; // skip second /
      colIndex++;
    } else if (ch === "/" && next === "*") {
      hasDataBeforeComment =
        lines[lineIndex].slice(0, colIndex - 1).trim().length > 0;
      inBlockComment = true;
      commentStartLine = lineIndex;
      i++; // skip *
      colIndex++;
    } else if (ch !== " " && ch !== "\t" && ch !== "\r") {
      hasDataBeforeComment = true;
    }
  }

  // Unterminated block comment
  if (inBlockComment && commentText.trim()) {
    result.push({
      line: commentStartLine,
      text: commentText.trim(),
      inline: false,
      type: "block",
    });
  }

  return result;
}

/**
 * Strip JSONC comments from source, preserving line positions.
 * Replaces comment characters with spaces so JSON.parse line numbers stay valid.
 */
export function stripJsoncComments(source: string): string {
  let result = "";
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        result += ch;
      } else {
        result += " ";
      }
    } else if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        result += "  ";
        i++;
      } else if (ch === "\n") {
        result += ch;
      } else {
        result += " ";
      }
    } else if (inString) {
      result += ch;
      if (ch === "\\") {
        result += next;
        i++;
      } else if (ch === '"') {
        inString = false;
      }
    } else {
      if (ch === '"') {
        inString = true;
        result += ch;
      } else if (ch === "/" && next === "/") {
        inLineComment = true;
        result += "  ";
        i++;
      } else if (ch === "/" && next === "*") {
        inBlockComment = true;
        result += "  ";
        i++;
      } else {
        result += ch;
      }
    }
  }

  return result;
}
