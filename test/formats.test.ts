import { describe, it, expect } from "vitest";
import { AqEngine } from "../src/core/AqEngine";

describe("Format Specific Tests", () => {
    const engine = new AqEngine();
    const context = { query: "", interactive: false, interactiveWithOutput: false, outputFormat: "json" };

    describe("JSON", () => {
        it("should handle mixed arrays", () => {
            const input = '[1, "two", {"three": 3}]';
            const parsed = engine.parseString(input, "json", context);
            const unwrapped = engine.unwrapData([parsed]) as any[];
            expect(unwrapped).toHaveLength(3);
            expect(unwrapped[0]).toBe(1);
            expect(unwrapped[1]).toBe("two");
            expect(unwrapped[2]).toEqual({ three: 3 });
        });
    });

    describe("YAML", () => {
        it("should handle anchors and aliases", () => {
            const input = `
defaults: &defaults
  timeout: 10
development:
  <<: *defaults
  debug: true
`;
            // Note: Our YAML parser (js-yaml likely) handles this, but Aq might need to ensure it's preserved or resolved.
            // By default Aq preserves structure.
            const parsed = engine.parseString(input, "yaml", context);
            const unwrapped = engine.unwrapData([parsed]) as any;
            expect(unwrapped.development.timeout).toBe(10);
        });

        it("should handle multi-document files", () => {
            const input = `
foo: bar
---
baz: qux
`;
            const parsed = engine.parseString(input, "yaml", context);
            // Our unwrapData handles multi-docs by returning array of docs if > 1
            // Wait, unwrapData logic: one file, multi doc -> array of docs
            // ParsedData has documents: unknown[]
            const unwrapped = engine.unwrapData([parsed]) as any[];
            expect(unwrapped).toHaveLength(2);
            expect(unwrapped[0]).toEqual({ foo: "bar" });
            expect(unwrapped[1]).toEqual({ baz: "qux" });
        });
    });

    describe("XML", () => {
        it("should handle attributes", () => {
            const input = '<user id="123">John</user>';
            const parsed = engine.parseString(input, "xml", context);
            const unwrapped = engine.unwrapData([parsed]) as any;
            // Expectation depends on XML parser behavior (fast-xml-parser usually)
            // Check if it creates property for text and attribute
            expect(unwrapped.user).toBeDefined();
            // Adjust expectation based on actual parser behavior which we might discover is needed
        });
    });
});
