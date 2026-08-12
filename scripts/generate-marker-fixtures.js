/**
 * Regenerates tests/fixtures/markers/*.png from the current MARKER_THICKNESS constant and
 * marker-crop.ts's adaptive-measurement algorithm. Run manually (`node scripts/generate-marker-fixtures.js`,
 * after `npm run build:bridge`) whenever MARKER_THICKNESS or the measurement algorithm's constants
 * change - these are checked-in binary fixtures with no other source of truth, and previously went
 * silently stale against a hardcoded thickness assumption in the tests themselves.
 */
const fs = require("node:fs");
const path = require("node:path");
const { encodeRgba8Png } = require(path.join(process.cwd(), "dist", "src", "bridge", "png.js"));
const { MARKER_COLOR, MARKER_THICKNESS } = require(path.join(process.cwd(), "dist", "roblox-src", "marker-constants.js"));

const CONTENT_COLOR = [10, 20, 30];
const FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures", "markers");

function makeCanvas(width, height) {
	return Buffer.alloc(width * height * 4);
}

function setPixel(pixels, width, x, y, [r, g, b], a = 255) {
	const offset = (y * width + x) * 4;
	pixels[offset] = r;
	pixels[offset + 1] = g;
	pixels[offset + 2] = b;
	pixels[offset + 3] = a;
}

/** Fills a solid rectangle (inclusive bounds) with the given color. */
function fillRect(pixels, width, x0, y0, x1, y1, color) {
	for (let y = y0; y <= y1; y += 1) {
		for (let x = x0; x <= x1; x += 1) {
			setPixel(pixels, width, x, y, color);
		}
	}
}

/** Draws a single valid marker rectangle spanning the whole canvas: a MARKER_THICKNESS border around solid content. */
function drawValidMarker(pixels, width, height, borderColor = [MARKER_COLOR.r, MARKER_COLOR.g, MARKER_COLOR.b]) {
	fillRect(pixels, width, 0, 0, width - 1, height - 1, borderColor);
	fillRect(pixels, width, MARKER_THICKNESS, MARKER_THICKNESS, width - 1 - MARKER_THICKNESS, height - 1 - MARKER_THICKNESS, CONTENT_COLOR);
}

function writeFixture(name, width, height, draw) {
	const pixels = makeCanvas(width, height);
	draw(pixels);
	const png = encodeRgba8Png(pixels, width, height);
	fs.writeFileSync(path.join(FIXTURES_DIR, name), png);
	console.log(`Wrote ${name} (${width}x${height})`);
}

const WIDTH = MARKER_THICKNESS * 2 + 28;
const HEIGHT = MARKER_THICKNESS * 2 + 18;

writeFixture("valid.png", WIDTH, HEIGHT, (pixels) => drawValidMarker(pixels, WIDTH, HEIGHT));

// A border color shifted within MARKER_TOLERANCE (8) of MARKER_COLOR on every channel - still detected.
writeFixture("color-shifted.png", WIDTH, HEIGHT, (pixels) => drawValidMarker(pixels, WIDTH, HEIGHT, [MARKER_COLOR.r - 6, MARKER_COLOR.g + 6, MARKER_COLOR.b - 6]));

// A gap punched through the border that reaches all the way to the outer edge (row 0) - the
// outermost pixel on those scan lines isn't marker-colored at all, which cropToMarker treats as an
// unrecoverable hole in the border (depth 0), not something any amount of adaptive trim can absorb.
writeFixture("edge-touching-gap.png", WIDTH, HEIGHT, (pixels) => {
	drawValidMarker(pixels, WIDTH, HEIGHT);
	fillRect(pixels, WIDTH, Math.floor(WIDTH / 2) - 3, 0, Math.floor(WIDTH / 2) + 3, MARKER_THICKNESS - 1, CONTENT_COLOR);
});

// Two disjoint marker-colored rectangles on one canvas - rejected as ambiguous (fails the
// single-connected-region check).
const AMBIGUOUS_SIZE = 60;
writeFixture("ambiguous.png", AMBIGUOUS_SIZE, AMBIGUOUS_SIZE, (pixels) => {
	// First marker rectangle, top-left quadrant.
	fillRect(pixels, AMBIGUOUS_SIZE, 2, 2, 2 + WIDTH - 1, 2 + HEIGHT - 1, [MARKER_COLOR.r, MARKER_COLOR.g, MARKER_COLOR.b]);
	fillRect(
		pixels, AMBIGUOUS_SIZE,
		2 + MARKER_THICKNESS, 2 + MARKER_THICKNESS,
		2 + WIDTH - 1 - MARKER_THICKNESS, 2 + HEIGHT - 1 - MARKER_THICKNESS,
		CONTENT_COLOR,
	);
	// Second, disjoint marker rectangle, bottom-right quadrant.
	const ox = AMBIGUOUS_SIZE - WIDTH - 2, oy = AMBIGUOUS_SIZE - HEIGHT - 2;
	fillRect(pixels, AMBIGUOUS_SIZE, ox, oy, ox + WIDTH - 1, oy + HEIGHT - 1, [MARKER_COLOR.r, MARKER_COLOR.g, MARKER_COLOR.b]);
	fillRect(
		pixels, AMBIGUOUS_SIZE,
		ox + MARKER_THICKNESS, oy + MARKER_THICKNESS,
		ox + WIDTH - 1 - MARKER_THICKNESS, oy + HEIGHT - 1 - MARKER_THICKNESS,
		CONTENT_COLOR,
	);
});

// Regression coverage for the real reported bug: a rounded corner (UICorner) on the captured content
// leaves a gap - near that corner, inside the content's own nominal bounding box - where the marker's
// background shows through, deeper than MARKER_THICKNESS. Modeled here as a square notch at the
// top-left corner (cruder than a real arc, but exercises the same "this edge's true depth is deeper
// than MARKER_THICKNESS, only near one end of it" shape) extended CORNER_GAP_DEPTH beyond the normal
// border. Must still crop successfully, with the wider measured depth applied to the whole top and
// left edges (the crop is a rectangle - it can't follow the arc), leaving no marker pixel in the output.
const CORNER_GAP_DEPTH = 6;
writeFixture("rounded-corner.png", WIDTH, HEIGHT, (pixels) => {
	drawValidMarker(pixels, WIDTH, HEIGHT);
	fillRect(
		pixels, WIDTH,
		MARKER_THICKNESS, MARKER_THICKNESS,
		MARKER_THICKNESS + CORNER_GAP_DEPTH - 1, MARKER_THICKNESS + CORNER_GAP_DEPTH - 1,
		[MARKER_COLOR.r, MARKER_COLOR.g, MARKER_COLOR.b],
	);
});

// Content that is itself marker-colored, filling the entire canvas with no distinguishable border at
// all - genuinely ambiguous (there's no way to tell where the border ends), and deep enough on every
// edge to exceed cropToMarker's scan limit rather than merely its "no marker pixels found" check.
const EXCEEDS_LIMIT_SIZE = MARKER_THICKNESS * 8 + 10;
writeFixture("exceeds-scan-limit.png", EXCEEDS_LIMIT_SIZE, EXCEEDS_LIMIT_SIZE, (pixels) => {
	fillRect(pixels, EXCEEDS_LIMIT_SIZE, 0, 0, EXCEEDS_LIMIT_SIZE - 1, EXCEEDS_LIMIT_SIZE - 1, [MARKER_COLOR.r, MARKER_COLOR.g, MARKER_COLOR.b]);
});
