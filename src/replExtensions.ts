import { regexp } from "https://deno.land/std@0.224.0/yaml/_type/regexp.ts";

// Implementation
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
                    const fullPath = path ? `${path}.${key}` : key;
                    return locator(fullPath, key, value);
                }
                return false;
            });

            foundEntries.forEach(([key, value]) => {
                const fullPath = path ? `${path}.${key}` : key;
                results.push({ path: fullPath, value }); // Push as an object with `path` and `value`
            });

            // Recursively search in objects, arrays, and maps
            if (Array.isArray(node)) {
                node.forEach((item, index) => search(item, `${path}[${index}]`));
            } else if (node instanceof Map) {
                node.forEach((value, key) => search(value, `${path}[${key}]`));
            } else {
                Object.entries(node).forEach(([key, value]) => {
                    const newPath = path ? `${path}.${key}` : key;
                    search(value, newPath);
                });
            }
        }
    }

    search(root, "");
    return results;
}

Object.defineProperty(Object.prototype, "aqFindByLocator", {
    value: function (this: object, locator: (parent : string, name : string, value: unknown) => boolean) {
        return aqFindByLocator(locator, this);
    },
    writable: true,
    configurable: true,
});

Object.defineProperty(Object.prototype, "aqFindName", {
    value: function (this: object, locator: string) {
        const locatorRx = new RegExp(locator);
        return aqFindByLocator((parent, name, obj) => locatorRx.test(name), this);
    },
    writable: true,
    configurable: true,
});

Object.defineProperty(Object.prototype, "aqFindFullName", {
    value: function (this: object, locator: string) {
        const locatorRx = new RegExp(locator);
        return aqFindByLocator((parent, name, obj) => locatorRx.test(`${parent}.${name}`), this);
    },
    writable: true,
    configurable: true,
});

Object.defineProperty(Object.prototype, "aqFindValue", {
    value: function (this: object, locator: string) {
        const locatorRx = new RegExp(locator);
        return aqFindByLocator((parent, name, obj) => {
            if (typeof obj === "string") {
                return locatorRx.test(obj);
            } 
            return false;
        }, this);
    },
    writable: true,
    configurable: true,
});