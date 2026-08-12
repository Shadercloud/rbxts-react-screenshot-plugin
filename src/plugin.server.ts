/** Roblox Studio plugin entry point implementing the capture session lifecycle. */
import { StarterGui, Workspace } from "@rbxts/services";

import { SessionClient } from "./server/session-client";
import { BOOTSTRAP_MODULE_NAME } from "./types/protocol";
import type { SessionManifest } from "./types/protocol";
import { createLogWindow } from "./ui/log-window";

const bridgeUrl = (script.GetAttribute("BridgeUrl") as string | undefined) ?? "http://127.0.0.1:1927";
const pluginWindow = createLogWindow(plugin);
const log = pluginWindow.log;

const SerializationService = game.GetService("SerializationService");

function findBootstrapModule(roots: Instance[]): ModuleScript | undefined {
	for (const root of roots) {
		if (root.IsA("ModuleScript") && root.Name === BOOTSTRAP_MODULE_NAME) return root;
		const found = root.FindFirstChild(BOOTSTRAP_MODULE_NAME, true);
		if (found?.IsA("ModuleScript")) return found;
	}
	return undefined;
}

/**
 * Deserializes the payload, requires its bootstrap module, and returns the built temporary root
 * (not yet parented) with the code payload tucked inside it as a hidden child.
 *
 * The payload (React, the reconciler, the scheduler, etc.) must stay alive for as long as the
 * built root does, not just until this function returns: `build()`'s `reactRoot.render(...)`
 * only *schedules* React's work - it doesn't run synchronously - so the ModuleScripts it depends
 * on are still needed when that scheduled work actually executes on a later frame. Destroying the
 * payload immediately after `build()` returns (as this used to do, via a `finally` block) orphaned
 * those ModuleScripts before the scheduler ever got to run, so `script.Parent` was `nil` by the
 * time deferred work tried to `require()` a sibling module - the real cause of the
 * "attempt to index nil" / "Should not already be working" React crashes seen while debugging
 * this, which had nothing to do with mount location or polling mechanism.
 */
function buildTemporaryRoot(modelBytes: buffer, temporaryRootName: string): Folder {
	const payloadRoots = SerializationService.DeserializeInstancesAsync(modelBytes);
	const payloadContainer = new Instance("Folder");
	payloadContainer.Name = "ScreenshotCapturePayload";
	payloadContainer.Parent = game.GetService("CoreGui");
	for (const root of payloadRoots) root.Parent = payloadContainer;

	let succeeded = false;
	try {
		const bootstrap = findBootstrapModule(payloadRoots);
		if (!bootstrap) error(`Capture model does not contain a '${BOOTSTRAP_MODULE_NAME}' module`);
		const bootstrapModule = require(bootstrap!) as { build?: unknown };
		if (!typeIs(bootstrapModule.build, "function")) error(`'${BOOTSTRAP_MODULE_NAME}' did not export a build() function`);
		const root = (bootstrapModule.build as () => Folder)();
		if (!root.IsA("Folder") || root.Name !== temporaryRootName) {
			error("The built temporary root did not match the session's expected name");
		}
		payloadContainer.Parent = root;
		succeeded = true;
		return root;
	} finally {
		if (!succeeded) payloadContainer.Destroy();
	}
}

/**
 * Waits for React to actually populate the `ScreenGui`, not just for the (plain `Instance.new`,
 * pre-React) `ScreenGui` shell to exist. React's render here is scheduled/asynchronous rather
 * than committing synchronously within the bootstrap's `build()` call, so checking only for the
 * `ScreenGui` itself passes instantly and lets the capture race React's own render.
 *
 * Polls with `task.wait()` rather than `RunService.Heartbeat.Wait()`. This turned out not to be
 * the fix for the React scheduler crashes hit while debugging this (see `buildTemporaryRoot`'s
 * payload-lifecycle comment for the real cause), but there's no reason to prefer binding to
 * `Heartbeat` here over the simpler, more common `task.wait()` idiom.
 */
function awaitRenderedContent(screen: ScreenGui, timeoutSeconds = 10): void {
	const deadline = os.clock() + timeoutSeconds;
	while (os.clock() < deadline) {
		if (screen.FindFirstChildWhichIsA("GuiObject", true)) {
			task.wait();
			task.wait();
			return;
		}
		task.wait();
	}
	error(`No rendered content appeared under the ScreenGui within ${timeoutSeconds}s`);
}

/**
 * Polls until the `ScreenGui` reports a nonzero `AbsoluteSize`. Right after being reparented into
 * `StarterGui`, Studio hasn't computed the live-preview viewport size yet - reading it too early
 * would see `0, 0` and make every capture look too big for the viewport.
 */
function awaitViewportSize(screen: ScreenGui, timeoutSeconds = 10): Vector2 {
	const deadline = os.clock() + timeoutSeconds;
	while (os.clock() < deadline) {
		const size = screen.AbsoluteSize;
		if (size.X > 0 && size.Y > 0) return size;
		task.wait();
	}
	error(`Studio's viewport size never became available within ${timeoutSeconds}s`);
}

/**
 * Waits for `instance`'s `AbsoluteSize` to stop changing across consecutive frames before returning
 * it. Roblox's `AutomaticSize` layout for a cascade of several nested `AutomaticSize` frames (this
 * plugin's own marker frames wrapping a real UI-kit component that is itself `AutomaticSize`, with
 * its own icon+label pair arranged by a `UIListLayout`) doesn't necessarily converge to its final
 * size in a single frame - each level's resize can trigger its parent's own re-layout on a LATER
 * frame. Capturing before everything has settled is what produced "the marker border is incomplete"
 * for sufficiently complex components: the marker's rendered pixels genuinely hadn't reached their
 * final, self-consistent size yet, so its drawn border didn't line up with where the border actually
 * ought to be. The Node-side crop step still measures (rather than assumes) the actual border depth
 * per capture, absorbing whatever small amount of per-level rounding remains even once settled - this
 * fixes the much larger, unbounded drift from capturing mid-convergence.
 */
function awaitStableSize(instance: GuiObject, timeoutSeconds = 10, requiredStableFrames = 5): Vector2 {
	const deadline = os.clock() + timeoutSeconds;
	let lastSize = instance.AbsoluteSize;
	let stableFrames = 0;
	while (os.clock() < deadline) {
		task.wait();
		const size = instance.AbsoluteSize;
		if (size.X === lastSize.X && size.Y === lastSize.Y) {
			stableFrames += 1;
			if (stableFrames >= requiredStableFrames) return size;
		} else {
			stableFrames = 0;
			lastSize = size;
		}
	}
	error(`'${instance.Name}'s size never stabilized within ${timeoutSeconds}s (last seen ${math.floor(lastSize.X)}x${math.floor(lastSize.Y)})`);
}

/**
 * Confirms the marker frame fits within Studio's current viewport. If the captured component is
 * bigger than the visible viewport, its bottom/right edge renders off-screen entirely - the window
 * capture never sees it, and the Node-side crop step fails with an opaque "marker not found" or
 * "incomplete marker" error. Catching it here, before Studio is even asked to capture anything,
 * lets the failure name the real cause instead.
 */
function checkFitsViewport(screen: ScreenGui): void {
	const markerInstance = screen.FindFirstChild("ScreenshotMarker", true);
	if (!markerInstance || !markerInstance.IsA("GuiObject")) return;
	const marker: GuiObject = markerInstance;
	const viewport = awaitViewportSize(screen);
	const size = awaitStableSize(marker);
	if (size.X > viewport.X || size.Y > viewport.Y) {
		error(
			`Captured element is ${math.floor(size.X)}x${math.floor(size.Y)}px, which is larger than Studio's ` +
				`current viewport (${math.floor(viewport.X)}x${math.floor(viewport.Y)}px). Enlarge the Studio ` +
				"window (or its 3D viewport) and try again, or reduce the component's size.",
		);
	}
}

function pollUntilTerminal(client: SessionClient, sessionId: string, log: (message: string) => void): string {
	for (;;) {
		const status = client.pollStatus(sessionId);
		if (status.status === "done" || status.status === "failed" || status.status === "expired") return status.status;
		log(`Session ${sessionId} is '${status.status}'; waiting for a terminal state`);
		task.wait(0.5);
	}
}

function processSession(client: SessionClient, manifest: SessionManifest): void {
	log(`Discovered session ${manifest.sessionId} (status: ${manifest.status})`);
	const modelBytes = client.downloadModel(manifest);

	let root: Folder | undefined;
	try {
		root = buildTemporaryRoot(modelBytes, manifest.temporaryRootName);

		// Mount under Workspace first - a part of the DataModel that's always live in the Studio
		// editor, even without a play-test session - so React's renderer initializes correctly,
		// then relocate the already-rendered tree into StarterGui, which Studio's editor renders
		// as a live UI preview without needing Play/Run.
		root.Parent = Workspace;
		const screen = root.FindFirstChildWhichIsA("ScreenGui", true);
		if (!screen) error("The temporary root did not contain a ScreenGui");
		awaitRenderedContent(screen);

		root.Parent = StarterGui;
		log(`Loaded temporary root '${manifest.temporaryRootName}' into StarterGui`);
		client.ack(manifest.sessionId, "loaded");
		checkFitsViewport(screen);
		log("ScreenGui and marker are present; acknowledging readiness");
		client.ack(manifest.sessionId, "ready", "ScreenGui rendered");

		const terminalStatus = pollUntilTerminal(client, manifest.sessionId, log);
		log(`Session ${manifest.sessionId} reached terminal state '${terminalStatus}'`);
	} catch (reason) {
		const message = tostring(reason);
		log(`Session ${manifest.sessionId} failed: ${message}`);
		pcall(() => client.ack(manifest.sessionId, "failed", message));
	} finally {
		root?.Destroy();
		log(`Removed temporary root for session ${manifest.sessionId}`);
	}
}

let stopped = true;
let activeClient: SessionClient | undefined;

function runDiscoveryLoop(client: SessionClient): void {
	let backoff = 0.25;
	while (!stopped) {
		try {
			const manifest = client.discover();
			if (manifest) {
				processSession(client, manifest);
			} else {
				task.wait(1);
			}
			backoff = 0.25;
		} catch (reason) {
			log(`Bridge unavailable; retrying in ${backoff}s: ${tostring(reason)}`);
			task.wait(backoff);
			backoff = math.min(backoff * 2, 5);
		}
	}
}

function startPolling(): void {
	if (activeClient) return;
	log(`Plugin enabled; watching for a capture session at ${bridgeUrl}`);
	const client = new SessionClient(bridgeUrl, log);
	activeClient = client;
	stopped = false;
	task.spawn(() => runDiscoveryLoop(client));
}

function stopPolling(): void {
	if (!activeClient) return;
	stopped = true;
	activeClient = undefined;
	log("Plugin disabled; session polling stopped");
}

log(`Screenshot plugin started; bridge URL is ${bridgeUrl}`);
pluginWindow.onEnabledChanged((enabled) => (enabled ? startPolling() : stopPolling()));
startPolling();
plugin.Unloading.Once(stopPolling);
