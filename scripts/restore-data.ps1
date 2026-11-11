param([Parameter(Mandatory=$true)][string]$BackupDirectory,[Parameter(Mandatory=$true)][string]$NewDataDirectory)
$ErrorActionPreference='Stop'
$backup=(Resolve-Path -LiteralPath $BackupDirectory).Path
$target=[IO.Path]::GetFullPath($NewDataDirectory)
if(Test-Path -LiteralPath $target){throw 'Restore requires a new directory; existing data will never be overwritten.'}
$manifest=Get-Content -LiteralPath (Join-Path $backup 'manifest.json') -Raw|ConvertFrom-Json
if($manifest.format -ne 1 -or $manifest.database -ne 'workhub.db'){throw 'Unsupported backup format.'}
$db=Join-Path $backup 'workhub.db'
# Hold the source without write sharing across verification and copying.
$stream=[IO.File]::Open($db,'Open','Read','Read')
try{
 $sha=[Security.Cryptography.SHA256]::Create()
 try{$hash=([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','')}finally{$sha.Dispose()}
 if($hash -ne $manifest.sha256){throw 'Backup checksum mismatch.'}
 $stream.Position=0;$header=New-Object byte[] 16
 if($stream.Read($header,0,16) -ne 16 -or [Text.Encoding]::ASCII.GetString($header) -ne "SQLite format 3`0"){throw 'Invalid database header.'}
 New-Item -ItemType Directory -Path $target|Out-Null
 $output=[IO.File]::Create((Join-Path $target 'workhub.db'))
 try{$stream.Position=0;$stream.CopyTo($output)}finally{$output.Dispose()}
}finally{$stream.Dispose()}
Write-Output "Restored into $target. Verify with the same application version before switching. Original data and secrets were not changed."
