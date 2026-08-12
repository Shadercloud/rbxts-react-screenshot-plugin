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
