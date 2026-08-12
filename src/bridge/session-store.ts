/** Single-session store enforcing the building->available->loaded->ready->capturing->done lifecycle. */
import { randomUUID, createHash } from "node:crypto";

import type { AckPhase, SessionManifest, SessionStatus, SessionStatusResponse } from "../types/protocol.js";
import type { CaptureSession } from "../types/session.js";

export type AckOutcome = "accepted" | "unknown" | "conflict";

const TERMINAL_STATUSES: ReadonlySet<SessionStatus> = new Set(["done", "failed", "expired"]);
const NON_TERMINAL_STATUSES: ReadonlySet<SessionStatus> = new Set(["building", "available", "loaded", "ready", "capturing"]);

interface InternalSession extends CaptureSession {
	modelBuffer?: Buffer;
	modelSha256?: string;
	phaseTimer?: NodeJS.Timeout;
}

export interface SessionStoreOptions {
	/** How long the plugin has to acknowledge `loaded` after the model becomes available, and `ready` after `loaded`. */
	phaseTimeoutMs?: number;
}

export class SessionStore {
	private session: InternalSession | undefined;
	private readonly phaseTimeoutMs: number;
	private onExpiredListener: ((session: CaptureSession) => void) | undefined;

	public constructor(options: SessionStoreOptions = {}) {
		this.phaseTimeoutMs = options.phaseTimeoutMs ?? 30_000;
	}

	/** Invoked whenever a phase timeout expires a session; lets the command orchestrator react (e.g. abort capture). */
	public onExpired(listener: (session: CaptureSession) => void): void {
		this.onExpiredListener = listener;
	}

	public create(componentPath: string, temporaryRootName: string): CaptureSession {
		this.clearTimer();
		const now = new Date().toISOString();
		this.session = {
			id: randomUUID(),
			status: "building",
			componentPath,
			modelPath: "",
			temporaryRootName,
			createdAt: now,
			updatedAt: now,
		};
		return { ...this.session };
	}

	public markAvailable(id: string, modelPath: string, modelBuffer: Buffer): CaptureSession {
		const session = this.requireSession(id, ["building"]);
		session.modelPath = modelPath;
		session.modelBuffer = modelBuffer;
		session.modelSha256 = createHash("sha256").update(modelBuffer).digest("hex");
		this.transition(session, "available");
		this.armPhaseTimer(session, "Plugin did not acknowledge 'loaded' before the model became stale");
		return { ...session };
	}

	public ack(id: string, phase: AckPhase, message?: string): AckOutcome {
		const session = this.session;
		if (!session || session.id !== id) return "unknown";
		if (phase === "failed") {
			if (TERMINAL_STATUSES.has(session.status)) return "conflict";
			this.clearTimer();
			session.error = message ?? "Plugin reported failure";
			this.transition(session, "failed");
			return "accepted";
		}
		if (phase === "loaded") {
			if (session.status !== "available") return "conflict";
			this.clearTimer();
			this.transition(session, "loaded");
			this.armPhaseTimer(session, "Plugin did not acknowledge 'ready' after loading the model");
			return "accepted";
		}
		if (session.status !== "loaded") return "conflict";
		this.clearTimer();
		this.transition(session, "ready");
		return "accepted";
	}

	public markCapturing(id: string): CaptureSession {
		const session = this.requireSession(id, ["ready"]);
		this.transition(session, "capturing");
		return { ...session };
	}

	public markDone(id: string): CaptureSession {
		const session = this.requireSession(id, ["capturing"]);
		this.transition(session, "done");
		return { ...session };
	}

	public markFailed(id: string, error: string): CaptureSession | undefined {
		const session = this.session;
		if (!session || session.id !== id || TERMINAL_STATUSES.has(session.status)) return undefined;
		this.clearTimer();
		session.error = error;
		this.transition(session, "failed");
		return { ...session };
	}

	public getManifest(id: string): SessionManifest | undefined {
		const session = this.session;
		if (!session || session.id !== id || !session.modelBuffer || !session.modelSha256) return undefined;
		return {
			sessionId: session.id,
			status: session.status,
			modelUrl: `/session/${session.id}/model`,
			modelSha256: session.modelSha256,
			contentLength: session.modelBuffer.length,
			temporaryRootName: session.temporaryRootName,
		};
	}

	public getStatus(id: string): SessionStatusResponse | undefined {
		const session = this.session;
		if (!session || session.id !== id) return undefined;
		return { sessionId: session.id, status: session.status, error: session.error };
	}

	public getModelBytes(id: string): Buffer | undefined {
		const session = this.session;
		if (!session || session.id !== id) return undefined;
		return session.modelBuffer;
	}

	public current(): CaptureSession | undefined {
		return this.session ? { ...this.session } : undefined;
	}

	public close(): void {
		this.clearTimer();
	}

	private requireSession(id: string, allowed: SessionStatus[]): InternalSession {
		const session = this.session;
		if (!session || session.id !== id) throw new Error(`Unknown capture session '${id}'`);
		if (!allowed.includes(session.status)) throw new Error(`Session '${id}' is '${session.status}', expected one of ${allowed.join(", ")}`);
		return session;
	}

	private transition(session: InternalSession, status: SessionStatus): void {
		session.status = status;
		session.updatedAt = new Date().toISOString();
	}

	private armPhaseTimer(session: InternalSession, timeoutMessage: string): void {
		this.clearTimer();
		session.phaseTimer = setTimeout(() => {
			if (this.session !== session || TERMINAL_STATUSES.has(session.status)) return;
			session.error = timeoutMessage;
			this.transition(session, "expired");
			this.onExpiredListener?.({ ...session });
		}, this.phaseTimeoutMs);
	}

	private clearTimer(): void {
		if (this.session?.phaseTimer) clearTimeout(this.session.phaseTimer);
	}
}

export function isNonTerminal(status: SessionStatus): boolean {
	return NON_TERMINAL_STATUSES.has(status);
}
