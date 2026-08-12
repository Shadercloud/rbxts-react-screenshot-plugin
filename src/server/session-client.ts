/** Plugin-side HTTP client for the capture session protocol (contracts/http-api.md). */
import { HttpService } from "@rbxts/services";

import { sha256Bytes } from "./sha256";
import { PROTOCOL_VERSION } from "../types/protocol";
import type { AckPhase, SessionManifest, SessionStatusResponse } from "../types/protocol";

export type ClientLog = (message: string) => void;

export class SessionClient {
	public constructor(private readonly bridgeUrl: string, private readonly log: ClientLog = () => {}) {}

	/** Polls `GET /session` once; returns `undefined` when there is no active session. */
	public discover(): SessionManifest | undefined {
		// Reports this plugin's own compiled-in protocol version on every poll, so a bridge running a
		// newer/incompatible package version can reject a stale installed plugin before any model
		// transfer, instead of hanging or failing opaquely later.
		const response = HttpService.RequestAsync({
			Url: `${this.bridgeUrl}/session?pluginProtocolVersion=${HttpService.UrlEncode(PROTOCOL_VERSION)}`,
			Method: "GET",
		});
		if (response.StatusCode === 200) return HttpService.JSONDecode(response.Body) as SessionManifest;
		if (response.StatusCode === 204) return undefined;
		if (response.StatusCode === 409) {
			const body = HttpService.JSONDecode(response.Body) as { error?: string };
			error(`Screenshot plugin is out of date (${body.error ?? "protocol version mismatch"}) - re-run 'install-plugin'.`);
		}
		error(`Session discovery failed with HTTP ${response.StatusCode}`);
	}

	/** Downloads the model, validating its byte length and SHA-256 hash against the manifest. */
	public downloadModel(manifest: SessionManifest): buffer {
		const response = HttpService.RequestAsync({ Url: `${this.bridgeUrl}${manifest.modelUrl}`, Method: "GET" });
		if (!response.Success) error(`Model download failed with HTTP ${response.StatusCode}`);
		const body = response.Body;
		const length = body.size();
		if (length !== manifest.contentLength) {
			error(`Downloaded model is ${length} bytes; expected ${manifest.contentLength}`);
		}
		// One byte per string.byte() call: asking for the whole range at once (string.byte(body, 1,
		// length)) returns one value per byte from a single call, which overflows Luau's multiple-
		// return limit for anything beyond a few hundred bytes - real compiled models are hundreds
		// of KB.
		const bytes = new Array<number>();
		for (let i = 1; i <= length; i += 1) {
			const [byte] = string.byte(body, i);
			bytes.push(byte);
		}
		const digest = sha256Bytes(bytes);
		if (digest !== manifest.modelSha256) {
			error(`Downloaded model hash '${digest}' did not match the manifest hash '${manifest.modelSha256}'`);
		}
		this.log(`Downloaded and validated model (${body.size()} bytes)`);
		return buffer.fromstring(body);
	}

	/** Reports `loaded`, `ready`, or `failed` for the active session. */
	public ack(sessionId: string, phase: AckPhase, message?: string): void {
		const response = HttpService.RequestAsync({
			Url: `${this.bridgeUrl}/session/${HttpService.UrlEncode(sessionId)}/ack`,
			Method: "POST",
			Headers: { ["Content-Type"]: "application/json" },
			Body: HttpService.JSONEncode({ phase, message }),
		});
		if (!response.Success) error(`Acknowledging '${phase}' was rejected with HTTP ${response.StatusCode}`);
	}

	/** Polls the session's current status. */
	public pollStatus(sessionId: string): SessionStatusResponse {
		const response = HttpService.RequestAsync({ Url: `${this.bridgeUrl}/session/${HttpService.UrlEncode(sessionId)}/status`, Method: "GET" });
		if (!response.Success) error(`Status poll failed with HTTP ${response.StatusCode}`);
		return HttpService.JSONDecode(response.Body) as SessionStatusResponse;
	}
}
