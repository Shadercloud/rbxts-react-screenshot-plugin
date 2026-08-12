/** Node-owned capture session and command types, matching data-model.md. */
import type { JsonObject, SessionStatus } from "./protocol.js";

export interface CaptureCommand {
	componentPath: string;
	props: JsonObject;
	outputPath?: string;
}

export interface CaptureSession {
	id: string;
	status: SessionStatus;
	componentPath: string;
	modelPath: string;
	temporaryRootName: string;
	createdAt: string;
	updatedAt: string;
	error?: string;
}

export interface Bounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface CaptureArtifact {
	rawPath: string;
	outputPath: string;
	studioWindowBounds: Bounds;
	markerOuterBounds?: Bounds;
	contentBounds?: Bounds;
}
