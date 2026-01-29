import {
  Alias,
  Document,
  isAlias,
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
  getComments,
  hasComments,
  setComment,
} from "../infrastructure/comments.ts";
import {
  type AnchorEntry,
  type AnchorMap,
  getAnchors,
  hasAnchors,
  setAnchor,
} from "../infrastructure/anchors.ts";
import { MULTI_DOC, ParsedData } from "../infrastructure/ParsedData.ts";

/**
 * Normalize npm:yaml comment text to our format.
 * npm:yaml prefixes each comment line with a space; we trim each line.
 */
function norm(text: string | null | undefined): string | null {
  if (text == null) return null;
  const lines = text.split("\n").map((l) => l.trim());
  // Trim leading empty lines only; preserve internal and trailing ones
  while (lines.length > 0 && lines[0].length === 0) lines.shift();
  return lines.length > 0 ? lines.join("\n") : null;
}

/**
 * Convert our normalized comment text back to npm:yaml's format
 * (each line prefixed with a space so it renders as "# text").
 */
function toAst(text: string): string {
  return text
    .split("\n")
    .map((l) => (l.length > 0 ? " " + l : ""))
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

    // Trailing comment after the last entry (map.comment)
    const mapTrailing = norm(map.comment);
    if (mapTrailing) {
      const existing = getComment(obj, "#");
      setComment(obj, "#", { ...existing, after: mapTrailing });
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

    // Trailing comment after the last item (seq.comment)
    const seqTrailing = norm(seq.comment);
    if (seqTrailing) {
      const existing = getComment(arr, "#");
      setComment(arr as object, "#", { ...existing, after: seqTrailing });
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

        // Remove the promoted header text from the first key's before comment
        // to avoid duplication (extractCommentsFromNode already placed it there)
        const firstKeyStr = String((firstPair.key as Scalar).value);
        const firstKeyComment = getComment(jsValue, firstKeyStr);
        if (firstKeyComment?.before) {
          const remaining = firstKeyComment.before === headerText
            ? undefined
            : firstKeyComment.before.startsWith(headerText + "\n")
              ? firstKeyComment.before.slice(headerText.length + 1)
              : firstKeyComment.before;
          if (remaining || firstKeyComment.after) {
            setComment(jsValue as object, firstKeyStr, {
              ...(remaining ? { before: remaining } : {}),
              ...(firstKeyComment.after ? { after: firstKeyComment.after } : {}),
            });
          } else {
            // Remove the comment entry entirely
            const comments = getComments(jsValue);
            if (comments) delete comments[firstKeyStr];
          }
        }
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
  if (!jsValue || typeof jsValue !== "object") return;

  if (isMap(node)) {
    const obj = jsValue as Record<string, unknown>;
    const map = node as YAMLMap;
    const objHasComments = hasComments(jsValue);

    for (let i = 0; i < map.items.length; i++) {
      const pair = map.items[i] as Pair;
      const key = pair.key as Scalar;
      const keyStr = String(key.value);

      const comment = objHasComments ? getComment(obj, keyStr) : undefined;
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

    // Trailing comment after the last entry (non-root only; root handled by attachDocComments)
    if (!isRoot && objHasComments) {
      const containerComment = getComment(obj, "#");
      if (containerComment?.after) {
        map.comment = toAst(containerComment.after);
      }
    }
  } else if (isSeq(node)) {
    const arr = jsValue as unknown[];
    const seq = node as YAMLSeq;
    const arrHasComments = hasComments(jsValue);

    for (let i = 0; i < seq.items.length; i++) {
      const item = seq.items[i];
      const comment = arrHasComments ? getComment(arr, String(i)) : undefined;

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

    // Trailing comment after the last item
    if (arrHasComments) {
      const containerComment = getComment(arr, "#");
      if (containerComment?.after) {
        seq.comment = toAst(containerComment.after);
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

// ---- ANCHOR / ALIAS PRESERVATION ----

/**
 * Walk the npm:yaml AST and record which values are anchors or aliases.
 * Stores metadata on the JS parent object via ANCHORS symbol.
 */
function extractAnchorsFromNode(node: unknown, jsValue: unknown): void {
  if (!jsValue || typeof jsValue !== "object") return;

  if (isMap(node)) {
    const map = node as YAMLMap;
    const obj = jsValue as Record<string, unknown>;

    for (const item of map.items) {
      const pair = item as Pair;
      const key = pair.key as Scalar;
      const keyStr = String(key.value);
      const val = pair.value;

      if (isAlias(val)) {
        setAnchor(obj, keyStr, { alias: (val as any).source });
      } else {
        if (val && typeof val === "object" && "anchor" in val && val.anchor) {
          setAnchor(obj, keyStr, { anchor: val.anchor as string });
        }
        // Recurse into non-alias values
        const childValue = obj[keyStr];
        if (childValue && typeof childValue === "object") {
          extractAnchorsFromNode(val, childValue);
        }
      }
    }
  } else if (isSeq(node)) {
    const seq = node as YAMLSeq;
    const arr = jsValue as unknown[];

    for (let i = 0; i < seq.items.length; i++) {
      const item = seq.items[i];

      if (isAlias(item)) {
        setAnchor(arr as object, String(i), {
          alias: (item as any).source,
        });
      } else {
        if (
          item && typeof item === "object" && "anchor" in item && item.anchor
        ) {
          setAnchor(arr as object, String(i), {
            anchor: item.anchor as string,
          });
        }
        if (arr[i] && typeof arr[i] === "object") {
          extractAnchorsFromNode(item, arr[i]);
        }
      }
    }
  }
}

/**
 * Apply stored anchor/alias metadata back to a npm:yaml AST.
 * Sets `node.anchor` for anchor definitions and replaces alias positions
 * with Alias nodes.
 */
function applyAnchorsToNode(node: unknown, jsValue: unknown): void {
  if (!jsValue || typeof jsValue !== "object") return;

  const anchorMap = getAnchors(jsValue);

  if (isMap(node)) {
    const map = node as YAMLMap;
    const obj = jsValue as Record<string, unknown>;

    for (let i = 0; i < map.items.length; i++) {
      const pair = map.items[i] as Pair;
      const key = pair.key as Scalar;
      const keyStr = String(key.value);
      const entry = anchorMap?.[keyStr];

      if (entry?.alias) {
        // Replace the expanded value with an alias node
        (pair as any).value = new Alias(entry.alias);
      } else {
        if (entry?.anchor && pair.value && typeof pair.value === "object") {
          (pair.value as any).anchor = entry.anchor;
        }
        // Recurse into children
        const childValue = obj[keyStr];
        if (childValue && typeof childValue === "object") {
          applyAnchorsToNode(pair.value, childValue);
        }
      }
    }
  } else if (isSeq(node)) {
    const seq = node as YAMLSeq;
    const arr = jsValue as unknown[];

    for (let i = 0; i < seq.items.length; i++) {
      const entry = anchorMap?.[String(i)];

      if (entry?.alias) {
        seq.items[i] = new Alias(entry.alias) as any;
      } else {
        if (
          entry?.anchor && seq.items[i] &&
          typeof seq.items[i] === "object"
        ) {
          (seq.items[i] as any).anchor = entry.anchor;
        }
        if (arr[i] && typeof arr[i] === "object") {
          applyAnchorsToNode(seq.items[i], arr[i]);
        }
      }
    }
  }
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
      ? yamlDocs.map((d) => d.toJS({ maxAliasCount: -1 }))
      : [null]; // comment-only input yields a single null document
    const isMulti = docs.length > 1;

    if (isMulti) {
      (docs as any)[MULTI_DOC] = true;
    }

    // Extract comments and anchors from AST
    for (let i = 0; i < yamlDocs.length; i++) {
      const jsValue = docs[i];
      if (jsValue && typeof jsValue === "object") {
        extractDocComments(yamlDocs[i], jsValue);
        extractAnchorsFromNode(yamlDocs[i].contents, jsValue);
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
          applyAnchorsToNode(doc.contents, item);
          return doc.toString({ lineWidth: 0 });
        })
        .join("---\n");
    }

    const doc = new Document(data);
    attachDocComments(doc, data);
    applyAnchorsToNode(doc.contents, data);
    return doc.toString({ lineWidth: 0 });
  },
};
