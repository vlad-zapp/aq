import { aqFindByLocator } from "./replExtensions.ts";

export class MiniRepl {
  readonly #decoder = new TextDecoder();
  readonly #encoder = new TextEncoder();
  #history: string[] = [];
  #historyIndex: number = -1;
  #buffer: string = "";
  #cursorIndex: number = 0;
  #multilineBuffer: string[] = [];
  #result: unknown = undefined;
  #done: boolean = false;

  async start(data: unknown): Promise<unknown> {
    (globalThis as any).data = data;
    (globalThis as any).aqFindByLocator = aqFindByLocator;
    await Deno.stdin.setRaw(true);

    this.#writeLn("💡 Type JavaScript expressions to interact with the data.");
    this.#writeLn("💡 Press Ctrl+D to exit.");
    this.#writeLn("🔍 Parsed data is available as `data`.");
    this.#writeLn();
    this.#writePrompt();

    const buf = new Uint8Array(1024);
    while (!this.#done) {
      const n = Deno.stdin.readSync(buf);
      if (n === null) break;
      const input = this.#decoder.decode(buf.subarray(0, n));
      this.#handleInput(input);
    }
    this.#writeLn();
    return this.#result;
  }

  #handleInput(input: string): void {
    if (input === "\x04") { // Ctrl+D
      this.#done = true;
      return;
    }

    if (input === "\r") { // Enter key
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
        this.#history.push(joined);
        this.#historyIndex = this.#history.length;
      } else {
        this.#writeLn();
        this.#writePrompt();
        return;
      }

      try {
        this.#writeLn();
        this.#result = eval(joined);
        if (this.#result !== undefined) {
          this.#writeLn(Deno.inspect(this.#result, { colors: true }));
          this.#writeLn();
        }
      } catch (e) {
        this.#writeLn(`⚠️ ${e}`);
      }

      this.#multilineBuffer = [];
      this.#buffer = "";
      this.#cursorIndex = 0;
      this.#writePrompt();
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
    const match = /([\w$.]+)$/.exec(beforeCursor);
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

    const completions = this.#getAllKeys(target ?? {}).filter((k) =>
      k.startsWith(prefix)
    );

    if (completions.length === 1) {
      const delta = completions[0].slice(prefix.length);
      const arr = [...this.#buffer];
      arr.splice(this.#cursorIndex, 0, ...delta);
      this.#buffer = arr.join("");
      this.#cursorIndex += delta.length;
      this.#rewriteLine();
    } else if (completions.length > 1) {
      this.#writeLn("\n" + completions.join(" "));
      this.#rewriteLine();
    }
  }

  #getAllKeys(obj: unknown): string[] {
    const keys = new Set<string>();
    while (obj && typeof obj === "object") {
      Object.getOwnPropertyNames(obj).forEach((k) => keys.add(k));
      obj = Object.getPrototypeOf(obj);
    }
    return [...keys];
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
    Deno.stderr.writeSync(this.#encoder.encode(str));
  }

  #writeLn(str: string = ""): void {
    Deno.stderr.writeSync(this.#encoder.encode(str + "\n"));
  }
}
