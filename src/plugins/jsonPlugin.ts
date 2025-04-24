import { AqPlugin } from "../infrastructure/aqPlugin.ts";

export const JsonPlugin: AqPlugin = {
  name: "JSON",

  detect: (filename : string | undefined, content : string | undefined): boolean => {
    return filename?.toLowerCase().endsWith(".json") || filename?.toLowerCase().endsWith(".jsonc") === true;
  },

  decode: (input: string): any => {
    return JSON.parse(input); // Directly parse JSON
  },

  encode: (data: any): string => {
    return JSON.stringify(data, null, 2); // Pretty-print JSON
  },
};