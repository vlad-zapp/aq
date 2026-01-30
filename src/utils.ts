import { AqPlugin } from "./infrastructure/aqPlugin";
import { ParsedData } from "./infrastructure/ParsedData";

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message;
  } else if (typeof error === "string") {
    return error;
  } else {
    return JSON.stringify(error, null, 2);
  }
}

/**
 * Unwrap ParsedData[] into a clean user-facing value:
 * - Single file, single doc → the document itself
 * - Single file, multi-doc → array of documents
 * - Multiple files → array of unwrapped results
 */
export function unwrapParsedData(parsedDataArray: ParsedData[]): unknown {
  if (parsedDataArray.length === 0) return undefined;

  const unwrapped = parsedDataArray.map((pd) => {
    if (pd.documents.length === 1) {
      return pd.documents[0];
    }
    return pd.documents;
  });

  if (unwrapped.length === 1) {
    return unwrapped[0];
  }
  return unwrapped;
}

/**
 * Lightweight content sniffing: guess the most likely format from the
 * first non-whitespace characters so we can try that plugin first
 * instead of brute-forcing decode() on every plugin.
 */
function sniffFormat(input: string): string | null {
  const trimmed = input.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "JSON";
  if (trimmed.startsWith("<")) return "XML";
  if (
    trimmed.startsWith("---") ||
    /^\w[\w-]*\s*:(?:\s|$)/m.test(trimmed)
  ) return "YAML";
  if (/^\[[\w"'.-]+\]\s*$/m.test(trimmed)) return "TOML";
  return null;
}

// Helper function to detect the appropriate plugin
export function detectPlugin(plugins: AqPlugin[], filename: string | undefined, input: string | undefined, parameters: Record<string, unknown>): AqPlugin | undefined {
  let foundPlugins = plugins.filter((plugin) => plugin.detect(filename, input));

  // If no plugin was found based on filename, try content sniffing first
  if (foundPlugins.length == 0 && input) {
    const sniffed = sniffFormat(input);
    if (sniffed) {
      const sniffedPlugin = plugins.find(
        (p) => p.name.toUpperCase() === sniffed.toUpperCase(),
      );
      if (sniffedPlugin) {
        try {
          sniffedPlugin.decode(input, parameters);
          return sniffedPlugin;
        } catch {
          // Sniff was wrong, fall through to brute-force
        }
      }
    }

    // Brute-force fallback: try every plugin
    foundPlugins = plugins.filter((plugin) => {
      try {
        plugin.decode(input, parameters);
        return true;
      } catch {
        return false;
      }
    });
  }

  if (foundPlugins.length == 1) {
    return foundPlugins[0];
  } else if (foundPlugins.length > 1) {
    console.error(`❌ Multiple plugins detected: ${foundPlugins.map(p => p.name)}. Please specify the format explicitly.`);
  } else {
    return undefined;
  }
}