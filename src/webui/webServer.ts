import { serve } from "https://deno.land/std/http/server.ts";
import { autocomplete, evaluateCommand } from "../replHelpers.ts";
import { getErrorMessage } from "../utils.ts";
import {
  getComments,
  hasComments,
  setComment,
  type CommentMap,
} from "../infrastructure/comments.ts";
import { files } from "./embedded.ts";

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

  serve(async (req) => {
    const url = new URL(req.url);

    if (url.pathname === "/execute" && req.method === "POST") {
      try {
        const body = await req.json();
        const command = body.command;
        const result = evaluateCommand(command, data);
        const resultComments = extractAllComments(result);
        return new Response(
          JSON.stringify({ result, comments: resultComments }),
          { headers: { "Content-Type": "application/json" } },
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ error: getErrorMessage(error) }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    if (url.pathname === "/autocomplete" && req.method === "POST") {
      try {
        const body = await req.json();
        const input = body.input;
        const completions = autocomplete(input);
        return new Response(
          JSON.stringify({ completions }),
          { headers: { "Content-Type": "application/json" } },
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ error: getErrorMessage(error) }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // Set or remove a comment on a specific path+key
    if (url.pathname === "/comments" && req.method === "POST") {
      try {
        const body = await req.json();
        const { path, key, field, text } = body;
        // path = JSON path to the parent object, e.g. "$" or "$.metadata"
        // key = the key within that object, e.g. "name" or "#"
        // field = "before" or "after"
        // text = comment text or null to remove
        const target = resolveJsonPath(data, path);
        if (target === null || target === undefined || typeof target !== "object") {
          return new Response(
            JSON.stringify({ error: "Target path not found" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
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
        return new Response(
          JSON.stringify({ comments: allComments }),
          { headers: { "Content-Type": "application/json" } },
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ error: getErrorMessage(error) }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    if (url.pathname.startsWith("/assets/")) {
      const assetContent = files[url.pathname];
      if (assetContent) {
        const contentType = getMimeType(url.pathname);
        return new Response(assetContent, {
          headers: { "Content-Type": contentType },
        });
      }
    }

    if (
      url.pathname === "/" || url.pathname === "/index.html" || !url.pathname
    ) {
      return new Response(html, {
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response("File not found", { status: 404 });
  }, { port: PORT });

  console.log(`🌐 Web server started at http://localhost:${PORT}`);
  const openCommand = Deno.build.os === "windows"
    ? "start"
    : Deno.build.os === "darwin"
    ? "open"
    : "xdg-open";
  const command = new Deno.Command(openCommand, {
    args: [`http://localhost:${PORT}`],
  });
  await command.output();
}

function getMimeType(path: string): string {
  if (path.endsWith(".html")) return "text/html";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".js")) return "application/javascript";
  if (path.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}
