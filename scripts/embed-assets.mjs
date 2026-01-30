import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const webuiDir = join(root, "src", "webui");

const entries = [];

function embedFile(folder, name) {
  console.log(`Embedding ${name}`);
  const filePath = join(folder, name);
  const content = readFileSync(filePath, "utf-8");
  entries.push(`  "/${name}": ${JSON.stringify(content)}`);
}

embedFile(webuiDir, "index.html");

const assetsDir = join(webuiDir, "assets");
if (existsSync(assetsDir)) {
  for (const entry of readdirSync(assetsDir, { withFileTypes: true })) {
    if (entry.isFile()) {
      embedFile(webuiDir, `assets/${entry.name}`);
    }
  }
}

const code = `export const files: Record<string, string> = {\n${entries.join(",\n")}\n};\n`;

const outPath = join(webuiDir, "embedded.ts");
writeFileSync(outPath, code, "utf-8");
console.log("Embedded assets written to ./src/webui/embedded.ts");
