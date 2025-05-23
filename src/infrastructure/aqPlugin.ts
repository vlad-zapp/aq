import { ParsedData } from "./ParsedData.ts";

export interface AqPlugin {
  name: string; // Plugin name (e.g., "JSON", "YAML", "Database")

  /**
   * Detects if the plugin can handle the input.
   * @param filename - The name of the file or source.
   * @param content - The content of the file or source.
   * @returns A boolean indicating if the plugin can handle the input.
   */
  detect: (filename: string | undefined, content: string | undefined) => boolean;

  /**
   * Decodes data from a specific source into a list of AqNodes.
   * @param input - The raw data to decode (e.g., string, buffer, stream).
   * @param context - Additional metadata or configuration for decoding.
   * @returns A list of AqNodes representing the parsed data.
   */
  decode: (input: string, context?: Record<string, unknown>) => ParsedData;

  /**
   * Encodes a list of AqNodes into a specific format.
   * @param obj - The data to encode (e.g., object, array).
   * @param context - Additional metadata or configuration for encoding.
   * @returns The encoded data (e.g., string, buffer, or stream).
   */
  encode: (obj: unknown, context?: Record<string, unknown>) => unknown;
}
