/**
 * Wire-level types and constants shared by the Node session server and the Studio plugin.
 *
 * MARKER_COLOR/MARKER_THICKNESS deliberately do NOT live here: they're needed by
 * `roblox-src/marker-wrapper.tsx` (compiled fresh against each consumer's own React) and by
 * `src/capture/marker-crop.ts` (the Node-side detector), which import them straight from
 * `roblox-src/marker-constants.ts` instead. This file is also compiled as part of the Studio
 * plugin build, whose `tsconfig.json` sets `rootDir: "src"` - an import reaching outside `src/`
 * (into `roblox-src/`) would violate that boundary, and the plugin never needs those two constants
 * anyway (it never renders anything).
 */
export const MARKER_TOLERANCE = 8;

/**
 * How many pixels of the innermost edge of `MARKER_THICKNESS`'s border band `marker-crop.ts` treats
 * as a tolerant transition zone (may be either marker-colored or content-colored) rather than
 * strictly requiring marker color. Wrapped content whose own size comes from a cascade of nested
 * `AutomaticSize` frames (see `roblox-src/marker-constants.ts`) can bleed into that innermost band by
 * a pixel or two due to per-level rounding; the remaining `MARKER_THICKNESS - BORDER_SLACK` pixels
 * are still checked with full strictness, so a genuinely incomplete/miscolored border still fails.
 * The final crop always trims the full `MARKER_THICKNESS` regardless, so this slack never lets a
 * marker-colored (or partially-bled) pixel leak into the output image.
 */
export const BORDER_SLACK = 2;

/** Name of the compiled ModuleScript the plugin requires to build the temporary capture root. */
export const BOOTSTRAP_MODULE_NAME = "CaptureBootstrap";

/**
 * Wire-format version, bumped only when the session protocol itself changes shape - not on every
 * package release. The plugin (built once per package release and installed once per machine via
 * `install-plugin`) reports this on every `GET /session` poll; the CLI rejects a mismatch before
 * the model ever transfers, so an out-of-date installed plugin fails fast with an actionable error
 * instead of hanging.
 */
export const PROTOCOL_VERSION = "1";

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject {
	[key: string]: JsonValue;
}

export type SessionStatus = "building" | "available" | "loaded" | "ready" | "capturing" | "done" | "failed" | "expired";

export type AckPhase = "loaded" | "ready" | "failed";

export interface PluginAcknowledgement {
	sessionId: string;
	phase: AckPhase;
	message?: string;
}

export interface SessionManifest {
	sessionId: string;
	status: SessionStatus;
	modelUrl: string;
	modelSha256: string;
	contentLength: number;
	temporaryRootName: string;
}

export interface SessionStatusResponse {
	sessionId: string;
	status: SessionStatus;
	error?: string;
}
