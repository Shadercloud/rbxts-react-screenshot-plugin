# Quickstart Validation Guide

## Prerequisites

- Windows with Roblox Studio installed
- Screenshot Plugin installed and enabled in Studio
- Studio HTTP requests enabled
- Node.js and repository dependencies installed
- A roblox-ts React TSX module with a default component export

## Capture without props

```powershell
npm install
npm run build:plugin
npm run screenshot /src/components/Button.tsx
```

If Studio is closed, the command launches it with a Baseplate and waits for the editor. The plugin discovers the temporary listener, downloads the model, loads it into `StarterGui`, and reports readiness. Node captures Studio, the plugin removes the temporary GUI, and Node writes `Button.png` containing only the region inside the purple marker.

## Capture with props

Props can be given as one JSON object (`--props`, `--props-file`, or the
`SCREENSHOT_PROPS` environment variable), or as individual flags per prop
(`--text "Save" --disabled false`, with `true`/`false`/numbers/`null`
auto-coerced). Pick one style; they're mutually exclusive.

**On Windows, use the `SCREENSHOT_PROPS` environment variable for any prop
value that contains a space, so it works through `npm run screenshot`
itself:**

```powershell
$env:SCREENSHOT_PROPS = '{"text":"Save changes","disabled":false}'
npm run screenshot /src/components/Button.tsx
```

This is not a PowerShell-quoting question - it's that `npm run <script> --
<args>` on Windows always executes through `cmd.exe` regardless of which
shell you typed the command in, and npm's own reconstruction of the
forwarded arguments mangles anything with an embedded space (confirmed by
hand: values get split apart, or gain stray `^` characters, depending on the
props style used). Environment variables are never re-parsed this way, so
`SCREENSHOT_PROPS` survives the full `npm run screenshot` chain intact -
confirmed against a real Studio capture. `npm run screenshot <componentPath>`
with no extra flags and no `SCREENSHOT_PROPS` set is unaffected and fine to
use as-is.

If you'd rather skip `npm run screenshot` entirely, calling the compiled CLI
directly also works for any props style, since it's a single hop with no
second round of argument parsing:

```powershell
npm run build:bridge
node dist/src/bridge/screenshot-cli.js /src/components/Button.tsx --text "Save changes" --disabled false
```

For props too large to type inline, use a file instead (also tolerates the
UTF-8 byte-order mark that PowerShell's `Out-File -Encoding utf8` writes by
default, which `JSON.parse` would otherwise reject):

```powershell
'{"text":"Save changes","disabled":false}' | Out-File props.json -Encoding utf8 -NoNewline
node dist/src/bridge/screenshot-cli.js /src/components/Button.tsx --props-file props.json
```

## Expected plugin activity

The dock window should show session discovery, model download, `StarterGui` insertion, readiness acknowledgement, capture wait, terminal status, and temporary-root removal. Hiding the window does not disable polling.

## Validation Cases

1. Capture a component with no required props and verify the output dimensions match the marker interior.
2. Capture the same component with visibly different props and verify the output reflects them.
3. Close Studio before running the command and verify a Baseplate opens automatically.
4. Verify no bright-purple marker pixels occur on any edge of the final PNG.
5. Force marker detection to fail and verify the plugin still removes the temporary root.
6. Supply invalid JSON and verify compilation, listener creation, and Studio mutation do not occur.

## Troubleshooting

| Symptom | Likely cause | Expected behavior |
|---|---|---|
| Component not found | Incorrect path or workspace escape | Command fails before listener startup |
| Props rejected | Invalid JSON or non-object value | Command reports the parsing error |
| Plugin never connects | HTTP disabled or plugin inactive | Command times out and cleans Node artifacts |
| Model fails to load | Invalid model or plugin import failure | Plugin reports failure and removes partial state |
| Studio not found | Installation cannot be located | Command reports searched installation location |
| Marker not found | GUI not visible or capture incomplete | No final PNG is written; all temporary state is cleaned |
| Multiple markers found | Component includes the reserved marker color pattern | Extraction fails as ambiguous rather than cropping the wrong region |
