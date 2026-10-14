<#
.SYNOPSIS
    Pipeline de Despliegue Multi-Entorno basado en JSON + PropertiesService para ESD Control (Clasp).

.DESCRIPTION
    Lee la configuracion de entornos desde environments.json y gestiona el despliegue hacia:
    - PRUEBAS (QA)
    - PRODUCCION - AZTECA
    - PRODUCCION - MAYA
    Actualiza dinamicamente SOLO el archivo .clasp.json con el scriptId correspondiente (sin modificar Config.js).
#>

param (
    [Parameter(Position = 0)]
    [ValidateSet('All', '1', '2', 'QA', 'PROD', 'AZTECA', 'MAYA', IgnoreCase = $true)]
    [string]$Phase = 'All'
)

$ErrorActionPreference = 'Stop'

# ==============================================================================
# 1. RESOLUCION DE RUTAS Y LECTURA DE environments.json
# ==============================================================================
$ProjectDir = $PSScriptRoot
if (-not (Test-Path (Join-Path $ProjectDir 'appsscript.json'))) {
    $Candidate = Join-Path $PSScriptRoot 'ESD_Control'
    if (Test-Path (Join-Path $Candidate 'appsscript.json')) {
        $ProjectDir = $Candidate
    } else {
        Write-Host "[ERROR] No se encontro appsscript.json en '$ProjectDir'." -ForegroundColor Red
        exit 1
    }
}

$EnvJsonPath = Join-Path (Split-Path $ProjectDir -Parent) 'environments.json'
if (-not (Test-Path $EnvJsonPath)) {
    $EnvJsonPath = Join-Path $ProjectDir 'environments.json'
}
if (-not (Test-Path $EnvJsonPath)) {
    Write-Host "[ERROR] No se encontro el archivo environments.json." -ForegroundColor Red
    exit 1
}

$Utf8NoBom     = New-Object System.Text.UTF8Encoding($false)
$RawJson       = [System.IO.File]::ReadAllText($EnvJsonPath, $Utf8NoBom)
$Environments  = $RawJson | ConvertFrom-Json
$ClaspJsonPath = Join-Path $ProjectDir '.clasp.json'

# ==============================================================================
# 2. FUNCIONES DE CONFIGURACION (.clasp.json) Y DESPLIEGUE
# ==============================================================================
function Update-ClaspConfig {
    param ([string]$ScriptId)

    $claspContent = @"
{
  "scriptId": "$ScriptId",
  "rootDir": "",
  "scriptExtensions": [
    ".js",
    ".gs"
  ],
  "htmlExtensions": [
    ".html"
  ],
  "jsonExtensions": [
    ".json"
  ],
  "filePushOrder": [],
  "skipSubdirectories": false
}
"@
    [System.IO.File]::WriteAllText($ClaspJsonPath, $claspContent, $Utf8NoBom)
}

function Deploy-ToEnvironment {
    param ([PSCustomObject]$EnvConfig)

    Write-Host ""
    Write-Host "======================================================================" -ForegroundColor Cyan
    Write-Host " [DEPLOY] DESPLEGANDO A: $($EnvConfig.name)" -ForegroundColor Cyan
    Write-Host "======================================================================" -ForegroundColor Cyan
    Write-Host " * Script ID (Clasp)       : $($EnvConfig.scriptId)" -ForegroundColor Gray
    Write-Host " * Spreadsheet ID (Props)  : $($EnvConfig.spreadsheetId)" -ForegroundColor Gray
    Write-Host " * HEAD Deployment ID      : $($EnvConfig.headDeploymentId)" -ForegroundColor Gray
    Write-Host "----------------------------------------------------------------------" -ForegroundColor DarkGray

    # 1. Actualizar .clasp.json con el scriptId leido de environments.json
    Write-Host " [1/2] Actualizando .clasp.json desde environments.json..." -ForegroundColor Yellow
    Update-ClaspConfig -ScriptId $EnvConfig.scriptId

    # 2. Ejecutar clasp push (Config.js NO se modifica; usa PropertiesService en la nube)
    Write-Host " [2/2] Ejecutando 'npx clasp push -f'..." -ForegroundColor Yellow
    Push-Location $ProjectDir
    try {
        & npx.cmd clasp push -f
        if ($LASTEXITCODE -ne 0) {
            throw "El comando 'clasp push' fallo con codigo de salida $LASTEXITCODE en $($EnvConfig.name)."
        }
    } finally {
        Pop-Location
    }

    $headUrl = "https://script.google.com/macros/s/$($EnvConfig.headDeploymentId)/exec"
    Write-Host ""
    Write-Host " [OK] DESPLIEGUE EXITOSO EN $($EnvConfig.name)" -ForegroundColor Green
    Write-Host " [URL] Web App (HEAD): $headUrl" -ForegroundColor Green
    Write-Host "======================================================================" -ForegroundColor Cyan
}

function Start-ProductionPipeline {
    Write-Host ""
    $promptMsg = "$([char]0x00BF)Las pruebas en QA fueron exitosas y deseas pasar a Produccion? (Y/N)"
    $confirmation = Read-Host $promptMsg
    if ($confirmation -match '^[YySs]$') {
        Write-Host ""
        Write-Host "=== INICIANDO FASE 2: DESPLIEGUE SECUENCIAL A PRODUCCION (AZTECA -> MAYA) ===" -ForegroundColor Magenta

        $prodTargets = @($Environments.AZTECA, $Environments.MAYA)
        foreach ($plant in $prodTargets) {
            Deploy-ToEnvironment -EnvConfig $plant
        }

        Write-Host ""
        Write-Host "[COMPLETADO] PIPELINE DE PRODUCCION FINALIZADO CON EXITO EN AZTECA Y MAYA." -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "[CANCELADO] Despliegue a Produccion cancelado por el usuario." -ForegroundColor Yellow
    }
}

# ==============================================================================
# 3. ORQUESTADOR DE COMANDOS (INDIVIDUALES O PIPELINE DE 2 FASES)
# ==============================================================================
$NormalizedPhase = $Phase.ToUpper()

switch ($NormalizedPhase) {
    { $_ -in @('1', 'QA') } {
        Write-Host "=== FASE 1 / DESPLIEGUE EXCLUSIVO: ENTORNO DE PRUEBAS (QA) ===" -ForegroundColor Cyan
        Deploy-ToEnvironment -EnvConfig $Environments.QA
    }
    { $_ -in @('2', 'PROD') } {
        Write-Host "=== FASE 2: PASO A PRODUCCION (AZTECA Y MAYA) ===" -ForegroundColor Magenta
        Start-ProductionPipeline
    }
    'AZTECA' {
        Write-Host "=== DESPLIEGUE INDIVIDUAL: PRODUCCION - AZTECA ===" -ForegroundColor Cyan
        Deploy-ToEnvironment -EnvConfig $Environments.AZTECA
    }
    'MAYA' {
        Write-Host "=== DESPLIEGUE INDIVIDUAL: PRODUCCION - MAYA ===" -ForegroundColor Cyan
        Deploy-ToEnvironment -EnvConfig $Environments.MAYA
    }
    Default {
        Write-Host "=== PIPELINE COMPLETO (FASE 1: QA -> FASE 2: PRODUCCION) ===" -ForegroundColor Cyan
        Deploy-ToEnvironment -EnvConfig $Environments.QA
        Start-ProductionPipeline
    }
}

