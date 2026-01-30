/**
 * Custom recursive-descent JSON/JSONC parser.
 *
 * Handles both plain JSON and JSONC (with line and block comments) in one pass.
 * Comments are attached to the resulting objects/arrays via setComment().
 */

import { type CommentEntry, getComment, setComment } from "./comments";

export function parseJson(input: string): unknown {
  const parser = new JsonParser(input);
  return parser.parse();
}

class JsonParser {
  private pos = 0;
  private line = 0;
  private input: string;

  constructor(input: string) {
    this.input = input;
  }

  parse(): unknown {
    const before = this.skipWS();
    const value = this.parseValue();

    // Attach header comment if the value is an object/array
    if (before && value && typeof value === "object") {
      setComment(value as object, "#", { before });
    }

    // Collect trailing comments
    const after = this.skipWS();
    if (after && value && typeof value === "object") {
      const existing = getComment(value, "#");
      setComment(value as object, "#", { ...existing, after });
    }

    return value;
  }

  /**
   * Skip whitespace and comments. Returns collected comment text
   * (newline-joined) or null. Tracks newlines for inline detection.
   */
  private skipWS(): string | null {
    const comments: string[] = [];
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos];
      if (ch === " " || ch === "\t" || ch === "\r") {
        this.pos++;
        continue;
      }
      if (ch === "\n") {
        this.line++;
        this.pos++;
        continue;
      }
      if (ch === "/" && this.input[this.pos + 1] === "/") {
        comments.push(this.readLineComment());
        continue;
      }
      if (ch === "/" && this.input[this.pos + 1] === "*") {
        comments.push(this.readBlockComment());
        continue;
      }
      break;
    }
    return comments.length > 0 ? comments.join("\n") : null;
  }

  /**
   * Skip whitespace, comments, and optionally a trailing comma after a value.
   * Distinguishes inline comments (same line as value) from comments on
   * following lines.
   *
   * The comma is consumed here because in JSONC, inline comments typically
   * appear after the comma: `"age": 30,  // inline comment`
   */
  private skipWSAfterValue(
    valueLine: number,
  ): {
    inlineComment: string | null;
    pendingComment: string | null;
    hadComma: boolean;
  } {
    let inlineComment: string | null = null;
    const pendingComments: string[] = [];
    let hadComma = false;

    while (this.pos < this.input.length) {
      const ch = this.input[this.pos];
      if (ch === " " || ch === "\t" || ch === "\r") {
        this.pos++;
        continue;
      }
      if (ch === "\n") {
        this.line++;
        this.pos++;
        continue;
      }
      if (ch === "," && !hadComma) {
        hadComma = true;
        this.pos++;
        continue;
      }
      if (ch === "/" && this.input[this.pos + 1] === "/") {
        const commentLine = this.line;
        const text = this.readLineComment();
        if (commentLine === valueLine && inlineComment === null) {
          inlineComment = text;
        } else {
          pendingComments.push(text);
        }
        continue;
      }
      if (ch === "/" && this.input[this.pos + 1] === "*") {
        const commentLine = this.line;
        const text = this.readBlockComment();
        if (commentLine === valueLine && inlineComment === null) {
          inlineComment = text;
        } else {
          pendingComments.push(text);
        }
        continue;
      }
      break;
    }

    return {
      inlineComment,
      pendingComment: pendingComments.length > 0
        ? pendingComments.join("\n")
        : null,
      hadComma,
    };
  }

  private readLineComment(): string {
    this.pos += 2; // skip //
    const start = this.pos;
    while (this.pos < this.input.length && this.input[this.pos] !== "\n") {
      this.pos++;
    }
    return this.input.slice(start, this.pos).trim();
  }

  private readBlockComment(): string {
    this.pos += 2; // skip /*
    const start = this.pos;
    while (this.pos < this.input.length) {
      if (this.input[this.pos] === "\n") {
        this.line++;
      }
      if (
        this.input[this.pos] === "*" && this.input[this.pos + 1] === "/"
      ) {
        const text = this.input.slice(start, this.pos).trim();
        this.pos += 2;
        return text;
      }
      this.pos++;
    }
    // Unterminated block comment
    return this.input.slice(start).trim();
  }

  private parseValue(): unknown {
    const ch = this.peek();
    if (ch === "{") return this.parseObject();
    if (ch === "[") return this.parseArray();
    if (ch === '"') return this.parseString();
    if (ch === "t" || ch === "f") return this.parseBool();
    if (ch === "n") return this.parseNull();
    if (ch === "-" || (ch >= "0" && ch <= "9")) return this.parseNumber();
    throw this.error(`Unexpected character: ${ch}`);
  }

  private parseObject(): Record<string, unknown> {
    this.expect("{");
    const obj: Record<string, unknown> = {};
    let pendingBefore = this.skipWS();

    if (this.peek() === "}") {
      this.pos++;
      if (pendingBefore) {
        setComment(obj, "#", { before: pendingBefore });
      }
      return obj;
    }

    while (true) {
      // Check for trailing comma before }
      if (this.peek() === "}") break;

      // Parse key
      const key = this.parseString();
      this.skipWS();
      this.expect(":");
      const preValue = this.skipWS();

      // Merge any pre-value comments (between : and value) into before
      const beforeComment = [pendingBefore, preValue]
        .filter(Boolean).join("\n") || null;

      // Parse value
      const valueLine = this.line;
      const value = this.parseValue();
      obj[key] = value;

      // Collect inline comment, pending comments, and consume comma
      const afterInfo = this.skipWSAfterValue(valueLine);

      // Attach comments for this key
      const entry: CommentEntry = {};
      if (beforeComment) entry.before = beforeComment;
      if (afterInfo.inlineComment) entry.after = afterInfo.inlineComment;
      if (entry.before || entry.after) {
        setComment(obj, key, entry);
      }

      pendingBefore = afterInfo.pendingComment;

      // If no comma was found, we're at the end
      if (!afterInfo.hadComma) break;
    }

    // Trailing comments inside the object (after last value, before })
    if (pendingBefore) {
      const existing = getComment(obj, "#");
      setComment(obj, "#", { ...existing, after: pendingBefore });
    }

    this.expect("}");
    return obj;
  }

  private parseArray(): unknown[] {
    this.expect("[");
    const arr: unknown[] = [];
    let pendingBefore = this.skipWS();

    if (this.peek() === "]") {
      this.pos++;
      if (pendingBefore) {
        setComment(arr, "#", { before: pendingBefore });
      }
      return arr;
    }

    let index = 0;
    while (true) {
      if (this.peek() === "]") break;

      const valueLine = this.line;
      const value = this.parseValue();
      arr.push(value);

      const afterInfo = this.skipWSAfterValue(valueLine);

      const entry: CommentEntry = {};
      if (pendingBefore) entry.before = pendingBefore;
      if (afterInfo.inlineComment) entry.after = afterInfo.inlineComment;
      if (entry.before || entry.after) {
        setComment(arr, String(index), entry);
      }

      pendingBefore = afterInfo.pendingComment;
      index++;

      if (!afterInfo.hadComma) break;
    }

    if (pendingBefore) {
      const existing = getComment(arr, "#");
      setComment(arr, "#", { ...existing, after: pendingBefore });
    }

    this.expect("]");
    return arr;
  }

  private parseString(): string {
    this.expect('"');
    let result = "";
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos];
      if (ch === "\\") {
        this.pos++;
        const esc = this.input[this.pos];
        switch (esc) {
          case '"':
            result += '"';
            break;
          case "\\":
            result += "\\";
            break;
          case "/":
            result += "/";
            break;
          case "b":
            result += "\b";
            break;
          case "f":
            result += "\f";
            break;
          case "n":
            result += "\n";
            break;
          case "r":
            result += "\r";
            break;
          case "t":
            result += "\t";
            break;
          case "u": {
            const hex = this.input.slice(this.pos + 1, this.pos + 5);
            result += String.fromCharCode(parseInt(hex, 16));
            this.pos += 4;
            break;
          }
          default:
            result += esc;
        }
        this.pos++;
        continue;
      }
      if (ch === '"') {
        this.pos++;
        return result;
      }
      if (ch === "\n") this.line++;
      result += ch;
      this.pos++;
    }
    throw this.error("Unterminated string");
  }

  private parseNumber(): number {
    const start = this.pos;
    if (this.input[this.pos] === "-") this.pos++;

    // Integer part
    if (this.input[this.pos] === "0") {
      this.pos++;
    } else {
      while (this.pos < this.input.length && this.isDigit(this.input[this.pos])) {
        this.pos++;
      }
    }

    // Fractional part
    if (this.input[this.pos] === ".") {
      this.pos++;
      while (this.pos < this.input.length && this.isDigit(this.input[this.pos])) {
        this.pos++;
      }
    }

    // Exponent
    if (this.input[this.pos] === "e" || this.input[this.pos] === "E") {
      this.pos++;
      if (this.input[this.pos] === "+" || this.input[this.pos] === "-") {
        this.pos++;
      }
      while (this.pos < this.input.length && this.isDigit(this.input[this.pos])) {
        this.pos++;
      }
    }

    const numStr = this.input.slice(start, this.pos);
    const num = Number(numStr);
    if (isNaN(num)) throw this.error(`Invalid number: ${numStr}`);
    return num;
  }

  private parseBool(): boolean {
    if (this.input.startsWith("true", this.pos)) {
      this.pos += 4;
      return true;
    }
    if (this.input.startsWith("false", this.pos)) {
      this.pos += 5;
      return false;
    }
    throw this.error("Expected boolean");
  }

  private parseNull(): null {
    if (this.input.startsWith("null", this.pos)) {
      this.pos += 4;
      return null;
    }
    throw this.error("Expected null");
  }

  private peek(): string {
    return this.input[this.pos];
  }

  private expect(ch: string): void {
    if (this.input[this.pos] !== ch) {
      throw this.error(`Expected '${ch}', got '${this.input[this.pos]}'`);
    }
    this.pos++;
  }

  private isDigit(ch: string): boolean {
    return ch >= "0" && ch <= "9";
  }

  private error(msg: string): Error {
    return new Error(`JSON parse error at line ${this.line + 1}, pos ${this.pos}: ${msg}`);
  }
}
