import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);

const outputPath = path.resolve("roblox-studio.png");
const startupScriptPath = path.join(
    os.tmpdir(),
    "roblox-screenshot-startup.luau",
);

function escapePowerShellString(value) {
    return value.replace(/'/g, "''");
}

async function ensureStartupScript() {
    await fs.writeFile(
        startupScriptPath,
        "-- Intentionally empty. Used to open a default Baseplate in Studio.\n",
        "utf8",
    );
}

async function captureRobloxStudio() {
    await ensureStartupScript();

    const output = escapePowerShellString(outputPath);
    const startupScript = escapePowerShellString(startupScriptPath);

    const script = `
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class Win32Capture
{
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(
        IntPtr hWnd,
        out RECT lpRect
    );

    [DllImport("user32.dll")]
    public static extern IntPtr GetWindowDC(
        IntPtr hWnd
    );

    [DllImport("user32.dll")]
    public static extern int ReleaseDC(
        IntPtr hWnd,
        IntPtr hDC
    );

    [DllImport("gdi32.dll")]
    public static extern IntPtr CreateCompatibleDC(
        IntPtr hDC
    );

    [DllImport("gdi32.dll")]
    public static extern IntPtr CreateCompatibleBitmap(
        IntPtr hDC,
        int width,
        int height
    );

    [DllImport("gdi32.dll")]
    public static extern IntPtr SelectObject(
        IntPtr hDC,
        IntPtr hObject
    );

    [DllImport("gdi32.dll")]
    public static extern bool DeleteObject(
        IntPtr hObject
    );

    [DllImport("gdi32.dll")]
    public static extern bool DeleteDC(
        IntPtr hDC
    );

    [DllImport("user32.dll")]
    public static extern bool PrintWindow(
        IntPtr hwnd,
        IntPtr hdcBlt,
        uint nFlags
    );
}
"@

function Get-RobloxStudioWindow {
    return Get-Process RobloxStudioBeta -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne 0 } |
        Select-Object -First 1
}

function Find-RobloxStudioExecutable {
    $versionsPath = Join-Path $env:LOCALAPPDATA "Roblox\\Versions"

    if (-not (Test-Path $versionsPath)) {
        return $null
    }

    return Get-ChildItem -Path $versionsPath -Filter "RobloxStudioBeta.exe" -Recurse -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
}

$process = Get-RobloxStudioWindow

if (-not $process) {
    Write-Host "Roblox Studio is not currently open."

    $studioExe = Find-RobloxStudioExecutable

    if (-not $studioExe) {
        throw "Could not find RobloxStudioBeta.exe."
    }

    Write-Host "Starting Roblox Studio with a new Baseplate..."
    Write-Host "Executable: $($studioExe.FullName)"

    Start-Process -FilePath $studioExe.FullName -ArgumentList @(
        "--task",
        "RunScript",
        "--runScriptFile",
        '${startupScript}'
    )

    $timeoutSeconds = 60
    $pollIntervalMilliseconds = 500
    $startedAt = Get-Date

    do {
        Start-Sleep -Milliseconds $pollIntervalMilliseconds

        $process = Get-RobloxStudioWindow

        if (((Get-Date) - $startedAt).TotalSeconds -ge $timeoutSeconds) {
            throw "Timed out waiting for Roblox Studio to open."
        }
    }
    until ($process)

    Write-Host "Roblox Studio window opened."

    #
    # MainWindowHandle can exist before the Baseplate/editor is
    # completely initialized.
    #
    Start-Sleep -Seconds 3

    #
    # Refresh the process object so MainWindowTitle and HWND are current.
    #
    $process = Get-RobloxStudioWindow

    if (-not $process) {
        throw "Roblox Studio closed unexpectedly after startup."
    }
}

$hwnd = $process.MainWindowHandle

$rect = New-Object Win32Capture+RECT

if (-not [Win32Capture]::GetWindowRect($hwnd, [ref]$rect)) {
    throw "GetWindowRect failed."
}

$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top

if ($width -le 0 -or $height -le 0) {
    throw "Roblox Studio returned invalid window dimensions."
}

Write-Host "Found Studio: $($process.MainWindowTitle)"
Write-Host "HWND: $hwnd"
Write-Host "Desktop position: $($rect.Left), $($rect.Top)"
Write-Host "Window size: \${width}x\${height}"

$windowDC = [Win32Capture]::GetWindowDC($hwnd)

if ($windowDC -eq [IntPtr]::Zero) {
    throw "GetWindowDC failed."
}

$memoryDC = [Win32Capture]::CreateCompatibleDC($windowDC)

if ($memoryDC -eq [IntPtr]::Zero) {
    [Win32Capture]::ReleaseDC($hwnd, $windowDC) | Out-Null
    throw "CreateCompatibleDC failed."
}

$bitmapHandle = [Win32Capture]::CreateCompatibleBitmap(
    $windowDC,
    $width,
    $height
)

if ($bitmapHandle -eq [IntPtr]::Zero) {
    [Win32Capture]::DeleteDC($memoryDC) | Out-Null
    [Win32Capture]::ReleaseDC($hwnd, $windowDC) | Out-Null
    throw "CreateCompatibleBitmap failed."
}

$oldObject = [Win32Capture]::SelectObject(
    $memoryDC,
    $bitmapHandle
)

try {
    $success = [Win32Capture]::PrintWindow(
        $hwnd,
        $memoryDC,
        0
    )

    if (-not $success) {
        throw "PrintWindow failed."
    }

    $bitmap = [System.Drawing.Image]::FromHbitmap($bitmapHandle)

    try {
        $bitmap.Save(
            '${output}',
            [System.Drawing.Imaging.ImageFormat]::Png
        )
    }
    finally {
        $bitmap.Dispose()
    }
}
finally {
    [Win32Capture]::SelectObject(
        $memoryDC,
        $oldObject
    ) | Out-Null

    [Win32Capture]::DeleteObject(
        $bitmapHandle
    ) | Out-Null

    [Win32Capture]::DeleteDC(
        $memoryDC
    ) | Out-Null

    [Win32Capture]::ReleaseDC(
        $hwnd,
        $windowDC
    ) | Out-Null
}

Write-Host "Saved: ${output}"
`;

    const { stdout, stderr } = await execFileAsync(
        "powershell.exe",
        [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ],
        {
            maxBuffer: 1024 * 1024 * 10,
        },
    );

    if (stdout.trim()) {
        console.log(stdout.trim());
    }

    if (stderr.trim()) {
        console.error(stderr.trim());
    }
}

captureRobloxStudio().catch((error) => {
    console.error("Screenshot failed:");
    console.error(error.stderr || error.message || error);
    process.exit(1);
});