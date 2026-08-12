import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { parseArgs } from "../../src/bridge/screenshot-cli.js";

const CWD = "C:/repo";

test("a leading slash resolves the component path from the repository root", () => {
	const parsed = parseArgs(["/src/components/Button.tsx"], CWD);
	assert.equal(parsed.componentPath, path.join(CWD, "src/components/Button.tsx"));
});

test("a relative path resolves from the working directory", () => {
	const parsed = parseArgs(["src/components/Button.tsx"], CWD);
	assert.equal(parsed.componentPath, path.resolve(CWD, "src/components/Button.tsx"));
});

test("props default to an empty object when --props is omitted", () => {
	const parsed = parseArgs(["Button.tsx"], CWD);
	assert.deepEqual(parsed.props, {});
});

test("--props parses a JSON object", () => {
	const parsed = parseArgs(["Button.tsx", "--props", '{"text":"Save","disabled":false}'], CWD);
	assert.deepEqual(parsed.props, { text: "Save", disabled: false });
});

test("--output sets the output path", () => {
	const parsed = parseArgs(["Button.tsx", "--output", "out/result.png"], CWD);
	assert.equal(parsed.outputPath, "out/result.png");
});

test("invalid --props JSON is rejected", () => {
	assert.throws(() => parseArgs(["Button.tsx", "--props", "{not json}"], CWD), /valid JSON/i);
});

test("a non-object --props value is rejected", () => {
	assert.throws(() => parseArgs(["Button.tsx", "--props", "[1,2,3]"], CWD), /JSON object/i);
	assert.throws(() => parseArgs(["Button.tsx", "--props", "42"], CWD), /JSON object/i);
	assert.throws(() => parseArgs(["Button.tsx", "--props", "null"], CWD), /JSON object/i);
});

test("a missing component path is rejected", () => {
	assert.throws(() => parseArgs([], CWD), /Usage:/);
});

test("a non-.tsx component path is rejected", () => {
	assert.throws(() => parseArgs(["Button.jsx"], CWD), /\.tsx/);
});

test("individual --<prop> flags build a props object with type coercion", () => {
	const parsed = parseArgs(
		["Button.tsx", "--text", "Save changes", "--count", "3", "--ratio", "1.5", "--disabled", "false", "--tag", "null"],
		CWD,
	);
	assert.deepEqual(parsed.props, { text: "Save changes", count: 3, ratio: 1.5, disabled: false, tag: null });
});

test("an individual --<prop> flag with no following value (or followed by another flag) defaults to true", () => {
	const parsed = parseArgs(["Button.tsx", "--visible", "--text", "Save"], CWD);
	assert.deepEqual(parsed.props, { visible: true, text: "Save" });
});

test("individual --<prop> flags cannot be combined with --props or --props-file", () => {
	assert.throws(() => parseArgs(["Button.tsx", "--props", "{}", "--text", "Save"], CWD), /cannot be combined/);
	assert.throws(() => parseArgs(["Button.tsx", "--props-file", "props.json", "--text", "Save"], CWD), /cannot be combined/);
});

test("--props-file reads and parses JSON from a file, resolved against the real cwd", () => {
	// This uses a real temp directory (not the fake CWD constant above) because it must actually
	// exist on disk for readFileSync to succeed.
	const realCwd = mkdtempSync(path.join(tmpdir(), "cli-options-test-"));
	try {
		const propsFilePath = path.join(realCwd, "props.json");
		writeFileSync(propsFilePath, '{"text":"Save changes","disabled":false}', "utf8");
		const parsed = parseArgs(["Button.tsx", "--props-file", "props.json"], realCwd);
		assert.deepEqual(parsed.props, { text: "Save changes", disabled: false });
	} finally {
		rmSync(realCwd, { recursive: true, force: true });
	}
});

test("--props and --props-file together are rejected", () => {
	assert.throws(
		() => parseArgs(["Button.tsx", "--props", "{}", "--props-file", "props.json"], CWD),
		/cannot be combined/,
	);
});

test("a missing --props-file is rejected with a clear error", () => {
	assert.throws(() => parseArgs(["Button.tsx", "--props-file", "does-not-exist.json"], CWD), /Could not read --props-file/);
});

test("--props-file tolerates a leading UTF-8 BOM (as written by PowerShell's Out-File -Encoding utf8)", () => {
	const realCwd = mkdtempSync(path.join(tmpdir(), "cli-options-test-"));
	try {
		const propsFilePath = path.join(realCwd, "props.json");
		const utf8Bom = Buffer.from([0xef, 0xbb, 0xbf]);
		writeFileSync(propsFilePath, Buffer.concat([utf8Bom, Buffer.from('{"text":"Save changes"}', "utf8")]));
		const parsed = parseArgs(["Button.tsx", "--props-file", "props.json"], realCwd);
		assert.deepEqual(parsed.props, { text: "Save changes" });
	} finally {
		rmSync(realCwd, { recursive: true, force: true });
	}
});

test("the SCREENSHOT_PROPS environment variable is parsed as JSON when no other props source is given", () => {
	const parsed = parseArgs(["Button.tsx"], CWD, { SCREENSHOT_PROPS: '{"text":"Save changes","disabled":false}' });
	assert.deepEqual(parsed.props, { text: "Save changes", disabled: false });
});

test("SCREENSHOT_PROPS cannot be combined with --props, --props-file, or individual --<prop> flags", () => {
	const env = { SCREENSHOT_PROPS: "{}" };
	assert.throws(() => parseArgs(["Button.tsx", "--props", "{}"], CWD, env), /cannot be combined/);
	assert.throws(() => parseArgs(["Button.tsx", "--props-file", "props.json"], CWD, env), /cannot be combined/);
	assert.throws(() => parseArgs(["Button.tsx", "--text", "Save"], CWD, env), /cannot be combined/);
});

test("invalid JSON in SCREENSHOT_PROPS is rejected", () => {
	assert.throws(() => parseArgs(["Button.tsx"], CWD, { SCREENSHOT_PROPS: "{not json}" }), /valid JSON/i);
});
