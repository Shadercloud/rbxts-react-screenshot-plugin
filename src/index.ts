/**
 * Programmatic entry point - for calling this package from your own Node/TypeScript code (a test
 * runner, a build script) instead of shelling out to the `react-screenshot-plugin` CLI. Everything
 * exported here is exactly what the CLI itself calls internally.
 */
export { runCapture } from "./bridge/screenshot-command.js";
export type { RunCaptureOptions, CaptureResult } from "./bridge/screenshot-command.js";

export { decodePng } from "./bridge/png.js";
export type { DecodedPng } from "./bridge/png.js";

export { installPlugin, resolvePluginsFolder } from "./bridge/install-plugin.js";
export type { InstallPluginOptions } from "./bridge/install-plugin.js";

export type { JsonObject, JsonValue } from "./types/protocol.js";
