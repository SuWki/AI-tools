param([Parameter(Mandatory=$true)][string]$RuntimePath)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$runtimeRoot=(Resolve-Path -LiteralPath $RuntimePath).Path
if(-not(Test-Path -LiteralPath (Join-Path $runtimeRoot 'bin\java.exe'))){throw 'RuntimePath must contain bin/java.exe. Supply a runtime you are licensed to redistribute.'}
Push-Location (Join-Path $projectRoot 'frontend')
try { & npm.cmd run build; if($LASTEXITCODE -ne 0){throw 'Frontend build failed'} } finally {Pop-Location}
Push-Location (Join-Path $projectRoot 'backend')
try { & mvn.cmd -o package; if($LASTEXITCODE -ne 0){throw 'Backend build/tests failed'} } finally {Pop-Location}
$output=Join-Path $projectRoot ('release\AIWorkHub-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $output -Force | Out-Null
Copy-Item -LiteralPath $runtimeRoot -Destination (Join-Path $output 'runtime') -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot 'backend\target\workhub-backend-3.2.0.jar') -Destination (Join-Path $output 'workhub.jar')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'start-local.ps1') -Destination $output
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'stop-local.ps1') -Destination $output
Set-Content -LiteralPath (Join-Path $output '启动工作台.cmd') -Value '@powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local.ps1"' -Encoding ascii
Set-Content -LiteralPath (Join-Path $output '停止工作台.cmd') -Value '@powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-local.ps1"' -Encoding ascii
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\PROCUREMENT-README.md') -Destination (Join-Path $output '使用说明.md')
Compress-Archive -LiteralPath $output -DestinationPath ($output+'.zip')
Write-Output ($output+'.zip')
