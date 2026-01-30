import { AqPlugin } from "../infrastructure/aqPlugin";
import {
  parse as parseToml,
  stringify as stringifyToml,
} from "smol-toml";
import { ParsedData } from "../infrastructure/ParsedData";
import { type CommentEntry, getComment, setComment } from "../infrastructure/comments";
import { findUnquotedMarker } from "../infrastructure/commentExtractor";
import {
  reinsertCommentsDeep,
} from "../infrastructure/commentReinserter";

/**
 * Split a TOML section path respecting quoted segments.
 * E.g. 'a."b.c".d' → ["a", "b.c", "d"]
 */
function splitTomlPath(path: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";
  for (const ch of path) {
    if (!inQuotes && (ch === '"' || ch === "'")) {
      inQuotes = true;
      quoteChar = ch;
    } else if (inQuotes && ch === quoteChar) {
      inQuotes = false;
    } else if (!inQuotes && ch === ".") {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function attachTomlComments(source: string, data: Record<string, unknown>): void {
  const lines = source.split(/\r?\n/);
  const pendingComments: string[] = [];
  let currentSection: Record<string, unknown> = data;
  let headerDone = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      continue;
    }

    // Full-line comment
    if (trimmed.startsWith("#")) {
      pendingComments.push(trimmed.replace(/^#\s?/, ""));
      continue;
    }

    // Section header: [section] or [[array]]
    const sectionMatch = /^\[{1,2}([^\]]+)\]{1,2}\s*$/.exec(trimmed);
    if (sectionMatch) {
      const sectionPath = sectionMatch[1].trim();
      const parts = splitTomlPath(sectionPath);
      let target: any = data;
      for (const part of parts) {
        if (target[part] && typeof target[part] === "object") {
          target = target[part];
          if (Array.isArray(target)) {
            target = target[target.length - 1];
          }
        }
      }
      currentSection = target;

      if (pendingComments.length > 0) {
        if (!headerDone) {
          setComment(data, "#", { before: pendingComments.join("\n") });
          headerDone = true;
        } else {
          const sectionKey = parts[parts.length - 1];
          setComment(data, sectionKey, {
            before: pendingComments.join("\n"),
          });
        }
        pendingComments.length = 0;
      }
      headerDone = true;
      continue;
    }

    // Key-value pair
    const kvMatch = /^([\w.\-]+)\s*=\s*(.*)$/.exec(trimmed);
    if (kvMatch) {
      const key = kvMatch[1].trim();

      // Check for inline comment
      const commentPos = findUnquotedMarker(line, "#");
      const inlineComment = commentPos > 0
        ? line.slice(commentPos + 1).trim()
        : undefined;

      const entry: CommentEntry = {};
      if (pendingComments.length > 0) {
        if (!headerDone) {
          setComment(data, "#", { before: pendingComments.join("\n") });
          headerDone = true;
          // Remaining pending go to the key
        } else {
          entry.before = pendingComments.join("\n");
        }
        pendingComments.length = 0;
      }
      if (inlineComment) entry.after = inlineComment;
      if (entry.before || entry.after) {
        setComment(currentSection, key, entry);
      }
      headerDone = true;
      continue;
    }
  }

  // Trailing comments
  if (pendingComments.length > 0) {
    const existing = getComment(data, "#");
    setComment(data, "#", {
      ...existing,
      after: pendingComments.join("\n"),
    });
  }
}

function tomlKeyExtractor(line: string): string | null {
  const kvMatch = /^([\w.\-]+)\s*=/.exec(line.trim());
  if (kvMatch) return kvMatch[1].trim();
  const sectionMatch = /^\[{1,2}([^\]]+)\]{1,2}/.exec(line.trim());
  if (sectionMatch) {
    const parts = splitTomlPath(sectionMatch[1].trim());
    return parts[parts.length - 1] ?? null;
  }
  return null;
}

export const TomlPlugin: AqPlugin = {
  name: "TOML",

  detect: (filename: string | undefined): boolean => {
    return filename?.toLowerCase().endsWith(".toml") ||
      filename?.toLowerCase().endsWith(".tml") === true;
  },

  decode: (input: string): ParsedData => {
    const parsed = parseToml(input);
    attachTomlComments(input, parsed as Record<string, unknown>);
    return new ParsedData([parsed], { sourceFormat: "TOML" });
  },

  encode: (data: unknown): string => {
    let output = stringifyToml(data as any);
    output = reinsertCommentsDeep(output, data, "hash", tomlKeyExtractor);
    return output;
  },
};
