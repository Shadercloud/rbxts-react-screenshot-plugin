import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createSessionServer } from "../../src/bridge/session-server.js";
import { SessionStore } from "../../src/bridge/session-store.js";
import { PROTOCOL_VERSION } from "../../src/types/protocol.js";

async function withServer(run: (url: string, store: SessionStore) => Promise<void>): Promise<void> {
	const store = new SessionStore({ phaseTimeoutMs: 5_000 });
	const server = createSessionServer(store, { host: "127.0.0.1", port: 0 });
	const address = await server.listen();
	try {
		await run(`http://127.0.0.1:${address.port}`, store);
	} finally {
		await server.close();
		store.close();
	}
}

test("no active session reports 204 on discovery", () => withServer(async (url) => {
	const response = await fetch(`${url}/session`);
	assert.equal(response.status, 204);
}));

test("a full session walks discovery, model download, acks, and terminal status polling", () => withServer(async (url, store) => {
	const model = Buffer.from("fake-rbxm-bytes");
	const session = store.create("src/components/Button.tsx", "ScreenshotCapture_abc");
	store.markAvailable(session.id, "/tmp/capture.rbxm", model);

	const discover = await fetch(`${url}/session?pluginProtocolVersion=${PROTOCOL_VERSION}`);
	assert.equal(discover.status, 200);
	const manifest = await discover.json() as { sessionId: string; modelUrl: string; modelSha256: string; contentLength: number };
	assert.equal(manifest.sessionId, session.id);
	assert.equal(manifest.modelSha256, createHash("sha256").update(model).digest("hex"));
	assert.equal(manifest.contentLength, model.length);

	const download = await fetch(`${url}${manifest.modelUrl}`);
	assert.equal(download.status, 200);
	assert.equal(download.headers.get("content-type"), "application/octet-stream");
	assert.deepEqual(Buffer.from(await download.arrayBuffer()), model);

	const loadedAck = await fetch(`${url}/session/${session.id}/ack`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ phase: "loaded" }),
	});
	assert.equal(loadedAck.status, 204);

	const readyAck = await fetch(`${url}/session/${session.id}/ack`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ phase: "ready", message: "ScreenGui rendered" }),
	});
	assert.equal(readyAck.status, 204);

	store.markCapturing(session.id);
	store.markDone(session.id);

	const status = await fetch(`${url}/session/${session.id}/status`);
	assert.equal(status.status, 200);
	assert.deepEqual(await status.json(), { sessionId: session.id, status: "done" });

	const staleModel = await fetch(`${url}/session/${session.id}/model`);
	assert.equal(staleModel.status, 410);
}));

test("acknowledging out of order returns 409 and unknown sessions return 404", () => withServer(async (url, store) => {
	const session = store.create("Button.tsx", "ScreenshotCapture_abc");
	store.markAvailable(session.id, "/tmp/capture.rbxm", Buffer.from("bytes"));

	const outOfOrder = await fetch(`${url}/session/${session.id}/ack`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ phase: "ready" }),
	});
	assert.equal(outOfOrder.status, 409);

	const unknown = await fetch(`${url}/session/not-a-real-id/status`);
	assert.equal(unknown.status, 404);
}));

test("a matching plugin protocol version proceeds to the normal manifest", () => withServer(async (url, store) => {
	const session = store.create("Button.tsx", "ScreenshotCapture_abc");
	store.markAvailable(session.id, "/tmp/capture.rbxm", Buffer.from("bytes"));

	const response = await fetch(`${url}/session?pluginProtocolVersion=${PROTOCOL_VERSION}`);
	assert.equal(response.status, 200);
}));

test("a mismatched plugin protocol version is rejected and fails the session before any model transfer", () => withServer(async (url, store) => {
	const session = store.create("Button.tsx", "ScreenshotCapture_abc");
	store.markAvailable(session.id, "/tmp/capture.rbxm", Buffer.from("bytes"));

	const response = await fetch(`${url}/session?pluginProtocolVersion=0`);
	assert.equal(response.status, 409);
	const body = await response.json() as { error: string; expectedVersion: string; pluginVersion: string };
	assert.equal(body.error, "protocol-version-mismatch");
	assert.equal(body.expectedVersion, PROTOCOL_VERSION);
	assert.equal(body.pluginVersion, "0");

	const status = store.getStatus(session.id);
	assert.equal(status?.status, "failed");
	assert.match(status?.error ?? "", /install-plugin/);
}));

test("a plugin response predating protocol-version reporting entirely is treated as a mismatch", () => withServer(async (url, store) => {
	const session = store.create("Button.tsx", "ScreenshotCapture_abc");
	store.markAvailable(session.id, "/tmp/capture.rbxm", Buffer.from("bytes"));

	// An old plugin built before this field existed would poll `GET /session` with no query
	// parameter at all, exactly like this bare request.
	const response = await fetch(`${url}/session`);
	assert.equal(response.status, 409);

	const status = store.getStatus(session.id);
	assert.equal(status?.status, "failed");
	assert.match(status?.error ?? "", /predates version reporting/);
}));
