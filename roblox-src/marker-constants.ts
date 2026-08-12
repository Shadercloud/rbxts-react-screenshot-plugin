/**
 * Marker color/thickness shared by the wrapper (compiled fresh per capture, against the consumer's
 * own React) and the Node-side marker detector. Kept dependency-free (no Roblox types, no Node
 * types) so it compiles unchanged under both the consumer's roblox-ts toolchain and this package's
 * own Node build - re-exported from `src/types/protocol.ts` for the Node side.
 */
export const MARKER_COLOR = { r: 255, g: 0, b: 255 } as const;
/**
 * Deliberately thicker than the minimum needed for a crisp border: components whose own size comes
 * from `AutomaticSize` (common for real UI-kit elements, e.g. a button that hugs its own label)
 * cascade through several nested `AutomaticSize` frames on the way to `roblox-src/marker-wrapper.tsx`'s
 * outer marker frame, and each level can round to a different pixel than the one below it. That
 * consistently bleeds the wrapped content into roughly the innermost pixel of the border - see
 * `src/capture/marker-crop.ts`'s `BORDER_SLACK`, which tolerates exactly that band without weakening
 * detection of a genuinely broken/miscolored border elsewhere.
 */
export const MARKER_THICKNESS = 6;
