import assert from "node:assert/strict";
import test from "node:test";

import { findNewestStudioExecutable, findRunningStudioWindow } from "../../src/capture/studio-window.js";
import { captureWindow } from "../../src/capture/window-capture.js";

test("finding a running Studio window does not throw when Studio is not installed or not running", async () => {
	const found = await findRunningStudioWindow();
	assert.ok(found === undefined || (typeof found.hwnd === "string" && typeof found.title === "string"));
});

test("locating the newest Studio executable does not throw when Roblox is not installed", async () => {
	const found = await findNewestStudioExecutable();
	assert.ok(found === undefined || found.toLowerCase().endsWith("robloxstudiobeta.exe"));
});

test("capturing an invalid window handle fails before any Win32 call is made", async () => {
	await assert.rejects(captureWindow("not-a-handle", "out.png"), /invalid window handle/i);
});
