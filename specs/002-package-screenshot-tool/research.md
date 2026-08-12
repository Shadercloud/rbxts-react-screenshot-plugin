# Research Decisions: npm Package Distribution for the Screenshot Tool

## Why the marker wrapper can't be precompiled and bundled

Most `@rbxts/*` npm packages (e.g. `@rbxts/services`, `@rbxts/react` itself) ship precompiled Lua: rbxtsc's Rojo-based copy step just includes the package's existing compiled output, with no recompilation in the consumer's build. That pattern doesn't work for the marker/`ScreenGui` wrapper here, because the wrapper calls `React.createElement` to wrap the *consumer's* component.

Roblox's `require()` caches by ModuleScript instance identity, not by module name or version. If this package bundled its own precompiled copy of `@rbxts/react`/`@rbxts/react-roblox`, that copy would be a second, distinct `require()`'d instance from whatever the consumer's own component was compiled against — even if both instances are the exact same published version. React's element-type checks (`element.$$typeof === REACT_ELEMENT_TYPE`) and hook dispatch compare values that are only reference-equal *within* one module instance, so mixing them reproduces the same "invalid hook call" / "invalid element type" failures web React hits when two copies of `react` end up in a page. This is a structural constraint, not a version-pinning problem — pinning identical semver in both places would not fix it, because they'd still be two separate `require()`'d tables.

**Decision**: ship the wrapper as raw roblox-ts source inside the npm package. At capture time, stage it into a temporary project alongside the consumer's target component, symlink the consumer's own `node_modules` into that staging project (extending the technique `model-builder.ts` already uses for this repository's own `src/`), and compile with the consumer's own `rbxtsc`. This guarantees the wrapper and the consumer's component resolve `@rbxts/react` to the exact same `node_modules` copy, which rbxtsc then compiles into one shared Lua module — one `require()`'d instance either way.

## Why the Studio plugin binary can be prebuilt and shared

`plugin.server.ts` and `session-client.ts` never import React, `@rbxts/react-roblox`, or anything from the consumer's dependency tree — they deserialize whatever model bytes they're handed and parent/destroy instances generically. Nothing about them depends on which project's component is being captured, or which React version that project uses. That makes the plugin the one part of this system safe to build once (against this repository's own pinned toolchain) and ship as a binary `.rbxm` asset in the npm package, installed once per machine via `install-plugin` and shared by every consumer project that installs the package afterward.

## Rejected approaches

- **Bundling `@rbxts/react`/`@rbxts/react-roblox` inside the package and precompiling the wrapper against it.** Rejected: produces a second React module instance at runtime, breaking hooks/elements as described above.
- **Requiring consumers to build the plugin themselves via `rojo`/`rbxtsc`.** Rejected: adds a `rojo` dependency and a build step to every consumer's machine for an artifact that's identical across all of them; a prebuilt binary is strictly simpler and removes an entire toolchain requirement.
- **Auto-installing the Studio plugin via a `postinstall` npm lifecycle script.** Rejected: silently modifying files outside `node_modules` (Studio's plugins folder) on every `npm install` is exactly the kind of side effect the npm ecosystem has moved away from; many CI/sandboxed installs also run with `--ignore-scripts`, which would make the feature silently no-op in those environments. An explicit, re-runnable `install-plugin` subcommand is transparent and auditable instead.
- **Letting protocol mismatches surface as a generic connection timeout.** Rejected: indistinguishable from "Studio isn't running" or "HTTP requests disabled" failures a consumer would otherwise see, and far harder to diagnose than a named version check. The session manifest carries an explicit protocol version so the CLI can fail fast with a specific, actionable message.
- **Supporting multiple incompatible major versions of `@rbxts/react` at once (e.g. by shipping multiple prebuilt wrapper variants).** Rejected for v1 as unnecessary complexity; a single supported peer range keeps the compiled-fresh-per-project approach simple, and can be revisited if real consumer demand appears.

## Open questions carried into the implementation plan

- Exact mechanism for locating "Roblox Studio's local plugins folder" from an arbitrary consumer machine — this repository's existing `install`/`build:plugin` path already resolves this for local development (see `001-http-ui-screenshot`); `install-plugin` reuses that logic rather than re-deriving it.
- Exact peer-dependency version range for `@rbxts/react`/`@rbxts/react-roblox` — to be pinned against whatever version this repository's own `package.json` currently uses, then widened deliberately if compatibility is confirmed.
