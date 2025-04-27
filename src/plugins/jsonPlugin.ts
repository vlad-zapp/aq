import { AqPlugin } from "../infrastructure/aqPlugin.ts";

export const JsonPlugin: AqPlugin = {
  name: "JSON",

  detect: (filename : string | undefined): boolean => {
    return filename?.toLowerCase().endsWith(".json") || filename?.toLowerCase().endsWith(".jsonc") === true;
  },

  decode: (input: string): unknown => {
    return JSON.parse(input); // Directly parse JSON
  },

  encode: (data: unknown): string => {
    return JSON.stringify(data, null, 2); // Pretty-print JSON
  },
};