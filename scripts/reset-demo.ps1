# Resets VLab to a clean demo state between rehearsals.
# Removes every student lab container, then clears sessions, task results,
# command logs, and evidence submissions. Accounts, classes, labs, tasks,
# and assignments are kept.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\reset-demo.ps1

$ErrorActionPreference = 'Stop'

$containers = @(docker ps -aq --filter label=vlab.session)
if ($containers.Count -gt 0) {
    docker rm -f $containers | Out-Null
    Write-Host "Removed $($containers.Count) lab container(s)." -ForegroundColor Yellow
} else {
    Write-Host "No lab containers running." -ForegroundColor DarkGray
}

docker compose exec -T backend npx tsx prisma/reset-demo.ts
if ($LASTEXITCODE -ne 0) {
    Write-Host "Reset failed. Is the stack up? (docker compose up -d)" -ForegroundColor Red
    exit 1
}

Write-Host "Demo state is clean. Every student starts at 0%." -ForegroundColor Green
