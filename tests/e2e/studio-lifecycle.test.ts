/**
 * Real end-to-end tests for opening and closing Roblox Studio itself, independent of the capture
 * pipeline - the capture flow already exercises `ensureStudioWindow` as a side effect of taking a
 * screenshot, but that couples any launch/close regression to a much slower, harder-to-diagnose
 * capture failure. These drive `src/capture/studio-window.ts`'s launch/close functions directly
 * against a real, locally installed Roblox Studio, with no faked process or window state.
 *
 * Skips (rather than fails) when Roblox Studio isn't installed on the machine running the suite,
 * since that's a real, expected condition (CI, a fresh clone) rather than a defect.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
	closeStudio,
	findNewestStudioExecutable,
	findRunningStudioWindow,
	launchStudio,
	waitForStudioWindow,
} from "../../src/capture/studio-window.js";

const TEST_TIMEOUT_MS = 120_000;

test("launching Roblox Studio from a closed state produces a running window", { timeout: TEST_TIMEOUT_MS }, async (t) => {
	const executablePath = await findNewestStudioExecutable();
	if (!executablePath) {
		t.skip("Roblox Studio is not installed on this machine");
		return;
	}

	await closeStudio();
	assert.equal(await findRunningStudioWindow(), undefined, "Studio should not be running before this test launches it");

	await launchStudio(executablePath);
	const window = await waitForStudioWindow(60_000);

	assert.match(window.hwnd, /^\d+$/, `expected a numeric window handle, got '${window.hwnd}'`);
	assert.ok(window.title.length > 0, "expected a non-empty window title");
});

test("closing Roblox Studio removes the running window", { timeout: TEST_TIMEOUT_MS }, async (t) => {
	const executablePath = await findNewestStudioExecutable();
	if (!executablePath) {
		t.skip("Roblox Studio is not installed on this machine");
		return;
	}

	if (!(await findRunningStudioWindow())) {
		await launchStudio(executablePath);
		await waitForStudioWindow(60_000);
	}

	const closed = await closeStudio();

	assert.equal(closed, true, "closeStudio() should report that a running Studio process was found and closed");
	assert.equal(await findRunningStudioWindow(), undefined, "Studio's window should be gone after closeStudio()");
});
