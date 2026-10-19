# Demo-day preflight for Windows + Docker Desktop.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\preflight.ps1

$ErrorActionPreference = 'Continue'
$ok = $true

function Section($text) {
    Write-Host ""
    Write-Host "== $text" -ForegroundColor Cyan
}

function Pass($text) { Write-Host "PASS  $text" -ForegroundColor Green }
function Fail($text) { Write-Host "FAIL  $text" -ForegroundColor Red; $script:ok = $false }
function Info($text) { Write-Host "      $text" -ForegroundColor DarkGray }

Section "Docker engine"
$version = docker info --format '{{.ServerVersion}} {{.OSType}}' 2>$null
if ($LASTEXITCODE -eq 0) {
    Pass "engine reachable ($version)"
} else {
    Fail "engine not reachable - start Docker Desktop and wait for 'Engine running'"
    Info "Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'"
}

Section "Ports"
foreach ($port in 5173, 3000, 5001) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($listener) {
        Pass "port $port is in use (expected if the stack is already up)"
    } else {
        Info "port $port is free"
    }
}

Section "Compose services"
if (Test-Path "docker-compose.yml") {
    docker compose ps 2>$null
    if ($LASTEXITCODE -ne 0) { Fail "could not read compose state" }
} else {
    Fail "run this script from the repository root"
}

Section "API health"
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 5
    if ($health.ok -and $health.docker) {
        Pass "API up and Docker reachable from the backend"
    } elseif ($health.ok) {
        Fail "API up but it cannot reach Docker - check the socket mount"
    }
} catch {
    Info "API not running yet. Start it with: docker compose up --build -d"
}

Section "Lab images"
$images = docker images --format '{{.Repository}}:{{.Tag}}' 2>$null
foreach ($image in 'vlab/linux-basic:latest', 'vlab/docker-dind:latest', 'vlab/backend:latest', 'vlab/frontend:latest') {
    if ($images -contains $image) { Pass "image $image" } else { Fail "missing image $image" }
}

Section "VLab containers on the host"
$vlab = docker ps --filter "name=vlab-" --format '{{.Names}}  {{.Status}}   {{.Image}}' 2>$null
if ($vlab) { $vlab } else { Info "no student lab containers running" }

Section "Demo"
Write-Host "  App      http://localhost:5173" -ForegroundColor White
Write-Host "  API      http://localhost:3000/api/health" -ForegroundColor White
Write-Host "  Teacher  teacher@vlab.dev / teacher123" -ForegroundColor White
Write-Host "  Student  student1@vlab.dev / student123" -ForegroundColor White
Write-Host "  Class    CBADL1" -ForegroundColor White

Write-Host ""
if ($ok) {
    Write-Host "PREFLIGHT OK" -ForegroundColor Green
    exit 0
}

Write-Host "PREFLIGHT FOUND PROBLEMS" -ForegroundColor Red
exit 1
