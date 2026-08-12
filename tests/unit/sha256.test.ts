import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { sha256Bytes } from "../../src/server/sha256.js";

function reference(bytes: number[]): string {
	return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

const cases: number[][] = [
	[],
	Array.from(Buffer.from("abc")),
	Array.from(Buffer.from("The quick brown fox jumps over the lazy dog")),
	Array.from({ length: 55 }, (_, i) => i % 256),
	Array.from({ length: 56 }, (_, i) => i % 256),
	Array.from({ length: 64 }, (_, i) => i % 256),
	Array.from({ length: 65 }, (_, i) => i % 256),
	Array.from({ length: 1_000 }, (_, i) => (i * 7) % 256),
];

for (const [index, bytes] of cases.entries()) {
	test(`sha256Bytes matches node:crypto for case ${index} (${bytes.length} bytes)`, () => {
		assert.equal(sha256Bytes(bytes), reference(bytes));
	});
}
