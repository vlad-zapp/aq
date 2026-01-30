import * as util from "node:util";
import { tracked } from "./replExtensions";
import { evaluateCommand, getCompletionKeys } from "./replHelpers";

export class MiniRepl {
  #history: string[] = [];
  #historyIndex: number = -1;
  #buffer: string = "";
  #cursorIndex: number = 0;
  #multilineBuffer: string[] = [];
  #result: unknown = undefined;
  #done: boolean = false;

  async start(data: unknown): Promise<unknown> {
    (globalThis as any).data = tracked(data);

    this.#writeLn("💡 Type JavaScript expressions to interact with the data.");
    this.#writeLn("💡 Press Ctrl+D to exit.");
    this.#writeLn("🔍 Parsed data is available as `data`.");
    this.#writeLn();
    this.#writePrompt();

    if (typeof process.stdin.setRawMode === "function") {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding("utf-8");

    return new Promise<unknown>((resolve) => {
      const onData = (chunk: string) => {
        this.#handleInput(chunk);
        if (this.#done) {
          if (typeof process.stdin.setRawMode === "function") {
            process.stdin.setRawMode(false);
          }
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
          this.#writeLn();
          resolve(this.#result);
        }
      };
      process.stdin.on("data", onData);
    });
  }

  #handleInput(input: string): void {
    if (input === "\x04") { // Ctrl+D
      this.#done = true;
      return;
    }

    if (input === "\r" || input === "\n") { // Enter
      const current = this.#buffer;
      const joined = [...this.#multilineBuffer, current].join("\n").trim();

      if (!this.#isInputComplete(joined)) {
        this.#multilineBuffer.push(current);
        this.#buffer = "";
        this.#cursorIndex = 0;
        this.#writePrompt("... ");
        return;
      }

      if (joined) {
        if (!joined.trimEnd().endsWith(";")) {
          this.#history.push(joined);
          this.#historyIndex = this.#history.length;
        }

        try {
          this.#writeLn();
          this.#result = evaluateCommand(joined, (globalThis as any).data);
          if (this.#result !== undefined) {
            this.#writeLn(util.inspect(this.#result, { colors: true }));
            this.#writeLn();
          }
        } catch (e) {
          this.#writeLn(`⚠️ ${e}`);
        }

        if (joined.trimEnd().endsWith(";")) {
          // Keep the command in the prompt
          this.#rewriteLine();
        } else {
          // Clear the buffer and reset the prompt
          this.#multilineBuffer = [];
          this.#buffer = "";
          this.#cursorIndex = 0;
          this.#writePrompt();
        }
      }
    } else if (input === "\u007f") { // Backspace
      if (this.#cursorIndex > 0) {
        const arr = [...this.#buffer];
        arr.splice(this.#cursorIndex - 1, 1);
        this.#buffer = arr.join("");
        this.#cursorIndex--;
        this.#rewriteLine();
      }
    } else if (input === "\x1b[D") { // Left arrow
      if (this.#cursorIndex > 0) {
        this.#cursorIndex--;
        this.#write("\x1b[D");
      }
    } else if (input === "\x1b[C") { // Right arrow
      if (this.#cursorIndex < [...this.#buffer].length) {
        this.#cursorIndex++;
        this.#write("\x1b[C");
      }
    } else if (input === "\x1b[3~") { // Delete key
      const arr = [...this.#buffer];
      if (this.#cursorIndex < arr.length) {
        arr.splice(this.#cursorIndex, 1);
        this.#buffer = arr.join("");
        this.#rewriteLine();
      }
    } else if (input === "\x1b[H" || input === "\x1b[1~") { // Home key
      this.#cursorIndex = 0;
      this.#rewriteLine();
    } else if (input === "\x1b[F" || input === "\x1b[4~") { // End key
      this.#cursorIndex = [...this.#buffer].length;
      this.#rewriteLine();
    } else if (input === "\x1b[1;5D") { // Ctrl+Left
      while (
        this.#cursorIndex > 0 && this.#buffer[this.#cursorIndex - 1] === " "
      ) this.#cursorIndex--;
      while (
        this.#cursorIndex > 0 && this.#buffer[this.#cursorIndex - 1] !== " "
      ) this.#cursorIndex--;
      this.#rewriteLine();
    } else if (input === "\x1b[1;5C") { // Ctrl+Right
      const len = [...this.#buffer].length;
      while (
        this.#cursorIndex < len && this.#buffer[this.#cursorIndex] === " "
      ) this.#cursorIndex++;
      while (
        this.#cursorIndex < len && this.#buffer[this.#cursorIndex] !== " "
      ) this.#cursorIndex++;
      this.#rewriteLine();
    } else if (input === "\x1b[A") { // Up arrow
      if (this.#historyIndex > 0) {
        this.#historyIndex--;
        this.#buffer = this.#history[this.#historyIndex];
        this.#cursorIndex = [...this.#buffer].length;
        this.#rewriteLine();
      }
    } else if (input === "\x1b[B") { // Down arrow
      if (this.#historyIndex < this.#history.length - 1) {
        this.#historyIndex++;
        this.#buffer = this.#history[this.#historyIndex];
        this.#cursorIndex = [...this.#buffer].length;
        this.#rewriteLine();
      } else {
        this.#historyIndex = this.#history.length;
        this.#buffer = "";
        this.#cursorIndex = 0;
        this.#rewriteLine();
      }
    } else if (input === "\t") { // Tab (autocomplete)
      this.#handleAutocomplete();
    } else if (!input.startsWith("\x1b")) { // Regular input
      const arr = [...this.#buffer];
      arr.splice(this.#cursorIndex, 0, input);
      this.#buffer = arr.join("");
      this.#cursorIndex += [...input].length;
      this.#rewriteLine();
    }
  }

  #isInputComplete(code: string): boolean {
    try {
      new Function(code);
      return true;
    } catch (e) {
      return !/unexpected end/i.test((e as Error).message);
    }
  }

  #handleAutocomplete(): void {
    const beforeCursor = [...this.#buffer].slice(0, this.#cursorIndex).join("");
    const match = /([\[\]\d\w$.]+)$/.exec(beforeCursor);
    if (!match) return;

    const expr = match[1];
    const parts = expr.split(".");
    const prefix = parts.pop()!;
    const base = parts.join(".");

    let target: unknown;
    try {
      target = base ? eval(base) : globalThis;
    } catch (_) {
      target = globalThis;
    }

    const completions = getCompletionKeys(target ?? {}, prefix);

    if (completions.keys.length === 1) {
      const delta = completions.keys[0].slice(prefix.length);
      this.#appendToCursor(delta);
    } else if (completions.keys.length > 1) {
      // Find the longest common prefix of all completions
      const commonPrefix = this.#getLongestCommonPrefix(completions.keys);
      if (commonPrefix.length > prefix.length) {
        // Add the common part to the buffer
        const delta = commonPrefix.slice(prefix.length);
        this.#appendToCursor(delta);
      }

      // Display all completions
      this.#writeLn(
        `\n${
          completions.keys.slice(0, completions.numPrimary).join(" ")
        } \x1b[90m${
          completions.keys.slice(
            completions.numPrimary,
            completions.keys.length,
          ).join(" ")
        }\x1b[0m`,
      );
      this.#rewriteLine();
    }

    function getCompletionKeys(
      obj: unknown,
      prefix: string,
    ): { keys: string[]; numPrimary: number } {
      const keys: Set<string> = new Set();
      let numPrimary = 0;
      if (obj === globalThis) {
        [
          "data",
          "aqFindByLocator",
          "aqFindByName",
          "aqFindByFullName",
          "aqFindByValue",
        ].filter((x) => x.startsWith(prefix)).forEach((k) => keys.add(k));
      }

      while (obj) {
        Object.getOwnPropertyNames(obj).filter((k) => k.startsWith(prefix) && !/^\d/.test(k))
          .forEach((k) => keys.add(k));
        numPrimary = numPrimary !== 0 ? numPrimary : keys.size;
        obj = Object.getPrototypeOf(obj);
      }

      return { keys: [...keys], numPrimary: numPrimary };
    }
  }

  #getLongestCommonPrefix(strings: string[]): string {
    if (strings.length === 0) return "";
    let prefix = strings[0];
    for (const str of strings) {
      while (str.indexOf(prefix) !== 0) {
        prefix = prefix.slice(0, -1);
        if (prefix === "") return "";
      }
    }
    return prefix;
  }

  #writePrompt(prefix: string = "> "): void {
    this.#write(prefix);
  }

  #rewriteLine(): void {
    const chars = [...this.#buffer];
    const full = `\r> ${chars.join("")}\x1b[K`;
    const moveLeft = chars.length - this.#cursorIndex;
    const move = moveLeft > 0 ? `\x1b[${moveLeft}D` : "";
    this.#write(full + move);
  }

  #write(str: string = ""): void {
    process.stderr.write(str);
  }

  #writeLn(str: string = ""): void {
    process.stderr.write(str + "\n");
  }

  #appendToCursor(str: string = ""): void {
    const arr = [...this.#buffer];
    arr.splice(this.#cursorIndex, 0, ...str);
    this.#buffer = arr.join("");
    this.#cursorIndex += str.length;
    this.#rewriteLine();
  }
}
