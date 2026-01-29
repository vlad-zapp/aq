/**
 * Anchor/alias metadata infrastructure for aq.
 *
 * Uses Symbol.for() to attach invisible anchor metadata to any object or array.
 * Anchors are non-enumerable and won't appear in JSON.stringify, Object.keys, etc.
 *
 * Metadata is stored on the PARENT object, keyed by child key name.
 * For example, given YAML:
 *   img: &my_anchor value
 *   ref: *my_anchor
 * The parent object stores:
 *   { img: { anchor: "my_anchor" }, ref: { alias: "my_anchor" } }
 */

/** Well-known symbol for anchor metadata on objects/arrays. */
export const ANCHORS = Symbol.for("aq:anchors");

/** Anchor entry for a single key/index. */
export interface AnchorEntry {
  anchor?: string; // Value defines this anchor name
  alias?: string; // Value is an alias of this anchor name
}

/** Map of key → anchor entry. */
export type AnchorMap = Record<string, AnchorEntry>;

export function hasAnchors(obj: unknown): boolean {
  return (
    obj !== null &&
    typeof obj === "object" &&
    ANCHORS in (obj as Record<symbol, unknown>)
  );
}

export function getAnchors(obj: unknown): AnchorMap | undefined {
  if (hasAnchors(obj)) {
    return (obj as any)[ANCHORS];
  }
  return undefined;
}

export function getAnchor(
  obj: unknown,
  key: string,
): AnchorEntry | undefined {
  const map = getAnchors(obj);
  if (!map) return undefined;
  return map[key];
}

export function setAnchor(
  obj: object,
  key: string,
  entry: AnchorEntry,
): void {
  if (!hasAnchors(obj)) {
    Object.defineProperty(obj, ANCHORS, {
      value: {} as AnchorMap,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  (obj as any)[ANCHORS][key] = entry;
}
