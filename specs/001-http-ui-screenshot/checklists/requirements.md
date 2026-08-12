# Specification Quality Checklist: React Component Screenshot Workflow

## Workflow Coverage

- [x] CLI component path and JSON props are defined.
- [x] Temporary TSX entry, `ScreenGui`, marker frame, and `.rbxm` build are defined.
- [x] Listener discovery, model transfer, load acknowledgement, and readiness acknowledgement are defined.
- [x] Existing Studio-window selection and automatic Baseplate launch are defined.
- [x] Full-window capture follows the supplied reference script's Win32 behavior.
- [x] `done` is set only after the raw screenshot is persisted.
- [x] Plugin cleanup follows every terminal session state.
- [x] Final extraction uses the marker's inner edges and excludes the border.

## Requirement Quality

- [x] Lifecycle states and ownership are explicit.
- [x] Props restrictions and module export expectations are explicit.
- [x] Failure, timeout, ambiguity, and cleanup behavior are testable.
- [x] Temporary filesystem and Studio-instance ownership are bounded.
- [x] The listener is loopback-only and single-session.
- [x] Success criteria cover props, cropping, launch, and cleanup.

## Scope

- [x] This update changes documentation only.
- [x] No code implementation is implied as complete.
- [x] The workflow remains Windows-specific because it relies on Win32 capture.
