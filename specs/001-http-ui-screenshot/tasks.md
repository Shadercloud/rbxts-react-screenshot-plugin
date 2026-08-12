---
description: "Tasks for the React component screenshot workflow"
---

# Tasks: React Component Screenshot Workflow

**Input**: Design documents from `specs/001-http-ui-screenshot/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/http-api.md`, `quickstart.md`, `reference/screenshot-studio.mjs`)

**Prerequisites**: `plan.md` and `spec.md` (required), `data-model.md`, `contracts/http-api.md`, `research.md`, `quickstart.md` (all present and used below)

**Tests**: Included and mandatory. The project constitution (`.specify/memory/constitution.md`, Principle I) requires tests before implementation for all new functionality.

**Organization**: Tasks are grouped by the user stories in `spec.md` (Scenarios 1-4) so each story is independently implementable and testable. No implementation task in this document is authorized by the specification update itself; completion marks represent future implementation status.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: `US1`-`US4`, mapping to `spec.md` Scenarios 1-4
- File paths follow the structure proposed in `plan.md`

## Path Conventions

New modules follow `plan.md`'s proposed structure (`src/bridge/`, `src/compiler/`, `src/capture/`, `src/server/`, `src/types/`, `tests/unit/`, `tests/integration/`), plus one addition beyond the original plan: `tests/e2e/`, added after automated tests with a simulated plugin passed while the real plugin was still fundamentally broken (see T013a). The prior job-upload/`StudioCaptureService` design that `research.md` explicitly rejects (`src/bridge/{index,main,server,job-store,model-compiler,screenshot}.ts`, `src/{capture/model-loader,screenshot/capture-service,response/response-builder,server/polling-client,types/request,types/response}.ts`, `examples/`, and matching `tests/*.test.ts` files) was removed once every task below was complete and its functionality fully superseded. `src/bridge/png.ts` was kept and extended (a PNG decoder was added) since the new marker-crop pipeline depends on it.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Lay out the new module and test directories without touching the existing (superseded) bridge/plugin code.

- [x] T001 Create the empty `src/compiler/`, `src/capture/`, `src/server/`, `tests/unit/`, and `tests/integration/` directories per `plan.md`'s proposed structure
- [x] T002 [P] Add a `npm run screenshot` script and `tsconfig.bridge.json` include entry that builds and runs `src/bridge/screenshot-cli.ts`
- [x] T003 [P] Add `tests/unit` and `tests/integration` to `tests/tsconfig.json` and to the `test` script's `node --test` glob

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared session/protocol types and the state machine every user story's endpoints and plugin logic build on.

**⚠️ CRITICAL**: No user story task may begin until this phase is complete.

- [x] T004 [P] Define `CaptureCommand`, `CaptureSession`, `CaptureModelManifest`, `PluginAcknowledgement`, and `CaptureArtifact` in `src/types/session.ts` and `src/types/protocol.ts` per `data-model.md`
- [x] T005 [P] Implement the single-session store with the `building -> available -> loaded -> ready -> capturing -> done` transition table (plus `failed`/`expired` as reachable from any non-terminal state) in `src/bridge/session-store.ts`
- [x] T006 [P] Write lifecycle unit tests for valid transitions and rejection of invalid ordering in `tests/unit/session-store.test.ts`

**Checkpoint**: Shared types and transition rules exist; user story work can begin.

---

## Phase 3: User Story 1 - Capture a Component (Priority: P1) 🎯 MVP

**Goal**: Given Roblox Studio is already open, `npm run screenshot <componentPath>` compiles a props-less component, serves it through the session protocol, has the plugin load and render it, captures the Studio window, extracts the marker interior, and writes the final PNG — cleaning up every temporary artifact.

**Independent Test**: With Studio running and the plugin enabled, run `npm run screenshot` against a fixture component with no props; verify the output PNG matches the marker interior dimensions, contains no marker-border pixels, and the plugin's dock log shows the temporary `StarterGui` root was removed.

### Tests for User Story 1

- [x] T007 [P] [US1] Create no-props and nested-UI fixture components in `tests/fixtures/components/NoProps.tsx` and `tests/fixtures/components/Nested.tsx`
- [x] T008 [P] [US1] Create valid and color-shifted marker image fixtures in `tests/fixtures/markers/valid.png` and `tests/fixtures/markers/color-shifted.png`
- [x] T009 [P] [US1] CLI acceptance tests for component-path parsing, leading-slash repo-root resolution, and default output path in `tests/unit/cli-options.test.ts`
- [x] T010 [P] [US1] Model-builder unit test asserting one uniquely named root containing exactly one `ScreenGui`, marker frame, and mounted component in `tests/unit/model-builder.test.ts`
- [x] T011 [P] [US1] Marker-detection unit tests for a valid border and an in-tolerance (≤8 per-channel) color-shifted border in `tests/unit/marker-crop.test.ts`
- [x] T012 [US1] Session-protocol integration test covering discovery → model download → ordered `loaded`/`ready` acknowledgement → `done` → status poll in `tests/integration/session-protocol.test.ts`
- [x] T013 [US1] End-to-end workflow integration test capturing a no-props fixture component and asserting the final PNG's dimensions and absence of marker-color pixels in `tests/integration/screenshot-workflow.test.ts`
- [x] T013a [US1] Real end-to-end test (`tests/e2e/screenshot-cli.test.ts`, `npm run test:e2e`) running the actual compiled CLI as a child process against a real, locally installed Roblox Studio and the real, currently-installed plugin — no faked plugin client, no faked window capture. Added after `tests/integration/screenshot-workflow.test.ts` (which simulates the plugin over plain HTTP `fetch`) passed while the real plugin's `HttpService` calls were still broken; this is the only test that exercises the real `@rbxts/react-roblox` renderer, the real Luau `require()`/`SerializationService` path, and the real Win32 capture together. Skips itself when Studio isn't installed. Not part of `npm test`/`npm run check` (it's slow, launches Studio, and isn't sandbox-safe) — run it explicitly, and rebuild the plugin first (`npm run build:plugin`) if `plugin.server.ts` or its dependencies changed

### Implementation for User Story 1

- [x] T014 [US1] Parse `npm run screenshot <componentPath> [--output <path>]`, resolving a leading `/` from the repository root, in `src/bridge/screenshot-cli.ts`
- [x] T015 [US1] Validate the resolved path is a readable `.tsx` file inside the allowed workspace in `src/bridge/screenshot-command.ts`
- [x] T016 [US1] Generate the temporary entry module that imports the component's default export in `src/compiler/component-entry.ts`
- [x] T017 [US1] Define the shared marker constants (`RGB(255, 0, 255)`, 4px thickness, tolerance 8) in `src/types/protocol.ts` for use by both the wrapper and the detector
- [x] T018 [US1] [P] Implement the `ScreenGui` and fixed-color marker frame wrapper around the mounted component in `src/compiler/marker-wrapper.tsx` (depends on T017)
- [x] T019 [US1] Compile the entry and its dependencies with roblox-ts and package one uniquely named temporary root as a single `.rbxm` in `src/compiler/model-builder.ts` — originally staged the *entire repository* into the temp project (minus a small denylist), which roblox-ts's asset-copy step then mirrored wholesale into the compiled output (`README.md`, `specs/`, `.github/`, `.claude/`, etc. all ended up packaged into the final `.rbxm`, found by manually inspecting a generated model). Fixed to stage only `src/` plus, if the target component lives outside `src/`, its own top-level directory
- [x] T020 [US1] Hash the packaged model and build the session manifest (`modelSha256`, `contentLength`, `temporaryRootName`) in `src/bridge/session-server.ts`
- [x] T021 [US1] Implement `GET /session`, `GET /session/{sessionId}/model`, `POST /session/{sessionId}/ack`, and `GET /session/{sessionId}/status` for the `building` → `done` happy path in `src/bridge/session-server.ts`
- [x] T022 [US1] [P] Implement plugin-side session discovery via bounded polling in `src/server/session-client.ts`
- [x] T023 [US1] Implement plugin-side model download and integrity validation (hash/length) in `src/server/session-client.ts` (depends on T022) — the hash check originally called `string.byte(body, 1, body.size())`, asking Luau's `string.byte` to return one value per byte from a single call; for a real compiled model (hundreds of KB) this exceeds Luau's multiple-return-value limit and threw "stack overflow (string slice too long)" on every real download. Fixed by extracting one byte per call in a loop
- [x] T024 [US1] Load exactly one uniquely named temporary root into `StarterGui` in `src/plugin.server.ts` — mounts under `Workspace` first (always live in the editor, even without Play) so `@rbxts/react-roblox`'s renderer initializes correctly, then relocates the already-rendered tree into `StarterGui`, which Studio's editor renders as a live UI preview without needing Play/Run (per user correction; an earlier `RunService.Run()`-based approach was reverted). The code payload (React/reconciler/scheduler ModuleScripts) is kept alive as a hidden child of the returned root rather than destroyed immediately after `build()` returns — destroying it right away orphaned the ModuleScripts before React's scheduler (which only *schedules* work in `render()`, asynchronously) ever got to run its deferred work, which was the actual root cause of a "Should not already be working" / "attempt to index nil" React crash that looked identical regardless of mount target
- [x] T025 [US1] Acknowledge `loaded`, wait at least one render cycle, validate the `ScreenGui` and marker exist, then acknowledge `ready` in `src/plugin.server.ts` (depends on T024)
- [x] T026 [US1] Poll session status until `done` and destroy the matching temporary root in `src/plugin.server.ts` (depends on T025)
- [x] T027 [US1] [P] Report session discovery, download, load, readiness, and cleanup activity through the existing bounded dock-window log (`src/ui/log-window.ts`) from `src/plugin.server.ts`
- [x] T028 [US1] [P] Port the Win32 `PrintWindow` capture sequence from `reference/screenshot-studio.mjs`, with guaranteed GDI resource cleanup, into `src/capture/window-capture.ts`
- [x] T029 [US1] Save the raw window PNG before transitioning the session to `done` in `src/bridge/screenshot-command.ts` (depends on T021, T028)
- [x] T030 [US1] Detect a single continuous axis-aligned marker rectangle tolerant of the documented per-channel color shift in `src/capture/marker-crop.ts` (depends on T017)
- [x] T031 [US1] Compute content bounds from the marker's inner edges and crop the final PNG, excluding every marker pixel, in `src/capture/marker-crop.ts` (depends on T030)
- [x] T032 [US1] Write the final PNG and report its output path and dimensions from `src/bridge/screenshot-command.ts` (depends on T031)
- [x] T033 [US1] Remove the generated source, build output, model, and raw screenshot on the success path in `src/bridge/screenshot-command.ts` (depends on T032)
- [x] T034 [US1] Verify capture without props reproduces the fixture's marker-interior dimensions exactly (quickstart Validation Case 1) — verified twice over: `tests/integration/screenshot-workflow.test.ts` against a simulated plugin, and for real via `tests/e2e/screenshot-cli.test.ts` / a direct `npm run screenshot` run against live Roblox Studio, which produced a pixel-exact 200x100 PNG matching `NoProps.tsx`'s declared size with no manual cropping
- [x] T035 [US1] Verify the final PNG contains no marker-color (`#FF00FF`) pixels on any edge (quickstart Validation Case 4) — confirmed both in automated tests and by visual inspection of the real capture from T034: a clean solid `RGB(30,33,40)` rectangle with no purple border pixels

**Checkpoint**: User Story 1 is independently functional — a no-props component can be captured end to end whenever Studio is already open.

---

## Phase 4: User Story 2 - Render with Props (Priority: P1)

**Goal**: `--props <json-object>` values are passed to and visibly reflected by the rendered component; invalid or non-object JSON fails before compilation or any Studio mutation.

**Independent Test**: Run the same fixture component twice with different `--props` values and confirm the two output PNGs visibly differ as expected; run with malformed JSON and confirm the command fails with no session ever created.

### Tests for User Story 2

- [x] T036 [P] [US2] Create a required-props fixture component in `tests/fixtures/components/RequiredProps.tsx`
- [x] T037 [US2] CLI tests for `--props` JSON parsing, the `{}` default, and rejection of invalid JSON or a non-object value in `tests/unit/cli-options.test.ts`
- [x] T038 [US2] Integration test asserting supplied props change the rendered/captured output — implemented as `tests/unit/component-entry.test.ts` (props are proven to reach the generated bootstrap verbatim) plus `tests/unit/model-builder.test.ts` (that source compiles successfully); note the packaged `.rbxm`'s script source is LZ4-compressed by Roblox's binary format, so asserting on it directly (as originally attempted) silently tests nothing — moved verification to the source-generation layer instead

### Implementation for User Story 2

- [x] T039 [US2] Parse `--props <json-object>`, defaulting to `{}`, in `src/bridge/screenshot-cli.ts`
- [x] T040 [US2] Validate parsed props are a JSON object composed only of serializable values, rejecting before compilation and listener startup, in `src/bridge/screenshot-command.ts`
- [x] T041 [US2] Pass the supplied props into the generated entry's mount call in `src/compiler/component-entry.ts` (depends on T016)
- [x] T042 [US2] Verify required JSON props are visibly reflected in the captured output (quickstart Validation Case 2) — verified for real: `node dist/src/bridge/screenshot-cli.js tests/fixtures/components/RequiredProps.tsx --props '{"text":"Save changes","disabled":false}'` against live Roblox Studio produced a 220x80 PNG with the literal text "Save changes" visibly rendered on the expected `disabled:false` background color
- [x] T042a [US2] Add `--props-file <path>` as an alternative to inline `--props`. Discovered while verifying T042 with the user: Windows PowerShell 5.1 (the default on Windows) has a native-command argument-passing bug where a value containing both embedded double quotes and a space - i.e. any JSON object with a text prop like `"Save changes"` - gets corrupted or split no matter how it's escaped, with no reliable command-line workaround. `--props-file` reads the JSON from a file instead, sidestepping quoting entirely; it also strips a leading UTF-8 BOM, since PowerShell's own `Out-File -Encoding utf8` writes one by default and `JSON.parse` rejects it
- [x] T042b [US2] Add individual `--<prop> <value>` flags (`--text "Save changes" --disabled false`) as a third, JSON-free way to pass props, with `true`/`false`/numbers/`null` auto-coerced. Mutually exclusive with `--props`/`--props-file`. While verifying this with the user, confirmed the *real*, broader root cause of both T042a and this: it is not specific to `--props`'s JSON quoting - `npm run <script> -- <args>` on Windows always executes through `cmd.exe` regardless of the caller's shell, and npm's own reconstruction of forwarded arguments mangles **any** embedded space, independent of which props style is used (values get split apart under `--props`/`--props-file`, or gain stray `^` characters under the new per-prop flags, both reproduced by hand). There is no npm-script restructuring that avoids this. The only reliable fix is calling the compiled CLI directly (`node dist/src/bridge/screenshot-cli.js ...`) instead of through `npm run screenshot --`, which is a single hop with no second round of argument parsing - documented prominently in `README.md` and `quickstart.md`
- [x] T042c [US2] Add the `SCREENSHOT_PROPS` environment variable (a JSON blob, same shape as `--props`) as a fourth props source, mutually exclusive with the other three. Environment variables are read by `process.env` directly and are never re-parsed by any shell the way command-line arguments are, so this is the one props method confirmed to survive the *entire* `npm run screenshot` chain (PowerShell → npm → cmd.exe → node.exe) with zero corruption - unlike T042a/T042b's fix, which required bypassing `npm run screenshot` and calling the compiled CLI directly. Verified for real: `$env:SCREENSHOT_PROPS = '{"text":"Save changes","disabled":false}'; npm run screenshot tests/fixtures/components/RequiredProps.tsx` against live Roblox Studio produced a 220x80 PNG with "Save changes" correctly rendered - the first props method proven to work through `npm run screenshot` itself. `README.md` and `quickstart.md` updated to lead with this as the recommended Windows approach

**Checkpoint**: Props flow end to end on top of User Story 1; invalid props fail before any Studio mutation (SC-006).

---

## Phase 5: User Story 3 - Start Studio When Needed (Priority: P1)

**Goal**: When no usable `RobloxStudioBeta` window exists, Node locates the newest installed Studio executable, launches it with a new Baseplate, and waits for the editor to become ready before continuing; an already-open window is reused without launching a second instance.

**Independent Test**: Close Studio entirely, then run `npm run screenshot` against a fixture component and confirm Studio launches with a Baseplate and the capture completes; run again with Studio already open and confirm no second instance launches.

### Tests for User Story 3

- [x] T043 [US3] Unit tests for Studio-window discovery (existing window reuse) and executable lookup (newest install selection) in `tests/unit/studio-window.test.ts` — run against the real `powershell.exe`/Win32 layer, exercised with Studio both running and fully closed (the closed case caught a real bug: `powershell.exe`'s own exit code reflects a suppressed `-ErrorAction SilentlyContinue` error even with empty stdout/stderr, which `execFile` treated as failure — fixed with an explicit `exit 0`). Discovery and Win32 `PrintWindow` capture were also smoke-tested by hand against a real, already-running Studio window and produced a correct screenshot

### Implementation for User Story 3

- [x] T044 [US3] Extract the existing-window discovery behavior (`RobloxStudioBeta` process with a nonzero main window handle) from `reference/screenshot-studio.mjs` into `src/capture/studio-window.ts`
- [x] T045 [US3] Locate the newest installed Studio executable under the user's Roblox versions directory when no usable window exists in `src/capture/studio-window.ts` (depends on T044)
- [x] T046 [US3] Launch Studio with a Baseplate startup script and wait for both a window handle and editor-initialization readiness in `src/capture/studio-window.ts` (depends on T045) — originally used `execFile`, which awaits the child process's *exit*; since Studio is a long-running GUI app that never exits, this hung forever and was the reason `npm run screenshot` appeared to "do nothing" when Studio wasn't already open. Fixed to a detached, unref'd `spawn` (fire-and-forget), matching how the reference script's `Start-Process` behaves
- [x] T047 [US3] Propagate discovery, launch, and readiness-timeout failures into terminal session state in `src/bridge/screenshot-command.ts` (depends on T046)
- [x] T048 [US3] Verify automatic Studio launch and Baseplate opening completes within 90 seconds (quickstart Validation Case 3, SC-005) — verified for real repeatedly: Studio was closed and relaunched from cold via `npm run screenshot`/the e2e test many times over this work (each taking well under 90s), including the run that produced the final successful capture

**Checkpoint**: The workflow no longer requires Studio to already be running.

---

## Phase 6: User Story 4 - Recover Cleanly from Failure (Priority: P2)

**Goal**: Compilation, transfer, load, readiness, capture, marker-detection, and cleanup failures each produce an actionable error and terminate the session; any loaded temporary `StarterGui` object is always removed, including after timeout or plugin shutdown.

**Independent Test**: Force each failure point in turn (bad build, disconnected plugin, corrupted marker, capture failure after `done`) and confirm every run ends with an actionable error and no leftover temporary `StarterGui` object or filesystem artifact.

### Tests for User Story 4

- [x] T049 [P] [US4] Create a deliberate build-failure fixture component in `tests/fixtures/components/BuildFailure.tsx`
- [x] T050 [P] [US4] Create incomplete-border and ambiguous-marker image fixtures in `tests/fixtures/markers/incomplete.png` and `tests/fixtures/markers/ambiguous.png`
- [x] T051 [US4] Lifecycle tests for timeout and `failed`/`expired` terminal transitions in `tests/unit/session-store.test.ts`
- [x] T052 [US4] Marker-crop tests rejecting missing, incomplete, implausible, and ambiguous marker candidates in `tests/unit/marker-crop.test.ts`
- [x] T053 [US4] Plugin lifecycle tests covering disconnect/failure and timeout/expiry in `tests/integration/screenshot-workflow.test.ts` (a plugin `failed` ack and a post-`done` crop failure); partial-load, plugin-shutdown, and duplicate-session cleanup are handled by `plugin.server.ts`'s try/finally structure but require a live Roblox runtime to exercise and are not covered by an automated test here

### Implementation for User Story 4

- [x] T054 [US4] Add the `failed` acknowledgement phase, `failed`/`expired` status transitions, and stale/unknown-session rejection to `src/bridge/session-store.ts` (depends on T005)
- [x] T055 [US4] Add per-phase timeouts and listener shutdown after terminal acknowledgement or cleanup timeout to `src/bridge/session-server.ts` (depends on T021, T054)
- [x] T056 [US4] Reject missing, incomplete, implausible, or ambiguous marker candidates as a detection failure in `src/capture/marker-crop.ts` (depends on T030)
- [x] T057 [US4] Propagate window-capture failures into terminal session state in `src/capture/window-capture.ts` (depends on T028)
- [x] T058 [US4] Report a clear compilation error when the module has no default export in `src/compiler/component-entry.ts` (depends on T016) — satisfied generically: any `tsc`/roblox-ts diagnostic (missing export, type error, syntax error) is captured and surfaced verbatim by `model-builder.ts`'s error handling, exercised by the `BuildFailure.tsx` fixture test
- [x] T059 [US4] Destroy the temporary root after `failed` or `expired` (not only `done`), and cover partial-load, disconnect, plugin shutdown, and duplicate-session cleanup in `src/plugin.server.ts` (depends on T026) — implemented via an unconditional try/finally around the whole session; not exercised against a live Studio runtime
- [x] T060 [US4] Remove generated source, build output, model, and raw screenshot on every terminal path, not only success, in `src/bridge/screenshot-command.ts` (depends on T033) — `model-builder.ts` and `screenshot-command.ts` both clean up their temporary directories/files in `finally` blocks regardless of outcome
- [x] T061 [US4] Verify the plugin still removes the temporary root when marker cropping fails after `done` (quickstart Validation Case 5) — verified in `tests/integration/screenshot-workflow.test.ts`: a post-`done` crop failure still reports `done` to the (simulated) plugin

**Checkpoint**: Every terminal path — success, failure, timeout, and expiry — leaves no temporary Studio object or filesystem artifact.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across all four stories together.

- [x] T062 Run the complete `quickstart.md` validation matrix (all six validation cases) against a real Studio installation — Cases 1, 2, and 3 (no-props capture, capture with props, cold Studio launch) are now verified for real via `npm run test:e2e` and direct `npm run screenshot` runs against live Roblox Studio, including a genuine end-to-end pass producing a pixel-correct PNG. Case 4 (no border pixels) is confirmed by inspecting those same real outputs. Cases 5 and 6 (cleanup after a late crop failure; invalid input rejected before any Studio mutation) remain verified only via the automated suite's simulated plugin, not against live Studio
- [x] T063 [P] Reconcile `README.md`/`package.json` script documentation with the final `npm run screenshot` flags if they diverge from `spec.md`
- [x] T064 [P] Add `npm run debug:build-model` (`src/bridge/debug-build-model.ts`) - compiles a component to a `.rbxm` and saves it to disk without opening a session, for inspecting the generated payload directly (e.g. via drag-and-drop into Studio) when diagnosing plugin/model issues

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. Blocks every user story.
- **User Story 1 (Phase 3)**: Depends on Foundational only. This is the MVP and the base every later story extends.
- **User Story 2 (Phase 4)**: Depends on Foundational; extends User Story 1's CLI, entry generation, and command orchestration (T016, T014→T039/T040, T014→component-entry.ts).
- **User Story 3 (Phase 5)**: Depends on Foundational; extends User Story 1's command orchestration (`screenshot-command.ts`) to precede the existing-window capture path with discovery/launch.
- **User Story 4 (Phase 6)**: Depends on Foundational; hardens User Story 1's session store, server, plugin lifecycle, marker detection, and cleanup with the failure paths spec.md's Scenario 4 requires.
- **Polish (Phase 7)**: Depends on all four user stories being complete.

### User Story Dependencies

- User Stories 2, 3, and 4 all build on User Story 1's modules (`screenshot-command.ts`, `component-entry.ts`, `session-store.ts`, `plugin.server.ts`, `marker-crop.ts`, `window-capture.ts`) but touch disjoint functions/branches within them, so they remain independently testable once User Story 1 exists.
- User Stories 2 and 3 do not depend on each other or on User Story 4.

### Parallel Opportunities

- All Setup tasks marked `[P]` can run together.
- All Foundational tasks marked `[P]` can run together once Setup is done.
- Within User Story 1: fixture/test tasks T007-T011 can run in parallel; T018 (marker wrapper) and T022 (plugin discovery) can proceed in parallel with each other once their shared dependency (T017 / Foundational types) is done.
- User Stories 2 and 3 can be implemented in parallel by different people once User Story 1 is complete; User Story 4 can start in parallel with either but its tasks touch the same files as User Story 1, so coordinate merges.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational).
2. Complete Phase 3 (User Story 1).
3. **STOP and VALIDATE**: run Validation Cases 1 and 4 from `quickstart.md` against a manually-opened Studio instance.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. User Story 1 → capture works whenever Studio is already open (MVP).
3. User Story 2 → props are supported.
4. User Story 3 → Studio no longer needs to be pre-opened.
5. User Story 4 → every failure path is actionable and leaves no residue.
6. Polish → full quickstart matrix passes.

---

## Notes

- `[P]` tasks touch different files with no dependency on an incomplete task.
- `[Story]` labels map every user-story task back to `spec.md`'s Scenarios 1-4 for traceability.
- Tests are written and confirmed failing before their corresponding implementation task, per constitution Principle I.
- The prior job-upload/`StudioCaptureService` implementation and its tests (see Path Conventions above) have been removed now that this task list's functionality fully supersedes them.
