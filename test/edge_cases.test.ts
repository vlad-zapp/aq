import { describe, it, expect } from "vitest";
import { AqEngine } from "../src/core/AqEngine";
import * as path from "path";
import * as fs from "fs";

describe("Edge Cases", () => {
    const engine = new AqEngine();
    const context = { query: "", interactive: false, interactiveWithOutput: false, outputFormat: "json" };

    it("should handle malformed JSON gracefully", () => {
        expect(() => engine.parseString("{ invalid json ", "json", context)).toThrow();
    });

    it("should handle mixed unicode characters", () => {
        const input = JSON.stringify({ message: "Hello 🌍! This is Aq." });
        const result = engine.parseString(input, "json", context);
        // We need to unwrap strictly for test comparison if it's wrapped in ParsedData
        const unwrapped = engine.unwrapData([result]) as any;
        expect(unwrapped.message).toBe("Hello 🌍! This is Aq.");
    });

    it("should handle undefined query results", () => {
        const data = { foo: "bar" };
        const query = "data.baz"; // undefined
        const result = engine.executeQuery(data, query);
        expect(result).toBeUndefined();
    });

    it("should handle null query results", () => {
        const data = { foo: null };
        const query = "data.foo";
        const result = engine.executeQuery(data, query);
        expect(result).toBeNull();
    });

    it("should handle deeply nested data", () => {
        let nested: any = { val: 1 };
        for (let i = 0; i < 100; i++) {
            nested = { next: nested };
        }
        const parsed = engine.parseString(JSON.stringify(nested), "json", context);
        const unwrapped = engine.unwrapData([parsed]);
        expect(unwrapped).toBeDefined();
    });
});
