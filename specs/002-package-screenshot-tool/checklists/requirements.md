# Specification Quality Checklist: npm Package Distribution for the Screenshot Tool

## Workflow Coverage

- [x] Install, one-time `install-plugin`, script setup, and capture invocation are defined.
- [x] Resolution of component path and compiler configuration against the consumer's own project is explicit.
- [x] Compilation of the wrapper against the consumer's own React instance (not a bundled copy) is explicit.
- [x] Reuse of one installed plugin across multiple consumer projects is defined.
- [x] Protocol-version mismatch between the CLI and an installed plugin is defined as a fast, actionable failure.
- [x] Continuity of the existing local workflow (spec `001-http-ui-screenshot`) for this repository's own maintainers is explicit.

## Requirement Quality

- [x] Peer-dependency vs. bundled-dependency boundaries are explicit and testable.
- [x] `install-plugin` idempotency is testable.
- [x] Published package contents exclude this repository's development-only files.
- [x] Success criteria cover install flow, cross-instance React correctness, plugin reuse, version-mismatch recovery, and package content hygiene.
- [x] Edge cases cover unsupported peer versions, stale installs, skipped setup steps, and multi-project machines.

## Scope

- [x] This is a packaging/distribution feature layered on top of `001-http-ui-screenshot`, not a replacement for it.
- [x] Publishing automation (CI, npm credentials) is explicitly out of scope.
- [x] Support for multiple simultaneous incompatible peer major versions is explicitly out of scope.
