param (
    [Parameter(Position = 0)]
    [ValidateSet('All', '1', '2', 'QA', 'PROD', 'AZTECA', 'MAYA', IgnoreCase = $true)]
    [string]$Target = 'All'
)

$DeployScript = Join-Path $PSScriptRoot 'deploy.ps1'
if (Test-Path $DeployScript) {
    & $DeployScript -Phase $Target
} else {
    Write-Host "[ERROR] No se encontro deploy.ps1" -ForegroundColor Red
    exit 1
}

