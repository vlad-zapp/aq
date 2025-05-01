import { AqPlugin } from "../infrastructure/aqPlugin.ts";
import { ParsedData } from "../infrastructure/ParsedData.ts";

export const JsonPlugin: AqPlugin = {
  name: "JSON",

  detect: (filename : string | undefined): boolean => {
    return filename?.toLowerCase().endsWith(".json") || filename?.toLowerCase().endsWith(".jsonc") === true;
  },

  decode: (input: string): ParsedData => {
    return new ParsedData([JSON.parse(input)]); // Directly parse JSON
  },

  encode: (data: unknown): string => {
    return JSON.stringify(data, null, 2); // Pretty-print JSON
  },
};