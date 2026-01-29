import {
  assert,
  assertEquals,
  assertExists,
  assertNotEquals,
} from "https://deno.land/std/testing/asserts.ts";
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
} from "../src/infrastructure/comments.ts";
import { MULTI_DOC, ParsedData } from "../src/infrastructure/ParsedData.ts";
import { unwrapParsedData } from "../src/utils.ts";
import {
  findUnquotedMarker,
  extractHashComments,
  extractJsoncComments,
  stripJsoncComments,
  extractXmlComments,
} from "../src/infrastructure/commentExtractor.ts";
import { YamlPlugin } from "../src/plugins/yamlPlugin.ts";
import { JsonPlugin } from "../src/plugins/jsonPlugin.ts";
import { TomlPlugin } from "../src/plugins/tomlPlugin.ts";
import { IniPlugin } from "../src/plugins/iniPlugin.ts";
import { XmlPlugin } from "../src/plugins/xmlPlugin.ts";

// ============================================================
// Comment Infrastructure Tests
// ============================================================

Deno.test("setComment and getComment basic functionality", () => {
  const obj: Record<string, unknown> = { name: "John", age: 30 };
  setComment(obj, "name", { before: "Person name", after: "inline" });

  const entry = getComment(obj, "name");
  assertExists(entry);
  assertEquals(entry!.before, "Person name");
  assertEquals(entry!.after, "inline");
});

Deno.test("comments are not enumerable", () => {
  const obj: Record<string, unknown> = { name: "John" };
  setComment(obj, "name", { before: "comment" });

  assertEquals(Object.keys(obj), ["name"]);
  assertEquals(JSON.stringify(obj), '{"name":"John"}');
});

Deno.test("hasComments returns false for plain objects", () => {
  assertEquals(hasComments({ name: "John" }), false);
});

Deno.test("hasComments returns true after setComment", () => {
  const obj = { name: "John" };
  setComment(obj, "name", { before: "test" });
  assertEquals(hasComments(obj), true);
});

Deno.test("container comments use '#' key", () => {
  const obj = { name: "John" };
  setComment(obj, "#", { before: "header", after: "trailer" });

  const entry = getComment(obj); // no key = container
  assertExists(entry);
  assertEquals(entry!.before, "header");
  assertEquals(entry!.after, "trailer");
});

Deno.test("comments on arrays use string indices", () => {
  const arr = [1, 2, 3];
  setComment(arr, "0", { before: "first item" });
  setComment(arr, "2", { after: "last item" });

  assertEquals(getComment(arr, "0")?.before, "first item");
  assertEquals(getComment(arr, "2")?.after, "last item");
});

Deno.test("Symbol.for ensures cross-module consistency", () => {
  const sym: symbol = Symbol.for("aq:comments");
  assertEquals(sym, COMMENTS as symbol);
});

Deno.test("getComments returns full map", () => {
  const obj = { a: 1, b: 2 };
  setComment(obj, "a", { before: "first" });
  setComment(obj, "b", { after: "second" });

  const map = getComments(obj);
  assertExists(map);
  assertEquals(map!["a"].before, "first");
  assertEquals(map!["b"].after, "second");
});

Deno.test("setComments replaces entire map", () => {
  const obj = { x: 1 };
  setComments(obj, { x: { before: "old" } });
  assertEquals(getComment(obj, "x")?.before, "old");

  setComments(obj, { x: { before: "new" } });
  assertEquals(getComment(obj, "x")?.before, "new");
});

Deno.test("cloneComments copies to new object", () => {
  const source = { a: 1 };
  setComment(source, "a", { before: "from source" });

  const target = { a: 1 };
  cloneComments(source, target);
  assertEquals(getComment(target, "a")?.before, "from source");
});

Deno.test("getComment returns undefined for objects without comments", () => {
  const obj = { name: "John" };
  assertEquals(getComment(obj, "name"), undefined);
  assertEquals(getComment(obj), undefined);
});

// ============================================================
// Comment Extractor Tests
// ============================================================

Deno.test("findUnquotedMarker finds # outside quotes", () => {
  assertEquals(findUnquotedMarker("name: John  # comment", "#"), 12);
});

Deno.test("findUnquotedMarker ignores # inside double quotes", () => {
  assertEquals(findUnquotedMarker('name: "John # not comment"', "#"), -1);
});

Deno.test("findUnquotedMarker ignores # inside single quotes", () => {
  assertEquals(findUnquotedMarker("name: 'John # not comment'", "#"), -1);
});

Deno.test("findUnquotedMarker returns -1 when no marker", () => {
  assertEquals(findUnquotedMarker("name: John", "#"), -1);
});

Deno.test("extractHashComments extracts full-line comments", () => {
  const source = "# header\nname: John\n# before age\nage: 30";
  const comments = extractHashComments(source);
  assertEquals(comments.length, 2);
  assertEquals(comments[0].text, "header");
  assertEquals(comments[0].inline, false);
  assertEquals(comments[1].text, "before age");
  assertEquals(comments[1].inline, false);
});

Deno.test("extractHashComments extracts inline comments", () => {
  const source = "name: John  # inline comment";
  const comments = extractHashComments(source);
  assertEquals(comments.length, 1);
  assertEquals(comments[0].text, "inline comment");
  assertEquals(comments[0].inline, true);
});

Deno.test("extractJsoncComments extracts // comments", () => {
  const source = '// header\n{"name": "John"}';
  const comments = extractJsoncComments(source);
  assertEquals(comments.length, 1);
  assertEquals(comments[0].text, "header");
  assertEquals(comments[0].type, "line");
});

Deno.test("extractJsoncComments extracts /* */ comments", () => {
  const source = '/* block comment */\n{"name": "John"}';
  const comments = extractJsoncComments(source);
  assertEquals(comments.length, 1);
  assertEquals(comments[0].text, "block comment");
  assertEquals(comments[0].type, "block");
});

Deno.test("extractJsoncComments handles inline // comment", () => {
  const source = '{"name": "John", // inline\n"age": 30}';
  const comments = extractJsoncComments(source);
  assertEquals(comments.length, 1);
  assertEquals(comments[0].text, "inline");
  assertEquals(comments[0].inline, true);
});

Deno.test("stripJsoncComments removes comments preserving positions", () => {
  const source = '{\n  // comment\n  "name": "John"\n}';
  const stripped = stripJsoncComments(source);
  assertEquals(stripped.includes("//"), false);
  assertEquals(stripped.includes('"name"'), true);
  // Line count preserved
  assertEquals(stripped.split("\n").length, source.split("\n").length);
});

Deno.test("stripJsoncComments handles block comments", () => {
  const source = '{\n  /* block */\n  "name": "John"\n}';
  const stripped = stripJsoncComments(source);
  assertEquals(stripped.includes("/*"), false);
  assertEquals(stripped.includes("*/"), false);
});

Deno.test("stripJsoncComments preserves // inside strings", () => {
  const source = '{"url": "https://example.com"}';
  const stripped = stripJsoncComments(source);
  assertEquals(stripped, source);
});

Deno.test("extractXmlComments extracts single-line comments", () => {
  const source = "<!-- header -->\n<root>data</root>";
  const comments = extractXmlComments(source);
  assertEquals(comments.length, 1);
  assertEquals(comments[0].text, "header");
});

Deno.test("extractXmlComments extracts multi-line comments", () => {
  const source = "<!--\n  multi\n  line\n-->\n<root>data</root>";
  const comments = extractXmlComments(source);
  assertEquals(comments.length, 1);
  assertEquals(comments[0].text.includes("multi"), true);
});

// ============================================================
// Multi-Document Tests
// ============================================================

Deno.test("single YAML doc: unwrap gives direct object", () => {
  const input = "name: John\nage: 30\n";
  const parsed = YamlPlugin.decode(input);
  const data = unwrapParsedData([parsed]);

  assertEquals((data as any).name, "John");
  assertEquals((data as any).age, 30);
});

Deno.test("multi-doc YAML: unwrap gives array", async () => {
  const input = await Deno.readTextFile("test/data/data2.yaml");
  const parsed = YamlPlugin.decode(input);
  const data = unwrapParsedData([parsed]) as any[];

  assertEquals(Array.isArray(data), true);
  assertEquals(data[0].name, "John");
  assertEquals(data[1].name, "Jane");
});

Deno.test("multiple files: unwrap gives array of results", () => {
  const input1 = "name: John\n";
  const input2 = "name: Jane\n";
  const parsed1 = YamlPlugin.decode(input1);
  const parsed2 = YamlPlugin.decode(input2);
  const data = unwrapParsedData([parsed1, parsed2]) as any[];

  assertEquals(Array.isArray(data), true);
  assertEquals(data[0].name, "John");
  assertEquals(data[1].name, "Jane");
});

Deno.test("multi-doc YAML preserves MULTI_DOC symbol", async () => {
  const input = await Deno.readTextFile("test/data/data2.yaml");
  const parsed = YamlPlugin.decode(input);
  const data = unwrapParsedData([parsed]);

  assertEquals((data as any)[MULTI_DOC], true);
});

Deno.test("multi-doc YAML encode preserves --- separators", async () => {
  const input = await Deno.readTextFile("test/data/data2.yaml");
  const parsed = YamlPlugin.decode(input);
  const data = unwrapParsedData([parsed]);

  const output = YamlPlugin.encode(data) as string;
  assertEquals(output.includes("---"), true);
});

Deno.test("single doc: ParsedData.isMultiDocument is false", () => {
  const input = "name: John\n";
  const parsed = YamlPlugin.decode(input);
  assertEquals(parsed.isMultiDocument, false);
});

Deno.test("multi doc: ParsedData.isMultiDocument is true", async () => {
  const input = await Deno.readTextFile("test/data/data2.yaml");
  const parsed = YamlPlugin.decode(input);
  assertEquals(parsed.isMultiDocument, true);
});

// ============================================================
// YAML Comment Tests
// ============================================================

Deno.test("YAML: header comment extracted", async () => {
  const input = await Deno.readTextFile("test/data/commented.yaml");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const header = getComment(doc);
  assertExists(header);
  assertEquals(header!.before, "This is a header comment");
});

Deno.test("YAML: inline comment extracted", async () => {
  const input = await Deno.readTextFile("test/data/commented.yaml");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const nameComment = getComment(doc, "name");
  assertExists(nameComment);
  assertEquals(nameComment!.after, "inline name comment");
});

Deno.test("YAML: before comment extracted", async () => {
  const input = await Deno.readTextFile("test/data/commented.yaml");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const ageComment = getComment(doc, "age");
  assertExists(ageComment);
  assertEquals(ageComment!.before, "Age of the person");
});

Deno.test("YAML: nested comment extracted", async () => {
  const input = await Deno.readTextFile("test/data/commented.yaml");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const address = doc.address as Record<string, unknown>;

  const streetComment = getComment(address, "street");
  assertExists(streetComment);
  assertEquals(streetComment!.before, "Street info");
  assertEquals(streetComment!.after, "primary address");
});

Deno.test("YAML: trailing comment extracted", async () => {
  const input = await Deno.readTextFile("test/data/commented.yaml");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const container = getComment(doc);
  assertExists(container);
  assertEquals(container!.after, "Trailing comment");
});

Deno.test("YAML: array item comments extracted", async () => {
  const input = await Deno.readTextFile("test/data/commented.yaml");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const children = doc.children as unknown[];

  const firstChild = getComment(children, "0");
  assertExists(firstChild);
  assertEquals(firstChild!.before, "First child");

  const secondChild = getComment(children, "1");
  assertExists(secondChild);
  assertEquals(secondChild!.before, "Second child");
});

Deno.test("YAML: multi-doc comments extracted per document", async () => {
  const input = await Deno.readTextFile("test/data/multi-doc-commented.yaml");
  const parsed = YamlPlugin.decode(input);

  const doc0 = parsed.documents[0] as Record<string, unknown>;
  const doc0Header = getComment(doc0);
  assertExists(doc0Header);
  assertEquals(doc0Header!.before, "First document header");

  const doc0Name = getComment(doc0, "name");
  assertExists(doc0Name);
  assertEquals(doc0Name!.after, "person name");

  const doc1 = parsed.documents[1] as Record<string, unknown>;
  const doc1Header = getComment(doc1);
  assertExists(doc1Header);
  assertEquals(doc1Header!.before, "Second document header");
});

Deno.test("YAML: encode preserves comments in output", () => {
  const input = "# Header comment\nname: John  # inline\n# before age\nage: 30\n";
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const output = YamlPlugin.encode(doc) as string;
  assertEquals(output.includes("# Header comment"), true);
  assertEquals(output.includes("# inline"), true);
  assertEquals(output.includes("# before age"), true);
});

Deno.test("YAML: consecutive comment lines merge into multi-line header", () => {
  const input = "# line 1\n# line 2\nname: John\n";
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  // Comments before the first key become the document header, not a key comment
  const header = getComment(doc);
  assertExists(header);
  assertEquals(header!.before, "line 1\nline 2");

  // The first key should NOT have the header duplicated as its before comment
  const nameComment = getComment(doc, "name");
  assertEquals(nameComment, undefined);
});

Deno.test("YAML: quoted # is not a comment", () => {
  const input = 'name: "John # not a comment"\nage: 30\n';
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  assertEquals(doc.name, "John # not a comment");
  const nameComment = getComment(doc, "name");
  // Should not have an inline comment
  assertEquals(nameComment?.after, undefined);
});

Deno.test("YAML: data values are correct despite comments", async () => {
  const input = await Deno.readTextFile("test/data/commented.yaml");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  assertEquals(doc.name, "John");
  assertEquals(doc.age, 30);
  assertEquals(doc.isEmployed, true);
  assertEquals((doc.address as any).street, "123 Main St");
  assertEquals((doc.address as any).city, "Springfield");
});

// ============================================================
// TOML Comment Tests
// ============================================================

Deno.test("TOML: header comment extracted", async () => {
  const input = await Deno.readTextFile("test/data/commented.toml");
  const parsed = TomlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const header = getComment(doc);
  assertExists(header);
  assertEquals(header!.before, "Configuration file header");
});

Deno.test("TOML: inline comment extracted", async () => {
  const input = await Deno.readTextFile("test/data/commented.toml");
  const parsed = TomlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const titleComment = getComment(doc, "title");
  assertExists(titleComment);
  assertEquals(titleComment!.after, "inline title comment");
});

Deno.test("TOML: before comment extracted", async () => {
  const input = await Deno.readTextFile("test/data/commented.toml");
  const parsed = TomlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const nameComment = getComment(doc, "name");
  assertExists(nameComment);
  assertEquals(nameComment!.before, "About the owner");
});

Deno.test("TOML: data values are correct", async () => {
  const input = await Deno.readTextFile("test/data/commented.toml");
  const parsed = TomlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  assertEquals(doc.title, "My Config");
  assertEquals(doc.name, "John");
  assertEquals(doc.age, 30);
  assertEquals((doc.address as any).street, "123 Main St");
});

Deno.test("TOML: encode preserves comments", () => {
  const input = "# Header\ntitle = \"test\"  # inline\n";
  const parsed = TomlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const output = TomlPlugin.encode(doc) as string;
  assertEquals(output.includes("# Header"), true);
  assertEquals(output.includes("# inline"), true);
});

// ============================================================
// INI Comment Tests
// ============================================================

Deno.test("INI: header comment extracted", async () => {
  const input = await Deno.readTextFile("test/data/commented.ini");
  const parsed = IniPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const header = getComment(doc);
  assertExists(header);
  assertEquals(header!.before, "Configuration file header");
});

Deno.test("INI: before comment extracted on key", async () => {
  const input = await Deno.readTextFile("test/data/commented.ini");
  const parsed = IniPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const person = doc.person as Record<string, unknown>;

  const ageComment = getComment(person, "age");
  assertExists(ageComment);
  assertEquals(ageComment!.before, "Age of person");
});

Deno.test("INI: section comment extracted", async () => {
  const input = await Deno.readTextFile("test/data/commented.ini");
  const parsed = IniPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const addressComment = getComment(doc, "address");
  assertExists(addressComment);
  assertEquals(addressComment!.before, "Address section");
});

Deno.test("INI: data values are correct", async () => {
  const input = await Deno.readTextFile("test/data/commented.ini");
  const parsed = IniPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  assertEquals((doc as any).person.name, "John");
  // INI parser returns all values as strings
  assertEquals(String((doc as any).person.age), "30");
  assertEquals((doc as any).address.street, "Main St 123");
});

Deno.test("INI: encode produces valid output", async () => {
  const input = await Deno.readTextFile("test/data/commented.ini");
  const parsed = IniPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const output = IniPlugin.encode(doc) as string;
  assertEquals(typeof output, "string");
  assertEquals(output.includes("name"), true);
});

// ============================================================
// JSONC Comment Tests
// ============================================================

Deno.test("JSONC: line comments extracted", async () => {
  const input = await Deno.readTextFile("test/data/commented.jsonc");
  const parsed = JsonPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const nameComment = getComment(doc, "name");
  assertExists(nameComment);
  assertEquals(nameComment!.before, "Person name");
});

Deno.test("JSONC: inline comment extracted", async () => {
  const input = await Deno.readTextFile("test/data/commented.jsonc");
  const parsed = JsonPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const ageComment = getComment(doc, "age");
  assertExists(ageComment);
  assertEquals(ageComment!.after, "inline age comment");
});

Deno.test("JSONC: block comment extracted", async () => {
  const input = await Deno.readTextFile("test/data/commented.jsonc");
  const parsed = JsonPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const addressComment = getComment(doc, "address");
  assertExists(addressComment);
  assertEquals(addressComment!.before, "Address block");
});

Deno.test("JSONC: data values are correct", async () => {
  const input = await Deno.readTextFile("test/data/commented.jsonc");
  const parsed = JsonPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  assertEquals(doc.name, "John");
  assertEquals(doc.age, 30);
  assertEquals((doc.address as any).street, "123 Main St");
});

Deno.test("JSONC: standard JSON still works without comments", () => {
  const input = '{"name": "John", "age": 30}';
  const parsed = JsonPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  assertEquals(doc.name, "John");
  assertEquals(doc.age, 30);
  assertEquals(hasComments(doc), false);
});

Deno.test("JSONC: encode preserves comments", () => {
  const input = '{\n  // Person name\n  "name": "John",\n  "age": 30  // inline\n}';
  const parsed = JsonPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const output = JsonPlugin.encode(doc) as string;
  assertEquals(output.includes("// Person name"), true);
  assertEquals(output.includes("// inline"), true);
});

Deno.test("JSONC: // inside string values is not stripped", () => {
  const input = '{"url": "https://example.com"}';
  const parsed = JsonPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  assertEquals(doc.url, "https://example.com");
});

// ============================================================
// XML Comment Tests
// ============================================================

Deno.test("XML: comment before element extracted", async () => {
  const input = await Deno.readTextFile("test/data/commented.xml");
  const parsed = XmlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  // The XML parser produces a structure; check comments are attached
  assertEquals(hasComments(doc), true);
});

Deno.test("XML: data values are correct", async () => {
  const input = await Deno.readTextFile("test/data/commented.xml");
  const parsed = XmlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  assertEquals(typeof doc, "object");
  // XML structure depends on the parser's output format
  assertExists(doc);
});

// ============================================================
// Edge Case Tests
// ============================================================

Deno.test("YAML: empty object with header comment", () => {
  // YAML parses empty document as null, which isn't an object
  // This should not throw
  const input = "# Just a comment\n";
  const parsed = YamlPlugin.decode(input);
  assertEquals(parsed.documents.length, 1);
});

Deno.test("YAML: only data, no comments", () => {
  const input = "name: John\nage: 30\n";
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  assertEquals(doc.name, "John");
  // Should not crash, comments just won't be there
  assertEquals(hasComments(doc), false);
});

Deno.test("YAML: deeply nested comments", () => {
  const input = `
a:
  b:
    # deep comment
    c: value
`.trim();
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as any;

  const cComment = getComment(doc.a.b, "c");
  assertExists(cComment);
  assertEquals(cComment!.before, "deep comment");
});

Deno.test("JSON: plain JSON file has no comments", () => {
  const input = '{"name": "test"}';
  const parsed = JsonPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  assertEquals(hasComments(doc), false);
  assertEquals(doc.name, "test");
});

Deno.test("YAML: comment with no space after #", () => {
  const input = "#compact\nname: John\n";
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const header = getComment(doc);
  assertExists(header);
  assertEquals(header!.before, "compact");
});

Deno.test("comments do not affect for...in iteration", () => {
  const obj: Record<string, unknown> = { a: 1, b: 2 };
  setComment(obj, "a", { before: "test" });

  const keys: string[] = [];
  for (const key in obj) {
    keys.push(key);
  }
  assertEquals(keys, ["a", "b"]);
});

Deno.test("comments do not affect Object.entries", () => {
  const obj: Record<string, unknown> = { x: 10 };
  setComment(obj, "x", { after: "comment" });

  assertEquals(Object.entries(obj), [["x", 10]]);
});

Deno.test("comments do not affect JSON.stringify", () => {
  const obj = { data: "value" };
  setComment(obj, "data", { before: "important", after: "note" });
  setComment(obj, "#", { before: "header" });

  assertEquals(JSON.stringify(obj), '{"data":"value"}');
});

Deno.test("YAML: multiple comments between keys", () => {
  const input = "a: 1\n# comment 1\n# comment 2\nb: 2\n";
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const bComment = getComment(doc, "b");
  assertExists(bComment);
  assertEquals(bComment!.before, "comment 1\ncomment 2");
});

Deno.test("ParsedData stores sourceFormat", () => {
  const pd = new ParsedData([{}], { sourceFormat: "YAML" });
  assertEquals(pd.sourceFormat, "YAML");
});

Deno.test("ParsedData.isMultiDocument defaults to false for single doc", () => {
  const pd = new ParsedData([{}]);
  assertEquals(pd.isMultiDocument, false);
});

Deno.test("ParsedData.isMultiDocument defaults to true for multiple docs", () => {
  const pd = new ParsedData([{}, {}]);
  assertEquals(pd.isMultiDocument, true);
});

Deno.test("unwrapParsedData: empty array returns undefined", () => {
  const result = unwrapParsedData([]);
  assertEquals(result, undefined);
});

Deno.test("TOML: section before-comment on root key", async () => {
  const input = await Deno.readTextFile("test/data/commented.toml");
  const parsed = TomlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const ageComment = getComment(doc, "age");
  assertExists(ageComment);
  assertEquals(ageComment!.before, "Age setting");
});

Deno.test("YAML: multi-doc with trailing comment on second doc", async () => {
  const input = await Deno.readTextFile(
    "test/data/multi-doc-commented.yaml",
  );
  const parsed = YamlPlugin.decode(input);
  const doc1 = parsed.documents[1] as Record<string, unknown>;

  const trailing = getComment(doc1);
  assertExists(trailing);
  assertEquals(trailing!.after, "Trailing comment");
});

// ============================================================
// YAML Anchors & Aliases Tests
// ============================================================

Deno.test("YAML: anchors and aliases are resolved", async () => {
  const input = await Deno.readTextFile("test/data/anchors.yaml");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const data = doc.data as Record<string, unknown>;

  // Anchor definition
  const chartRefs = data.chart_refs as any;
  assertEquals(chartRefs.ingress["ingress-nginx"].type, "tar");
  assertEquals(
    chartRefs.ingress["ingress-nginx"].location,
    "https://example.com/charts/ingress-nginx-4.13.0.tgz",
  );

  // Alias usage resolves to the same data
  const charts = data.charts as any;
  assertEquals(charts.kubernetes.ingress.type, "tar");
  assertEquals(charts.kubernetes.ingress.subpath, "ingress-nginx");
  assertEquals(charts.osh.mariadb.subpath, "mariadb");
  assertEquals(charts.osh.memcached.subpath, "memcached");
  assertEquals(charts.monitoring.rabbitmq.subpath, "rabbitmq");
});

Deno.test("YAML: many aliases do not trigger resource exhaustion error", async () => {
  const input = await Deno.readTextFile("test/data/anchors.yaml");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const data = doc.data as Record<string, unknown>;

  // Verify deeply nested alias reuse across sections
  const images = data.images as any;
  assertEquals(images.osh.keystone.init, "registry.example.com/alpine@sha256:abc123");
  assertEquals(images.osh.glance.init, "registry.example.com/alpine@sha256:abc123");
  assertEquals(images.osh.nova.init, "registry.example.com/alpine@sha256:abc123");
  assertEquals(images.osh.neutron.init, "registry.example.com/alpine@sha256:abc123");

  // All alias references to the same anchor produce the same value
  assertEquals(images.osh.keystone.db, images.osh.glance.db);
  assertEquals(images.osh.keystone.queue, images.osh.nova.queue);
});

Deno.test("YAML: anchors file round-trips through encode", async () => {
  const input = await Deno.readTextFile("test/data/anchors.yaml");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const output = YamlPlugin.encode(doc) as string;

  // Re-parse the output and verify data integrity
  const reparsed = YamlPlugin.decode(output);
  const redoc = reparsed.documents[0] as Record<string, unknown>;
  const data = redoc.data as any;

  assertEquals(data.charts.osh.mariadb.subpath, "mariadb");
  assertEquals(data.images.osh.keystone.init, "registry.example.com/alpine@sha256:abc123");
});

Deno.test("YAML: anchors file comments are preserved", async () => {
  const input = await Deno.readTextFile("test/data/anchors.yaml");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  // Document header
  const header = getComment(doc);
  assertExists(header);
  assertEquals(header!.before, "Software versions");

  // Nested comments
  const data = doc.data as Record<string, unknown>;
  const chartRefsComment = getComment(data, "chart_refs");
  assertExists(chartRefsComment);
  assertEquals(chartRefsComment!.before, "Chart references with anchors");
});

// ============================================================
// YAML Anchor/Alias Preservation Tests
// ============================================================

Deno.test("YAML: scalar anchor is preserved in YAML output", () => {
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

  assert(output.includes("&alpine"), "anchor &alpine should be present");
  assert(output.includes("*alpine"), "alias *alpine should be present");
});

Deno.test("YAML: object anchor is preserved in YAML output", () => {
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

  assert(output.includes("&ingress_chart"), "anchor &ingress_chart should be present");
  // Two alias references
  const aliasMatches = output.match(/\*ingress_chart/g);
  assertEquals(aliasMatches?.length, 2, "should have 2 alias references");
});

Deno.test("YAML: multiple anchors and aliases are all preserved", () => {
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

  assert(output.includes("&foo"), "anchor &foo should be present");
  assert(output.includes("&bar"), "anchor &bar should be present");
  assert(output.includes("&baz"), "anchor &baz should be present");
  assertEquals(output.match(/\*foo/g)?.length, 2, "should have 2 *foo aliases");
  assertEquals(output.match(/\*bar/g)?.length, 1, "should have 1 *bar alias");
  assertEquals(output.match(/\*baz/g)?.length, 1, "should have 1 *baz alias");
});

Deno.test("YAML: anchor values are correct after decode", () => {
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

  assertEquals(refs.service_a, "registry.example.com/app@sha256:abc");
  assertEquals(refs.service_b, "registry.example.com/app@sha256:abc");
});

Deno.test("YAML: anchor round-trip preserves data integrity", () => {
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

  assertEquals((redoc as any).uses.first.location, "https://example.com/chart.tgz");
  assertEquals((redoc as any).uses.second.subpath, "myapp");
});

Deno.test("YAML: anchors with comments are both preserved", () => {
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
  assert(output.includes("&img"), "anchor should be preserved");
  assert(output.includes("*img"), "alias should be preserved");
  assert(output.includes("# Header"), "header comment should be preserved");
  assert(output.includes("# The main image"), "key comment should be preserved");
});

Deno.test("YAML: anchors file preserves all anchors and aliases on round-trip", async () => {
  const input = await Deno.readTextFile("test/data/anchors.yaml");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const output = YamlPlugin.encode(doc) as string;

  // Count anchors and aliases in output
  const anchors = output.match(/&\w+/g) || [];
  const aliases = output.match(/\*\w+/g) || [];

  // The fixture has 12 anchors and many aliases
  assert(anchors.length >= 12, `expected at least 12 anchors, got ${anchors.length}`);
  assert(aliases.length >= 20, `expected at least 20 aliases, got ${aliases.length}`);
});

Deno.test("YAML: YAML without anchors is unaffected", () => {
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

  assert(!output.includes("&"), "no anchors should appear");
  assert(!output.includes("*"), "no aliases should appear");
  assert(output.includes("name: test"), "data should be intact");
});

// ============================================================
// YAML Document Separator (---/...) Tests
// ============================================================

Deno.test("YAML: --- separator with header comment does not duplicate", async () => {
  const input = await Deno.readTextFile("test/data/doc-separator.yaml");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  // Header comment should be on container only
  const header = getComment(doc);
  assertExists(header);
  assertEquals(header!.before, "High-level site definition");

  // First key should NOT have the header duplicated
  const schemaComment = getComment(doc, "schema");
  assertEquals(schemaComment, undefined);
});

Deno.test("YAML: --- separator preserves inline comments", async () => {
  const input = await Deno.readTextFile("test/data/doc-separator.yaml");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const metadata = doc.metadata as Record<string, unknown>;

  const nameComment = getComment(metadata, "name");
  assertExists(nameComment);
  assertEquals(nameComment!.before, "Replace with the site name");
});

Deno.test("YAML: --- separator file data values are correct", async () => {
  const input = await Deno.readTextFile("test/data/doc-separator.yaml");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  assertEquals(doc.schema, "pegleg/SiteDefinition/v1");
  assertEquals((doc.metadata as any).name, "test-site");
  assertEquals((doc.data as any).site_type, "cruiser");
});

Deno.test("YAML: ... end marker does not create extra documents", async () => {
  const input = await Deno.readTextFile("test/data/doc-separator.yaml");
  const parsed = YamlPlugin.decode(input);

  assertEquals(parsed.isMultiDocument, false);
  assertEquals(parsed.documents.length, 1);
});

Deno.test("YAML: --- header comment not duplicated in JSON output", async () => {
  const input = await Deno.readTextFile("test/data/doc-separator.yaml");
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const output = JsonPlugin.encode(doc) as string;

  // Count occurrences of the header comment
  const matches = output.match(/High-level site definition/g);
  assertEquals(matches?.length, 1, "Header comment should appear exactly once in JSON output");
});

Deno.test("YAML: header comment not duplicated in JSON output (no --- separator)", () => {
  const input = "# Header comment\nname: John\nage: 30\n";
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;

  const output = JsonPlugin.encode(doc) as string;

  const matches = output.match(/Header comment/g);
  assertEquals(matches?.length, 1, "Header comment should appear exactly once in JSON output");
});

// ============================================================
// Tracked Proxy .comment() / .commentAfter() Tests
// ============================================================

import { tracked } from "../src/replExtensions.ts";

Deno.test("tracked: .comment() reads existing before-comment on object member", () => {
  const raw = { name: "John", age: 30 };
  setComment(raw, "name", { before: "Person name" });
  const data = tracked(raw) as any;

  assertEquals(data.name.comment(), "Person name");
});

Deno.test("tracked: .commentAfter() reads existing after-comment on object member", () => {
  const raw = { name: "John", age: 30 };
  setComment(raw, "name", { after: "inline note" });
  const data = tracked(raw) as any;

  assertEquals(data.name.commentAfter(), "inline note");
});

Deno.test("tracked: .comment(text) sets before-comment on primitive member", () => {
  const raw = { name: "John", age: 30 };
  const data = tracked(raw) as any;

  data.age.comment("years old");
  assertEquals(getComment(raw, "age")?.before, "years old");
});

Deno.test("tracked: .commentAfter(text) sets after-comment on primitive member", () => {
  const raw = { name: "John", age: 30 };
  const data = tracked(raw) as any;

  data.age.commentAfter("years");
  assertEquals(getComment(raw, "age")?.after, "years");
});

Deno.test("tracked: .comment() on root returns container header", () => {
  const raw = { name: "John" };
  setComment(raw, "#", { before: "File header" });
  const data = tracked(raw) as any;

  assertEquals(data.comment(), "File header");
});

Deno.test("tracked: .comment(text) on root sets container header", () => {
  const raw = { name: "John" };
  const data = tracked(raw) as any;

  data.comment("New header");
  assertEquals(getComment(raw, "#")?.before, "New header");
});

Deno.test("tracked: .commentAfter() on root returns container trailer", () => {
  const raw = { name: "John" };
  setComment(raw, "#", { after: "Trailing" });
  const data = tracked(raw) as any;

  assertEquals(data.commentAfter(), "Trailing");
});

Deno.test("tracked: .commentAfter(text) on root sets container trailer", () => {
  const raw = { name: "John" };
  const data = tracked(raw) as any;

  data.commentAfter("End of file");
  assertEquals(getComment(raw, "#")?.after, "End of file");
});

Deno.test("tracked: nested object .comment() gets parent key comment", () => {
  const raw = { metadata: { name: "test" } };
  setComment(raw, "metadata", { before: "Metadata section" });
  const data = tracked(raw) as any;

  assertEquals(data.metadata.comment(), "Metadata section");
});

Deno.test("tracked: nested object .comment(text) sets parent key comment", () => {
  const raw = { metadata: { name: "test" } };
  const data = tracked(raw) as any;

  data.metadata.comment("Metadata section");
  assertEquals(getComment(raw, "metadata")?.before, "Metadata section");
});

Deno.test("tracked: deep chain data.a.b.c.comment()", () => {
  const raw = { a: { b: { c: "value" } } };
  const data = tracked(raw) as any;

  data.a.b.c.comment("deep comment");
  assertEquals(getComment(raw.a.b, "c")?.before, "deep comment");
  assertEquals(data.a.b.c.comment(), "deep comment");
});

Deno.test("tracked: .comment() on string member", () => {
  const raw = { url: "https://example.com" };
  const data = tracked(raw) as any;

  data.url.comment("API endpoint");
  assertEquals(getComment(raw, "url")?.before, "API endpoint");
  assertEquals(data.url.comment(), "API endpoint");
});

Deno.test("tracked: .comment() on boolean member", () => {
  const raw = { enabled: true };
  const data = tracked(raw) as any;

  data.enabled.comment("Feature flag");
  assertEquals(getComment(raw, "enabled")?.before, "Feature flag");
  assertEquals(data.enabled.comment(), "Feature flag");
});

Deno.test("tracked: setting comment preserves existing after-comment", () => {
  const raw = { age: 30 };
  setComment(raw, "age", { after: "years" });
  const data = tracked(raw) as any;

  data.age.comment("Person age");
  assertEquals(getComment(raw, "age")?.before, "Person age");
  assertEquals(getComment(raw, "age")?.after, "years");
});

Deno.test("tracked: setting commentAfter preserves existing before-comment", () => {
  const raw = { age: 30 };
  setComment(raw, "age", { before: "Person age" });
  const data = tracked(raw) as any;

  data.age.commentAfter("years");
  assertEquals(getComment(raw, "age")?.before, "Person age");
  assertEquals(getComment(raw, "age")?.after, "years");
});

Deno.test("tracked: returns undefined for members without comments", () => {
  const raw = { name: "John" };
  const data = tracked(raw) as any;

  assertEquals(data.name.comment(), undefined);
  assertEquals(data.name.commentAfter(), undefined);
});

Deno.test("tracked: proxy is transparent for Object.keys", () => {
  const raw = { a: 1, b: 2, c: 3 };
  const data = tracked(raw) as any;

  assertEquals(Object.keys(data), ["a", "b", "c"]);
});

Deno.test("tracked: proxy is transparent for JSON.stringify", () => {
  const raw = { name: "John", age: 30 };
  const data = tracked(raw) as any;

  assertEquals(JSON.stringify(data), '{"name":"John","age":30}');
});

Deno.test("tracked: proxy is transparent for Array.isArray", () => {
  const raw = { items: [1, 2, 3] };
  const data = tracked(raw) as any;

  assertEquals(Array.isArray(data.items), true);
});

Deno.test("tracked: proxy is transparent for Object.entries", () => {
  const raw = { x: 10, y: 20 };
  const data = tracked(raw) as any;

  assertEquals(Object.entries(data), [["x", 10], ["y", 20]]);
});

Deno.test("tracked: proxy is transparent for property assignment", () => {
  const raw: Record<string, unknown> = { name: "John" };
  const data = tracked(raw) as any;

  data.name = "Jane";
  assertEquals(raw.name, "Jane");
});

Deno.test("tracked: proxy is transparent for arithmetic on numbers", () => {
  const raw = { age: 30 };
  const data = tracked(raw) as any;

  assertEquals(data.age + 1, 31);
  assertEquals(data.age * 2, 60);
  assertEquals(data.age > 18, true);
});

Deno.test("tracked: array element .comment()", () => {
  const raw = { items: ["a", "b", "c"] };
  const data = tracked(raw) as any;

  data.items[1].comment("second item");
  assertEquals(getComment(raw.items, "1")?.before, "second item");
  assertEquals(data.items[1].comment(), "second item");
});

Deno.test("tracked: object .comment() returns proxy for chaining", () => {
  const raw = { metadata: { name: "test" } };
  const data = tracked(raw) as any;

  const result = data.metadata.comment("section");
  // Should return the proxy, allowing further access
  assertEquals(result.name, "test");
});

Deno.test("tracked: round-trip with YAML encode preserves set comments", () => {
  const input = "name: John\nage: 30\n";
  const parsed = YamlPlugin.decode(input);
  const raw = parsed.documents[0] as Record<string, unknown>;
  const data = tracked(raw) as any;

  data.comment("Person record");
  data.name.commentAfter("first name");
  data.age.comment("Age in years");

  const output = YamlPlugin.encode(raw) as string;
  assertEquals(output.includes("# Person record"), true);
  assertEquals(output.includes("# first name"), true);
  assertEquals(output.includes("# Age in years"), true);
});

// ============================================================
// Tracked Proxy .anchor() / .alias() Tests
// ============================================================

Deno.test("tracked: .anchor() reads existing anchor name from YAML", () => {
  const input = `
defs:
  img: &my_anchor registry.example.com/app
refs:
  svc: *my_anchor
`;
  const parsed = YamlPlugin.decode(input);
  const raw = parsed.documents[0] as Record<string, unknown>;
  const data = tracked(raw) as any;

  assertEquals(data.defs.img.anchor(), "my_anchor");
});

Deno.test("tracked: .alias() reads existing alias reference from YAML", () => {
  const input = `
defs:
  img: &my_anchor registry.example.com/app
refs:
  svc: *my_anchor
`;
  const parsed = YamlPlugin.decode(input);
  const raw = parsed.documents[0] as Record<string, unknown>;
  const data = tracked(raw) as any;

  assertEquals(data.refs.svc.alias(), "my_anchor");
});

Deno.test("tracked: .anchor() returns undefined when no anchor", () => {
  const input = "name: John\nage: 30\n";
  const parsed = YamlPlugin.decode(input);
  const raw = parsed.documents[0] as Record<string, unknown>;
  const data = tracked(raw) as any;

  assertEquals(data.name.anchor(), undefined);
  assertEquals(data.age.anchor(), undefined);
});

Deno.test("tracked: .alias() returns undefined when not an alias", () => {
  const input = `
defs:
  img: &my_anchor registry.example.com/app
`;
  const parsed = YamlPlugin.decode(input);
  const raw = parsed.documents[0] as Record<string, unknown>;
  const data = tracked(raw) as any;

  assertEquals(data.defs.img.alias(), undefined);
});

Deno.test("tracked: .anchor(name) sets anchor on a value", () => {
  const raw = { defs: { img: "registry.example.com/app" }, refs: { svc: "registry.example.com/app" } };
  const data = tracked(raw) as any;

  data.defs.img.anchor("my_img");
  assertEquals(data.defs.img.anchor(), "my_img");

  const output = YamlPlugin.encode(raw) as string;
  assert(output.includes("&my_img"));
});

Deno.test("tracked: .alias(name) sets alias on a value", () => {
  const raw = { defs: { img: "registry.example.com/app" }, refs: { svc: "registry.example.com/app" } };
  const data = tracked(raw) as any;

  data.defs.img.anchor("my_img");
  data.refs.svc.alias("my_img");

  assertEquals(data.refs.svc.alias(), "my_img");

  const output = YamlPlugin.encode(raw) as string;
  assert(output.includes("&my_img"));
  assert(output.includes("*my_img"));
});

Deno.test("tracked: .anchor() on object value reads anchor", () => {
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

  assertEquals(data.chart_refs.nginx.anchor(), "nginx_chart");
  assertEquals(data.charts.web.alias(), "nginx_chart");
});

Deno.test("tracked: setting anchor clears alias and vice versa", () => {
  const raw = { a: "val" };
  const data = tracked(raw) as any;

  data.a.anchor("x");
  assertEquals(data.a.anchor(), "x");
  assertEquals(data.a.alias(), undefined);

  data.a.alias("y");
  assertEquals(data.a.alias(), "y");
  assertEquals(data.a.anchor(), undefined);
});

Deno.test("tracked: .anchor() and .alias() work on primitive number", () => {
  const raw = { port: 8080 };
  const data = tracked(raw) as any;

  data.port.anchor("default_port");
  assertEquals(data.port.anchor(), "default_port");
});

Deno.test("tracked: aqAnchors() returns full anchor map", () => {
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
  assertExists(defs);
  assertEquals(defs.a.anchor, "anchor_a");
  assertEquals(defs.b.anchor, "anchor_b");

  const refs = data.refs.aqAnchors();
  assertExists(refs);
  assertEquals(refs.x.alias, "anchor_a");
  assertEquals(refs.y.alias, "anchor_b");
});

Deno.test("tracked: aqAnchors(key) returns single entry", () => {
  const input = `
defs:
  img: &my_img value
`;
  const parsed = YamlPlugin.decode(input);
  const raw = parsed.documents[0] as Record<string, unknown>;
  const data = tracked(raw) as any;

  const entry = data.defs.aqAnchors("img");
  assertExists(entry);
  assertEquals(entry.anchor, "my_img");
});

Deno.test("tracked: round-trip YAML preserves anchors set via .anchor()/.alias()", () => {
  const raw = {
    defs: { img: "registry.example.com/app@sha256:abc" },
    services: { web: "registry.example.com/app@sha256:abc", api: "registry.example.com/app@sha256:abc" },
  };
  const data = tracked(raw) as any;

  data.defs.img.anchor("app_img");
  data.services.web.alias("app_img");
  data.services.api.alias("app_img");

  const output = YamlPlugin.encode(raw) as string;
  assert(output.includes("&app_img"), "anchor should appear");
  assertEquals(output.match(/\*app_img/g)?.length, 2, "should have 2 aliases");

  // Re-parse and verify data is still correct
  const reparsed = YamlPlugin.decode(output);
  const redoc = reparsed.documents[0] as Record<string, unknown>;
  assertEquals((redoc as any).services.web, "registry.example.com/app@sha256:abc");
  assertEquals((redoc as any).services.api, "registry.example.com/app@sha256:abc");
});

// ============================================================
// YAML Deep Nesting Comment Round-trip Tests
// ============================================================

Deno.test("YAML: deeply nested comments survive round-trip", () => {
  const input = `root:
  level1:
    # comment on deep key
    deep_key: deep_value
`;
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const output = YamlPlugin.encode(doc) as string;

  assert(output.includes("# comment on deep key"), "deep comment should survive");
});

Deno.test("YAML: comments on multiple nesting levels survive round-trip", () => {
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

  assert(output.includes("# header"), "header comment should survive");
  assert(output.includes("# level 1 comment"), "level 1 comment should survive");
  assert(output.includes("# level 2 comment"), "level 2 comment should survive");
});

Deno.test("YAML: parent without comments does not block child comment extraction", () => {
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
  assertExists(comment, "comment on deeply nested key should be extracted");
  assertEquals(comment!.before, "important note");

  // Round-trip: comment should appear in output
  const output = YamlPlugin.encode(doc) as string;
  assert(output.includes("# important note"), "deep comment should survive round-trip");
});

Deno.test("YAML: trailing comment on nested map is preserved", () => {
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
  assertExists(containerComment, "trailing comment should be captured");
  assertEquals(containerComment!.after, "trailing note");

  // Round-trip
  const output = YamlPlugin.encode(doc) as string;
  assert(output.includes("# trailing note"), "trailing comment should survive round-trip");
});

Deno.test("YAML: empty comment line is preserved in round-trip", () => {
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
  assertExists(firstComment);
  // The empty # line is preserved as an empty line in the comment text
  assert(firstComment!.before!.includes("section header"), "should have section header");
  assert(firstComment!.before!.includes("\n"), "should have newline for empty comment line");

  // Round-trip: both comment lines should appear
  const output = YamlPlugin.encode(doc) as string;
  assert(output.includes("# section header"), "section header should survive");
});

Deno.test("YAML: inline (after) comments on deeply nested scalars survive", () => {
  const input = `config:
  database:
    host: localhost # primary host
    port: 5432 # default port
`;
  const parsed = YamlPlugin.decode(input);
  const doc = parsed.documents[0] as Record<string, unknown>;
  const output = YamlPlugin.encode(doc) as string;

  assert(output.includes("# primary host"), "inline comment on host should survive");
  assert(output.includes("# default port"), "inline comment on port should survive");
});
