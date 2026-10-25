/** These programs run only after an explicitly requested installation. */
export interface HelperPaths {
  directory: string; ready: string; armed: string; cancelled: string; expired: string
  report: string; success: string; failure: string; token: string; deadline: number; parentPid: number
}
export interface MacHelperPaths extends HelperPaths {
  current: string; staged: string; backup: string; failed: string
  currentIdentity: string; stagedIdentity: string
}
const sh = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`
const ps = (value: string): string => `'${value.replace(/'/g, "''")}'`

export function macInstallerScript(value: MacHelperPaths): string {
  return `#!/bin/sh
set -u
umask 077
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH
CURRENT=${sh(value.current)}
STAGED=${sh(value.staged)}
BACKUP=${sh(value.backup)}
FAILED=${sh(value.failed)}
READY=${sh(value.ready)}
ARMED=${sh(value.armed)}
CANCELLED=${sh(value.cancelled)}
EXPIRED=${sh(value.expired)}
REPORT=${sh(value.report)}
SUCCESS=${sh(value.success)}
FAILURE=${sh(value.failure)}
TOKEN=${sh(value.token)}
CURRENT_ID=${sh(value.currentIdentity)}
STAGED_ID=${sh(value.stagedIdentity)}
PARENT_PID=${value.parentPid}
DEADLINE=${Math.floor(value.deadline / 1000)}
PARENT_BIRTH=$(/bin/ps -p "$PARENT_PID" -o lstart=) || exit 1
identity() { /usr/bin/stat -f '%d:%i' "$1" 2>/dev/null; }
report() { /bin/cp "$1" "$REPORT.tmp-$TOKEN" && /bin/mv -f "$REPORT.tmp-$TOKEN" "$REPORT"; }
parent_alive() { [ "$(/bin/ps -p "$PARENT_PID" -o lstart= 2>/dev/null)" = "$PARENT_BIRTH" ]; }
authorized() { [ ! -e "$CANCELLED" ] && [ -f "$ARMED" ] && [ ! -L "$ARMED" ] && [ "$(/bin/cat "$ARMED")" = "$TOKEN" ]; }
fail() { report "$FAILURE"; reopen_old; exit 1; }
reopen_old() {
  if [ -d "$CURRENT" ] && [ "$(identity "$CURRENT")" = "$CURRENT_ID" ]; then /usr/bin/open "$CURRENT"; return; fi
  if [ -d "$BACKUP" ] && [ "$(identity "$BACKUP")" = "$CURRENT_ID" ]; then /usr/bin/open "$BACKUP"; fi
}
rollback() {
  # Never overwrite a path another installer/user has created in the meantime.
  if [ ! -e "$CURRENT" ] && [ ! -L "$CURRENT" ] && [ "$(identity "$BACKUP")" = "$CURRENT_ID" ]; then
    /bin/mv -n "$BACKUP" "$CURRENT" || true
  fi
  report "$FAILURE"
  reopen_old
  exit 1
}
/usr/bin/printf '%s' "$TOKEN" > "$READY" || exit 1
while :; do
  [ ! -e "$CANCELLED" ] || exit 0
  if [ "$(/bin/date +%s)" -ge "$DEADLINE" ]; then
    /usr/bin/touch "$EXPIRED"
    exit 0
  fi
  if ! parent_alive; then
    authorized || exit 0
    break
  fi
  /bin/sleep 0.2
done
authorized || exit 0
[ ! -L "$CURRENT" ] && [ ! -L "$STAGED" ] || fail
[ "$(identity "$CURRENT")" = "$CURRENT_ID" ] && [ "$(identity "$STAGED")" = "$STAGED_ID" ] || fail
[ ! -e "$BACKUP" ] && [ ! -L "$BACKUP" ] && [ ! -e "$FAILED" ] && [ ! -L "$FAILED" ] || fail
# Both renames stay on the original application's filesystem. Keep the old app.
/bin/mv -n "$CURRENT" "$BACKUP" || fail
[ "$(identity "$BACKUP")" = "$CURRENT_ID" ] && [ ! -e "$CURRENT" ] && [ ! -L "$CURRENT" ] || rollback
/bin/mv -n "$STAGED" "$CURRENT" || rollback
[ ! -L "$CURRENT" ] && [ "$(identity "$CURRENT")" = "$STAGED_ID" ] || rollback
report "$SUCCESS"
if /usr/bin/open "$CURRENT"; then exit 0; fi
# Gatekeeper/Launch Services errors are respected, never bypassed.
if [ "$(identity "$CURRENT")" = "$STAGED_ID" ] && [ ! -e "$FAILED" ]; then
  /bin/mv -n "$CURRENT" "$FAILED" || true
fi
rollback
`
}

export function windowsInstallerScript(value: HelperPaths & { installer: string; currentExecutable: string; sha256: string }): string {
  return `$ErrorActionPreference = 'Stop'
$ready = ${ps(value.ready)}
$armed = ${ps(value.armed)}
$cancelled = ${ps(value.cancelled)}
$expired = ${ps(value.expired)}
$token = ${ps(value.token)}
$report = ${ps(value.report)}
$success = ${ps(value.success)}
$failure = ${ps(value.failure)}
$installer = ${ps(value.installer)}
$currentExecutable = ${ps(value.currentExecutable)}
$sha256 = ${ps(value.sha256)}
$launchAttempted = $false
$installerCompleted = $false
$deadline = [DateTimeOffset]::FromUnixTimeMilliseconds(${value.deadline})
$owner = Get-Process -Id ${value.parentPid} -ErrorAction Stop
$birth = $owner.StartTime.ToUniversalTime().Ticks
function Write-Report([string]$template) {
  $temporary = $report + '.tmp-' + $token
  [IO.File]::Copy($template, $temporary, $true)
  Move-Item -LiteralPath $temporary -Destination $report -Force
}
function Is-Authorized {
  return !(Test-Path -LiteralPath $cancelled) -and (Test-Path -LiteralPath $armed -PathType Leaf) -and ([IO.File]::ReadAllText($armed) -ceq $token)
}
try {
  [IO.File]::WriteAllText($ready, $token)
  while ($true) {
    if (Test-Path -LiteralPath $cancelled) { exit 0 }
    if ([DateTimeOffset]::UtcNow -ge $deadline) { [IO.File]::WriteAllText($expired, 'expired'); exit 0 }
    $running = Get-Process -Id ${value.parentPid} -ErrorAction SilentlyContinue
    if (!$running -or $running.StartTime.ToUniversalTime().Ticks -ne $birth) { break }
    Start-Sleep -Milliseconds 200
  }
  if (!(Is-Authorized)) { exit 0 }
  $item = Get-Item -LiteralPath $installer -Force
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Installer path changed' }
  if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant() -cne $sha256) { throw 'Installer checksum changed' }
  # The ordinary NSIS UI remains responsible for permissions, directory choice,
  # cancellation, and finishing the Windows installation. No silent switches.
  $launchAttempted = $true
  $setup = Start-Process -FilePath $installer -PassThru -Wait
  $installerCompleted = $true
  if ($setup.ExitCode -ne 0) { throw 'Installer did not complete' }
  Write-Report $success
  if (Test-Path -LiteralPath $currentExecutable -PathType Leaf) { Start-Process -FilePath $currentExecutable }
} catch {
  try { Write-Report $failure } catch {}
  if (Test-Path -LiteralPath $currentExecutable -PathType Leaf) { Start-Process -FilePath $currentExecutable }
  exit 1
} finally {
  # Never remove a package while an installer may still be using it.
  if (!$launchAttempted -or $installerCompleted) {
    try { Remove-Item -LiteralPath $installer -Force -ErrorAction Stop } catch {}
  }
}
`
}
