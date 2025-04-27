import { AqPlugin } from "../infrastructure/aqPlugin.ts";
import { parse as parseToml, stringify as stringifyToml } from "https://deno.land/std/toml/mod.ts";

export const TomlPlugin: AqPlugin = {
  name: "TOML",

  detect: (filename : string | undefined): boolean => {
    return filename?.toLowerCase().endsWith(".toml") || filename?.toLowerCase().endsWith(".tml") === true;
  },

  decode: (input: string): unknown => {
    return parseToml(input); // Convert TOML to a JSON-like structure
  },

  encode: (data: unknown): string => {
    return stringifyToml(data as any); // Convert JSON-like structure back to TOML
  },
};