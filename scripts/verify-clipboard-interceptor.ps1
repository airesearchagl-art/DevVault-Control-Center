# Harness self-check for the clipboard interceptor (SF-WF-01).
#
# Before any smoke presses a Copy control, this proves on a throw-away data folder that the
# interceptor in lib\dvcc-smoke.ps1 (a) sees exactly one clipboard write-text call per copy, (b)
# captures the text DVCC saved, (c) keeps that call away from the Windows clipboard, (d) passes every
# other Tauri command through, and (e) can be removed again. Any failure exits 1: stop, do not run a
# smoke that copies.

param(
  [string] $Exe = "",
  [int] $Port = 9336,
  [int] $ReadySeconds = 40
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
if ($Exe -eq "") { $Exe = Join-Path $repo "src-tauri\target\release\devvault-control-center.exe" }
if (-not (Test-Path $Exe)) { throw "release build not found: $Exe" }

$runId = [guid]::NewGuid().ToString("N").Substring(0, 8)
$root = Join-Path $env:TEMP "dvcc-clip-$runId"
$dataDir = Join-Path $root "data"
$desktopName = "dvcc-clip-$runId"

. (Join-Path $PSScriptRoot "lib\dvcc-smoke.ps1")

New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
Copy-Item -Path (Join-Path $repo "fixtures\v1\valid\*") -Destination $dataDir -Recurse -Force
$clipboardBefore = Get-ClipboardFingerprint
Write-Output ("clipboard at start: " + $clipboardBefore)
[DvccDesktop]::Create($desktopName)

try {
  $appPid = Start-App "self-check"
  Check "A: the interceptor is installed at the IPC transport" (Test-ClipboardInterceptor) $script:interceptorTarget

  $review = "rv-20260102-beta01"   # REVIEWING, no request saved yet
  Invoke-Cdp "document.querySelector('[data-testid=queue-item][data-review-id=$review]').click(); true" | Out-Null
  Wait-For "document.querySelector('[data-testid=detail]')?.dataset.reviewId === '$review'" 10 | Out-Null
  Wait-For "(() => { const b = document.querySelector('[data-testid=action-copy-prompt]'); return !!b && !b.disabled; })()" 10 | Out-Null

  $forwardedBefore = [int](Invoke-Cdp 'window.__dvccClipboard.forwarded')
  $sequenceBefore = [DvccDesktop]::GetClipboardSequenceNumber()
  $captured = Invoke-InterceptedCopy "action-copy-prompt" "B: one DVCC copy action"
  Start-Sleep -Milliseconds 800
  $sequenceAfter = [DvccDesktop]::GetClipboardSequenceNumber()
  $writes = [int](Invoke-Cdp 'window.__dvccClipboard.writes.length')
  $forwardedAfter = [int](Invoke-Cdp 'window.__dvccClipboard.forwarded')
  $requestPath = Join-Path $dataDir "reviews\$review\request-r1.md"
  $request = if (Test-Path $requestPath) { Get-Content -LiteralPath $requestPath -Raw -Encoding UTF8 } else { $null }
  $session = Get-Content -LiteralPath (Join-Path $dataDir "reviews\$review\session.json") -Raw -Encoding UTF8 | ConvertFrom-Json

  Check "C: the interceptor saw exactly one clipboard write-text call" ($writes -eq 1) "writes=$writes"
  Check "C: the captured payload is the saved request" (Test-SameText $captured $request) ("captured length=" + $(if ($captured) { $captured.Length } else { "none" }) + " file length=" + $(if ($request) { $request.Length } else { "none" }))
  Check "C: the Windows clipboard was not written by that call" ($sequenceAfter -eq $sequenceBefore) "sequence $sequenceBefore -> $sequenceAfter"
  Check "C: non-clipboard Tauri commands still work (storage writes went through)" ($forwardedAfter -gt $forwardedBefore -and $null -ne $request -and $null -ne $session.rounds[0].requestSavedAt) "forwarded $forwardedBefore -> $forwardedAfter"
  $toast = Invoke-Cdp 'Array.from(document.querySelectorAll("[data-testid=toast]")).map((t) => t.dataset.kind).join(",")'
  Check "C: the app took the intercepted write as a success" ($toast -match "info" -and $toast -notmatch "error") "toasts=$toast"

  Check "D: the interceptor is removed and the original fetch restored" (Remove-ClipboardInterceptor) "removed"
  Check "D: nothing of it remains in the page" (-not [bool](Invoke-Cdp '!!window.__dvccClipboard')) "window.__dvccClipboard absent"
  Stop-App $appPid
}
finally {
  Stop-Started
}

Test-OperatorClipboard $clipboardBefore
Write-Summary
if ($script:failures -gt 0 -or $script:skipped -gt 0) { exit 1 }
