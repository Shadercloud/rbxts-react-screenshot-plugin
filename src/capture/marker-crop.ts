/** Detects the marker border in a raw window capture and crops to its inner edges. */
import { decodePng, encodeRgba8Png } from "../bridge/png.js";
import { MARKER_COLOR, MARKER_THICKNESS } from "../../roblox-src/marker-constants.js";
import { BORDER_SLACK, MARKER_TOLERANCE } from "../types/protocol.js";
import type { Bounds } from "../types/session.js";

export interface MarkerCropResult {
	png: Buffer;
	markerOuterBounds: Bounds;
	contentBounds: Bounds;
}

function isMarkerColor(r: number, g: number, b: number): boolean {
	return Math.abs(r - MARKER_COLOR.r) <= MARKER_TOLERANCE
		&& Math.abs(g - MARKER_COLOR.g) <= MARKER_TOLERANCE
		&& Math.abs(b - MARKER_COLOR.b) <= MARKER_TOLERANCE;
}

/**
 * A single valid marker is exactly the border band of its own bounding box: every pixel on that
 * band must be marker-colored and every pixel strictly inside it must not be. Any deviation —
 * a gap, a non-rectangular shape, or a second disjoint marker-colored region — fails this check,
 * so incomplete, implausible, and ambiguous candidates are all rejected by the same pass.
 */
export function cropToMarker(rawPng: Buffer): MarkerCropResult {
	const { width, height, pixels } = decodePng(rawPng);
	const isMarker = new Uint8Array(width * height);
	let minX = width, minY = height, maxX = -1, maxY = -1;

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const offset = (y * width + x) * 4;
			if (!isMarkerColor(pixels[offset], pixels[offset + 1], pixels[offset + 2])) continue;
			isMarker[y * width + x] = 1;
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
		}
	}
	if (maxX < 0) throw new Error("No marker border was found in the captured screenshot");

	// The tolerant zone (see below) straddles the nominal border/content boundary on both sides, so
	// the guaranteed-unambiguous interior only starts BORDER_SLACK pixels further in than
	// MARKER_THICKNESS alone - trimming to that wider boundary, not just MARKER_THICKNESS, is what
	// guarantees the final image can never contain a stray marker-colored (or ambiguously-bled) pixel.
	const trimThickness = MARKER_THICKNESS + BORDER_SLACK;
	const outerWidth = maxX - minX + 1;
	const outerHeight = maxY - minY + 1;
	if (outerWidth <= trimThickness * 2 || outerHeight <= trimThickness * 2) {
		throw new Error("The detected marker is too small to contain any content");
	}

	// Three zones, not two: the outer (MARKER_THICKNESS - BORDER_SLACK) pixels of the border band must
	// be marker-colored (still catches a genuinely incomplete/non-rectangular/miscolored border), the
	// following 2*BORDER_SLACK pixels straddling the nominal border/content boundary may be either
	// color (tolerates AutomaticSize-cascade rounding bleed in either direction - see BORDER_SLACK's
	// own doc comment), and the true interior beyond that must still never be marker-colored (still
	// catches content that happens to use a marker-colored background).
	const strictThickness = MARKER_THICKNESS - BORDER_SLACK;
	for (let y = minY; y <= maxY; y += 1) {
		for (let x = minX; x <= maxX; x += 1) {
			const distanceFromOuterEdge = Math.min(x - minX, maxX - x, y - minY, maxY - y);
			const marker = isMarker[y * width + x] === 1;
			if (distanceFromOuterEdge < strictThickness) {
				if (!marker) throw new Error("The marker border is incomplete, non-rectangular, or ambiguous");
			} else if (distanceFromOuterEdge >= trimThickness) {
				if (marker) throw new Error("The marker border is incomplete, non-rectangular, or ambiguous");
			}
			// else: within the tolerant band straddling the border/content boundary - either color is acceptable.
		}
	}

	const markerOuterBounds: Bounds = { x: minX, y: minY, width: outerWidth, height: outerHeight };
	const contentBounds: Bounds = {
		x: minX + trimThickness,
		y: minY + trimThickness,
		width: outerWidth - trimThickness * 2,
		height: outerHeight - trimThickness * 2,
	};

	const cropped = Buffer.alloc(contentBounds.width * contentBounds.height * 4);
	for (let row = 0; row < contentBounds.height; row += 1) {
		const sourceOffset = ((contentBounds.y + row) * width + contentBounds.x) * 4;
		const destOffset = row * contentBounds.width * 4;
		pixels.copy(cropped, destOffset, sourceOffset, sourceOffset + contentBounds.width * 4);
	}

	return { png: encodeRgba8Png(cropped, contentBounds.width, contentBounds.height), markerOuterBounds, contentBounds };
}
