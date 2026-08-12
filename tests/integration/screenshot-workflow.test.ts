import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import test from "node:test";

import { runCapture } from "../../src/bridge/screenshot-command.js";
import { encodeRgba8Png } from "../../src/bridge/png.js";
import { MEASUREMENT_SAFETY_MARGIN } from "../../src/capture/marker-crop.js";
import { MARKER_COLOR, MARKER_THICKNESS } from "../../roblox-src/marker-constants.js";
import { PROTOCOL_VERSION } from "../../src/types/protocol.js";
import type { SessionManifest, SessionStatusResponse } from "../../src/types/protocol.js";

const MARKER = [MARKER_COLOR.r, MARKER_COLOR.g, MARKER_COLOR.b];
/**
 * How much of the raw capture cropToMarker actually trims from each edge - for a plain, uniform
 * border like buildRawCapture below draws, the measured depth is exactly MARKER_THICKNESS on every
 * edge, plus cropToMarker's own fixed safety margin. See marker-crop.ts's own doc comment for why
 * this is measured per capture rather than a second fixed constant.
 */
const TRIM_THICKNESS = MARKER_THICKNESS + MEASUREMENT_SAFETY_MARGIN;

/** Builds a raw "window capture" PNG containing exactly one valid marker rectangle around solid content. */
function buildRawCapture(width: number, height: number, contentColor: [number, number, number]): Buffer {
	const pixels = Buffer.alloc(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const onBorder = x < MARKER_THICKNESS || width - 1 - x < MARKER_THICKNESS || y < MARKER_THICKNESS || height - 1 - y < MARKER_THICKNESS;
			const color = onBorder ? MARKER : contentColor;
			const offset = (y * width + x) * 4;
			pixels[offset] = color[0];
			pixels[offset + 1] = color[1];
			pixels[offset + 2] = color[2];
			pixels[offset + 3] = 255;
		}
	}
	return encodeRgba8Png(pixels, width, height);
}

/** Drives the session protocol the way the Studio plugin would, without needing Roblox at all. */
async function actAsPlugin(baseUrl: string, expectedTerminalStatus: "done" | "failed" | "expired" = "done"): Promise<void> {
	let manifest: SessionManifest | undefined;
	for (let attempt = 0; attempt < 100 && !manifest; attempt += 1) {
		const response = await fetch(`${baseUrl}/session?pluginProtocolVersion=${PROTOCOL_VERSION}`);
		if (response.status === 200) manifest = await response.json() as SessionManifest;
		else await new Promise((resolve) => setTimeout(resolve, 20));
	}
	assert.ok(manifest, "the plugin should have discovered a session");

	const download = await fetch(`${baseUrl}${manifest.modelUrl}`);
	assert.equal(download.status, 200);
	const modelBytes = Buffer.from(await download.arrayBuffer());
	assert.equal(modelBytes.length, manifest.contentLength);

	await fetch(`${baseUrl}/session/${manifest.sessionId}/ack`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ phase: "loaded" }),
	});
	await fetch(`${baseUrl}/session/${manifest.sessionId}/ack`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ phase: "ready", message: "ScreenGui rendered" }),
	});

	// Keep polling status for a while after readiness - the listener stays open for `cleanupGraceMs`
	// specifically so a real plugin's poll cadence has time to observe the terminal state.
	let terminal: SessionStatusResponse | undefined;
	for (let attempt = 0; attempt < 50 && !terminal; attempt += 1) {
		const status = await fetch(`${baseUrl}/session/${manifest.sessionId}/status`);
		const body = await status.json() as SessionStatusResponse;
		if (body.status === "done" || body.status === "failed" || body.status === "expired") terminal = body;
		else await new Promise((resolve) => setTimeout(resolve, 20));
	}
	assert.equal(terminal?.status, expectedTerminalStatus);
}

test("capturing a no-props component end to end produces a border-free PNG of the marker interior", async () => {
	let baseUrl = "";
	const rawWidth = 60, rawHeight = 50;

	const result = await Promise.all([
		runCapture({
			componentPath: "tests/fixtures/components/NoProps.tsx",
			outputPath: "tests/fixtures/.tmp-no-props-output.png",
			port: 0,
			phaseTimeoutMs: 10_000,
			cleanupGraceMs: 1_000,
			onListening: (address) => { baseUrl = `http://${address.address}:${address.port}`; },
			ensureStudioWindow: async () => ({ hwnd: "123456", title: "fake studio" }),
			captureWindow: async (_hwnd, outputPngPath) => {
				await writeFile(outputPngPath, buildRawCapture(rawWidth, rawHeight, [10, 20, 30]));
				return { x: 0, y: 0, width: rawWidth, height: rawHeight };
			},
		}),
		(async () => {
			while (!baseUrl) await new Promise((resolve) => setTimeout(resolve, 5));
			await actAsPlugin(baseUrl);
		})(),
	]).then(([captureResult]) => captureResult);

	assert.equal(result.width, rawWidth - TRIM_THICKNESS * 2);
	assert.equal(result.height, rawHeight - TRIM_THICKNESS * 2);
	assert.ok(result.outputPath.endsWith("tmp-no-props-output.png"));
});

test("a marker-detection failure after 'done' still reports 'done' to the plugin, so cleanup proceeds", async () => {
	let baseUrl = "";

	const [captureOutcome] = await Promise.all([
		runCapture({
			componentPath: "tests/fixtures/components/NoProps.tsx",
			outputPath: "tests/fixtures/.tmp-crop-failure-output.png",
			port: 0,
			phaseTimeoutMs: 10_000,
			cleanupGraceMs: 1_000,
			onListening: (address) => { baseUrl = `http://${address.address}:${address.port}`; },
			ensureStudioWindow: async () => ({ hwnd: "123456", title: "fake studio" }),
			captureWindow: async (_hwnd, outputPngPath) => {
				// A raw capture with no marker at all - the session still reaches 'done' (the raw
				// screenshot was saved), but cropping afterward fails.
				const blank = Buffer.alloc(20 * 20 * 4, 0);
				await writeFile(outputPngPath, encodeRgba8Png(blank, 20, 20));
				return { x: 0, y: 0, width: 20, height: 20 };
			},
		}).then(
			(value) => ({ status: "fulfilled" as const, value }),
			(error) => ({ status: "rejected" as const, error }),
		),
		(async () => {
			while (!baseUrl) await new Promise((resolve) => setTimeout(resolve, 5));
			await actAsPlugin(baseUrl, "done");
		})(),
	]);

	assert.equal(captureOutcome.status, "rejected");
	if (captureOutcome.status === "rejected") {
		assert.match(String(captureOutcome.error), /no marker border/i);
	}
});

test("the plugin reporting 'failed' surfaces as the command's rejection reason", async () => {
	let baseUrl = "";

	const [captureOutcome] = await Promise.all([
		runCapture({
			componentPath: "tests/fixtures/components/NoProps.tsx",
			outputPath: "tests/fixtures/.tmp-plugin-failure-output.png",
			port: 0,
			phaseTimeoutMs: 5_000,
			cleanupGraceMs: 200,
			onListening: (address) => { baseUrl = `http://${address.address}:${address.port}`; },
			ensureStudioWindow: async () => ({ hwnd: "123456", title: "fake studio" }),
		}).then(
			(value) => ({ status: "fulfilled" as const, value }),
			(error) => ({ status: "rejected" as const, error }),
		),
		(async () => {
			while (!baseUrl) await new Promise((resolve) => setTimeout(resolve, 5));
			let manifest: SessionManifest | undefined;
			for (let attempt = 0; attempt < 100 && !manifest; attempt += 1) {
				const response = await fetch(`${baseUrl}/session?pluginProtocolVersion=${PROTOCOL_VERSION}`);
				if (response.status === 200) manifest = await response.json() as SessionManifest;
				else await new Promise((resolve) => setTimeout(resolve, 20));
			}
			assert.ok(manifest);
			await fetch(`${baseUrl}/session/${manifest.sessionId}/ack`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ phase: "failed", message: "Capture model failed to load" }),
			});
		})(),
	]);

	assert.equal(captureOutcome.status, "rejected");
	if (captureOutcome.status === "rejected") {
		assert.match(String(captureOutcome.error), /Capture model failed to load/);
	}
});

test("a stale installed plugin (mismatched protocol version) fails fast through the full runCapture path, rather than timing out", async () => {
	let baseUrl = "";
	const start = Date.now();

	const [captureOutcome] = await Promise.all([
		runCapture({
			componentPath: "tests/fixtures/components/NoProps.tsx",
			outputPath: "tests/fixtures/.tmp-stale-plugin-output.png",
			port: 0,
			// Deliberately much longer than this test should ever take: a regression that makes the
			// mismatch fall through to a timeout instead of failing fast would otherwise still pass
			// (just slowly) rather than failing outright.
			phaseTimeoutMs: 20_000,
			cleanupGraceMs: 200,
			onListening: (address) => { baseUrl = `http://${address.address}:${address.port}`; },
			ensureStudioWindow: async () => ({ hwnd: "123456", title: "fake studio" }),
		}).then(
			(value) => ({ status: "fulfilled" as const, value }),
			(error) => ({ status: "rejected" as const, error }),
		),
		(async () => {
			while (!baseUrl) await new Promise((resolve) => setTimeout(resolve, 5));
			// A plugin built before the current protocol version, polling exactly as a real stale
			// installed plugin would - `session-server.ts` must reject this before ever returning a
			// manifest, so no model download or ack ever happens here. Polls (rather than a single
			// fetch) since the session doesn't exist yet until `buildCaptureModel` finishes compiling.
			let response: Response | undefined;
			for (let attempt = 0; attempt < 200 && (!response || response.status === 204); attempt += 1) {
				response = await fetch(`${baseUrl}/session?pluginProtocolVersion=0`);
				if (response.status === 204) await new Promise((resolve) => setTimeout(resolve, 20));
			}
			assert.equal(response?.status, 409);
		})(),
	]);

	const elapsedMs = Date.now() - start;
	assert.ok(elapsedMs < 5_000, `expected the mismatch to fail fast, took ${elapsedMs}ms`);
	assert.equal(captureOutcome.status, "rejected");
	if (captureOutcome.status === "rejected") {
		assert.match(String(captureOutcome.error), /protocol version/i);
		assert.match(String(captureOutcome.error), /install-plugin/);
	}
});
