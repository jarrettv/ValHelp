# Packs a published ValHelpTracker.exe into an MSIX for the Microsoft Store.
#
#   pwsh scripts/pack_tracker_msix.ps1 -Exe tracker-out/ValHelpTracker.exe -Out tracker-msix/ValHelpTracker.msix `
#     -IdentityName <Package/Identity/Name> -Publisher "CN=..." -PublisherDisplayName <name>
#
# The identity values are in Partner Center under the app's Product identity page.
# The version is the csproj <Version> plus a 4th part of 0 (the Store requires it).
# Needs makeappx.exe from the Windows SDK (on GitHub's windows runners).
param(
    [Parameter(Mandatory)] [string] $Exe,
    [Parameter(Mandatory)] [string] $Out,
    [string] $IdentityName = 'ValHelp.Tracker.Dev',
    [string] $Publisher = 'CN=ValHelp Dev',
    [string] $PublisherDisplayName = 'ValHelp'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$pkg = Join-Path $root 'character/Vh.Tracker/Package'

$csproj = [xml](Get-Content (Join-Path $root 'character/Vh.Tracker/Vh.Tracker.csproj'))
$version = $csproj.Project.PropertyGroup.Version | Where-Object { $_ } | Select-Object -First 1
$version = "$version.0"

$stage = Join-Path ([IO.Path]::GetTempPath()) "vh-msix-$([guid]::NewGuid().ToString('n'))"
New-Item -ItemType Directory $stage | Out-Null
try {
    Copy-Item -Recurse (Join-Path $pkg 'Assets') $stage
    Copy-Item $Exe (Join-Path $stage 'ValHelpTracker.exe')
    $esc = { param($s) [Security.SecurityElement]::Escape($s) }
    (Get-Content -Raw (Join-Path $pkg 'AppxManifest.xml')).
        Replace('$IdentityName$', (& $esc $IdentityName)).
        Replace('$Publisher$', (& $esc $Publisher)).
        Replace('$PublisherDisplayName$', (& $esc $PublisherDisplayName)).
        Replace('$Version$', $version) |
        Set-Content -Encoding utf8 (Join-Path $stage 'AppxManifest.xml')

    $makeappx = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\makeappx.exe" |
        Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $makeappx) { throw 'makeappx.exe not found (install the Windows SDK)' }

    New-Item -ItemType Directory -Force (Split-Path $Out -Parent) | Out-Null
    & $makeappx.FullName pack /o /d $stage /p $Out
    if ($LASTEXITCODE -ne 0) { throw "makeappx failed ($LASTEXITCODE)" }
    Write-Host "Packed $Out (version $version, identity $IdentityName)"
}
finally {
    Remove-Item -Recurse -Force $stage
}
