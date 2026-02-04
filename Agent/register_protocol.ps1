# Register lawtrack:// URL protocol so the website can launch the agent.
# Run this once (e.g. after install) if "Start auto tracker" opens a blank page.
# Requires: Agent already installed. Run as the same user who uses the browser.

$exePath = "${env:ProgramFiles}\LawTrack Agent\LawTrackAgent.exe"
if (-not (Test-Path $exePath)) {
    $exePath = "${env:ProgramFiles(x86)}\LawTrack Agent\LawTrackAgent.exe"
}
if (-not (Test-Path $exePath)) {
    Write-Host "LawTrack Agent not found in Program Files. Install the agent first, or set exe path in this script."
    exit 1
}

$exePathQuoted = "`"$exePath`" `"%1`""
New-Item -Path "HKCU:\Software\Classes\lawtrack" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\lawtrack" -Name "(default)" -Value "URL:LawTrack Agent Protocol"
New-Item -Path "HKCU:\Software\Classes\lawtrack\URL Protocol" -Force | Out-Null
New-Item -Path "HKCU:\Software\Classes\lawtrack\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\lawtrack\shell\open\command" -Name "(default)" -Value $exePathQuoted

Write-Host "Registered lawtrack:// protocol -> $exePath"
Write-Host "Try 'Start auto tracker' on the website again."
