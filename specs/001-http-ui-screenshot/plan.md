# Implementation Plan: React Component Screenshot Workflow

## Summary

The one-shot Node command compiles a requested React TSX component and JSON props into a temporary Roblox model. It serves that model and a session state machine on loopback. The Studio plugin inserts the model into `StarterGui`, acknowledges readiness, and waits for a terminal state. Node captures the Studio window through Win32, marks the session done, extracts the pixels inside the model's purple marker, writes the final PNG, and cleans all temporary artifacts.

## Runtime Responsibilities

### Node

- Parse component path, props, and output options.
- Generate a temporary React mounting entry and marker wrapper.
- Compile and package an `.rbxm`.
- Host the single-session loopback listener.
- Locate or launch Roblox Studio and wait for its editor window.
- Capture the complete window using `reference/screenshot-studio.mjs` as the behavioral reference.
- Detect the marker, crop to its inner edges, and write the final PNG.
- Own timeouts, terminal state, listener shutdown, and filesystem cleanup.

### Studio Plugin

- Poll for an active session.
- Download and validate the model for that session.
- Insert its unique temporary root into `StarterGui`.
- Acknowledge load and render readiness.
- Poll until `done`, `failed`, or `expired`.
- Destroy only the matching temporary root on every terminal path.
- Report bounded activity in the dock window.

## Proposed Structure

```text
src/
├── plugin.server.ts
├── bridge/
│   ├── screenshot-cli.ts
│   ├── screenshot-command.ts
│   ├── session-server.ts
│   └── session-store.ts
├── compiler/
│   ├── component-entry.ts
│   ├── model-builder.ts
│   └── marker-wrapper.tsx
├── capture/
│   ├── studio-window.ts
│   ├── window-capture.ts
│   └── marker-crop.ts
├── server/
│   └── session-client.ts
├── ui/
│   └── log-window.ts
└── types/
    ├── session.ts
    └── protocol.ts

tests/
├── unit/
│   ├── cli-options.test.ts
│   ├── session-store.test.ts
│   ├── model-builder.test.ts
│   └── marker-crop.test.ts
└── integration/
    ├── session-protocol.test.ts
    └── screenshot-workflow.test.ts
```

## Constraints

- Windows-only desktop capture.
- Listener restricted to loopback.
- One command, session, Studio window, and temporary GUI at a time.
- Generated source and build artifacts live in a temporary directory, never in checked-in source or `out/`.
- The model wrapper uses a fixed marker color and thickness shared by generation and detection.
- Source components and dependencies are compiled using the repository's roblox-ts and React configuration.
- The raw screenshot is temporary and the cropped image is the only retained artifact unless diagnostic retention is explicitly enabled later.

## Verification Strategy

Unit tests cover CLI parsing, props serialization, lifecycle transitions, marker detection, border exclusion, and cleanup selection. Integration tests cover model serving and acknowledgements. Manual Studio validation covers model insertion, render readiness, Win32 capture, and cleanup after success and failure.
