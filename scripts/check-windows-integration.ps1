<#
.SYNOPSIS
  Verifies the registry state the LitheMark NSIS installer is expected to create.

.DESCRIPTION
  Read-only smoke check for the Windows file-association integration. Run it
  after installing the NSIS bundle (pnpm desktop:bundle:windows):

    pwsh scripts/check-windows-integration.ps1

  It checks that, for .md and .markdown:
    * the extension maps to LitheMark's ProgID ("LitheMark Markdown
      Document"), making LitheMark a candidate in "Open with" / Default Apps
    * the ProgID's open command points at an existing lithemark.exe
    * the "Open with LitheMark" shell verb exists under SystemFileAssociations
      and points at an existing lithemark.exe

  Each check may live in the HKCU or HKLM Classes hive (per-user vs
  per-machine installs); passing in either hive is enough. The script never
  writes to the registry and never touches UserChoice or any default-app
  setting; it only reads.
#>
[CmdletBinding()]
param(
  [string]$BinaryName = "lithemark.exe",
  [string]$FileClass = "LitheMark Markdown Document"
)

$extensions = @(".md", ".markdown")
$verb = "LitheMark.Open"
$roots = @("HKCU:", "HKLM:")
$failures = @()

function Get-RegValue {
  param(
    [string]$Path,
    [string]$Name = "(default)"
  )
  $item = Get-Item -Path $Path -ErrorAction SilentlyContinue
  if (-not $item) { return $null }
  if ($Name -eq "(default)") { return $item.GetValue("") }
  return $item.GetValue($Name)
}

function Test-Executable {
  param([string]$Label, [string]$Command)
  # Tauri's own ProgID command quotes only %1 (e.g. `D:\...\lithemark.exe "%1"`),
  # while the hooks.nsh verb quotes both halves. Accept either form.
  $exe = $null
  if ($command -match '"([^"]+\.exe)"') {
    $exe = $Matches[1]
  } elseif ($command -match '([A-Za-z]:\\[^"]*\.exe)') {
    $exe = $Matches[1]
  }
  if ($null -eq $exe) {
    $script:failures += "$Label has no executable: $Command"
    return $false
  }
  if (Test-Path -LiteralPath $exe) {
    Write-Host "OK   $Label exists: $exe"
    return $true
  }
  $script:failures += "$Label points at a missing executable: $exe"
  return $false
}

Write-Host "Checking LitheMark Windows integration (read-only)..."

# 1. Extension -> ProgID mapping (the fileAssociations entry Tauri writes).
foreach ($ext in $extensions) {
  $found = $false
  foreach ($root in $roots) {
    $class = Get-RegValue "$root\Software\Classes\$ext"
    if ($null -eq $class) { continue }
    if ($class -ne $FileClass) {
      $failures += "$root\Software\Classes\$ext maps to '$class', expected '$FileClass'"
      continue
    }
    $found = $true
    Write-Host "OK   Association: $ext -> $FileClass ($root)"

    $command = Get-RegValue "$root\Software\Classes\$FileClass\shell\open\command"
    if ($null -eq $command) {
      $failures += "Missing open command: $root\Software\Classes\$FileClass\shell\open\command"
      continue
    }
    Write-Host "OK   Open command: $root\Software\Classes\$FileClass\shell\open\command"
    Write-Host "     command = $command"
    [void](Test-Executable "Open command executable" $command)
  }
  if (-not $found) {
    $failures += "No hive maps $ext to the '$FileClass' ProgID (fileAssociations not registered)"
  }
}

# 2. The dedicated "Open with LitheMark" shell verb (hooks.nsh).
foreach ($ext in $extensions) {
  $found = $false
  foreach ($root in $roots) {
    $commandKey = "$root\Software\Classes\SystemFileAssociations\$ext\shell\$verb\command"
    $command = Get-RegValue $commandKey
    if ($null -eq $command) { continue }
    $found = $true
    $label = Get-RegValue "$root\Software\Classes\SystemFileAssociations\$ext\shell\$verb" "MUIVerb"
    Write-Host "OK   Shell verb: SystemFileAssociations\$ext\shell\$verb (MUIVerb='$label')"
    Write-Host "     command = $command"
    [void](Test-Executable "Shell verb executable" $command)
  }
  if (-not $found) {
    $failures += "Missing shell verb SystemFileAssociations\$ext\shell\$verb in both hives"
  }
}

if ($failures.Count -gt 0) {
  Write-Error (
    "Windows integration check FAILED:" + [Environment]::NewLine +
    ($failures -join [Environment]::NewLine)
  )
  exit 1
}

Write-Host "Windows integration check passed."
