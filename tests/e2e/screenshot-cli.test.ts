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
import { isSpillTintedTowardKeyColor } from "../../src/capture/marker-crop.js";
import type { RgbColor } from "../../src/capture/color.js";
import { CONTENT_KEY_COLOR, MARKER_COLOR } from "../../roblox-src/marker-constants.js";
import { MARKER_TOLERANCE } from "../../src/types/protocol.js";

/**
 * Confirms the final PNG contains no trace of either wrapper color: no marker-border color (it
 * should have been fully cropped away), no fully-opaque exact content-key color (it should have been
 * keyed out to transparency), and - the real reported bug this guards against - no opaque pixel still
 * *tinted toward* the content key color at all, the anti-aliased fringe an exact-match-only pass used
 * to leave behind. Only meaningful for fixtures with no genuinely key-colored-ish content of their
 * own (true of every fixture this is used with here); a component that's legitimately spill-colored
 * far from any edge would be a false positive for the spill check, by design (see
 * `nibbleContentKeySpill`'s own doc comment).
 */
function assertNoWrapperColorLeaked(decoded: { width: number; height: number; pixels: Buffer }, contentKeyColor: RgbColor = CONTENT_KEY_COLOR): void {
	for (let i = 0; i < decoded.pixels.length; i += 4) {
		const r = decoded.pixels[i], g = decoded.pixels[i + 1], b = decoded.pixels[i + 2], a = decoded.pixels[i + 3];
		const isMarker = Math.abs(r - MARKER_COLOR.r) <= MARKER_TOLERANCE && Math.abs(g - MARKER_COLOR.g) <= MARKER_TOLERANCE && Math.abs(b - MARKER_COLOR.b) <= MARKER_TOLERANCE;
		assert.ok(!isMarker, `found a marker-border-colored pixel at index ${i / 4} in the final PNG`);
		if (a !== 255) continue;
		const isOpaqueContentKey = Math.abs(r - contentKeyColor.r) <= MARKER_TOLERANCE && Math.abs(g - contentKeyColor.g) <= MARKER_TOLERANCE && Math.abs(b - contentKeyColor.b) <= MARKER_TOLERANCE;
		assert.ok(!isOpaqueContentKey, `found an un-keyed opaque content-backing-colored pixel at index ${i / 4} in the final PNG`);
		assert.ok(
			!isSpillTintedTowardKeyColor(r, g, b, contentKeyColor),
			`found an opaque pixel at index ${i / 4} still tinted toward the content-key color (rgb(${r}, ${g}, ${b})) - a leftover anti-aliased fringe`,
		);
	}
}

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
	assertNoWrapperColorLeaked(decoded);

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
	assertNoWrapperColorLeaked(decoded);

	await rm(outputPath, { force: true });
});

// Regression test for --content-key-color: confirms the flag actually reaches the marker wrapper
// rendered in Studio (not just parsed and dropped), by using a key color - red - clearly unlike
// either of ButtonLike.tsx's own rendered colors (an indigo fill, rgb(99, 102, 241), and white text) -
// blue was tried first and rejected: the indigo fill's own blue-leaning channel balance false-positives
// against a blue-axis spill check with nothing to do with actual key-color bleed, exactly the
// documented false-positive risk on assertNoWrapperColorLeaked's own doc comment. If the flag weren't
// wired all the way through, the wrapper would still back the content with the *default* green, while
// cropToMarker would be told (wrongly) to look for red - leaving a very visible, un-keyed green fill
// behind the button in the output. Checking BOTH that no red survives (proving the custom key was
// fully keyed out) AND that no green survives either (proving the default wasn't silently used
// instead) catches that failure mode either way.
test("--content-key-color reaches the real capture and gets fully keyed out, without the default color leaking through", { timeout: TEST_TIMEOUT_MS }, async (t) => {
	const alreadyRunning = await findRunningStudioWindow();
	if (!alreadyRunning && !(await findNewestStudioExecutable())) {
		t.skip("Roblox Studio is not installed on this machine");
		return;
	}

	const outputPath = path.join(REPO_ROOT, "tests", "fixtures", ".e2e-custom-key-color-output.png");
	await rm(outputPath, { force: true });

	const customKeyColor = { r: 255, g: 0, b: 0 };
	const cliPath = path.join(REPO_ROOT, "dist", "src", "bridge", "screenshot-cli.js");
	const child = spawn(
		process.execPath,
		[cliPath, "tests/fixtures/components/ButtonLike.tsx", "--output", outputPath, "--content-key-color", "#FF0000"],
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
		assert.fail(`expected success capturing with a custom --content-key-color, got:\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`);
	}

	const png = await readFile(outputPath);
	const decoded = decodePng(png);
	assert.ok(decoded.width > 0 && decoded.height > 0, `expected a real, non-empty PNG, got ${decoded.width}x${decoded.height}`);
	assertNoWrapperColorLeaked(decoded, customKeyColor);
	assertNoWrapperColorLeaked(decoded, CONTENT_KEY_COLOR);

	await rm(outputPath, { force: true });
});
