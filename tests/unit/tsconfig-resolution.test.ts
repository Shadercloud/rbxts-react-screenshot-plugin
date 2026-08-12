import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import type * as TS from "typescript";

import { resolveNearestTsconfig } from "../../src/compiler/tsconfig-resolution.js";

const repoRoot = process.cwd();
const externalProjectRoot = path.join(repoRoot, "tests/fixtures/external-project");
const ts = createRequire(path.join(externalProjectRoot, "package.json"))("typescript") as typeof TS;

test("a component with no nested tsconfig.json resolves to the project's own root config, with nothing to stage", () => {
	const sourceEntry = path.join(externalProjectRoot, "components/NoProps.tsx");
	const { configPath, extraStagingDirs } = resolveNearestTsconfig(ts, sourceEntry, externalProjectRoot, ["roblox-src", "components"]);
	assert.equal(configPath, path.join(externalProjectRoot, "tsconfig.json"));
	assert.deepEqual(extraStagingDirs, []);
});

test("a component whose nearest tsconfig.json declares a `paths` mapping reports the mapped directory as needing staging", () => {
	const sourceEntry = path.join(externalProjectRoot, "components/nested-config/UsesPathAlias.tsx");
	const { configPath, extraStagingDirs } = resolveNearestTsconfig(ts, sourceEntry, externalProjectRoot, ["roblox-src", "components"]);
	assert.equal(configPath, path.join(externalProjectRoot, "components/nested-config/tsconfig.json"));
	assert.deepEqual(extraStagingDirs, ["lib"]);
});

test("a `paths` mapping whose target directory the caller reports as already staged is not reported again", () => {
	const sourceEntry = path.join(externalProjectRoot, "components/nested-config/UsesPathAlias.tsx");
	const { extraStagingDirs } = resolveNearestTsconfig(ts, sourceEntry, externalProjectRoot, ["roblox-src", "components", "lib"]);
	assert.deepEqual(extraStagingDirs, []);
});

test("an ancestor tsconfig.json that declares no `paths` mapping is skipped in favor of the project root, not treated as the nearest config", () => {
	// This repository's own tests/tsconfig.json sits directly between every fixture component and this
	// repository's own root, but exists purely to type-check this repository's Node-side test sources -
	// it declares no `paths` and must never be picked as the "nearest" config for a component compile.
	const sourceEntry = path.join(repoRoot, "tests/fixtures/components/NoProps.tsx");
	const { configPath, extraStagingDirs } = resolveNearestTsconfig(ts, sourceEntry, repoRoot, ["roblox-src", "tests"]);
	assert.equal(configPath, path.join(repoRoot, "tsconfig.json"));
	assert.deepEqual(extraStagingDirs, []);
});
