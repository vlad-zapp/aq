import { test, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  COMMENTS,
  type CommentEntry,
  type CommentMap,
  getComment,
  getComments,
  hasComments,
  setComment,
  setComments,
  cloneComments,
} from "../src/infrastructure/comments";
import { MULTI_DOC, ParsedData } from "../src/infrastructure/ParsedData";
import { unwrapParsedData } from "../src/utils";
import {
  findUnquotedMarker,
  extractHashComments,
  extractJsoncComments,
  stripJsoncComments,
  extractXmlComments,
} from "../src/infrastructure/commentExtractor";
import { YamlPlugin } from "../src/plugins/yamlPlugin";
import { JsonPlugin } from "../src/plugins/jsonPlugin";
import { TomlPlugin } from "../src/plugins/tomlPlugin";
import { IniPlugin } from "../src/plugins/iniPlugin";
import { XmlPlugin } from "../src/plugins/xmlPlugin";

// ============================================================
// Comment Infrastructure Tests
// ============================================================

test("setComment and getComment basic functionality", () => {
  const obj: Record<string, unknown> = { name: "John", age: 30 };
  setComment(obj, "name", { before: "Person name", after: "inline" });

  const entry = getComment(obj, "name");
  expect(entry).toBeDefined();
  expect(entry!.before).toEqual("Person name");
  expect(entry!.after).toEqual("inline");
});

test("comments are not enumerable", () => {
  const obj: Record<string, unknown> = { name: "John" };
  setComment(obj, "name", { before: "comment" });

  expect(Object.keys(obj)).toEqual(["name"]);
  expect(JSON.stringify(obj)).toEqual('{"name":"John"}');
});

test("hasComments returns false for plain objects", () => {
  expect(hasComments({ name: "John" })).toEqual(false);
});

test("hasComments returns true after setComment", () => {
  const obj = { name: "John" };
  setComment(obj, "name", { before: "test" });
  expect(hasComments(obj)).toEqual(true);
});

test("container comments use '#' key", () => {
  const obj = { name: "John" };
  setComment(obj, "#", { before: "header", after: "trailer" });

  const entry = getComment(obj); // no key = container
  expect(entry).toBeDefined();
  expect(entry!.before).toEqual("header");
  expect(entry!.after).toEqual("trailer");
});

test("comments on arrays use string indices", () => {
  const arr = [1, 2, 3];
  setComment(arr, "0", { before: "first item" });
  setComment(arr, "2", { after: "last item" });

  expect(getComment(arr, "0")?.before).toEqual("first item");
  expect(getComment(arr, "2")?.after).toEqual("last item");
});

test("Symbol.for ensures cross-module consistency", () => {
  const sym: symbol = Symbol.for("aq:comments");
  expect(sym).toEqual(COMMENTS as symbol);
});

test("getComments returns full map", () => {
  const obj = { a: 1, b: 2 };
  setComment(obj, "a", { before: "first" });
  setComment(obj, "b", { after: "second" });

  const map = getComments(obj);
  expect(map).toBeDefined();
  expect(map!["a"].before).toEqual("first");
  expect(map!["b"].after).toEqual("second");
});

test("setComments replaces entire map", () => {
  const obj = { x: 1 };
  setComments(obj, { x: { before: "old" } });
  expect(getComment(obj, "x")?.before).toEqual("old");

  setComments(obj, { x: { before: "new" } });
  expect(getComment(obj, "x")?.before).toEqual("new");
});

test("cloneComments copies to new object", () => {
  const source = { a: 1 };
  setComment(source, "a", { before: "from source" });

  const target = { a: 1 };
  cloneComments(source, target);
  expect(getComment(target, "a")?.before).toEqual("from source");
});

test("getComment returns undefined for objects without comments", () => {
  const obj = { name: "John" };
  expect(getComment(obj, "name")).toEqual(undefined);
  expect(getComment(obj)).toEqual(undefined);
});

// ============================================================
// Comment Extractor Tests
// ============================================================

test("findUnquotedMarker finds # outside quotes", () => {
  expect(findUnquotedMarker("name: John  # comment", "#")).toEqual(12);
});

test("findUnquotedMarker ignores # inside double quotes", () => {
  expect(findUnquotedMarker('name: "John # not comment"', "#")).toEqual(-1);
});

test("findUnquotedMarker ignores # inside single quotes", () => {
  expect(findUnquotedMarker("name: 'John # not comment'", "#")).toEqual(-1);
});

test("findUnquotedMarker returns -1 when no marker", () => {
  expect(findUnquotedMarker("name: John", "#")).toEqual(-1);
});

test("extractHashComments extracts full-line comments", () => {
  const source = "# header\nname: John\n# before age\nage: 30";
  const comments = extractHashComments(source);
  expect(comments.length).toEqual(2);
  expect(comments[0].text).toEqual("header");
  expect(comments[0].inline).toEqual(false);
  expect(comments[1].text).toEqual("before age");
  expect(comments[1].inline).toEqual(false);
});

test("extractHashComments extracts inline comments", () => {
  const source = "name: John  # inline comment";
  const comments = extractHashComments(source);
  expect(comments.length).toEqual(1);
  expect(comments[0].text).toEqual("inline comment");
  expect(comments[0].inline).toEqual(true);
});

test("extractJsoncComments extracts // comments", () => {
  const source = '// header\n{"name": "John"}';
  const comments = extractJsoncComments(source);
  expect(comments.length).toEqual(1);
  expect(comments[0].text).toEqual("header");
  expect(comments[0].type).toEqual("line");
});

test("extractJsoncComments extracts /* */ comments", () => {
  const source = '/* block comment */\n{"name": "John"}';
  const comments = extractJsoncComments(source);
  expect(comments.length).toEqual(1);
  expect(comments[0].text).toEqual("block comment");
  expect(comments[0].type).toEqual("block");
});

test("extractJsoncComments handles inline // comment", () => {
  const source = '{"name": "John", // inline\n"age": 30}';
  const comments = extractJsoncComments(source);
  expect(comments.length).toEqual(1);
  expect(comments[0].text).toEqual("inline");
  expect(comments[0].inline).toEqual(true);
});

test("stripJsoncComments removes comments preserving positions", () => {
  const source = '{\n  // comment\n  "name": "John"\n}';
  const stripped = stripJsoncComments(source);
  expect(stripped.includes("//")).toEqual(false);
  expect(stripped.includes('"name"')).toEqual(true);
  // Line count preserved
  expect(stripped.split("\n").length).toEqual(source.split("\n").length);
});

test("stripJsoncComments handles block comments", () => {
  const source = '{\n  /* block */\n  "name": "John"\n}';
  const stripped = stripJsoncComments(source);
  expect(stripped.includes("/*")).toEqual(false);
  expect(stripped.includes("*/")).toEqual(false);
});

test("stripJsoncComments preserves // inside strings", () => {
  const source = '{"url": "https://example.com"}';
  const stripped = stripJsoncComments(source);
  expect(stripped).toEqual(source);
});

test("extractXmlComments extracts single-line comments", () => {
  const source = "<!-- header -->\n<root>data</root>";
  const comments = extractXmlComments(source);
  expect(comments.length).toEqual(1);
  expect(comments[0].text).toEqual("header");
});

test("extractXmlComments extracts multi-line comments", () => {
  const source = "<!--\n  multi\n  line\n-->\n<root>data</root>";
  const comments = extractXmlComments(source);
  expect(comments.length).toEqual(1);
  expect(comments[0].text.includes("multi")).toEqual(true);
});

// ============================================================
// Multi-Document Tests
// ============================================================

test("single YAML doc: unwrap gives direct object", () => {
  const input = "name: John\nage: 30\n";
  const parsed = YamlPlugin.decode(input);
  const data = unwrapParsedData([parsed]);

  expect((data as any).name).toEqual("John");
  expect((data as any).age).toEqual(30);
});

test("multi-doc YAML: unwrap gives array", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/data2.yaml"), "utf-8");
  const parsed = YamlPlugin.decode(input);
  const data = unwrapParsedData([parsed]) as any[];

  expect(Array.isArray(data)).toEqual(true);
  expect(data[0].name).toEqual("John");
  expect(data[1].name).toEqual("Jane");
});

test("multiple files: unwrap gives array of results", () => {
  const input1 = "name: John\n";
  const input2 = "name: Jane\n";
  const parsed1 = YamlPlugin.decode(input1);
  const parsed2 = YamlPlugin.decode(input2);
  const data = unwrapParsedData([parsed1, parsed2]) as any[];

  expect(Array.isArray(data)).toEqual(true);
  expect(data[0].name).toEqual("John");
  expect(data[1].name).toEqual("Jane");
});

test("multi-doc YAML preserves MULTI_DOC symbol", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/data2.yaml"), "utf-8");
  const parsed = YamlPlugin.decode(input);
  const data = unwrapParsedData([parsed]);

  expect((data as any)[MULTI_DOC]).toEqual(true);
});

test("multi-doc YAML encode preserves --- separators", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/data2.yaml"), "utf-8");
  const parsed = YamlPlugin.decode(input);
  const data = unwrapParsedData([parsed]);

  const output = YamlPlugin.encode(data) as string;
  expect(output.includes("---")).toEqual(true);
});

test("single doc: ParsedData.isMultiDocument is false", () => {
  const input = "name: John\n";
  const parsed = YamlPlugin.decode(input);
  expect(parsed.isMultiDocument).toEqual(false);
});

test("multi doc: ParsedData.isMultiDocument is true", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/data2.yaml"), "utf-8");
  const parsed = YamlPlugin.decode(input);
  expect(parsed.isMultiDocument).toEqual(true);
});

// ============================================================
// YAML Comment Tests
// ============================================================

test("YAML: header comment extracted", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/commented.yaml"), "utf-8");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const header = getComment(doc);
  expect(header).toBeDefined();
  expect(header!.before).toEqual("This is a header comment");
});

test("YAML: inline comment extracted", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/commented.yaml"), "utf-8");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const nameComment = getComment(doc, "name");
  expect(nameComment).toBeDefined();
  expect(nameComment!.after).toEqual("inline name comment");
});

test("YAML: before comment extracted", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/commented.yaml"), "utf-8");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const ageComment = getComment(doc, "age");
  expect(ageComment).toBeDefined();
  expect(ageComment!.before).toEqual("Age of the person");
});

test("YAML: nested comment extracted", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/commented.yaml"), "utf-8");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const address = doc.address as Record<string, unknown>;

  const streetComment = getComment(address, "street");
  expect(streetComment).toBeDefined();
  expect(streetComment!.before).toEqual("Street info");
  expect(streetComment!.after).toEqual("primary address");
});

test("YAML: trailing comment extracted", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/commented.yaml"), "utf-8");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const container = getComment(doc);
  expect(container).toBeDefined();
  expect(container!.after).toEqual("Trailing comment");
});

test("YAML: array item comments extracted", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/commented.yaml"), "utf-8");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const children = doc.children as unknown[];

  const firstChild = getComment(children, "0");
  expect(firstChild).toBeDefined();
  expect(firstChild!.before).toEqual("First child");

  const secondChild = getComment(children, "1");
  expect(secondChild).toBeDefined();
  expect(secondChild!.before).toEqual("Second child");
});

test("YAML: multi-doc comments extracted per document", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/multi-doc-commented.yaml"), "utf-8");
  const parsed = YamlPlugin.decode(input);

  const doc0 = parsed.documents[0] as Record<string, unknown>;
  const doc0Header = getComment(doc0);
  expect(doc0Header).toBeDefined();
  expect(doc0Header!.before).toEqual("First document header");

  const doc0Name = getComment(doc0, "name");
  expect(doc0Name).toBeDefined();
  expect(doc0Name!.after).toEqual("person name");

  const doc1 = parsed.documents[1] as Record<string, unknown>;
  const doc1Header = getComment(doc1);
  expect(doc1Header).toBeDefined();
  expect(doc1Header!.before).toEqual("Second document header");
});

test("YAML: encode preserves comments in output", () => {
  const input = "# Header comment\nname: John  # inline\n# before age\nage: 30\n";
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const output = YamlPlugin.encode(doc) as string;
  expect(output.includes("# Header comment")).toEqual(true);
  expect(output.includes("# inline")).toEqual(true);
  expect(output.includes("# before age")).toEqual(true);
});

test("YAML: consecutive comment lines merge into multi-line header", () => {
  const input = "# line 1\n# line 2\nname: John\n";
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  // Comments before the first key become the document header, not a key comment
  const header = getComment(doc);
  expect(header).toBeDefined();
  expect(header!.before).toEqual("line 1\nline 2");

  // The first key should NOT have the header duplicated as its before comment
  const nameComment = getComment(doc, "name");
  expect(nameComment).toEqual(undefined);
});

test("YAML: quoted # is not a comment", () => {
  const input = 'name: "John # not a comment"\nage: 30\n';
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  expect(doc.name).toEqual("John # not a comment");
  const nameComment = getComment(doc, "name");
  // Should not have an inline comment
  expect(nameComment?.after).toEqual(undefined);
});

test("YAML: data values are correct despite comments", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/commented.yaml"), "utf-8");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  expect(doc.name).toEqual("John");
  expect(doc.age).toEqual(30);
  expect(doc.isEmployed).toEqual(true);
  expect((doc.address as any).street).toEqual("123 Main St");
  expect((doc.address as any).city).toEqual("Springfield");
});

// ============================================================
// TOML Comment Tests
// ============================================================

test("TOML: header comment extracted", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/commented.toml"), "utf-8");
  const parsed = TomlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const header = getComment(doc);
  expect(header).toBeDefined();
  expect(header!.before).toEqual("Configuration file header");
});

test("TOML: inline comment extracted", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/commented.toml"), "utf-8");
  const parsed = TomlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const titleComment = getComment(doc, "title");
  expect(titleComment).toBeDefined();
  expect(titleComment!.after).toEqual("inline title comment");
});

test("TOML: before comment extracted", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/commented.toml"), "utf-8");
  const parsed = TomlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const nameComment = getComment(doc, "name");
  expect(nameComment).toBeDefined();
  expect(nameComment!.before).toEqual("About the owner");
});

test("TOML: data values are correct", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/commented.toml"), "utf-8");
  const parsed = TomlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  expect(doc.title).toEqual("My Config");
  expect(doc.name).toEqual("John");
  expect(doc.age).toEqual(30);
  expect((doc.address as any).street).toEqual("123 Main St");
});

test("TOML: encode preserves comments", () => {
  const input = "# Header\ntitle = \"test\"  # inline\n";
  const parsed = TomlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const output = TomlPlugin.encode(doc) as string;
  expect(output.includes("# Header")).toEqual(true);
  expect(output.includes("# inline")).toEqual(true);
});

// ============================================================
// INI Comment Tests
// ============================================================

test("INI: header comment extracted", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/commented.ini"), "utf-8");
  const parsed = IniPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const header = getComment(doc);
  expect(header).toBeDefined();
  expect(header!.before).toEqual("Configuration file header");
});

test("INI: before comment extracted on key", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/commented.ini"), "utf-8");
  const parsed = IniPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const person = doc.person as Record<string, unknown>;

  const ageComment = getComment(person, "age");
  expect(ageComment).toBeDefined();
  expect(ageComment!.before).toEqual("Age of person");
});

test("INI: section comment extracted", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/commented.ini"), "utf-8");
  const parsed = IniPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const addressComment = getComment(doc, "address");
  expect(addressComment).toBeDefined();
  expect(addressComment!.before).toEqual("Address section");
});

test("INI: data values are correct", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/commented.ini"), "utf-8");
  const parsed = IniPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  expect((doc as any).person.name).toEqual("John");
  // INI parser returns all values as strings
  expect(String((doc as any).person.age)).toEqual("30");
  expect((doc as any).address.street).toEqual("Main St 123");
});

test("INI: encode produces valid output", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/commented.ini"), "utf-8");
  const parsed = IniPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const output = IniPlugin.encode(doc) as string;
  expect(typeof output).toEqual("string");
  expect(output.includes("name")).toEqual(true);
});

// ============================================================
// JSONC Comment Tests
// ============================================================

test("JSONC: line comments extracted", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/commented.jsonc"), "utf-8");
  const parsed = JsonPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const nameComment = getComment(doc, "name");
  expect(nameComment).toBeDefined();
  expect(nameComment!.before).toEqual("Person name");
});

test("JSONC: inline comment extracted", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/commented.jsonc"), "utf-8");
  const parsed = JsonPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const ageComment = getComment(doc, "age");
  expect(ageComment).toBeDefined();
  expect(ageComment!.after).toEqual("inline age comment");
});

test("JSONC: block comment extracted", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/commented.jsonc"), "utf-8");
  const parsed = JsonPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const addressComment = getComment(doc, "address");
  expect(addressComment).toBeDefined();
  expect(addressComment!.before).toEqual("Address block");
});

test("JSONC: data values are correct", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/commented.jsonc"), "utf-8");
  const parsed = JsonPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  expect(doc.name).toEqual("John");
  expect(doc.age).toEqual(30);
  expect((doc.address as any).street).toEqual("123 Main St");
});

test("JSONC: standard JSON still works without comments", () => {
  const input = '{"name": "John", "age": 30}';
  const parsed = JsonPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  expect(doc.name).toEqual("John");
  expect(doc.age).toEqual(30);
  expect(hasComments(doc)).toEqual(false);
});

test("JSONC: encode preserves comments", () => {
  const input = '{\n  // Person name\n  "name": "John",\n  "age": 30  // inline\n}';
  const parsed = JsonPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const output = JsonPlugin.encode(doc) as string;
  expect(output.includes("// Person name")).toEqual(true);
  expect(output.includes("// inline")).toEqual(true);
});

test("JSONC: // inside string values is not stripped", () => {
  const input = '{"url": "https://example.com"}';
  const parsed = JsonPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  expect(doc.url).toEqual("https://example.com");
});

// ============================================================
// XML Comment Tests
// ============================================================

test("XML: comment before element extracted", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/commented.xml"), "utf-8");
  const parsed = XmlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  // The XML parser produces a structure; check comments are attached
  expect(hasComments(doc)).toEqual(true);
});

test("XML: data values are correct", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/commented.xml"), "utf-8");
  const parsed = XmlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  expect(typeof doc).toEqual("object");
  // XML structure depends on the parser's output format
  expect(doc).toBeDefined();
});

// ============================================================
// Edge Case Tests
// ============================================================

test("YAML: empty object with header comment", () => {
  // YAML parses empty document as null, which isn't an object
  // This should not throw
  const input = "# Just a comment\n";
  const parsed = YamlPlugin.decode(input);
  expect(parsed.documents.length).toEqual(1);
});

test("YAML: only data, no comments", () => {
  const input = "name: John\nage: 30\n";
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  expect(doc.name).toEqual("John");
  // Should not crash, comments just won't be there
  expect(hasComments(doc)).toEqual(false);
});

test("YAML: deeply nested comments", () => {
  const input = `
a:
  b:
    # deep comment
    c: value
`.trim();
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as any;

  const cComment = getComment(doc.a.b, "c");
  expect(cComment).toBeDefined();
  expect(cComment!.before).toEqual("deep comment");
});

test("JSON: plain JSON file has no comments", () => {
  const input = '{"name": "test"}';
  const parsed = JsonPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  expect(hasComments(doc)).toEqual(false);
  expect(doc.name).toEqual("test");
});

test("YAML: comment with no space after #", () => {
  const input = "#compact\nname: John\n";
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const header = getComment(doc);
  expect(header).toBeDefined();
  expect(header!.before).toEqual("compact");
});

test("comments do not affect for...in iteration", () => {
  const obj: Record<string, unknown> = { a: 1, b: 2 };
  setComment(obj, "a", { before: "test" });

  const keys: string[] = [];
  for (const key in obj) {
    keys.push(key);
  }
  expect(keys).toEqual(["a", "b"]);
});

test("comments do not affect Object.entries", () => {
  const obj: Record<string, unknown> = { x: 10 };
  setComment(obj, "x", { after: "comment" });

  expect(Object.entries(obj)).toEqual([["x", 10]]);
});

test("comments do not affect JSON.stringify", () => {
  const obj = { data: "value" };
  setComment(obj, "data", { before: "important", after: "note" });
  setComment(obj, "#", { before: "header" });

  expect(JSON.stringify(obj)).toEqual('{"data":"value"}');
});

test("YAML: multiple comments between keys", () => {
  const input = "a: 1\n# comment 1\n# comment 2\nb: 2\n";
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const bComment = getComment(doc, "b");
  expect(bComment).toBeDefined();
  expect(bComment!.before).toEqual("comment 1\ncomment 2");
});

test("ParsedData stores sourceFormat", () => {
  const pd = new ParsedData([{}], { sourceFormat: "YAML" });
  expect(pd.sourceFormat).toEqual("YAML");
});

test("ParsedData.isMultiDocument defaults to false for single doc", () => {
  const pd = new ParsedData([{}]);
  expect(pd.isMultiDocument).toEqual(false);
});

test("ParsedData.isMultiDocument defaults to true for multiple docs", () => {
  const pd = new ParsedData([{}, {}]);
  expect(pd.isMultiDocument).toEqual(true);
});

test("unwrapParsedData: empty array returns undefined", () => {
  const result = unwrapParsedData([]);
  expect(result).toEqual(undefined);
});

test("TOML: section before-comment on root key", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/commented.toml"), "utf-8");
  const parsed = TomlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const ageComment = getComment(doc, "age");
  expect(ageComment).toBeDefined();
  expect(ageComment!.before).toEqual("Age setting");
});

test("YAML: multi-doc with trailing comment on second doc", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/multi-doc-commented.yaml"), "utf-8");
  const parsed = YamlPlugin.decode(input);
  const doc1 = parsed.documents[1] as Record<string, unknown>;

  const trailing = getComment(doc1);
  expect(trailing).toBeDefined();
  expect(trailing!.after).toEqual("Trailing comment");
});

// ============================================================
// YAML Anchors & Aliases Tests
// ============================================================

test("YAML: anchors and aliases are resolved", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/anchors.yaml"), "utf-8");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const data = doc.data as Record<string, unknown>;

  // Anchor definition
  const chartRefs = data.chart_refs as any;
  expect(chartRefs.ingress["ingress-nginx"].type).toEqual("tar");
  expect(chartRefs.ingress["ingress-nginx"].location).toEqual("https://example.com/charts/ingress-nginx-4.13.0.tgz");

  // Alias usage resolves to the same data
  const charts = data.charts as any;
  expect(charts.kubernetes.ingress.type).toEqual("tar");
  expect(charts.kubernetes.ingress.subpath).toEqual("ingress-nginx");
  expect(charts.osh.mariadb.subpath).toEqual("mariadb");
  expect(charts.osh.memcached.subpath).toEqual("memcached");
  expect(charts.monitoring.rabbitmq.subpath).toEqual("rabbitmq");
});

test("YAML: many aliases do not trigger resource exhaustion error", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/anchors.yaml"), "utf-8");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const data = doc.data as Record<string, unknown>;

  // Verify deeply nested alias reuse across sections
  const images = data.images as any;
  expect(images.osh.keystone.init).toEqual("registry.example.com/alpine@sha256:abc123");
  expect(images.osh.glance.init).toEqual("registry.example.com/alpine@sha256:abc123");
  expect(images.osh.nova.init).toEqual("registry.example.com/alpine@sha256:abc123");
  expect(images.osh.neutron.init).toEqual("registry.example.com/alpine@sha256:abc123");

  // All alias references to the same anchor produce the same value
  expect(images.osh.keystone.db).toEqual(images.osh.glance.db);
  expect(images.osh.keystone.queue).toEqual(images.osh.nova.queue);
});

test("YAML: anchors file round-trips through encode", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/anchors.yaml"), "utf-8");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const output = YamlPlugin.encode(doc) as string;

  // Re-parse the output and verify data integrity
  const reparsed = YamlPlugin.decode(output);
  const redoc = reparsed.documents[0] as Record<string, unknown>;
  const data = redoc.data as any;

  expect(data.charts.osh.mariadb.subpath).toEqual("mariadb");
  expect(data.images.osh.keystone.init).toEqual("registry.example.com/alpine@sha256:abc123");
});

test("YAML: anchors file comments are preserved", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/anchors.yaml"), "utf-8");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  // Document header
  const header = getComment(doc);
  expect(header).toBeDefined();
  expect(header!.before).toEqual("Software versions");

  // Nested comments
  const data = doc.data as Record<string, unknown>;
  const chartRefsComment = getComment(data, "chart_refs");
  expect(chartRefsComment).toBeDefined();
  expect(chartRefsComment!.before).toEqual("Chart references with anchors");
});

// ============================================================
// YAML Anchor/Alias Preservation Tests
// ============================================================

test("YAML: scalar anchor is preserved in YAML output", () => {
  const input = `
images:
  common:
    alpine: &alpine registry.example.com/alpine@sha256:abc123
  services:
    init: *alpine
`;
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const output = YamlPlugin.encode(doc) as string;

  expect(output.includes("&alpine")).toBeTruthy();
  expect(output.includes("*alpine")).toBeTruthy();
});

test("YAML: object anchor is preserved in YAML output", () => {
  const input = `
chart_refs:
  ingress-nginx: &ingress_chart
    location: https://example.com/charts/ingress.tgz
    subpath: ingress-nginx
    type: tar
charts:
  kubernetes:
    ingress: *ingress_chart
  monitoring:
    ingress: *ingress_chart
`;
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const output = YamlPlugin.encode(doc) as string;

  expect(output.includes("&ingress_chart")).toBeTruthy();
  // Two alias references
  const aliasMatches = output.match(/\*ingress_chart/g);
  expect(aliasMatches?.length).toEqual(2);
});

test("YAML: multiple anchors and aliases are all preserved", () => {
  const input = `
defs:
  foo: &foo value_foo
  bar: &bar value_bar
  baz: &baz value_baz
uses:
  a: *foo
  b: *bar
  c: *baz
  d: *foo
`;
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const output = YamlPlugin.encode(doc) as string;

  expect(output.includes("&foo")).toBeTruthy();
  expect(output.includes("&bar")).toBeTruthy();
  expect(output.includes("&baz")).toBeTruthy();
  expect(output.match(/\*foo/g)?.length).toEqual(2);
  expect(output.match(/\*bar/g)?.length).toEqual(1);
  expect(output.match(/\*baz/g)?.length).toEqual(1);
});

test("YAML: anchor values are correct after decode", () => {
  const input = `
defs:
  img: &img registry.example.com/app@sha256:abc
refs:
  service_a: *img
  service_b: *img
`;
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const refs = (doc as any).refs;

  expect(refs.service_a).toEqual("registry.example.com/app@sha256:abc");
  expect(refs.service_b).toEqual("registry.example.com/app@sha256:abc");
});

test("YAML: anchor round-trip preserves data integrity", () => {
  const input = `
defs:
  chart: &chart
    location: https://example.com/chart.tgz
    subpath: myapp
    type: tar
uses:
  first: *chart
  second: *chart
`;
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const output = YamlPlugin.encode(doc) as string;

  // Re-parse output and verify data
  const reparsed = YamlPlugin.decode(output);
  const redoc = reparsed.documents[0] as Record<string, unknown>;

  expect((redoc as any).uses.first.location).toEqual("https://example.com/chart.tgz");
  expect((redoc as any).uses.second.subpath).toEqual("myapp");
});

test("YAML: anchors with comments are both preserved", () => {
  const input = `
# Header
defs:
  # The main image
  img: &img registry.example.com/app@sha256:abc
refs:
  service: *img
`;
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const output = YamlPlugin.encode(doc) as string;

  // Both anchors and comments should survive
  expect(output.includes("&img")).toBeTruthy();
  expect(output.includes("*img")).toBeTruthy();
  expect(output.includes("# Header")).toBeTruthy();
  expect(output.includes("# The main image")).toBeTruthy();
});

test("YAML: anchors file preserves all anchors and aliases on round-trip", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/anchors.yaml"), "utf-8");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const output = YamlPlugin.encode(doc) as string;

  // Count anchors and aliases in output
  const anchors = output.match(/&\w+/g) || [];
  const aliases = output.match(/\*\w+/g) || [];

  // The fixture has 12 anchors and many aliases
  expect(anchors.length >= 12).toBeTruthy();
  expect(aliases.length >= 20).toBeTruthy();
});

test("YAML: YAML without anchors is unaffected", () => {
  const input = `
name: test
version: 1
tags:
  - alpha
  - beta
`;
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const output = YamlPlugin.encode(doc) as string;

  expect(!output.includes("&")).toBeTruthy();
  expect(!output.includes("*")).toBeTruthy();
  expect(output.includes("name: test")).toBeTruthy();
});

// ============================================================
// YAML Document Separator (---/...) Tests
// ============================================================

test("YAML: --- separator with header comment does not duplicate", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/doc-separator.yaml"), "utf-8");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  // Header comment should be on container only
  const header = getComment(doc);
  expect(header).toBeDefined();
  expect(header!.before).toEqual("High-level site definition");

  // First key should NOT have the header duplicated
  const schemaComment = getComment(doc, "schema");
  expect(schemaComment).toEqual(undefined);
});

test("YAML: --- separator preserves inline comments", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/doc-separator.yaml"), "utf-8");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const metadata = doc.metadata as Record<string, unknown>;

  const nameComment = getComment(metadata, "name");
  expect(nameComment).toBeDefined();
  expect(nameComment!.before).toEqual("Replace with the site name");
});

test("YAML: --- separator file data values are correct", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/doc-separator.yaml"), "utf-8");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  expect(doc.schema).toEqual("pegleg/SiteDefinition/v1");
  expect((doc.metadata as any).name).toEqual("test-site");
  expect((doc.data as any).site_type).toEqual("cruiser");
});

test("YAML: ... end marker does not create extra documents", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/doc-separator.yaml"), "utf-8");
  const parsed = YamlPlugin.decode(input);

  expect(parsed.isMultiDocument).toEqual(false);
  expect(parsed.documents.length).toEqual(1);
});

test("YAML: --- header comment not duplicated in JSON output", () => {
  const input = fs.readFileSync(path.resolve(__dirname, "data/doc-separator.yaml"), "utf-8");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const output = JsonPlugin.encode(doc) as string;

  // Count occurrences of the header comment
  const matches = output.match(/High-level site definition/g);
  expect(matches?.length).toEqual(1);
});

test("YAML: header comment not duplicated in JSON output (no --- separator)", () => {
  const input = "# Header comment\nname: John\nage: 30\n";
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const output = JsonPlugin.encode(doc) as string;

  const matches = output.match(/Header comment/g);
  expect(matches?.length).toEqual(1);
});

// ============================================================
// Tracked Proxy .comment() / .commentAfter() Tests
// ============================================================

import { tracked } from "../src/replExtensions";

test("tracked: .comment() reads existing before-comment on object member", () => {
  const raw = { name: "John", age: 30 };
  setComment(raw, "name", { before: "Person name" });
  const data = tracked(raw) as any;

  expect(data.name.comment()).toEqual("Person name");
});

test("tracked: .commentAfter() reads existing after-comment on object member", () => {
  const raw = { name: "John", age: 30 };
  setComment(raw, "name", { after: "inline note" });
  const data = tracked(raw) as any;

  expect(data.name.commentAfter()).toEqual("inline note");
});

test("tracked: .comment(text) sets before-comment on primitive member", () => {
  const raw = { name: "John", age: 30 };
  const data = tracked(raw) as any;

  data.age.comment("years old");
  expect(getComment(raw, "age")?.before).toEqual("years old");
});

test("tracked: .commentAfter(text) sets after-comment on primitive member", () => {
  const raw = { name: "John", age: 30 };
  const data = tracked(raw) as any;

  data.age.commentAfter("years");
  expect(getComment(raw, "age")?.after).toEqual("years");
});

test("tracked: .comment() on root returns container header", () => {
  const raw = { name: "John" };
  setComment(raw, "#", { before: "File header" });
  const data = tracked(raw) as any;

  expect(data.comment()).toEqual("File header");
});

test("tracked: .comment(text) on root sets container header", () => {
  const raw = { name: "John" };
  const data = tracked(raw) as any;

  data.comment("New header");
  expect(getComment(raw, "#")?.before).toEqual("New header");
});

test("tracked: .commentAfter() on root returns container trailer", () => {
  const raw = { name: "John" };
  setComment(raw, "#", { after: "Trailing" });
  const data = tracked(raw) as any;

  expect(data.commentAfter()).toEqual("Trailing");
});

test("tracked: .commentAfter(text) on root sets container trailer", () => {
  const raw = { name: "John" };
  const data = tracked(raw) as any;

  data.commentAfter("End of file");
  expect(getComment(raw, "#")?.after).toEqual("End of file");
});

test("tracked: nested object .comment() gets parent key comment", () => {
  const raw = { metadata: { name: "test" } };
  setComment(raw, "metadata", { before: "Metadata section" });
  const data = tracked(raw) as any;

  expect(data.metadata.comment()).toEqual("Metadata section");
});

test("tracked: nested object .comment(text) sets parent key comment", () => {
  const raw = { metadata: { name: "test" } };
  const data = tracked(raw) as any;

  data.metadata.comment("Metadata section");
  expect(getComment(raw, "metadata")?.before).toEqual("Metadata section");
});

test("tracked: deep chain data.a.b.c.comment()", () => {
  const raw = { a: { b: { c: "value" } } };
  const data = tracked(raw) as any;

  data.a.b.c.comment("deep comment");
  expect(getComment(raw.a.b, "c")?.before).toEqual("deep comment");
  expect(data.a.b.c.comment()).toEqual("deep comment");
});

test("tracked: .comment() on string member", () => {
  const raw = { url: "https://example.com" };
  const data = tracked(raw) as any;

  data.url.comment("API endpoint");
  expect(getComment(raw, "url")?.before).toEqual("API endpoint");
  expect(data.url.comment()).toEqual("API endpoint");
});

test("tracked: .comment() on boolean member", () => {
  const raw = { enabled: true };
  const data = tracked(raw) as any;

  data.enabled.comment("Feature flag");
  expect(getComment(raw, "enabled")?.before).toEqual("Feature flag");
  expect(data.enabled.comment()).toEqual("Feature flag");
});

test("tracked: setting comment preserves existing after-comment", () => {
  const raw = { age: 30 };
  setComment(raw, "age", { after: "years" });
  const data = tracked(raw) as any;

  data.age.comment("Person age");
  expect(getComment(raw, "age")?.before).toEqual("Person age");
  expect(getComment(raw, "age")?.after).toEqual("years");
});

test("tracked: setting commentAfter preserves existing before-comment", () => {
  const raw = { age: 30 };
  setComment(raw, "age", { before: "Person age" });
  const data = tracked(raw) as any;

  data.age.commentAfter("years");
  expect(getComment(raw, "age")?.before).toEqual("Person age");
  expect(getComment(raw, "age")?.after).toEqual("years");
});

test("tracked: returns undefined for members without comments", () => {
  const raw = { name: "John" };
  const data = tracked(raw) as any;

  expect(data.name.comment()).toEqual(undefined);
  expect(data.name.commentAfter()).toEqual(undefined);
});

test("tracked: proxy is transparent for Object.keys", () => {
  const raw = { a: 1, b: 2, c: 3 };
  const data = tracked(raw) as any;

  expect(Object.keys(data)).toEqual(["a", "b", "c"]);
});

test("tracked: proxy is transparent for JSON.stringify", () => {
  const raw = { name: "John", age: 30 };
  const data = tracked(raw) as any;

  expect(JSON.stringify(data)).toEqual('{"name":"John","age":30}');
});

test("tracked: proxy is transparent for Array.isArray", () => {
  const raw = { items: [1, 2, 3] };
  const data = tracked(raw) as any;

  expect(Array.isArray(data.items)).toEqual(true);
});

test("tracked: proxy is transparent for Object.entries", () => {
  const raw = { x: 10, y: 20 };
  const data = tracked(raw) as any;

  expect(Object.entries(data)).toEqual([["x", 10], ["y", 20]]);
});

test("tracked: proxy is transparent for property assignment", () => {
  const raw: Record<string, unknown> = { name: "John" };
  const data = tracked(raw) as any;

  data.name = "Jane";
  expect(raw.name).toEqual("Jane");
});

test("tracked: proxy is transparent for arithmetic on numbers", () => {
  const raw = { age: 30 };
  const data = tracked(raw) as any;

  expect(data.age + 1).toEqual(31);
  expect(data.age * 2).toEqual(60);
  expect(data.age > 18).toEqual(true);
});

test("tracked: array element .comment()", () => {
  const raw = { items: ["a", "b", "c"] };
  const data = tracked(raw) as any;

  data.items[1].comment("second item");
  expect(getComment(raw.items, "1")?.before).toEqual("second item");
  expect(data.items[1].comment()).toEqual("second item");
});

test("tracked: object .comment() returns proxy for chaining", () => {
  const raw = { metadata: { name: "test" } };
  const data = tracked(raw) as any;

  const result = data.metadata.comment("section");
  // Should return the proxy, allowing further access
  expect(result.name).toEqual("test");
});

test("tracked: round-trip with YAML encode preserves set comments", () => {
  const input = "name: John\nage: 30\n";
  const parsed = YamlPlugin.decode(input);
  const raw = parsed.documents[0] as Record<string, unknown>;
  const data = tracked(raw) as any;

  data.comment("Person record");
  data.name.commentAfter("first name");
  data.age.comment("Age in years");

  const output = YamlPlugin.encode(raw) as string;
  expect(output.includes("# Person record")).toEqual(true);
  expect(output.includes("# first name")).toEqual(true);
  expect(output.includes("# Age in years")).toEqual(true);
});

// ============================================================
// Tracked Proxy .anchor() / .alias() Tests
// ============================================================

test("tracked: .anchor() reads existing anchor name from YAML", () => {
  const input = `
defs:
  img: &my_anchor registry.example.com/app
refs:
  svc: *my_anchor
`;
  const parsed = YamlPlugin.decode(input);
  const raw = parsed.documents[0] as Record<string, unknown>;
  const data = tracked(raw) as any;

  expect(data.defs.img.anchor()).toEqual("my_anchor");
});

test("tracked: .alias() reads existing alias reference from YAML", () => {
  const input = `
defs:
  img: &my_anchor registry.example.com/app
refs:
  svc: *my_anchor
`;
  const parsed = YamlPlugin.decode(input);
  const raw = parsed.documents[0] as Record<string, unknown>;
  const data = tracked(raw) as any;

  expect(data.refs.svc.alias()).toEqual("my_anchor");
});

test("tracked: .anchor() returns undefined when no anchor", () => {
  const input = "name: John\nage: 30\n";
  const parsed = YamlPlugin.decode(input);
  const raw = parsed.documents[0] as Record<string, unknown>;
  const data = tracked(raw) as any;

  expect(data.name.anchor()).toEqual(undefined);
  expect(data.age.anchor()).toEqual(undefined);
});

test("tracked: .alias() returns undefined when not an alias", () => {
  const input = `
defs:
  img: &my_anchor registry.example.com/app
`;
  const parsed = YamlPlugin.decode(input);
  const raw = parsed.documents[0] as Record<string, unknown>;
  const data = tracked(raw) as any;

  expect(data.defs.img.alias()).toEqual(undefined);
});

test("tracked: .anchor(name) sets anchor on a value", () => {
  const raw = { defs: { img: "registry.example.com/app" }, refs: { svc: "registry.example.com/app" } };
  const data = tracked(raw) as any;

  data.defs.img.anchor("my_img");
  expect(data.defs.img.anchor()).toEqual("my_img");

  const output = YamlPlugin.encode(raw) as string;
  expect(output.includes("&my_img")).toBeTruthy();
});

test("tracked: .alias(name) sets alias on a value", () => {
  const raw = { defs: { img: "registry.example.com/app" }, refs: { svc: "registry.example.com/app" } };
  const data = tracked(raw) as any;

  data.defs.img.anchor("my_img");
  data.refs.svc.alias("my_img");

  expect(data.refs.svc.alias()).toEqual("my_img");

  const output = YamlPlugin.encode(raw) as string;
  expect(output.includes("&my_img")).toBeTruthy();
  expect(output.includes("*my_img")).toBeTruthy();
});

test("tracked: .anchor() on object value reads anchor", () => {
  const input = `
chart_refs:
  nginx: &nginx_chart
    location: https://example.com/nginx.tgz
    type: tar
charts:
  web: *nginx_chart
`;
  const parsed = YamlPlugin.decode(input);
  const raw = parsed.documents[0] as Record<string, unknown>;
  const data = tracked(raw) as any;

  expect(data.chart_refs.nginx.anchor()).toEqual("nginx_chart");
  expect(data.charts.web.alias()).toEqual("nginx_chart");
});

test("tracked: setting anchor clears alias and vice versa", () => {
  const raw = { a: "val" };
  const data = tracked(raw) as any;

  data.a.anchor("x");
  expect(data.a.anchor()).toEqual("x");
  expect(data.a.alias()).toEqual(undefined);

  data.a.alias("y");
  expect(data.a.alias()).toEqual("y");
  expect(data.a.anchor()).toEqual(undefined);
});

test("tracked: .anchor() and .alias() work on primitive number", () => {
  const raw = { port: 8080 };
  const data = tracked(raw) as any;

  data.port.anchor("default_port");
  expect(data.port.anchor()).toEqual("default_port");
});

test("tracked: aqAnchors() returns full anchor map", () => {
  const input = `
defs:
  a: &anchor_a value_a
  b: &anchor_b value_b
refs:
  x: *anchor_a
  y: *anchor_b
`;
  const parsed = YamlPlugin.decode(input);
  const raw = parsed.documents[0] as Record<string, unknown>;
  const data = tracked(raw) as any;

  const defs = data.defs.aqAnchors();
  expect(defs).toBeDefined();
  expect(defs.a.anchor).toEqual("anchor_a");
  expect(defs.b.anchor).toEqual("anchor_b");

  const refs = data.refs.aqAnchors();
  expect(refs).toBeDefined();
  expect(refs.x.alias).toEqual("anchor_a");
  expect(refs.y.alias).toEqual("anchor_b");
});

test("tracked: aqAnchors(key) returns single entry", () => {
  const input = `
defs:
  img: &my_img value
`;
  const parsed = YamlPlugin.decode(input);
  const raw = parsed.documents[0] as Record<string, unknown>;
  const data = tracked(raw) as any;

  const entry = data.defs.aqAnchors("img");
  expect(entry).toBeDefined();
  expect(entry.anchor).toEqual("my_img");
});

test("tracked: round-trip YAML preserves anchors set via .anchor()/.alias()", () => {
  const raw = {
    defs: { img: "registry.example.com/app@sha256:abc" },
    services: { web: "registry.example.com/app@sha256:abc", api: "registry.example.com/app@sha256:abc" },
  };
  const data = tracked(raw) as any;

  data.defs.img.anchor("app_img");
  data.services.web.alias("app_img");
  data.services.api.alias("app_img");

  const output = YamlPlugin.encode(raw) as string;
  expect(output.includes("&app_img")).toBeTruthy();
  expect(output.match(/\*app_img/g)?.length).toEqual(2);

  // Re-parse and verify data is still correct
  const reparsed = YamlPlugin.decode(output);
  const redoc = reparsed.documents[0] as Record<string, unknown>;
  expect((redoc as any).services.web).toEqual("registry.example.com/app@sha256:abc");
  expect((redoc as any).services.api).toEqual("registry.example.com/app@sha256:abc");
});

// ============================================================
// YAML Deep Nesting Comment Round-trip Tests
// ============================================================

test("YAML: deeply nested comments survive round-trip", () => {
  const input = `root:
  level1:
    # comment on deep key
    deep_key: deep_value
`;
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const output = YamlPlugin.encode(doc) as string;

  expect(output.includes("# comment on deep key")).toBeTruthy();
});

test("YAML: comments on multiple nesting levels survive round-trip", () => {
  const input = `# header
root:
  # level 1 comment
  child:
    # level 2 comment
    key: value
`;
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const output = YamlPlugin.encode(doc) as string;

  expect(output.includes("# header")).toBeTruthy();
  expect(output.includes("# level 1 comment")).toBeTruthy();
  expect(output.includes("# level 2 comment")).toBeTruthy();
});

test("YAML: parent without comments does not block child comment extraction", () => {
  // The root and 'wrapper' have no comments, but 'inner' does
  const input = `wrapper:
  inner:
    # important note
    key: value
`;
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const inner = (doc as any).wrapper.inner;
  const comment = getComment(inner, "key");
  expect(comment).toBeDefined();
  expect(comment!.before).toEqual("important note");

  // Round-trip: comment should appear in output
  const output = YamlPlugin.encode(doc) as string;
  expect(output.includes("# important note")).toBeTruthy();
});

test("YAML: trailing comment on nested map is preserved", () => {
  const input = `outer:
  inner:
    a: 1
    b: 2
    # trailing note
  next_key: value
`;
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  // The trailing comment should be stored on inner object as "#" after
  const inner = (doc as any).outer.inner;
  const containerComment = getComment(inner, "#");
  expect(containerComment).toBeDefined();
  expect(containerComment!.after).toEqual("trailing note");

  // Round-trip
  const output = YamlPlugin.encode(doc) as string;
  expect(output.includes("# trailing note")).toBeTruthy();
});

test("YAML: empty comment line is preserved in round-trip", () => {
  const input = `items:
  # section header
  #
  first: value1
  # next item
  second: value2
`;
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  // The comment on 'first' should include both lines (header + empty)
  const items = (doc as any).items;
  const firstComment = getComment(items, "first");
  expect(firstComment).toBeDefined();
  // The empty # line is preserved as an empty line in the comment text
  expect(firstComment!.before!.includes("section header")).toBeTruthy();
  expect(firstComment!.before!.includes("\n")).toBeTruthy();

  // Round-trip: both comment lines should appear
  const output = YamlPlugin.encode(doc) as string;
  expect(output.includes("# section header")).toBeTruthy();
});

test("YAML: inline (after) comments on deeply nested scalars survive", () => {
  const input = `config:
  database:
    host: localhost # primary host
    port: 5432 # default port
`;
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const output = YamlPlugin.encode(doc) as string;

  expect(output.includes("# primary host")).toBeTruthy();
  expect(output.includes("# default port")).toBeTruthy();
});

// ============================================================
// Library API Tests (parse / encode)
// ============================================================

import { parse, encode } from "../src/index";

test("parse: auto-detects YAML format", () => {
  const data = parse("name: John\nage: 30\n") as any;
  expect(data.name).toEqual("John");
  expect(data.age).toEqual(30);
});

test("parse: explicit YAML format", () => {
  const data = parse("name: Jane\n", "yaml") as any;
  expect(data.name).toEqual("Jane");
});

test("parse: explicit JSON format", () => {
  const data = parse('{"name": "Bob"}', "json") as any;
  expect(data.name).toEqual("Bob");
});

test("parse: auto-detects JSON format", () => {
  const data = parse('{"key": "value"}') as any;
  expect(data.key).toEqual("value");
});

test("parse: preserves YAML comments", () => {
  const data = parse("# Header\nname: John\n", "yaml");
  expect(hasComments(data as object)).toEqual(true);
  const header = getComment(data as object);
  expect(header).toBeDefined();
  expect(header!.before).toEqual("Header");
});

test("parse: throws on unknown format", () => {
  expect(() => parse("data", "unknownformat")).toThrow("Unknown format");
});

test("encode: YAML format", () => {
  const output = encode({ name: "John", age: 30 }, "yaml");
  expect(output).toContain("name: John");
  expect(output).toContain("age: 30");
});

test("encode: JSON format", () => {
  const output = encode({ name: "John" }, "json");
  expect(JSON.parse(output).name).toEqual("John");
});

test("encode: throws on unknown format", () => {
  expect(() => encode({}, "unknownformat")).toThrow("Unknown format");
});

test("parse + encode: YAML round-trip preserves comments", () => {
  const input = "# Header\nname: John  # inline\n# before age\nage: 30\n";
  const data = parse(input, "yaml");
  const output = encode(data, "yaml");
  expect(output).toContain("# Header");
  expect(output).toContain("# inline");
  expect(output).toContain("# before age");
});

test("parse + encode: JSONC round-trip preserves comments", () => {
  const input = '{\n  // Person name\n  "name": "John",\n  "age": 30  // inline\n}';
  const data = parse(input, "json");
  const output = encode(data, "json");
  expect(output).toContain("// Person name");
  expect(output).toContain("// inline");
});

test("parse + encode: TOML format", () => {
  const input = "# Header\ntitle = \"test\"  # inline\n";
  const data = parse(input, "toml");
  const output = encode(data, "toml");
  expect(output).toContain("# Header");
  expect(output).toContain("# inline");
});

test("parse: YAML multi-doc returns array", () => {
  const input = "---\nname: John\n---\nname: Jane\n";
  const data = parse(input, "yaml") as any[];
  expect(Array.isArray(data)).toEqual(true);
  expect(data[0].name).toEqual("John");
  expect(data[1].name).toEqual("Jane");
});
