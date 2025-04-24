import { int } from "https://deno.land/std@0.224.0/yaml/_type/int.ts";
import { AqPlugin } from "../infrastructure/aqPlugin.ts";
import { parse as parseYaml, stringify as stringifyYaml } from "https://deno.land/std/yaml/mod.ts";

export const YamlPlugin: AqPlugin = {
  name: "YAML",

  detect: (filename : string | undefined, input: string | undefined): boolean => {
    return filename?.toLowerCase().endsWith(".yaml") || filename?.toLowerCase().endsWith(".yml") === true;
  },

  decode: (input: string): any => {
    let parsedAsJson = null;
    try {
      parsedAsJson = JSON.parse(input);
    } catch {
      // Ignore JSON parse errors
    }

    if (typeof parsedAsJson === "object" && parsedAsJson !== null) {
      throw new Error("I don't recognize YAML as a superset of JSON. Please use JSON parser instead.");
    }

    return parseYaml(input); // Convert YAML to a JSON-like structure
  },

  encode: (data: any): string => {
    return stringifyYaml(data, {lineWidth: Number.MAX_SAFE_INTEGER}); // Convert JSON-like structure back to YAML
  },
};