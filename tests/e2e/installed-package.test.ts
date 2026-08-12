/**
 * Real end-to-end tests of this package as an *installed dependency*, not as this repository's own
 * local CLI: `npm pack` a real tarball, `npm install` it into the scratch external-project fixtures
 * (`tests/fixtures/external-project(-2)`), and drive the installed package's own compiled CLI against
 * a real, locally installed Roblox Studio. This is the only place that exercises the actual
 * install → `install-plugin` → `npm run screenshot` flow documented for consumers - every other test
 * either simulates the plugin (`tests/integration/`) or runs this repository's own CLI directly
 * against its own fixtures (`tests/e2e/screenshot-cli.test.ts`), neither of which would have caught a
 * packaging defect (a file missing from `"files"` in `package.json`, a path that only resolves inside
 * this repository, etc.).
 *
 * Skips (rather than fails) when Roblox Studio isn't installed on the machine running the suite.
 * Everything here shares one `npm pack` + two `npm install`s (steps are subtests of a single top-level
 * test, run in order) since each is a real, non-trivial child process - packing and installing twice
 * per scenario would multiply this file's runtime for no extra coverage.
 *
 * Every subtest gets its own bounded timeout (rather than inheriting the top-level test's much larger
 * one) and wires its subtest's own `AbortSignal` into `runInstalledCli`, so a single hung capture
 * fails fast and kills its own child process, instead of silently consuming the whole file's time
 * budget and leaking a zombie process into the next subtest.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { decodePng } from "../../src/bridge/png.js";
import { findNewestStudioExecutable, findRunningStudioWindow } from "../../src/capture/studio-window.js";
import { installIntoFixture, installedCliPath, installedIndexPath, packThisPackage, runInstalledCli } from "./support/pack-install.js";
import type { CaptureResult, DecodedPng, RunCaptureOptions } from "../../src/index.js";

/** Shape of the installed package's programmatic entry point (`"main"`), imported dynamically from its real on-disk location rather than through a package specifier - our own test file's node_modules doesn't have this fixture's installed copy. */
interface ProgrammaticApi {
	runCapture: (options: RunCaptureOptions) => Promise<CaptureResult>;
	decodePng: (buffer: Buffer) => DecodedPng;
}

const REPO_ROOT = process.cwd();
const TOP_LEVEL_TIMEOUT_MS = 600_000;
const SETUP_TIMEOUT_MS = 90_000;
const CAPTURE_TIMEOUT_MS = 60_000;
const PROJECT1 = path.join(REPO_ROOT, "tests", "fixtures", "external-project");
const PROJECT2 = path.join(REPO_ROOT, "tests", "fixtures", "external-project-2");

function describeFailure(label: string, result: { exitCode: number; stdout: string; stderr: string }): string {
	return `${label} exited with code ${result.exitCode}.\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`;
}

async function assertRealPng(outputPath: string): Promise<void> {
	const decoded = decodePng(await readFile(outputPath));
	assert.ok(decoded.width > 0 && decoded.height > 0, `expected a real, non-empty PNG, got ${decoded.width}x${decoded.height}`);
}

test("the package works end to end as an installed dependency of an external project", { timeout: TOP_LEVEL_TIMEOUT_MS }, async (t) => {
	const alreadyRunning = await findRunningStudioWindow();
	if (!alreadyRunning && !(await findNewestStudioExecutable())) {
		t.skip("Roblox Studio is not installed on this machine");
		return;
	}

	const packDestination = await mkdtemp(path.join(tmpdir(), "roblox-screenshot-pack-"));
	t.after(() => rm(packDestination, { recursive: true, force: true }));

	// (US1, US3) Pack once, install into both scratch projects - PROJECT2 deliberately never runs
	// install-plugin below, to prove Studio-side setup is machine-level, not project-level.
	await t.test("npm pack produces a tarball that installs cleanly into two independent external projects", { timeout: SETUP_TIMEOUT_MS }, async () => {
		const packed = await packThisPackage(packDestination);
		await installIntoFixture(packed.tarballPath, PROJECT1);
		await installIntoFixture(packed.tarballPath, PROJECT2);
		await assert.doesNotReject(readFile(installedCliPath(PROJECT1)), "PROJECT1 should have the compiled CLI on disk after install");
		await assert.doesNotReject(readFile(installedCliPath(PROJECT2)), "PROJECT2 should have the compiled CLI on disk after install");
	});

	// (US1) One-time Studio-side setup, run from PROJECT1 only.
	await t.test("install-plugin installs the bundled plugin with no rojo/build step", { timeout: CAPTURE_TIMEOUT_MS }, async (st) => {
		const result = await runInstalledCli(PROJECT1, ["install-plugin"], { signal: st.signal });
		assert.equal(result.exitCode, 0, describeFailure("install-plugin", result));
		assert.match(result.stdout, /Installed Screenshot Plugin/);
	});

	// (US1, SC-001) The documented flow, end to end, against PROJECT1's own component.
	await t.test("npm run screenshot from the installed package captures the external project's own component", { timeout: CAPTURE_TIMEOUT_MS }, async (st) => {
		const outputPath = path.join(PROJECT1, ".e2e-installed-no-props.png");
		await rm(outputPath, { force: true });
		try {
			const result = await runInstalledCli(PROJECT1, ["components/NoProps.tsx", "--output", outputPath], { signal: st.signal });
			assert.equal(result.exitCode, 0, describeFailure("screenshot", result));
			await assertRealPng(outputPath);
		} finally {
			await rm(outputPath, { force: true });
		}
	});

	// Programmatic usage: `import { runCapture, decodePng } from "@rbxts/react-screenshot-plugin"` in
	// a consumer's own Node/TypeScript code (e.g. a test that captures a component and then inspects
	// the resulting pixels), instead of shelling out to the CLI.
	await t.test("the programmatic API (runCapture + decodePng) can be imported and used directly from a Node script", { timeout: CAPTURE_TIMEOUT_MS }, async () => {
		const outputPath = path.join(PROJECT1, ".e2e-programmatic-output.png");
		await rm(outputPath, { force: true });
		try {
			const installedApi = await import(pathToFileURL(installedIndexPath(PROJECT1)).href) as ProgrammaticApi;
			const result = await installedApi.runCapture({ componentPath: "components/NoProps.tsx", outputPath, cwd: PROJECT1 });
			assert.ok(result.width > 0 && result.height > 0, `expected real capture dimensions, got ${result.width}x${result.height}`);

			const decoded = installedApi.decodePng(await readFile(result.outputPath));
			assert.equal(decoded.width, result.width);
			assert.equal(decoded.height, result.height);
			// One RGBA byte quad per pixel - exactly what a consumer would index into to analyze the
			// capture (e.g. asserting a specific pixel's color), the whole point of exposing this.
			assert.equal(decoded.pixels.length, decoded.width * decoded.height * 4);
		} finally {
			await rm(outputPath, { force: true });
		}
	});

	// (US2, SC-002) A hooks-using component only renders correctly if the wrapper and the component
	// share PROJECT1's own React instance, not a copy bundled in the package.
	await t.test("a hooks-using component compiled against the external project's own React renders with no cross-instance errors", { timeout: CAPTURE_TIMEOUT_MS }, async (st) => {
		const outputPath = path.join(PROJECT1, ".e2e-installed-hooks.png");
		await rm(outputPath, { force: true });
		try {
			const result = await runInstalledCli(PROJECT1, ["components/UsesHooks.tsx", "--output", outputPath], { signal: st.signal });
			assert.equal(result.exitCode, 0, describeFailure("screenshot (hooks)", result));
			assert.doesNotMatch(result.stderr, /invalid hook call|invalid element type/i);
			await assertRealPng(outputPath);
		} finally {
			await rm(outputPath, { force: true });
		}
	});

	// (US3, SC-003) PROJECT2 never ran install-plugin - only PROJECT1 did, above.
	await t.test("a second, independent project captures successfully without ever running install-plugin itself", { timeout: CAPTURE_TIMEOUT_MS }, async (st) => {
		const outputPath = path.join(PROJECT2, ".e2e-installed-no-props.png");
		await rm(outputPath, { force: true });
		try {
			const result = await runInstalledCli(PROJECT2, ["components/NoProps.tsx", "--output", outputPath], { signal: st.signal });
			assert.equal(result.exitCode, 0, describeFailure("screenshot (second project)", result));
			await assertRealPng(outputPath);
		} finally {
			await rm(outputPath, { force: true });
		}
	});

	// (US5) Every documented props-passing method, run from the installed package, against a
	// required-props component. (Also covers T030: --props-file's relative path resolving against
	// PROJECT1's own cwd, not this repository's - `propsFilePath` below is written into PROJECT1 and
	// passed as a bare relative path.)
	await t.test("--props, --props-file, individual flags, and SCREENSHOT_PROPS all work identically from the installed package", async (pt) => {
		const outputPath = path.join(PROJECT1, ".e2e-installed-required-props.png");
		const propsFilePath = path.join(PROJECT1, ".e2e-props.json");
		await writeFile(propsFilePath, JSON.stringify({ text: "Save changes", disabled: false }), "utf8");

		try {
			await pt.test("--props", { timeout: CAPTURE_TIMEOUT_MS }, async (st) => {
				await rm(outputPath, { force: true });
				const result = await runInstalledCli(PROJECT1, ["components/RequiredProps.tsx", "--props", '{"text":"Save changes","disabled":false}', "--output", outputPath], { signal: st.signal });
				assert.equal(result.exitCode, 0, describeFailure("--props", result));
				await assertRealPng(outputPath);
			});

			await pt.test("--props-file (relative path, resolved against PROJECT1's own cwd)", { timeout: CAPTURE_TIMEOUT_MS }, async (st) => {
				await rm(outputPath, { force: true });
				const result = await runInstalledCli(PROJECT1, ["components/RequiredProps.tsx", "--props-file", ".e2e-props.json", "--output", outputPath], { signal: st.signal });
				assert.equal(result.exitCode, 0, describeFailure("--props-file", result));
				await assertRealPng(outputPath);
			});

			await pt.test("individual --<prop> flags", { timeout: CAPTURE_TIMEOUT_MS }, async (st) => {
				await rm(outputPath, { force: true });
				const result = await runInstalledCli(PROJECT1, ["components/RequiredProps.tsx", "--text", "Save changes", "--disabled", "false", "--output", outputPath], { signal: st.signal });
				assert.equal(result.exitCode, 0, describeFailure("individual flags", result));
				await assertRealPng(outputPath);
			});

			await pt.test("SCREENSHOT_PROPS environment variable", { timeout: CAPTURE_TIMEOUT_MS }, async (st) => {
				await rm(outputPath, { force: true });
				const result = await runInstalledCli(
					PROJECT1,
					["components/RequiredProps.tsx", "--output", outputPath],
					{ env: { SCREENSHOT_PROPS: '{"text":"Save changes","disabled":false}' }, signal: st.signal },
				);
				assert.equal(result.exitCode, 0, describeFailure("SCREENSHOT_PROPS", result));
				await assertRealPng(outputPath);
			});
		} finally {
			await rm(outputPath, { force: true });
			await rm(propsFilePath, { force: true });
		}
	});
});
