# Research Decisions: React Component Screenshot Workflow

## Component input and props

The command accepts a `.tsx` path and an optional `--props` JSON object. A generated entry imports the module's default export and mounts it with those props. JSON establishes a deterministic CLI boundary and intentionally excludes functions, instances, and cyclic data.

## Temporary model build

Node creates an isolated temporary build workspace that reuses the repository's roblox-ts and React dependencies. The generated entry mounts the component inside a `ScreenGui` and a marker wrapper, then packages the result as `.rbxm`. Temporary source and output do not enter the repository's generated `out/` tree.

## Marker design

The wrapper draws one axis-aligned, continuous, uniform 4-pixel `#FF00FF` (`RGB(255, 0, 255)`) rectangle around the desired content. Detection uses a per-channel tolerance of 8 because desktop capture can alter colors slightly. The detector must find four connected sides forming one rectangle; multiple candidates, missing sides, or implausible dimensions are errors.

The crop rectangle begins one pixel after the detected inner edge on every side. Therefore the final PNG includes everything enclosed by the marker and excludes the marker itself.

## Session protocol

A command creates one loopback session. The plugin polls `/session`, downloads the model, inserts it into `StarterGui`, and posts ordered `loaded` and `ready` acknowledgements. Node begins desktop capture only after `ready`. The plugin then polls session status until a terminal result.

`done` is deliberately defined as “raw Studio-window PNG persisted.” This lets the plugin remove the temporary GUI immediately without changing pixels that Node still needs. Cropping occurs from the saved image.

## Studio discovery and launch

Node first searches for a `RobloxStudioBeta` process with a nonzero main window handle. If none exists, it locates the newest installed executable under the user's Roblox versions directory and launches Studio with a temporary startup script that opens a Baseplate, following `reference/screenshot-studio.mjs`. It waits for both a window handle and an additional editor-initialization interval.

## Window capture

Capture uses the Win32 sequence in the reference script: obtain window bounds and DC, create a compatible bitmap, call `PrintWindow`, save PNG, and release every GDI resource in cleanup blocks. Capture targets the Studio window rather than the entire desktop.

## Cleanup ownership

The plugin owns the temporary `StarterGui` instance and removes it on `done`, `failed`, or `expired`. Node owns the listener, generated entry, build directory, `.rbxm`, and raw screenshot. Each side uses the session ID and unique root name to avoid deleting unrelated resources.

## Rejected approaches

- Capturing through a Studio screenshot API would not follow the required desktop-window workflow.
- Reparenting an existing project instance would mutate user state.
- Cropping by configured coordinates would be brittle across window size and layout changes.
- Marking the session done before the raw PNG is saved would create a cleanup race.
