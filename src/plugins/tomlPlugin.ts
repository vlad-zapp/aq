import { AqPlugin } from "../infrastructure/aqPlugin.ts";
import { parse as parseToml, stringify as stringifyToml } from "https://deno.land/std@0.203.0/toml/mod.ts";

export const TomlPlugin: AqPlugin = {
  name: "TOML",

  detect: (filename : string | undefined, input: string | undefined): boolean => {
    return filename?.toLowerCase().endsWith(".toml") || filename?.toLowerCase().endsWith(".tml") === true;
  },

  decode: (input: string): any => {
    return parseToml(input); // Convert TOML to a JSON-like structure
  },

  encode: (data: any): string => {
    return stringifyToml(data); // Convert JSON-like structure back to TOML
  },
};