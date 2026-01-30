import * as http from "node:http";
import { exec } from "node:child_process";
import { autocomplete, evaluateCommand } from "../replHelpers";
import { getErrorMessage } from "../utils";
import {
  getComments,
  hasComments,
  setComment,
  type CommentMap,
} from "../infrastructure/comments";
import { files } from "./embedded";

const PORT = 8765;

/**
 * Recursively extract all comment maps from a data tree.
 * Returns a Record keyed by JSON-path (e.g. "$", "$.metadata", "$.items[0]").
 */
function extractAllComments(
  obj: unknown,
  path: string = "$",
): Record<string, CommentMap> {
  const result: Record<string, CommentMap> = {};

  if (obj !== null && typeof obj === "object" && hasComments(obj)) {
    result[path] = getComments(obj)!;
  }

  if (obj !== null && typeof obj === "object") {
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => {
        Object.assign(result, extractAllComments(item, `${path}[${i}]`));
      });
    } else {
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const childPath = /^[\w$]+$/u.test(key) && !/^\d/.test(key)
          ? `${path}.${key}`
          : `${path}["${key}"]`;
        Object.assign(result, extractAllComments(value, childPath));
      }
    }
  }

  return result;
}

/**
 * Resolve a JSON-path string like "$.metadata.name" to the actual object in the tree.
 */
function resolveJsonPath(root: unknown, path: string): unknown {
  if (path === "$") return root;

  // Parse path segments: .key or ["key"] or [0]
  const segments: (string | number)[] = [];
  const re = /\.(\w+)|\["([^"]+)"\]|\[(\d+)\]/g;
  let m;
  while ((m = re.exec(path)) !== null) {
    if (m[1] !== undefined) segments.push(m[1]);
    else if (m[2] !== undefined) segments.push(m[2]);
    else if (m[3] !== undefined) segments.push(Number(m[3]));
  }

  let current: unknown = root;
  for (const seg of segments) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as any)[seg];
  }
  return current;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, data: unknown, status: number = 200): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export async function startWebServer(data: unknown) {
  (globalThis as any).data = data;

  let html = files["/index.html"];
  if (!html) {
    throw new Error("Embedded index.html not found!");
  }

  // Inject initial data and comments into the HTML
  let jsonData: string;
  try {
    jsonData = JSON.stringify(data, null, 2).replace(/</g, "\\u003c");
  } catch {
    jsonData = '"[Error: could not serialize data]"';
  }

  let jsonComments: string;
  try {
    jsonComments = JSON.stringify(extractAllComments(data)).replace(/</g, "\\u003c");
  } catch {
    jsonComments = "{}";
  }

  html = html.replace(
    "let data = {};",
    `let data = ${jsonData};`,
  );
  html = html.replace(
    "let comments = {};",
    `let comments = ${jsonComments};`,
  );

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, `http://localhost:${PORT}`);

    if (url.pathname === "/execute" && req.method === "POST") {
      try {
        const body = JSON.parse(await readBody(req));
        const command = body.command;
        const result = evaluateCommand(command, data);
        const resultComments = extractAllComments(result);
        sendJson(res, { result, comments: resultComments });
      } catch (error) {
        sendJson(res, { error: getErrorMessage(error) }, 400);
      }
      return;
    }

    if (url.pathname === "/autocomplete" && req.method === "POST") {
      try {
        const body = JSON.parse(await readBody(req));
        const input = body.input;
        const completions = autocomplete(input);
        sendJson(res, { completions });
      } catch (error) {
        sendJson(res, { error: getErrorMessage(error) }, 400);
      }
      return;
    }

    // Set or remove a comment on a specific path+key
    if (url.pathname === "/comments" && req.method === "POST") {
      try {
        const body = JSON.parse(await readBody(req));
        const { path, key, field, text } = body;
        const target = resolveJsonPath(data, path);
        if (target === null || target === undefined || typeof target !== "object") {
          sendJson(res, { error: "Target path not found" }, 400);
          return;
        }
        const existing = getComments(target)?.[key] ?? {};
        if (text) {
          setComment(target as object, key, { ...existing, [field]: text });
        } else {
          // Remove the field
          const updated = { ...existing };
          delete updated[field as keyof typeof updated];
          if (updated.before || updated.after) {
            setComment(target as object, key, updated);
          } else {
            // Remove the entire entry
            const map = getComments(target);
            if (map) delete map[key];
          }
        }
        // Return updated comments for the whole tree
        const allComments = extractAllComments(data);
        sendJson(res, { comments: allComments });
      } catch (error) {
        sendJson(res, { error: getErrorMessage(error) }, 400);
      }
      return;
    }

    if (url.pathname.startsWith("/assets/")) {
      const assetContent = files[url.pathname];
      if (assetContent) {
        const contentType = getMimeType(url.pathname);
        res.writeHead(200, { "Content-Type": contentType });
        res.end(assetContent);
        return;
      }
    }

    if (
      url.pathname === "/" || url.pathname === "/index.html" || !url.pathname
    ) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
      return;
    }

    res.writeHead(404);
    res.end("File not found");
  });

  server.listen(PORT, () => {
    console.log(`🌐 Web server started at http://localhost:${PORT}`);

    const openCommand = process.platform === "win32"
      ? "start"
      : process.platform === "darwin"
      ? "open"
      : "xdg-open";
    exec(`${openCommand} http://localhost:${PORT}`);
  });

  // Keep the process alive
  await new Promise<void>(() => {});
}

function getMimeType(path: string): string {
  if (path.endsWith(".html")) return "text/html";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".js")) return "application/javascript";
  if (path.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}
