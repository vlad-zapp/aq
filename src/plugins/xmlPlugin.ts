import { AqPlugin } from "../infrastructure/aqPlugin.ts";
import {
  parse as parseXml,
  stringify as stringifyXml,
} from "https://deno.land/x/xml/mod.ts";
import { ParsedData } from "../infrastructure/ParsedData.ts";
import { setComment } from "../infrastructure/comments.ts";
import {
  reinsertCommentsDeep,
} from "../infrastructure/commentReinserter.ts";

/**
 * Walk the parsed XML tree and convert native #comments arrays
 * into our CommentMap format, then delete #comments from the data.
 */
function extractNativeXmlComments(obj: unknown): void {
  if (!obj || typeof obj !== "object") return;

  const record = obj as Record<string, unknown>;
  const comments = record["#comments"] as string[] | undefined;

  if (Array.isArray(comments) && comments.length > 0) {
    // Get child element keys (exclude #comments and text nodes)
    const childKeys = Object.keys(record).filter(
      (k) => !k.startsWith("#"),
    );

    if (childKeys.length > 0 && comments.length === 1) {
      // Single comment → before the first child element
      setComment(record, childKeys[0], { before: comments[0].trim() });
    } else if (comments.length > 0) {
      // Multiple or no-child: store as container header
      const text = comments.map((c) => c.trim()).join("\n");
      setComment(record, "#", { before: text });
    }

    delete record["#comments"];
  }

  // Recurse into children
  for (const value of Object.values(record)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      extractNativeXmlComments(value);
    }
  }
}

function xmlKeyExtractor(line: string): string | null {
  const m = /<(\w[\w\-.:]*)[\s>\/]/.exec(line.trim());
  if (m && !line.trim().startsWith("</")) return m[1];
  return null;
}

export const XmlPlugin: AqPlugin = {
  name: "XML",

  detect: (filename: string | undefined): boolean => {
    return filename?.toLowerCase().endsWith(".xml") ||
      filename?.toLowerCase().endsWith(".xhtml") ||
      filename?.toLowerCase().endsWith(".rss") ||
      filename?.toLowerCase().endsWith(".atom") ||
      filename?.toLowerCase().endsWith(".svg") ||
      filename?.toLowerCase().endsWith(".xul") ||
      filename?.toLowerCase().endsWith(".wsdl") ||
      filename?.toLowerCase().endsWith(".xop") ||
      filename?.toLowerCase().endsWith(".xsd") ||
      filename?.toLowerCase().endsWith(".xslt") ||
      filename?.toLowerCase().endsWith(".xforms") ||
      filename?.toLowerCase().endsWith(".xmlschema") ||
      filename?.toLowerCase().endsWith(".xmlns") ||
      filename?.toLowerCase().endsWith(".xmlrpc") ||
      filename?.toLowerCase().endsWith(".xmltv") ||
      filename?.toLowerCase().endsWith(".xquery") ||
      filename?.toLowerCase().endsWith(".xsl") ||
      filename?.toLowerCase().endsWith(".xmi") === true;
  },

  decode: (input: string): ParsedData => {
    const parsed = parseXml(input);
    extractNativeXmlComments(parsed);
    return new ParsedData([parsed], { sourceFormat: "XML" });
  },

  encode: (data: unknown): string => {
    if (typeof data !== "object") {
      throw new Error(
        "query result must be an object to convert to XML because xml document should have a single root tag.",
      );
    }
    if (data === null) {
      return "";
    }
    let output = stringifyXml(data as Record<string, unknown>);
    output = reinsertCommentsDeep(output, data, "xml", xmlKeyExtractor);
    return output;
  },
};
