import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { cropToMarker, MEASUREMENT_SAFETY_MARGIN } from "../../src/capture/marker-crop.js";
import { decodePng, encodeRgba8Png } from "../../src/bridge/png.js";
import { CONTENT_KEY_COLOR, MARKER_COLOR, MARKER_THICKNESS } from "../../roblox-src/marker-constants.js";

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

// Regression coverage for a real reported bug: capturing a component with no wrapping frame of its
// own (e.g. an unrounded UI-kit Button rendered directly under ThemeProvider) produced a wrong-sized,
// mis-cropped PNG, because the marker wrapper's content backing used to be fully transparent - any
// gap the component itself didn't paint let the marker border color bleed through into the *middle*
// of the content, not just its edges, confusing border measurement. The wrapper now backs the content
// with an opaque, distinctly-colored CONTENT_KEY_COLOR instead, and cropToMarker keys it back out to
// transparency after cropping - simulated here as a gap inside the content region (not touching the
// marker border) that must end up fully transparent, while real content pixels stay untouched.
test("content-key-colored gaps inside the cropped content are keyed out to transparency", async () => {
	const width = MARKER_THICKNESS * 2 + 28;
	const height = MARKER_THICKNESS * 2 + 18;
	const pixels = Buffer.alloc(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const onBorder = x < MARKER_THICKNESS || width - 1 - x < MARKER_THICKNESS || y < MARKER_THICKNESS || height - 1 - y < MARKER_THICKNESS;
			// A small notch of content-key color inside the content region, away from the border -
			// stands in for a rounded corner's or an icon/label gap's unpainted pixels.
			const inKeyNotch = x >= MARKER_THICKNESS + 2 && x < MARKER_THICKNESS + 5 && y >= MARKER_THICKNESS + 2 && y < MARKER_THICKNESS + 5;
			const color = onBorder ? [MARKER_COLOR.r, MARKER_COLOR.g, MARKER_COLOR.b] : inKeyNotch ? [CONTENT_KEY_COLOR.r, CONTENT_KEY_COLOR.g, CONTENT_KEY_COLOR.b] : [10, 20, 30];
			const offset = (y * width + x) * 4;
			pixels[offset] = color[0];
			pixels[offset + 1] = color[1];
			pixels[offset + 2] = color[2];
			pixels[offset + 3] = 255;
		}
	}
	const raw = encodeRgba8Png(pixels, width, height);

	const { png, contentBounds } = cropToMarker(raw);
	assert.deepEqual(contentBounds, { x: TRIM, y: TRIM, width: width - TRIM * 2, height: height - TRIM * 2 });

	const decoded = decodePng(png);
	for (let y = 0; y < decoded.height; y += 1) {
		for (let x = 0; x < decoded.width; x += 1) {
			const offset = (y * decoded.width + x) * 4;
			// The notch sat at absolute (MARKER_THICKNESS+2..4, MARKER_THICKNESS+2..4); relative to
			// the cropped content it's offset by TRIM (the crop's own top-left trim) less.
			const notchX = x + TRIM - MARKER_THICKNESS, notchY = y + TRIM - MARKER_THICKNESS;
			const inKeyNotch = notchX >= 2 && notchX < 5 && notchY >= 2 && notchY < 5;
			if (inKeyNotch) {
				assert.equal(decoded.pixels[offset + 3], 0, `expected pixel (${x},${y}) to be keyed out to transparent`);
			} else {
				assert.equal(decoded.pixels[offset], 10);
				assert.equal(decoded.pixels[offset + 1], 20);
				assert.equal(decoded.pixels[offset + 2], 30);
				assert.equal(decoded.pixels[offset + 3], 255);
			}
		}
	}
});
