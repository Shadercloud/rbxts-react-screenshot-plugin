/**
 * Shared helpers for e2e tests that need to install this package the way a real external consumer
 * would: `npm pack` a real tarball, `npm install` it into a scratch project fixture, then invoke the
 * installed package's own compiled CLI directly (bypassing `npm run`, whose Windows arg-mangling is
 * documented in `README.md`).
 */
import { execFile, spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();

export interface PackedPackage {
	tarballPath: string;
}

/** Runs `npm pack` against this repository, writing the tarball to `destinationDir`. */
export async function packThisPackage(destinationDir: string): Promise<PackedPackage> {
	const { stdout } = await execFileAsync("npm", ["pack", "--json", "--pack-destination", destinationDir], {
		cwd: REPO_ROOT,
		shell: true,
	});
	const entries = JSON.parse(stdout) as Array<{ filename: string }>;
	const [entry] = entries;
	if (!entry) throw new Error("npm pack produced no output");
	return { tarballPath: path.join(destinationDir, entry.filename) };
}

/**
 * Installs the packed tarball into the given consumer project fixture as a real npm dependency.
 *
 * Removes any previously-installed copy first: `npm install <tarball-path>` silently skips
 * re-extracting when the installed `node_modules` copy already reports the same `version` (npm
 * compares the declared version, not tarball content) - since this package's version doesn't bump
 * between local test runs, every install after the first would otherwise keep testing whatever was
 * extracted the very first time this fixture was ever installed into, silently, with no error.
 */
export async function installIntoFixture(tarballPath: string, fixtureDir: string): Promise<void> {
	await rm(path.join(fixtureDir, "node_modules", "@rbxts", "react-screenshot-plugin"), { recursive: true, force: true });
	await execFileAsync("npm", ["install", tarballPath, "--no-audit", "--no-fund", "--no-save", "--no-package-lock"], {
		cwd: fixtureDir,
		shell: true,
	});
}

/** Path to the installed package's compiled CLI entry point inside a consumer project's own `node_modules`. */
export function installedCliPath(fixtureDir: string): string {
	return path.join(fixtureDir, "node_modules", "@rbxts", "react-screenshot-plugin", "dist", "src", "bridge", "screenshot-cli.js");
}

/** Path to the installed package's compiled programmatic entry point (`"main"`) inside a consumer project's own `node_modules`. */
export function installedIndexPath(fixtureDir: string): string {
	return path.join(fixtureDir, "node_modules", "@rbxts", "react-screenshot-plugin", "dist", "src", "index.js");
}

/** Path to npm's generated Windows `.cmd` shim for the installed package's `bin` entry. */
export function installedCliShimPath(fixtureDir: string): string {
	return path.join(fixtureDir, "node_modules", ".bin", "react-screenshot-plugin.cmd");
}

export interface CliRunResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export interface RunInstalledCliOptions {
	env?: NodeJS.ProcessEnv;
	/** Kills the child process when aborted - wire up a subtest's own `t.signal` so a per-test timeout actually stops the process instead of leaking it into the next subtest. */
	signal?: AbortSignal;
}

/** Runs the installed package's own compiled CLI as a real child process, from the consumer project's own directory. */
export function runInstalledCli(fixtureDir: string, args: string[], options: RunInstalledCliOptions = {}): Promise<CliRunResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [installedCliPath(fixtureDir), ...args], {
			cwd: fixtureDir,
			env: { ...process.env, ...options.env },
		});
		options.signal?.addEventListener("abort", () => child.kill());

		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
		child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
		child.once("error", reject);
		child.once("exit", (code) => resolve({ exitCode: code ?? -1, stdout, stderr }));
	});
}

/**
 * Runs the installed package through npm's actual generated Windows `.cmd` shim - the same
 * resolution path `npx react-screenshot-plugin ...` and a `"screenshot": "react-screenshot-plugin"`
 * package.json script both go through - rather than invoking the compiled `.js` file with `node`
 * directly like `runInstalledCli` does. This is the only thing in this suite that actually exercises
 * shim generation itself: a missing shebang in the source once made this specific path fail with
 * Windows popping "Select an App to Open this .js File", while direct `node <path>` invocation (and
 * so every other test here) stayed completely unaffected and green.
 */
export function runInstalledCliViaShim(fixtureDir: string, args: string[], options: RunInstalledCliOptions = {}): Promise<CliRunResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(installedCliShimPath(fixtureDir), args, {
			cwd: fixtureDir,
			env: { ...process.env, ...options.env },
			shell: true,
		});
		options.signal?.addEventListener("abort", () => child.kill());

		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
		child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
		child.once("error", reject);
		child.once("exit", (code) => resolve({ exitCode: code ?? -1, stdout, stderr }));
	});
}
