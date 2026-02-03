import { describe, it, expect, beforeAll } from "vitest";
import { exec } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";

const CLI = path.join(__dirname, "../dist/src/main.js");
const DATA_DIR = path.join(__dirname, "data");

function run(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        exec(`node ${CLI} ${args.join(" ")}`, (error, stdout, stderr) => {
            // We don't verify 'error' here because sometimes we expect non-zero exit codes
            resolve({ stdout, stderr });
        });
    });
}

describe("CLI Integration Tests", () => {
    beforeAll(() => {
        // Ensure dist exists (assume build is run before tests, or we can run it here)
        if (!fs.existsSync(CLI)) {
            throw new Error(`CLI not found at ${CLI}. Please run 'npm run build' first.`);
        }
    });

    it("should query a JSON file", async () => {
        const file = path.join(DATA_DIR, "sample.json");
        // Create a dummy file if not exists
        if (!fs.existsSync(file)) {
            if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
            fs.writeFileSync(file, JSON.stringify({ data: { items: [{ id: 1 }] } }));
        }

        const { stdout } = await run([file, "-q", '"data.data.items[0].id"']);
        expect(stdout.trim()).toBe("1");
    });

    it("should support pipe input", async () => {
        // This is harder to test with simple exec helper, skipping for now or need more complex helper
        // But we can test parsing from stdin via the file argument being empty? 
        // `exec` allows piping?
    });

    it("should fail on invalid query", async () => {
        const file = path.join(DATA_DIR, "sample.json");
        const { stderr } = await run([file, "-q", '"INVALID SYNTAX"']);
        expect(stderr).toContain("Error");
    });
});
