#!/usr/bin/env node
/**
 * `react-screenshot-plugin <componentPath> [--props <json-object> | --props-file <path> | --<prop> <value>... | $env:SCREENSHOT_PROPS] [--output <path>] [--content-key-color <hex>]`
 * `react-screenshot-plugin install-plugin` - one-time Studio-side setup; see `install-plugin.ts`.
 *
 * The shebang above is load-bearing on Windows, not just POSIX: npm's shim generator (`cmd-shim`)
 * only prefixes the generated `.cmd`/`.ps1` wrapper with `node` when it detects a shebang on this
 * file. Without one, the wrapper tries to execute this `.js` file directly, which Windows has no
 * handler for - it pops "Select an App to Open this .js File" instead of running the CLI. Confirmed
 * by inspecting the actual generated shim; this bug shipped in 0.1.0 undetected because every one of
 * this repo's own e2e tests invokes the compiled CLI via `node <path>` directly, bypassing the shim
 * entirely.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { installPlugin } from "./install-plugin.js";
import { runCapture } from "./screenshot-command.js";
import { parseHexColor } from "../capture/color.js";
import type { RgbColor } from "../capture/color.js";
import type { JsonObject, JsonValue } from "../types/protocol.js";

export type Subcommand = "install-plugin" | "capture";

/** The only subcommand is `install-plugin`; anything else (including a bare component path) is the default capture invocation. */
export function resolveSubcommand(argv: string[]): Subcommand {
	return argv[0] === "install-plugin" ? "install-plugin" : "capture";
}

/** Coerces a bare command-line string into the JSON type it most plausibly represents. */
function coercePropValue(raw: string): JsonValue {
	if (raw === "true") return true;
	if (raw === "false") return false;
	if (raw === "null") return null;
	if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
	return raw;
}

export interface ParsedArgs {
	componentPath: string;
	props: JsonObject;
	outputPath?: string;
	contentKeyColor?: RgbColor;
}

function resolveComponentPath(raw: string, cwd: string): string {
	if (raw.startsWith("/")) return path.join(cwd, raw.slice(1));
	return path.resolve(cwd, raw);
}

function parsePropsJson(source: string, json: string): JsonObject {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		throw new Error(`${source} must be valid JSON`);
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error(`${source} must be a JSON object`);
	}
	return parsed as JsonObject;
}

export function parseArgs(argv: string[], cwd: string, env: NodeJS.ProcessEnv = {}): ParsedArgs {
	let componentPath: string | undefined;
	let propsRaw: string | undefined;
	let propsFilePath: string | undefined;
	let outputPath: string | undefined;
	let contentKeyColor: RgbColor | undefined;
	const adHocProps: JsonObject = {};
	const adHocKeys = new Array<string>();

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--props") {
			propsRaw = argv[i + 1];
			if (propsRaw === undefined) throw new Error("--props requires a JSON object argument");
			i += 1;
		} else if (arg === "--props-file") {
			propsFilePath = argv[i + 1];
			if (propsFilePath === undefined) throw new Error("--props-file requires a path argument");
			i += 1;
		} else if (arg === "--output") {
			outputPath = argv[i + 1];
			if (outputPath === undefined) throw new Error("--output requires a path argument");
			i += 1;
		} else if (arg === "--content-key-color") {
			const raw = argv[i + 1];
			if (raw === undefined) throw new Error("--content-key-color requires a hex color argument, e.g. '#00FF00'");
			contentKeyColor = parseHexColor(raw);
			i += 1;
		} else if (arg.startsWith("--")) {
			// An individual prop flag, e.g. `--text "Save changes" --disabled false`. Each value is
			// its own plain command-line argument with no embedded quotes needed, which sidesteps
			// PowerShell 5.1's native-argument-passing bug with quotes-plus-spaces entirely - unlike
			// `--props`/`--props-file`, this style needs no shell-quoting workarounds at all.
			const key = arg.slice(2);
			if (!key) throw new Error(`Invalid option '${arg}'`);
			const next = argv[i + 1];
			if (next === undefined || next.startsWith("--")) {
				adHocProps[key] = true;
			} else {
				adHocProps[key] = coercePropValue(next);
				i += 1;
			}
			adHocKeys.push(key);
		} else if (componentPath === undefined) {
			componentPath = arg;
		} else {
			throw new Error(`Unexpected extra argument '${arg}'`);
		}
	}

	if (!componentPath) {
		throw new Error(
			"Usage: npm run screenshot <componentPath> [--props <json-object> | --props-file <path> | --<prop> <value>... | $env:SCREENSHOT_PROPS] [--output <path>] [--content-key-color <hex>]",
		);
	}
	if (!componentPath.endsWith(".tsx")) throw new Error(`Component path must be a .tsx file: '${componentPath}'`);

	const envPropsRaw = env.SCREENSHOT_PROPS;
	const propsSourceCount = [propsRaw !== undefined, propsFilePath !== undefined, adHocKeys.length > 0, envPropsRaw !== undefined].filter(Boolean).length;
	if (propsSourceCount > 1) {
		throw new Error("--props, --props-file, individual --<prop> flags, and $env:SCREENSHOT_PROPS cannot be combined - pick one");
	}

	let props: JsonObject = {};
	if (propsFilePath !== undefined) {
		const resolvedPropsFilePath = path.resolve(cwd, propsFilePath);
		let contents: string;
		try {
			contents = readFileSync(resolvedPropsFilePath, "utf8");
		} catch {
			throw new Error(`Could not read --props-file '${resolvedPropsFilePath}'`);
		}
		// PowerShell's `Out-File -Encoding utf8` (and some editors) write a leading UTF-8 BOM,
		// which JSON.parse doesn't tolerate.
		if (contents.charCodeAt(0) === 0xfeff) contents = contents.slice(1);
		props = parsePropsJson("--props-file contents", contents);
	} else if (propsRaw !== undefined) {
		props = parsePropsJson("--props", propsRaw);
	} else if (adHocKeys.length > 0) {
		props = adHocProps;
	} else if (envPropsRaw !== undefined) {
		// Environment variables are never re-parsed by any shell the way command-line arguments
		// are, so this is the one way to pass JSON with spaces in it through `npm run screenshot`
		// itself reliably on Windows: `$env:SCREENSHOT_PROPS = '{"text":"Save changes"}'` survives
		// the PowerShell -> npm -> cmd.exe -> node.exe chain byte-for-byte, confirmed by hand,
		// where every command-line-argument-based approach gets mangled somewhere along the way.
		props = parsePropsJson("SCREENSHOT_PROPS", envPropsRaw);
	}

	return { componentPath: resolveComponentPath(componentPath, cwd), props, outputPath, contentKeyColor };
}

async function main(): Promise<void> {
	const cwd = process.cwd();
	const argv = process.argv.slice(2);

	if (resolveSubcommand(argv) === "install-plugin") {
		try {
			const destination = await installPlugin();
			console.log(`Installed Screenshot Plugin to ${destination}`);
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error));
			process.exitCode = 1;
		}
		return;
	}

	let parsed: ParsedArgs;
	try {
		parsed = parseArgs(argv, cwd, process.env);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
		return;
	}

	try {
		const result = await runCapture({ componentPath: parsed.componentPath, props: parsed.props, outputPath: parsed.outputPath, contentKeyColor: parsed.contentKeyColor, cwd });
		console.log(`Saved ${result.width}x${result.height} screenshot to ${result.outputPath}`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}

if (require.main === module) void main();
