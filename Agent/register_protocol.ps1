# Register lawtrack:// URL protocol so the website can launch the agent.
# Run once after install (e.g. from Agent folder or installer). Same user as browser.
# Supported URLs: lawtrack://open, lawtrack://pause, lawtrack://resume

$exePath = "${env:ProgramFiles}\LawTrack Agent\LawTrackAgent.exe"
if (-not (Test-Path $exePath)) {
    $exePath = "${env:ProgramFiles(x86)}\LawTrack Agent\LawTrackAgent.exe"
}
if (-not (Test-Path $exePath)) {
    Write-Host "LawTrack Agent not found. Install the agent first, or set exePath in this script."
    exit 1
}

# "%1" is the full URL (e.g. lawtrack://open) passed to the exe
$exePathQuoted = "`"$exePath`" `"%1`""
New-Item -Path "HKCU:\Software\Classes\lawtrack" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\lawtrack" -Name "(default)" -Value "URL:LawTrack Agent Protocol"
New-Item -Path "HKCU:\Software\Classes\lawtrack\URL Protocol" -Force | Out-Null
New-Item -Path "HKCU:\Software\Classes\lawtrack\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\lawtrack\shell\open\command" -Name "(default)" -Value $exePathQuoted

Write-Host "Registered lawtrack:// -> $exePath"
Write-Host "Use 'Open LawTrack Desktop' on the website to open or control the agent."
