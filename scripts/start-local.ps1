$ErrorActionPreference='Stop'
$runtimeJava=Join-Path $PSScriptRoot 'runtime\bin\java.exe'
if(-not(Test-Path -LiteralPath $runtimeJava)){throw 'Bundled Java runtime is missing.'}
$dataRoot=Join-Path $env:LOCALAPPDATA 'AIWorkHub'
New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
$portalConfig=Join-Path $dataRoot 'portal.properties'
if(-not(Test-Path -LiteralPath $portalConfig)){Set-Content -LiteralPath $portalConfig -Value "# Configure approved portal URL and shared server-side relay key here.`n# procurement.portal-url=https://your-portal.example`n# procurement.relay-key=replace-with-at-least-32-random-characters" -Encoding ascii}
$port=18081
try{$existing=Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 2;throw 'Port already has a service. Close the prior instance before starting this package.'}catch{if($_.Exception.Message -like 'Port already*'){throw}}
$jar=Join-Path $PSScriptRoot 'workhub.jar';$dbPath=(Join-Path $dataRoot 'workhub.db').Replace('\','/')
$arguments=@('-jar',('"'+$jar+'"'),"--server.port=$port",'--server.address=127.0.0.1',('"--spring.datasource.url=jdbc:sqlite:'+ $dbPath+'"'),('"--spring.config.additional-location=optional:file:'+ $portalConfig.Replace('\','/')+'"'))
$process=Start-Process -FilePath $runtimeJava -ArgumentList $arguments -WorkingDirectory $dataRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dataRoot 'startup.log') -RedirectStandardError (Join-Path $dataRoot 'error.log')
Set-Content -LiteralPath (Join-Path $dataRoot 'process.id') -Value $process.Id -Encoding ascii
for($attempt=0;$attempt -lt 60;$attempt++){if($process.HasExited){throw 'Service exited. Check startup.log and error.log in the data directory.'};try{$health=Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 1;if($health.status -eq 'ok'){Start-Process "http://127.0.0.1:$port/";Write-Output "Started. Data: $dataRoot";exit}}catch{};Start-Sleep -Milliseconds 1000}
throw 'Startup timed out. Check local logs.'
