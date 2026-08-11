<#
.SYNOPSIS
  Launches LawTrack locally for testing: local Postgres (Docker), backend, and frontend.
  Safe to re-run - skips anything already set up or already running.
#>

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"

function Test-Port($port) {
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $iar = $c.BeginConnect("localhost", $port, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(300)
        $c.Close()
        return $ok
    } catch { return $false }
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

# --- Database (persistent local Postgres via Docker) ---
Write-Host "Starting local database..." -ForegroundColor Cyan
docker compose -f (Join-Path $root "docker-compose.yml") up -d | Out-Null

$dbReady = $false
for ($i = 0; $i -lt 30; $i++) {
    docker exec lawtrack-local-db pg_isready -U postgres *> $null
    if ($LASTEXITCODE -eq 0) { $dbReady = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $dbReady) { Write-Error "Database did not become ready. Is Docker Desktop running?"; exit 1 }
Write-Host "Database ready (persists across runs - see docker-compose.yml)." -ForegroundColor Green

# --- Backend setup (first run only) ---
$venvPython = Join-Path $backendDir "venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "Creating backend virtual environment (first run only)..." -ForegroundColor Cyan
    python -m venv (Join-Path $backendDir "venv")
    & $venvPython -m pip install --quiet --upgrade pip
    & $venvPython -m pip install --quiet -r (Join-Path $backendDir "requirements.txt")
}

$envPath = Join-Path $backendDir ".env"
if (-not (Test-Path $envPath)) {
    Write-Host "Creating backend\.env for local testing..." -ForegroundColor Cyan
    $secret = & $venvPython -c "import secrets; print(secrets.token_hex(32))"
    @"
DATABASE_URL=postgresql://postgres:localdev@localhost:55432/lawtrack
SECRET_KEY=$secret
CORS_ORIGINS=http://localhost:5173
BACKEND_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
"@ | Set-Content -Encoding utf8 $envPath
}

Write-Host "Seeding sample data (skips if already present)..." -ForegroundColor Cyan
Push-Location $backendDir
& $venvPython init_db.py
Pop-Location

# --- Launch backend ---
if (Test-Port 8000) {
    Write-Host "Backend already running on :8000 - leaving it as-is." -ForegroundColor DarkYellow
} else {
    Write-Host "Launching backend on :8000..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", `
        "cd '$backendDir'; venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"
}

# --- Frontend setup (first run only) + launch ---
if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Write-Host "Installing frontend dependencies (first run only)..." -ForegroundColor Cyan
    Push-Location $frontendDir
    npm install
    Pop-Location
}

if (Test-Port 5173) {
    Write-Host "Frontend already running on :5173 - leaving it as-is." -ForegroundColor DarkYellow
} else {
    Write-Host "Launching frontend on :5173..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendDir'; npm run dev"
}

# --- Wait for both, then hand off the link ---
Write-Host "Waiting for both to come up..." -ForegroundColor Cyan
$backendUp = Wait-Http "http://localhost:8000/health"
$frontendUp = Wait-Http "http://localhost:5173"

Write-Host ""
if ($backendUp -and $frontendUp) {
    Write-Host "LawTrack is running locally:" -ForegroundColor Green
} else {
    Write-Host "LawTrack may not be fully up yet - check the backend/frontend windows for errors:" -ForegroundColor Red
}
Write-Host "  App:   http://localhost:5173" -ForegroundColor Yellow
Write-Host "  API:   http://localhost:8000"
Write-Host "  Login: demo@lawtrack.local / demopassword123"
Write-Host ""
Write-Host "Backend and frontend run in their own windows - close those (or Ctrl+C) to stop them."
Write-Host "Stop the database:      docker compose down"
Write-Host "Wipe the database too:  docker compose down -v"
