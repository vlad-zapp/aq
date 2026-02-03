import { Command } from "commander";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { MiniRepl } from "./repl";
import { version } from "../version";
import { hasComments } from "./infrastructure/comments";
import { startWebServer } from "./webui/webServer";
import { AqEngine } from "./core/AqEngine";
import { getErrorMessage } from "./utils";
import { ParsedData } from "./infrastructure/ParsedData";

export async function runCli() {
    const engine = new AqEngine();
    const plugins = engine.getPluginManager().getPlugins();

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

                        try {
                            const parsedData = engine.parseString(stdinText, inputFormat, context);
                            data.push(parsedData);
                        } catch (error) {
                            console.error(
                                `❌ ${getErrorMessage(error)}`,
                            );
                            process.exit(1);
                        }
                    }

                    // Read and process each file
                    for (const fileEntry of fileList) {
                        try {
                            const parsedData = await engine.parseFile(fileEntry, inputFormat, context);
                            data.push(parsedData);
                        } catch (error) {
                            console.error(`❌ ${getErrorMessage(error)}`);
                            process.exit(1);
                        }
                    }

                    const cleanData = engine.unwrapData(data);

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
                        result = query ? engine.executeQuery(cleanData, query) : cleanData;
                    }

                    if (!interactive) {
                        // Determine the output plugin
                        // Default to the first plugin if no output format
                        const outputFormatToUse = outputFormat || engine.getPluginManager().getDefaultPlugin().name;

                        // Warn if comments will be lost
                        // We need to check if result has comments.
                        // But we don't have outputPlugin instance directly here to check capabilities, 
                        // wait, we can get it from engine.
                        const outputPlugin = engine.getPluginManager().getPluginByName(outputFormatToUse);

                        if (!outputPlugin) {
                            console.error(`❌ Could not find plugin for output format: ${outputFormatToUse}`);
                            process.exit(1);
                        }

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

                        // Encode the result
                        const output = engine.encode(result, outputFormatToUse);

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
}
