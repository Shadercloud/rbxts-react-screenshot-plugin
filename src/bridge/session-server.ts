/** Loopback-only HTTP listener exposing one capture session to the polling Studio plugin. */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { SessionStore } from "./session-store.js";
import { PROTOCOL_VERSION } from "../types/protocol.js";
import type { AckPhase } from "../types/protocol.js";

export interface SessionServerOptions {
	host?: "127.0.0.1";
	port?: number;
}

function json(response: ServerResponse, status: number, body: object): void {
	response.writeHead(status, { "content-type": "application/json" });
	response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
	let body = "";
	for await (const chunk of request) {
		body += chunk;
		if (body.length > 1_000_000) throw new Error("Request body is too large");
	}
	return JSON.parse(body);
}

function validateAck(value: unknown): string | { phase: AckPhase; message?: string } {
	if (!value || typeof value !== "object") return "Request body must be a JSON object";
	const body = value as Record<string, unknown>;
	if (body.phase !== "loaded" && body.phase !== "ready" && body.phase !== "failed") return "phase must be 'loaded', 'ready', or 'failed'";
	if (body.message !== undefined && typeof body.message !== "string") return "message must be a string";
	return { phase: body.phase, message: body.message as string | undefined };
}

export function createSessionServer(store: SessionStore, options: SessionServerOptions = {}) {
	const host = options.host ?? "127.0.0.1";
	const port = options.port ?? 1927;

	const server: Server = createServer(async (request, response) => {
		const url = new URL(request.url ?? "/", `http://${host}`);
		try {
			if (request.method === "GET" && url.pathname === "/session") {
				const session = store.current();
				const manifest = session ? store.getManifest(session.id) : undefined;
				if (!manifest) { response.writeHead(204).end(); return; }
				// Reject a version-mismatched plugin before it ever downloads or loads the model - a
				// stale plugin from before a package upgrade (or one that predates this field entirely,
				// reported as `null`) otherwise fails opaquely much later, or hangs.
				const pluginProtocolVersion = url.searchParams.get("pluginProtocolVersion");
				if (pluginProtocolVersion !== PROTOCOL_VERSION) {
					const reported = pluginProtocolVersion ?? "none (plugin predates version reporting)";
					store.markFailed(
						session!.id,
						`Installed Studio plugin reports protocol version '${reported}', but this command expects '${PROTOCOL_VERSION}' - re-run 'install-plugin' to update it.`,
					);
					json(response, 409, { error: "protocol-version-mismatch", expectedVersion: PROTOCOL_VERSION, pluginVersion: pluginProtocolVersion ?? undefined });
					return;
				}
				json(response, 200, manifest);
				return;
			}

			const modelMatch = /^\/session\/([^/]+)\/model$/.exec(url.pathname);
			if (request.method === "GET" && modelMatch) {
				const id = decodeURIComponent(modelMatch[1]);
				const session = store.current();
				if (!session || session.id !== id) { json(response, 404, { error: "Unknown capture session" }); return; }
				if (session.status === "done" || session.status === "failed" || session.status === "expired") {
					response.writeHead(410, { "content-type": "application/json" }).end(JSON.stringify({ error: `Session is '${session.status}'` }));
					return;
				}
				const bytes = store.getModelBytes(id);
				if (!bytes) { json(response, 404, { error: "Model is not available yet" }); return; }
				response.writeHead(200, { "content-type": "application/octet-stream", "content-length": bytes.length });
				response.end(bytes);
				return;
			}

			const ackMatch = /^\/session\/([^/]+)\/ack$/.exec(url.pathname);
			if (request.method === "POST" && ackMatch) {
				const id = decodeURIComponent(ackMatch[1]);
				let value: unknown;
				try { value = await readJson(request); } catch { json(response, 400, { error: "Request body must contain valid JSON" }); return; }
				const validated = validateAck(value);
				if (typeof validated === "string") { json(response, 400, { error: validated }); return; }
				const outcome = store.ack(id, validated.phase, validated.message);
				if (outcome === "unknown") { json(response, 404, { error: "Unknown capture session" }); return; }
				if (outcome === "conflict") { json(response, 409, { error: "Acknowledgement is out of order for the current session state" }); return; }
				response.writeHead(204).end();
				return;
			}

			const statusMatch = /^\/session\/([^/]+)\/status$/.exec(url.pathname);
			if (request.method === "GET" && statusMatch) {
				const id = decodeURIComponent(statusMatch[1]);
				const status = store.getStatus(id);
				if (!status) { json(response, 404, { error: "Unknown capture session" }); return; }
				json(response, 200, status);
				return;
			}

			json(response, 404, { error: "Not found" });
		} catch (error) {
			json(response, 500, { error: error instanceof Error ? error.message : "Internal server error" });
		}
	});

	return {
		listen: () => new Promise<{ address: string; port: number }>((resolve, reject) => {
			server.once("error", reject);
			server.listen(port, host, () => {
				const address = server.address();
				if (!address || typeof address === "string") { reject(new Error("Session listener did not bind a TCP port")); return; }
				resolve({ address: host, port: address.port });
			});
		}),
		close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
	};
}
