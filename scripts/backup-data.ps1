param([Parameter(Mandatory=$true)][string]$DataDirectory,[Parameter(Mandatory=$true)][string]$BackupDirectory)
$ErrorActionPreference='Stop'
$source=(Resolve-Path -LiteralPath $DataDirectory).Path
$destination=[IO.Path]::GetFullPath($BackupDirectory)
if($destination.StartsWith($source.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Backup must be outside the data directory.'}
if(Test-Path -LiteralPath $destination){throw 'Choose a new backup directory.'}
# Cold backup only. Check known WorkHub processes as well as SQLite sidecars.
$running=Get-CimInstance Win32_Process | Where-Object {$_.Name -match '^java(w)?\.exe$' -and $_.CommandLine -match '(workhub|com\.aiworkhub)'}
if($running){throw 'Stop all WorkHub services before cold backup.'}
foreach($suffix in @('-wal','-shm','-journal')){if(Test-Path -LiteralPath (Join-Path $source ('workhub.db'+$suffix))){throw 'SQLite sidecar exists. Perform a clean database shutdown before backup.'}}
$db=Join-Path $source 'workhub.db'
$stream=[IO.File]::Open($db,'Open','Read','None')
try {
 $header=New-Object byte[] 16
 if($stream.Read($header,0,16) -ne 16 -or [Text.Encoding]::ASCII.GetString($header) -ne "SQLite format 3`0"){throw 'Not a SQLite database.'}
 New-Item -ItemType Directory -Path $destination|Out-Null
 $target=[IO.File]::Create((Join-Path $destination 'workhub.db'))
 try{$stream.Position=0;$stream.CopyTo($target)}finally{$target.Dispose()}
}finally{$stream.Dispose()}
$hash=(Get-FileHash -LiteralPath (Join-Path $destination 'workhub.db') -Algorithm SHA256).Hash
@{format=1;createdAt=[DateTimeOffset]::UtcNow.ToString('o');database='workhub.db';sha256=$hash;note='Cold database backup. Portal secrets are excluded; preserve configuration separately.'}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $destination 'manifest.json') -Encoding UTF8
Write-Output "Database backup created: $destination"
