param([ValidateSet('start', 'stop')][string]$Action = 'start')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$dataPath = Join-Path $projectRoot '.local/postgres'
$binPath = 'C:/Program Files/PostgreSQL/18/bin'
if (!(Test-Path -LiteralPath (Join-Path $binPath 'pg_ctl.exe'))) { throw 'PostgreSQL 18 binaries are required. Update binPath for your installation.' }
if ($Action -eq 'stop') {
  & (Join-Path $binPath 'pg_ctl.exe') -D $dataPath -m fast stop
  exit $LASTEXITCODE
}
New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot '.local') | Out-Null
$envPath = Join-Path $projectRoot '.env'
if (!(Test-Path -LiteralPath $envPath)) {
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $bytes = New-Object byte[] 48
  $rng.GetBytes($bytes)
  $dbPassword = [Convert]::ToBase64String($bytes).Replace('+','a').Replace('/','b')
  $rng.GetBytes($bytes)
  $authSecret = [Convert]::ToBase64String($bytes)
  $rng.Dispose()
  @"
NODE_ENV=development
DATABASE_URL=postgresql://reward:$dbPassword@127.0.0.1:55432/reward_platform
BETTER_AUTH_SECRET=$authSecret
APP_ORIGIN=http://localhost:3000
API_ORIGIN=http://127.0.0.1:4000
API_PORT=4000
MAIL_MODE=file
MAIL_OUTBOX=.local/mail
"@ | Set-Content -LiteralPath $envPath -Encoding utf8
}
if (!(Test-Path -LiteralPath (Join-Path $dataPath 'PG_VERSION'))) {
  $urlLine = Get-Content -LiteralPath $envPath | Where-Object { $_ -like 'DATABASE_URL=*' } | Select-Object -First 1
  $dbUri = [Uri]($urlLine.Substring(13))
  $dbPassword = $dbUri.UserInfo.Split(':',2)[1]
  $passwordPath = Join-Path $projectRoot '.local/init-password'
  try {
    [System.IO.File]::WriteAllText($passwordPath, $dbPassword)
    & (Join-Path $binPath 'initdb.exe') -D $dataPath -U reward --auth=scram-sha-256 --pwfile=$passwordPath --encoding=UTF8 --locale=C
    if ($LASTEXITCODE -ne 0) { throw 'Database initialization failed.' }
  } finally { Remove-Item -LiteralPath $passwordPath -Force -ErrorAction SilentlyContinue }
}
& (Join-Path $binPath 'pg_ctl.exe') -D $dataPath status *> $null
if ($LASTEXITCODE -ne 0) {
  & (Join-Path $binPath 'pg_ctl.exe') -D $dataPath -l (Join-Path $projectRoot '.local/postgres.log') -o '-h 127.0.0.1 -p 55432' -w start
  if ($LASTEXITCODE -ne 0) { throw 'Database did not start.' }
}
$urlLine = Get-Content -LiteralPath $envPath | Where-Object { $_ -like 'DATABASE_URL=*' } | Select-Object -First 1
$dbUri = [Uri]($urlLine.Substring(13))
$env:PGPASSWORD = $dbUri.UserInfo.Split(':',2)[1]
try {
  $exists = & (Join-Path $binPath 'psql.exe') -h 127.0.0.1 -p 55432 -U reward -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='reward_platform'"
  if ($exists -ne '1') { & (Join-Path $binPath 'createdb.exe') -h 127.0.0.1 -p 55432 -U reward reward_platform }
} finally { Remove-Item Env:PGPASSWORD }
Write-Output 'Project database is ready on localhost:55432.'
$varsPath = Join-Path $projectRoot '.dev.vars'
if (!(Test-Path -LiteralPath $varsPath)) { Set-Content -LiteralPath $varsPath -Value 'API_ORIGIN=http://127.0.0.1:4000' }
