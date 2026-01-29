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

(globalThis as any).aqDiff = aqDiff;

Object.defineProperty(Object.prototype, "aqFindByLocator", {
    value: aqFindByLocator,
    writable: true,
    configurable: true,
});

Object.defineProperty(Object.prototype, "aqFindByName", {
    value: aqFindByName,
    writable: true,
    configurable: true,
});

Object.defineProperty(Object.prototype, "aqFindByFullName", {
    value: aqFindByFullName,
    writable: true,
    configurable: true,
});

Object.defineProperty(Object.prototype, "aqFindByValue", {
    value: aqFindByValue,
    writable: true,
    configurable: true,
});

Object.defineProperty(Object.prototype, "aqComments", {
    value: aqComments,
    writable: true,
    configurable: true,
});

(globalThis as any).aqFindByLocator = aqFindByLocator;
(globalThis as any).aqFindByName = aqFindByName;
(globalThis as any).aqFindByFullName = aqFindByFullName;
(globalThis as any).aqFindByValue = aqFindByValue;
(globalThis as any).aqComments = function (obj: object, key?: string) {
    return aqComments.call(obj, key);
};