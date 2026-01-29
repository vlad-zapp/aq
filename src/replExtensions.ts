/** Build a property path, using bracket notation for keys with special chars. */
function joinPath(path: string, key: string): string {
    if (/^[\w$]+$/u.test(key) && !/^\d/.test(key)) {
        return path ? `${path}.${key}` : key;
    }
    return path ? `${path}["${key}"]` : `["${key}"]`;
}

export function aqFindByLocator(
    locator: (parent: string, name: string, value: unknown) => boolean,
    root?: object
): Array<{ path: string; value: unknown }> {
    if (!root) {
        root = (globalThis as any).data; // Default to globalThis.data
    }

    if (!root) {
        throw new Error("No root object provided and globalThis.data is undefined.");
    }

    const results: Array<{ path: string; value: unknown }> = [];

    // Helper function to recursively search
    function search(node: any, path: string): void {
        if (node && typeof node === "object") {
            const foundEntries = Object.entries(node).filter(([key, value]) => {
                if (typeof key === "string") {
                    const fullPath = joinPath(path, key);
                    return locator(fullPath, key, value);
                }
                return false;
            });

            foundEntries.forEach(([key, value]) => {
                const fullPath = joinPath(path, key);
                results.push({ path: fullPath, value });
            });

            // Recursively search in objects, arrays, and maps
            if (Array.isArray(node)) {
                node.forEach((item, index) => search(item, `${path}[${index}]`));
            } else if (node instanceof Map) {
                node.forEach((value, key) => search(value, `${path}[${key}]`));
            } else {
                Object.entries(node).forEach(([key, value]) => {
                    search(value, joinPath(path, key));
                });
            }
        }
    }

    search(root, "");
    return results;
}

export function aqFindByName(this: object, locator: string) {
    const locatorRx = new RegExp(locator);
    return aqFindByLocator((parent, name, obj) => locatorRx.test(name), this);
}

export function aqFindByFullName(this: object, locator: string) {
    const locatorRx = new RegExp(locator);
    return aqFindByLocator((parent, name, obj) => locatorRx.test(joinPath(parent, name)), this);
}

export function aqFindByValue(this: object, locator: string) {
    const locatorRx = new RegExp(locator);
    return aqFindByLocator((parent, name, obj) => {
        if (typeof obj === "string") {
            return locatorRx.test(obj);
        }
        return false;
    }, this);
}

export function aqDiff(...objects: object[]): object {
    if (objects.length < 2) {
        throw new Error("aqDiff requires at least two objects to compare.");
    }

    function diffHelper(keys: Set<string>, objs: object[]): any {
        const result: any = {};

        for (const key of keys) {
            const values = objs.map((obj) => (obj as any)[key]);

            // Check if all values are the same
            const allEqual = values.every((val, _, arr) => JSON.stringify(val) === JSON.stringify(arr[0]));

            if (!allEqual) {
                if (values.some((val) => typeof val === "object" && val !== null)) {
                    // If any value is an object, recurse
                    const subKeys = new Set(
                        values.flatMap((val) => (val && typeof val === "object" ? Object.keys(val) : []))
                    );
                    result[key] = diffHelper(subKeys, values.map((val) => (val && typeof val === "object" ? val : {})));
                } else {
                    // Otherwise, store the differing values
                    result[key] = values.map((val, index) => ({ [`obj${index + 1}`]: val }));
                }
            }
        }

        return result;
    }

    // Collect all keys from all objects
    const allKeys = new Set(objects.flatMap((obj) => Object.keys(obj)));

    // Perform the diff
    return diffHelper(allKeys, objects);
}

import {
    getComment,
    getComments,
    setComment,
    type CommentMap,
    type CommentEntry,
} from "./infrastructure/comments.ts";

export function aqComments(
    this: object,
    key?: string,
): CommentMap | CommentEntry | undefined {
    if (key !== undefined) {
        return getComment(this, key);
    }
    return getComments(this);
}

// ---- Tracked Proxy for .comment() / .commentAfter() ----

/**
 * Global tracker: stores the (parent, key) from the most recent property
 * access on a tracked proxy.  Primitives can't carry proxy metadata, so
 * Number/String/Boolean.prototype.comment reads this instead.
 */
const _ct = { parent: null as object | null, key: null as string | null };

/**
 * Wrap an object in a Proxy that tracks parent/key through property chains.
 *
 *   data.user.age.comment("not too old")
 *     1. data.user  → proxy; remembers parent=data, key="user"
 *     2. .age       → primitive 30; sets _ct={parent=user, key="age"}
 *     3. .comment() → Number.prototype.comment reads _ct
 *
 * For object values .comment() is intercepted directly by the proxy.
 */
export function tracked(obj: unknown, parent?: object, key?: string): unknown {
    if (obj === null || obj === undefined || typeof obj !== "object") return obj;

    return new Proxy(obj as object, {
        get(target, prop, receiver) {
            // .comment(text?) — get/set "before" comment
            if (prop === "comment") {
                const p = parent, k = key;
                return function (text?: string) {
                    const cp = p ?? target;
                    const ck = k ?? "#";
                    if (arguments.length === 0) return getComment(cp, ck)?.before;
                    const existing = getComment(cp, ck) ?? {};
                    setComment(cp, ck, { ...existing, before: text ?? undefined });
                    return receiver;
                };
            }
            // .commentAfter(text?) — get/set "after" (inline) comment
            if (prop === "commentAfter") {
                const p = parent, k = key;
                return function (text?: string) {
                    const cp = p ?? target;
                    const ck = k ?? "#";
                    if (arguments.length === 0) return getComment(cp, ck)?.after;
                    const existing = getComment(cp, ck) ?? {};
                    setComment(cp, ck, { ...existing, after: text ?? undefined });
                    return receiver;
                };
            }

            const value = Reflect.get(target, prop, receiver);

            // Track string-keyed accesses for primitive .comment() support
            if (typeof prop === "string") {
                _ct.parent = target;
                _ct.key = prop;
            }

            // Recursively wrap child objects so the chain continues
            if (value !== null && value !== undefined && typeof value === "object") {
                return tracked(value, target, String(prop));
            }

            return value;
        },
        set(target, prop, value) {
            return Reflect.set(target, prop, value);
        },
        deleteProperty(target, prop) {
            return Reflect.deleteProperty(target, prop);
        },
        has(target, prop) {
            return Reflect.has(target, prop);
        },
        ownKeys(target) {
            return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor(target, prop) {
            return Reflect.getOwnPropertyDescriptor(target, prop);
        },
        getPrototypeOf(target) {
            return Reflect.getPrototypeOf(target);
        },
    });
}

// ---- Primitive prototype .comment / .commentAfter ----
// When data.user.age (a number) is accessed through a tracked proxy,
// _ct holds {parent: user_obj, key: "age"}.  Auto-boxing then calls
// Number.prototype.comment which reads _ct.

function _primitiveComment(this: unknown, text?: string): string | undefined | unknown {
    const { parent, key } = _ct;
    if (!parent || !key) return undefined;
    if (arguments.length === 0) return getComment(parent, key)?.before;
    const existing = getComment(parent, key) ?? {};
    setComment(parent, key, { ...existing, before: text ?? undefined });
    return this;
}

function _primitiveCommentAfter(this: unknown, text?: string): string | undefined | unknown {
    const { parent, key } = _ct;
    if (!parent || !key) return undefined;
    if (arguments.length === 0) return getComment(parent, key)?.after;
    const existing = getComment(parent, key) ?? {};
    setComment(parent, key, { ...existing, after: text ?? undefined });
    return this;
}

for (const proto of [Number.prototype, String.prototype, Boolean.prototype] as any[]) {
    Object.defineProperty(proto, "comment", {
        value: _primitiveComment,
        writable: true,
        configurable: true,
    });
    Object.defineProperty(proto, "commentAfter", {
        value: _primitiveCommentAfter,
        writable: true,
        configurable: true,
    });
}

// ---- Object.prototype helpers (aqFind*, aqComments) ----

(globalThis as any).aqDiff = aqDiff;

for (const [name, fn] of Object.entries({
    aqFindByLocator,
    aqFindByName,
    aqFindByFullName,
    aqFindByValue,
    aqComments,
})) {
    Object.defineProperty(Object.prototype, name, {
        value: fn,
        writable: true,
        configurable: true,
    });
}

(globalThis as any).aqFindByLocator = aqFindByLocator;
(globalThis as any).aqFindByName = aqFindByName;
(globalThis as any).aqFindByFullName = aqFindByFullName;
(globalThis as any).aqFindByValue = aqFindByValue;
(globalThis as any).aqComments = function (obj: object, key?: string) {
    return aqComments.call(obj, key);
};
