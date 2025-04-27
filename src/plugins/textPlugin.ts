import { AqPlugin } from "../infrastructure/aqPlugin.ts";

export const TextPlugin: AqPlugin = {
  name: "TEXT",

  detect: (filename : string | undefined): boolean => {
    return filename?.toLowerCase().endsWith(".txt") || filename?.toLowerCase().endsWith(".log") === true;
  },

  decode: (input: string, context: Record<string, unknown> | undefined): unknown => {
    if(context?.inputFormat === "TEXT") {
      return input.split(/\r?\n/) // Split by new lines
    } else {
      throw new Error("PlainTextPlugin only decfodes if inputFormat is set explicitly");
    }
  },

  encode: (data: object): string => {
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

  decode: (input: string, context: Record<string, unknown> | undefined): unknown => {
    if(context?.inputFormat === "PLAINTEXT") {
      return input;
    } else {
      throw new Error("PlainTextPlugin only decfodes if inputFormat is set explicitly");
    }
  },

  encode: (data: object): string => {
    return Array.isArray(data) 
      ? data.join("\n")
      : String(data);
  },
};