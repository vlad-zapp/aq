# JSAF Integration Requirements

aq needs to be converted from Deno to Node.js and provide a library API that JSAF can consume. This document describes what JSAF expects from aq.

## Dependency Method

JSAF will depend on aq via git URL in package.json:
```json
"aq": "github:vlad-zapp/aq"
```

## Runtime Requirements

- Must run on Node.js 20+
- Must export CommonJS (`require('aq')` must work)
- Must be bundlable with esbuild (JSAF bundles all code into a single .cjs before compiling to binary with pkg)
- No Deno-specific APIs at runtime

## Required Library API

aq must export the following from its main entry point:

### `parse(input, format?) → object`
Parse a string into a JS object. If `format` is omitted, auto-detect from content. Comment and anchor metadata must be attached to the returned object via Symbols (non-enumerable, invisible to JSON.stringify / Object.keys).

### `encode(data, format) → string`
Serialize a JS object back to a string in the given format. Must reinsert any comment/anchor metadata from the parse step. Round-trip `parse → encode` must preserve comments.

### Format Support

All formats currently supported by aq must be available. The set of formats may grow over time — the library API should not hardcode format lists.

### Comment Preservation

The entire point of using aq over raw `JSON.parse` / `yaml.parse` is comment preservation. After `parse()`, modifying data properties and calling `encode()` must produce output with the original comments intact.

### Utility Functions

All `aq*` functions currently available in aq (search, diff, comments, anchors, etc.) must be exported and accessible as methods on the aq library object. As new utility functions are added to aq, they should automatically become available — don't hardcode a specific list.

### Auto-Detection

`parse()` without an explicit format must detect the format by content sniffing and fallback to trying available parsers.

## Usage Context

In JSAF, aq will be available as a global `aq` object in the REPL and scripts:

```js
// Parse strings from any source
const data = aq.parse(yamlString)
const data = aq.parse(jsonString, 'json')

// Modify and encode back
data.server.port = 8080
const output = aq.encode(data, 'yaml')  // comments preserved

// Combine with other JSAF modules
const raw = await ssh.web.readFile('/etc/app/config.yaml')
const config = aq.parse(raw, 'yaml')
config.replicas = 3
await ssh.web.writeFile('/etc/app/config.yaml', aq.encode(config, 'yaml'))

// Utility functions
const results = aq.aqFindByName(data, 'port')
```

## Non-Requirements

- aq does NOT need to handle SSH/HTTP connections (JSAF modules do that)
- aq does NOT need to read/write files (JSAF scripts handle I/O)
- The aq CLI, REPL, and WebUI can be ported or not — JSAF only needs the library API above
