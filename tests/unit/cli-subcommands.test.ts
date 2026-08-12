import assert from "node:assert/strict";
import test from "node:test";

import { resolveSubcommand } from "../../src/bridge/screenshot-cli.js";

test("'install-plugin' routes to the plugin-install path", () => {
	assert.equal(resolveSubcommand(["install-plugin"]), "install-plugin");
});

test("a bare component path routes to the default capture path", () => {
	assert.equal(resolveSubcommand(["Button.tsx"]), "capture");
});

test("no arguments at all routes to the default capture path (it fails later with a usage error)", () => {
	assert.equal(resolveSubcommand([]), "capture");
});

test("'install-plugin' only matches as the first argument, not as a component path value", () => {
	assert.equal(resolveSubcommand(["Button.tsx", "install-plugin"]), "capture");
});
