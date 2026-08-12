/**
 * A real end-to-end test: runs the compiled screenshot CLI as an actual child process against a
 * real, locally installed Roblox Studio and the real, currently-installed plugin - the same
 * thing `npm run screenshot` runs, minus its own redundant `build:bridge` step (see below). No
 * faked plugin client, no faked Studio/window-capture. This is the only test that would have
 * caught the Studio-launch hang and the plugin's `HttpError: ConnectFail`, since every other
 * test drives the protocol with a simulated plugin (Node `fetch`) rather than Roblox's own
 * `HttpService`.
 *
 * Skips (rather than fails) when Roblox Studio isn't installed on the machine running the suite,
 * since that's a real, expected condition (CI, a fresh clone) rather than a defect.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { decodePng } from "../../src/bridge/png.js";
import { findNewestStudioExecutable, findRunningStudioWindow } from "../../src/capture/studio-window.js";

// Not derived from __dirname: that resolves relative to the compiled file under dist/tests/e2e/,
// not the source tree, and the two don't nest the same number of levels from the repo root.
// Both `npm run test:e2e` and `node --test` always run with cwd already at the repo root.
const REPO_ROOT = process.cwd();
const TEST_TIMEOUT_MS = 180_000;

test("npm run screenshot produces a real PNG through a real Roblox Studio and plugin", { timeout: TEST_TIMEOUT_MS }, async (t) => {
	const alreadyRunning = await findRunningStudioWindow();
	if (!alreadyRunning && !(await findNewestStudioExecutable())) {
		t.skip("Roblox Studio is not installed on this machine");
		return;
	}

	const outputPath = path.join(REPO_ROOT, "tests", "fixtures", ".e2e-no-props-output.png");
	await rm(outputPath, { force: true });

	// Invoke the compiled CLI directly rather than `npm run screenshot`: that script chains into
	// `build:bridge`, which deletes and recompiles `dist/` - but this very test is itself running
	// from a file under `dist/tests/e2e/`, so that delete fails with EPERM on Windows. The
	// `test:e2e` npm script already builds `dist/` once before the test runner starts.
	const cliPath = path.join(REPO_ROOT, "dist", "src", "bridge", "screenshot-cli.js");
	const child = spawn(
		process.execPath,
		[cliPath, "tests/fixtures/components/NoProps.tsx", "--output", outputPath],
		{ cwd: REPO_ROOT },
	);
	t.signal.addEventListener("abort", () => child.kill());

	let stdout = "";
	let stderr = "";
	child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
	child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

	const exitCode = await new Promise<number>((resolve, reject) => {
		child.once("error", reject);
		child.once("exit", (code) => resolve(code ?? -1));
	});

	if (exitCode !== 0) {
		assert.fail(`'npm run screenshot' exited with code ${exitCode}.\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`);
	}

	const png = await readFile(outputPath);
	const decoded = decodePng(png);
	assert.ok(decoded.width > 0 && decoded.height > 0, `expected a real, non-empty PNG, got ${decoded.width}x${decoded.height}`);

	await rm(outputPath, { force: true });
});

test("capturing a component larger than Studio's viewport fails with a clear, specific error", { timeout: TEST_TIMEOUT_MS }, async (t) => {
	const alreadyRunning = await findRunningStudioWindow();
	if (!alreadyRunning && !(await findNewestStudioExecutable())) {
		t.skip("Roblox Studio is not installed on this machine");
		return;
	}

	const outputPath = path.join(REPO_ROOT, "tests", "fixtures", ".e2e-too-large-output.png");
	await rm(outputPath, { force: true });

	const cliPath = path.join(REPO_ROOT, "dist", "src", "bridge", "screenshot-cli.js");
	const child = spawn(
		process.execPath,
		[cliPath, "tests/fixtures/components/TooLargeForViewport.tsx", "--output", outputPath],
		{ cwd: REPO_ROOT },
	);
	t.signal.addEventListener("abort", () => child.kill());

	let stdout = "";
	let stderr = "";
	child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
	child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

	const exitCode = await new Promise<number>((resolve, reject) => {
		child.once("error", reject);
		child.once("exit", (code) => resolve(code ?? -1));
	});

	assert.notEqual(exitCode, 0, `expected a nonzero exit code for an oversized component.\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`);
	assert.match(stderr, /larger than Studio's current viewport/i, `expected the viewport-size error, got:\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`);

	await rm(outputPath, { force: true });
});

// Regression test for a real reported bug: a component whose own size comes from AutomaticSize (a
// UI-kit button hugging its own label, with UICorner/UIStroke/UIPadding/UIListLayout decorators - see
// tests/fixtures/components/ButtonLike.tsx's own doc comment) used to fail marker detection with
// "The marker border is incomplete, non-rectangular, or ambiguous" when captured directly (no extra
// wrapping frame around it in user code), because the cascade of nested AutomaticSize frames between
// it and the marker's own border can round to a different pixel at each level - bleeding the content
// into the marker's innermost border pixel by a pixel or two. Fixed by cropToMarker measuring the
// actual border depth per capture instead of assuming a fixed thickness (see marker-crop.ts).
test("capturing an AutomaticSize-driven component directly (no wrapping frame) succeeds", { timeout: TEST_TIMEOUT_MS }, async (t) => {
	const alreadyRunning = await findRunningStudioWindow();
	if (!alreadyRunning && !(await findNewestStudioExecutable())) {
		t.skip("Roblox Studio is not installed on this machine");
		return;
	}

	const outputPath = path.join(REPO_ROOT, "tests", "fixtures", ".e2e-automatic-size-output.png");
	await rm(outputPath, { force: true });

	const cliPath = path.join(REPO_ROOT, "dist", "src", "bridge", "screenshot-cli.js");
	const child = spawn(
		process.execPath,
		[cliPath, "tests/fixtures/components/ButtonLike.tsx", "--output", outputPath],
		{ cwd: REPO_ROOT },
	);
	t.signal.addEventListener("abort", () => child.kill());

	let stdout = "";
	let stderr = "";
	child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
	child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

	const exitCode = await new Promise<number>((resolve, reject) => {
		child.once("error", reject);
		child.once("exit", (code) => resolve(code ?? -1));
	});

	if (exitCode !== 0) {
		assert.fail(`expected success capturing an AutomaticSize-driven component, got:\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`);
	}

	const png = await readFile(outputPath);
	const decoded = decodePng(png);
	assert.ok(decoded.width > 0 && decoded.height > 0, `expected a real, non-empty PNG, got ${decoded.width}x${decoded.height}`);

	await rm(outputPath, { force: true });
});

// Regression test for a real reported follow-up bug: a component with a corner radius close to half
// its own height (a "pill"-style button, e.g. a UI-kit Button with an extended theme corner radius)
// used to fail marker detection the same way as ButtonLike.tsx, because a rounded UICorner leaves a
// gap - near that corner, inside the content's own nominal bounding box - where the marker's own
// background shows through, deeper than a fixed border-thickness constant ever assumed. See
// tests/fixtures/components/ButtonLikeWithIcon.tsx's own doc comment, and marker-crop.ts's
// measureEdgeDepth, which measures the actual per-edge depth per capture instead.
test("capturing a component with a rounded ('pill') corner and an icon+text row succeeds", { timeout: TEST_TIMEOUT_MS }, async (t) => {
	const alreadyRunning = await findRunningStudioWindow();
	if (!alreadyRunning && !(await findNewestStudioExecutable())) {
		t.skip("Roblox Studio is not installed on this machine");
		return;
	}

	const outputPath = path.join(REPO_ROOT, "tests", "fixtures", ".e2e-rounded-corner-output.png");
	await rm(outputPath, { force: true });

	const cliPath = path.join(REPO_ROOT, "dist", "src", "bridge", "screenshot-cli.js");
	const child = spawn(
		process.execPath,
		[cliPath, "tests/fixtures/components/ButtonLikeWithIcon.tsx", "--output", outputPath],
		{ cwd: REPO_ROOT },
	);
	t.signal.addEventListener("abort", () => child.kill());

	let stdout = "";
	let stderr = "";
	child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
	child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

	const exitCode = await new Promise<number>((resolve, reject) => {
		child.once("error", reject);
		child.once("exit", (code) => resolve(code ?? -1));
	});

	if (exitCode !== 0) {
		assert.fail(`expected success capturing a rounded-corner component, got:\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`);
	}

	const png = await readFile(outputPath);
	const decoded = decodePng(png);
	assert.ok(decoded.width > 0 && decoded.height > 0, `expected a real, non-empty PNG, got ${decoded.width}x${decoded.height}`);

	await rm(outputPath, { force: true });
});
