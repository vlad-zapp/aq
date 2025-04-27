import { AqPlugin } from "../infrastructure/aqPlugin.ts";
import { parse as parseXml, stringify as stringifyXml } from "https://deno.land/x/xml/mod.ts";

export const XmlPlugin: AqPlugin = {
  name: "XML",
  
  detect: (filename : string | undefined): boolean => {
    return filename?.toLowerCase().endsWith(".xml") || filename?.toLowerCase().endsWith(".xhtml") ||
           filename?.toLowerCase().endsWith(".rss") || filename?.toLowerCase().endsWith(".atom") ||
           filename?.toLowerCase().endsWith(".svg") || filename?.toLowerCase().endsWith(".xul") ||
           filename?.toLowerCase().endsWith(".wsdl") || filename?.toLowerCase().endsWith(".xop") ||
           filename?.toLowerCase().endsWith(".xsd") || filename?.toLowerCase().endsWith(".xslt") ||
           filename?.toLowerCase().endsWith(".xforms") || filename?.toLowerCase().endsWith(".xmlschema") ||
           filename?.toLowerCase().endsWith(".xmlns") || filename?.toLowerCase().endsWith(".xmlrpc") ||
           filename?.toLowerCase().endsWith(".xmltv") || filename?.toLowerCase().endsWith(".xquery") ||
           filename?.toLowerCase().endsWith(".xsl") || filename?.toLowerCase().endsWith(".xmi") === true;
  },
  
  decode: (input: string): unknown => {
    return parseXml(input); // Convert XML to a JSON-like structure
  },

  encode: (data: unknown): string => {
    if (typeof data !== "object" ) {
      throw new Error("query result must be an object to convert to XML because xml document should have a single root tag.");
    }
    if (data === null) {
      return "";
    }
    return stringifyXml(data as Record<string, unknown>);  },
};