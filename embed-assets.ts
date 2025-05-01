const entries: string[] = [];

async function embedFile(folder: string, name: string) {
  console.log(`📥 Embedding ${name}`);
  const path = `${folder}/${name}`;
  const content = await Deno.readTextFile(path);
  entries.push(`  "/${name}": ${JSON.stringify(content)}`);
}

async function main() {
  const promises: Promise<void>[] = [];

  let folder = "./src/webui";
  promises.push(embedFile(folder, "index.html"));

  for await (const entry of Deno.readDir(folder + "/assets")) {
    if (entry.isFile) {
      promises.push(embedFile(folder, `assets/${entry.name}`));
    }
  }

  for await (const entry of Deno.readDir(folder + "/assets/img")) {
    if (entry.isFile) {
      promises.push(embedFile(folder, `assets/img/${entry.name}`));
    }
  }

  // Wait for all embedFile calls to complete
  await Promise.all(promises);

  const code = `export const files: Record<string, string> = {\n${
    entries.join(",\n")
  }\n};\n`;

  await Deno.writeTextFile("./src/webui/embedded.ts", code);
  console.log("✅ Embedded assets written to ./src/webui/embedded.ts");
}

await main();
