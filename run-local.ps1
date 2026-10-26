<#
.SYNOPSIS
  Launches LawTrack locally for testing: local Postgres (Docker), backend, and frontend.
  Safe to re-run - skips anything already set up or already running.
#>

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"

function Stop-PortOwner($port) {
    # Kill whatever's already listening on $port, unconditionally. A "check
    # first, launch only if free" approach sounds safer but isn't: the check
    # itself can be flaky (see git history of this file), and stale checks
    # leave old instances running while new ones pile up on fallback ports
    # (Vite: 5173 -> 5174 -> 5175...). Clearing the port every time is the
    # only way to guarantee exactly one instance ends up running.
    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    $procIds = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $procIds) {
        if (Get-Process -Id $procId -ErrorAction SilentlyContinue) {
            Write-Host "  Stopping process $procId already on port $port" -ForegroundColor DarkYellow
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
    if ($procIds) { Start-Sleep -Milliseconds 500 }
}

function Invoke-Native {
    # Runs a native command and returns $true/$false based on exit code, with
    # output streamed to the console. Needed because under $ErrorActionPreference
    # = "Stop", *any* stderr line from a native exe (even routine INFO/notice
    # output like pip's "new release available" or PyInstaller's build log)
    # gets wrapped in a terminating NativeCommandError and aborts the script
    # immediately - regardless of the process's real exit code, and even when
    # redirected (2>&1 or *>). Temporarily relaxing ErrorActionPreference for
    # just the duration of the call is the only reliable way around this.
    param([ScriptBlock]$Command, [switch]$Quiet)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        if ($Quiet) {
            & $Command 2>&1 | Out-Null
        } else {
            & $Command 2>&1 | ForEach-Object { Write-Host $_ }
        }
    } finally {
        $ErrorActionPreference = $prev
    }
    return $LASTEXITCODE -eq 0
}

function Wait-Http($url) {
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
            if ($r.StatusCode -eq 200) { return $true }
        } catch {}
        Start-Sleep -Seconds 1
    }
    return $false
}

# --- Docker Desktop itself (not just the container) - needed after a reboot,
# when nothing's running yet. Without this, the whole script fails at the
# database step below with a confusing error instead of just handling it. ---
if (-not (Invoke-Native -Quiet { docker info })) {
    Write-Host "Docker Desktop isn't running - starting it..." -ForegroundColor Cyan
    Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
    $dockerReady = $false
    for ($i = 0; $i -lt 60; $i++) {
        if (Invoke-Native -Quiet { docker info }) { $dockerReady = $true; break }
        Start-Sleep -Seconds 2
    }
    if (-not $dockerReady) {
        Write-Error "Docker Desktop did not become ready after 120s. Check it manually and re-run."
        exit 1
    }
    Write-Host "Docker Desktop ready." -ForegroundColor Green
}

# --- Database (persistent local Postgres via Docker) ---
Write-Host "Starting local database..." -ForegroundColor Cyan
Invoke-Native { docker compose -f (Join-Path $root "docker-compose.yml") up -d } | Out-Null

$dbReady = $false
for ($i = 0; $i -lt 30; $i++) {
    if (Invoke-Native -Quiet { docker exec lawtrack-local-db pg_isready -U postgres }) { $dbReady = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $dbReady) { Write-Error "Database did not become ready. Is Docker Desktop running?"; exit 1 }
Write-Host "Database ready (persists across runs - see docker-compose.yml)." -ForegroundColor Green

# --- Backend setup (first run only) ---
$venvPython = Join-Path $backendDir "venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "Creating backend virtual environment (first run only)..." -ForegroundColor Cyan
    python -m venv (Join-Path $backendDir "venv")
    Invoke-Native { & $venvPython -m pip install --quiet --upgrade pip } | Out-Null
    Invoke-Native { & $venvPython -m pip install --quiet -r (Join-Path $backendDir "requirements.txt") } | Out-Null
}

$envPath = Join-Path $backendDir ".env"
if (-not (Test-Path $envPath)) {
    Write-Host "Creating backend\.env for local testing..." -ForegroundColor Cyan
    $secret = & $venvPython -c "import secrets; print(secrets.token_hex(32))"
    @"
DATABASE_URL=postgresql://postgres:localdev@127.0.0.1:55432/lawtrack
SECRET_KEY=$secret
CORS_ORIGINS=http://localhost:5173
BACKEND_URL=http://localhost:8001
FRONTEND_URL=http://localhost:5173
"@ | Set-Content -Encoding utf8 $envPath
}

Write-Host "Seeding demo data..." -ForegroundColor Cyan
Push-Location $backendDir
& $venvPython init_db.py
Pop-Location

# --- Launch backend (clear the port first, then always launch fresh) ---
# Runs hidden in the background (no terminal window) - output goes to
# .local-logs\backend.log instead, since there's no console to read it from.
$logDir = Join-Path $root ".local-logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

Stop-PortOwner 8001
Write-Host "Launching backend on :8001..." -ForegroundColor Cyan
Start-Process -FilePath $venvPython `
    -ArgumentList "-m", "uvicorn", "main:app", "--reload", "--host", "0.0.0.0", "--port", "8001" `
    -WorkingDirectory $backendDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir "backend.out.log") `
    -RedirectStandardError (Join-Path $logDir "backend.err.log")

# --- Frontend setup (first run only) + launch ---
$frontendEnvPath = Join-Path $frontendDir ".env.development.local"
if (-not (Test-Path $frontendEnvPath)) {
    Write-Host "Creating frontend\.env.development.local for local testing..." -ForegroundColor Cyan
    "VITE_API_URL=http://localhost:8001" | Set-Content -Encoding utf8 $frontendEnvPath
}

if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Write-Host "Installing frontend dependencies (first run only)..." -ForegroundColor Cyan
    Push-Location $frontendDir
    npm install
    Pop-Location
}

# --- Launch frontend (clear the port first, then always launch fresh) ---
Stop-PortOwner 5173
Write-Host "Launching frontend on :5173..." -ForegroundColor Cyan
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev" `
    -WorkingDirectory $frontendDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir "frontend.out.log") `
    -RedirectStandardError (Join-Path $logDir "frontend.err.log")

# --- Wait for both, then hand off the link ---
Write-Host "Waiting for both to come up..." -ForegroundColor Cyan
$backendUp = Wait-Http "http://localhost:8001/health"
$frontendUp = Wait-Http "http://localhost:5173"

Write-Host ""
if ($backendUp -and $frontendUp) {
    Write-Host "LawTrack is running locally:" -ForegroundColor Green
} else {
    Write-Host "LawTrack may not be fully up yet - check the logs below for errors:" -ForegroundColor Red
}
Write-Host "  App:   http://localhost:5173" -ForegroundColor Yellow
Write-Host "  API:   http://localhost:8001"
Write-Host "  Login: demo@lawtrack.app / demo1234"
Write-Host ""
Write-Host "Backend and frontend run hidden in the background (no terminal windows)."
Write-Host "  Logs:  $logDir\backend.out.log, backend.err.log, frontend.out.log, frontend.err.log"
Write-Host "  Stop:  re-run this script (it always kills and relaunches fresh), or:"
Write-Host "         Stop-Process -Id (Get-NetTCPConnection -LocalPort 8001,5173).OwningProcess -Force"
Write-Host "Stop the database:      docker compose down"
Write-Host "Wipe the database too:  docker compose down -v"

if ($frontendUp) {
    try {
        Start-Process "chrome" "http://localhost:5173"
    } catch {
        Write-Host "Could not launch Chrome automatically - open http://localhost:5173 manually." -ForegroundColor DarkYellow
    }
}

# --- Desktop Agent: uninstall whatever's currently installed/running, build
# fresh from whatever's in Agent/ right now (uncommitted changes included -
# this is deliberately not the GitHub release, it's "test what's actually on
# disk"), and launch it pointed at this local backend. Adds ~1-2 min for the
# PyInstaller build every run, since the whole point is always testing the
# current source, not a cached build. ---
Write-Host ""
Write-Host "Rebuilding the desktop agent from current local source..." -ForegroundColor Cyan

$agentWasRunning = @(Get-Process | Where-Object { $_.ProcessName -eq "LawTrackAgent" })
$agentWasRunning | Stop-Process -Force -ErrorAction SilentlyContinue
if ($agentWasRunning.Count -gt 0) {
    # Killing the process doesn't mean Windows has released its file handles
    # yet (e.g. loaded .pyd files) - without this wait, PyInstaller's rebuild
    # can hit "Access is denied" trying to clear the old dist/ folder.
    Start-Sleep -Seconds 2
}
$agentUninstaller = "C:\Program Files\LawTrack Agent\unins000.exe"
if (Test-Path $agentUninstaller) {
    Write-Host "  Uninstalling existing installed copy..." -ForegroundColor DarkYellow
    & $agentUninstaller /VERYSILENT /NORESTART /SUPPRESSMSGBOXES
    Start-Sleep -Seconds 2
}

$agentDir = Join-Path $root "Agent"
$agentVenvPython = Join-Path $agentDir "venv\Scripts\python.exe"
if (-not (Test-Path $agentVenvPython)) {
    Write-Host "  Creating agent virtual environment (first run only)..." -ForegroundColor Cyan
    python -m venv (Join-Path $agentDir "venv")
    Invoke-Native { & $agentVenvPython -m pip install --quiet --upgrade pip } | Out-Null
    Invoke-Native { & $agentVenvPython -m pip install --quiet -r (Join-Path $agentDir "requirements.txt") } | Out-Null
}
# Module name is case-sensitive here even on Windows - the installed package is "PyInstaller".
$pyinstallerOk = Invoke-Native { & $agentVenvPython -m PyInstaller --version }
if (-not $pyinstallerOk) {
    Write-Host "  Installing PyInstaller into agent venv..." -ForegroundColor Cyan
    Invoke-Native { & $agentVenvPython -m pip install --quiet pyinstaller } | Out-Null
}

Push-Location $agentDir
if (-not (Test-Path "lawtrack.ico")) {
    Invoke-Native { & $agentVenvPython build_icon.py } | Out-Null
}
Write-Host "  Building (PyInstaller)..." -ForegroundColor Cyan
$buildOk = Invoke-Native { & $agentVenvPython -m PyInstaller --clean -y lawtrack_agent_onedir.spec }
Pop-Location

$agentDist = Join-Path $agentDir "dist\LawTrackAgent"
if (-not $buildOk -or -not (Test-Path (Join-Path $agentDist "LawTrackAgent.exe"))) {
    Write-Host "Agent build failed - see the PyInstaller output above. Skipping agent launch." -ForegroundColor Red
} else {
    @"
# LawTrack Agent config
LAWTRACK_API_URL=http://localhost:8001
LAWTRACK_API_KEY=
LAWTRACK_MIN_SECONDS=60
"@ | Set-Content -Encoding utf8 (Join-Path $agentDist ".env")

    # Keep the website's "Install desktop app" download in sync with this same build.
    # Freshly-written EXEs can be briefly locked right after creation (e.g. by
    # Windows Defender's real-time scan) - retry instead of failing on the first try.
    $agentZip = Join-Path $frontendDir "public\LawTrackAgent-local.zip"
    if (Test-Path $agentZip) { Remove-Item $agentZip -Force }
    $zipped = $false
    for ($i = 0; $i -lt 5 -and -not $zipped; $i++) {
        try {
            Compress-Archive -Path "$agentDist\*" -DestinationPath $agentZip -ErrorAction Stop
            $zipped = $true
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    if (-not $zipped) {
        Write-Host "  Warning: could not zip the agent build for website download (files still locked). Skipping." -ForegroundColor DarkYellow
    }

    Write-Host "Launching the freshly built local agent..." -ForegroundColor Green
    Start-Process -FilePath (Join-Path $agentDist "LawTrackAgent.exe")
    Write-Host "(No API key stored yet - it'll ask you to sign in.)"
}
