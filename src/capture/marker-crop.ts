/** Detects the marker border in a raw window capture and crops to its inner edges. */
import { decodePng, encodeRgba8Png } from "../bridge/png.js";
import { MARKER_COLOR, MARKER_THICKNESS } from "../../roblox-src/marker-constants.js";
import { MARKER_TOLERANCE } from "../types/protocol.js";
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

	const outerWidth = maxX - minX + 1;
	const outerHeight = maxY - minY + 1;
	if (outerWidth <= MARKER_THICKNESS * 2 || outerHeight <= MARKER_THICKNESS * 2) {
		throw new Error("The detected marker is too small to contain any content");
	}

	for (let y = minY; y <= maxY; y += 1) {
		for (let x = minX; x <= maxX; x += 1) {
			const onBorder = x - minX < MARKER_THICKNESS || maxX - x < MARKER_THICKNESS || y - minY < MARKER_THICKNESS || maxY - y < MARKER_THICKNESS;
			if (isMarker[y * width + x] === 1 !== onBorder) {
				throw new Error("The marker border is incomplete, non-rectangular, or ambiguous");
			}
		}
	}

	const markerOuterBounds: Bounds = { x: minX, y: minY, width: outerWidth, height: outerHeight };
	const contentBounds: Bounds = {
		x: minX + MARKER_THICKNESS,
		y: minY + MARKER_THICKNESS,
		width: outerWidth - MARKER_THICKNESS * 2,
		height: outerHeight - MARKER_THICKNESS * 2,
	};

	const cropped = Buffer.alloc(contentBounds.width * contentBounds.height * 4);
	for (let row = 0; row < contentBounds.height; row += 1) {
		const sourceOffset = ((contentBounds.y + row) * width + contentBounds.x) * 4;
		const destOffset = row * contentBounds.width * 4;
		pixels.copy(cropped, destOffset, sourceOffset, sourceOffset + contentBounds.width * 4);
	}

	return { png: encodeRgba8Png(cropped, contentBounds.width, contentBounds.height), markerOuterBounds, contentBounds };
}
