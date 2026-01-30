import { AqPlugin } from "./infrastructure/aqPlugin";
import { JsonPlugin } from "./plugins/jsonPlugin";
import { YamlPlugin } from "./plugins/yamlPlugin";
import { XmlPlugin } from "./plugins/xmlPlugin";
import { TomlPlugin } from "./plugins/tomlPlugin";
import { IniPlugin } from "./plugins/iniPlugin";
import { TextPlugin, PlainTextPlugin } from "./plugins/textPlugin";
import { detectPlugin, unwrapParsedData } from "./utils";
import { ParsedData } from "./infrastructure/ParsedData";

// Re-export comment/anchor infrastructure
export {
  COMMENTS,
  getComments,
  getComment,
  setComment,
  setComments,
  hasComments,
  cloneComments,
} from "./infrastructure/comments";
export type { CommentEntry, CommentMap } from "./infrastructure/comments";
export {
  ANCHORS,
  getAnchors,
  getAnchor,
  setAnchor,
  hasAnchors,
} from "./infrastructure/anchors";
export type { AnchorEntry, AnchorMap } from "./infrastructure/anchors";
export { MULTI_DOC, ParsedData } from "./infrastructure/ParsedData";

// Re-export utility functions
export {
  aqFindByLocator,
  aqFindByName,
  aqFindByFullName,
  aqFindByValue,
  aqDiff,
  aqComments,
  aqAnchors,
  tracked,
} from "./replExtensions";

const plugins: AqPlugin[] = [
  JsonPlugin,
  YamlPlugin,
  XmlPlugin,
  TomlPlugin,
  IniPlugin,
  TextPlugin,
  PlainTextPlugin,
];

/**
 * Parse a string into a JS object.
 * If format is omitted, auto-detect from content.
 * Comment and anchor metadata attached via Symbols.
 */
export function parse(input: string, format?: string): unknown {
  let plugin: AqPlugin | undefined;

  if (format) {
    plugin = plugins.find((p) => p.name.toLowerCase() === format.toLowerCase());
    if (!plugin) {
      throw new Error(`Unknown format: ${format}`);
    }
  } else {
    plugin = detectPlugin(plugins, undefined, input, {});
    if (!plugin) {
      throw new Error("Could not auto-detect input format");
    }
  }

  const parsed: ParsedData = plugin.decode(input, { inputFormat: format || "" });
  return unwrapParsedData([parsed]);
}

/**
 * Serialize a JS object back to a string in the given format.
 * Reinserts any comment/anchor metadata from the parse step.
 */
export function encode(data: unknown, format: string): string {
  const plugin = plugins.find((p) => p.name.toLowerCase() === format.toLowerCase());
  if (!plugin) {
    throw new Error(`Unknown format: ${format}`);
  }
  return plugin.encode(data) as string;
}
