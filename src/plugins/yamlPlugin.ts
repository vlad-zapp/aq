import { AqPlugin } from "../infrastructure/aqPlugin.ts";
import { parse as parseYaml, stringify as stringifyYaml } from "https://deno.land/std/yaml/mod.ts";

export const YamlPlugin: AqPlugin = {
  name: "YAML",

  detect: (filename : string | undefined): boolean => {
    return filename?.toLowerCase().endsWith(".yaml") || filename?.toLowerCase().endsWith(".yml") === true;
  },

  decode: (input: string): unknown => {
    let parsedAsJson = null;
    try {
      parsedAsJson = JSON.parse(input);
    } catch {
      // Ignore JSON parse errors
    }

    if (typeof parsedAsJson === "object" && parsedAsJson !== null) {
      throw new Error("I don't recognize YAML as a superset of JSON. Please use JSON parser instead.");
    }

    return parseYaml(input);
  },

  encode: (data: unknown): string => {
    return stringifyYaml(data, {lineWidth: Number.MAX_SAFE_INTEGER});
  },
};