/**
 * Re-inserts comments into encoded output by matching key names in output lines.
 */

import { type CommentMap, getComments, hasComments } from "./comments";

export type CommentFormat = "hash" | "semicolon" | "doubleslash" | "xml";

export function formatCommentLine(
  text: string,
  format: CommentFormat,
  indent: string = "",
): string {
  switch (format) {
    case "hash":
      return `${indent}# ${text}`;
    case "semicolon":
      return `${indent}; ${text}`;
    case "doubleslash":
      return `${indent}// ${text}`;
    case "xml":
      return `${indent}<!-- ${text} -->`;
  }
}

export function formatInlineComment(
  text: string,
  format: CommentFormat,
): string {
  switch (format) {
    case "hash":
      return `# ${text}`;
    case "semicolon":
      return `; ${text}`;
    case "doubleslash":
      return `// ${text}`;
    case "xml":
      return `<!-- ${text} -->`;
  }
}

/**
 * Re-insert comments into encoded output.
 *
 * @param output The encoded string (from a standard serializer)
 * @param data The data object (comments are read from its COMMENTS symbol)
 * @param format The comment syntax format
 * @param keyExtractor Given an output line, returns the key name or null
 */
export function reinsertComments(
  output: string,
  data: unknown,
  format: CommentFormat,
  keyExtractor: (line: string) => string | null,
): string {
  if (!hasComments(data)) return output;

  const comments = getComments(data)!;
  const lines = output.split("\n");
  const result: string[] = [];
  const usedKeys = new Set<string>();

  // Header comment
  if (comments["#"]?.before) {
    for (const cline of comments["#"].before.split("\n")) {
      result.push(formatCommentLine(cline, format));
    }
  }

  for (const line of lines) {
    const key = keyExtractor(line);
    if (key && comments[key]?.before && !usedKeys.has(`before:${key}`)) {
      usedKeys.add(`before:${key}`);
      const indent = line.match(/^(\s*)/)?.[1] ?? "";
      for (const cline of comments[key].before.split("\n")) {
        result.push(formatCommentLine(cline, format, indent));
      }
    }

    let outputLine = line;
    if (key && comments[key]?.after && !usedKeys.has(`after:${key}`)) {
      usedKeys.add(`after:${key}`);
      outputLine += "  " + formatInlineComment(comments[key].after, format);
    }
    result.push(outputLine);
  }

  // Trailing comment
  if (comments["#"]?.after) {
    for (const cline of comments["#"].after.split("\n")) {
      result.push(formatCommentLine(cline, format));
    }
  }

  return result.join("\n");
}

/**
 * Recursively re-insert comments for nested objects.
 * Walks the data structure and for each nested object/array that has comments,
 * finds the corresponding section in the output and inserts comments.
 */
export function reinsertCommentsDeep(
  output: string,
  data: unknown,
  format: CommentFormat,
  keyExtractor: (line: string) => string | null,
): string {
  // First pass: top-level comments
  let result = reinsertComments(output, data, format, keyExtractor);

  // Recursive pass: nested object comments
  if (data && typeof data === "object") {
    const entries = Array.isArray(data)
      ? data.map((v, i) => [String(i), v] as const)
      : Object.entries(data as Record<string, unknown>);

    for (const [, value] of entries) {
      if (value && typeof value === "object" && hasComments(value)) {
        result = reinsertComments(result, value, format, keyExtractor);
      }
    }
  }

  return result;
}
