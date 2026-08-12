/**
 * `install-plugin` subcommand: copies this package's bundled, prebuilt Studio plugin binary into
 * Roblox Studio's local plugins folder. Requires no `rojo`/`rbxtsc` invocation on the consumer's
 * machine - the plugin never touches React or a consumer's own code, so it's built once (from this
 * repository's own `src/plugin.server.ts`/`src/server/session-client.ts`/`src/ui/log-window.ts`,
 * via `npm run build:release-plugin`) and shipped as a binary asset in the published package.
 *
 * Idempotent by design: always overwrites, since the whole point of re-running it is to make the
 * installed plugin match whatever package version is currently installed.
 */
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

/** Root of this package's own installation (see `model-builder.ts` for why `__dirname` is used). */
const packageRoot = path.resolve(__dirname, "../../..");

const PLUGIN_FILE_NAME = "ScreenshotPlugin.rbxm";

/** Roblox Studio's local plugins folder is a fixed, machine-level location - the same one `rojo build --plugin` targets. */
export function resolvePluginsFolder(env: NodeJS.ProcessEnv = process.env): string {
	const localAppData = env.LOCALAPPDATA;
	if (!localAppData) throw new Error("Could not resolve Roblox Studio's plugins folder: %LOCALAPPDATA% is not set");
	return path.join(localAppData, "Roblox", "Plugins");
}

export interface InstallPluginOptions {
	env?: NodeJS.ProcessEnv;
	/** Overridable for testing; defaults to the real, machine-level Studio plugins folder. */
	pluginsFolder?: string;
	/** Overridable for testing; defaults to this package's own bundled `plugin/ScreenshotPlugin.rbxm`. */
	bundledPluginPath?: string;
}

/** Copies the bundled plugin binary into Studio's plugins folder, overwriting any previous install. Returns the installed path. */
export async function installPlugin(options: InstallPluginOptions = {}): Promise<string> {
	const pluginsFolder = options.pluginsFolder ?? resolvePluginsFolder(options.env ?? process.env);
	const bundledPluginPath = options.bundledPluginPath ?? path.join(packageRoot, "plugin", PLUGIN_FILE_NAME);
	const destination = path.join(pluginsFolder, PLUGIN_FILE_NAME);

	await mkdir(pluginsFolder, { recursive: true });
	try {
		await copyFile(bundledPluginPath, destination);
	} catch (error) {
		// A missing bundled binary is a packaging defect (this package should never ship without
		// it), not a condition to silently swallow.
		throw new Error(`Could not install the bundled Screenshot Plugin from '${bundledPluginPath}': ${error instanceof Error ? error.message : String(error)}`);
	}
	return destination;
}
