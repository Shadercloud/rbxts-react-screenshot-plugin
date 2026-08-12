# Implementation Plan: npm Package Distribution for the Screenshot Tool

## Summary

Today, `model-builder.ts` assumes the capture payload (marker wrapper + bootstrap entry + target component) all live inside this repository, compiled with this repository's own `tsconfig.json`, `node_modules`, and `rbxtsc`. To let an external roblox-ts project install this tool and capture its own components, the Node-side bridge needs to target an arbitrary **consumer project root** instead of `projectRoot` (this repo), while the Studio-side plugin — which never touches React — can ship as a single prebuilt binary, installed once per machine via a new `install-plugin` CLI subcommand. The published npm package therefore contains three distinct kinds of content with three different lifecycles: compiled Node CLI code (built once per package release), raw roblox-ts wrapper source (compiled fresh per capture, against the consumer's toolchain), and a prebuilt plugin binary (built once per package release, installed once per machine).

## Runtime Responsibilities

### Node CLI (published package)

- Resolve the consumer's project root from the current working directory (same `cwd`-based resolution `screenshot-cli.ts` already uses — no change needed there).
- Locate the consumer's `tsconfig.json`, `node_modules`, and `rbxtsc` binary instead of this repository's own.
- Stage a temporary project that copies in the package's own shipped wrapper/bootstrap source, plus the consumer's target component and its top-level directory (same scoped-staging approach `model-builder.ts` already uses to avoid packaging unrelated files).
- Symlink the *consumer's* `node_modules` (not this repository's) into the staged project, so `@rbxts/react`/`@rbxts/react-roblox` resolve to the consumer's own installed copy.
- Embed a protocol/package version identifier in the session manifest.
- Provide an `install-plugin` subcommand that copies the package's bundled prebuilt `.rbxm` into Roblox Studio's local plugins folder, idempotently.
- Everything else (session server, Studio discovery/launch, Win32 capture, marker crop, cleanup) is unchanged from `001-http-ui-screenshot`.

### Studio Plugin (prebuilt binary, shipped in the package)

- Unchanged behavior from `001-http-ui-screenshot`: discover a session, download and validate the model, insert/remove the temporary root, acknowledge lifecycle phases.
- New: report its own protocol version (embedded at plugin-build time) so the CLI can detect a stale installed plugin and fail with an actionable message instead of a silent timeout.

### This Repository's Own Local Workflow

- `npm run screenshot` (spec `001-http-ui-screenshot`) keeps working exactly as-is — it becomes the special case where "the consumer project" and "this repository" are the same directory, so no behavior changes for local development.

## Proposed Package Layout

```text
package.json                  # "bin", "peerDependencies", "files" allowlist added
dist/                          # compiled Node CLI (bridge/, capture/, server session-protocol helpers, types)
├── bridge/
│   ├── screenshot-cli.js      # now dispatches to `install-plugin` subcommand too
│   ├── install-plugin.js      # new: copies the bundled .rbxm into Studio's plugins folder
│   ├── screenshot-command.js
│   ├── model-builder.js       # generalized to take an external project root
│   └── ...
roblox-src/                    # new: raw .ts/.tsx wrapper source, shipped uncompiled
├── marker-wrapper.tsx
└── component-entry-template.ts
plugin/
└── ScreenshotPlugin.rbxm      # new: prebuilt binary, built from src/plugin.server.ts + src/server/session-client.ts
                                # + src/ui/log-window.ts at release time, not at consumer capture time
```

`src/plugin.server.ts`, `src/server/session-client.ts`, and `src/ui/log-window.ts` remain in this repository's own source tree (still built into `ScreenshotPlugin.rbxm` via `npm run build:plugin` for local development), but the *published* npm package ships the resulting binary directly rather than that source — consumers never compile the plugin themselves.

## Key Changes by Area

### `model-builder.ts` — generalize staging to an external project root

- Add a `consumerProjectRoot` parameter (defaults to this repository's own root for the existing local CLI path, so `001-http-ui-screenshot` behavior is unchanged).
- Replace the current "stage `src/` from `projectRoot`" step with: stage the package's own `roblox-src/` wrapper files, plus the consumer's target component and its top-level directory from `consumerProjectRoot`.
- Symlink `consumerProjectRoot/node_modules` (not this repository's) into the staged project.
- Resolve `tsconfig.json` and the `rbxtsc` binary from `consumerProjectRoot` (falling back to the package's own bundled `rbxtsc` version only if the consumer doesn't have one — TBD during implementation whether this fallback is needed or whether `roblox-ts` as a declared peer dependency makes it always present).

### `screenshot-cli.ts` — add the `install-plugin` subcommand

- Add subcommand dispatch: `react-screenshot-plugin install-plugin` vs. the existing default capture behavior (`react-screenshot-plugin <componentPath> ...`).
- `install-plugin` reuses this repository's existing Studio-plugins-folder resolution logic (currently exercised locally via `npm run build:plugin`) and copies the package's bundled `plugin/ScreenshotPlugin.rbxm` there directly — no `rojo`/`rbxtsc` invocation needed for this step.
- Idempotent: always overwrites; no diffing or version check before copying (the whole point is "make the installed plugin match this package version").

### Session protocol — protocol version field

- Add a `protocolVersion` field to the session manifest (`session-server.ts`/`types/protocol.ts`), sourced from the CLI's own package version (or a separate protocol constant, bumped only on breaking wire-format changes rather than every release).
- The plugin echoes back its own compiled-in protocol version on discovery; the CLI compares it against its own before proceeding and fails fast with a named mismatch error if they differ, per spec Scenario 4.
- The prebuilt `.rbxm` embeds its protocol version at build time (a generated constant, analogous to how the marker color/thickness constants are already shared between wrapper and detector via `types/protocol.ts`).

### `package.json` — publishing metadata

- Add `"bin": { "react-screenshot-plugin": "dist/bridge/screenshot-cli.js" }`.
- Move `@rbxts/react`, `@rbxts/react-roblox`, `roblox-ts`, `@rbxts/compiler-types`, `@rbxts/types` from `dependencies`/`devDependencies` into `peerDependencies`, with a version range matching what this repository currently pins (`@rbxts/react`/`@rbxts/react-roblox` `^17.3.7-ts.2`, `roblox-ts` `^3.0.0`) — widened later only after compatibility with other versions is confirmed.
- Add a `"files"` allowlist (`dist`, `roblox-src`, `plugin`) so the published tarball excludes this repository's own `specs/`, `tests/`, `reference/`, CI config, etc., per FR-012.
- Add a `build:release-plugin` script (or extend `build:plugin`) that produces `plugin/ScreenshotPlugin.rbxm` as a publish input, separate from the existing local-development plugin build.

## Constraints

- Windows-only, same as `001-http-ui-screenshot` — the Win32 capture path doesn't change with packaging.
- Exactly one shared React module instance per capture: the wrapper must never be compiled against a copy of React bundled in this package.
- The Studio plugin binary must remain fully generic (no React/consumer-specific compiled code), so one binary serves every consumer project on a machine.
- `install-plugin` must be safe to run repeatedly with no side effects beyond overwriting the plugin binary.
- Publishing automation (npm credentials, CI release pipeline) is out of scope for this plan; only the package's own structure and build outputs are in scope.

## Verification Strategy

- Unit tests for `model-builder.ts`'s generalized staging logic, using a throwaway fixture directory standing in for an "external consumer project" (its own `tsconfig.json`, `node_modules` symlink target, and component file) to prove staging no longer assumes `projectRoot` is this repository.
- Unit tests for protocol-version comparison logic (match, mismatch, plugin predates the field entirely).
- Unit tests for `install-plugin`'s idempotent copy behavior against a fake plugins-folder path.
- A real end-to-end test (extending the pattern of `tests/e2e/screenshot-cli.test.ts`) that packs the npm package with `npm pack`, installs the resulting tarball into a scratch roblox-ts project fixture, runs `install-plugin` and then `npm run screenshot` from within that scratch project against real Roblox Studio, and asserts a real PNG comes out — the closest possible proxy for what an actual external consumer experiences, since it exercises the real `npm pack`/`npm install` boundary rather than just calling the compiled CLI in place.
- Manual validation: capture a hooks-using component (e.g. one using `useState`) from a scratch external project to directly confirm Scenario 2 (no cross-React-instance errors) — this is the one property that's hard to catch with mocks and needs a real render.

## Open Implementation Questions

- Whether `rbxtsc` should always be resolved from the consumer's own `node_modules/.bin` (since `roblox-ts` is a declared peer dependency they must already have) or whether the package needs a fallback — leaning toward "always the consumer's," since that's also what guarantees the version-compatible compile the whole design depends on.
- Exact source of the protocol version constant (derived from `package.json` version vs. a hand-bumped wire-format constant) — leaning toward a separate constant so routine patch releases that don't touch the wire format don't force every consumer to re-run `install-plugin`.
