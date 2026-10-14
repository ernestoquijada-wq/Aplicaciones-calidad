<#
.SYNOPSIS
    Pipeline de Despliegue Multi-Entorno para ESD Control (Google Apps Script + Clasp).

.DESCRIPTION
    Automatiza el despliegue hacia 1 entorno de Pruebas (QA) y 2 entornos de Produccion (Plantas Azteca y Maya).
    - Modifica dinamicamente .clasp.json con el scriptId correspondiente.
    - Sincroniza dinamicamente Config.js con el Spreadsheet ID de la planta destino.
    - Ejecuta clasp push -f validando errores en cada etapa.

.PARAMETER Phase
    Define la fase del pipeline a ejecutar:
    - 'All' (Por defecto): Ejecuta Fase 1 (QA) y luego pregunta interactivamente si deseas pasar a Fase 2 (Produccion).
    - '1' o 'QA': Ejecuta EXCLUSIVAMENTE la Fase 1 (Despliegue a Entorno de Pruebas).
    - '2' o 'PROD': Ejecuta la Fase 2 (Pregunta confirmacion QA y despliega en bucle a AZTECA y MAYA).

.EXAMPLE
    .\deploy.ps1
    Ejecuta el flujo completo (Fase 1 -> Confirmacion Y/N -> Fase 2).

.EXAMPLE
    .\deploy.ps1 -Phase 1
    Ejecuta unicamente la Fase 1 (Despliegue exclusivo al entorno de PRUEBAS).

.EXAMPLE
    .\deploy.ps1 -Phase 2
    Ejecuta la Fase 2 (Pregunta confirmacion y despliega en bucle a PRODUCCION: AZTECA y MAYA).
#>

param (
    [Parameter(Position = 0)]
    [ValidateSet('All', '1', '2', 'QA', 'PROD', 'AZTECA', 'MAYA', IgnoreCase = $true)]
    [string]$Phase = 'All'
)

$ErrorActionPreference = 'Stop'

# ==============================================================================
# 1. DEFINICION DE ENTORNOS (QA Y PLANTAS DE PRODUCCION)
# ==============================================================================
$Environments = @{
    QA = [PSCustomObject]@{
        Key              = 'QA'
        Name             = 'ENTORNO DE PRUEBAS (QA)'
        ScriptId         = '1GwS99kQDAiUxSTfECzSSQEXNMF67mpbv6BLurPFZ2bZ0V0j5l0dO2EWk'
        SpreadsheetId    = '1y_6x3bp-CR-kSieVv6TPSIOjD4-S9jvhIZOxDXlV_yk'
        HeadDeploymentId = 'AKfycbyg9OSHFG9RxzG0ZoQoO-ZsLZtfveBb1mmXjPtdsN0'
    }
    AZTECA = [PSCustomObject]@{
        Key              = 'AZTECA'
        Name             = "PRODUCCI$([char]0x00D3)N - AZTECA"
        ScriptId         = '13OCo9k9qF-oI4Z-J2nif3Lyp6E-iWEPVDB5v2MyD6Nu2lGNYokTJKN4W'
        SpreadsheetId    = '1CiZnIPUbtw3eCpC2-Hsre6tKh647BSxOkZEk-8r85WA'
        HeadDeploymentId = 'AKfycbyk8lyqN8C6JH687pvCk-1O7j7NlXIpr94GfCo9Y48'
    }
    MAYA = [PSCustomObject]@{
        Key              = 'MAYA'
        Name             = "PRODUCCI$([char]0x00D3)N - MAYA"
        ScriptId         = '1PSzubxj_GWEFF1_oEvn1PFzXODtZZmm8gPk8yLM4mrvJstjbPwQaQk8h'
        SpreadsheetId    = '1vpqnf0Psk2AJrU_LYe6Tag3z-k98wcIlwaa4DlAmEqI'
        HeadDeploymentId = 'AKfycbzy3MDs5P_HoXDBzhVaGYpKfMZPRtGYoH1d3umy54I'
    }
}

# ==============================================================================
# 2. RESOLUCION DE RUTAS DEL PROYECTO
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

$ClaspJsonPath = Join-Path $ProjectDir '.clasp.json'
$ConfigJsPath  = Join-Path $ProjectDir 'Config.js'
$Utf8NoBom     = New-Object System.Text.UTF8Encoding($false)

# ==============================================================================
# 3. FUNCIONES AUXILIARES DE CONFIGURACION Y DESPLIEGUE
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

function Update-AppConfigJs {
    param (
        [string]$EnvName,
        [string]$SpreadsheetId
    )

    if (-not (Test-Path $ConfigJsPath)) {
        Write-Host "[ADVERTENCIA] No se encontro Config.js en $ConfigJsPath" -ForegroundColor Yellow
        return
    }

    $content = [System.IO.File]::ReadAllText($ConfigJsPath, $Utf8NoBom)

    # Reemplazar marcadores dinamicos @DEPLOY_ENV_NAME y @DEPLOY_SS_ID sin alterar el resto del archivo
    $content = $content -replace "const DEFAULT_ENV_NAME = '.*?'; // @DEPLOY_ENV_NAME", "const DEFAULT_ENV_NAME = '$EnvName'; // @DEPLOY_ENV_NAME"
    $content = $content -replace "const DEFAULT_ENV_SS_ID = '.*?'; // @DEPLOY_SS_ID", "const DEFAULT_ENV_SS_ID = '$SpreadsheetId'; // @DEPLOY_SS_ID"

    [System.IO.File]::WriteAllText($ConfigJsPath, $content, $Utf8NoBom)
}

function Deploy-ToEnvironment {
    param ([PSCustomObject]$EnvConfig)

    Write-Host ""
    Write-Host "======================================================================" -ForegroundColor Cyan
    Write-Host " [DEPLOY] DESPLEGANDO A: $($EnvConfig.Name)" -ForegroundColor Cyan
    Write-Host "======================================================================" -ForegroundColor Cyan
    Write-Host " * Script ID      : $($EnvConfig.ScriptId)" -ForegroundColor Gray
    Write-Host " * Spreadsheet ID : $($EnvConfig.SpreadsheetId)" -ForegroundColor Gray
    Write-Host " * HEAD Deploy ID : $($EnvConfig.HeadDeploymentId)" -ForegroundColor Gray
    Write-Host "----------------------------------------------------------------------" -ForegroundColor DarkGray

    # 1. Actualizar .clasp.json dinamicamente
    Write-Host " [1/3] Actualizando .clasp.json..." -ForegroundColor Yellow
    Update-ClaspConfig -ScriptId $EnvConfig.ScriptId

    # 2. Sincronizar Spreadsheet ID por defecto en Config.js
    Write-Host " [2/3] Configurando Spreadsheet ID en Config.js..." -ForegroundColor Yellow
    Update-AppConfigJs -EnvName $EnvConfig.Name -SpreadsheetId $EnvConfig.SpreadsheetId

    # 3. Ejecutar clasp push
    Write-Host " [3/3] Ejecutando 'npx clasp push -f'..." -ForegroundColor Yellow
    Push-Location $ProjectDir
    try {
        & npx.cmd clasp push -f
        if ($LASTEXITCODE -ne 0) {
            throw "El comando 'clasp push' fallo con codigo de salida $LASTEXITCODE en $($EnvConfig.Name)."
        }
    } finally {
        Pop-Location
    }

    $headUrl = "https://script.google.com/macros/s/$($EnvConfig.HeadDeploymentId)/exec"
    Write-Host ""
    Write-Host " [OK] DESPLIEGUE EXITOSO EN $($EnvConfig.Name)" -ForegroundColor Green
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
        Write-Host "[COMPLETADO] PIPELINE DE PRODUCCION FINALIZADO CON EXITO EN TODAS LAS PLANTAS." -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "[CANCELADO] Despliegue a Produccion cancelado por el usuario. El codigo permanece unicamente en QA." -ForegroundColor Yellow
    }
}

# ==============================================================================
# 4. ORQUESTADOR DE FASES DEL PIPELINE
# ==============================================================================
$NormalizedPhase = $Phase.ToUpper()

switch ($NormalizedPhase) {
    { $_ -in @('1', 'QA') } {
        Write-Host "=== EJECUTANDO FASE 1 EXCLUSIVA: ENTORNO DE PRUEBAS (QA) ===" -ForegroundColor Cyan
        Deploy-ToEnvironment -EnvConfig $Environments.QA
        Write-Host ""
        Write-Host "[INFO] Cuando termines de validar en QA, ejecuta: .\deploy.ps1 -Phase 2" -ForegroundColor Yellow
    }
    { $_ -in @('2', 'PROD') } {
        Write-Host "=== PREPARANDO FASE 2: PASO A PRODUCCION (AZTECA Y MAYA) ===" -ForegroundColor Magenta
        Start-ProductionPipeline
    }
    'AZTECA' {
        Deploy-ToEnvironment -EnvConfig $Environments.AZTECA
    }
    'MAYA' {
        Deploy-ToEnvironment -EnvConfig $Environments.MAYA
    }
    Default {
        Write-Host "=== INICIANDO PIPELINE COMPLETO (FASE 1: QA -> FASE 2: PRODUCCION) ===" -ForegroundColor Cyan
        Deploy-ToEnvironment -EnvConfig $Environments.QA
        Start-ProductionPipeline
    }
}

