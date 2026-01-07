# moonpack

Lua bundler for MoonLoader scripts. Combines multiple source files into a single distributable script.

## Installation

Requires [Bun](https://bun.sh).

```bash
bun install -g moonpack
```

## Quick Start

```bash
moonpack init
```

This creates `moonpack.json`, `moonpack.local.json`, `.gitignore`, and `src/main.lua`.

Build:

```bash
moonpack build
```

Watch mode with hot-reload:

```bash
moonpack watch
```

## Config

`moonpack.json` (shared, commit to git):

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Output filename (without .lua) |
| `version` | No | Included in bundle header |
| `entry` | Yes | Entry point path |
| `external` | No | Modules to exclude from bundling |

`moonpack.local.json` (personal, add to .gitignore):

| Field | Description |
|-------|-------------|
| `outDir` | Output directory (default: `dist`) |

The local config overrides the shared config, useful for machine-specific paths like your MoonLoader directory.

## Module Resolution

Uses Lua's dot notation. `require('core.utils')` resolves to:
1. `src/core/utils.lua`
2. `src/core/utils/init.lua`

External modules (e.g., `samp.events`) are left as `require()` calls.

## License

MIT
