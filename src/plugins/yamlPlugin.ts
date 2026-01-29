import {
  Document,
  isMap,
  isScalar,
  isSeq,
  parseAllDocuments,
  type Pair,
  type Scalar,
  type YAMLMap,
  type YAMLSeq,
} from "npm:yaml";
import { AqPlugin } from "../infrastructure/aqPlugin.ts";
import {
  type CommentEntry,
  getComment,
  hasComments,
  setComment,
} from "../infrastructure/comments.ts";
import { MULTI_DOC, ParsedData } from "../infrastructure/ParsedData.ts";

/**
 * Normalize npm:yaml comment text to our format.
 * npm:yaml prefixes each comment line with a space; we trim each line.
 */
function norm(text: string | null | undefined): string | null {
  if (text == null) return null;
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.length > 0 ? lines.join("\n") : null;
}

/**
 * Convert our normalized comment text back to npm:yaml's format
 * (each line prefixed with a space so it renders as "# text").
 */
function toAst(text: string): string {
  return text
    .split("\n")
    .map((l) => " " + l)
    .join("\n");
}

// ---- DECODE: AST → CommentMap ----

/**
 * Walk a npm:yaml AST node and extract comments into our CommentMap.
 */
function extractCommentsFromNode(
  node: unknown,
  jsValue: unknown,
): void {
  if (!jsValue || typeof jsValue !== "object") return;

  if (isMap(node)) {
    const obj = jsValue as Record<string, unknown>;
    const map = node as YAMLMap;

    // Nested map's commentBefore → first key's before comment
    const containerBefore = norm(map.commentBefore);

    for (let i = 0; i < map.items.length; i++) {
      const pair = map.items[i] as Pair;
      const key = pair.key as Scalar;
      const keyStr = String(key.value);

      const entry: CommentEntry = {};

      // First key gets the container's commentBefore
      if (i === 0 && containerBefore) {
        entry.before = containerBefore;
      }

      // Key's own commentBefore
      const keyBefore = norm(key.commentBefore);
      if (keyBefore) {
        entry.before = entry.before
          ? entry.before + "\n" + keyBefore
          : keyBefore;
      }

      // Inline comment (only on scalar values)
      if (isScalar(pair.value)) {
        const valComment = norm((pair.value as Scalar).comment);
        if (valComment) entry.after = valComment;
      }

      if (entry.before || entry.after) {
        setComment(obj, keyStr, entry);
      }

      // Recurse into nested values
      const childValue = obj[keyStr];
      if (childValue && typeof childValue === "object") {
        extractCommentsFromNode(pair.value, childValue);
      }
    }
  } else if (isSeq(node)) {
    const arr = jsValue as unknown[];
    const seq = node as YAMLSeq;

    // Seq's commentBefore → first item's before
    const containerBefore = norm(seq.commentBefore);

    for (let i = 0; i < seq.items.length; i++) {
      const item = seq.items[i];
      const entry: CommentEntry = {};

      if (i === 0 && containerBefore) {
        entry.before = containerBefore;
      }

      // Item's own commentBefore
      const itemNode = item as any;
      if (
        itemNode &&
        typeof itemNode === "object" &&
        "commentBefore" in itemNode
      ) {
        const itemBefore = norm(itemNode.commentBefore);
        if (itemBefore) {
          entry.before = entry.before
            ? entry.before + "\n" + itemBefore
            : itemBefore;
        }
      }

      if (entry.before || entry.after) {
        setComment(arr, String(i), entry);
      }

      // Recurse
      if (arr[i] && typeof arr[i] === "object") {
        extractCommentsFromNode(item, arr[i]);
      }
    }
  }
}

/**
 * Extract comments from a parsed Document into the JS value's CommentMap.
 */
function extractDocComments(doc: Document, jsValue: unknown): void {
  if (!jsValue || typeof jsValue !== "object") return;

  // Extract per-key/item comments from AST
  extractCommentsFromNode(doc.contents, jsValue);

  // Document-level header: doc.commentBefore (multi-doc with ---)
  const docBefore = norm(doc.commentBefore);
  if (docBefore) {
    const existing = getComment(jsValue, "#");
    setComment(jsValue as object, "#", { ...existing, before: docBefore });
  }

  // Single-doc header: first pair's key.commentBefore (no --- marker)
  if (!docBefore && isMap(doc.contents)) {
    const map = doc.contents as YAMLMap;
    const firstPair = map.items[0] as Pair | undefined;
    if (firstPair) {
      const containerBefore = norm(map.commentBefore);
      const firstKeyBefore = norm(
        (firstPair.key as Scalar).commentBefore,
      );
      const headerText = containerBefore || firstKeyBefore;
      if (headerText) {
        const existing = getComment(jsValue, "#");
        setComment(jsValue as object, "#", {
          ...existing,
          before: headerText,
        });
      }
    }
  }

  // Trailing comment
  const docAfter = norm(doc.comment);
  if (docAfter) {
    const existing = getComment(jsValue, "#");
    setComment(jsValue as object, "#", { ...existing, after: docAfter });
  }
}

// ---- ENCODE: CommentMap → AST ----

/**
 * Attach comments from CommentMap to npm:yaml AST nodes.
 */
function attachCommentsToNode(
  node: unknown,
  jsValue: unknown,
  isRoot: boolean,
): void {
  if (!jsValue || typeof jsValue !== "object" || !hasComments(jsValue)) return;

  if (isMap(node)) {
    const obj = jsValue as Record<string, unknown>;
    const map = node as YAMLMap;

    for (let i = 0; i < map.items.length; i++) {
      const pair = map.items[i] as Pair;
      const key = pair.key as Scalar;
      const keyStr = String(key.value);

      const comment = getComment(obj, keyStr);
      if (comment?.before) {
        if (i === 0 && !isRoot) {
          // Nested first key: set on map.commentBefore
          map.commentBefore = toAst(comment.before);
        } else if (i > 0) {
          // Non-first key: set on key.commentBefore
          key.commentBefore = toAst(comment.before);
        }
        // Root first key: handled by attachDocComments
      }

      if (comment?.after && isScalar(pair.value)) {
        (pair.value as Scalar).comment = toAst(comment.after);
      }

      // Recurse
      const childValue = obj[keyStr];
      if (childValue && typeof childValue === "object") {
        attachCommentsToNode(pair.value, childValue, false);
      }
    }
  } else if (isSeq(node)) {
    const arr = jsValue as unknown[];
    const seq = node as YAMLSeq;

    for (let i = 0; i < seq.items.length; i++) {
      const item = seq.items[i];
      const comment = getComment(arr, String(i));

      if (comment?.before) {
        if (i === 0) {
          // First item: set on seq.commentBefore
          seq.commentBefore = toAst(comment.before);
        } else {
          // Other items: set on item.commentBefore
          const itemNode = item as any;
          if (itemNode && typeof itemNode === "object") {
            itemNode.commentBefore = toAst(comment.before);
          }
        }
      }

      // Recurse
      if (arr[i] && typeof arr[i] === "object") {
        attachCommentsToNode(item, arr[i], false);
      }
    }
  }
}

/**
 * Attach document-level comments and per-key/item comments to a Document.
 */
function attachDocComments(doc: Document, jsValue: unknown): void {
  if (!jsValue || typeof jsValue !== "object") return;

  const containerComment = getComment(jsValue, "#");

  // Header: always set on first pair's key.commentBefore
  // (avoids --- in single doc; appears after --- in multi-doc join)
  if (containerComment?.before && isMap(doc.contents)) {
    const firstPair = (doc.contents as YAMLMap).items[0] as Pair | undefined;
    if (firstPair) {
      (firstPair.key as Scalar).commentBefore = toAst(containerComment.before);
    }
  }

  // Trailing comment
  if (containerComment?.after) {
    doc.comment = toAst(containerComment.after);
  }

  // Attach per-key/item comments
  attachCommentsToNode(doc.contents, jsValue, true);
}

// ---- PLUGIN ----

export const YamlPlugin: AqPlugin = {
  name: "YAML",

  detect: (filename: string | undefined): boolean => {
    return filename?.toLowerCase().endsWith(".yaml") ||
      filename?.toLowerCase().endsWith(".yml") === true;
  },

  decode: (input: string): ParsedData => {
    // Guard: reject JSON input (use JSON plugin instead)
    let parsedAsJson = null;
    try {
      parsedAsJson = JSON.parse(input);
    } catch {
      // Ignore
    }
    if (typeof parsedAsJson === "object" && parsedAsJson !== null) {
      throw new Error(
        "I don't recognize YAML as a superset of JSON. Please use JSON parser instead.",
      );
    }

    const yamlDocs = parseAllDocuments(input);
    const docs: unknown[] = yamlDocs.length > 0
      ? yamlDocs.map((d) => d.toJS())
      : [null]; // comment-only input yields a single null document
    const isMulti = docs.length > 1;

    if (isMulti) {
      (docs as any)[MULTI_DOC] = true;
    }

    // Extract comments from AST
    for (let i = 0; i < yamlDocs.length; i++) {
      const jsValue = docs[i];
      if (jsValue && typeof jsValue === "object") {
        extractDocComments(yamlDocs[i], jsValue);
      }
    }

    return new ParsedData(docs, {
      isMultiDocument: isMulti,
      sourceFormat: "YAML",
    });
  },

  encode: (data: unknown): string => {
    if ((data as any)[MULTI_DOC] === true) {
      if (!Array.isArray(data)) {
        throw new Error(
          "Invalid YAML data structure. Expected an array for multi-document YAML.",
        );
      }
      return data
        .map((item) => {
          const doc = new Document(item);
          attachDocComments(doc, item);
          return doc.toString({ lineWidth: 0 });
        })
        .join("---\n");
    }

    const doc = new Document(data);
    attachDocComments(doc, data);
    return doc.toString({ lineWidth: 0 });
  },
};
