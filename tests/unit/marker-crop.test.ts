import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { cropToMarker } from "../../src/capture/marker-crop.js";
import { decodePng, encodeRgba8Png } from "../../src/bridge/png.js";

const FIXTURES = "tests/fixtures/markers";

test("a valid marker crops to the interior and excludes every border pixel", async () => {
	const raw = await readFile(`${FIXTURES}/valid.png`);
	const { png, markerOuterBounds, contentBounds } = cropToMarker(raw);
	assert.deepEqual(markerOuterBounds, { x: 0, y: 0, width: 40, height: 30 });
	assert.deepEqual(contentBounds, { x: 4, y: 4, width: 32, height: 22 });

	const decoded = decodePng(png);
	assert.equal(decoded.width, 32);
	assert.equal(decoded.height, 22);
	for (let i = 0; i < decoded.pixels.length; i += 4) {
		assert.equal(decoded.pixels[i], 10);
		assert.equal(decoded.pixels[i + 1], 20);
		assert.equal(decoded.pixels[i + 2], 30);
	}
});

test("a border within the documented color tolerance is still detected", async () => {
	const raw = await readFile(`${FIXTURES}/color-shifted.png`);
	const { contentBounds } = cropToMarker(raw);
	assert.deepEqual(contentBounds, { x: 4, y: 4, width: 32, height: 22 });
});

test("an incomplete border is rejected", async () => {
	const raw = await readFile(`${FIXTURES}/incomplete.png`);
	assert.throws(() => cropToMarker(raw), /incomplete|non-rectangular|ambiguous/i);
});

test("two disjoint marker rectangles are rejected as ambiguous", async () => {
	const raw = await readFile(`${FIXTURES}/ambiguous.png`);
	assert.throws(() => cropToMarker(raw), /incomplete|non-rectangular|ambiguous/i);
});

test("an image with no marker pixels reports a clear not-found error", () => {
	const blank = Buffer.alloc(10 * 10 * 4, 0);
	const png = encodeRgba8Png(blank, 10, 10);
	assert.throws(() => cropToMarker(png), /no marker border/i);
});
