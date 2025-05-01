import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts";
import { AqPlugin } from "./infrastructure/aqPlugin.ts";
import { JsonPlugin } from "./plugins/jsonPlugin.ts";
import { YamlPlugin } from "./plugins/yamlPlugin.ts";
import { XmlPlugin } from "./plugins/xmlPlugin.ts";
import { TomlPlugin } from "./plugins/tomlPlugin.ts";
import { IniPlugin } from "./plugins/iniPlugin.ts";
import { TextPlugin, PlainTextPlugin } from "./plugins/textPlugin.ts";
import { MiniRepl } from "./repl.ts";
import { detectPlugin, getErrorMessage } from "./utils.ts";
import { version } from "../version.ts";
import { ParsedData } from "./infrastructure/ParsedData.ts";
import { startWebServer } from "./webui/webServer.ts";

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
const cliCommand = new Command()
  .name("aq")
  .version(version)
  .description("Aq: A universal query tool for structured data (like jq + yq).\n\n"
    + `Supported formats: ${plugins.map((plugin) => plugin.name).join(", ")}.\n`
    + "Input data piping is available (but not supported w/interactive mode on Windows).\n")
  .arguments("[files:string]")
  .option(
    "-o, --output-format <format:string>",
    "Output format (e.g., JSON, YAML, TEXT). Defaults to the input format.",
  )
  .option(
    "-q, --query <query:string>",
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
  .action(
    async (
      { query, interactive, interactiveWithOutput, webui, outputFormat },
      files: string | undefined,
    ) => {
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
        Deno.exit(1);
      }

      const context = { query, interactive, interactiveWithOutput, outputFormat };

      if (!files && Deno.stdin.isTerminal()) {
        await cliCommand.showHelp();
        Deno.exit(1);
      }

      const data: ParsedData[] = [];
      let result = null;

      try {
        // Parse the files parameter
        const fileList = files
          ? files.split(",").map((file) => file.trim())
          : [];

        // Read and process each file
        for (const fileEntry of fileList) {
          let inputPlugin: AqPlugin | undefined;
          let filePath = fileEntry;

          // Check for type prefix (e.g., "json:filename")
          const typeMatch = /^(\w+):(.+)$/.exec(fileEntry);
          let explicitType = "";
          if (typeMatch) {
            const [, type, path] = typeMatch;
            filePath = path;
            explicitType = type;

            // Find the plugin by name
            inputPlugin = plugins.find(
              (plugin) => plugin.name.toLowerCase() === type.toLowerCase(),
            );

            if (!inputPlugin) {
              console.error(`❌ Unknown input type: ${type}`);
              Deno.exit(1);
            }
          }

          // Read the file content
          const input = await Deno.readTextFile(filePath);

          // Auto-detect the plugin if not explicitly specified
          if (!inputPlugin) {
            inputPlugin = detectPlugin(plugins, filePath, input, context);
            if (!inputPlugin) {
              console.error(`❌ Could not detect input format for file: ${filePath}`);
              Deno.exit(1);
            }
          }

          try {
            // Parse the input into a JSON-like structure
            const parsedData = inputPlugin.decode(input, {...context, inputFormat: explicitType});
            data.push(parsedData);
          } catch (error) {
            console.error(
              `❌ Error decoding input with plugin ${inputPlugin.name}: ${getErrorMessage(error)}`,
            );
            Deno.exit(1);
          }
        }

        if (interactive || interactiveWithOutput) {
          if (files) {
            result = await new MiniRepl().start(data);
          } else {
            if (Deno.build.os === "windows" && !Deno.stdin.isTerminal()) {
              console.error(
                "❌ Sorry, interactive mode is not supported on Windows when reading from stdin.",
              );
              Deno.exit(1);
            }

            // If no file is provided, save stdin to temp file
            // and run aq for it in a new shell with real tty.
            // This is a workaround for Deno limitations.
            const tempFile = await Deno.makeTempFile({ suffix: ".aq" });
            await Deno.writeTextFile(tempFile, await new Response(Deno.stdin.readable).text());

            const quotedArgs = [tempFile, ...Deno.args].map((x) =>
              JSON.stringify(x)
            ).join(" ");

            const cmd = new Deno.Command("sh", {
              args: [
                "-c",
                `exec 3>&1 && exec </dev/tty && exec ${Deno.execPath()} ${quotedArgs} >&3`,
              ],
              stdout: "piped",
              stderr: "inherit",
              stdin: "null",
            });

            const result = await cmd.output();
            Deno.removeSync(tempFile, { recursive: false });

            // Decode the output, remove trailing newline because of `sh` behavior
            console.log(new TextDecoder().decode(result.stdout).replace(/\r?\n$/, ""));
            Deno.exit(0);
          }
        } else if (webui) {
          await startWebServer(data);
          return;
        } else {
          // Apply the query (if provided)
          result = query ? queryNodes(data, query) : data;
        }

        if (!interactive) {
          // Determine the output plugin
          const outputPlugin = outputFormat
            ? plugins.find((plugin) =>
              plugin.name.toLowerCase() === outputFormat.toLowerCase()
            )
            : plugins[0]; // Default to the first plugin

          if (!outputPlugin) {
            console.error(
              `❌ Could not find plugin for output format: ${outputFormat}`,
            );
            Deno.exit(1);
          }

          // Encode the result using the output plugin
          const output = outputPlugin.encode(result);

          // Output the result
          console.log(output);
        }
      } catch (error) {
        console.error("❌ Error:", getErrorMessage(error));
        Deno.exit(1);
      }
    },
  );

await cliCommand.parse(Deno.args);
