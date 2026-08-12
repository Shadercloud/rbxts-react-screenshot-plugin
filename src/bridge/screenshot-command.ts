/** Orchestrates one capture command end to end: compile, serve, wait for readiness, capture, crop, clean up. */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { buildCaptureModel } from "../compiler/model-builder.js";
import { cropToMarker } from "../capture/marker-crop.js";
import type { RgbColor } from "../capture/color.js";
import { ensureStudioWindow as ensureStudioWindowReal, type EnsureStudioWindowOptions, type StudioWindow } from "../capture/studio-window.js";
import { captureWindow as captureWindowReal, type WindowBounds } from "../capture/window-capture.js";
import { createSessionServer } from "./session-server.js";
import { SessionStore } from "./session-store.js";
import { MARKER_COLOR } from "../../roblox-src/marker-constants.js";
import { MARKER_TOLERANCE } from "../types/protocol.js";
import type { JsonObject } from "../types/protocol.js";

export interface RunCaptureOptions {
	componentPath: string;
	props?: JsonObject;
	outputPath?: string;
	cwd?: string;
	port?: number;
	/** How long the plugin has to acknowledge each phase before the session expires. */
	phaseTimeoutMs?: number;
	/** How long to keep the listener open after a terminal state, so the plugin's next poll observes it. */
	cleanupGraceMs?: number;
	/** Overrides the marker wrapper's opaque content-backing color (see `CONTENT_KEY_COLOR`'s own doc comment); defaults to it when omitted. */
	contentKeyColor?: RgbColor;
	/** Overridable for testing; defaults to the real Win32/Studio-discovery implementations. */
	ensureStudioWindow?: (options?: EnsureStudioWindowOptions) => Promise<StudioWindow>;
	captureWindow?: (hwnd: string, outputPngPath: string) => Promise<WindowBounds>;
	/** Invoked once the session listener is bound; lets tests discover the (possibly ephemeral) port. */
	onListening?: (address: { address: string; port: number }) => void;
}

export interface CaptureResult {
	outputPath: string;
	width: number;
	height: number;
}

function defaultOutputPath(componentPath: string): string {
	return `${path.basename(componentPath, path.extname(componentPath))}.png`;
}

async function awaitReady(store: SessionStore, sessionId: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const status = store.getStatus(sessionId);
		if (!status) throw new Error("Capture session disappeared while waiting for the plugin");
		if (status.status === "ready") return;
		if (status.status === "failed" || status.status === "expired") {
			throw new Error(status.error ?? `Session ended as '${status.status}' before becoming ready`);
		}
		if (Date.now() >= deadline) throw new Error(`Timed out waiting for the plugin to become ready after ${timeoutMs}ms`);
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

/** Runs one full capture: compiles the component, serves it, waits for the plugin, captures Studio, crops, and cleans up. */
export async function runCapture(options: RunCaptureOptions): Promise<CaptureResult> {
	const cwd = path.resolve(options.cwd ?? process.cwd());
	const props = options.props ?? {};
	const outputPath = path.resolve(cwd, options.outputPath ?? defaultOutputPath(options.componentPath));
	const phaseTimeoutMs = options.phaseTimeoutMs ?? 30_000;
	const cleanupGraceMs = options.cleanupGraceMs ?? 2_000;
	const ensureStudioWindowFn = options.ensureStudioWindow ?? ensureStudioWindowReal;
	const captureWindowFn = options.captureWindow ?? captureWindowReal;
	const contentKeyColor = options.contentKeyColor;
	if (contentKeyColor) {
		const tooCloseToMarker = Math.abs(contentKeyColor.r - MARKER_COLOR.r) <= MARKER_TOLERANCE
			&& Math.abs(contentKeyColor.g - MARKER_COLOR.g) <= MARKER_TOLERANCE
			&& Math.abs(contentKeyColor.b - MARKER_COLOR.b) <= MARKER_TOLERANCE;
		if (tooCloseToMarker) {
			throw new Error(`contentKeyColor is too close to the marker border color (rgb(${MARKER_COLOR.r}, ${MARKER_COLOR.g}, ${MARKER_COLOR.b})) - pick a more distinct color`);
		}
	}

	const store = new SessionStore({ phaseTimeoutMs });
	const server = createSessionServer(store, { port: options.port ?? 1927 });
	const address = await server.listen();
	options.onListening?.(address);

	const rawPath = path.join(tmpdir(), `roblox-screenshot-raw-${randomUUID()}.png`);
	let sessionId: string | undefined;

	try {
		const built = await buildCaptureModel(options.componentPath, props, cwd, undefined, undefined, contentKeyColor);

		// The plugin can only discover and act on a session once its own Studio process is
		// running, so Studio must be found or launched before the session is even advertised -
		// otherwise waiting for the plugin's acknowledgement below would time out with nothing
		// ever having launched it.
		const studioWindow = await ensureStudioWindowFn();

		const session = store.create(options.componentPath, built.temporaryRootName);
		sessionId = session.id;
		store.markAvailable(session.id, `<in-memory:${session.id}>`, built.modelBuffer);

		await awaitReady(store, session.id, phaseTimeoutMs);
		store.markCapturing(session.id);

		await captureWindowFn(studioWindow.hwnd, rawPath);
		store.markDone(session.id);

		const rawPng = await readFile(rawPath);
		const { png, contentBounds } = cropToMarker(rawPng, { contentKeyColor });
		await mkdir(path.dirname(outputPath), { recursive: true });
		await writeFile(outputPath, png);

		return { outputPath, width: contentBounds.width, height: contentBounds.height };
	} catch (error) {
		if (sessionId) store.markFailed(sessionId, error instanceof Error ? error.message : String(error));
		throw error;
	} finally {
		await new Promise((resolve) => setTimeout(resolve, cleanupGraceMs));
		await server.close();
		store.close();
		await rm(rawPath, { force: true }).catch(() => undefined);
	}
}
