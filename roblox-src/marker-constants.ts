/**
 * Marker color/thickness shared by the wrapper (compiled fresh per capture, against the consumer's
 * own React) and the Node-side marker detector. Kept dependency-free (no Roblox types, no Node
 * types) so it compiles unchanged under both the consumer's roblox-ts toolchain and this package's
 * own Node build - re-exported from `src/types/protocol.ts` for the Node side.
 */
export const MARKER_COLOR = { r: 255, g: 0, b: 255 } as const;
export const MARKER_THICKNESS = 4;
