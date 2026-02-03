import * as fs from "node:fs";
import { runInNewContext } from "node:vm";
import { ParsedData } from "../infrastructure/ParsedData";
import { unwrapParsedData, getErrorMessage } from "../utils";
import { PluginManager } from "./PluginManager";
import { AqPlugin } from "../infrastructure/aqPlugin";

export class AqEngine {
    private pluginManager: PluginManager;

    constructor() {
        this.pluginManager = new PluginManager();
    }

    getPluginManager() {
        return this.pluginManager;
    }

    async parseFile(filePath: string, inputFormat: string | undefined, context: Record<string, unknown>): Promise<ParsedData> {
        let inputPlugin: AqPlugin | undefined;
        let actualFilePath = filePath;
        let explicitType = "";

        // Check for type prefix (e.g., "json:filename")
        const colonIdx = filePath.indexOf(":");
        if (colonIdx > 0) {
            const candidateType = filePath.slice(0, colonIdx);
            const candidatePath = filePath.slice(colonIdx + 1);
            const matchedPlugin = this.pluginManager.getPluginByName(candidateType);

            if (matchedPlugin) {
                actualFilePath = candidatePath;
                explicitType = candidateType;
                inputPlugin = matchedPlugin;
            }
        }

        if (!explicitType && inputFormat) {
            inputPlugin = this.pluginManager.getPluginByName(inputFormat);
            if (!inputPlugin) {
                throw new Error(`Unknown input format: ${inputFormat}`);
            }
        }

        const input = await fs.promises.readFile(actualFilePath, "utf-8");

        if (!inputPlugin) {
            inputPlugin = this.pluginManager.detectPlugin(actualFilePath, input, context);
            if (!inputPlugin) {
                throw new Error(`Could not detect input format for file: ${actualFilePath}`);
            }
        }

        try {
            return inputPlugin.decode(input, { ...context, inputFormat: explicitType });
        } catch (error) {
            throw new Error(`Error decoding input with plugin ${inputPlugin.name}: ${getErrorMessage(error)}`);
        }
    }

    parseString(input: string, inputFormat: string | undefined, context: Record<string, unknown>): ParsedData {
        let inputPlugin: AqPlugin | undefined;

        if (inputFormat) {
            inputPlugin = this.pluginManager.getPluginByName(inputFormat);
            if (!inputPlugin) {
                throw new Error(`Unknown input format: ${inputFormat}`);
            }
        } else {
            inputPlugin = this.pluginManager.detectPlugin(undefined, input, context);
            if (!inputPlugin) {
                throw new Error("Could not detect input format from content");
            }
        }

        try {
            return inputPlugin.decode(input, { ...context, inputFormat: inputFormat || "" });
        } catch (error) {
            throw new Error(`Error decoding input with plugin ${inputPlugin.name}: ${getErrorMessage(error)}`);
        }
    }

    unwrapData(data: ParsedData[]): unknown {
        return unwrapParsedData(data);
    }

    executeQuery(data: unknown, query: string): unknown {
        try {
            // Security Improvement: Use vm.runInNewContext instead of new Function
            // This prevents access to global node process/fs objects unless explicitly provided.
            const sandbox = { data };
            return runInNewContext(query, sandbox);
        } catch (error) {
            throw new Error(`Error evaluating query: ${getErrorMessage(error)}`);
        }
    }

    encode(data: unknown, outputFormat: string): string {
        const outputPlugin = this.pluginManager.getPluginByName(outputFormat);
        if (!outputPlugin) {
            throw new Error(`Could not find plugin for output format: ${outputFormat}`);
        }
        return outputPlugin.encode(data) as string;
    }
}
