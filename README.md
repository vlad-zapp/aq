# aq — Universal CLI for Structured Data

**aq** is a fast, portable command-line tool and library for querying and transforming structured data formats like JSON, YAML, XML, TOML, and INI. It combines the power of JavaScript expressions with a REPL interface, making it ideal for quick inspections, scripting, and interactive exploration.

---

## Features

- Supports multiple data formats: JSON, YAML, XML, TOML, INI, and text
- Query using JavaScript expressions (e.g., `data.users[0].name`)
- Interactive console (REPL) for real-time data exploration
- Comment preservation across parse/encode round-trips
- YAML anchor/alias preservation
- Seamless integration with Unix pipelines
- Library API for use in Node.js projects
- Standalone binaries — no runtime required

---

## Installation

### Download a binary

Grab the latest release for your platform from [GitHub Releases](https://github.com/vlad-zapp/aq/releases).

### Build from source

```bash
git clone https://github.com/vlad-zapp/aq.git
cd aq
npm install
npm run build
```

The compiled output is in `dist/`. Run with `node dist/src/main.js`.

### Use as a library

Add to your `package.json`:

```json
"aq": "github:vlad-zapp/aq"
```

Then:

```js
const { parse, encode } = require("aq");

const data = parse(yamlString, "yaml");
data.server.port = 8080;
const output = encode(data, "yaml"); // comments preserved
```

---

## Usage

### Query a JSON File

```bash
aq data.json -q "data.users[0].name"
```

### Pipe Data into aq

```bash
cat data.yaml | aq -q "data.items.map(item => item.id)"
```

### Interactive Mode

```bash
aq data.json -x
```

Or with piped input:

```bash
cat data.yaml | aq -x
```

In interactive mode, you can explore the data using JavaScript expressions. Press `ctrl+d` to quit.

---

## Options

```
aq [file]

Options:
  -q, --query <query>           JavaScript expression to apply to the data
  -x, --interactive             Start interactive mode (REPL)
  -X, --interactive-with-output Interactive mode with final result output to stdout
  -w, --webui                   Start a web server to display data as a tree
  -i, --input-format <format>   Specify input format: json, yaml, xml, toml, ini
  -o, --output-format <format>  Specify output format: json, yaml, xml, toml, ini, text
  -h, --help                    Display help information
  -V, --version                 Show version number
```

---

## Examples

### Extract Usernames from JSON

```bash
aq users.json -q "data.users.map(u => u.username)"
```

### Convert YAML to JSON

```bash
aq config.yaml -o json
```

### Interactive Exploration

```bash
aq data.json -x
```

Then, within the REPL:

```js
data.items.filter(item => item.active)
```

### Interactive Mode With Output

Run interactively, then return the last result to stdout — useful when exploring and extracting just the right expression:

```bash
cat users.json | aq -X
```

Inside the REPL:

```js
data.users.filter(u => u.isActive).map(u => u.email)
```

The result of the last command will be printed to stdout when you exit — perfect for passing into `xargs`, `pbcopy`, etc.

---

## Library API

### `parse(input, format?) → object`

Parse a string into a JS object. If `format` is omitted, auto-detect from content. Comment and anchor metadata are attached via Symbols (invisible to `JSON.stringify` / `Object.keys`).

### `encode(data, format) → string`

Serialize a JS object back to a string in the given format. Reinserts any comment/anchor metadata from the parse step.

### Utility functions

All `aq*` functions are exported: `aqFindByName`, `aqFindByValue`, `aqFindByFullName`, `aqFindByLocator`, `aqDiff`, `aqComments`, `aqAnchors`.

### Comment infrastructure

Exports: `getComment`, `setComment`, `getComments`, `setComments`, `hasComments`, `cloneComments`, `COMMENTS`.

### Anchor infrastructure

Exports: `getAnchor`, `setAnchor`, `getAnchors`, `hasAnchors`, `ANCHORS`.

---

## Development

```bash
npm install         # install dependencies
npm run build       # compile TypeScript
npm test            # run tests (vitest)
npm run test:watch  # run tests in watch mode
```

---

## License

MIT License
