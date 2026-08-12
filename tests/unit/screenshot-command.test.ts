import assert from "node:assert/strict";
import test from "node:test";

import { runCapture } from "../../src/bridge/screenshot-command.js";
import { MARKER_COLOR } from "../../roblox-src/marker-constants.js";

// A contentKeyColor indistinguishable from the marker border color would make cropToMarker unable
// to tell the border from the content backing at all - reject it up front, before compiling anything
// or starting the session server, rather than producing a confusing failure deep in the capture.
test("a contentKeyColor too close to the marker border color is rejected before any work starts", async () => {
	await assert.rejects(
		runCapture({ componentPath: "tests/fixtures/components/NoProps.tsx", contentKeyColor: { r: MARKER_COLOR.r, g: MARKER_COLOR.g, b: MARKER_COLOR.b } }),
		/too close to the marker border color/i,
	);
});

test("a contentKeyColor clearly distinct from the marker border color is not rejected by validation", async () => {
	// Distinct from the marker color, but the plugin/Studio side is never faked here - the point is
	// only that validation itself doesn't throw; awaitReady will time out first, which is expected.
	await assert.rejects(
		runCapture({
			componentPath: "tests/fixtures/components/NoProps.tsx",
			contentKeyColor: { r: 0, g: 255, b: 0 },
			port: 0,
			phaseTimeoutMs: 50,
			cleanupGraceMs: 0,
			ensureStudioWindow: async () => ({ hwnd: "123456", title: "fake studio" }),
		}),
		(error: unknown) => !(error instanceof Error && /too close to the marker border color/i.test(error.message)),
	);
});
