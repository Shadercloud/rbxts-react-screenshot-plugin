# Feature Specification: npm Package Distribution for the Screenshot Tool

**Feature Branch**: `002-package-screenshot-tool`
**Created**: 2026-08-08
**Status**: Draft

## Workflow

1. A developer with their own roblox-ts project installs `@rbxts/react-screenshot-plugin` as a dev dependency.
2. The developer runs a one-time `install-plugin` command from the package. It copies the package's prebuilt Studio plugin binary into Roblox Studio's local plugins folder — no `rojo` or build step required on the developer's machine.
3. The developer adds a `screenshot` script to their own `package.json` that invokes the package's CLI.
4. The developer runs `npm run screenshot <componentPath> [props...]` from their own project.
5. Node resolves `<componentPath>` and all compiler configuration (tsconfig, node_modules) against the developer's own project, not this repository.
6. Node stages a temporary roblox-ts project combining the package's shipped marker/bootstrap source with the developer's target component, and symlinks the developer's own `node_modules` into it so the wrapper compiles against the developer's own `@rbxts/react`/`@rbxts/react-roblox`, not a copy bundled in the package.
7. Node compiles the staged project with the developer's own `rbxtsc`, producing a temporary `.rbxm`, and everything downstream (session listener, plugin discovery, Studio launch, capture, marker crop, cleanup) proceeds exactly as in the existing local workflow (spec `001-http-ui-screenshot`).
8. If the installed Studio plugin's protocol version doesn't match what the CLI expects, the CLI reports a clear error directing the developer to re-run `install-plugin`, rather than hanging or failing ambiguously.

## User Scenarios and Testing

### Scenario 1 - Install and Capture From an External Project (Priority: P1)

A developer with their own, unrelated roblox-ts project installs the package and captures one of their own components without cloning or forking this repository.

**Commands**:

```powershell
npm install --save-dev @rbxts/react-screenshot-plugin
npx react-screenshot-plugin install-plugin
# then, having added "screenshot": "react-screenshot-plugin" to package.json:
npm run screenshot /src/client/Button.tsx
```

**Acceptance Criteria**:

1. Given the package is installed as a dev dependency, when the developer runs `install-plugin`, then the Studio plugin binary is copied into Studio's local plugins folder with no `rojo` invocation and no network access beyond the initial `npm install`.
2. Given the plugin is installed and Studio is enabled for HTTP requests, when the developer runs `npm run screenshot <componentPath>`, then Node resolves the path against the developer's own project root and produces a PNG of that component, not a component from this repository.
3. Given the developer's project has its own `tsconfig.json` and `node_modules`, when Node compiles the capture payload, then it uses the developer's own roblox-ts compiler and dependency versions, not this repository's.
4. Given a fresh project that has never had a component captured before, when the full sequence (install → `install-plugin` → add script → run) completes, then no manual file copying between this repository and the developer's project is required at any step.

---

### Scenario 2 - Same React Instance Used for Wrapper and Component (Priority: P1)

The marker/`ScreenGui` wrapper that surrounds the developer's component during capture must run against the exact same React module instance as the developer's own component, or React's element/hook checks fail across instances.

**Acceptance Criteria**:

1. Given the developer's project has `@rbxts/react`/`@rbxts/react-roblox` installed at some version within the package's supported peer range, when Node compiles the wrapper and the developer's component together, then both are compiled and run against the developer's own installed copy of those packages — the published npm package does not bundle its own copy of React that could end up running as a second, distinct instance.
2. Given a component that uses hooks (e.g. `useState`), when it is captured through this workflow, then it renders correctly with no "invalid hook call" or "invalid element type" errors.

---

### Scenario 3 - Plugin Reuse Across Multiple Projects (Priority: P2)

Once `install-plugin` has been run once on a machine, every roblox-ts project on that machine that has the package installed can capture components without repeating the Studio-side install step.

**Acceptance Criteria**:

1. Given `install-plugin` has already been run once, when a second, unrelated project (also with the package installed) runs `npm run screenshot`, then it succeeds without the developer running `install-plugin` again.

---

### Scenario 4 - Protocol Version Mismatch Is Reported Clearly (Priority: P2)

A consumer upgrades the npm package without re-running `install-plugin`, leaving a stale plugin binary installed in Studio.

**Acceptance Criteria**:

1. Given the installed Studio plugin's protocol version does not match the version the CLI expects, when the developer runs `npm run screenshot`, then the command fails fast with an error that names the mismatch and instructs the developer to re-run `install-plugin`, rather than timing out waiting for a plugin that will never acknowledge the session correctly.

---

### Scenario 5 - Existing Props Methods Keep Working From an External Project (Priority: P3)

All props-passing methods already supported by the local CLI (spec `001-http-ui-screenshot`) continue to work identically once the tool is consumed as an installed package.

**Acceptance Criteria**:

1. Given an external project, when the developer uses `--props`, `--props-file`, individual `--<prop>` flags, or the `SCREENSHOT_PROPS` environment variable, then each behaves identically to the equivalent invocation against this repository's own local components.

### Edge Cases

- What happens when the developer's project has an `@rbxts/react` version outside the package's supported peer range? Compilation fails with an error naming the installed version and the supported range, before any Studio mutation.
- What happens when `install-plugin` is run on a machine that already has a plugin installed from a previous package version? The previous binary is overwritten; `install-plugin` is idempotent and safe to re-run at any time.
- What happens when `npm run screenshot` is run in a project where `install-plugin` was never run? Session discovery times out with an error directing the developer to run `install-plugin`, rather than a generic "no plugin connected" timeout.
- What happens when the target component path is given with a leading `/` (repository-root-relative, per spec `001-http-ui-screenshot`)? It resolves against the *consumer's* project root, not this repository's.
- What happens when two different projects on the same machine depend on incompatible versions of this package? Whichever project's `install-plugin` ran most recently determines the installed plugin's protocol version; a project relying on an older, now-mismatched protocol gets the Scenario 4 error, not silent misbehavior.
- What happens to this repository's own `npm run screenshot` (used for developing this package itself)? It is unaffected and continues to work exactly as specified in `001-http-ui-screenshot`.

## Requirements

### Functional Requirements

- **FR-001**: The package MUST be publishable as `@rbxts/react-screenshot-plugin` on the npm registry and installable by any external roblox-ts project as a dev dependency.
- **FR-002**: The package MUST expose a CLI entry point (`bin`) usable via `npx` or a script a consumer adds to their own `package.json`, without requiring the consumer to clone or fork this repository.
- **FR-003**: The CLI MUST provide an `install-plugin` subcommand that copies the package's prebuilt Studio plugin binary into Roblox Studio's local plugins folder, requiring no `rojo` invocation or other build step on the consumer's machine.
- **FR-004**: `install-plugin` MUST be idempotent — safe to re-run at any time, overwriting any previously installed version of the plugin.
- **FR-005**: When invoked from within an external project, the CLI MUST resolve the component path and all compiler configuration (tsconfig, node_modules) relative to that project, not this repository.
- **FR-006**: The marker/`ScreenGui` wrapper code injected around the consumer's component MUST be compiled and executed using the consumer's own installed `@rbxts/react` and `@rbxts/react-roblox` packages, not a copy bundled inside this package, so exactly one shared React module instance exists at runtime.
- **FR-007**: The package MUST declare `@rbxts/react`, `@rbxts/react-roblox`, `roblox-ts`, `@rbxts/compiler-types`, and `@rbxts/types` as peer dependencies rather than bundling its own copies.
- **FR-008**: The Studio-side plugin binary MUST remain independent of any consumer's React version, since it never imports or executes React itself, and MUST be shippable as a single prebuilt binary shared across every consumer project on a machine.
- **FR-009**: All props-passing methods supported by the local CLI (`--props`, `--props-file`, individual `--<prop>` flags, `SCREENSHOT_PROPS`) MUST continue to work identically when the tool is consumed as an installed package.
- **FR-010**: The session protocol MUST carry a protocol/package version identifier that the CLI checks against the currently installed Studio plugin, failing fast with an actionable "re-run `install-plugin`" error on mismatch.
- **FR-011**: Compilation MUST fail with a clear, actionable error naming the installed version and the supported range when a consumer's installed peer dependency versions fall outside the package's supported range.
- **FR-012**: The published package's contents MUST exclude this repository's own development-only files (`specs/`, `tests/`, `reference/`, CI config, etc.) — only the compiled CLI, the marker/bootstrap source needed for per-project compilation, and the prebuilt plugin binary ship.
- **FR-013**: This repository's own local `npm run screenshot` workflow (spec `001-http-ui-screenshot`) MUST continue to work unchanged, since it is how this package's own maintainers build and test it.
- **FR-014**: Documentation MUST describe the full external-consumer flow (install → `install-plugin` → add script → capture) distinctly from this repository's own local development workflow.

### Key Entities

- **Consumer Project**: The external roblox-ts project that installs this package as a dev dependency. Has its own `tsconfig.json`, `node_modules` (including its own `@rbxts/react`/`@rbxts/react-roblox`), and component source tree, all of which the CLI must resolve against instead of this repository's.
- **Installed Studio Plugin**: The machine-level, prebuilt plugin binary shared across every consumer project on that machine. Tagged with a protocol version that the CLI checks before starting a capture session.
- **Marker/Bootstrap Source**: The portion of this package shipped as raw roblox-ts source rather than precompiled output, so it can be compiled fresh against each consumer's own toolchain and React version on every capture run.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A developer with a fresh roblox-ts project that has never used this tool can go from `npm install` to a captured PNG of their own component using only the documented steps (install, `install-plugin`, add script, run) with zero manual file copying between repositories.
- **SC-002**: Components using React hooks render correctly when captured from an external project, with no cross-React-instance errors.
- **SC-003**: Running `install-plugin` once on a machine lets any number of separate consumer projects on that machine capture screenshots without repeating the Studio-side setup.
- **SC-004**: Re-running `install-plugin` after a package upgrade resolves any previous protocol-version mismatch error.
- **SC-005**: No development-only files from this repository (tests, specs, CI config) appear in the published npm package tarball or in a consumer's generated `.rbxm`.

## Assumptions

- Consumers target Windows-based Roblox Studio, the same platform assumption as `001-http-ui-screenshot`.
- Consumers are themselves building a roblox-ts React project and therefore already have `roblox-ts`, `@rbxts/react`, and `@rbxts/react-roblox` installed at some version.
- This repository's own `npm run screenshot` continues to serve as the local development/testing path for this package itself and is not replaced by this feature.
- Publishing to the public npm registry is in scope for this spec; `npm publish` credentials and release-automation CI are out of scope.
- The prebuilt plugin binary is rebuilt and re-published whenever `src/plugin.server.ts` or `src/server/session-client.ts` changes, as part of this repository's own release process.
- A single supported peer-dependency version range is sufficient for v1; supporting multiple incompatible major versions of `@rbxts/react` simultaneously is out of scope.
