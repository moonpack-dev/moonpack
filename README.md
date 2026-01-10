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
| `name` | Yes | Output filename and `script_name()` |
| `version` | No | `script_version()` |
| `author` | No | `script_author()` (string or array for `script_authors()`) |
| `description` | No | `script_description()` |
| `url` | No | `script_url()` |
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

**Script metadata**: Config fields are injected into the bundle header as MoonLoader script functions.

**Auto-localization**: Functions in modules are automatically prefixed with `local`. Dotted functions like `sampev.onServerMessage` are preserved.

**Dev mode flag**: Bundles include `local __DEV__ = true/false`. True in watch mode, false in build. Use for conditional debug code:

```lua
if __DEV__ then
  print('[DEBUG] player data:', inspect(data))
end
```

**Lint warnings**: Detects common issues during build:
- Duplicate assignments to external module properties across files
- MoonLoader events (`main`, `onScriptTerminate`, etc.) in modules instead of entry point
- Unused requires (`local x = require(...)` where `x` is never used)

**Log tailing**: Watch mode tails `moonloader.log` and displays script output in the terminal.

## License

MIT
