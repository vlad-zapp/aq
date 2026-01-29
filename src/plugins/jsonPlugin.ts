import { AqPlugin } from "../infrastructure/aqPlugin.ts";
import { ParsedData } from "../infrastructure/ParsedData.ts";
import { hasComments } from "../infrastructure/comments.ts";
import { parseJson } from "../infrastructure/jsonParser.ts";
import {
  reinsertCommentsDeep,
} from "../infrastructure/commentReinserter.ts";

function jsonKeyExtractor(line: string): string | null {
  const m = /^\s*"([^"]+)":\s/.exec(line);
  if (m) return m[1];
  return null;
}

export const JsonPlugin: AqPlugin = {
  name: "JSON",

  detect: (filename: string | undefined): boolean => {
    return filename?.toLowerCase().endsWith(".json") ||
      filename?.toLowerCase().endsWith(".jsonc") === true;
  },

  decode: (input: string): ParsedData => {
    const parsed = parseJson(input);
    return new ParsedData([parsed], { sourceFormat: "JSON" });
  },

  encode: (data: unknown): string => {
    let output = JSON.stringify(data, null, 2);
    if (hasComments(data)) {
      output = reinsertCommentsDeep(output, data, "doubleslash", jsonKeyExtractor);
    }
    return output;
  },
};
