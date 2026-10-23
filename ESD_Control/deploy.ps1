<#
.SYNOPSIS
    Script de Despliegue Automatizado Multi-Entorno para Google Apps Script (Clasp).
.DESCRIPTION
    - Fase 1: Despliega exclusivamente al ENTORNO DE PRUEBAS (QA) modificando .clasp.json e inyectando ConfigEnv.js.
    - Fase 2: Solicita confirmacion (Y/N) y despliega secuencialmente a PRODUCCION - AZTECA y PRODUCCION - MAYA.
    - Seguridad: Restaura siempre .clasp.json y ConfigEnv.js al entorno de PRUEBAS al finalizar.
.EXAMPLE
    .\deploy.ps1
    Ejecuta Fase 1 (Pruebas) y pregunta confirmacion (Y/N) para Fase 2 (Azteca y Maya).
.EXAMPLE
    .\deploy.ps1 -SoloPruebas
    Ejecuta unicamente la Fase 1 (Pruebas).
.EXAMPLE
    .\deploy.ps1 -SoloProduccion
    Salta directamente a la confirmacion de Fase 2 (Azteca y Maya).
#>

[CmdletBinding()]
param(
    [switch]$SoloPruebas,
    [switch]$SoloProduccion,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
if (-not $ProjectRoot) {
    $ProjectRoot = (Get-Location).Path
}

# ============================================================================
# 1. DEFINICION DE ENTORNOS (MATRIZ DE DESPLIEGUE)
# ============================================================================
$Environments = [ordered]@{
    "QA" = @{
        Key           = "QA"
        Name          = "ENTORNO DE PRUEBAS"
        ScriptId      = "1GwS99kQDAiUxSTfECzSSQEXNMF67mpbv6BLurPFZ2bZ0V0j5l0dO2EWk"
        SpreadsheetId = "1y_6x3bp-CR-kSieVv6TPSIOjD4-S9jvhIZOxDXlV_yk"
        Color         = "Cyan"
    }
    "AZTECA" = @{
        Key           = "AZTECA"
        Name          = "PRODUCCION - AZTECA"
        ScriptId      = "13OCo9k9qF-oI4Z-J2nif3Lyp6E-iWEPVDB5v2MyD6Nu2lGNYokTJKN4W"
        SpreadsheetId = "1CiZnIPUbtw3eCpC2-Hsre6tKh647BSxOkZEk-8r85WA"
        Color         = "Yellow"
    }
    "MAYA" = @{
        Key           = "MAYA"
        Name          = "PRODUCCION - MAYA"
        ScriptId      = "1PSzubxj_GWEFF1_oEvn1PFzXODtZZmm8gPk8yLM4mrvJstjbPwQaQk8h"
        SpreadsheetId = "1vpqnf0Psk2AJrU_LYe6Tag3z-k98wcIlwaa4DlAmEqI"
        Color         = "Magenta"
    }
}

$ClaspJsonPath = Join-Path $ProjectRoot ".clasp.json"
$ConfigEnvPath = Join-Path $ProjectRoot "ConfigEnv.js"

# ============================================================================
# 2. FUNCIONES AUXILIARES DE ARCHIVOS Y CLASP
# ============================================================================

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string]$Content
    )
    $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($FilePath, $Content, $Utf8NoBom)
}

function Resolve-ClaspExecutable {
    $npmGlobalBin = Join-Path $env:APPDATA "npm"
    if ((Test-Path $npmGlobalBin) -and ($env:PATH -notlike "*$npmGlobalBin*")) {
        $env:PATH = "$npmGlobalBin;$env:PATH"
    }

    # Preferir clasp.cmd en Windows para evitar bloqueos de ExecutionPolicy sobre clasp.ps1
    $claspCmd = Get-Command "clasp.cmd" -ErrorAction SilentlyContinue
    if ($claspCmd) { return $claspCmd.Source }

    $claspGeneric = Get-Command "clasp" -ErrorAction SilentlyContinue
    if ($claspGeneric) { return $claspGeneric.Source }

    throw "No se encontro 'clasp' instalado. Ejecuta: npm install -g @google/clasp"
}

function Set-EnvironmentFiles {
    param(
        [Parameter(Mandatory = $true)][hashtable]$EnvData,
        [switch]$Silent
    )

    # 1. Actualizar .clasp.json (preservando estructura limpia sin BOM)
    $claspContent = @"
{
  "scriptId": "$($EnvData.ScriptId)",
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
  "skipSubdirectories": true
}
"@
    Write-Utf8NoBom -FilePath $ClaspJsonPath -Content $claspContent

    # 2. Inyectar ConfigEnv.js con el Spreadsheet ID del entorno
    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $configEnvContent = @"
// ============================================================================
// ARCHIVO GENERADO AUTOMATICAMENTE POR deploy.ps1 - NO EDITAR MANUALMENTE
// ============================================================================
// Entorno activo : $($EnvData.Name)
// Generado el    : $timestamp
// ============================================================================

const ENV_CONFIG = Object.freeze({
  ENV_KEY: '$($EnvData.Key)',
  ENV_NAME: '$($EnvData.Name)',
  SCRIPT_ID: '$($EnvData.ScriptId)',
  SS_ID: '$($EnvData.SpreadsheetId)'
});
"@
    Write-Utf8NoBom -FilePath $ConfigEnvPath -Content $configEnvContent

    if (-not $Silent) {
        Write-Host "  [OK] .clasp.json  -> Script ID      : $($EnvData.ScriptId)" -ForegroundColor Gray
        Write-Host "  [OK] ConfigEnv.js -> Spreadsheet ID : $($EnvData.SpreadsheetId)" -ForegroundColor Gray
    }
}

function Invoke-EnvironmentDeploy {
    param(
        [Parameter(Mandatory = $true)][hashtable]$EnvData,
        [Parameter(Mandatory = $true)][string]$ClaspBin
    )

    Write-Host "`n==================================================================" -ForegroundColor $EnvData.Color
    Write-Host " [DEPLOY] DESPLEGANDO A: $($EnvData.Name)" -ForegroundColor $EnvData.Color
    Write-Host "==================================================================" -ForegroundColor $EnvData.Color

    Set-EnvironmentFiles -EnvData $EnvData

    if ($DryRun) {
        Write-Host "  [DRY-RUN] Simulando comando: clasp push -f" -ForegroundColor DarkGray
        return $true
    }

    Write-Host "  [>] Ejecutando: clasp push -f ..." -ForegroundColor White
    Push-Location $ProjectRoot
    try {
        & $ClaspBin push -f
        if ($LASTEXITCODE -ne 0) {
            throw "clasp push devolvio codigo de error $LASTEXITCODE en $($EnvData.Name)."
        }
        Write-Host "  [EXITO] Codigo desplegado correctamente en $($EnvData.Name)." -ForegroundColor Green
        return $true
    }
    finally {
        Pop-Location
    }
}

# ============================================================================
# 3. FLUJO PRINCIPAL DE DESPLIEGUE (FASE 1 Y FASE 2)
# ============================================================================

try {
    $ClaspExecutable = Resolve-ClaspExecutable
    Write-Host "==================================================================" -ForegroundColor DarkCyan
    Write-Host " PIPELINE DE DESPLIEGUE CLASP - ESD CONTROL" -ForegroundColor White
    Write-Host "==================================================================" -ForegroundColor DarkCyan
    Write-Host " Binario Clasp : $ClaspExecutable" -ForegroundColor DarkGray
    Write-Host " Directorio    : $ProjectRoot" -ForegroundColor DarkGray

    # ------------------------------------------------------------------------
    # FASE 1: DESPLIEGUE EXCLUSIVO A ENTORNO DE PRUEBAS (QA)
    # ------------------------------------------------------------------------
    if (-not $SoloProduccion) {
        Write-Host "`n>>> INICIANDO FASE 1: Entorno de Pruebas (QA)" -ForegroundColor Cyan
        $qaSuccess = Invoke-EnvironmentDeploy -EnvData $Environments["QA"] -ClaspBin $ClaspExecutable
        if (-not $qaSuccess) {
            throw "Fallo en Fase 1 (Entorno de Pruebas). Se aborta el pipeline."
        }
    }

    if ($SoloPruebas) {
        Write-Host "`n[INFO] Flag -SoloPruebas activo. Pipeline finalizado tras Fase 1." -ForegroundColor Cyan
        return
    }

    # ------------------------------------------------------------------------
    # FASE 2: CONFIRMACION Y DESPLIEGUE A PRODUCCION (AZTECA Y MAYA)
    # ------------------------------------------------------------------------
    Write-Host "`n------------------------------------------------------------------" -ForegroundColor Yellow
    Write-Host " [ATENCION] FASE 2: DESPLIEGUE A PRODUCCION (AZTECA + MAYA)" -ForegroundColor Yellow
    Write-Host "------------------------------------------------------------------" -ForegroundColor Yellow
    Write-Host " Se actualizaran los siguientes entornos productivos:" -ForegroundColor White
    Write-Host "   1. PRODUCCION - AZTECA (SS_ID: $($Environments['AZTECA'].SpreadsheetId))" -ForegroundColor Gray
    Write-Host "   2. PRODUCCION - MAYA   (SS_ID: $($Environments['MAYA'].SpreadsheetId))" -ForegroundColor Gray
    Write-Host ""

    $confirmation = Read-Host "Confirmas el despliegue a PRODUCCION (AZTECA y MAYA)? (Y/N)"

    if ($confirmation -match "^[YySs]$") {
        Write-Host "`n>>> INICIANDO FASE 2: Despliegue secuencial a Produccion..." -ForegroundColor Yellow

        # 2.1 Produccion - Azteca
        Invoke-EnvironmentDeploy -EnvData $Environments["AZTECA"] -ClaspBin $ClaspExecutable | Out-Null

        # 2.2 Produccion - Maya
        Invoke-EnvironmentDeploy -EnvData $Environments["MAYA"] -ClaspBin $ClaspExecutable | Out-Null

        Write-Host "`n==================================================================" -ForegroundColor Green
        Write-Host " [COMPLETADO] PRUEBAS, AZTECA Y MAYA ACTUALIZADOS EXITOSAMENTE" -ForegroundColor Green
        Write-Host "==================================================================" -ForegroundColor Green
    }
    else {
        Write-Host "`n[CANCELADO] Fase 2 omitida por el usuario. Produccion NO fue modificada." -ForegroundColor Cyan
    }
}
catch {
    Write-Host "`n[ERROR CRITICO EN DESPLIEGUE]: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    # ------------------------------------------------------------------------
    # SALVAGUARDA DEVOPS: Restaurar siempre archivos locales a PRUEBAS (QA)
    # ------------------------------------------------------------------------
    Write-Host "`n[SEGURIDAD] Restaurando archivos locales (.clasp.json y ConfigEnv.js) a PRUEBAS (QA)..." -ForegroundColor DarkGray
    Set-EnvironmentFiles -EnvData $Environments["QA"] -Silent
    Write-Host "[SEGURIDAD] Entorno local asegurado en PRUEBAS (QA)." -ForegroundColor DarkGray
}

