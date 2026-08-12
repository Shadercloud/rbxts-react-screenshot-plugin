# Loopback Session Contract

## CLI

```powershell
npm run screenshot <componentPath> [--props <json-object>] [--output <png-path>]
```

Examples:

```powershell
npm run screenshot /src/components/Button.tsx
npm run screenshot /src/components/Button.tsx --props '{"text":"Save","disabled":false}'
```

The component module must default-export a React component. A leading `/` in its path means the repository root rather than the filesystem root. Props default to `{}` and must parse as a JSON object.

The generated wrapper uses a continuous 4-pixel `#FF00FF` (`RGB(255, 0, 255)`) border. Extraction may tolerate a per-channel difference of at most 8 and crops from the detected inner edges, excluding all four border sides.

## Listener

The per-command listener binds to `127.0.0.1:1927` by default and represents one capture session. It does not expose a caller-facing screenshot POST endpoint.

### GET /session

Used by the plugin to discover work.

- `200`: session manifest and current status
- `204`: no active session

```jsonc
{
  "sessionId": "opaque-id",
  "status": "available",
  "modelUrl": "/session/opaque-id/model",
  "modelSha256": "...",
  "contentLength": 12345,
  "temporaryRootName": "ScreenshotCapture_opaque-id"
}
```

### GET /session/{sessionId}/model

Returns the compiled `.rbxm` bytes with `Content-Type: application/octet-stream`. Unknown, stale, or terminal sessions return `404` or `410`.

### POST /session/{sessionId}/ack

The plugin reports `loaded`, `ready`, or `failed`.

```json
{ "phase": "ready", "message": "ScreenGui rendered" }
```

The server validates phase order and returns `204` on acceptance or `409` for an invalid transition.

### GET /session/{sessionId}/status

The plugin polls this endpoint after readiness. A `done`, `failed`, or `expired` response is terminal and instructs the plugin to destroy the temporary root.

```json
{ "sessionId": "opaque-id", "status": "done" }
```

## Timing and Cleanup

- Plugin discovery uses bounded polling and retry.
- Model load, readiness, capture, and cleanup each have explicit timeouts.
- Node changes status to `done` only after the raw full-window PNG is saved successfully.
- The plugin removes only the root whose session attribute and unique name match the active session.
- Node may crop after setting `done`, allowing plugin cleanup and image extraction to proceed independently.
- The listener closes after terminal acknowledgement or cleanup timeout.
