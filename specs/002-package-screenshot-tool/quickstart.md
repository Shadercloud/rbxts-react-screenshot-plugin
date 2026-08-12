# Quickstart Validation Guide: Installed-Package Flow

Scoped to the external-consumer workflow this feature adds (installing `@rbxts/react-screenshot-plugin` as a dependency of *your own* roblox-ts project). For capturing components from within this repository itself, see `specs/001-http-ui-screenshot/quickstart.md` instead.

## Prerequisites

- Windows with Roblox Studio installed
- Studio HTTP requests enabled
- Your own roblox-ts project, with its own `tsconfig.json`, `node_modules` (including `@rbxts/react`/`@rbxts/react-roblox`), and a target component

## Install and capture

```powershell
npm install --save-dev @rbxts/react-screenshot-plugin
npx react-screenshot-plugin install-plugin
```

`install-plugin` is one-time, per machine - it copies the package's prebuilt `plugin/ScreenshotPlugin.rbxm` into Studio's local plugins folder. No `rojo` invocation, no build step, no network access beyond the initial `npm install`.

Add a script to your own `package.json`:

```json
{
  "scripts": {
    "screenshot": "react-screenshot-plugin"
  }
}
```

Then run it against your own component:

```powershell
npm run screenshot src/components/Button.tsx
```

Node resolves `src/components/Button.tsx` against *your* project root, compiles it with *your* installed `roblox-ts`/`@rbxts/react`, and produces `Button.png` - exactly as `001-http-ui-screenshot`'s local workflow does, just pointed at your project instead of this repository.

## Props

All four props-passing methods documented in the main `README.md` (`--props`, `--props-file`, individual `--<prop>` flags, `SCREENSHOT_PROPS`) work identically when invoked through the installed package. The same Windows argument-mangling caveat applies: prefer `SCREENSHOT_PROPS` for any prop value containing a space when going through `npm run screenshot`, or call the installed CLI directly (`node node_modules/@rbxts/react-screenshot-plugin/dist/src/bridge/screenshot-cli.js ...`) to sidestep it entirely.

## Validation Cases

1. From a project that has never installed this package before, run the full sequence (install → `install-plugin` → add script → `npm run screenshot`) and confirm no manual file copying between this repository and your project is required at any step.
2. Capture a component that uses hooks (e.g. `useState`) and confirm it renders correctly with no "invalid hook call"/"invalid element type" errors - this is the tell for a bundled copy of React running as a second instance instead of your own.
3. Run `install-plugin` once, then capture from a second, unrelated project on the same machine without running `install-plugin` again.
4. Simulate a stale installed plugin (e.g. by reverting to an older installed copy of `plugin/ScreenshotPlugin.rbxm` while running a newer CLI) and confirm the CLI fails fast with an error naming the protocol-version mismatch and instructing you to re-run `install-plugin`, rather than hanging.
5. Run `npm pack --dry-run` from this repository and confirm the tarball excludes `specs/`, `tests/`, `reference/`, and CI config - only `dist/`, `roblox-src/`, `plugin/`, `package-types/`, `package.json`, and `README.md` should be present.

## Troubleshooting

| Symptom | Likely cause | Expected behavior |
|---|---|---|
| `install-plugin` reports `%LOCALAPPDATA% is not set` | Running outside a normal Windows user session | Command fails clearly before touching the filesystem |
| `install-plugin` reports the bundled plugin is missing | A broken/incomplete package install | Command fails clearly rather than silently no-op'ing |
| Compile uses the wrong `@rbxts/react` | A bundled copy of React shadowing yours | Not expected - the staged project symlinks *your* `node_modules`; report this as a bug if seen |
| `screenshot` resolves the wrong component | Path resolved against this repository instead of your project | Not expected outside local development on this repository itself |
| CLI reports a protocol-version mismatch | Studio-side plugin predates your installed package version | Re-run `install-plugin`, then retry the capture |
