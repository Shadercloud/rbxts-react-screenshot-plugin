import assert from "node:assert/strict";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildCaptureModel, type StagedProjectInfo } from "../../src/compiler/model-builder.js";

const repoRoot = process.cwd();
const externalProjectRoot = path.join(repoRoot, "tests/fixtures/external-project");

/**
 * Runs a real `buildCaptureModel()` call (letting compilation succeed or fail as it will - that's
 * not what's under test here) and inspects staging *synchronously* inside the `onStaged` hook,
 * before the temporary directory is cleaned up. `onStaged` isn't awaited by `buildCaptureModel`,
 * so an async inspector could race the cleanup in `finally` - synchronous fs calls avoid that.
 */
async function inspectStaging(componentPath: string, consumerProjectRoot: string | undefined, inspect: (info: StagedProjectInfo) => void): Promise<void> {
	let inspected = false;
	let thrown: unknown;
	await buildCaptureModel(componentPath, {}, repoRoot, consumerProjectRoot, (info) => {
		inspected = true;
		try {
			inspect(info);
		} catch (error) {
			thrown = error;
		}
	}).catch(() => undefined);
	assert.ok(inspected, "buildCaptureModel should have staged a project before compiling");
	if (thrown) throw thrown;
}

test("a no-props component compiles into a uniquely rooted capture payload", async () => {
	const { modelBuffer, temporaryRootName } = await buildCaptureModel("tests/fixtures/components/NoProps.tsx", {});
	assert.ok(modelBuffer.length > 1_000);
	const text = modelBuffer.toString("latin1");
	assert.match(text, /RuntimeLib/, "capture payloads must embed the roblox-ts runtime");
	assert.match(text, /CaptureBootstrap/, "the bootstrap module must be present under its fixed name");
	assert.ok(temporaryRootName.startsWith("ScreenshotCapture_"));
});

test("two builds of the same component receive different unique root names", async () => {
	const first = await buildCaptureModel("tests/fixtures/components/NoProps.tsx", {});
	const second = await buildCaptureModel("tests/fixtures/components/NoProps.tsx", {});
	assert.notEqual(first.temporaryRootName, second.temporaryRootName);
});

test("a nested-UI component compiles successfully", async () => {
	const { modelBuffer } = await buildCaptureModel("tests/fixtures/components/Nested.tsx", {});
	assert.ok(modelBuffer.length > 1_000);
});

test("a component with a deliberate build failure reports a clear compilation error", async () => {
	await assert.rejects(
		buildCaptureModel("tests/fixtures/components/BuildFailure.tsx", {}),
		/Failed to compile component .*BuildFailure\.tsx/,
	);
});

test("a component with required props compiles successfully with a supplied props object", async () => {
	const { modelBuffer } = await buildCaptureModel("tests/fixtures/components/RequiredProps.tsx", { text: "Save changes", disabled: false });
	assert.ok(modelBuffer.length > 1_000);
});

test("omitting consumerProjectRoot stages against this repository itself, unchanged from before", async () => {
	await inspectStaging("tests/fixtures/components/NoProps.tsx", undefined, (staged) => {
		const stagedNodeModules = realpathSync(path.join(staged.temporaryDirectory, "node_modules"));
		assert.equal(stagedNodeModules, realpathSync(path.join(repoRoot, "node_modules")));
		assert.ok(existsSync(path.join(staged.stagedProject, "roblox-src", "marker-wrapper.tsx")));
	});
});

test("consumerProjectRoot stages against an external project's own node_modules, not this repository's", async () => {
	await inspectStaging("components/NoProps.tsx", externalProjectRoot, (staged) => {
		const stagedNodeModules = realpathSync(path.join(staged.temporaryDirectory, "node_modules"));
		assert.equal(stagedNodeModules, realpathSync(path.join(externalProjectRoot, "node_modules")));
		assert.notEqual(stagedNodeModules, realpathSync(path.join(repoRoot, "node_modules")));
	});
});

test("the staged project's @rbxts/react resolves to the external project's own copy, never this package's own", async () => {
	await inspectStaging("components/NoProps.tsx", externalProjectRoot, (staged) => {
		const stagedReact = realpathSync(path.join(staged.temporaryDirectory, "node_modules", "@rbxts", "react"));
		assert.equal(stagedReact, realpathSync(path.join(externalProjectRoot, "node_modules", "@rbxts", "react")));
		assert.notEqual(stagedReact, realpathSync(path.join(repoRoot, "node_modules", "@rbxts", "react")));
	});
});

test("consumerProjectRoot stages this package's own roblox-src/ wrapper regardless of which project is targeted", async () => {
	await inspectStaging("components/NoProps.tsx", externalProjectRoot, (staged) => {
		assert.ok(existsSync(path.join(staged.stagedProject, "roblox-src", "marker-wrapper.tsx")));
		assert.ok(existsSync(path.join(staged.stagedProject, "roblox-src", "marker-constants.ts")));
	});
});

test("a component that only exists in the external project compiles successfully when consumerProjectRoot targets it", async () => {
	const { modelBuffer } = await buildCaptureModel("components/NoProps.tsx", {}, repoRoot, externalProjectRoot);
	assert.ok(modelBuffer.length > 1_000);
});

test("a hooks-using component in the external project compiles successfully against its own React", async () => {
	const { modelBuffer } = await buildCaptureModel("components/UsesHooks.tsx", {}, repoRoot, externalProjectRoot);
	assert.ok(modelBuffer.length > 1_000);
});
