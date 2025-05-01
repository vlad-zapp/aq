import { AqPlugin } from "../infrastructure/aqPlugin.ts";
import { ParsedData } from "../infrastructure/ParsedData.ts";

export const TextPlugin: AqPlugin = {
  name: "TEXT",

  detect: (filename : string | undefined): boolean => {
    return filename?.toLowerCase().endsWith(".txt") || filename?.toLowerCase().endsWith(".log") === true;
  },

  decode: (input: string, context: Record<string, unknown> | undefined): ParsedData => {
    if((context?.inputFormat as string)?.toLowerCase() === "text") {
      return new ParsedData([input.split(/\r?\n/)]) // Split by new lines
    } else {
      throw new Error("TextPlugin only decfodes if inputFormat is set explicitly");
    }
  },

  encode: (data: unknown): string => {
    return Array.isArray(data) 
      ? data.join("\n")
      : String(data);
  },
};

export const PlainTextPlugin: AqPlugin = {
  name: "PLAINTEXT",

  detect: (filename : string | undefined): boolean => {
    return filename?.toLowerCase().endsWith(".txt") || filename?.toLowerCase().endsWith(".log") === true;
  },

  decode: (input: string, context: Record<string, unknown> | undefined): ParsedData => {
    if((context?.inputFormat as string)?.toLowerCase() === "plaintext") {
      return new ParsedData([input]);
    } else {
      throw new Error("PlainTextPlugin only decfodes if inputFormat is set explicitly");
    }
  },

  encode: (data: unknown): string => {
    return Array.isArray(data) 
      ? data.join("\n")
      : String(data);
  },
};