/** Win32 PrintWindow capture, ported from reference/screenshot-studio.mjs. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface WindowBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

function escapePowerShellString(value: string): string {
	return value.replace(/'/g, "''");
}

const WIN32_CAPTURE_TYPE = `
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class Win32Capture
{
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern IntPtr GetWindowDC(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr hDC);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleBitmap(IntPtr hDC, int width, int height);
    [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr hDC, IntPtr hObject);
    [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr hObject);
    [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr hDC);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdcBlt, uint nFlags);
}
"@
`;

/**
 * Captures the given window handle with `PrintWindow` and saves it as a PNG, releasing every
 * GDI resource (DCs, the compatible bitmap, the selected object) in `finally` blocks even when
 * an intermediate Win32 call fails. Returns the captured window's screen-space bounds.
 */
export async function captureWindow(hwnd: string, outputPngPath: string): Promise<WindowBounds> {
	if (!/^\d+$/.test(hwnd)) throw new Error(`Invalid window handle '${hwnd}'`);
	const output = escapePowerShellString(outputPngPath);
	const script = `
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
${WIN32_CAPTURE_TYPE}

$hwnd = [IntPtr]${hwnd}
$rect = New-Object Win32Capture+RECT
if (-not [Win32Capture]::GetWindowRect($hwnd, [ref]$rect)) { throw "GetWindowRect failed." }

$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
if ($width -le 0 -or $height -le 0) { throw "Window returned invalid dimensions." }

$windowDC = [Win32Capture]::GetWindowDC($hwnd)
if ($windowDC -eq [IntPtr]::Zero) { throw "GetWindowDC failed." }

$memoryDC = [Win32Capture]::CreateCompatibleDC($windowDC)
if ($memoryDC -eq [IntPtr]::Zero) {
    [Win32Capture]::ReleaseDC($hwnd, $windowDC) | Out-Null
    throw "CreateCompatibleDC failed."
}

$bitmapHandle = [Win32Capture]::CreateCompatibleBitmap($windowDC, $width, $height)
if ($bitmapHandle -eq [IntPtr]::Zero) {
    [Win32Capture]::DeleteDC($memoryDC) | Out-Null
    [Win32Capture]::ReleaseDC($hwnd, $windowDC) | Out-Null
    throw "CreateCompatibleBitmap failed."
}

$oldObject = [Win32Capture]::SelectObject($memoryDC, $bitmapHandle)
try {
    $success = [Win32Capture]::PrintWindow($hwnd, $memoryDC, 0)
    if (-not $success) { throw "PrintWindow failed." }
    $bitmap = [System.Drawing.Image]::FromHbitmap($bitmapHandle)
    try {
        $bitmap.Save('${output}', [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $bitmap.Dispose()
    }
} finally {
    [Win32Capture]::SelectObject($memoryDC, $oldObject) | Out-Null
    [Win32Capture]::DeleteObject($bitmapHandle) | Out-Null
    [Win32Capture]::DeleteDC($memoryDC) | Out-Null
    [Win32Capture]::ReleaseDC($hwnd, $windowDC) | Out-Null
}

Write-Output (ConvertTo-Json -Compress @{ x = $rect.Left; y = $rect.Top; width = $width; height = $height })
`;

	try {
		const { stdout } = await execFileAsync(
			"powershell.exe",
			["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
			{ maxBuffer: 10 * 1024 * 1024 },
		);
		const jsonLine = stdout.trim().split(/\r?\n/).pop() ?? "";
		return JSON.parse(jsonLine) as WindowBounds;
	} catch (reason) {
		const detail = reason instanceof Error && "stderr" in reason ? String((reason as { stderr: unknown }).stderr) : String(reason);
		throw new Error(`Failed to capture window ${hwnd}: ${detail.trim() || (reason instanceof Error ? reason.message : String(reason))}`);
	}
}
