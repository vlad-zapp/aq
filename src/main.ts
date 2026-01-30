#!/usr/bin/env node
import { Command } from "commander";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { AqPlugin } from "./infrastructure/aqPlugin";
import { JsonPlugin } from "./plugins/jsonPlugin";
import { YamlPlugin } from "./plugins/yamlPlugin";
import { XmlPlugin } from "./plugins/xmlPlugin";
import { TomlPlugin } from "./plugins/tomlPlugin";
import { IniPlugin } from "./plugins/iniPlugin";
import { TextPlugin, PlainTextPlugin } from "./plugins/textPlugin";
import { MiniRepl } from "./repl";
import { detectPlugin, getErrorMessage, unwrapParsedData } from "./utils";
import { version } from "../version";
import { ParsedData } from "./infrastructure/ParsedData";
import { hasComments } from "./infrastructure/comments";
import { startWebServer } from "./webui/webServer";

// Register plugins
const plugins: AqPlugin[] = [
  JsonPlugin,
  YamlPlugin,
  XmlPlugin,
  TomlPlugin,
  IniPlugin,
  TextPlugin,
  PlainTextPlugin
];

function queryNodes(data: unknown, query: string): unknown {
  try {
    // Use `Function` to evaluate the query in the context of `data`
    const func = new Function("data", `return ${query}`);
    return func(data);
  } catch (error) {
    console.error(`❌ Error evaluating query: ${getErrorMessage(error)}`);
    return null;
  }
}

// CLI definition
const program = new Command()
  .name("aq")
  .version(version)
  .description("Aq: A universal query tool for structured data (like jq + yq).\n\n"
    + `Supported formats: ${plugins.map((plugin) => plugin.name).join(", ")}.\n`
    + "Input data piping is available (but not supported w/interactive mode on Windows).\n")
  .argument("[files]", "Input files (comma-separated)")
  .option(
    "-o, --output-format <format>",
    "Output format (e.g., JSON, YAML, TEXT). Defaults to the input format.",
  )
  .option(
    "-q, --query <query>",
    "JavaScript query to apply to the data.",
  )
  .option(
    "-x, --interactive",
    "Start interactive mode (live console).",
  )
  .option(
    "-X, --interactive-with-output",
    "Interactive mode + print last result to stdout.",
  )
  .option(
    "-w, --webui",
    "Start a web server to display data as a tree with filtering capabilities.",
  )
  .option(
    "-i, --input-format <format>",
    "Input format (e.g., JSON, YAML, XML, etc.). Useful for piped input or overriding auto-detection.",
  )
  .action(
    async (
      files: string | undefined,
      options: {
        query?: string;
        interactive?: boolean;
        interactiveWithOutput?: boolean;
        webui?: boolean;
        outputFormat?: string;
        inputFormat?: string;
      },
    ) => {
      const { query, interactive, interactiveWithOutput, webui, outputFormat, inputFormat } = options;

      // Validate mutually exclusive options
      const exclusiveOptions = [
        { name: "-q/--query", value: query },
        { name: "-x/--interactive", value: interactive },
        { name: "-X/--interactive-with-output", value: interactiveWithOutput },
        { name: "-w/--webui", value: webui },
      ];

      const activeOptions = exclusiveOptions.filter((opt) => opt.value);
      if (activeOptions.length > 1) {
        console.error(
          `❌ The following options are mutually exclusive and cannot be used together: ${activeOptions.map((opt) => opt.name).join(", ")}`,
        );
        process.exit(1);
      }

      const context = { query, interactive, interactiveWithOutput, outputFormat };

      if (!files && process.stdin.isTTY) {
        program.help();
      }

      const data: ParsedData[] = [];
      let result = null;

      try {
        // Parse the files parameter
        const fileList = files
          ? files.split(",").map((file) => file.trim())
          : [];

        // If no files and stdin is piped (non-interactive), read stdin as input
        if (fileList.length === 0 && !process.stdin.isTTY && !interactive && !interactiveWithOutput) {
          const chunks: Buffer[] = [];
          for await (const chunk of process.stdin) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const stdinText = Buffer.concat(chunks).toString("utf-8");

          let inputPlugin: AqPlugin | undefined;
          if (inputFormat) {
            inputPlugin = plugins.find(
              (plugin) => plugin.name.toLowerCase() === inputFormat.toLowerCase(),
            );
            if (!inputPlugin) {
              console.error(`❌ Unknown input format: ${inputFormat}`);
              process.exit(1);
            }
          } else {
            inputPlugin = detectPlugin(plugins, undefined, stdinText, context);
            if (!inputPlugin) {
              console.error("❌ Could not detect input format from stdin");
              process.exit(1);
            }
          }

          try {
            const parsedData = inputPlugin.decode(stdinText, { ...context, inputFormat: inputFormat || "" });
            data.push(parsedData);
          } catch (error) {
            console.error(
              `❌ Error decoding stdin with plugin ${inputPlugin.name}: ${getErrorMessage(error)}`,
            );
            process.exit(1);
          }
        }

        // Read and process each file
        for (const fileEntry of fileList) {
          let inputPlugin: AqPlugin | undefined;
          let filePath = fileEntry;

          // Check for type prefix (e.g., "json:filename")
          // Only treat as a prefix if the part before ":" is a known plugin name
          // (avoids misinterpreting Windows paths like "C:\file.txt")
          let explicitType = "";
          const colonIdx = fileEntry.indexOf(":");
          if (colonIdx > 0) {
            const candidateType = fileEntry.slice(0, colonIdx);
            const candidatePath = fileEntry.slice(colonIdx + 1);
            const matchedPlugin = plugins.find(
              (p) => p.name.toLowerCase() === candidateType.toLowerCase(),
            );
            if (matchedPlugin) {
              filePath = candidatePath;
              explicitType = candidateType;
              inputPlugin = matchedPlugin;
            }
          }

          // Use the `-i` option if no type prefix is specified
          if (!explicitType && inputFormat) {
            inputPlugin = plugins.find(
              (plugin) => plugin.name.toLowerCase() === inputFormat.toLowerCase(),
            );

            if (!inputPlugin) {
              console.error(`❌ Unknown input format: ${inputFormat}`);
              process.exit(1);
            }
          }

          // Read the file content
          const input = await fs.promises.readFile(filePath, "utf-8");

          // Auto-detect the plugin if not explicitly specified
          if (!inputPlugin) {
            inputPlugin = detectPlugin(plugins, filePath, input, context);
            if (!inputPlugin) {
              console.error(`❌ Could not detect input format for file: ${filePath}`);
              process.exit(1);
            }
          }

          try {
            // Parse the input into a JSON-like structure
            const parsedData = inputPlugin.decode(input, { ...context, inputFormat: explicitType });
            data.push(parsedData);
          } catch (error) {
            console.error(
              `❌ Error decoding input with plugin ${inputPlugin.name}: ${getErrorMessage(error)}`,
            );
            process.exit(1);
          }
        }

        const cleanData = unwrapParsedData(data);

        if (interactive || interactiveWithOutput) {
          if (files) {
            result = await new MiniRepl().start(cleanData);
          } else {
            if (process.platform === "win32" && !process.stdin.isTTY) {
              console.error(
                "❌ Sorry, interactive mode is not supported on Windows when reading from stdin.",
              );
              process.exit(1);
            }

            // If no file is provided, save stdin to temp file
            // and run aq for it in a new shell with real tty.
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aq-"));
            const tempFile = path.join(tmpDir, "input.aq");

            // Read stdin to string
            const chunks: Buffer[] = [];
            for await (const chunk of process.stdin) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            const stdinText = Buffer.concat(chunks).toString("utf-8");
            await fs.promises.writeFile(tempFile, stdinText);

            const quotedArgs = [tempFile, ...process.argv.slice(2)].map((x) =>
              JSON.stringify(x)
            ).join(" ");

            const cmd = spawn("sh", [
              "-c",
              `exec 3>&1 && exec </dev/tty && exec ${process.execPath} ${JSON.stringify(process.argv[1])} ${quotedArgs} >&3`,
            ], {
              stdio: ["ignore", "pipe", "inherit"],
            });

            let stdout = "";
            cmd.stdout.on("data", (chunk: Buffer) => {
              stdout += chunk.toString();
            });

            await new Promise<void>((resolve) => {
              cmd.on("close", () => resolve());
            });

            try {
              fs.unlinkSync(tempFile);
              fs.rmdirSync(tmpDir);
            } catch {
              // Ignore cleanup errors
            }

            // Decode the output, remove trailing newline because of `sh` behavior
            console.log(stdout.replace(/\r?\n$/, ""));
            process.exit(0);
          }
        } else if (webui) {
          await startWebServer(cleanData);
          return;
        } else {
          // Apply the query (if provided)
          result = query ? queryNodes(cleanData, query) : cleanData;
        }

        if (!interactive) {
          // Determine the output plugin
          const outputPlugin = outputFormat
            ? plugins.find((plugin) =>
              plugin.name.toLowerCase() === outputFormat.toLowerCase(),
            )
            : plugins[0]; // Default to the first plugin

          if (!outputPlugin) {
            console.error(
              `❌ Could not find plugin for output format: ${outputFormat}`,
            );
            process.exit(1);
          }

          // Warn if comments will be lost
          const commentFormats = new Set(["YAML", "JSON", "TOML", "INI", "XML"]);
          if (
            result && typeof result === "object" &&
            hasComments(result) &&
            !commentFormats.has(outputPlugin.name)
          ) {
            console.error(
              "⚠ Comments from source were omitted (output format does not support comments)",
            );
          }

          // Encode the result using the output plugin
          const output = outputPlugin.encode(result);

          // Output the result
          console.log(output);
        }
      } catch (error) {
        console.error("❌ Error:", getErrorMessage(error));
        process.exit(1);
      }
    },
  );

program.parseAsync(process.argv);
