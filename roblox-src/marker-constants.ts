/**
 * Marker color/thickness shared by the wrapper (compiled fresh per capture, against the consumer's
 * own React) and the Node-side marker detector. Kept dependency-free (no Roblox types, no Node
 * types) so it compiles unchanged under both the consumer's roblox-ts toolchain and this package's
 * own Node build - re-exported from `src/types/protocol.ts` for the Node side.
 */
export const MARKER_COLOR = { r: 255, g: 0, b: 255 } as const;
/**
 * Nominal border thickness the wrapper renders. `src/capture/marker-crop.ts` doesn't trust this
 * blindly when deciding how much to crop, though: it measures the actual rendered border depth per
 * capture (which can run deeper than this in spots - e.g. a rounded corner on the captured content
 * leaves a gap where the marker's background shows through near that corner, scaling with the
 * corner's radius) and crops to what it measured. This constant mainly controls how crisp/thick the
 * drawn border itself looks, plus the minimum plausible marker size sanity check.
 */
export const MARKER_THICKNESS = 12;
/**
 * Fills the frame directly behind the captured component - deliberately a *different*, opaque
 * color from `MARKER_COLOR`, not left transparent. An opaque backing means `MARKER_COLOR` can only
 * ever appear in the actual border ring: with a transparent backing, any gap in the component's own
 * rendering (a rounded corner, spacing between an icon and a label, anywhere the component doesn't
 * paint every pixel of its own automatically-sized bounding box) let the marker border color itself
 * show through in the middle of the content - exactly where a user's component isn't wrapped in its
 * own opaque frame, since then there's nothing else behind it to block that bleed-through. That
 * confused `cropToMarker`'s border measurement, producing wrong-sized or mis-cropped output. With an
 * opaque, distinctly-colored backing instead, `cropToMarker` alpha-keys out every pixel matching this
 * color after cropping, restoring transparency wherever the component itself didn't paint - the same
 * chroma-key technique a green screen uses, and why this is bright, saturated green rather than
 * anything closer to typical UI colors.
 */
export const CONTENT_KEY_COLOR = { r: 0, g: 255, b: 0 } as const;
