/** Generates the temporary bootstrap module that mounts a captured component inside the marker wrapper. */
import { CONTENT_KEY_COLOR } from "../../roblox-src/marker-constants.js";
import type { RgbColor } from "../capture/color.js";
import type { JsonObject } from "../types/protocol.js";

export interface BootstrapSourceOptions {
	/** Module specifier (already relative to the bootstrap file's own directory) for the target component. */
	componentImportPath: string;
	/** Module specifier (already relative to the bootstrap file's own directory) for the marker wrapper. */
	markerWrapperImportPath: string;
	props: JsonObject;
	temporaryRootName: string;
	/** Overrides the wrapper's default `CONTENT_KEY_COLOR`; defaults to it when omitted. */
	contentKeyColor?: RgbColor;
}

/**
 * The generated module exports a zero-argument `build()` that creates and returns the uniquely
 * named temporary root, already containing the rendered `ScreenGui`, marker frame, and component.
 */
export function generateBootstrapSource(options: BootstrapSourceOptions): string {
	const { componentImportPath, markerWrapperImportPath, props, temporaryRootName } = options;
	const contentKeyColor = options.contentKeyColor ?? CONTENT_KEY_COLOR;
	const markerWrapperProps = { contentKeyColor };
	return [
		'import React from "@rbxts/react";',
		'import ReactRoblox from "@rbxts/react-roblox";',
		`import Component = require(${JSON.stringify(componentImportPath)});`,
		`import MarkerWrapper = require(${JSON.stringify(markerWrapperImportPath)});`,
		"",
		"export function build(): Folder {",
		"\tconst root = new Instance(\"Folder\");",
		`\troot.Name = ${JSON.stringify(temporaryRootName)};`,
		"\tconst screen = new Instance(\"ScreenGui\");",
		'\tscreen.Name = "Screen";',
		"\tscreen.IgnoreGuiInset = true;",
		"\tscreen.ResetOnSpawn = false;",
		"\tscreen.Parent = root;",
		"",
		"\tconst reactRoot = ReactRoblox.createRoot(screen);",
		`\treactRoot.render(React.createElement(MarkerWrapper, ${JSON.stringify(markerWrapperProps)}, React.createElement(Component, ${JSON.stringify(props)})));`,
		"\troot.Destroying.Connect(() => reactRoot.unmount());",
		"\treturn root;",
		"}",
		"",
	].join("\n");
}
