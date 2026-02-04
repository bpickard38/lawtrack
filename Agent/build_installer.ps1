# Build LawTrack installer using onedir build (avoids onefile requests/temp-dir errors)
$iscc = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if (-not (Test-Path $iscc)) {
    Write-Host "Inno Setup not found at: $iscc"
    Write-Host "Install from https://jrsoftware.org/isinfo.php or edit the path in build_installer.ps1"
    exit 1
}
Write-Host "Building onedir (folder) exe..."
& pyinstaller --clean lawtrack_agent_onedir.spec
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "Building installer..."
& $iscc installer_onedir.iss
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Done. Installer: installer_output\LawTrackAgent-Setup.exe"
} else { exit 1 }
