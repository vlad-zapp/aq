/**
 * Comment metadata infrastructure for aq.
 *
 * Uses Symbol.for() to attach invisible comment metadata to any object or array.
 * Comments are non-enumerable and won't appear in JSON.stringify, Object.keys, etc.
 */

/** Well-known symbol for comment metadata on objects/arrays. */
export const COMMENTS = Symbol.for("aq:comments");

/** Comment entry for a single key/index/container. */
export interface CommentEntry {
  before?: string;
  after?: string;
}

/** Map of key → comment entry. "#" key = container-level comments. */
export type CommentMap = Record<string, CommentEntry>;

export function hasComments(obj: unknown): boolean {
  return (
    obj !== null &&
    typeof obj === "object" &&
    COMMENTS in (obj as Record<symbol, unknown>)
  );
}

export function getComments(obj: unknown): CommentMap | undefined {
  if (hasComments(obj)) {
    return (obj as any)[COMMENTS];
  }
  return undefined;
}

export function getComment(
  obj: unknown,
  key?: string,
): CommentEntry | undefined {
  const map = getComments(obj);
  if (!map) return undefined;
  return map[key ?? "#"];
}

export function setComments(obj: object, map: CommentMap): void {
  Object.defineProperty(obj, COMMENTS, {
    value: map,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

export function setComment(
  obj: object,
  key: string,
  entry: CommentEntry,
): void {
  if (!hasComments(obj)) {
    setComments(obj, {});
  }
  (obj as any)[COMMENTS][key] = entry;
}

export function cloneComments(source: unknown, target: object): void {
  const map = getComments(source);
  if (map) {
    setComments(target, { ...map });
  }
}
