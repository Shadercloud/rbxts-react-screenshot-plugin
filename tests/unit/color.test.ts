import assert from "node:assert/strict";
import test from "node:test";

import { parseHexColor } from "../../src/capture/color.js";

test("parseHexColor parses a '#RRGGBB' string", () => {
	assert.deepEqual(parseHexColor("#00FF00"), { r: 0, g: 255, b: 0 });
});

test("parseHexColor parses a bare 'RRGGBB' string with no leading '#'", () => {
	assert.deepEqual(parseHexColor("FF00FF"), { r: 255, g: 0, b: 255 });
});

test("parseHexColor is case-insensitive", () => {
	assert.deepEqual(parseHexColor("#aAbBcC"), { r: 0xaa, g: 0xbb, b: 0xcc });
});

test("parseHexColor rejects the wrong number of digits", () => {
	assert.throws(() => parseHexColor("#FFF"), /valid hex color/i);
	assert.throws(() => parseHexColor("#FFFFFFF"), /valid hex color/i);
});

test("parseHexColor rejects non-hex characters", () => {
	assert.throws(() => parseHexColor("#GGGGGG"), /valid hex color/i);
	assert.throws(() => parseHexColor("not-a-color"), /valid hex color/i);
});
