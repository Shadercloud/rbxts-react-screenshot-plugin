/** Stages, compiles, and packages a temporary capture model for one component + props. */
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { promisify } from "node:util";

import { generateBootstrapSource } from "./component-entry.js";
import type { RgbColor } from "../capture/color.js";
import { BOOTSTRAP_MODULE_NAME } from "../types/protocol.js";
import type { JsonObject } from "../types/protocol.js";

const execute = promisify(execFile);

export interface BuiltModel {
	modelBuffer: Buffer;
	temporaryRootName: string;
}

function moduleSpecifier(fromDirectory: string, target: string): string {
	let relative = path.relative(fromDirectory, target).replaceAll("\\", "/");
	if (!relative.startsWith(".")) relative = `./${relative}`;
	return relative.replace(/\.(tsx?|jsx?)$/, "");
}

async function seedOutputPaths(sourceRoot: string, outputRoot: string): Promise<string[]> {
	const placeholders = new Array<string>();
	async function visit(directory: string): Promise<void> {
		for (const item of await readdir(directory, { withFileTypes: true })) {
			const source = path.join(directory, item.name);
			if (item.isDirectory()) await visit(source);
			else if (/\.(ts|tsx)$/.test(item.name) && !item.name.endsWith(".d.ts")) {
				const output = path.join(outputRoot, path.relative(sourceRoot, source)).replace(/\.(ts|tsx)$/, ".luau");
				const placeholder = source.replace(/\.(ts|tsx)$/, ".luau");
				await mkdir(path.dirname(output), { recursive: true });
				await writeFile(placeholder, "return nil\n");
				await writeFile(output, "return nil\n");
				placeholders.push(output);
			}
		}
	}
	await visit(sourceRoot);
	return placeholders;
}

/**
 * Root of this package's own installation - this repository's root when running the local CLI
 * directly, or `node_modules/@rbxts/react-screenshot-plugin` when installed as a dependency.
 * Derived from `__dirname` (not passed in) since it's an intrinsic fact about where this compiled
 * file itself lives on disk, true either way: `dist/src/compiler/model-builder.js` -> package root.
 */
const packageRoot = path.resolve(__dirname, "../../..");

/** Compiles the given `.tsx` component with the supplied props into a temporary, uniquely rooted `.rbxm` payload. */
export interface StagedProjectInfo {
	temporaryDirectory: string;
	stagedProject: string;
}

export async function buildCaptureModel(
	componentPath: string,
	props: JsonObject,
	cwd = process.cwd(),
	consumerProjectRoot: string = path.resolve(cwd),
	/** Test-only hook (mirrors `runCapture`'s `onListening`): observe staging before the temp directory is cleaned up. */
	onStaged?: (info: StagedProjectInfo) => void,
	/** Overrides the marker wrapper's default content-backing color; defaults to it (via `generateBootstrapSource`) when omitted. */
	contentKeyColor?: RgbColor,
): Promise<BuiltModel> {
	const projectRoot = path.resolve(consumerProjectRoot);
	const sourceEntry = path.resolve(projectRoot, componentPath);
	const relativeEntry = path.relative(projectRoot, sourceEntry);
	if (relativeEntry.startsWith("..") || path.isAbsolute(relativeEntry)) throw new Error("Component path must be inside the project directory");

	const id = randomUUID();
	const temporaryRootName = `ScreenshotCapture_${id}`;
	const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "roblox-screenshot-"));
	const stagedProject = path.join(temporaryDirectory, "project");
	const entry = path.join(stagedProject, relativeEntry);
	const bootstrapPath = path.join(stagedProject, ".screenshot-capture", id, `${BOOTSTRAP_MODULE_NAME}.tsx`);
	const markerWrapperPath = path.join(stagedProject, "roblox-src", "marker-wrapper.tsx");
	const outputDirectory = path.join(temporaryDirectory, "out");
	const includeDirectory = path.join(temporaryDirectory, "include");
	const tsconfigPath = path.join(temporaryDirectory, "tsconfig.json");
	const rojoPath = path.join(temporaryDirectory, "default.project.json");
	const modelPath = path.join(temporaryDirectory, "capture.rbxm");

	try {
		// Stage only what compilation can actually need: this package's own self-contained
		// `roblox-src/` (the marker wrapper and its own dependency-free constants module) from
		// `packageRoot`, plus, if the target component lives outside the consumer project's top-level
		// directory that already got copied, its own top-level directory from `projectRoot` (so any of
		// its sibling-relative imports still resolve). Copying the whole repository here used to work
		// by accident but also meant roblox-ts's asset-copy step mirrored EVERY other file in the repo
		// (README.md, specs/, .github/, etc.) into `out/`, which Rojo's `$path: "out"` mapping then
		// packaged straight into the final .rbxm. Using `roblox-src/` (a name reserved by this package,
		// not a consumer's own top-level directory) also means this copy can never collide with
		// whatever the consumer's own project layout happens to be.
		// Excluding a nested `node_modules` matters beyond tidiness: the staged project gets its own
		// `node_modules` via the symlink below, sibling to `stagedProject` - if the consumer's target
		// component's top-level directory happens to contain a real `node_modules` of its own (e.g. a
		// nested fixture or workspace package), copying it wholesale is at best wasted work and at
		// worst corrupts the copy (a real `node_modules` tree can contain symlinks/binaries `cp`
		// doesn't handle cleanly), which is exactly what broke this repository's own tests once
		// `tests/fixtures/external-project/node_modules` existed alongside the other component fixtures.
		//
		// The check must be relative to each copy's OWN source root, not the absolute path: when this
		// package is installed as a real dependency, `packageRoot` itself lives under
		// `.../node_modules/@rbxts/react-screenshot-plugin`, so an absolute-path check would exclude
		// everything (including `roblox-src` itself) the moment the package is actually installed
		// rather than run from this repository directly - a bug real end-to-end testing against an
		// installed tarball caught, that every purely local test run had no way to exercise.
		const filterOutNestedArtifacts = (sourceRoot: string) => (source: string) => {
			if (source.endsWith(".rbxm")) return false;
			const relative = path.relative(sourceRoot, source);
			return relative === "" || !relative.split(path.sep).includes("node_modules");
		};
		const robloxSrcSource = path.join(packageRoot, "roblox-src");
		await cp(robloxSrcSource, path.join(stagedProject, "roblox-src"), { recursive: true, filter: filterOutNestedArtifacts(robloxSrcSource) });
		const entryTopLevelDir = relativeEntry.split(path.sep)[0];
		const entryTopLevelSource = path.join(projectRoot, entryTopLevelDir);
		await cp(path.join(entryTopLevelSource), path.join(stagedProject, entryTopLevelDir), { recursive: true, filter: filterOutNestedArtifacts(entryTopLevelSource) });
		await cp(path.join(projectRoot, "tsconfig.json"), path.join(stagedProject, "tsconfig.json"));
		await cp(path.join(projectRoot, "package.json"), path.join(temporaryDirectory, "package.json"));
		// Symlink the CONSUMER's own node_modules, not this package's - `@rbxts/react`/
		// `@rbxts/react-roblox` must resolve to the same module instance the consumer's own component
		// was compiled against, or React's element/hook checks break across the two instances.
		await symlink(path.join(projectRoot, "node_modules"), path.join(temporaryDirectory, "node_modules"), "junction");
		await mkdir(path.dirname(bootstrapPath), { recursive: true });
		await mkdir(includeDirectory, { recursive: true });
		onStaged?.({ temporaryDirectory, stagedProject });

		const componentImportPath = moduleSpecifier(path.dirname(bootstrapPath), entry);
		const markerWrapperImportPath = moduleSpecifier(path.dirname(bootstrapPath), markerWrapperPath);
		await writeFile(bootstrapPath, generateBootstrapSource({ componentImportPath, markerWrapperImportPath, props, temporaryRootName, contentKeyColor }));

		const placeholders = await seedOutputPaths(stagedProject, outputDirectory);

		// tsconfig.json and the `rbxtsc` compiler both resolve from `projectRoot` (the consumer's own
		// project) rather than `packageRoot`, so the compile uses the consumer's own compiler options
		// and their own installed `roblox-ts` version - not this package's.
		await writeFile(tsconfigPath, JSON.stringify({
			extends: path.join(stagedProject, "tsconfig.json"),
			compilerOptions: {
				rootDir: stagedProject,
				outDir: outputDirectory,
				jsx: "react",
				noEmit: false,
				typeRoots: [path.join(temporaryDirectory, "node_modules", "@rbxts")],
			},
			include: [entry, bootstrapPath, markerWrapperPath],
		}, undefined, 2));
		await writeFile(rojoPath, JSON.stringify({
			name: "ScreenshotCapturePayload",
			tree: {
				$path: "out",
				$className: "Folder",
				include: { $path: "include" },
				node_modules: {
					$className: "Folder",
					"@rbxts": { $path: "node_modules/@rbxts" },
					"@rbxts-js": { $path: "node_modules/@rbxts-js" },
				},
			},
		}, undefined, 2));

		// Resolved from the consumer's own project (its `package.json`, which was just copied into
		// `temporaryDirectory` above), not from this package's own install location - so the compile
		// uses the consumer's own installed `roblox-ts` version, not this package's, exactly as it
		// already does for the consumer's own `tsconfig.json` above. On the local-development default
		// path (no `consumerProjectRoot` override), `projectRoot` is this repository itself, so this
		// still resolves this repository's own `roblox-ts`, unchanged from before.
		const consumerRequire = createRequire(path.join(projectRoot, "package.json"));
		const compiler = consumerRequire.resolve("roblox-ts/out/CLI/cli.js");
		await execute(process.execPath, [compiler, "-p", tsconfigPath, "--type", "model", "--rojo", rojoPath, "-i", includeDirectory], { cwd: temporaryDirectory });
		for (const placeholder of placeholders) {
			if ((await stat(placeholder)).size === "return nil\n".length) await unlink(placeholder);
		}
		await execute("rojo", ["build", rojoPath, "-o", modelPath], { cwd: temporaryDirectory });
		const modelBuffer = await readFile(modelPath);
		return { modelBuffer, temporaryRootName };
	} catch (reason) {
		const output = reason instanceof Error && "stderr" in reason ? `${String(reason.stderr)}\n${"stdout" in reason ? String(reason.stdout) : ""}`.trim() : "";
		const details = output || (reason instanceof Error ? reason.message : String(reason));
		throw new Error(`Failed to compile component '${componentPath}': ${details}`);
	} finally {
		await rm(temporaryDirectory, { recursive: true, force: true });
	}
}
