# =============================================================
#  CastroX · Compilar el APK de Android (sin Android Studio)
#  Uso:
#    .\build-apk.ps1                                  # usa la dirección actual del túnel
#    .\build-apk.ps1 -Server https://mi-dominio.com   # servidor predeterminado fijo
#    .\build-apk.ps1 -VersionName 1.1.0 -VersionCode 2
# =============================================================
param(
  [string]$Server = "",
  [string]$VersionName = "1.0.0",
  [int]$VersionCode = 1
)
$ErrorActionPreference = "Continue"   # las herramientas de Docker escriben avisos en stderr; se valida $LASTEXITCODE
$root = $PSScriptRoot
$android = Join-Path $root "android"

Write-Host ">> Preparando imagen de compilación..." -ForegroundColor Cyan
docker build -q -t castrox-android-builder (Join-Path $android "builder") | Out-Null

# 1. Firma del APK (se crea una sola vez; ¡respáldala! sin ella no podrás actualizar la app instalada)
$propsFile = Join-Path $android "keystore.properties"
if (-not (Test-Path $propsFile)) {
  Write-Host ">> Creando llave de firma..." -ForegroundColor Cyan
  $chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789".ToCharArray()
  $pass = -join (1..24 | ForEach-Object { $chars | Get-Random })
  New-Item -ItemType Directory -Force (Join-Path $android "keystore") | Out-Null
  docker run --rm -v "${android}:/project" castrox-android-builder `
    keytool -genkeypair -keystore /project/keystore/castrox-release.jks -alias castrox -keyalg RSA -keysize 2048 `
    -validity 10000 -storepass $pass -keypass $pass -dname "CN=CastroX, O=CastroX, C=HN" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "No se pudo crear la llave de firma" }
  @"
storeFile=keystore/castrox-release.jks
storePassword=$pass
keyAlias=castrox
keyPassword=$pass
"@ | Set-Content -Encoding ascii $propsFile
}

# 2. Lector QR local para la pantalla de conexión
$qrLib = Join-Path $android "app\src\main\assets\html5-qrcode.min.js"
if (-not (Test-Path $qrLib)) {
  Write-Host ">> Descargando lector de QR..." -ForegroundColor Cyan
  Invoke-WebRequest -UseBasicParsing "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js" -OutFile $qrLib
}

# 3. Servidor predeterminado
if (-not $Server) {
  $logs = docker logs castrox-tunnel 2>&1 | Out-String
  $m = [regex]::Matches($logs, "https://[a-z0-9-]+\.trycloudflare\.com")
  if ($m.Count -gt 0) { $Server = $m[$m.Count - 1].Value }
}
if ($Server) { Write-Host ">> Servidor predeterminado: $Server" -ForegroundColor Cyan }
else { Write-Host ">> Sin servidor predeterminado: la app pedirá la dirección al abrirse" -ForegroundColor Yellow }

# 4. Compilar
Write-Host ">> Compilando APK (la primera vez tarda varios minutos)..." -ForegroundColor Cyan
docker run --rm -v "${android}:/project" -v castrox-gradle-cache:/root/.gradle castrox-android-builder `
  gradle assembleRelease --no-daemon -q "-PcastroxServer=$Server" "-PversionName=$VersionName" "-PversionCode=$VersionCode"
if ($LASTEXITCODE -ne 0) { throw "La compilación falló" }

# 5. Publicar
$apk = Join-Path $android "app\build\outputs\apk\release\app-release.apk"
$dest = Join-Path $root "frontend\downloads"
New-Item -ItemType Directory -Force $dest | Out-Null
Copy-Item $apk (Join-Path $dest "CastroX.apk") -Force
$size = [math]::Round((Get-Item $apk).Length / 1MB, 2)
Write-Host ""
Write-Host ">> APK listo ($size MB): frontend\downloads\CastroX.apk" -ForegroundColor Green
Write-Host "   Descárgalo desde el teléfono en: <tu-servidor>/downloads/CastroX.apk" -ForegroundColor Green
