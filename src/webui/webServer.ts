import { serve } from "https://deno.land/std/http/server.ts";
import { autocomplete, evaluateCommand } from "../replHelpers.ts";
import { getErrorMessage } from "../utils.ts";
import { files } from "./embedded.ts"; // Import the embedded assets

const PORT = 8765; // Unusual port to avoid conflicts

export async function startWebServer(data: unknown) {
  (globalThis as any).data = data;

  // Get the embedded HTML file
  let html = files["/index.html"];
  if (!html) {
    throw new Error("Embedded index.html not found!");
  }

  // Inject the data into the HTML
  html = html.replace("let data = {};", `let data = ${JSON.stringify(data, null, 2)};`);

  serve(async (req) => {
    const url = new URL(req.url);

    // Handle command execution
    if (url.pathname === "/execute" && req.method === "POST") {
      try {
        const body = await req.json();
        const command = body.command;
        const result = evaluateCommand(command, data);
        return new Response(JSON.stringify({ result }), { headers: { "Content-Type": "application/json" } });
      } catch (error) {
        return new Response(JSON.stringify({ error: getErrorMessage(error) }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
    }

    // Handle autocomplete
    if (url.pathname === "/autocomplete" && req.method === "POST") {
      try {
        const body = await req.json();
        const input = body.input;
        const completions = autocomplete(input);
        return new Response(JSON.stringify({ completions }), { headers: { "Content-Type": "application/json" } });
      } catch (error) {
        return new Response(JSON.stringify({ error: getErrorMessage(error) }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
    }

    if (url.pathname.startsWith('/assets/')) {
      const assetContent = files[url.pathname];
      if (assetContent) {
        const contentType = getMimeType(url.pathname);
        return new Response(assetContent, { headers: { "Content-Type": contentType } });
      }
    }

    // Serve the main HTML file
    if (url.pathname === "/" || url.pathname === "/index.html" || !url.pathname) {
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    return new Response("File not found", { status: 404 });

  }, { port: PORT });

  console.log(`🌐 Web server started at http://localhost:${PORT}`);
  const openCommand = Deno.build.os === "windows" ? "start" : Deno.build.os === "darwin" ? "open" : "xdg-open";
  const command = new Deno.Command(openCommand, { args: [`http://localhost:${PORT}`] });
  await command.output();
}

function getMimeType(path: string): string {
  if (path.endsWith(".html")) return "text/html";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".js")) return "application/javascript";
  if (path.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}