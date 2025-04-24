import { AqPlugin } from "../infrastructure/aqPlugin.ts";
import { parse as parseIni, stringify as stringifyIni } from "https://deno.land/x/ini/mod.ts";

export const IniPlugin: AqPlugin = {
  name: "INI",

  detect: (filename: string | undefined, content : string | undefined): boolean => {
    return filename?.toLowerCase().endsWith(".ini") || filename?.toLowerCase().endsWith(".cfg") === true;
  },

  decode: (input: string): any => {
    if (!input) {
        return false;
      }
  
      // ini parser is absolutely forgiving
      // so we need to check if the input is compliant with ini format
  
      const lines = input.split(/\r?\n/);
  
      // check if line is:
      // 1. A line with a section header (starts with [ and ends with ])
      // 2. A line with a key-value pair (key=value) with a value that is not empty
      // 3. A line with a comment (starts with ;)
      const iniLinePattern = /^\s*((\[.+\])|([\s\p{L}\p{N}\._\+-\/\\]+)=([\s\p{L}\p{N}\._\+-\/\\]+)|(;.*))\s*$/u;
  
      //at least 80% of lines should be compliant
      const compliantLines = lines.filter((line) => iniLinePattern.test(line));
      const compliantPercentage = (compliantLines.length / lines.length) * 100;
      if(compliantPercentage >= 80) {
        return parseIni(input);
      } else {
        throw new Error("The input is not compliant with INI format.");
      }
  },

  encode: (data: any): string => {
    return stringifyIni(data); // Convert JSON-like structure back to INI
  }
};