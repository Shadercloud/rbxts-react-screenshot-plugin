/** Detects the marker border in a raw window capture and crops to its inner edges. */
import { decodePng, encodeRgba8Png } from "../bridge/png.js";
import { CONTENT_KEY_COLOR, MARKER_COLOR, MARKER_THICKNESS } from "../../roblox-src/marker-constants.js";
import { MARKER_TOLERANCE } from "../types/protocol.js";
import type { RgbColor } from "./color.js";
import type { Bounds } from "../types/session.js";

export interface MarkerCropResult {
	png: Buffer;
	markerOuterBounds: Bounds;
	contentBounds: Bounds;
}

export interface CropToMarkerOptions {
	/** The color the marker wrapper actually backed its content with (see `runCapture`'s `contentKeyColor` option); defaults to `CONTENT_KEY_COLOR`. */
	contentKeyColor?: RgbColor;
}

function isMarkerColor(r: number, g: number, b: number): boolean {
	return Math.abs(r - MARKER_COLOR.r) <= MARKER_TOLERANCE
		&& Math.abs(g - MARKER_COLOR.g) <= MARKER_TOLERANCE
		&& Math.abs(b - MARKER_COLOR.b) <= MARKER_TOLERANCE;
}

function isCloseToColor(r: number, g: number, b: number, color: RgbColor, tolerance: number): boolean {
	return Math.abs(r - color.r) <= tolerance && Math.abs(g - color.g) <= tolerance && Math.abs(b - color.b) <= tolerance;
}

/**
 * Keys the opaque content-backing color (see `CONTENT_KEY_COLOR`'s own doc comment) back out to
 * transparency, in place, after cropping: every pixel the captured component didn't itself paint -
 * gaps around a rounded corner, spacing between an icon and a label, anywhere the component's own
 * automatically-sized bounding box isn't fully covered - shows this color instead of the marker
 * border color precisely so it never confuses the border measurement above, then gets restored to
 * transparent here rather than shipping as a visible solid-green fill in the final PNG.
 */
function keyOutContentBackground(pixels: Buffer, contentKeyColor: RgbColor): void {
	for (let offset = 0; offset < pixels.length; offset += 4) {
		if (isCloseToColor(pixels[offset], pixels[offset + 1], pixels[offset + 2], contentKeyColor, MARKER_TOLERANCE)) pixels[offset + 3] = 0;
	}
}

type Channel = "r" | "g" | "b";
const CHANNELS: Channel[] = ["r", "g", "b"];

/**
 * Splits a color's three channels into those meaningfully above its own midpoint ("high") and at or
 * below it ("low") - e.g. pure green (0, 255, 0) splits to high=[g], low=[r, b]. Used by
 * {@link nibbleContentKeySpill} to measure, for any *arbitrary* chosen key color, how strongly a
 * given pixel has been tinted toward it - not just green. A key color with no clear high/low split
 * (a gray, or anything without at least one channel well separated from the others) can't be
 * meaningfully spill-detected this way, so callers should skip the nibble pass entirely in that case
 * (checked via the returned arrays' lengths) - the same real-world constraint any chroma-key color
 * has: pick something vivid and unlike your actual content, not a neutral tone.
 */
function keySpillAxes(color: RgbColor): { high: Channel[]; low: Channel[] } {
	const mid = (Math.max(color.r, color.g, color.b) + Math.min(color.r, color.g, color.b)) / 2;
	const high = CHANNELS.filter((channel) => color[channel] > mid);
	const low = CHANNELS.filter((channel) => color[channel] <= mid);
	return { high, low };
}

function average(r: number, g: number, b: number, channels: Channel[]): number {
	const values = { r, g, b };
	return channels.reduce((sum, channel) => sum + values[channel], 0) / channels.length;
}

/** How far a pixel leans toward the key color's "high" channels over its "low" ones - see {@link keySpillAxes}. */
function spillExcess(r: number, g: number, b: number, axes: { high: Channel[]; low: Channel[] }): number {
	return average(r, g, b, axes.high) - average(r, g, b, axes.low);
}

/** Below this fraction of the key color's own excess, a pixel isn't considered spill-tinted enough to nibble. */
const NIBBLE_THRESHOLD_RATIO = 0.05;
/** A key color whose own high/low channel split is weaker than this can't be reliably spill-detected; skip nibbling. */
const MIN_KEY_EXCESS = 64;
/**
 * A real anti-aliased fringe is only ever 1-2px wide; capping the erosion at a handful of rings
 * bounds how far a mistaken nibble could ever eat into genuinely key-colored-looking real content,
 * while still comfortably covering the fringe itself.
 */
const NIBBLE_ITERATIONS = 4;

/**
 * Erodes the cropped content's already-transparent holes outward, one ring of pixels at a time,
 * removing any *still-opaque* pixel bordering a hole whose color leans toward the key color by more
 * than a small fraction of the key color's own excess (see {@link spillExcess}) - i.e. "greenish"
 * (for the default green key), not just "green". This catches Studio's own anti-aliasing at content
 * edges, which blends the content's true color with the key-colored backing behind it (e.g. a pure
 * `#00FF00` backing showing through a half-covered pixel as `#0DFF0D`, or through a mostly-opaque one
 * as a barely-tinted `#BEECC7`) - {@link keyOutContentBackground}'s exact-match pass alone leaves
 * exactly this kind of fringe visibly tinted in the final PNG. Runs after that exact-match pass, only
 * ever touching pixels already adjacent to a hole, so real content far from any keyed-out pixel is
 * never at risk regardless of its own color.
 */
function nibbleContentKeySpill(pixels: Buffer, width: number, height: number, contentKeyColor: RgbColor): void {
	const axes = keySpillAxes(contentKeyColor);
	if (axes.high.length === 0 || axes.low.length === 0) return;
	const keyExcess = spillExcess(contentKeyColor.r, contentKeyColor.g, contentKeyColor.b, axes);
	if (keyExcess < MIN_KEY_EXCESS) return;
	const threshold = keyExcess * NIBBLE_THRESHOLD_RATIO;

	const transparent = new Uint8Array(width * height);
	for (let index = 0; index < width * height; index += 1) transparent[index] = pixels[index * 4 + 3] === 0 ? 1 : 0;

	for (let iteration = 0; iteration < NIBBLE_ITERATIONS; iteration += 1) {
		const toNibble: number[] = [];
		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width; x += 1) {
				const index = y * width + x;
				if (transparent[index]) continue;
				const hasTransparentNeighbor = (x > 0 && transparent[index - 1] === 1)
					|| (x < width - 1 && transparent[index + 1] === 1)
					|| (y > 0 && transparent[index - width] === 1)
					|| (y < height - 1 && transparent[index + width] === 1);
				if (!hasTransparentNeighbor) continue;
				const offset = index * 4;
				if (spillExcess(pixels[offset], pixels[offset + 1], pixels[offset + 2], axes) > threshold) toNibble.push(index);
			}
		}
		if (toNibble.length === 0) break;
		for (const index of toNibble) {
			transparent[index] = 1;
			pixels[index * 4 + 3] = 0;
		}
	}
}

/**
 * The same spill test {@link nibbleContentKeySpill} uses internally, exposed for tests: true if a
 * pixel leans toward `contentKeyColor` by more than the nibble threshold - i.e. it's tinted enough
 * that, had it been adjacent to a hole during cropping, it would have been keyed out. A converged
 * crop should have no such pixel left at any edge that started adjacent to one.
 */
export function isSpillTintedTowardKeyColor(r: number, g: number, b: number, contentKeyColor: RgbColor): boolean {
	const axes = keySpillAxes(contentKeyColor);
	if (axes.high.length === 0 || axes.low.length === 0) return false;
	const keyExcess = spillExcess(contentKeyColor.r, contentKeyColor.g, contentKeyColor.b, axes);
	if (keyExcess < MIN_KEY_EXCESS) return false;
	return spillExcess(r, g, b, axes) > keyExcess * NIBBLE_THRESHOLD_RATIO;
}

const AMBIGUOUS_ERROR = "The marker border is incomplete, non-rectangular, or ambiguous";

/**
 * A small buffer added to every measured border depth, covering anti-aliasing at the exact
 * border/content transition pixel - not a guess at how much content might bleed, since the scan
 * in {@link cropToMarker} already measures that directly per capture. Exported so tests can compute
 * the exact expected crop geometry from the real constants instead of duplicating this number.
 */
export const MEASUREMENT_SAFETY_MARGIN = 2;

/**
 * A single valid marker's pixels must all belong to one connected region - two disjoint
 * marker-colored blobs (or a border with a hole punched clean through it) are rejected, since either
 * makes "which side is the border" genuinely ambiguous.
 */
function isSingleConnectedRegion(isMarker: Uint8Array, width: number, height: number, minX: number, minY: number, maxX: number, maxY: number, totalMarkerPixels: number): boolean {
	const seen = new Uint8Array(width * height);
	const stack: number[] = [minY * width + minX];
	// minX,minY is always itself a marker pixel (it's derived from one), so this is a valid seed.
	seen[minY * width + minX] = 1;
	let count = 0;
	while (stack.length > 0) {
		const index = stack.pop() as number;
		count += 1;
		const x = index % width;
		const y = (index - x) / width;
		const neighbors: Array<[number, number]> = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
		for (const [nx, ny] of neighbors) {
			if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
			const neighborIndex = ny * width + nx;
			if (seen[neighborIndex] || !isMarker[neighborIndex]) continue;
			seen[neighborIndex] = 1;
			stack.push(neighborIndex);
		}
	}
	return count === totalMarkerPixels;
}

/**
 * Measures how many consecutive marker-colored pixels run inward from `(x, y)` in direction
 * `(dx, dy)`, stopping at the first non-marker pixel (or the edge of the image, which can only
 * happen just outside the outer bbox - see {@link measureEdgeDepth}).
 */
function markerRunLength(isMarker: Uint8Array, width: number, height: number, x: number, y: number, dx: number, dy: number): number {
	let depth = 0;
	let px = x;
	let py = y;
	for (;;) {
		if (px < 0 || px >= width || py < 0 || py >= height) break;
		if (!isMarker[py * width + px]) break;
		depth += 1;
		px += dx;
		py += dy;
	}
	return depth;
}

/**
 * Measures one edge's true border depth: for every row (or column) crossing the bbox, casts a ray
 * inward from that edge and records how many marker-colored pixels it crosses before reaching real
 * content. Returns the deepest such measurement, which is what {@link cropToMarker} trims - using the
 * max (not e.g. the center or an average) is what guarantees no marker-colored pixel can leak into
 * the output even when the border renders unevenly (a rounded corner on the captured content is
 * exactly this: deeper only near the corner, normal thickness everywhere else along the same edge).
 *
 * Two ray outcomes don't count as a real measurement of this edge's depth:
 * - The ray reaches the *opposite* side of the bbox without ever hitting non-marker content: that
 *   row/column has no content in it at all - it's entirely part of the perpendicular border (e.g. a
 *   row within the marker's top-border band, scanned while measuring the *left* edge) - so it says
 *   nothing about this edge's own thickness and is skipped rather than treated as an enormous depth.
 * - The ray's very first pixel - right at the bbox's outer edge - already isn't marker-colored: a
 *   hole reaching the outer edge, not a plausible border-thickness measurement at all. Rejected
 *   immediately as a genuinely broken/incomplete border.
 *
 * If every row/column is skipped this way, there's no content anywhere along this edge to measure
 * against, which is itself rejected as ambiguous.
 */
function measureEdgeDepth(isMarker: Uint8Array, width: number, height: number, start: number, perpendicularFrom: number, perpendicularTo: number, dx: number, dy: number, fullSpan: number): number {
	let maxDepth = -1;
	for (let perpendicular = perpendicularFrom; perpendicular <= perpendicularTo; perpendicular += 1) {
		const x = dx !== 0 ? start : perpendicular;
		const y = dx !== 0 ? perpendicular : start;
		const depth = markerRunLength(isMarker, width, height, x, y, dx, dy);
		if (depth === 0) throw new Error(AMBIGUOUS_ERROR);
		if (depth === fullSpan) continue;
		if (depth > maxDepth) maxDepth = depth;
	}
	if (maxDepth < 0) throw new Error(AMBIGUOUS_ERROR);
	return maxDepth;
}

/**
 * Detects the marker's outer rectangle, then crops to its content by *measuring* how thick the
 * border actually renders on each side - rather than assuming a fixed thickness - and validates the
 * measurement stayed within a generous, reasonable bound.
 *
 * This matters because the border's real, rendered thickness isn't perfectly uniform: content whose
 * own size comes from a cascade of nested `AutomaticSize` frames can bleed a pixel or two into the
 * marker's innermost edge (per-level rounding), and - much more visibly - a rounded corner
 * (`UICorner`) on the captured content itself leaves a gap where the marker's own background shows
 * through, near that corner, whose depth scales with the corner radius and has no fixed upper bound
 * in general. A single guessed constant either rejects legitimately-rounded real-world components
 * (too small) or eats into small, unrounded content on every capture regardless of whether any
 * bleed actually occurred (too large - confirmed the hard way: an earlier fixed value cropped a
 * ~48px-tall button down to 12px of visible content). Measuring the actual worst-case depth per
 * capture, along each edge independently, adapts to whatever the real content needs with no
 * per-edge cost beyond that.
 */
export function cropToMarker(rawPng: Buffer, options: CropToMarkerOptions = {}): MarkerCropResult {
	const contentKeyColor = options.contentKeyColor ?? CONTENT_KEY_COLOR;
	const { width, height, pixels } = decodePng(rawPng);
	const isMarker = new Uint8Array(width * height);
	let minX = width, minY = height, maxX = -1, maxY = -1;
	let totalMarkerPixels = 0;

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const offset = (y * width + x) * 4;
			if (!isMarkerColor(pixels[offset], pixels[offset + 1], pixels[offset + 2])) continue;
			isMarker[y * width + x] = 1;
			totalMarkerPixels += 1;
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
		}
	}
	if (maxX < 0) throw new Error("No marker border was found in the captured screenshot");

	const outerWidth = maxX - minX + 1;
	const outerHeight = maxY - minY + 1;
	if (outerWidth <= MARKER_THICKNESS * 2 || outerHeight <= MARKER_THICKNESS * 2) {
		throw new Error("The detected marker is too small to contain any content");
	}
	if (!isSingleConnectedRegion(isMarker, width, height, minX, minY, maxX, maxY, totalMarkerPixels)) {
		throw new Error(AMBIGUOUS_ERROR);
	}

	const safetyMargin = MEASUREMENT_SAFETY_MARGIN;
	const leftDepth = measureEdgeDepth(isMarker, width, height, minX, minY, maxY, 1, 0, outerWidth);
	const rightDepth = measureEdgeDepth(isMarker, width, height, maxX, minY, maxY, -1, 0, outerWidth);
	const topDepth = measureEdgeDepth(isMarker, width, height, minY, minX, maxX, 0, 1, outerHeight);
	const bottomDepth = measureEdgeDepth(isMarker, width, height, maxY, minX, maxX, 0, -1, outerHeight);

	// A generous multiple of the declared thickness: beyond this, a measured depth is treated as a
	// broken/ambiguous capture (e.g. the content itself is marker-colored except for one thin sliver)
	// rather than a legitimately deep rounded-corner gap.
	const scanLimit = MARKER_THICKNESS * 8;
	if (Math.max(leftDepth, rightDepth, topDepth, bottomDepth) > scanLimit) throw new Error(AMBIGUOUS_ERROR);

	const leftTrim = leftDepth + safetyMargin;
	const rightTrim = rightDepth + safetyMargin;
	const topTrim = topDepth + safetyMargin;
	const bottomTrim = bottomDepth + safetyMargin;

	const markerOuterBounds: Bounds = { x: minX, y: minY, width: outerWidth, height: outerHeight };
	const contentBounds: Bounds = {
		x: minX + leftTrim,
		y: minY + topTrim,
		width: outerWidth - leftTrim - rightTrim,
		height: outerHeight - topTrim - bottomTrim,
	};
	if (contentBounds.width <= 0 || contentBounds.height <= 0) {
		throw new Error("The detected marker is too small to contain any content");
	}

	// Defense in depth: confirm the measured trim actually cleared every marker-colored pixel from
	// the content region (e.g. a second, disjoint marker-colored blob positioned entirely within it
	// would otherwise slip past the connected-region and per-edge checks above).
	for (let y = contentBounds.y; y < contentBounds.y + contentBounds.height; y += 1) {
		for (let x = contentBounds.x; x < contentBounds.x + contentBounds.width; x += 1) {
			if (isMarker[y * width + x]) throw new Error(AMBIGUOUS_ERROR);
		}
	}

	const cropped = Buffer.alloc(contentBounds.width * contentBounds.height * 4);
	for (let row = 0; row < contentBounds.height; row += 1) {
		const sourceOffset = ((contentBounds.y + row) * width + contentBounds.x) * 4;
		const destOffset = row * contentBounds.width * 4;
		pixels.copy(cropped, destOffset, sourceOffset, sourceOffset + contentBounds.width * 4);
	}
	keyOutContentBackground(cropped, contentKeyColor);
	nibbleContentKeySpill(cropped, contentBounds.width, contentBounds.height, contentKeyColor);

	return { png: encodeRgba8Png(cropped, contentBounds.width, contentBounds.height), markerOuterBounds, contentBounds };
}
