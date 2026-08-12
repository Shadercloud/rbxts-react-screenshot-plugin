/**
 * Regenerates tests/fixtures/markers/*.png from the current MARKER_THICKNESS/BORDER_SLACK constants.
 * Run manually (`node scripts/generate-marker-fixtures.js`, after `npm run build:bridge`) whenever
 * those constants change - these are checked-in binary fixtures with no other source of truth, and
 * previously went silently stale against a hardcoded thickness assumption in the tests themselves.
 */
const fs = require("node:fs");
const path = require("node:path");
const { encodeRgba8Png } = require(path.join(process.cwd(), "dist", "src", "bridge", "png.js"));
const { MARKER_COLOR, MARKER_THICKNESS } = require(path.join(process.cwd(), "dist", "roblox-src", "marker-constants.js"));
const { BORDER_SLACK } = require(path.join(process.cwd(), "dist", "src", "types", "protocol.js"));

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

// An incomplete border: a gap punched through the middle of the top edge, well outside the tolerant
// slack band (BORDER_SLACK pixels deep at the border/content boundary) - must still be rejected.
writeFixture("incomplete.png", WIDTH, HEIGHT, (pixels) => {
	drawValidMarker(pixels, WIDTH, HEIGHT);
	const gapY = Math.max(0, MARKER_THICKNESS - BORDER_SLACK - 1);
	fillRect(pixels, WIDTH, Math.floor(WIDTH / 2) - 3, gapY, Math.floor(WIDTH / 2) + 3, gapY, CONTENT_COLOR);
});

// Two disjoint marker-colored rectangles on one canvas - rejected as ambiguous.
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

// A marker whose innermost BORDER_SLACK pixels are bled by content (tolerated) on one edge, and whose
// content side has marker color bleeding BORDER_SLACK pixels back out (also tolerated) on another -
// exercises the actual bug fix (AutomaticSize-cascade rounding bleed) at the unit level.
writeFixture("slack-tolerated.png", WIDTH, HEIGHT, (pixels) => {
	drawValidMarker(pixels, WIDTH, HEIGHT);
	// Innermost BORDER_SLACK rows of the top border become content-colored (content bleeding in).
	for (let i = 0; i < BORDER_SLACK; i += 1) {
		const y = MARKER_THICKNESS - 1 - i;
		fillRect(pixels, WIDTH, MARKER_THICKNESS, y, WIDTH - 1 - MARKER_THICKNESS, y, CONTENT_COLOR);
	}
	// Outermost BORDER_SLACK rows of the left content area become marker-colored (marker bleeding out).
	for (let i = 0; i < BORDER_SLACK; i += 1) {
		const x = MARKER_THICKNESS + i;
		fillRect(pixels, WIDTH, x, MARKER_THICKNESS, x, HEIGHT - 1 - MARKER_THICKNESS, [MARKER_COLOR.r, MARKER_COLOR.g, MARKER_COLOR.b]);
	}
});

// A marker contaminated ONE pixel beyond the tolerant slack band - must still be rejected, proving the
// slack tolerance has a real, enforced limit rather than silently accepting arbitrarily bad borders.
writeFixture("slack-exceeded.png", WIDTH, HEIGHT, (pixels) => {
	drawValidMarker(pixels, WIDTH, HEIGHT);
	for (let i = 0; i < BORDER_SLACK + 1; i += 1) {
		const y = MARKER_THICKNESS - 1 - i;
		fillRect(pixels, WIDTH, MARKER_THICKNESS, y, WIDTH - 1 - MARKER_THICKNESS, y, CONTENT_COLOR);
	}
});
