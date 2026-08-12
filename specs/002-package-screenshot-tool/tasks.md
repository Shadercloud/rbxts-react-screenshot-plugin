---
description: "Tasks for packaging the screenshot tool as an installable npm library"
---

# Tasks: npm Package Distribution for the Screenshot Tool

**Input**: Design documents from `specs/002-package-screenshot-tool/` (`plan.md`, `spec.md`, `research.md`)

**Prerequisites**: `plan.md` and `spec.md` (required), `research.md` (used below); builds on the completed `001-http-ui-screenshot` implementation, which this feature does not replace

**Tests**: Included and mandatory. The project constitution (`.specify/memory/constitution.md`, Principle I) requires tests before implementation for all new functionality.

**Organization**: Tasks are grouped by the user stories in `spec.md` (Scenarios 1-5) so each story is independently implementable and testable. No implementation task in this document is authorized by the specification update itself; completion marks represent future implementation status.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: `US1`-`US5`, mapping to `spec.md` Scenarios 1-5
- File paths follow the structure proposed in `plan.md`

## Path Conventions

This feature layers new locations onto `001-http-ui-screenshot`'s existing structure:

- `roblox-src/` (new) — raw roblox-ts wrapper source shipped uncompiled in the published package, compiled fresh against each consumer's own toolchain. `src/compiler/marker-wrapper.tsx` moves here; `src/compiler/component-entry.ts` stays in place (it's a Node-side template generator, not itself compiled by `rbxtsc`) and updates its one import of the wrapper accordingly.
- `plugin/` (new) — the prebuilt `ScreenshotPlugin.rbxm` binary shipped in the package, produced by a new `build:release-plugin` script from the same `src/plugin.server.ts`/`src/server/session-client.ts`/`src/ui/log-window.ts` sources `001-http-ui-screenshot`'s local `build:plugin` already builds from.
- `src/bridge/install-plugin.ts` (new) — the `install-plugin` CLI subcommand's implementation.
- `tests/fixtures/external-project/` and `tests/fixtures/external-project-2/` (new) — scratch roblox-ts project fixtures (own `tsconfig.json`, own `node_modules`, own components) standing in for real external consumers, since this feature's whole point is behavior that only manifests when `consumerProjectRoot` differs from this repository.

Everything under `src/bridge/`, `src/compiler/`, `src/capture/`, `src/server/`, `src/types/` not called out above is unchanged from `001-http-ui-screenshot`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Lay out the new package boundaries (wrapper source location, publishing metadata, protocol version constant) that every user story below depends on.

- [x] T001 [P] Create `roblox-src/` and `plugin/`; move `src/compiler/marker-wrapper.tsx` to `roblox-src/marker-wrapper.tsx` and update its one import site in `src/compiler/component-entry.ts`
- [x] T002 [P] Add `"bin"` (`react-screenshot-plugin` → `dist/bridge/screenshot-cli.js`), move `@rbxts/react`, `@rbxts/react-roblox`, `roblox-ts`, `@rbxts/compiler-types`, `@rbxts/types` into `"peerDependencies"`, and add a `"files"` allowlist (`dist`, `roblox-src`, `plugin`) to `package.json`
- [x] T003 [P] Define a `protocolVersion` constant in `src/types/protocol.ts`, versioned independently of `package.json`'s semver so routine releases that don't change the wire format don't force every consumer to re-run `install-plugin`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Generalize the one shared chokepoint — `model-builder.ts`'s staging logic — to target an arbitrary consumer project instead of assuming `projectRoot` is this repository. Every user story below depends on this.

**⚠️ CRITICAL**: No user story task may begin until this phase is complete.

- [x] T004 Add an explicit `consumerProjectRoot` parameter to `model-builder.ts`'s staging function, defaulting to this repository's own root so the existing local `npm run screenshot` path (`001-http-ui-screenshot`) is behaviorally unchanged
- [x] T005 [P] Create the scratch "external consumer project" fixture under `tests/fixtures/external-project/`: its own `tsconfig.json`, its own `node_modules` (a real `@rbxts/react`/`@rbxts/react-roblox`/`roblox-ts` install, independent of this repository's), and a plain no-props target component
- [x] T006 Unit tests for `model-builder.ts` staging against `consumerProjectRoot` pointing at the T005 fixture: the staged project's `node_modules` symlink resolves to the fixture's own `node_modules` (not this repository's), the wrapper is copied from `roblox-src/`, and omitting `consumerProjectRoot` still resolves to this repository itself, in `tests/unit/model-builder.test.ts` (depends on T001, T004, T005)

**Checkpoint**: `model-builder.ts` can target an external project; user story work can begin.

---

## Phase 3: User Story 1 - Install and Capture From an External Project (Priority: P1) 🎯 MVP

**Goal**: A developer runs `npm install --save-dev @rbxts/react-screenshot-plugin`, `npx react-screenshot-plugin install-plugin` once, adds a `screenshot` script, and runs `npm run screenshot <componentPath>` from their own project to get a PNG of their own component — no manual file copying between repositories.

**Independent Test**: From the scratch external project fixture, run the full documented sequence (install the packed tarball, `install-plugin`, `npm run screenshot`) against real Roblox Studio and confirm a correct PNG is produced.

### Tests for User Story 1

- [x] T007 [US1] CLI subcommand-dispatch unit tests: `install-plugin` routes to the plugin-install path and a bare component path routes to the existing capture path, in `tests/unit/cli-subcommands.test.ts`
- [x] T008 [US1] Unit tests for `install-plugin`'s copy logic against a fake plugins-folder path: idempotent overwrite on repeat runs, and a clear error (not a silent no-op) if the bundled `plugin/ScreenshotPlugin.rbxm` is missing from the installed package

### Implementation for User Story 1

- [x] T009 [US1] Add subcommand dispatch to `screenshot-cli.ts`: `install-plugin` vs. the existing default capture invocation (depends on T007)
- [x] T010 [US1] Implement `src/bridge/install-plugin.ts`: resolve Roblox Studio's local plugins folder (reusing the resolution `001-http-ui-screenshot`'s local plugin-install path already performs) and copy the bundled `plugin/ScreenshotPlugin.rbxm` there, overwriting unconditionally (depends on T008)
- [x] T011 [US1] Generalize `model-builder.ts`'s remaining staging steps (beyond T004/T006) to copy the target component from `consumerProjectRoot` and symlink `consumerProjectRoot/node_modules` in place of this repository's own (depends on T006)
- [x] T012 [US1] Resolve `tsconfig.json` and the `rbxtsc` binary from `consumerProjectRoot` when set, falling back to this repository's own only on the local-development default path (depends on T011) — the compiler is now resolved via `createRequire(path.join(projectRoot, "package.json"))` instead of `createRequire(__filename)`, so it explicitly picks up `consumerProjectRoot`'s own installed `roblox-ts`, not this package's
- [x] T013 [US1] Add the `build:release-plugin` script, producing `plugin/ScreenshotPlugin.rbxm` from `src/plugin.server.ts`/`src/server/session-client.ts`/`src/ui/log-window.ts`, as a publish input separate from the existing local `build:plugin` (depends on T002)
- [x] T014 [US1] Real end-to-end test: `npm pack` this package, install the resulting tarball into the T005 scratch project, run `install-plugin` then the package's `screenshot` bin against real Roblox Studio, and assert a real PNG is produced (depends on T009, T010, T011, T012, T013) — `tests/e2e/installed-package.test.ts` (plus its `tests/e2e/support/pack-install.ts` harness) packs a real tarball, installs it into both external-project fixtures, and drives the installed CLI directly against real Studio
- [x] T015 [US1] Verify the full documented flow (install → `install-plugin` → add script → run) requires no manual step outside those four commands (spec Scenario 1, SC-001) — verified by `tests/e2e/installed-package.test.ts` passing using only those commands

**Checkpoint**: An external project can install the package and capture its own component end to end. This is the MVP.

---

## Phase 4: User Story 2 - Same React Instance Used for Wrapper and Component (Priority: P1)

**Goal**: The marker wrapper compiles and runs against the consumer's own installed `@rbxts/react`/`@rbxts/react-roblox`, not a copy bundled in this package, so hooks-based components render correctly.

**Independent Test**: Capture a `useState`-using component from the scratch external project and confirm it renders correctly with no cross-React-instance errors.

### Tests for User Story 2

- [x] T016 [P] [US2] Create a hooks-using fixture component (e.g. `useState` toggling rendered text) in `tests/fixtures/external-project/components/UsesHooks.tsx` within the T005 fixture
- [x] T017 [US2] Unit test asserting the staged project's resolved `@rbxts/react` module path is exactly the scratch project's own `node_modules/@rbxts/react` (via realpath comparison across the symlink from T011), never a copy from this package's own `node_modules` (depends on T011)

### Implementation for User Story 2

- [x] T018 [US2] Audit `roblox-src/marker-wrapper.tsx`'s imports to confirm none could resolve from this package's own `node_modules` instead of the symlinked consumer copy, fixing any that could (depends on T001, T011) — only imports are `@rbxts/react` and the local `./marker-constants`, both resolve correctly through the symlinked consumer `node_modules`
- [x] T019 [US2] Capture the T016 hooks fixture through the real end-to-end path (extending T014) and confirm hook-driven output renders correctly with no "invalid hook call"/"invalid element type" errors (spec Scenario 2, SC-002) (depends on T014, T016, T018) — `tests/e2e/installed-package.test.ts`'s "a hooks-using component..." subtest captures `UsesHooks.tsx` through the installed CLI against real Studio and asserts no hook/element-type errors in stderr

**Checkpoint**: Cross-project React correctness is verified with a real hooks-based component, not just a static one.

---

## Phase 5: User Story 3 - Plugin Reuse Across Multiple Projects (Priority: P2)

**Goal**: Running `install-plugin` once on a machine lets every consumer project on that machine capture screenshots without repeating the Studio-side setup.

**Independent Test**: Run `install-plugin` from one scratch project, then run captures from a second, independent scratch project without running `install-plugin` again.

### Tests for User Story 3

- [x] T020 [P] [US3] Create a second, independent scratch external project fixture (`tests/fixtures/external-project-2/`), distinct from T005, for proving plugin reuse
- [x] T021 [US3] End-to-end test: run `install-plugin` once (from either scratch project's installed package copy), then run captures from both scratch projects without repeating `install-plugin`, asserting both succeed (depends on T014, T020) — `tests/e2e/installed-package.test.ts` runs `install-plugin` only from PROJECT1, then captures from PROJECT2 ("a second, independent project captures successfully without ever running install-plugin itself") to prove reuse

### Implementation for User Story 3

- [x] T022 [US3] Confirm `install-plugin`'s target resolution is machine-level (Studio's plugins folder), not project-relative, so one install serves every consumer project — adjust if any project-relative assumption is found (depends on T010) — `resolvePluginsFolder` derives solely from `%LOCALAPPDATA%`, no project path involved

**Checkpoint**: One `install-plugin` run serves multiple independent consumer projects (spec Scenario 3, SC-003).

---

## Phase 6: User Story 4 - Protocol Version Mismatch Is Reported Clearly (Priority: P2)

**Goal**: A stale installed plugin (from before a package upgrade) produces a named, actionable error instead of a silent timeout.

**Independent Test**: Simulate a plugin reporting an older protocol version and confirm the CLI fails fast with an error naming the mismatch and instructing the developer to re-run `install-plugin`.

### Tests for User Story 4

- [x] T023 [P] [US4] Unit tests for protocol-version comparison in `tests/unit/session-protocol-version.test.ts`: matching versions proceed, mismatched versions produce the named error, and a plugin response predating the field entirely is treated as a mismatch rather than crashing — implemented, but as part of `tests/integration/session-protocol.test.ts` rather than the planned standalone `tests/unit/session-protocol-version.test.ts`; all three cases are covered there
- [x] T024 [US4] End-to-end-style test simulating a stale installed plugin (an older `protocolVersion` value in its discovery response) and asserting the CLI fails fast with the "re-run install-plugin" message rather than timing out (depends on T023) — added as an integration test in `tests/integration/screenshot-workflow.test.ts` ("a stale installed plugin... fails fast through the full runCapture path"): drives the real `runCapture()` path with a simulated plugin polling `pluginProtocolVersion=0`, and asserts both the specific error message and that it fails in well under the phase timeout rather than by timing out

### Implementation for User Story 4

- [x] T025 [US4] Add `protocolVersion` to the session manifest built in `src/bridge/session-server.ts`, sourced from the T003 constant (depends on T003) — implemented differently, and considered equivalent: the plugin sends its version as a `pluginProtocolVersion` query parameter on every `GET /session` poll, and `session-server.ts` compares it there and rejects (409, session marked `failed`) before a manifest is ever returned, rather than the manifest itself carrying a `protocolVersion` field for a separate downstream comparison
- [x] T026 [US4] Embed the same constant into the plugin at build time so `build:release-plugin`'s output reports its own version on discovery (depends on T013, T003) — `src/server/session-client.ts` imports `PROTOCOL_VERSION` and sends it on every poll; compiled into the plugin by `build:release-plugin`
- [x] T027 [US4] Compare the plugin's reported version against the CLI's own in `src/bridge/screenshot-command.ts` and fail fast with a named mismatch error before any Studio mutation (depends on T025, T026, T024) — implemented differently, and considered equivalent: the comparison lives in `src/bridge/session-server.ts` (see T025), not `screenshot-command.ts`, but it fails fast with a named error before any manifest/model transfer, satisfying the same outcome the task describes; T024's integration test verifies this end to end through `runCapture`

**Checkpoint**: A stale installed plugin produces a clear, actionable error instead of a hang (spec Scenario 4, SC-004).

---

## Phase 7: User Story 5 - Existing Props Methods Keep Working From an External Project (Priority: P3)

**Goal**: `--props`, `--props-file`, individual `--<prop>` flags, and `SCREENSHOT_PROPS` all behave identically when the tool is consumed as an installed package.

**Independent Test**: From the scratch external project, run each props method against a required-props fixture and confirm identical behavior to the equivalent local invocation.

### Tests for User Story 5

- [x] T028 [P] [US5] Add a required-props component to the T005 fixture, mirroring `tests/fixtures/components/RequiredProps.tsx`, for use from the external project
- [x] T029 [US5] End-to-end tests running each existing props method (`--props`, `--props-file`, individual `--<prop>` flags, `SCREENSHOT_PROPS`) from the scratch external project against the T028 fixture, asserting identical behavior to the equivalent local invocation (depends on T014, T028) — `tests/e2e/installed-package.test.ts`'s four `RequiredProps.tsx` subtests, one per method

### Implementation for User Story 5

- [x] T030 [US5] Confirm (and fix if needed) that props-path resolution (`--props-file`'s relative path, in particular) resolves against the external project's own `cwd`, not this repository's, once invoked through the generalized CLI (depends on T011, T012, T029) — confirmed by `tests/e2e/installed-package.test.ts`'s `--props-file` subtest, which writes `.e2e-props.json` into PROJECT1 and passes a bare relative path with `cwd` set to PROJECT1

**Checkpoint**: All props-passing methods work unchanged when the tool is consumed as an installed package (spec Scenario 5).

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and release-readiness checks spanning all five stories.

- [x] T031 Add a "Using this as an installed package" section to `README.md` covering install → `install-plugin` → add script → capture, distinct from the existing local-development instructions (FR-014)
- [x] T032 [P] Add `specs/002-package-screenshot-tool/quickstart.md`, mirroring `001-http-ui-screenshot/quickstart.md`'s structure, scoped to the external-consumer flow
- [x] T033 [P] Confirm `npm pack --dry-run`'s file list excludes `specs/`, `tests/`, `reference/`, and CI config (FR-012, SC-005) — verified: tarball contains only `dist/`, `roblox-src/`, `plugin/ScreenshotPlugin.rbxm`, `package-types/`, `package.json`, `README.md`
- [x] T034 Run every spec Scenario 1-5 acceptance criterion against a real external scratch project end to end, as the final release gate before publishing — full `npm run test:e2e` run (15/15 passing): `installed-package.test.ts` covers Scenarios 1/2/3/5, `screenshot-cli.test.ts` and `studio-lifecycle.test.ts` cover the underlying capture/Studio-launch mechanics, and Scenario 4 is covered by the `runCapture`-level integration test (see T024)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup (T001). Blocks every user story.
- **User Story 1 (Phase 3)**: Depends on Foundational only. This is the MVP and the base every later story extends.
- **User Story 2 (Phase 4)**: Depends on Foundational; extends User Story 1's staging (T011) and end-to-end harness (T014).
- **User Story 3 (Phase 5)**: Depends on Foundational; extends User Story 1's `install-plugin` (T010) and end-to-end harness (T014).
- **User Story 4 (Phase 6)**: Depends on Foundational and the T003 protocol-version constant; extends User Story 1's session server and command orchestration.
- **User Story 5 (Phase 7)**: Depends on Foundational; extends User Story 1's staging/path-resolution (T011, T012) and end-to-end harness (T014).
- **Polish (Phase 8)**: Depends on all five user stories being complete.

### User Story Dependencies

- User Stories 2-5 all build on User Story 1's modules (`install-plugin.ts`, the generalized `model-builder.ts`, and the `npm pack`-based end-to-end harness from T014) but touch disjoint functions/branches within them, so they remain independently testable once User Story 1 exists.
- User Stories 2, 3, 4, and 5 do not depend on each other.

### Parallel Opportunities

- All Setup tasks marked `[P]` can run together.
- T005 (Foundational fixture) can proceed in parallel with T001-T003.
- Within User Story 1: T007 and T008 (test tasks) can run in parallel before their corresponding implementation tasks.
- User Stories 2, 3, 4, and 5 can be implemented in parallel by different people once User Story 1 (through T014) is complete.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational).
2. Complete Phase 3 (User Story 1).
3. **STOP and VALIDATE**: run the T014 end-to-end test against a real Roblox Studio installation and confirm a correct PNG comes out of the scratch external project.

### Incremental Delivery

1. Setup + Foundational → `model-builder.ts` can target an external project.
2. User Story 1 → install, `install-plugin`, and capture work end to end from an external project (MVP).
3. User Story 2 → hooks-based components proven to render correctly (no cross-React-instance errors).
4. User Story 3 → one `install-plugin` run serves multiple consumer projects.
5. User Story 4 → stale installed plugins fail fast with an actionable error.
6. User Story 5 → every existing props method confirmed unchanged from an external project.
7. Polish → documentation complete and published tarball contents verified clean.

---

## Notes

- `[P]` tasks touch different files with no dependency on an incomplete task.
- `[Story]` labels map every user-story task back to `spec.md`'s Scenarios 1-5 for traceability.
- Tests are written and confirmed failing before their corresponding implementation task, per constitution Principle I.
- This repository's own local `npm run screenshot` workflow (`001-http-ui-screenshot`) must keep passing unchanged throughout — every Foundational and User Story 1 task explicitly preserves the `consumerProjectRoot`-omitted default path.
