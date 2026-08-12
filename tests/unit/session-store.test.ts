import assert from "node:assert/strict";
import test from "node:test";

import { SessionStore } from "../../src/bridge/session-store.js";

function model(byte = 1): Buffer {
	return Buffer.from([byte, byte, byte]);
}

test("a session moves through the happy-path lifecycle in order", () => {
	const store = new SessionStore({ phaseTimeoutMs: 10_000 });
	const created = store.create("src/components/Button.tsx", "ScreenshotCapture_test");
	assert.equal(created.status, "building");

	store.markAvailable(created.id, "/tmp/capture.rbxm", model());
	assert.equal(store.getStatus(created.id)?.status, "available");

	assert.equal(store.ack(created.id, "loaded"), "accepted");
	assert.equal(store.getStatus(created.id)?.status, "loaded");

	assert.equal(store.ack(created.id, "ready"), "accepted");
	assert.equal(store.getStatus(created.id)?.status, "ready");

	store.markCapturing(created.id);
	assert.equal(store.getStatus(created.id)?.status, "capturing");

	store.markDone(created.id);
	assert.equal(store.getStatus(created.id)?.status, "done");
	store.close();
});

test("acknowledgements out of order are rejected as a conflict", () => {
	const store = new SessionStore({ phaseTimeoutMs: 10_000 });
	const created = store.create("Button.tsx", "ScreenshotCapture_test");
	assert.equal(store.ack(created.id, "ready"), "conflict");
	store.markAvailable(created.id, "/tmp/capture.rbxm", model());
	assert.equal(store.ack(created.id, "ready"), "conflict");
	store.close();
});

test("an unknown session id is rejected without mutating the active session", () => {
	const store = new SessionStore({ phaseTimeoutMs: 10_000 });
	store.create("Button.tsx", "ScreenshotCapture_test");
	assert.equal(store.ack("not-a-real-id", "loaded"), "unknown");
	store.close();
});

test("a failed acknowledgement is terminal and cannot be repeated", () => {
	const store = new SessionStore({ phaseTimeoutMs: 10_000 });
	const created = store.create("Button.tsx", "ScreenshotCapture_test");
	store.markAvailable(created.id, "/tmp/capture.rbxm", model());
	assert.equal(store.ack(created.id, "failed", "load error"), "accepted");
	assert.equal(store.getStatus(created.id)?.status, "failed");
	assert.equal(store.getStatus(created.id)?.error, "load error");
	assert.equal(store.ack(created.id, "failed", "again"), "conflict");
	store.close();
});

test("a session that never receives the loaded acknowledgement expires", () => new Promise<void>((resolve) => {
	const store = new SessionStore({ phaseTimeoutMs: 15 });
	const created = store.create("Button.tsx", "ScreenshotCapture_test");
	store.onExpired((expired) => {
		assert.equal(expired.id, created.id);
		assert.equal(expired.status, "expired");
		store.close();
		resolve();
	});
	store.markAvailable(created.id, "/tmp/capture.rbxm", model());
}));

test("markFailed is a no-op once a session already reached a terminal state", () => {
	const store = new SessionStore({ phaseTimeoutMs: 10_000 });
	const created = store.create("Button.tsx", "ScreenshotCapture_test");
	store.markAvailable(created.id, "/tmp/capture.rbxm", model());
	store.ack(created.id, "loaded");
	store.ack(created.id, "ready");
	store.markCapturing(created.id);
	store.markDone(created.id);
	assert.equal(store.markFailed(created.id, "too late"), undefined);
	assert.equal(store.getStatus(created.id)?.status, "done");
	store.close();
});
