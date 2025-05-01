import { AqPlugin } from "../infrastructure/aqPlugin.ts";
import { parseAll as parseYaml, stringify as stringifyYaml } from "https://deno.land/std/yaml/mod.ts";
import { ParsedData } from "../infrastructure/ParsedData.ts";

const multiDocumentSymbol = Symbol("YAML multi-document symbol");

export const YamlPlugin: AqPlugin = {
  name: "YAML",

  detect: (filename : string | undefined): boolean => {
    return filename?.toLowerCase().endsWith(".yaml") || filename?.toLowerCase().endsWith(".yml") === true;
  },

  decode: (input: string): ParsedData => {
    let parsedAsJson = null;
    try {
      parsedAsJson = JSON.parse(input);
    } catch {
      // Ignore JSON parse errors
    }

    if (typeof parsedAsJson === "object" && parsedAsJson !== null) {
      throw new Error("I don't recognize YAML as a superset of JSON. Please use JSON parser instead.");
    }

    let parsedDocument : unknown = parseYaml(input);

    if(Array.isArray(parsedDocument)) {
      (parsedDocument as any)[multiDocumentSymbol] = true;
      return new ParsedData(parsedDocument);
    } else {
      throw Error("Yaml was not parsed as expected. Please check the input. Outut: " + JSON.stringify(parsedDocument));
    }
  },

  encode: (data: unknown): string => {
    if((data as any)[multiDocumentSymbol] === true) {
      delete (data as any)[multiDocumentSymbol];
      if (Array.isArray(data)) {
        return data.map((item) => stringifyYaml(item, {lineWidth: Number.MAX_SAFE_INTEGER})).join("---\n");
      } else {
        throw new Error("Invalid YAML data structure. Expected an array for multi-document YAML.");
      }
    }
    return stringifyYaml(data, {lineWidth: Number.MAX_SAFE_INTEGER});
  },
};