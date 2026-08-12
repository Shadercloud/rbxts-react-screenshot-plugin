/**
 * `npm run debug:build-model <componentPath> [--props <json-object>] [--output <path>]`
 *
 * Compiles a component into a capture `.rbxm` and saves it to disk, without opening a session or
 * touching Studio at all. Useful for inspecting the generated instance tree/scripts directly (drag
 * the file into an open Studio place, or use Insert > From File) when the plugin misbehaves and
 * it's unclear whether the problem is in the generated model or in the plugin's handling of it.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { buildCaptureModel } from "../compiler/model-builder.js";
import { parseArgs } from "./screenshot-cli.js";

async function main(): Promise<void> {
	const cwd = process.cwd();
	const parsed = parseArgs(process.argv.slice(2), cwd);
	const outputPath = path.resolve(cwd, parsed.outputPath ?? `${path.basename(parsed.componentPath, path.extname(parsed.componentPath))}.debug.rbxm`);

	const { modelBuffer, temporaryRootName } = await buildCaptureModel(parsed.componentPath, parsed.props, cwd);
	await writeFile(outputPath, modelBuffer);

	console.log(`Saved ${modelBuffer.length} bytes to ${outputPath}`);
	console.log(`Temporary root name: ${temporaryRootName}`);
	console.log("Drag this file into an open Roblox Studio place (or Insert > From File) to inspect its contents.");
	console.log("Note: dragging it in only shows the raw payload (a Folder of ModuleScripts) - the ScreenGui/marker/component only exist after something requires the bootstrap module and calls its exported build() function, which is what the plugin does at runtime.");
}

void main();
