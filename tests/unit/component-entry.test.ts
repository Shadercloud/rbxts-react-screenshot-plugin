import assert from "node:assert/strict";
import test from "node:test";

import { generateBootstrapSource } from "../../src/compiler/component-entry.js";

test("the generated bootstrap embeds the supplied props as a JSON-shaped object literal", () => {
	const source = generateBootstrapSource({
		componentImportPath: "./RequiredProps",
		markerWrapperImportPath: "../../src/compiler/marker-wrapper",
		props: { text: "Save changes", disabled: false },
		temporaryRootName: "ScreenshotCapture_test",
	});
	assert.match(source, /React\.createElement\(Component, \{"text":"Save changes","disabled":false\}\)/);
});

test("different props produce different generated source", () => {
	const options = { componentImportPath: "./RequiredProps", markerWrapperImportPath: "../marker-wrapper", temporaryRootName: "ScreenshotCapture_test" };
	const first = generateBootstrapSource({ ...options, props: { text: "Save" } });
	const second = generateBootstrapSource({ ...options, props: { text: "Cancel" } });
	assert.notEqual(first, second);
	assert.match(first, /"Save"/);
	assert.match(second, /"Cancel"/);
});

test("the generated bootstrap names the temporary root and requires the marker wrapper and component", () => {
	const source = generateBootstrapSource({
		componentImportPath: "./Button",
		markerWrapperImportPath: "../marker-wrapper",
		props: {},
		temporaryRootName: "ScreenshotCapture_abc123",
	});
	assert.match(source, /root\.Name = "ScreenshotCapture_abc123"/);
	assert.match(source, /import Component = require\("\.\/Button"\)/);
	assert.match(source, /import MarkerWrapper = require\("\.\.\/marker-wrapper"\)/);
});
