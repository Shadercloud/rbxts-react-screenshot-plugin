<!--
Sync Impact Report
==================
Version change: N/A → 1.0.0 (initial adoption)
Modified principles: None (new constitution)
Added sections: Core Principles (5), Technology Stack Requirements, Governance
Removed sections: None
Follow-up TODOs: None
-->

# Roblox Screenshot Plugin Constitution

## Core Principles

### I. Test-First Development (NON-NEGOTIABLE)

All new functionality MUST be preceded by tests. The TDD cycle is mandatory:

1. Write tests that define expected behavior.
2. Verify tests fail before implementation begins.
3. Implement the minimal code to make tests pass.
4. Refactor with tests as the safety net.

**Rationale:** Tests encode intent, prevent regression, and serve as living documentation. Writing tests first forces clear thinking about requirements before coding.

### II. Simplicity (YAGNI)

Start simple. Do not build features until they are needed:

- Implement only what is required for the current requirement.
- Avoid speculative abstractions and premature generalizations.
- Prefer straightforward solutions over clever ones.
- Complexity MUST be justified by demonstrated need, not hypothetical futures.

**Rationale:** Unnecessary complexity increases maintenance burden, introduces bugs, and slows development. Simple code is easier to test, understand, and evolve.

### III. Modular Architecture

Every component MUST be self-contained with clear boundaries:

- Modules have a single, well-defined purpose.
- Dependencies flow in one direction; circular dependencies are forbidden.
- Each module is independently testable without mocking the entire world.
- Public interfaces are minimal and stable; internal details are hidden.

**Rationale:** Modular design enables parallel development, targeted testing, and safe refactoring. Clear boundaries prevent cascading changes when requirements evolve.

### IV. Type Safety

Strong typing MUST be enforced throughout the codebase:

- All functions, variables, and data structures must have explicit types where supported by the language (Luau type annotations).
- Avoid `any` types; use unions or generics instead.
- Type errors are treated as defects, not warnings.
- Runtime type checks should supplement static types at trust boundaries.

**Rationale:** Static typing catches entire classes of bugs at compile time, improves IDE support, and serves as inline documentation for data shapes and contracts.

### V. Documentation Required

All public interfaces MUST be documented:

- Every module exports a brief purpose statement.
- Public functions include parameter types, return types, and behavior descriptions.
- Non-obvious design decisions are captured in code comments or adjacent docs.
- Documentation is updated alongside code changes; stale documentation is a defect.

**Rationale:** Code is read far more often than it is written. Good documentation reduces onboarding time, prevents misuse of APIs, and preserves institutional knowledge.

## Technology Stack Requirements

This project targets the Roblox platform with the following constraints:

- **Language:** Luau (Roblox's typed dialect of Lua).
- **Tooling:** roblox-ts (TypeScript-to-Luau compiler) for development, with type-checked source.
- **Runtime:** Roblox Client/Server environment; code must be compatible with the latest stable Roblox engine.
- **Package Management:** npm via roblox-ts for TypeScript dependencies.
- **Build System:** roblox-ts build pipeline; compiled output targets `.luau` files.

Any changes to the technology stack require a constitution amendment.

## Governance

This constitution supersedes all other development practices for this project:

- **Amendments:** Changes require explicit documentation of what changed and why. Migration plans are required for backward-incompatible amendments.
- **Versioning:** Constitution versions follow semantic versioning (MAJOR.MINOR.PATCH). MAJOR bumps for principle removals or redefinitions, MINOR for additions, PATCH for clarifications.
- **Compliance:** All PRs and code reviews MUST verify compliance with these principles. Violations are grounds for rejection regardless of functional correctness.
- **Complexity Justification:** Any deviation from simplicity (Principle II) requires a written justification referencing a demonstrated need.

**Version**: 1.0.0 | **Ratified**: 2026-08-06 | **Last Amended**: 2026-08-06
