$ErrorActionPreference='Stop'
$pidFile=Join-Path $env:LOCALAPPDATA 'AIWorkHub\process.id'
if(-not(Test-Path -LiteralPath $pidFile)){Write-Output 'No recorded instance.';exit}
$workhubProcessId=[int](Get-Content -LiteralPath $pidFile -Raw)
$instance=Get-CimInstance Win32_Process -Filter "ProcessId=$workhubProcessId"
if(-not $instance){Write-Output 'Instance already stopped.';exit}
$expectedJava=Join-Path $PSScriptRoot 'runtime\bin\java.exe'
$expectedJar=Join-Path $PSScriptRoot 'workhub.jar'
if($instance.ExecutablePath -ne $expectedJava -or -not $instance.CommandLine.Contains($expectedJar)){throw 'Process identity differs; refusing to stop another application.'}
Stop-Process -Id $workhubProcessId
Write-Output 'Stopped. Local data has been preserved.'
