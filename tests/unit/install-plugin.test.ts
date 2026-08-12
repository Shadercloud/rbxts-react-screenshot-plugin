import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { installPlugin, resolvePluginsFolder } from "../../src/bridge/install-plugin.js";

function withScratchDirs(run: (scratch: { pluginsFolder: string; bundledPluginPath: string }) => Promise<void> | void) {
	return async () => {
		const root = mkdtempSync(path.join(tmpdir(), "install-plugin-test-"));
		try {
			const pluginsFolder = path.join(root, "plugins-folder");
			const bundledDirectory = path.join(root, "bundled");
			mkdirSync(bundledDirectory, { recursive: true });
			const bundledPluginPath = path.join(bundledDirectory, "ScreenshotPlugin.rbxm");
			await run({ pluginsFolder, bundledPluginPath });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	};
}

test("resolvePluginsFolder joins %LOCALAPPDATA%/Roblox/Plugins", () => {
	const folder = resolvePluginsFolder({ LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local" });
	assert.equal(folder, path.join("C:\\Users\\test\\AppData\\Local", "Roblox", "Plugins"));
});

test("resolvePluginsFolder fails clearly when %LOCALAPPDATA% is unset", () => {
	assert.throws(() => resolvePluginsFolder({}), /LOCALAPPDATA/);
});

test(
	"installs the bundled plugin into the plugins folder, creating it if needed",
	withScratchDirs(async ({ pluginsFolder, bundledPluginPath }) => {
		writeFileSync(bundledPluginPath, "fake-rbxm-bytes");
		const destination = await installPlugin({ pluginsFolder, bundledPluginPath });
		assert.equal(destination, path.join(pluginsFolder, "ScreenshotPlugin.rbxm"));
		assert.equal(readFileSync(destination, "utf8"), "fake-rbxm-bytes");
	}),
);

test(
	"re-running install is idempotent: it overwrites a previously installed copy",
	withScratchDirs(async ({ pluginsFolder, bundledPluginPath }) => {
		writeFileSync(bundledPluginPath, "version-one");
		await installPlugin({ pluginsFolder, bundledPluginPath });

		writeFileSync(bundledPluginPath, "version-two");
		const destination = await installPlugin({ pluginsFolder, bundledPluginPath });

		assert.equal(readFileSync(destination, "utf8"), "version-two");
	}),
);

test(
	"a missing bundled plugin binary is reported as a clear error, not a silent no-op",
	withScratchDirs(async ({ pluginsFolder, bundledPluginPath }) => {
		await assert.rejects(
			() => installPlugin({ pluginsFolder, bundledPluginPath }),
			/Could not install the bundled Screenshot Plugin/,
		);
	}),
);
