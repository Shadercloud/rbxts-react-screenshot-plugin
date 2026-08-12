/** Locates a running Roblox Studio window, or launches Studio with a Baseplate, per research.md. */
import { execFile, spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface StudioWindow {
	hwnd: string;
	title: string;
}

/**
 * Scripts passed here should end with `exit 0` if they use `-ErrorAction SilentlyContinue`:
 * powershell.exe's own process exit code reflects a suppressed non-terminating error even
 * though nothing is written to stdout/stderr, which `execFile` would otherwise treat as failure.
 */
async function runPowerShell(script: string): Promise<string> {
	const { stdout } = await execFileAsync(
		"powershell.exe",
		["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
		{ maxBuffer: 10 * 1024 * 1024 },
	);
	return stdout.trim();
}

/** Returns the running `RobloxStudioBeta` window with a nonzero main window handle, if any. */
export async function findRunningStudioWindow(): Promise<StudioWindow | undefined> {
	const stdout = await runPowerShell(`
$process = Get-Process RobloxStudioBeta -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Select-Object -First 1
if ($process) {
    Write-Output (ConvertTo-Json -Compress @{ hwnd = [string][int64]$process.MainWindowHandle; title = $process.MainWindowTitle })
}
exit 0
`);
	if (!stdout) return undefined;
	return JSON.parse(stdout) as StudioWindow;
}

/** Returns the newest installed `RobloxStudioBeta.exe` under the user's Roblox versions directory. */
export async function findNewestStudioExecutable(): Promise<string | undefined> {
	const stdout = await runPowerShell(`
$versionsPath = Join-Path $env:LOCALAPPDATA "Roblox\\Versions"
if (Test-Path $versionsPath) {
    Get-ChildItem -Path $versionsPath -Filter "RobloxStudioBeta.exe" -Recurse -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}
exit 0
`);
	return stdout || undefined;
}

/**
 * Launches Studio with an empty startup script, which opens a new Baseplate place.
 *
 * Studio is a long-running GUI application that the user keeps open, not a process that exits -
 * so this must fire-and-forget (`spawn` + `detached` + `unref`) rather than `execFile`, which
 * would await the child's exit and block forever (and previously did exactly that).
 */
export async function launchStudio(executablePath: string): Promise<void> {
	const startupDirectory = await mkdtemp(path.join(tmpdir(), "roblox-screenshot-startup-"));
	const startupScriptPath = path.join(startupDirectory, "startup.luau");
	await writeFile(startupScriptPath, "-- Intentionally empty. Used to open a default Baseplate in Studio.\n", "utf8");
	const child = spawn(executablePath, ["--task", "RunScript", "--runScriptFile", startupScriptPath], {
		detached: true,
		stdio: "ignore",
		windowsHide: false,
	});
	child.unref();
}

/** Polls for a Studio window with a nonzero handle, failing after `timeoutMs`. */
export async function waitForStudioWindow(timeoutMs: number, pollIntervalMs = 500): Promise<StudioWindow> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const found = await findRunningStudioWindow();
		if (found) return found;
		if (Date.now() >= deadline) throw new Error(`Timed out waiting for the Roblox Studio window after ${timeoutMs}ms`);
		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
	}
}

/**
 * Force-closes every running `RobloxStudioBeta` process and waits for it to fully exit. A force
 * kill (rather than a graceful `CloseMainWindow`) is deliberate: it's deterministic - no risk of
 * hanging behind an unsaved-changes prompt from whatever state the capture flow left the place in -
 * and it reproduces the same "Studio was killed" condition `ensureStudioWindow`'s relaunch path
 * already has to recover from in real use.
 *
 * Returns `false` without waiting if no Studio process was found running.
 */
export async function closeStudio(timeoutMs = 15_000, pollIntervalMs = 250): Promise<boolean> {
	const stdout = await runPowerShell(`
$processes = Get-Process RobloxStudioBeta -ErrorAction SilentlyContinue
if ($processes) {
    $processes | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Output "closed"
}
exit 0
`);
	if (stdout !== "closed") return false;

	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (!(await findRunningStudioWindow())) return true;
		if (Date.now() >= deadline) throw new Error(`Roblox Studio did not fully exit within ${timeoutMs}ms of being closed`);
		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
	}
}

export interface EnsureStudioWindowOptions {
	launchTimeoutMs?: number;
	/** Extra settle time after the window handle first appears, since the editor may not be initialized yet. */
	editorSettleMs?: number;
	/**
	 * How long to keep re-polling for the window after the settle delay before giving up. The first
	 * window handle Studio reports during startup is often a splash/loading window that goes away
	 * once the real editor window replaces it - a single recheck right after `editorSettleMs` can
	 * catch exactly that gap and misreport a genuine startup as a crash. Retrying here for a while
	 * tolerates that gap; a real crash still surfaces the same error, just after actually waiting.
	 */
	settleTimeoutMs?: number;
}

/** Reuses an existing Studio window, or locates and launches Studio with a new Baseplate and waits for it to be ready. */
export async function ensureStudioWindow(options: EnsureStudioWindowOptions = {}): Promise<StudioWindow> {
	const existing = await findRunningStudioWindow();
	if (existing) return existing;

	const executablePath = await findNewestStudioExecutable();
	if (!executablePath) throw new Error("Could not find an installed RobloxStudioBeta.exe under %LOCALAPPDATA%\\Roblox\\Versions");

	await launchStudio(executablePath);
	await waitForStudioWindow(options.launchTimeoutMs ?? 60_000);
	await new Promise((resolve) => setTimeout(resolve, options.editorSettleMs ?? 3_000));

	try {
		return await waitForStudioWindow(options.settleTimeoutMs ?? 30_000);
	} catch {
		throw new Error("Roblox Studio closed unexpectedly after startup");
	}
}
