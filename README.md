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

`moonpack.local.json` (personal, add to .gitignore):

| Field | Description |
|-------|-------------|
| `outDir` | Output directory (default: `dist`) |

The local config overrides the shared config, useful for machine-specific paths like your MoonLoader directory.

## Module Resolution

Path-based requires are bundled, non-path requires are left alone:

```lua
-- Bundled (local modules)
require('./utils')           -- same directory
require('./core/config')     -- subdirectory
require('../shared/lib')     -- parent directory

-- Not bundled (external/system)
require('lib.samp.events')   -- left as require()
require('mimgui')            -- left as require()
```

Paths resolve to:
1. `./utils` → `src/utils.lua`
2. `./utils` → `src/utils/init.lua` (if no .lua file)

## Features

**Auto-localization**: Functions in modules are automatically prefixed with `local`. Dotted functions like `sampev.onServerMessage` are preserved.

**Lint warnings**: Detects common issues during build:
- Duplicate assignments to external module properties across files
- MoonLoader events (`main`, `onScriptTerminate`, etc.) defined in modules instead of entry point

## License

MIT
