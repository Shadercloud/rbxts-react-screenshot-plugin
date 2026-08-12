# Roblox HTTP UI Screenshot

Capture a roblox-ts React component as a PNG, straight from its `.tsx` source, through a real Roblox Studio window.

Package currently works on **WINDOWS** operating system only.

## Quick start

### 1. Install

```powershell
npm install --save-dev @rbxts/react-screenshot-plugin
```

### 2. Install the Studio plugin

One-time, per machine — copies the prebuilt plugin binary into Studio's local plugins folder. No `rojo`, no build step.

```powershell
npx react-screenshot-plugin install-plugin
```

### 3. Capture from the command line

```powershell
npx react-screenshot-plugin src/components/Button.tsx
```

Writes `Button.png` in the current directory. Pass `--output <path>` to write somewhere else, or see "Passing props" below for components that take props.

Prefer `npm run screenshot`? Add a script to your own `package.json`:

```json
{ "scripts": { "screenshot": "react-screenshot-plugin" } }
```

### 4. Capture from a `.ts` file

For a test that captures a component and then inspects the image, call the same thing `react-screenshot-plugin` calls internally — from a plain Node/TypeScript script (a test file, a build script), not from code compiled by `rbxtsc` into Roblox itself:

```typescript
import { runCapture, decodePng } from "@rbxts/react-screenshot-plugin";
import { readFileSync } from "node:fs";

const result = await runCapture({ componentPath: "src/components/Button.tsx" });
const image = decodePng(readFileSync(result.outputPath));

// image.width, image.height, image.pixels (tightly packed, top-to-bottom RGBA8)
```

`runCapture` and `decodePng` are real Node APIs (`child_process`, `http`, Win32 window capture) — they need their own plain Node/TypeScript setup (`@types/node`, no `noLib`), separate from your roblox-ts project's own `tsconfig.json`. That's normal: this code doesn't run inside Roblox, and never could.

## How it works

1. Node compiles the given component (plus any supplied props) into a temporary `.rbxm`, wrapped in a `ScreenGui` and a marker frame, and opens a one-shot loopback session on `127.0.0.1:1927`.
2. The Studio plugin discovers the session, downloads the model, and loads it into `StarterGui`. If Studio isn't open yet, Node launches the newest installed version with a fresh Baseplate first.
3. Once the marker has rendered, Node captures the Studio window, and the plugin removes its temporary content.
4. Node crops to the marker's inner edges and writes the final PNG — the component's filename with `.png` by default, or the path given with `--output` (CLI) / `outputPath` (programmatic).

Every path (the target component, `tsconfig.json`, `node_modules`, your installed `roblox-ts`/`@rbxts/react`) resolves against **your own project**, not this repository — including for hooks-based components, since the marker wrapper is compiled fresh against your own `@rbxts/react` rather than a bundled copy.

## Passing props (CLI)

Four interchangeable styles — pick one per invocation:

| Style | Example |
|---|---|
| JSON blob | `--props '{"text":"Save"}'` |
| JSON file | `--props-file props.json` |
| Individual flags | `--text "Save changes" --disabled false` (`true`/`false`/numbers/`null` auto-coerced) |
| Environment variable | `$env:SCREENSHOT_PROPS = '{"text":"Save"}'` |

**On Windows, any prop value containing a space breaks `npm run <script> -- <args>`** — not a quoting issue, `npm`'s own argument reconstruction for `cmd.exe` mangles it, confirmed by hand. `SCREENSHOT_PROPS` is the one style confirmed to survive byte-for-byte, since environment variables are never re-parsed the way command-line arguments are. Plain `npm run screenshot <path>` / `npx react-screenshot-plugin <path>` with no extra flags is unaffected either way — the mangling only bites once you forward flags containing spaces through `npm run ... --`.

## Prerequisites

- Windows, with Roblox Studio installed and HTTP requests enabled for it.
- Your own roblox-ts project — its own `tsconfig.json`, `node_modules`, and `@rbxts/react`/`@rbxts/react-roblox`/`roblox-ts` installed (this package's `peerDependencies`).
- A component module with a default (`export =`) export; props must be a plain JSON object.

## Development (working on this repository itself)

```sh
npm run build:bridge   # compile the Node CLI/session server
npm run build:plugin   # compile and install the Studio plugin locally
npm run test           # unit + integration suite (fast, no Studio needed)
npm run test:e2e       # real end-to-end suite against a real Studio + plugin
npm run check          # test, then rebuild everything
```

`npm run screenshot <path>` runs this repository's own local CLI against its own fixtures — useful when developing the tool itself. `npm test`'s unit/integration tests simulate the plugin over plain HTTP and fake Studio; `npm run test:e2e` is the real thing (slow, takes over your screen, skips itself if Studio isn't installed) — rebuild the plugin first if you've changed `src/plugin.server.ts` or anything it depends on.

See `specs/001-http-ui-screenshot/quickstart.md` and `specs/002-package-screenshot-tool/quickstart.md` for the full validation matrices, and `specs/001-http-ui-screenshot/` for the original spec and contracts.
