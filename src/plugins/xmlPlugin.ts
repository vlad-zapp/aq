import { AqPlugin } from "../infrastructure/aqPlugin.ts";
import { parse as parseXml, stringify as stringifyXml } from "https://deno.land/x/xml/mod.ts";

export const XmlPlugin: AqPlugin = {
  name: "XML",
  
  detect: (filename : string | undefined, input: string | undefined): boolean => {
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
  
  decode: (input: string): any => {
    return parseXml(input); // Convert XML to a JSON-like structure
  },

  encode: (data: any): string => {
    return stringifyXml(data)
  },
};