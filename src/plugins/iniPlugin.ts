import { AqPlugin } from "../infrastructure/aqPlugin";
import { ParsedData } from "../infrastructure/ParsedData";
import {
  type CommentEntry,
  getComment,
  hasComments,
  setComment,
} from "../infrastructure/comments";

/**
 * Custom INI parser with native comment support.
 * All values are kept as strings (no type coercion).
 */
function parseIni(input: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentSection: Record<string, unknown> = result;
  const pendingComments: string[] = [];
  let headerDone = false;

  for (const line of input.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;

    // Comment line (; or #)
    if (trimmed.startsWith(";") || trimmed.startsWith("#")) {
      pendingComments.push(trimmed.slice(1).replace(/^\s?/, ""));
      continue;
    }

    // Section header
    const sectionMatch = /^\[(.+)\]\s*$/.exec(trimmed);
    if (sectionMatch) {
      const name = sectionMatch[1].trim();
      if (!result[name] || typeof result[name] !== "object") {
        result[name] = {};
      }
      currentSection = result[name] as Record<string, unknown>;

      if (pendingComments.length > 0) {
        if (!headerDone) {
          setComment(result, "#", { before: pendingComments.join("\n") });
        } else {
          setComment(result, name, { before: pendingComments.join("\n") });
        }
        pendingComments.length = 0;
      }
      headerDone = true;
      continue;
    }

    // Key=value
    const eqPos = trimmed.indexOf("=");
    if (eqPos > 0) {
      const key = trimmed.slice(0, eqPos).trim();
      const value = trimmed.slice(eqPos + 1).trim();
      currentSection[key] = value;

      const entry: CommentEntry = {};
      if (pendingComments.length > 0) {
        if (!headerDone) {
          setComment(result, "#", { before: pendingComments.join("\n") });
          headerDone = true;
        } else {
          entry.before = pendingComments.join("\n");
        }
        pendingComments.length = 0;
      }

      if (entry.before || entry.after) {
        setComment(currentSection, key, entry);
      }
      headerDone = true;
    }
  }

  // Trailing comments
  if (pendingComments.length > 0) {
    const existing = getComment(result, "#");
    setComment(result, "#", {
      ...existing,
      after: pendingComments.join("\n"),
    });
  }

  return result;
}

/**
 * Custom INI stringifier with native comment support.
 */
function stringifyIni(data: unknown): string {
  const obj = data as Record<string, unknown>;
  const lines: string[] = [];
  const commented = hasComments(data);

  // Header comment
  if (commented) {
    const container = getComment(obj, "#");
    if (container?.before) {
      for (const cl of container.before.split("\n")) {
        lines.push(`; ${cl}`);
      }
    }
  }

  // Global keys (non-object values at root)
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "object" && value !== null) continue;
    if (commented) {
      const kc = getComment(obj, key);
      if (kc?.before) {
        for (const cl of kc.before.split("\n")) lines.push(`; ${cl}`);
      }
      const kv = `${key}=${value ?? ""}`;
      lines.push(kc?.after ? `${kv}  ; ${kc.after}` : kv);
    } else {
      lines.push(`${key}=${value ?? ""}`);
    }
  }

  // Sections
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value !== "object" || value === null) continue;
    if (commented) {
      const sc = getComment(obj, key);
      if (sc?.before) {
        lines.push("");
        for (const cl of sc.before.split("\n")) lines.push(`; ${cl}`);
      }
    }
    lines.push(`[${key}]`);
    const section = value as Record<string, unknown>;
    for (const [k, v] of Object.entries(section)) {
      if (commented) {
        const kc = getComment(section, k);
        if (kc?.before) {
          for (const cl of kc.before.split("\n")) lines.push(`; ${cl}`);
        }
        const kv = `${k}=${v ?? ""}`;
        lines.push(kc?.after ? `${kv}  ; ${kc.after}` : kv);
      } else {
        lines.push(`${k}=${v ?? ""}`);
      }
    }
  }

  // Trailing comment
  if (commented) {
    const container = getComment(obj, "#");
    if (container?.after) {
      for (const cl of container.after.split("\n")) lines.push(`; ${cl}`);
    }
  }

  return lines.join("\n") + "\n";
}

export const IniPlugin: AqPlugin = {
  name: "INI",

  detect: (filename: string | undefined): boolean => {
    return filename?.toLowerCase().endsWith(".ini") ||
      filename?.toLowerCase().endsWith(".cfg") === true;
  },

  decode: (input: string): ParsedData => {
    const lines = input.split(/\r?\n/);
    const iniLinePattern =
      /^\s*((\[.+\])|([\s\p{L}\p{N}\._\+-\/\\]+)=([\s\p{L}\p{N}\._\+-\/\\]+)|(;.*)|(#.*))\s*$/u;
    const nonEmpty = lines.filter((l) => l.trim() !== "");
    const compliantLines = nonEmpty.filter((line) => iniLinePattern.test(line));
    const compliantPercentage = nonEmpty.length > 0
      ? (compliantLines.length / nonEmpty.length) * 100
      : 0;
    if (compliantPercentage < 80) {
      throw new Error("The input is not compliant with INI format.");
    }

    const parsed = parseIni(input);
    return new ParsedData([parsed], { sourceFormat: "INI" });
  },

  encode: (data: unknown): string => {
    return stringifyIni(data);
  },
};
