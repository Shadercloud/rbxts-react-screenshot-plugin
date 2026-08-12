/** Resolves the nearest `tsconfig.json` to a component entry file and what extra directories its `paths` mappings require staging. */
import { existsSync } from "node:fs";
import path from "node:path";
import type * as TS from "typescript";

export interface NearestTsconfig {
	/** Absolute path to the tsconfig.json to extend: the closest ancestor of the entry file (no further up than `projectRoot`) that declares a `paths` mapping, or `projectRoot`'s own tsconfig.json otherwise. */
	configPath: string;
	/**
	 * Top-level directories (relative to `projectRoot`) that the config's own `paths` mappings resolve
	 * into, beyond whatever the caller reports as already staged, and excluding anything under
	 * `node_modules` (already handled separately, via a symlink).
	 */
	extraStagingDirs: string[];
}

function parseConfig(ts: typeof TS, configPath: string): TS.ParsedCommandLine {
	const parsed = ts.getParsedCommandLineOfConfigFile(configPath, undefined, {
		...ts.sys,
		onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
			throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
		},
	});
	if (!parsed) throw new Error(`Failed to parse ${configPath}`);
	return parsed;
}

function stagingDirsFromPaths(baseUrl: string, paths: TS.MapLike<string[]>, projectRoot: string, alreadyStagedTopLevelDirs: readonly string[]): string[] {
	const extraStagingDirs = new Set<string>();
	for (const targets of Object.values(paths)) {
		for (const target of targets) {
			const resolvedTarget = path.resolve(baseUrl, target.replaceAll("*", ""));
			const relativeToRoot = path.relative(projectRoot, resolvedTarget);
			if (relativeToRoot === "" || relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) continue;
			const topLevelDir = relativeToRoot.split(path.sep)[0]!;
			if (topLevelDir === "node_modules" || alreadyStagedTopLevelDirs.includes(topLevelDir)) continue;
			extraStagingDirs.add(topLevelDir);
		}
	}
	return [...extraStagingDirs];
}

/**
 * Finds the `tsconfig.json` closest to `sourceEntry` that declares a `paths` mapping (searching no
 * further up than `projectRoot`), resolves it via the TypeScript compiler API - following any `extends`
 * chain and tolerating the JSONC comments real-world configs use, neither of which plain `JSON.parse`
 * can do - and reports any `paths`-mapped directories that still need staging.
 *
 * An ancestor `tsconfig.json` that declares no `paths` is skipped rather than treated as the answer:
 * such a file offers no behavior this feature exists to unlock, and stopping the walk there could pick
 * up a tsconfig meant for something else entirely (e.g. this repository's own `tests/tsconfig.json`,
 * which exists only to type-check this repository's Node-side test sources and sits, incidentally,
 * between every fixture component and this repository's own project root).
 */
export function resolveNearestTsconfig(
	ts: typeof TS,
	sourceEntry: string,
	projectRoot: string,
	alreadyStagedTopLevelDirs: readonly string[],
): NearestTsconfig {
	let directory = path.dirname(sourceEntry);
	while (true) {
		const candidate = path.join(directory, "tsconfig.json");
		if (existsSync(candidate)) {
			if (directory === projectRoot) return { configPath: candidate, extraStagingDirs: [] };
			const { options } = parseConfig(ts, candidate);
			if (options.baseUrl && options.paths && Object.keys(options.paths).length > 0) {
				return { configPath: candidate, extraStagingDirs: stagingDirsFromPaths(options.baseUrl, options.paths, projectRoot, alreadyStagedTopLevelDirs) };
			}
		}
		if (directory === projectRoot) break;
		const parent = path.dirname(directory);
		if (parent === directory) break;
		directory = parent;
	}
	return { configPath: path.join(projectRoot, "tsconfig.json"), extraStagingDirs: [] };
}
