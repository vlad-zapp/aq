import { describe, it, expect } from "vitest";
import { AqEngine } from "../src/core/AqEngine";

describe("Security Sandboxing", () => {
    const engine = new AqEngine();
    const context = { query: "", interactive: false, interactiveWithOutput: false, outputFormat: "json" };

    it("should not allow access to process", () => {
        const data = { foo: "bar" };
        const query = "process.exit(1)";
        expect(() => engine.executeQuery(data, query)).toThrow();
    });

    it("should not allow requiring modules", () => {
        const data = { foo: "bar" };
        const query = "require('fs').writeFileSync('pwned.txt', 'fail')";
        expect(() => engine.executeQuery(data, query)).toThrow();
    });

    it("should allow safe standard JS operations", () => {
        const data = { items: [1, 2, 3] };
        const query = "data.items.map(x => x * 2)";
        const result = engine.executeQuery(data, query) as number[];
        expect(result).toEqual([2, 4, 6]);
    });
});
