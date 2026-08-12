import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { cropToMarker, MEASUREMENT_SAFETY_MARGIN } from "../../src/capture/marker-crop.js";
import { decodePng, encodeRgba8Png } from "../../src/bridge/png.js";
import { MARKER_THICKNESS } from "../../roblox-src/marker-constants.js";

const FIXTURES = "tests/fixtures/markers";
const TRIM = MARKER_THICKNESS + MEASUREMENT_SAFETY_MARGIN;
// Matches scripts/generate-marker-fixtures.js's WIDTH/HEIGHT for valid.png, color-shifted.png, and
// rounded-corner.png (all built from drawValidMarker on the same canvas size).
const WIDTH = MARKER_THICKNESS * 2 + 28;
const HEIGHT = MARKER_THICKNESS * 2 + 18;

test("a valid marker crops to the interior and excludes every border pixel", async () => {
	const raw = await readFile(`${FIXTURES}/valid.png`);
	const { png, markerOuterBounds, contentBounds } = cropToMarker(raw);
	assert.deepEqual(markerOuterBounds, { x: 0, y: 0, width: WIDTH, height: HEIGHT });
	assert.deepEqual(contentBounds, { x: TRIM, y: TRIM, width: WIDTH - TRIM * 2, height: HEIGHT - TRIM * 2 });

	const decoded = decodePng(png);
	assert.equal(decoded.width, WIDTH - TRIM * 2);
	assert.equal(decoded.height, HEIGHT - TRIM * 2);
	for (let i = 0; i < decoded.pixels.length; i += 4) {
		assert.equal(decoded.pixels[i], 10);
		assert.equal(decoded.pixels[i + 1], 20);
		assert.equal(decoded.pixels[i + 2], 30);
	}
});

test("a border within the documented color tolerance is still detected", async () => {
	const raw = await readFile(`${FIXTURES}/color-shifted.png`);
	const { contentBounds } = cropToMarker(raw);
	assert.deepEqual(contentBounds, { x: TRIM, y: TRIM, width: WIDTH - TRIM * 2, height: HEIGHT - TRIM * 2 });
});

test("a gap in the border reaching the outer edge is rejected", async () => {
	const raw = await readFile(`${FIXTURES}/edge-touching-gap.png`);
	assert.throws(() => cropToMarker(raw), /incomplete|non-rectangular|ambiguous/i);
});

test("two disjoint marker rectangles are rejected as ambiguous", async () => {
	const raw = await readFile(`${FIXTURES}/ambiguous.png`);
	assert.throws(() => cropToMarker(raw), /incomplete|non-rectangular|ambiguous/i);
});

test("content that is itself marker-colored, with no real border, is rejected rather than silently over-cropped", async () => {
	const raw = await readFile(`${FIXTURES}/exceeds-scan-limit.png`);
	assert.throws(() => cropToMarker(raw), /incomplete|non-rectangular|ambiguous/i);
});

test("an image with no marker pixels reports a clear not-found error", () => {
	const blank = Buffer.alloc(10 * 10 * 4, 0);
	const png = encodeRgba8Png(blank, 10, 10);
	assert.throws(() => cropToMarker(png), /no marker border/i);
});

// Regression coverage for a real reported bug: a rounded corner (UICorner) on the captured content
// leaves a gap - near that corner, inside the content's own nominal bounding box - where the marker's
// background shows through, deeper than MARKER_THICKNESS. cropToMarker measures the actual depth per
// edge rather than assuming a fixed thickness, so this must still crop successfully - with a wider
// trim applied to the whole top and left edges (the crop is rectangular; it can't follow the arc) -
// and the output must still contain no marker-colored pixel.
test("a rounded corner deeper than MARKER_THICKNESS is measured and trimmed, not rejected", async () => {
	const raw = await readFile(`${FIXTURES}/rounded-corner.png`);
	const CORNER_GAP_DEPTH = 6;
	const { png, contentBounds } = cropToMarker(raw);
	const cornerTrim = MARKER_THICKNESS + CORNER_GAP_DEPTH + MEASUREMENT_SAFETY_MARGIN;
	assert.deepEqual(contentBounds, {
		x: cornerTrim,
		y: cornerTrim,
		width: WIDTH - cornerTrim - TRIM,
		height: HEIGHT - cornerTrim - TRIM,
	});

	const decoded = decodePng(png);
	for (let i = 0; i < decoded.pixels.length; i += 4) {
		assert.equal(decoded.pixels[i], 10);
		assert.equal(decoded.pixels[i + 1], 20);
		assert.equal(decoded.pixels[i + 2], 30);
	}
});
