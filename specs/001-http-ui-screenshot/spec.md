# Feature Specification: React Component Screenshot Workflow

**Feature Branch**: `001-http-ui-screenshot`
**Created**: 2026-08-06
**Status**: Draft

## Workflow

1. The user installs and runs the Screenshot Plugin in Roblox Studio.
2. The user runs `npm run screenshot <componentPath>` and may provide component props as JSON.
3. Node validates the TSX module and props, generates a temporary wrapper, compiles the React component into an `.rbxm`, and wraps the rendered component in a `ScreenGui` plus a rectangular bright-purple marker frame.
4. Node opens a loopback listener that serves the capture session and compiled model.
5. The plugin detects the listener, downloads the model, and loads its temporary root object into `StarterGui`.
6. After the `ScreenGui` has loaded and rendered, the plugin notifies Node that it is ready.
7. Node finds the Roblox Studio window and captures the entire window using the Win32 approach demonstrated by `reference/screenshot-studio.mjs`.
8. After saving the raw window capture, Node marks the session `done`.
9. The plugin observes `done` through the listener and destroys the temporary object it added to `StarterGui`.
10. Node detects the bright-purple rectangle in the raw screenshot and writes a final PNG containing every pixel inside the border while excluding the border itself.
11. Node closes the listener, removes temporary build artifacts, and exits.

## User Scenarios and Testing

### Scenario 1 - Capture a Component (Priority: P1)

A developer captures a React component directly from its TSX source path.

**Command**:

```powershell
npm run screenshot /src/components/Button.tsx
```

**Acceptance Criteria**:

1. Given the plugin is running, when the command receives a valid component path, then Node compiles and serves a temporary `.rbxm` containing the component and marker frame.
2. Given the plugin detects the session, when it downloads the model, then it loads exactly one temporary root into `StarterGui`.
3. Given the temporary `ScreenGui` is rendered, when the plugin reports readiness, then Node captures the Roblox Studio window.
4. Given the raw screenshot contains one valid marker rectangle, when extraction completes, then the final PNG contains only pixels inside that rectangle and none of the purple border.
5. Given Node marks the session done, when the plugin next polls, then it destroys the temporary `StarterGui` object.

### Scenario 2 - Render with Props (Priority: P1)

The command accepts a JSON object whose values are passed to the component during rendering.

```powershell
npm run screenshot /src/components/Button.tsx --props '{"text":"Save","disabled":false}'
```

An omitted `--props` option is equivalent to `{}`. Invalid JSON or a non-object JSON value fails before compilation and opens no capture session.

### Scenario 3 - Start Studio When Needed (Priority: P1)

If no usable `RobloxStudioBeta` window exists, Node locates the newest installed Studio executable, launches it with a new Baseplate place, and waits for the editor window to become ready before continuing. If Studio is already open, Node uses that window and does not launch another instance.

### Scenario 4 - Recover Cleanly from Failure (Priority: P2)

Compilation, transfer, loading, readiness, capture, marker detection, and cleanup failures produce actionable errors. If the plugin loaded a temporary object, it removes that object after a terminal success, failure, cancellation, or timeout.

## Functional Requirements

- **FR-001**: The package MUST provide `npm run screenshot <componentPath> [--props <json-object>]`.
- **FR-002**: Node MUST interpret a leading `/` in the component path as relative to the repository root, resolve other relative paths from the working directory, and reject missing files or files outside the allowed project workspace.
- **FR-003**: Node MUST accept props as a JSON object and pass them to the selected React component.
- **FR-004**: The TSX module MUST provide a default component export. Compilation MUST report a clear error when it does not.
- **FR-005**: Node MUST generate an isolated entry module that mounts the component with the supplied props.
- **FR-006**: Node MUST compile the entry and its dependencies into a temporary `.rbxm` model.
- **FR-007**: The model MUST contain one temporary root, a `ScreenGui`, the rendered component, and a rectangular marker frame surrounding the exact desired output region.
- **FR-008**: The marker MUST be a continuous 4-pixel `#FF00FF` (`RGB(255, 0, 255)`) rectangular border.
- **FR-009**: Node MUST bind the session listener only to `127.0.0.1` and MUST serve only one active capture session.
- **FR-010**: The plugin MUST discover the listener through bounded polling without user-created credentials or configuration.
- **FR-011**: The plugin MUST download the session's `.rbxm` and load its temporary root into `StarterGui`.
- **FR-012**: The plugin MUST notify Node only after the `ScreenGui` and marker frame are present and at least one render cycle has completed.
- **FR-013**: Node MUST locate an existing Roblox Studio window or launch Studio with a new Baseplate place when none exists.
- **FR-014**: Node MUST capture the complete Studio window using the Win32 window-capture method represented in `reference/screenshot-studio.mjs`.
- **FR-015**: Node MUST persist the raw window screenshot before setting the session status to `done`.
- **FR-016**: The plugin MUST poll session status and destroy the temporary `StarterGui` root after observing `done` or another terminal state.
- **FR-017**: Node MUST locate exactly one valid rectangular marker in the raw screenshot.
- **FR-018**: The final PNG MUST contain the pixels bounded by the marker's inner edges and MUST exclude every marker pixel.
- **FR-019**: Marker detection MUST tolerate documented capture/color variation while rejecting ambiguous, incomplete, or non-rectangular matches.
- **FR-020**: Node MUST write the final PNG only after successful extraction and report its path and dimensions.
- **FR-021**: Node MUST close the listener and remove temporary generated source, build output, model, and raw screenshot files in a `finally`-equivalent cleanup path.
- **FR-022**: The listener MUST expose enough state for the plugin to distinguish waiting, model available, loaded, ready, capturing, done, failed, and expired sessions.
- **FR-023**: Every plugin request MUST include the active session ID; stale or unknown sessions MUST be rejected.
- **FR-024**: Capture and cleanup operations MUST have bounded timeouts and return actionable failures.
- **FR-025**: Plugin activity MUST be shown in its bounded dock-window log and MUST NOT use Studio `print` or `warn` calls.

## Success Criteria

- **SC-001**: A valid local component produces a final PNG without manual transfer or cropping.
- **SC-002**: The final PNG contains no marker-border pixels.
- **SC-003**: Supplied props are visibly reflected in the rendered component.
- **SC-004**: No temporary `StarterGui` object remains after any terminal path, including timeout and capture failure.
- **SC-005**: When Studio is absent, the workflow launches it and reaches readiness within 90 seconds on a supported installation.
- **SC-006**: Invalid component paths and props fail before any temporary object is loaded into Studio.

## Assumptions

- The workflow targets Windows because Studio discovery and capture use Win32 APIs.
- Roblox Studio HTTP requests are enabled and the Screenshot Plugin is installed.
- Input modules are roblox-ts React TSX files with a default component export.
- Props must be JSON-serializable; functions, Roblox instances, and cyclic values are unsupported.
- The active project has the dependencies needed to compile the component.
- Only one Studio window and one capture session are selected at a time.
- The final output defaults to the component filename with a `.png` extension in the current directory.
