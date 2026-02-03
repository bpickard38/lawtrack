# Build LawTrack installer using Inno Setup (no PATH needed)
$iscc = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if (-not (Test-Path $iscc)) {
    Write-Host "Inno Setup not found at: $iscc"
    Write-Host "Install from https://jrsoftware.org/isinfo.php or edit the path in build_installer.ps1"
    exit 1
}
& $iscc installer.iss
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Done. Installer: installer_output\LawTrackAgent-Setup.exe"
}
