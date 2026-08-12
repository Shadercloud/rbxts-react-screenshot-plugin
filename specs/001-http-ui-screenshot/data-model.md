# Data Model: React Component Screenshot Workflow

## CaptureCommand

| Field | Type | Required | Description |
|---|---|---:|---|
| `componentPath` | `string` | Yes | Path to a TSX component; a leading `/` is repository-root-relative |
| `props` | `Record<string, JsonValue>` | No | JSON object passed to the default component export; defaults to `{}` |
| `outputPath` | `string` | No | Final PNG path; defaults from the component filename |

`componentPath` must resolve to a readable `.tsx` file within the allowed workspace. A leading `/` is resolved from the repository root; other relative paths use the command's working directory. Props must be a JSON object composed only of serializable JSON values.

## CaptureSession

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unpredictable session identifier |
| `status` | `building \| available \| loaded \| ready \| capturing \| done \| failed \| expired` | Current lifecycle state |
| `componentPath` | `string` | Canonical source path |
| `modelPath` | `string` | Temporary compiled `.rbxm` path owned by Node |
| `temporaryRootName` | `string` | Unique name used for plugin cleanup |
| `createdAt` | `string` | ISO 8601 creation time |
| `updatedAt` | `string` | ISO 8601 last transition time |
| `error` | `string` | Terminal failure detail when applicable |

Valid transitions are:

```text
building -> available -> loaded -> ready -> capturing -> done
    |           |          |         |           |
    +-----------+----------+---------+-----------+-> failed
    +-----------+----------+---------+-----------+-> expired
```

Node owns all state transitions except `loaded` and `ready`, which are acknowledgements received from the plugin. `done` means the raw Studio screenshot is safely persisted; it does not mean final image extraction has finished.

## CaptureModelManifest

| Field | Type | Description |
|---|---|---|
| `sessionId` | `string` | Owning session |
| `modelSha256` | `string` | Integrity hash of the served bytes |
| `contentLength` | `number` | Model byte length |
| `temporaryRootName` | `string` | Root the plugin inserts and later destroys |
| `markerColor` | `{ r: 255, g: 0, b: 255 }` | Fixed `#FF00FF` marker color |
| `markerThickness` | `4` | Uniform border thickness in pixels |

## TemporaryCaptureRoot

The compiled model has one uniquely named root containing a `ScreenGui`. The GUI contains a rectangular marker frame and the mounted React component entirely within the frame's inner bounds. The root carries the session ID so cleanup cannot target an unrelated instance.

## PluginAcknowledgement

| Field | Type | Description |
|---|---|---|
| `sessionId` | `string` | Active session |
| `phase` | `loaded \| ready \| failed` | Plugin-reported phase |
| `message` | `string` | Optional diagnostic detail |

`loaded` means the temporary root was inserted into `StarterGui`. `ready` means the GUI and marker exist and at least one render cycle has completed.

## CaptureArtifact

| Field | Type | Description |
|---|---|---|
| `rawPath` | `string` | Temporary full-window Studio PNG |
| `outputPath` | `string` | Final cropped PNG |
| `studioWindowBounds` | `{ x, y, width, height }` | Captured window rectangle |
| `markerOuterBounds` | `{ x, y, width, height }` | Detected border rectangle |
| `contentBounds` | `{ x, y, width, height }` | Inner rectangle written to output |

The content bounds begin immediately after the inner edge of each border side. No pixel classified as part of the marker may appear in the output.
