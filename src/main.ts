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

function queryNodes(data: any, query: string): any {
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
    +`Supported formats: ${plugins.map((plugin) => plugin.name).join(", ")}.\n`
    + "Input data pipng is available (but not supported w/interactive mode on Windows).\n")
  .arguments("[file:string]")
  .option(
    "-q, --query <query:string>",
    "JavaScript query to apply to the data.",
  )
  .option(
    "-i, --input-format <format:string>",
    "Explicitly specify the input data type (e.g., JSON, YAML, XML, TOML, INI).",
  )
  .option(
    "-o, --output-format <format:string>",
    "Output format (e.g., JSON, YAML, TEXT). Defaults to the input format.",
  )
  .option(
    "-x, --interactive",
    "Start interactive mode (live console).",
  )
  .option(
    "-X, --interactive-with-output",
    "Interactive mode + print last result to stdout.",
  )
  .action(
    async (
      { query, interactive, interactiveWithOutput, outputFormat, inputFormat },
      file: string | undefined,
    ) => {

      const context = { query, interactive, interactiveWithOutput, outputFormat, inputFormat }

      if (!file && Deno.stdin.isTerminal()) {
        await cliCommand.showHelp();
        Deno.exit(1);
      }

      let result = null;
      let data = null;
      try {
        // Read input (from file or stdin)
        const input = file
          ? await Deno.readTextFile(file)
          : await new Response(Deno.stdin.readable).text();

        // Detect the input plugin
        let inputPlugin: AqPlugin | undefined;

        if (inputFormat) {
          // Find the plugin by name if input type is explicitly specified
          inputPlugin = plugins.find(
            (plugin) => plugin.name.toLowerCase() === inputFormat.toLowerCase(),
          );

          if (!inputPlugin) {
            console.error(`❌ Unknown input type: ${inputFormat}`);
            Deno.exit(1);
          }
        } else {
          // Auto-detect the plugin if input type is not specified
          inputPlugin = detectPlugin(plugins, file, input, context);
          if (!inputPlugin) {
            console.error("❌ Could not detect input format.");
            Deno.exit(1);
          }
        }

        try {
          // Parse the input into a JSON-like structure
          data = inputPlugin.decode(input);
        } catch (error) {
          console.error(
            `❌ Error decoding input with plugin ${inputPlugin.name}: ${getErrorMessage(error)}`,
          );
          Deno.exit(1);
        }

        if (interactive || interactiveWithOutput) {
          if (file) {
            result = await (new MiniRepl().start(data));
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
            await Deno.writeTextFile(tempFile, input);

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
            : inputPlugin;

          if (!outputPlugin) {
            if (outputFormat) {
              console.error(
                `❌ Could not find plugin for output format: ${outputFormat}`,
              );
            } else {
              console.error("❌ Could not detect output format.");
            }
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
