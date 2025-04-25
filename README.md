# aq — Universal CLI for Structured Data

**aq** is a fast, portable command-line tool for querying and transforming structured data formats like JSON, YAML, XML, TOML, and INI. It combines the power of JavaScript expressions with a REPL interface, making it ideal for quick inspections, scripting, and interactive exploration.

---

## ✨ Features

- 📦 Supports multiple data formats: JSON, YAML, XML, TOML, INI, and text
- 🔍 Query using JavaScript expressions (e.g., `data.users[0].name`)  
- 🧑‍💻 Interactive console (REPL) for real-time data exploration  
- 🛠️ Seamless integration with Unix pipelines  
- 🚀 Built with Deno — no external dependencies required  
- 📦 Compiled to a single binary for easy distribution  

---

## 📦 Installation

### Option 1: Run with Deno

Ensure you have [Deno](https://deno.land/#installation) installed.

```bash
deno run --allow-all --unstable https://raw.githubusercontent.com/vlad-zapp/aq/main/aq.ts
```

### Option 2: Install as a CLI Tool

```bash
deno install -f --allow-all --unstable -n aq https://raw.githubusercontent.com/vlad-zapp/aq/main/aq.ts
```

This installs `aq` globally. Ensure your Deno bin directory is in your `PATH`.

### Option 3: Compile to a Native Binary

```bash
deno task build
```

This compiles `aq` into a standalone executable for your platform.

### Option 4: Download Precompiled Binaries for your platform

Check the [Releases](https://github.com/vlad-zapp/aq/releases) page.

---

## 🚀 Usage

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

## 🛠️ Options

```bash
aq [file]

Options:
  -q, --query <query>           JavaScript expression to apply to the data
  -x, --interactive             Start interactive mode (REPL)
  -X, --interactive-output      Interactive mode with final result output to stdout
  -i, --input-format <format>   Specify input format: json, yaml, xml, toml, ini
  -o, --output-format <format>  Specify output format: json, yaml, raw
  -h, --help                    Display help information
  -V, --version                 Show version number
```

---

## 🧪 Examples

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

### Interactive Mode With Output (Great for Pipe Debugging)

Run interactively, then return the last result to stdout — useful when exploring and extracting just the right expression:

```bash
cat users.json | aq -X
```

Inside the REPL:

```js
data.users.filter(u => u.isActive).map(u => u.email)
```

⬅️ Thу result of the last command will be printed to stdout when you exit — perfect for passing into `xargs`, `pbcopy`, etc.

---

## 🧰 Development

### Build

```bash
deno task build
```

### Test

```bash
deno test
```

---

## 📄 License

MIT License
